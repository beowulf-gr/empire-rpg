import { useState } from 'react'
import type { RealmState } from '../rules/state'
import { EndingStoryDialog } from './EndingStoryDialog'
import {
  StoryGenerationDialog,
  type GenerationConfig,
} from './StoryGenerationDialog'
import { NarrativeModal } from './NarrativeModal'

interface Props {
  realm: RealmState
}

/**
 * Section anchored at the bottom of the realm page. The button opens a
 * chooser modal asking whether the user wants an ongoing or finalized
 * chronicle. Picking "finalize" routes through EndingStoryDialog first;
 * either branch then passes through the StoryGenerationDialog (provider /
 * key selection), and finally NarrativeModal runs the LLM call and shows
 * the result. PDF rendering is added in Step 4d.
 */
type Stage =
  | 'idle'
  | 'choosing'
  | 'finalizing'
  | 'configuring-ongoing'
  | 'configuring-final'
  | 'narrating-ongoing'
  | 'narrating-final'

export function TellOurStorySection({ realm }: Props) {
  const [stage, setStage] = useState<Stage>('idle')
  // Captured by StoryGenerationDialog.onSubmit, used by the placeholder
  // modal to confirm what config WOULD be used once Step 4b ships.
  const [pendingConfig, setPendingConfig] = useState<GenerationConfig | null>(null)

  const hasPrologue = !!realm.originStory
  const hasEpilogue = !!realm.endingStory

  return (
    <section className="mb-12 mt-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3">
        Tell our story
      </h2>
      <p className="text-sm text-stone-500 mb-4 max-w-prose">
        When you're ready, Empire can compose a chronicle of your realm based on
        the prologue you wrote, every season-end event, and (if you mark the
        realm as finalized) an epilogue. You can use the free Pollinations
        default or supply your own API key for OpenAI, Claude, or Gemini.
      </p>

      <div className="flex items-center gap-3 flex-wrap text-xs text-stone-500">
        <span>
          Prologue:{' '}
          <strong className="text-[var(--ink)]">
            {hasPrologue ? 'saved' : 'not provided'}
          </strong>
        </span>
        <span className="text-[var(--ink-faint)]">·</span>
        <span>
          Epilogue:{' '}
          <strong className="text-[var(--ink)]">
            {hasEpilogue ? 'saved' : 'not provided'}
          </strong>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setStage('choosing')}
        className="empire-button px-5 py-2.5 rounded-md font-medium mt-4"
      >
        Tell our story
      </button>

      {stage === 'choosing' && (
        <ChooserModal
          onPickOngoing={() => setStage('configuring-ongoing')}
          onPickFinalize={() => setStage('finalizing')}
          onClose={() => setStage('idle')}
          hasEpilogue={hasEpilogue}
        />
      )}

      {stage === 'finalizing' && (
        <EndingStoryDialog
          realm={realm}
          title="Mark this realm as finalized"
          description="Tell Empire how the realm's story ended. After saving, you'll be asked which provider should compose the chronicle."
          onClose={() => setStage('idle')}
          onSaved={() => setStage('configuring-final')}
        />
      )}

      {stage === 'configuring-ongoing' && (
        <StoryGenerationDialog
          realm={realm}
          mode="ongoing"
          onClose={() => setStage('idle')}
          onSubmit={(cfg) => {
            setPendingConfig(cfg)
            setStage('narrating-ongoing')
          }}
        />
      )}

      {stage === 'configuring-final' && (
        <StoryGenerationDialog
          realm={realm}
          mode="final"
          onClose={() => setStage('idle')}
          onSubmit={(cfg) => {
            setPendingConfig(cfg)
            setStage('narrating-final')
          }}
        />
      )}

      {stage === 'narrating-ongoing' && pendingConfig && (
        <NarrativeModal
          realm={realm}
          mode="ongoing"
          config={pendingConfig}
          onClose={() => {
            setStage('idle')
            setPendingConfig(null)
          }}
        />
      )}

      {stage === 'narrating-final' && pendingConfig && (
        <NarrativeModal
          realm={realm}
          mode="final"
          config={pendingConfig}
          onClose={() => {
            setStage('idle')
            setPendingConfig(null)
          }}
        />
      )}

    </section>
  )
}

interface ChooserProps {
  onPickOngoing: () => void
  onPickFinalize: () => void
  onClose: () => void
  hasEpilogue: boolean
}

function ChooserModal({ onPickOngoing, onPickFinalize, onClose, hasEpilogue }: ChooserProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-md w-full">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl">Tell our story</h3>
          <p className="text-sm text-stone-500 mt-1">
            Which kind of chronicle do you want?
          </p>
        </header>

        <div className="px-5 py-4 space-y-3">
          <button
            type="button"
            onClick={onPickOngoing}
            className="w-full text-left px-4 py-3 border border-stone-300 dark:border-stone-700 rounded-md hover:border-[var(--wine)] transition-colors"
          >
            <div className="font-medium">The story so far</div>
            <div className="text-xs text-stone-500 mt-1">
              An ongoing chronicle that picks up from your prologue and runs
              through the most recent season. You can come back and re-run
              this any time the realm has moved forward.
            </div>
          </button>

          <button
            type="button"
            onClick={onPickFinalize}
            className="w-full text-left px-4 py-3 border border-stone-300 dark:border-stone-700 rounded-md hover:border-[var(--wine)] transition-colors"
          >
            <div className="font-medium">
              Finalize and tell the full saga
              {hasEpilogue && (
                <span className="ml-2 text-xs text-stone-500 font-normal">
                  (epilogue already saved — you can edit it)
                </span>
              )}
            </div>
            <div className="text-xs text-stone-500 mt-1">
              Record how the realm's story ended, then generate the closed
              chronicle from beginning to end.
            </div>
          </button>
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md font-medium"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}

