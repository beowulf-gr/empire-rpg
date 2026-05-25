import type { RealmState } from '../rules/state'
import {
  TRADE_GOOD_KINDS,
  TRADE_GOOD_LABEL,
  TRADE_GOOD_RECIPES,
} from '../rules/actions/tradeGoods'
import { SectionIcon } from './SectionIcon'

interface Props {
  realm: RealmState
}

export function TradeGoodsSection({ realm }: Props) {
  const total = TRADE_GOOD_KINDS.reduce((s, k) => s + realm.tradeGoods[k], 0)
  // Hide the section when no trade goods AND no in-flight productions —
  // keeps the dashboard quiet for new realms.
  const inFlight = realm.ongoingActions.filter(
    (oa) => oa.actionId === 'produce_trade_goods',
  ).length
  if (total === 0 && inFlight === 0) return null

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="trade_goods" />
        Trade Goods{' '}
        <span className="text-sm text-stone-500 font-normal">
          ({total} finished{inFlight > 0 ? `, ${inFlight} in production` : ''})
        </span>
      </h2>
      <ul className="grid sm:grid-cols-2 gap-2">
        {TRADE_GOOD_KINDS.map((k) => {
          const count = realm.tradeGoods[k]
          if (count === 0) return null
          const recipe = TRADE_GOOD_RECIPES[k]
          return (
            <li
              key={k}
              className="border border-stone-200 dark:border-stone-800 rounded p-3 bg-white dark:bg-stone-900 flex items-baseline justify-between"
            >
              <div>
                <div className="font-medium">{TRADE_GOOD_LABEL[k]}</div>
                <div className="text-xs text-stone-500">
                  Sells {recipe.salePrice} gp/unit
                </div>
              </div>
              <div className="text-2xl font-semibold">{count}</div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
