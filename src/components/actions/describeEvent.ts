import type { ResourceKey, StrongholdKind } from '../../types/rules'
import type { RealmState, TurnEvent } from '../../rules/state'
import { findActionById } from '../../rules/actions/registry'
import { MINISTER_ROLE_LABEL } from '../../rules/actions/ministers'
import { TRADE_GOOD_LABEL, type TradeGoodKind } from '../../rules/actions/tradeGoods'

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  food: 'Food',
  lumber: 'Lumber',
  stone: 'Stone',
  gold: 'Gold',
  copper: 'Copper',
  iron: 'Iron',
  silver: 'Silver',
  gold_metal: 'Gold (ore)',
  mithral: 'Mithral',
  adamantine: 'Adamantine',
}

const STRONGHOLD_NAMES: Record<StrongholdKind, string> = {
  village: 'Village',
  town: 'Town',
  city: 'City',
  keep: 'Keep',
  castle: 'Castle',
  citadel: 'Citadel',
  mine: 'Mine',
  wall: 'Wall',
  marketplace: 'Marketplace',
  port: 'Port',
  craftsmens_guild: "Craftsmen's Guild",
  wizards_academy: "Wizards' Academy",
  grand_temple: 'Grand Temple',
}

/** Returns the 1-based index of the area in the realm's display order, or null. */
function areaLabel(realm: RealmState | undefined, areaId: string | undefined | null): string {
  if (!areaId) return ''
  if (!realm) return `area ${areaId.slice(0, 6)}…`
  const idx = realm.areas.findIndex((a) => a.id === areaId)
  if (idx < 0) return `area ${areaId.slice(0, 6)}…`
  const area = realm.areas[idx]
  return `area #${idx + 1} (${area.terrain})`
}

function actionName(actionId: string): string {
  return findActionById(actionId)?.name ?? actionId
}

function strongholdName(kind: string): string {
  return STRONGHOLD_NAMES[kind as StrongholdKind] ?? kind
}

/**
 * Renders a TurnEvent into a human-readable line. The optional `realm` lets
 * us resolve area UUIDs to their display index (e.g. "area #5 (plains)") and
 * action ids to their display names ("Build Roads" not "build_roads").
 */
export function describeEvent(e: TurnEvent, realm?: RealmState): string {
  const p = e.payload as Record<string, unknown>
  switch (e.type) {
    case 'morale_upkeep':
      return `Morale upkeep — Conditions: ${p.conditions ?? 'unknown'} (DC ${p.dc}). Checking ${p.groupCount} group${p.groupCount === 1 ? '' : 's'}.`

    case 'morale_check': {
      const outcome = p.outcome as string
      const newScore = p.newScore as number
      const revolt = p.revolt as boolean
      const bribeGp = (p.bribeGp as number | undefined) ?? 0
      const bribeBonus = (p.bribeBonus as number | undefined) ?? 0
      const bribeLoyaltyBonus = (p.bribeLoyaltyBonus as number | undefined) ?? 0
      const raceMod = (p.raceMod as number | undefined) ?? 0
      const racialComposition = (p.racialComposition as number | undefined) ?? 0
      const undeadPenalty = (p.undeadPenalty as number | undefined) ?? 0
      const orcIdlePenalty = (p.orcIdlePenalty as number | undefined) ?? 0
      const goblinClamp = p.goblinClamp as boolean | undefined
      const outcomeText =
        outcome === 'crit_pass' ? 'beat by 10+ → +2 loyalty'
          : outcome === 'pass'  ? 'passed → no change'
          : outcome === 'fail'  ? 'failed → -1 loyalty'
                                : 'failed by 10+ → -2 loyalty'
      const bribeTerm = bribeGp > 0 ? ` +${bribeBonus} (${bribeGp} gp bribe)` : ''
      const briberySuffix = bribeLoyaltyBonus > 0 ? ' +1 (bread & circuses)' : ''
      // Race breakdown shown only when it actually moves the needle.
      const raceParts: string[] = []
      if (racialComposition !== 0) raceParts.push(`${racialComposition >= 0 ? '+' : ''}${racialComposition} race composition`)
      if (undeadPenalty !== 0) raceParts.push(`${undeadPenalty} undead presence`)
      if (orcIdlePenalty !== 0) raceParts.push(`${orcIdlePenalty} orcs idle`)
      const raceTerm = raceMod !== 0 ? ` ${raceMod >= 0 ? '+' : ''}${raceMod} (${raceParts.join(', ')})` : ''
      const goblinSuffix = goblinClamp ? ' [goblin majority — negative delta absorbed]' : ''
      const base = `${p.label}: rolled ${p.roll} +${p.previousScore} +${p.baseWillSave}${bribeTerm}${raceTerm} = ${p.total} vs DC ${p.dc} — ${outcomeText}${briberySuffix}${goblinSuffix} (now ${newScore}).`
      return revolt ? base + ' ⚠ REVOLT — score ≤ -5.' : base
    }

    case 'orcs_idle_penalty': {
      if (!p.orcsPresent) {
        const prev = p.previousPenalty as number
        return prev !== 0
          ? `Orcs idle penalty: no orcs remain in the realm — penalty reset from ${prev} to 0.`
          : 'Orcs idle penalty: no orcs in the realm — skipped.'
      }
      const orcs = p.orcPopulation as number
      const mustered = p.orcMustered as number
      const half = p.halfNeeded as number
      const enough = p.enoughMustered as boolean
      const prev = p.previousPenalty as number
      const next = p.newPenalty as number
      const delta = next - prev
      const direction = delta > 0 ? `recovering ${delta}` : delta < 0 ? `worsening ${delta}` : 'unchanged'
      const reason = enough
        ? `${mustered}/${orcs} orcs mustered (need ${half}+)`
        : `only ${mustered}/${orcs} orcs mustered (need ${half}+) — restless`
      return `Orcs idle penalty: ${reason}. Penalty ${prev} → ${next} (${direction}).`
    }

    case 'elves_emigration': {
      if (!p.elvesPresent) return 'Elves emigration: no elves in the realm — skipped.'
      const total = p.totalLeft as number
      const dc = p.dc as number
      const commonersScore = p.commonersScore as number
      const emigrationMod = p.emigrationMod as number
      const stackChecks = (p.stackChecks as { roll: number; total: number; leaving: boolean }[] | undefined) ?? []
      const modText = emigrationMod !== 0 ? ` (commoners loyalty ${commonersScore} doubled → ${emigrationMod})` : ' (commoners loyalty ≥ 0 → treated as +0)'
      const rolls = stackChecks.map((c) => `${c.roll}${c.leaving ? '✗' : '✓'}`).join(', ')
      return total === 0
        ? `Elves emigration${modText}: vs DC ${dc} — rolls [${rolls}] — all elves stayed.`
        : `Elves emigration${modText}: vs DC ${dc} — rolls [${rolls}] — ${total} elf unit${total === 1 ? '' : 's'} drifted away.`
    }

    case 'population_upkeep':
      return `Population growth: rolled ${p.roll} +${p.foodMod} +${p.loyaltyMod} = ${p.total} → ${p.growthPercent}% (${p.previousTotal} → ${p.newTotal}). Recruit Settlers separately for new arrivals.`

    case 'recruit_settlers': {
      const total = p.total as number
      const settlers = p.settlers as number
      const race = p.race as string
      const ministerName = p.ministerName as string | null
      const ministerBonus = (p.ministerBonus as number | undefined) ?? 0
      const gpBonus = (p.gpBonus as number | undefined) ?? 0
      const ministerTerm = ministerName
        ? ` ${ministerBonus >= 0 ? '+' : ''}${ministerBonus} (${ministerName})`
        : ` ${ministerBonus} (no Prime Minister)`
      const goldTerm = gpBonus > 0 ? ` +${gpBonus * 4} (${gpBonus}gp incentives)` : ''
      const breakdown = `rolled ${p.roll} +${p.charismaMod}${ministerTerm} +${p.loyaltyMod}${goldTerm} = ${total}`
      const checksRemaining = (p.checksRemaining as number | undefined) ?? 0
      const tail = checksRemaining > 0 ? ` (${checksRemaining} check${checksRemaining === 1 ? '' : 's'} left this spring)` : ''
      return settlers === 0
        ? `Recruit Settlers (${race}): ${breakdown} → no new arrivals.${tail}`
        : `Recruit Settlers (${race}): ${breakdown} → +${settlers} ${race} (unallocated).${tail}`
    }

    case 'assign_population': {
      const { total, livingSpace, overcrowding, loyaltyDelta } = p as Record<string, number>
      return overcrowding > 0
        ? `Assign Population: overcrowding! ${total} pop / ${livingSpace} living space → ${loyaltyDelta} commoner loyalty.`
        : `Assign Population: ${total} pop / ${livingSpace} living space, no overcrowding.`
    }

    case 'no_event':       return 'Random event: nothing of note.'
    case 'good_weather':   return 'Random event: Good weather. +10% production for the rest of the year.'
    case 'poor_weather':   return 'Random event: Poor weather. −10% production for the rest of the year.'
    case 'infestation':
      return p.lostResource
        ? `Random event: Infestation. Lost ${p.amount} ${RESOURCE_LABELS[p.lostResource as ResourceKey] ?? p.lostResource} (${p.percent}%).`
        : 'Random event: Infestation, but nothing to spoil.'
    case 'incursion':
      return `Random event: Incursion! ${p.numUnits} ${p.unitSize} unit(s) of ${p.creature} arriving in ${p.arrivalSeason}.`
    case 'beneficial_find':
      return p.mode === 'treasury_gold'
        ? `Random event: Beneficial find. +${p.gold} gold.`
        : 'Random event: Beneficial find. A mineral area now also produces gold.'

    case 'harvest': {
      const delta = p.delta as Record<string, number>
      const parts = Object.entries(delta)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${v} ${RESOURCE_LABELS[k as ResourceKey] ?? k}`)
      return `Harvest from ${p.activeAreas}/${p.totalAreas} areas: ${parts.join(', ') || 'nothing'}.`
    }

    case 'allocate_food': {
      const crisis = p.crisis as string
      const balance = p.balance as number
      const loyaltyDelta = (p.loyaltyDelta as number) ?? 0
      const tag = loyaltyDelta !== 0
        ? ` (commoner loyalty ${loyaltyDelta > 0 ? '+' : ''}${loyaltyDelta})`
        : ''
      if (crisis === 'famine')   return `Allocate food: FAMINE — only ${p.foodSpent}/${p.foodNeeded} food (balance ${balance})${tag}.`
      if (crisis === 'shortage') return `Allocate food: shortage — ${p.foodSpent}/${p.foodNeeded} food (balance ${balance})${tag}.`
      return `Allocate food: ${p.foodSpent}/${p.foodNeeded} food spent, ${balance} surplus${tag}.`
    }

    case 'mineral_discovered': {
      // Legacy event from the old auto-roll mechanic. Kept for history-log
      // back-compat — new code emits `survey_minerals` instead.
      const area = areaLabel(realm, p.areaId as string)
      const a = p.rollA as number | undefined
      const b = p.rollB as number | undefined
      const rolls = a !== undefined && b !== undefined ? ` (d100: ${a}, ${b})` : ''
      if (p.mode === 'stone' || !p.mineral) {
        return `${area}: surveyed mountain — rolls didn't match${rolls}; vein produces stone (4/season).`
      }
      return `Mineral vein discovered on ${area}: ${p.mineral}${rolls}.`
    }

    case 'survey_minerals': {
      const area = areaLabel(realm, p.areaId as string)
      const terrain = p.terrain as string
      const outcome = p.outcome as string
      // New payload shape: minerals: string[]. Older logs may have the
      // legacy single `mineral` field; fall back to it if needed.
      const minerals = (p.minerals as string[] | undefined) ??
        (p.mineral ? [p.mineral as string] : [])
      const mineralsLabel = minerals.join(' + ') || 'nothing'
      if (outcome === 'success') {
        const rolls =
          p.roll !== undefined
            ? ` (d100: ${p.roll})`
            : ` (d100: ${p.rollA}, ${p.rollB})`
        const veinNote =
          terrain === 'mountains' && minerals.length === 2
            ? ' — twin veins'
            : terrain === 'mountains' && minerals.length === 1
              ? ' — single rich vein'
              : ''
        return `Surveyed ${area} (${terrain}) — struck ${mineralsLabel}${veinNote}${rolls}.`
      }
      if (outcome === 'failure') {
        // Legacy outcome — the new survey rule for mountains never fails.
        return `Surveyed ${area} (mountains) — rolls didn't match. Try again next time.`
      }
      // reactivated
      return `${area}: switched back to mineral mode (${mineralsLabel}).`
    }
    case 'survey_new_vein': {
      const area = areaLabel(realm, p.areaId as string)
      const terrain = p.terrain as string
      const outcome = p.outcome as string
      const tRoll = p.thresholdRoll as number | undefined
      const threshold = p.threshold as number | undefined
      const rolls = tRoll !== undefined ? ` (d100: ${tRoll}, needed ${threshold}+)` : ''
      if (outcome === 'success') {
        return `New-vein survey on ${area} (${terrain}) struck ${p.mineral}!${rolls}`
      }
      if (outcome === 'duplicate') {
        return `New-vein survey on ${area} found ${p.mineral} — but the area already produces it. No expansion${rolls}.`
      }
      if (outcome === 'capacity_full') {
        return `New-vein survey on ${area} found ${p.mineral} — but the mountain already has two veins; nothing to add${rolls}.`
      }
      if (outcome === 'invalid') {
        return `New-vein survey aborted — ${p.reason}.`
      }
      // threshold_fail
      return `New-vein survey on ${area} found nothing this time${rolls}.`
    }
    case 'ruins_yield':
      return `${areaLabel(realm, p.areaId as string)} yielded ${p.gold} gold.`
    case 'summer_passes':
      return 'Summer passes peacefully.'
    case 'winter_passes':
      return `Winter passes. Year ${p.yearEnded} ends.`

    case 'ongoing_action_complete':
      return `${actionName(p.actionId as string)} completed.`
    case 'construction_started':
      return `${actionName(p.actionId as string)} started — ${p.duration} season${p.duration === 1 ? '' : 's'}.`
    case 'roads_built': {
      const ids = (p.areaIds as string[]) ?? []
      const popReturned = (p.popReturned as number | undefined) ?? 0
      const popTag = popReturned > 0 ? ` ${popReturned} worker${popReturned === 1 ? '' : 's'} returned home.` : ''
      if (!realm) return `Roads built across ${ids.length} area${ids.length === 1 ? '' : 's'}.${popTag}`
      const labels = ids.map((id) => areaLabel(realm, id)).join(', ')
      return `Roads built: ${labels}.${popTag}`
    }
    case 'stronghold_built': {
      const kind = p.kind as string
      const popOutcome = p.popOutcome as string | undefined
      const popCount = (p.popCount as number | undefined) ?? 0
      const base = `${strongholdName(kind)} built on ${areaLabel(realm, p.areaId as string)}.`
      if (popOutcome === 'settled_at_area' && popCount > 0) {
        return `${base} ${popCount} worker${popCount === 1 ? '' : 's'} settled as residents.`
      }
      if (popOutcome === 'returned_to_idle' && popCount > 0) {
        return `${base} ${popCount} worker${popCount === 1 ? '' : 's'} returned home.`
      }
      return base
    }
    case 'terrain_converted': {
      const popReturned = (p.popReturned as number | undefined) ?? 0
      const popTag = popReturned > 0 ? ` ${popReturned} worker${popReturned === 1 ? '' : 's'} returned home.` : ''
      return `${areaLabel(realm, p.areaId as string)} converted to ${p.newTerrain}.${popTag}`
    }

    case 'unit_mustered': {
      const size = p.size as string
      const race = p.race as string
      return `Mustered a ${size} unit of ${race} warriors.`
    }
    case 'unit_levelled_up': {
      const size = p.size as string
      const race = (p.race as string | null) ?? 'mustered'
      const from = p.fromLevel as number
      const to = p.toLevel as number
      const cost = p.cost as number
      return `${size} ${race} warriors levelled up: ${from} → ${to} (${cost} gp).`
    }
    case 'unit_hired': {
      const size = p.size as string
      const cr = p.cr as number
      const bribe = (p.diplomacyBribeGp as number | undefined) ?? 0
      const wages = (p.wagesCost as number | undefined) ?? p.goldCost
      const bribeTag = bribe > 0 ? `, +${bribe} bribe` : ''
      return `Hired a ${size} mercenary unit (CR ${cr}). Cost: ${wages}g wages${bribeTag} + ${p.foodCost}f for year 1.`
    }
    case 'hire_soldiers_failed': {
      const size = p.size as string
      const requestedCR = p.requestedCR as number
      const maxCR = p.maxCR as number
      const bribe = p.diplomacyBribeGp as number
      const check = p.check as { natural: number; total: number }
      return `Hire failed: rolled ${check.natural}, total ${check.total} → max CR ${maxCR === 0 ? '(no mercs available)' : maxCR}. Wanted ${size} CR ${requestedCR}. ${bribe > 0 ? `${bribe} gp bribe wasted.` : ''}`
    }
    case 'unit_outfitted': {
      const supply = p.supplyAmount as number
      const kind = (p.kind as string).replace(/_/g, ' ')
      const gpAdded = p.gpAddedPerSoldier as number
      return `Outfitted unit: issued ${supply} ${kind} → +${gpAdded} gp/soldier of gear.`
    }
    case 'military_upkeep': {
      const units = p.units as number
      if (units === 0) return 'Military upkeep: no units.'
      const supported = p.supported as number
      const disbanded = p.disbandedCount as number
      return disbanded > 0
        ? `Military upkeep: ${supported}/${units} units supported, ${disbanded} disbanded for lack of supplies.`
        : `Military upkeep: ${supported}/${units} units supported.`
    }

    case 'minister_recruited': {
      const role = MINISTER_ROLE_LABEL[p.role as keyof typeof MINISTER_ROLE_LABEL] ?? p.role
      const name = p.name as string
      const level = p.level as number
      const cost = p.cost as number
      const replacedName = p.replacedName as string | null
      if (replacedName) {
        return `${name} hired as ${role} (level ${level}, ${cost} gp). ${replacedName} dismissed.`
      }
      return `${name} hired as ${role} (level ${level}, ${cost} gp).`
    }

    case 'minister_upkeep': {
      const ministers = p.ministers as number
      if (ministers === 0) return 'Minister upkeep: no ministers.'
      const retainedCount = p.retainedCount as number
      const dismissedCount = p.dismissedCount as number
      const goldPaid = p.goldPaid as number
      if (dismissedCount === 0) {
        return `Minister upkeep: ${retainedCount}/${ministers} retained, ${goldPaid} gp paid.`
      }
      const dismissals = (p.dismissals ?? []) as { name: string; role: string; cost: number }[]
      const names = dismissals.map((d) => `${d.name} (${MINISTER_ROLE_LABEL[d.role as keyof typeof MINISTER_ROLE_LABEL] ?? d.role})`).join(', ')
      return `Minister upkeep: ${retainedCount}/${ministers} retained, ${goldPaid} gp paid. ${dismissedCount} resigned: ${names}.`
    }

    case 'sell_goods_pending': {
      const resource = p.resource as ResourceKey
      const quantity = p.quantity as number
      const ratio = p.effectiveRatio as number
      const revenue = p.goldRevenue as number
      const check = p.check as { natural: number; total: number; critFail: boolean }
      const conspiracy = (p.bankerConspiracy as boolean) ?? false
      const tags = [
        check.critFail ? 'crit fail' : null,
        conspiracy ? 'banker conspiracy: ratio doubled' : null,
      ].filter(Boolean)
      const tagText = tags.length > 0 ? ` (${tags.join('; ')})` : ''
      return `Sold ${quantity} ${RESOURCE_LABELS[resource] ?? resource} at ${ratio}:1 → ${revenue} gp arriving next season (rolled ${check.natural}, total ${check.total})${tagText}.`
    }

    case 'sell_goods_complete': {
      const resource = p.resource as ResourceKey
      const quantity = p.quantity as number
      const revenue = p.goldRevenue as number
      return `Sale completed: ${revenue} gp received for ${quantity} ${RESOURCE_LABELS[resource] ?? resource}.`
    }

    case 'buy_goods': {
      const resource = p.resource as ResourceKey
      const delivered = p.delivered as number
      const bonus = (p.bonus as number) ?? 0
      const cost = p.cost as number
      const check = p.check as { natural: number; total: number }
      const dc = p.dc as number
      const bonusTag = bonus > 0 ? ` (+${bonus} free)` : ''
      return `Bought ${delivered} ${RESOURCE_LABELS[resource] ?? resource}${bonusTag} for ${cost} gp (rolled ${check.natural}, total ${check.total} vs DC ${dc}).`
    }

    case 'buy_goods_failed': {
      const resource = p.resource as ResourceKey
      const quantity = p.quantity as number
      const check = p.check as { natural: number; total: number; critFail: boolean }
      const dc = p.dc as number
      const reason = p.reason as string | undefined
      if (reason === 'crit_fail_cannot_pay_markup') {
        const markup = p.critFailMarkup as number
        return `Buy ${quantity} ${RESOURCE_LABELS[resource] ?? resource} — merchant demanded +${markup} gp markup; you couldn't pay. Deal off.`
      }
      const tag = check.critFail ? ' (crit fail!)' : ''
      return `Buy ${quantity} ${RESOURCE_LABELS[resource] ?? resource} — not for sale (rolled ${check.natural}, total ${check.total} vs DC ${dc})${tag}.`
    }

    case 'buy_goods_gouged': {
      const resource = p.resource as ResourceKey
      const delivered = p.delivered as number
      const cost = p.cost as number
      const markup = p.critFailMarkup as number
      const totalCost = p.totalCost as number
      return `Bought ${delivered} ${RESOURCE_LABELS[resource] ?? resource} for ${totalCost} gp (gouged: ${cost} base + ${markup} markup, crit fail).`
    }

    case 'buy_from_traveling_merchant': {
      const resource = p.resource as ResourceKey
      const unitsReceived = p.unitsReceived as number
      return `Bought ${unitsReceived} ${RESOURCE_LABELS[resource] ?? resource} from a traveling merchant for 1 gp.`
    }

    case 'sell_to_traveling_merchant': {
      const kind = p.kind as 'resource' | 'trade_good'
      const unitsHandedOver = p.unitsHandedOver as number
      if (kind === 'resource') {
        const resource = p.resource as ResourceKey
        return `Sold ${unitsHandedOver} ${RESOURCE_LABELS[resource] ?? resource} to a traveling merchant for 1 gp.`
      }
      const tradeGood = p.tradeGood as TradeGoodKind
      return `Sold ${unitsHandedOver} ${TRADE_GOOD_LABEL[tradeGood] ?? tradeGood} to a traveling merchant for 1 gp.`
    }

    case 'raise_taxes': {
      const delta = (p.delta ?? {}) as Partial<Record<ResourceKey, number>>
      const loyaltyDelta = p.loyaltyDelta as number
      const gains = Object.entries(delta)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `+${v} ${RESOURCE_LABELS[k as ResourceKey] ?? k}`)
        .join(', ')
      const gainText = gains.length > 0 ? gains : 'no resources gained (pools too small)'
      return `Raise Taxes: ${gainText}. Commoner loyalty ${loyaltyDelta}.`
    }

    case 'raise_loans': {
      const granted = p.granted as number
      const desired = p.desired as number
      const interest = p.interestPerSeason as number
      const check = p.check as { natural: number; total: number }
      const dc = p.dc as number
      const tag = granted < desired ? ` (asked ${desired})` : ''
      return `Raise Loans: borrowed ${granted} gp${tag}, ${interest} gp/season interest (rolled ${check.natural}, total ${check.total} vs DC ${dc}).`
    }

    case 'raise_loans_refused': {
      const desired = p.desired as number
      const check = p.check as { natural: number; total: number; critFail: boolean }
      const dc = p.dc as number
      const tag = check.critFail ? ' (crit fail!)' : ''
      return `Raise Loans: refused — wanted ${desired} gp but rolled ${check.natural}, total ${check.total} vs DC ${dc}${tag}.`
    }

    case 'loan_repaid': {
      const payment = p.payment as number
      const remaining = (p.remaining as number) ?? 0
      const cleared = (p.cleared as boolean) ?? remaining === 0
      return cleared
        ? `Loan repaid: paid ${payment} gp, loan cleared.`
        : `Loan partial payment: ${payment} gp paid, ${remaining} gp principal remaining.`
    }

    case 'seasonal_interest': {
      const loans = p.loans as number
      if (loans === 0) return 'Loan interest: no outstanding loans.'
      const paidCount = p.paidCount as number
      const skippedCount = p.skippedCount as number
      const totalPaid = p.totalPaid as number
      if (skippedCount === 0) {
        return `Loan interest: paid ${totalPaid} gp on ${paidCount} loan${paidCount === 1 ? '' : 's'}.`
      }
      return `Loan interest: paid ${totalPaid} gp on ${paidCount} loan${paidCount === 1 ? '' : 's'}, ${skippedCount} missed for lack of gold.`
    }

    case 'trade_goods_started': {
      const kind = p.kind as string
      const seasons = p.seasons as number
      const strongholdKind = p.strongholdKind as string
      const areaId = p.areaId as string
      return `Started producing ${kind.replace(/_/g, ' ')} at ${strongholdKind} on ${areaLabel(realm, areaId)} — ${seasons} season${seasons === 1 ? '' : 's'}.`
    }

    case 'trade_goods_complete': {
      const kind = p.kind as string
      const popReturned = (p.popReturned as number | undefined) ?? 0
      const popTag = popReturned > 0 ? ` ${popReturned} craftsm${popReturned === 1 ? 'an' : 'en'} returned home.` : ''
      return `${kind.replace(/_/g, ' ')} produced — added to trade-goods inventory.${popTag}`
    }

    case 'trade_goods_sold': {
      const kind = (p.kind as string).replace(/_/g, ' ')
      const qty = p.quantity as number
      const price = p.salePrice as number
      const revenue = p.goldRevenue as number
      return `Sold ${qty} ${kind} for ${revenue} gp (${price} gp/unit).`
    }

    default:
      return e.type
  }
}
