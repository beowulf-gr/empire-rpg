/**
 * Builds the system + user prompt pair sent to an LLM to compose the
 * chronicle. Pure (no I/O) so it can be unit-tested without mocks.
 *
 * The user prompt is structured rather than narrative — explicit "Origin",
 * "Season log", "Ending" sections — so models that pay attention to
 * delimiters can quote source events rather than hallucinate.
 */

import type { OriginStory, EndingStory, RealmState } from '../rules/state'
import type { TurnHistoryRow } from '../hooks/useTurnHistory'
import { describeEvent } from '../components/actions/describeEvent'

const SEASON_LABEL: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
}

interface BuildPromptInput {
  realm: RealmState
  mode: 'ongoing' | 'final'
  events: TurnHistoryRow[]
}

export interface ChronicalPrompt {
  system: string
  user: string
  /** Approximate target word count, used to fine-tune the system prompt. */
  targetWords: number
}

/**
 * Scales the target story length with how much actually happened. A realm
 * with one season of history gets a 200-word vignette; a long campaign
 * gets the full ~1200-word treatment. Capped so we never demand more than
 * the model will reliably deliver in one call.
 */
function pickTargetWords(events: TurnHistoryRow[], mode: 'ongoing' | 'final'): number {
  const seasons = events.length
  // Rough scale: 150 words per recorded season + 200 baseline, clamped.
  const base = 200 + seasons * 150
  const cap = mode === 'final' ? 1400 : 1100
  return Math.min(Math.max(base, 200), cap)
}

const SYSTEM_PROMPT = [
  'You are a chronicler in a medieval fantasy world. You write short, vivid',
  'histories of small realms — kingdoms, baronies, city-states — that read',
  'like excerpts from a longer chronicle book. Your tone is grounded and',
  'concrete: name specific events, name specific resources, attribute',
  'consequences to causes. Avoid generic fantasy clichés (dragons, ancient',
  'evils, chosen ones) unless they appear in the source material. Write in',
  'past tense, third person, plain prose. No headings, no bullet points, no',
  'subtitles — just paragraphs.',
].join(' ')

/**
 * Renders the origin-story section as labelled text. Returns empty string
 * if all fields are blank, so the user prompt can drop the section.
 */
function renderOrigin(o: OriginStory | null | undefined): string {
  if (!o) return ''
  const lines: string[] = []
  if (o.founding) lines.push(`Founding: ${o.founding}`)
  if (o.rulerBackground) lines.push(`Ruler background: ${o.rulerBackground}`)
  if (o.notableCircumstances) lines.push(`Notable circumstances: ${o.notableCircumstances}`)
  if (lines.length === 0) return ''
  return `\n\nOrigin (player-provided, treat as canon):\n${lines.join('\n')}`
}

function renderEnding(e: EndingStory | null | undefined): string {
  if (!e) return ''
  const lines: string[] = []
  if (e.outcome) lines.push(`Outcome: ${e.outcome}`)
  if (e.finalNote) lines.push(`Final note: ${e.finalNote}`)
  if (lines.length === 0) return ''
  return `\n\nEnding (player-provided, treat as canon):\n${lines.join('\n')}`
}

/**
 * Renders the season log as a chronological list, one bullet per event,
 * grouped under "Year N, Season" headers. Reuses describeEvent so the
 * wording matches what the player sees in the in-game log.
 */
function renderEventLog(realm: RealmState, events: TurnHistoryRow[]): string {
  if (events.length === 0) {
    return '\n\nSeason log: (no seasons have ended yet)'
  }
  const parts: string[] = ['\n\nSeason log (chronological, lifted verbatim from the game record):']
  for (const row of events) {
    const seasonLabel = SEASON_LABEL[row.season] ?? row.season
    parts.push(`\nYear ${row.year}, ${seasonLabel}:`)
    if (row.events.length === 0) {
      parts.push('- (nothing of note)')
    } else {
      for (const ev of row.events) {
        parts.push(`- ${describeEvent(ev, realm)}`)
      }
    }
  }
  return parts.join('\n')
}

/**
 * Renders the ruler stat block — Strength/Dex/Con/Int/Wis/Cha — as a
 * short labelled line. Helps the model give the ruler a personality
 * grounded in their actual stats rather than inventing one.
 */
function renderRuler(realm: RealmState): string {
  const r = realm.ruler
  return [
    `Ruler: ${r.name}`,
    `Ability scores — STR ${r.strength}, DEX ${r.dexterity}, CON ${r.constitution}, INT ${r.intelligence}, WIS ${r.wisdom}, CHA ${r.charisma}`,
    `Skills — Diplomacy ${r.diplomacy}, Knowledge (Economics) ${r.knowledgeEconomics}`,
  ].join('\n')
}

export function buildChroniclePrompt({ realm, mode, events }: BuildPromptInput): ChronicalPrompt {
  const targetWords = pickTargetWords(events, mode)
  const closing =
    mode === 'final'
      ? 'Compose the closed chronicle now. Begin with the realm\'s founding (or its arrival on the historical stage), carry through the recorded seasons, and conclude with the ending the player described. End naturally; do not summarise or moralise.'
      : 'Compose the chronicle of the story so far. Begin with the realm\'s founding (or its arrival on the historical stage), carry through the recorded seasons, and end at the realm\'s present moment (Year ' + realm.year + ', ' + (SEASON_LABEL[realm.season] ?? realm.season) + '). End naturally; do not summarise.'

  const user = [
    `Write a chronicle of the realm of ${realm.name}.`,
    `Format: prose, ${targetWords} words total (give or take 100). No headings, no bullet points.`,
    '',
    renderRuler(realm),
    renderOrigin(realm.originStory).trimStart(),
    renderEventLog(realm, events).trimStart(),
    renderEnding(realm.endingStory).trimStart(),
    '',
    closing,
  ]
    .filter((s) => s !== '')
    .join('\n')

  return {
    system: SYSTEM_PROMPT,
    user,
    targetWords,
  }
}
