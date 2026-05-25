import type { SurveyResult } from '../../rules/survey'

interface Props {
  result: SurveyResult
  /** 1-based index of the surveyed area, for the "Area #N" label. */
  areaIndex: number
  onClose: () => void
}

const MINERAL_LABEL: Record<string, string> = {
  adamantine: 'Adamantine',
  copper: 'Copper',
  gold_metal: 'Gold',
  iron: 'Iron',
  mithral: 'Mithral',
  silver: 'Silver',
}

const MINERAL_FLAVOR: Record<string, string> = {
  adamantine: 'A treasure beyond price — the smiths weep with joy.',
  mithral: 'A silver gleam that any kingdom would covet.',
  gold_metal: 'A lucky strike — gold flows from the rock.',
  copper: 'Honest copper. Steady work for the miners.',
  iron: 'Plain iron, the spine of every army.',
  silver: 'Bright silver — the merchants will pay well.',
}

/**
 * Result modal shown immediately after a survey roll on a hills/mountain
 * area. Outcome variants:
 *
 *   'success' — hills (one roll, 1 mineral) or mountains (two rolls, 1 or
 *     2 minerals). The dialog shows the rolls and the discovered minerals.
 *     Twin-vein mountains are flagged so the player understands they'll
 *     produce both per harvest.
 *   'reactivated' — the area was already surveyed earlier. No new roll;
 *     just confirm the player switched it back into mineral harvesting.
 *
 * (Mountain "failure" is gone — the rule now stores whatever rolls came up,
 * so every initial survey is a success.)
 */
export function SurveyResultDialog({ result, areaIndex, onClose }: Props) {
  const p = result.event.payload as {
    areaId: string
    terrain: 'hills' | 'mountains'
    outcome: 'success' | 'reactivated'
    minerals: string[]
    roll?: number
    rollA?: number
    rollB?: number
    mineralA?: string
    mineralB?: string
  }

  const success = p.outcome === 'success'
  const reactivated = p.outcome === 'reactivated'
  const minerals = p.minerals ?? []
  const twinVein = p.terrain === 'mountains' && minerals.length === 2

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="parchment-card max-w-md w-full p-6">
        <div className="text-center">
          <div className="text-[var(--gold)] text-xl mb-2">⚜</div>
          <h3 className="empire-heading-center font-serif font-bold text-2xl inline-block mb-4">
            {reactivated
              ? 'Mine re-opened'
              : twinVein
                ? 'Two veins struck!'
                : 'A vein is struck!'}
          </h3>
        </div>

        <p className="text-sm text-[var(--ink-soft)] mb-3">
          Area #{areaIndex} ({p.terrain}) —{' '}
          {p.terrain === 'mountains' ? 'two d100 rolls' : 'd100 roll'}.
        </p>

        {/* The rolls themselves */}
        <div className="text-center font-mono text-sm mb-4 tabular">
          {p.roll !== undefined && (
            <span>
              d100 →{' '}
              <strong className="text-[var(--ink)] text-base">{p.roll}</strong>
            </span>
          )}
          {p.rollA !== undefined && p.rollB !== undefined && (
            <>
              <span>
                Roll 1 →{' '}
                <strong className="text-[var(--ink)] text-base">{p.rollA}</strong>
                {p.mineralA && (
                  <span className="text-[var(--ink-soft)] ml-1">
                    ({MINERAL_LABEL[p.mineralA] ?? p.mineralA})
                  </span>
                )}
              </span>
              <span className="mx-3 text-[var(--ink-soft)]">·</span>
              <span>
                Roll 2 →{' '}
                <strong className="text-[var(--ink)] text-base">{p.rollB}</strong>
                {p.mineralB && (
                  <span className="text-[var(--ink-soft)] ml-1">
                    ({MINERAL_LABEL[p.mineralB] ?? p.mineralB})
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Outcome card — success */}
        {success && minerals.length > 0 && (
          <div className="border border-emerald-500/50 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-md p-3 text-center">
            <div className="text-xs text-[var(--ink-soft)] mb-1">
              Discovered {minerals.length === 2 ? 'minerals' : 'mineral'}
            </div>
            <div className="text-2xl font-serif font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
              {minerals.map((m) => MINERAL_LABEL[m] ?? m).join(' + ')}
            </div>
            {minerals.length === 1 ? (
              <div className="text-xs italic text-[var(--ink-soft)]">
                {MINERAL_FLAVOR[minerals[0]] ?? ' '}
              </div>
            ) : (
              <div className="text-xs italic text-[var(--ink-soft)]">
                Twin veins — your miners will draw from both seams each harvest.
              </div>
            )}
            <div className="text-xs text-[var(--ink-soft)] mt-3">
              {p.terrain === 'hills'
                ? `The area now produces 1 × ${MINERAL_LABEL[minerals[0]] ?? minerals[0]} per harvest.`
                : minerals.length === 1
                  ? `The area now produces 2 × ${MINERAL_LABEL[minerals[0]] ?? minerals[0]} per harvest.`
                  : `The area now produces 1 of each per harvest (2 total).`}
            </div>
          </div>
        )}

        {/* Outcome card — reactivated */}
        {reactivated && minerals.length > 0 && (
          <div className="border border-[var(--gold)]/60 bg-[color-mix(in_oklab,var(--paper-2)_75%,var(--gold)_25%)] rounded-md p-3 text-center text-sm">
            The area was already surveyed earlier — workers return to{' '}
            <strong>{minerals.map((m) => MINERAL_LABEL[m] ?? m).join(' + ')}</strong>
            {minerals.length === 2 ? ' (twin veins)' : ''}.
          </div>
        )}

        <div className="text-right mt-5">
          <button onClick={onClose} className="empire-button px-5 py-2 rounded-md font-medium">
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
