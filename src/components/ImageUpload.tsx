import { useRef, useState } from 'react'

interface Props {
  /** Current image URL (null/undefined → show the empty placeholder). */
  currentUrl: string | null | undefined
  /** Called when the user picks a new file. */
  onUpload: (file: File) => void
  /** Called when the user clears the image. */
  onRemove: () => void
  /** True while a mutation is in flight — disables buttons + shows a spinner. */
  pending: boolean
  /** Most recent error from the mutation, or null. Rendered below the controls. */
  error: string | null
  /** Visual shape of the slot. */
  shape: 'banner' | 'portrait'
  /** Faint prompt shown in the empty state. */
  placeholderLabel: string
  /** Optional extra Tailwind classes on the outer container. */
  className?: string
  /** Optional alt text for the displayed image. */
  alt?: string
}

/**
 * One image slot — empty placeholder ⇒ upload button, populated ⇒ shows the
 * image with hover-revealed Replace / Remove controls. Used for both the
 * cover banner (shape='banner', wide aspect) and the Ruler portrait
 * (shape='portrait', square).
 *
 * Stateless beyond a hidden <input type="file"> and a confirm dialog flag —
 * persistence is delegated to whichever hook the parent passes through
 * onUpload/onRemove (typically useUploadRealmImage / useRemoveRealmImage).
 */
export function ImageUpload({
  currentUrl,
  onUpload,
  onRemove,
  pending,
  error,
  shape,
  placeholderLabel,
  className,
  alt,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const handlePick = () => fileRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file twice in a row still fires
    // onChange (browsers debounce identical selections otherwise).
    e.target.value = ''
    if (file) onUpload(file)
  }

  const shapeClasses =
    shape === 'banner'
      ? 'w-full aspect-[4/1] min-h-[120px]'
      : 'w-32 h-32 sm:w-40 sm:h-40 rounded-md'

  return (
    <div className={`relative group ${className ?? ''}`}>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
        aria-label={`Upload ${placeholderLabel}`}
      />

      {currentUrl ? (
        <>
          <img
            src={currentUrl}
            alt={alt ?? placeholderLabel}
            className={`${shapeClasses} object-cover rounded-md border-2 border-[var(--ink-faint,#a59c8d)] shadow-md`}
          />
          {/* Hover overlay with Replace / Remove */}
          <div
            className={`absolute inset-0 ${
              shape === 'banner' ? 'rounded-md' : 'rounded-md'
            } bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-end gap-2 p-2 opacity-0 group-hover:opacity-100`}
          >
            <button
              type="button"
              onClick={handlePick}
              disabled={pending}
              className="empire-button px-2 py-1 rounded text-xs font-medium shadow"
            >
              {pending ? 'Working…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={pending}
              className="empire-button-ghost px-2 py-1 rounded text-xs shadow bg-white/80 dark:bg-stone-900/80"
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={handlePick}
          disabled={pending}
          className={`${shapeClasses} border-2 border-dashed border-[var(--ink-faint,#a59c8d)] rounded-md flex flex-col items-center justify-center text-center text-sm text-[var(--ink-soft)] hover:bg-[var(--paper-2)]/60 hover:border-[var(--wine,#7a2e2e)] transition-colors`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 mb-2 opacity-60"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="px-3 italic">
            {pending ? 'Uploading…' : placeholderLabel}
          </span>
          <span className="text-xs opacity-60 mt-1">
            JPEG, PNG, WebP, GIF — up to 5 MB
          </span>
        </button>
      )}

      {error && (
        <p className="mt-2 text-xs text-[var(--rust)]" role="alert">
          {error}
        </p>
      )}

      {/* Remove confirmation — small inline dialog so we don't pull in a modal. */}
      {confirmRemove && (
        <div
          className="absolute inset-0 z-10 bg-black/60 rounded-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--paper)] border border-stone-300 dark:border-stone-700 rounded-md p-4 shadow-lg max-w-sm text-sm">
            <p className="mb-3">Remove this image? You can upload another at any time.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="empire-button-ghost px-3 py-1 rounded text-sm"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmRemove(false)
                  onRemove()
                }}
                className="empire-button px-3 py-1 rounded text-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
