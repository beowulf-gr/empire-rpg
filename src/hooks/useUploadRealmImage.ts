import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { saveRealm } from '../lib/realmIo'
import type { RealmState } from '../rules/state'
import { queryKeys } from './queryKeys'

/**
 * Which slot the uploaded image fills.
 *  - 'cover'    → realms.cover_image_url (Facebook-style banner at the top)
 *  - 'portrait' → realms.ruler_portrait_url (next to the Ruler stat block)
 */
export type RealmImageKind = 'cover' | 'portrait'

interface UploadVars {
  realmId: string
  ownerId: string
  kind: RealmImageKind
  file: File
}

interface RemoveVars {
  realmId: string
  kind: RealmImageKind
}

/** Hard cap mirrors the bucket's file_size_limit from the migration (5 MB). */
const MAX_BYTES = 5 * 1024 * 1024

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function extFor(file: File): string {
  // Trust the MIME type over the filename — Files dragged in from a browser
  // sometimes have weird extensions.
  switch (file.type) {
    case 'image/jpeg': return 'jpg'
    case 'image/png':  return 'png'
    case 'image/webp': return 'webp'
    case 'image/gif':  return 'gif'
    default:           return 'bin'
  }
}

/**
 * Uploads a file to the `realm-images` bucket and patches the realm's
 * matching URL column. The path convention is:
 *
 *     {ownerId}/{realmId}/{kind}-{timestamp}.{ext}
 *
 * The owner_id prefix is what the bucket's RLS policies (see migration
 * `add_realm_images`) use to authorise writes. Timestamps in the filename
 * sidestep CDN cache issues when the user replaces an image. Previously-
 * uploaded files for the same (realm, kind) are best-effort deleted, but
 * a stray orphan is harmless — the bucket is small and write-rare.
 *
 * The mutation also persists the realm to the DB (via saveRealm) so the
 * url column survives a reload — without it the upload would succeed but
 * the page would forget about it on the next fetch.
 */
export function useUploadRealmImage() {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, UploadVars>({
    mutationFn: async ({ realmId, ownerId, kind, file }) => {
      if (file.size > MAX_BYTES) {
        throw new Error(
          `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 5 MB.`,
        )
      }
      if (!ALLOWED_MIME.has(file.type)) {
        throw new Error(
          `Unsupported file type "${file.type || 'unknown'}". Use JPEG, PNG, WebP, or GIF.`,
        )
      }

      const cached = queryClient.getQueryData<RealmState>(
        queryKeys.realms.detail(realmId),
      )
      if (!cached) throw new Error('Realm not loaded')

      // 1. Best-effort cleanup of any previous file in this slot. Done before
      //    the new upload so the new URL replaces the old in one round-trip;
      //    a failure here is logged but never blocks the upload.
      const existing =
        kind === 'cover' ? cached.coverImageUrl : cached.rulerPortraitUrl
      if (existing) {
        const oldPath = extractStoragePath(existing)
        if (oldPath) {
          await supabase.storage.from('realm-images').remove([oldPath])
        }
      }

      // 2. Upload to a fresh timestamped path
      const path = `${ownerId}/${realmId}/${kind}-${Date.now()}.${extFor(file)}`
      const uploadRes = await supabase.storage
        .from('realm-images')
        .upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        })
      if (uploadRes.error) throw uploadRes.error

      // 3. Resolve to a public URL (the bucket is public)
      const { data } = supabase.storage.from('realm-images').getPublicUrl(path)
      const publicUrl = data.publicUrl

      // 4. Patch the realm and persist
      const updated: RealmState = {
        ...cached,
        coverImageUrl: kind === 'cover' ? publicUrl : cached.coverImageUrl,
        rulerPortraitUrl:
          kind === 'portrait' ? publicUrl : cached.rulerPortraitUrl,
      }
      queryClient.setQueryData(queryKeys.realms.detail(realmId), updated)
      await saveRealm(supabase, updated)
      return updated
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.realms.detail(vars.realmId),
      })
    },
  })
}

/**
 * Removes the image in the given slot: clears the URL column, persists,
 * and (best-effort) deletes the underlying storage object.
 */
export function useRemoveRealmImage() {
  const queryClient = useQueryClient()

  return useMutation<RealmState, Error, RemoveVars>({
    mutationFn: async ({ realmId, kind }) => {
      const cached = queryClient.getQueryData<RealmState>(
        queryKeys.realms.detail(realmId),
      )
      if (!cached) throw new Error('Realm not loaded')

      const existing =
        kind === 'cover' ? cached.coverImageUrl : cached.rulerPortraitUrl
      if (existing) {
        const oldPath = extractStoragePath(existing)
        if (oldPath) {
          await supabase.storage.from('realm-images').remove([oldPath])
        }
      }

      const updated: RealmState = {
        ...cached,
        coverImageUrl: kind === 'cover' ? null : cached.coverImageUrl,
        rulerPortraitUrl: kind === 'portrait' ? null : cached.rulerPortraitUrl,
      }
      queryClient.setQueryData(queryKeys.realms.detail(realmId), updated)
      await saveRealm(supabase, updated)
      return updated
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.realms.detail(vars.realmId),
      })
    },
  })
}

/**
 * Pulls the storage path (e.g. "owner/realm/cover-1234.png") out of a public
 * URL emitted by supabase.storage.getPublicUrl. Returns null if the URL doesn't
 * match the expected shape — in that case we skip the delete instead of
 * throwing, since orphaned objects are harmless.
 */
function extractStoragePath(publicUrl: string): string | null {
  // Public URLs look like:
  //   https://<project>.supabase.co/storage/v1/object/public/realm-images/<path>
  const marker = '/storage/v1/object/public/realm-images/'
  const idx = publicUrl.indexOf(marker)
  if (idx < 0) return null
  return decodeURIComponent(publicUrl.slice(idx + marker.length))
}
