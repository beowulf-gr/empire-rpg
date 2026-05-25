import type { RealmState } from '../rules/state'
import { tradeRouteStatus } from '../rules/geography'
import { SectionIcon } from './SectionIcon'

interface Props {
  realm: RealmState
}

/**
 * Compact trade-route status indicator. Shows whether the realm can
 * trade with foreign markets right now, and via what mechanism.
 *
 * Hidden when there are no strongholds AND no roads — that's the
 * starter-realm case where the section would just be noise.
 */
export function TradeRoutesSection({ realm }: Props) {
  if (realm.strongholds.length === 0 && realm.roadAreaIds.length === 0) return null

  const status = tradeRouteStatus(realm)
  const tone = status.active
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400'

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="trade_routes" />
        Trade Routes
      </h2>
      <div className="border border-stone-200 dark:border-stone-800 rounded p-3 bg-white dark:bg-stone-900 text-sm space-y-1">
        <div className={`font-medium ${tone}`}>
          {status.active ? '✓ Trade route active' : '⚠ No trade route'}
        </div>
        <ul className="text-xs text-stone-500 space-y-0.5">
          <li>
            Ports: <strong>{status.portCount}</strong>
            {status.portCount > 0 && ' — direct trade with passing ships'}
          </li>
          <li>
            Road network: <strong>{status.roadAreaCount}</strong> tile{status.roadAreaCount === 1 ? '' : 's'}
          </li>
          <li>
            Strongholds connected to a perimeter via roads:{' '}
            <strong>{status.connectedStrongholdIds.length}</strong>
            {status.connectedStrongholdIds.length > 0 && ' / '}
            {status.connectedStrongholdIds.length > 0 && (
              <span>{realm.strongholds.length} total</span>
            )}
          </li>
        </ul>
        {!status.active && (
          <p className="text-xs text-stone-500 mt-2">
            Build a Port — or run roads from one of your strongholds to the realm's edge —
            to enable Buy / Sell Goods.
          </p>
        )}
      </div>
    </section>
  )
}
