import { useEffect, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import type { RealmState } from '../rules/state'
import { useTurnHistory } from '../hooks/useTurnHistory'
import { buildChroniclePrompt } from '../lib/storyPrompt'
import { generateChronicle, StoryGenerationError } from '../lib/storyGenerate'
import type { GenerationConfig } from './StoryGenerationDialog'
import { ChroniclePDF } from './ChroniclePDF'

/** Produces a filesystem-safe slug from the realm name. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      // strip combining diacritical marks (U+0300 to U+036F)
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'realm'
  )
}

interface Props {
  realm: RealmState
  mode: 'ongoing' | 'final'
  config: GenerationConfig
  onClose: () => void
}

type Phase =
  | { kind: 'loading-history' }
  | { kind: 'generating' }
  | { kind: 'done'; text: string }
  | { kind: 'error'; message: string }

/**
 * Drives the full chronicle pipeline once the user has chosen a config:
 *   1. Wait for turn_history to load (separate query).
 *   2. Build the prompt from realm + origin/ending + events.
 *   3. Dispatch via generateChronicle.
 *   4. Render the narrative with a Copy-to-clipboard button.
 *
 * Step 4d will add the PDF render with cover image + ruler portrait.
 */
export function NarrativeModal({ realm, mode, config, onClose }: Props) {
  const logQuery = useTurnHistory(realm.id)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading-history' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (logQuery.isLoading) {
      setPhase({ kind: 'loading-history' })
      return
    }
    if (logQuery.error) {
      setPhase({
        kind: 'error',
        message: `Couldn't load the season log: ${logQuery.error.message}`,
      })
      return
    }
    // Kick off generation once the events are ready.
    setPhase({ kind: 'generating' })
    const events = logQuery.data ?? []
    const { system, user } = buildChroniclePrompt({ realm, mode, events })
    let cancelled = false
    generateChronicle({ config, system, user })
      .then((text) => {
        if (cancelled) return
        setPhase({ kind: 'done', text })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof StoryGenerationError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unknown error while generating the chronicle.'
        setPhase({ kind: 'error', message })
      })
    return () => {
      cancelled = true
    }
    // We deliberately re-run only when the realm/mode/config identity
    // changes — not on every render — so the fetch fires exactly once per
    // modal mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realm.id, mode, logQuery.isLoading, logQuery.error, !!logQuery.data])

  const copy = async () => {
    if (phase.kind !== 'done') return
    try {
      await navigator.clipboard.writeText(phase.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore — clipboard might be blocked in some browsers
    }
  }

  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const downloadPdf = async () => {
    if (phase.kind !== 'done') return
    setDownloadError(null)
    setDownloading(true)
    try {
      const blob = await pdf(
        <ChroniclePDF realm={realm} mode={mode} narrative={phase.text} />,
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const filename = `${slugify(realm.name)}-chronicle.pdf`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Defer revoke so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (err) {
      setDownloadError(
        err instanceof Error
          ? `Couldn't build the PDF: ${err.message}`
          : 'Unknown error building the PDF.',
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex items-baseline justify-between gap-2">
          <div>
            <h3 className="font-serif font-semibold text-xl">
              Chronicle of {realm.name}
            </h3>
            <p className="text-sm text-stone-500 mt-0.5">
              {mode === 'final' ? 'Closed saga' : 'The story so far'} ·{' '}
              {config.source === 'pollinations-free'
                ? 'Pollinations (free tier)'
                : `${config.provider} / ${config.model}`}
            </p>
          </div>
        </header>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {phase.kind === 'loading-history' && (
            <p className="italic text-stone-500 text-sm">
              Gathering the season log…
            </p>
          )}

          {phase.kind === 'generating' && (
            <div className="flex items-center gap-3 text-sm text-stone-500">
              <span className="inline-block h-3 w-3 rounded-full bg-stone-400 animate-pulse" />
              <span>
                The chronicler is composing your realm's history. This usually
                takes 10–30 seconds.
              </span>
            </div>
          )}

          {phase.kind === 'error' && (
            <div className="space-y-2">
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {phase.message}
              </p>
              <p className="text-xs text-stone-500">
                You can close this and try again. If Pollinations is
                temporarily unavailable, wait a minute before retrying.
              </p>
            </div>
          )}

          {phase.kind === 'done' && (
            <article className="prose prose-stone dark:prose-invert max-w-none whitespace-pre-wrap text-[15px] leading-relaxed">
              {phase.text}
            </article>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-red-600 dark:text-red-400" role={downloadError ? 'alert' : undefined}>
            {downloadError}
          </div>
          <div className="flex gap-2">
            {phase.kind === 'done' && (
              <button
                type="button"
                onClick={copy}
                className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md font-medium"
              >
                {copied ? 'Copied!' : 'Copy text'}
              </button>
            )}
            {phase.kind === 'done' && (
              <button
                type="button"
                onClick={() => void downloadPdf()}
                disabled={downloading}
                className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md font-medium disabled:opacity-50"
              >
                {downloading ? 'Building PDF...' : 'Download PDF'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium"
            >
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
