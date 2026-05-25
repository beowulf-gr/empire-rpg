import { useState } from 'react'
import type { RealmState } from '../rules/state'

export type GenerationProvider = 'openai' | 'claude' | 'gemini' | 'pollinations'

export type GenerationConfig =
  | { source: 'pollinations-free' }
  | {
      source: 'user-key'
      provider: GenerationProvider
      model: string
      apiKey: string
    }

interface Props {
  realm: RealmState
  /** Which kind of chronicle the user picked in the previous step. */
  mode: 'ongoing' | 'final'
  /** Called when the dialog is dismissed (Cancel, back, or after submit). */
  onClose: () => void
  /**
   * Called once the user has finalised their generation config. Step 4b
   * will wire this to actually kick off the LLM call. In Step 4a it just
   * triggers a placeholder notice.
   */
  onSubmit: (config: GenerationConfig) => void
}

const PROVIDER_META: Record<
  GenerationProvider,
  { label: string; modelsUrl: string; modelHint: string }
> = {
  openai: {
    label: 'OpenAI',
    modelsUrl: 'https://developers.openai.com/api/docs/models',
    modelHint: 'e.g. gpt-4o-mini',
  },
  claude: {
    label: 'Claude',
    modelsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    modelHint: 'e.g. claude-haiku-4-5',
  },
  gemini: {
    label: 'Gemini',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    modelHint: 'e.g. gemini-2.0-flash',
  },
  pollinations: {
    label: 'Pollinations',
    modelsUrl: 'https://enter.pollinations.ai/sign-in#models',
    modelHint: 'e.g. openai-large',
  },
}

const STORAGE_KEY = 'empire-rpg:llm-config'

interface SavedConfig {
  provider?: GenerationProvider
  model?: string
  apiKey?: string
}

function loadSaved(): SavedConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function persistSaved(c: SavedConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    // ignore — quota or private browsing
  }
}

/**
 * Two-stage modal that gates story generation behind a provider-config
 * question:
 *   Stage 1 — "Do you have an API key with an LLM provider?"
 *     - Yes  → Stage 2
 *     - No   → submit { source: 'pollinations-free' }
 *   Stage 2 — Provider dropdown + model + API key + link to models docs.
 *
 * Previously-entered config is pre-filled from localStorage so the user
 * doesn't re-type their key every time. The dialog itself doesn't call the
 * LLM — Step 4b will read the returned config and dispatch the request.
 */
export function StoryGenerationDialog({ realm: _realm, mode, onClose, onSubmit }: Props) {
  const saved = loadSaved()

  const [stage, setStage] = useState<'ask' | 'config'>('ask')
  const [provider, setProvider] = useState<GenerationProvider>(
    saved.provider ?? 'openai',
  )
  const [model, setModel] = useState<string>(saved.model ?? '')
  const [apiKey, setApiKey] = useState<string>(saved.apiKey ?? '')
  const [showKey, setShowKey] = useState(false)

  const meta = PROVIDER_META[provider]
  const modelEmpty = model.trim().length === 0
  const apiKeyEmpty = apiKey.trim().length === 0
  const canSubmit = !modelEmpty && !apiKeyEmpty

  const submitFree = () => {
    onSubmit({ source: 'pollinations-free' })
  }

  const submitWithKey = () => {
    const cleanModel = model.trim()
    const cleanKey = apiKey.trim()
    persistSaved({ provider, model: cleanModel, apiKey: cleanKey })
    onSubmit({
      source: 'user-key',
      provider,
      model: cleanModel,
      apiKey: cleanKey,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-md w-full">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl">
            {stage === 'ask' ? 'Generate your story' : 'Provider details'}
          </h3>
          <p className="text-sm text-stone-500 mt-1">
            {mode === 'final'
              ? 'Compose the full saga, beginning to end.'
              : 'Compose a chronicle of the story so far.'}
          </p>
        </header>

        {stage === 'ask' && (
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm">
              Do you have an API key with an LLM provider?
            </p>

            <button
              type="button"
              onClick={() => setStage('config')}
              className="w-full text-left px-4 py-3 border border-stone-300 dark:border-stone-700 rounded-md hover:border-[var(--wine)] transition-colors"
            >
              <div className="font-medium">Yes, I'll use my own API key</div>
              <div className="text-xs text-stone-500 mt-1">
                Choose a provider (OpenAI, Claude, Gemini, or Pollinations),
                pick a model, and paste your key. Your config is saved
                locally in this browser so you won't have to re-enter it.
              </div>
            </button>

            <button
              type="button"
              onClick={submitFree}
              className="w-full text-left px-4 py-3 border border-stone-300 dark:border-stone-700 rounded-md hover:border-[var(--wine)] transition-colors"
            >
              <div className="font-medium">
                No, use the free Pollinations default
              </div>
              <div className="text-xs text-stone-500 mt-1">
                Routes the request through Pollinations' free tier with the
                Mistral model — no key required. Subject to their rate
                limits and availability.
              </div>
            </button>
          </div>
        )}

        {stage === 'config' && (
          <div className="px-5 py-4 space-y-3">
            <div>
              <label
                htmlFor="story-provider"
                className="block text-sm font-medium mb-1"
              >
                Provider
              </label>
              <select
                id="story-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as GenerationProvider)}
                className="w-full px-2 py-1 text-sm border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-800"
              >
                <option value="openai">OpenAI</option>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="pollinations">Pollinations</option>
              </select>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <label htmlFor="story-model" className="text-sm font-medium">
                  Model
                </label>
                <a
                  href={meta.modelsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--wine)] hover:underline"
                >
                  {meta.label} models ↗
                </a>
              </div>
              <input
                id="story-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={meta.modelHint}
                className="w-full px-2 py-1 text-sm border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-800 font-mono"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <label htmlFor="story-key" className="text-sm font-medium">
                  API key
                </label>
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="text-xs text-stone-500 hover:text-[var(--wine)]"
                >
                  {showKey ? 'hide' : 'show'}
                </button>
              </div>
              <input
                id="story-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                className="w-full px-2 py-1 text-sm border border-stone-300 dark:border-stone-700 rounded bg-white dark:bg-stone-800 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-stone-500 mt-1">
                Stored locally in this browser only. Never sent to Anthropic
                or Empire's servers.
              </p>
            </div>
          </div>
        )}

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2">
          {stage === 'config' ? (
            <button
              type="button"
              onClick={() => setStage('ask')}
              className="text-sm text-stone-500 hover:text-[var(--wine)]"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md font-medium"
            >
              Cancel
            </button>
            {stage === 'config' && (
              <button
                type="button"
                onClick={submitWithKey}
                disabled={!canSubmit}
                className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium disabled:opacity-50"
              >
                Generate story
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
