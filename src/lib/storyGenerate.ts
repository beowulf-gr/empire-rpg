/**
 * Thin client for the LLM endpoints used by the "Tell our story" feature.
 *
 * Supports four providers when the user supplies an API key (OpenAI,
 * Claude, Gemini, Pollinations) plus a key-free Pollinations branch. All
 * calls go directly from the browser — the user's key never leaves their
 * machine. The public surface (generateChronicle) takes a generation
 * config and a prompt pair, and always returns the narrative as plain
 * text; per-provider response shapes are normalised in here so callers
 * stay simple.
 */

import type { GenerationConfig } from '../components/StoryGenerationDialog'

export class StoryGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoryGenerationError'
  }
}

/** Default model used when the user picks the "no API key" branch. */
const POLLINATIONS_FREE_MODEL = 'mistral'

/**
 * Pollinations migrated text generation to `gen.pollinations.ai/v1/chat/completions`
 * in late 2025; the new endpoint requires an API key for every call. The
 * "free" option in the dialog uses a project-owned key embedded in the
 * client so end users don't have to sign up. Both the free and user-key
 * Pollinations paths hit the same endpoint.
 *
 * SECURITY NOTE: the embedded key is visible in the JS bundle and can be
 * extracted by anyone who loads the app. Acceptable for a personal /
 * small-circle project; not for a public deployment. The proper fix is a
 * server-side proxy (e.g. Supabase edge function) that adds the key.
 */
const POLLINATIONS_ENDPOINT = 'https://gen.pollinations.ai/v1/chat/completions'
const POLLINATIONS_SHARED_KEY = 'sk_bnY5fh07tfJw9wniy97lFvJq9I5f7A5W'

/** Output cap for narratives. ~3 pages of prose is well within this. */
const MAX_OUTPUT_TOKENS = 4096

// ============================================================
// Response extractors — one per response shape
// ============================================================

/** OpenAI-compatible chat completion: `choices[0].message.content`. */
function extractOpenAIContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const choices = (json as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0] as { message?: { content?: unknown } } | undefined
  const content = first?.message?.content
  return typeof content === 'string' ? content : null
}

/** Anthropic Messages API: `content[0].text`. */
function extractClaudeContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const content = (json as { content?: unknown }).content
  if (!Array.isArray(content) || content.length === 0) return null
  // Claude returns an array of blocks (text, tool_use, etc.). Concatenate
  // every text block, ignoring others.
  const parts: string[] = []
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.length > 0 ? parts.join('') : null
}

/** Gemini generateContent: `candidates[0].content.parts[*].text`. */
function extractGeminiContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const candidates = (json as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const first = candidates[0] as { content?: { parts?: unknown } } | undefined
  const parts = first?.content?.parts
  if (!Array.isArray(parts)) return null
  const out: string[] = []
  for (const p of parts) {
    const text = (p as { text?: unknown }).text
    if (typeof text === 'string') out.push(text)
  }
  return out.length > 0 ? out.join('') : null
}

// ============================================================
// Error formatting — pulls a useful message out of any provider's error shape
// ============================================================

interface ErrorJson {
  error?: { message?: unknown; type?: unknown } | string
  message?: unknown
}

function formatProviderError(provider: string, res: Response, body: string): string {
  let json: unknown = null
  try {
    json = JSON.parse(body)
  } catch {
    // body wasn't JSON — use it raw below
  }
  const fromJson = (j: ErrorJson | unknown): string | null => {
    if (!j || typeof j !== 'object') return null
    const e = (j as ErrorJson).error
    if (typeof e === 'string') return e
    if (e && typeof e === 'object' && typeof e.message === 'string') return e.message
    const m = (j as ErrorJson).message
    if (typeof m === 'string') return m
    return null
  }
  const detail = fromJson(json) ?? (body ? body.slice(0, 200) : '')
  return `${provider} returned ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`
}

// ============================================================
// Provider implementations
// ============================================================

interface OpenAICompatArgs {
  url: string
  apiKey: string | null
  model: string
  system: string
  user: string
  providerName: string
}

/**
 * Generic POST to an OpenAI-compatible chat completion endpoint. Used by
 * OpenAI, Pollinations-free (no key), and Pollinations-with-key.
 */
async function callOpenAICompat({
  url,
  apiKey,
  model,
  system,
  user,
  providerName,
}: OpenAICompatArgs): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    stream: false,
    max_tokens: MAX_OUTPUT_TOKENS,
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (err) {
    throw new StoryGenerationError(
      `Couldn't reach ${providerName}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const text = await res.text()
  if (!res.ok) throw new StoryGenerationError(formatProviderError(providerName, res, text))

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new StoryGenerationError(`${providerName} returned a non-JSON response.`)
  }

  const content = extractOpenAIContent(json)
  if (!content) {
    throw new StoryGenerationError(
      `${providerName} returned an empty or unexpected response shape.`,
    )
  }

  // Pollinations sometimes substitutes a deprecation/auth-required banner
  // for the actual model output (HTTP 200, but the "narrative" is really
  // their notice). Detect and convert to a useful error.
  if (providerName === 'Pollinations' && looksLikePollinationsBanner(content)) {
    throw new StoryGenerationError(
      'Pollinations returned a service notice instead of a story. Their free tier may have been further restricted. Try the "Yes, I\'ll use my own API key" option — sign up at https://enter.pollinations.ai for a free token, then pick "Pollinations" as the provider.',
    )
  }

  return content.trim()
}

/**
 * Returns true when a Pollinations response body looks like one of their
 * service-notice banners (deprecation, migration, auth-required) rather
 * than an actual model completion. They tend to mention both "Pollinations"
 * and the words "deprecat" / "migrate" / "authentication".
 */
function looksLikePollinationsBanner(text: string): boolean {
  const t = text.toLowerCase()
  if (!t.includes('pollinations')) return false
  return (
    t.includes('deprecat') ||
    t.includes('migrate') ||
    t.includes('authentication required') ||
    t.includes('please provide an api key')
  )
}

/**
 * Anthropic Messages API. Browser-direct calls require the explicit
 * acknowledgment header; without it the request is blocked at the
 * Anthropic CDN.
 */
async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const url = 'https://api.anthropic.com/v1/messages'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // Required for browser-direct calls. Anthropic forces this header so
    // the developer explicitly acknowledges that the key is exposed.
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  const body = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (err) {
    throw new StoryGenerationError(
      `Couldn't reach Claude: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const text = await res.text()
  if (!res.ok) throw new StoryGenerationError(formatProviderError('Claude', res, text))

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new StoryGenerationError('Claude returned a non-JSON response.')
  }

  const content = extractClaudeContent(json)
  if (!content) {
    throw new StoryGenerationError('Claude returned no text content in the response.')
  }
  return content.trim()
}

/**
 * Google Gemini generateContent. API key goes in the URL query string,
 * not a header. The "system_instruction" field is separate from the
 * conversation contents.
 */
async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const safeModel = encodeURIComponent(model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new StoryGenerationError(
      `Couldn't reach Gemini: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const text = await res.text()
  if (!res.ok) throw new StoryGenerationError(formatProviderError('Gemini', res, text))

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new StoryGenerationError('Gemini returned a non-JSON response.')
  }

  const content = extractGeminiContent(json)
  if (!content) {
    throw new StoryGenerationError(
      'Gemini returned no text content (possibly blocked by safety filters).',
    )
  }
  return content.trim()
}

// ============================================================
// Public dispatcher
// ============================================================

interface GenerateInput {
  config: GenerationConfig
  system: string
  user: string
}

/**
 * Dispatches a chronicle-generation request to the right provider based
 * on the user's config. Free path uses Pollinations with a hardcoded
 * model and no key; user-key paths use the model and key the user typed
 * into the dialog.
 */
export async function generateChronicle({
  config,
  system,
  user,
}: GenerateInput): Promise<string> {
  if (config.source === 'pollinations-free') {
    return callOpenAICompat({
      url: POLLINATIONS_ENDPOINT,
      apiKey: POLLINATIONS_SHARED_KEY,
      model: POLLINATIONS_FREE_MODEL,
      system,
      user,
      providerName: 'Pollinations',
    })
  }

  // user-key branch — dispatch per provider
  switch (config.provider) {
    case 'openai':
      return callOpenAICompat({
        url: 'https://api.openai.com/v1/chat/completions',
        apiKey: config.apiKey,
        model: config.model,
        system,
        user,
        providerName: 'OpenAI',
      })
    case 'pollinations':
      return callOpenAICompat({
        url: POLLINATIONS_ENDPOINT,
        apiKey: config.apiKey,
        model: config.model,
        system,
        user,
        providerName: 'Pollinations',
      })
    case 'claude':
      return callClaude(config.apiKey, config.model, system, user)
    case 'gemini':
      return callGemini(config.apiKey, config.model, system, user)
    default: {
      // Exhaustiveness check — surfaced as a runtime error if a new
      // provider gets added to the union without a matching case here.
      const _exhaustive: never = config.provider
      throw new StoryGenerationError(`Unknown provider: ${String(_exhaustive)}`)
    }
  }
}
