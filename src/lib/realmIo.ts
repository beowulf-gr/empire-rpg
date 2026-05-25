/**
 * realmIo — converts between Supabase row shapes and the engine's RealmState.
 *
 * Two layers:
 *
 *   1. Pure converters (synchronous, side-effect-free):
 *        realmStateFromRows  — stitch DB rows into a RealmState
 *        realmStateToRows    — split a RealmState back into row payloads
 *      These are unit-tested via round-trip checks.
 *
 *   2. I/O wrappers (async, talk to Supabase):
 *        loadRealm   — fetch a realm + dependents and assemble
 *        saveRealm   — persist a RealmState (UPDATE realm + reconcile child rows)
 *
 * Why a settings JSONB column on realms?
 *   The engine carries some per-realm state that doesn't justify its own
 *   table for MVP — commonerLoyalty, weatherModifier, lastYearFoodBalance,
 *   and pendingEvents (events that haven't been folded into turn_history yet).
 *   Stuffing them into a typed JSONB blob is the simplest pragmatic choice.
 *   Phase 3a+ will promote anything that needs proper relational structure
 *   (e.g. loyalty groups will get their own table when we build full morale
 *   mechanics).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '../types/database'
import type { ResourceKey, ResourcePool } from '../types/rules'
import { EMPTY_RESOURCE_POOL } from '../types/rules'
import type {
  AreaState,
  EndingStory,
  OriginStory,
  PopulationStack,
  RealmState,
  StrongholdState,
  TurnEvent,
} from '../rules/state'
import type { ActionLog, OngoingAction } from '../rules/actions/types'
import type { LoyaltyGroup, RulerStats } from '../rules/state'
import type { MilitaryUnit } from '../rules/actions/military'
import type { Minister } from '../rules/actions/ministers'
import type { Loan } from '../rules/actions/loans'
import type { TradeGoodInventory } from '../rules/actions/tradeGoods'
import { EMPTY_TRADE_GOODS } from '../rules/actions/tradeGoods'
import type { MoraleBribe } from '../rules/actions/bribery'

// ============================================================
// Types: row shapes from the generated DB types + payloads we send back
// ============================================================

type DB = Database
type Tables = DB['public']['Tables']

export type RealmRow = Tables['realms']['Row']
export type AreaRow = Tables['areas']['Row']
export type PopulationRow = Tables['populations']['Row']
export type StrongholdRow = Tables['strongholds']['Row']

export type RealmInsert = Tables['realms']['Insert']
export type AreaInsert = Tables['areas']['Insert']
export type PopulationInsert = Tables['populations']['Insert']
export type StrongholdInsert = Tables['strongholds']['Insert']

/** What's stored in realms.settings. Engine-only state that lives outside the rest of the schema. */
export interface RealmSettings {
  /**
   * Phase 3a+: tracks per-group loyalty. For backward-compat, parseSettings
   * synthesizes a single commoners group from a legacy commonerLoyalty number
   * if loyaltyGroups isn't present in the JSONB.
   */
  loyaltyGroups: LoyaltyGroup[]
  lastFoodCrisis: 'none' | 'shortage' | 'famine'
  roadAreaIds: string[]
  militaryUnits: MilitaryUnit[]
  ministers: Minister[]
  loans: Loan[]
  tradeGoods: TradeGoodInventory
  pendingBribes: MoraleBribe[]
  weatherModifier: number
  lastYearFoodBalance: number
  orcIdlePenalty: number
  ruler: RulerStats
  pendingEvents: TurnEvent[]
  actionsThisSeason: ActionLog[]
  ongoingActions: OngoingAction[]
}

// ============================================================
// Pure converters — DB rows → RealmState
// ============================================================

/**
 * Assembles a RealmState from a realm row plus its child rows.
 * Pure: no I/O, no async — just shaping.
 */
export function realmStateFromRows(
  realm: RealmRow,
  areaRows: AreaRow[],
  populationRows: PopulationRow[],
  strongholdRows: StrongholdRow[],
): RealmState {
  const settings = parseSettings(realm.settings)

  return {
    id: realm.id,
    ownerId: realm.owner_id,
    name: realm.name,
    scale: realm.scale,
    climateTemplate: realm.climate_template,
    year: realm.current_year,
    season: realm.current_season,
    coverImageUrl: realm.cover_image_url,
    rulerPortraitUrl: realm.ruler_portrait_url,
    originStory: parseOriginStory(realm.origin_story),
    endingStory: parseEndingStory(realm.ending_story),
    resources: parseResourcePool(realm.resource_pool),

    areas: areaRows
      .map(areaFromRow)
      // Stable sort by position so the dashboard renders deterministically
      .sort(byPosition),

    populations: populationRows.map(populationFromRow),
    strongholds: strongholdRows.map(strongholdFromRow),

    loyaltyGroups: settings.loyaltyGroups,
    lastFoodCrisis: settings.lastFoodCrisis,
    roadAreaIds: settings.roadAreaIds,
    militaryUnits: settings.militaryUnits,
    ministers: settings.ministers,
    loans: settings.loans,
    tradeGoods: settings.tradeGoods,
    pendingBribes: settings.pendingBribes,
    weatherModifier: settings.weatherModifier,
    lastYearFoodBalance: settings.lastYearFoodBalance,
    orcIdlePenalty: settings.orcIdlePenalty,
    ruler: settings.ruler,
    pendingEvents: settings.pendingEvents,
    actionsThisSeason: settings.actionsThisSeason,
    ongoingActions: settings.ongoingActions,
  }
}

function areaFromRow(row: AreaRow): AreaState {
  // Legacy realms persisted the sentinel string 'stone' in mineral_result to
  // indicate "mountain failed its survey, produces stone forever." The new
  // model treats those areas as un-surveyed (empty list) so the player can
  // re-roll by toggling to mineral mode. Multi-mineral mountains are stored
  // as comma-separated keys (e.g. "iron,silver"); old single-mineral saves
  // round-trip fine because "iron" splits to ["iron"].
  const mineralResults =
    !row.mineral_result || row.mineral_result === 'stone'
      ? []
      : row.mineral_result.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  const harvestMode =
    row.harvest_mode === 'stone' || row.harvest_mode === 'mineral' ? row.harvest_mode : null
  return {
    id: row.id,
    terrain: row.terrain,
    secondaryTerrain: row.secondary_terrain,
    mineralResults,
    harvestMode,
    positionX: row.position_x,
    positionY: row.position_y,
  }
}

function populationFromRow(row: PopulationRow): PopulationStack {
  return {
    id: row.id,
    race: row.race,
    count: row.count,
    homeAreaId: row.home_area_id,
    workAreaId: row.work_area_id,
  }
}

function strongholdFromRow(row: StrongholdRow): StrongholdState {
  return {
    id: row.id,
    areaId: row.area_id,
    kind: row.kind,
    parentStrongholdId: row.parent_stronghold_id,
    mineResourceType: row.mine_resource_type,
    // The DB column is plain text; cast to our union for the engine.
    source: (row.source === 'homebrew' ? 'homebrew' : 'official'),
    name: row.name,
  }
}

function byPosition(a: AreaState, b: AreaState): number {
  if (a.positionY !== b.positionY) return a.positionY - b.positionY
  return a.positionX - b.positionX
}

// ============================================================
// Pure converters — RealmState → DB row payloads
// ============================================================

export interface RealmRowPayloads {
  realm: RealmInsert
  areas: AreaInsert[]
  populations: PopulationInsert[]
  strongholds: StrongholdInsert[]
}

/**
 * Splits a RealmState into row-shaped payloads ready to be INSERTed/UPDATEd.
 * Engine-only state (loyalty, weather, food balance, pending events) gets
 * packed into the realms.settings JSONB.
 */
export function realmStateToRows(state: RealmState): RealmRowPayloads {
  const settings: RealmSettings = {
    loyaltyGroups: state.loyaltyGroups,
    lastFoodCrisis: state.lastFoodCrisis,
    roadAreaIds: state.roadAreaIds,
    militaryUnits: state.militaryUnits,
    ministers: state.ministers,
    loans: state.loans,
    tradeGoods: state.tradeGoods,
    pendingBribes: state.pendingBribes,
    weatherModifier: state.weatherModifier,
    lastYearFoodBalance: state.lastYearFoodBalance,
    orcIdlePenalty: state.orcIdlePenalty,
    ruler: state.ruler,
    pendingEvents: state.pendingEvents,
    actionsThisSeason: state.actionsThisSeason,
    ongoingActions: state.ongoingActions,
  }

  return {
    realm: {
      id: state.id,
      owner_id: state.ownerId,
      name: state.name,
      scale: state.scale,
      climate_template: state.climateTemplate,
      current_year: state.year,
      current_season: state.season,
      cover_image_url: state.coverImageUrl,
      ruler_portrait_url: state.rulerPortraitUrl,
      origin_story: serializeOriginStory(state.originStory),
      ending_story: serializeEndingStory(state.endingStory),
      resource_pool: state.resources as unknown as Json,
      settings: settings as unknown as Json,
    },
    areas: state.areas.map((a) => ({
      id: a.id,
      realm_id: state.id,
      terrain: a.terrain,
      secondary_terrain: a.secondaryTerrain,
      // Encode the mineral list as a comma-separated string in the existing
      // text column so we don't need a schema migration. Empty list → null
      // (un-surveyed); 1 mineral → "iron"; 2 → "iron,silver".
      mineral_result: a.mineralResults.length === 0 ? null : a.mineralResults.join(','),
      harvest_mode: a.harvestMode,
      position_x: a.positionX,
      position_y: a.positionY,
    })),
    populations: state.populations.map((p) => ({
      id: p.id,
      realm_id: state.id,
      race: p.race,
      count: p.count,
      home_area_id: p.homeAreaId,
      work_area_id: p.workAreaId,
    })),
    strongholds: state.strongholds.map((s) => ({
      id: s.id,
      realm_id: state.id,
      area_id: s.areaId,
      kind: s.kind,
      parent_stronghold_id: s.parentStrongholdId,
      mine_resource_type: s.mineResourceType,
      source: s.source,
      name: s.name ?? null,
    })),
  }
}

// ============================================================
// JSONB parsers — defensive against missing/malformed values
// ============================================================

/**
 * Reads the optional string field `key` from a JSON blob and normalises it to
 * `string | null`. Empty/whitespace-only strings are treated as null so we
 * round-trip clean values back into the DB.
 */
function readOptionalString(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = (raw as Record<string, unknown>)[key]
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length === 0 ? null : trimmed
}

/** Parses the `origin_story` jsonb column. Returns null if absent or unusable. */
function parseOriginStory(raw: Json | null): OriginStory | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const founding = readOptionalString(raw, 'founding')
  const rulerBackground = readOptionalString(raw, 'rulerBackground')
  const notableCircumstances = readOptionalString(raw, 'notableCircumstances')
  if (!founding && !rulerBackground && !notableCircumstances) return null
  return { founding, rulerBackground, notableCircumstances }
}

/** Parses the `ending_story` jsonb column. Returns null if absent or unusable. */
function parseEndingStory(raw: Json | null): EndingStory | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const outcome = readOptionalString(raw, 'outcome')
  const finalNote = readOptionalString(raw, 'finalNote')
  if (!outcome && !finalNote) return null
  return { outcome, finalNote }
}

/**
 * Converts an OriginStory/EndingStory back to the JSON shape stored in
 * the database. Returns null when no fields carry meaningful text so we
 * keep the column NULL instead of storing an empty object.
 */
function serializeOriginStory(s: OriginStory | null | undefined): Json | null {
  if (!s) return null
  const obj: Record<string, string> = {}
  if (s.founding && s.founding.trim()) obj.founding = s.founding.trim()
  if (s.rulerBackground && s.rulerBackground.trim()) obj.rulerBackground = s.rulerBackground.trim()
  if (s.notableCircumstances && s.notableCircumstances.trim()) obj.notableCircumstances = s.notableCircumstances.trim()
  return Object.keys(obj).length === 0 ? null : (obj as Json)
}

function serializeEndingStory(s: EndingStory | null | undefined): Json | null {
  if (!s) return null
  const obj: Record<string, string> = {}
  if (s.outcome && s.outcome.trim()) obj.outcome = s.outcome.trim()
  if (s.finalNote && s.finalNote.trim()) obj.finalNote = s.finalNote.trim()
  return Object.keys(obj).length === 0 ? null : (obj as Json)
}

function parseResourcePool(raw: Json): ResourcePool {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_RESOURCE_POOL }
  }
  const out: ResourcePool = { ...EMPTY_RESOURCE_POOL }
  for (const key of Object.keys(EMPTY_RESOURCE_POOL) as ResourceKey[]) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === 'number') out[key] = v
  }
  return out
}

const DEFAULT_RULER: RulerStats = {
  name: 'The Ruler',
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  diplomacy: 0,
  knowledgeEconomics: 0,
}

function parseRuler(v: unknown): RulerStats {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULT_RULER }
  const o = v as Record<string, unknown>
  const num = (key: string, fallback: number): number =>
    typeof o[key] === 'number' && Number.isFinite(o[key]) ? (o[key] as number) : fallback
  return {
    name: typeof o.name === 'string' && o.name.trim() ? o.name : DEFAULT_RULER.name,
    strength: num('strength', 10),
    dexterity: num('dexterity', 10),
    constitution: num('constitution', 10),
    intelligence: num('intelligence', 10),
    wisdom: num('wisdom', 10),
    charisma: num('charisma', 10),
    diplomacy: num('diplomacy', 0),
    knowledgeEconomics: num('knowledgeEconomics', 0),
  }
}

function parseSettings(raw: Json): RealmSettings {
  const defaults: RealmSettings = {
    loyaltyGroups: [],
    lastFoodCrisis: 'none',
    orcIdlePenalty: 0,
    ruler: { ...DEFAULT_RULER },
    roadAreaIds: [],
    militaryUnits: [],
    ministers: [],
    loans: [],
    tradeGoods: { ...EMPTY_TRADE_GOODS },
    pendingBribes: [],
    weatherModifier: 0,
    lastYearFoodBalance: 0,
    pendingEvents: [],
    actionsThisSeason: [],
    ongoingActions: [],
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults
  const r = raw as Record<string, unknown>

  // Backward-compat: if a legacy realm has commonerLoyalty but no loyaltyGroups,
  // synthesize a single commoners group seeded with the legacy score so existing
  // realms don't suddenly reset to 0 loyalty.
  let loyaltyGroups: LoyaltyGroup[]
  if (Array.isArray(r.loyaltyGroups)) {
    loyaltyGroups = r.loyaltyGroups as LoyaltyGroup[]
  } else if (typeof r.commonerLoyalty === 'number') {
    loyaltyGroups = [
      {
        id: 'legacy-commoners',
        kind: 'commoners',
        label: 'General population',
        baseWillSave: 2,
        score: r.commonerLoyalty,
      },
    ]
  } else {
    loyaltyGroups = []
  }

  const lastFoodCrisis =
    r.lastFoodCrisis === 'famine' || r.lastFoodCrisis === 'shortage'
      ? r.lastFoodCrisis
      : 'none'

  const roadAreaIds = Array.isArray(r.roadAreaIds) ? (r.roadAreaIds as string[]) : []
  // Backfill equipmentGp/magicGp on legacy units (3j added these fields).
  const militaryUnits = Array.isArray(r.militaryUnits)
    ? (r.militaryUnits as Partial<MilitaryUnit>[]).map((u) => ({
        ...u,
        equipmentGp: typeof u.equipmentGp === 'number' ? u.equipmentGp : 100,
        magicGp: typeof u.magicGp === 'number' ? u.magicGp : 0,
      })) as MilitaryUnit[]
    : []
  const ministers = Array.isArray(r.ministers) ? (r.ministers as Minister[]) : []
  const loans = Array.isArray(r.loans) ? (r.loans as Loan[]) : []
  const tradeGoods: TradeGoodInventory = (() => {
    const v = r.tradeGoods
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...EMPTY_TRADE_GOODS }
    const obj = v as Record<string, unknown>
    return {
      exotic_items: typeof obj.exotic_items === 'number' ? obj.exotic_items : 0,
      magic_items: typeof obj.magic_items === 'number' ? obj.magic_items : 0,
      weapons_and_armor: typeof obj.weapons_and_armor === 'number' ? obj.weapons_and_armor : 0,
      wooden_goods: typeof obj.wooden_goods === 'number' ? obj.wooden_goods : 0,
    }
  })()

  const pendingBribes = Array.isArray(r.pendingBribes)
    ? (r.pendingBribes as MoraleBribe[])
    : []

  return {
    loyaltyGroups,
    lastFoodCrisis,
    roadAreaIds,
    militaryUnits,
    ministers,
    loans,
    tradeGoods,
    pendingBribes,
    weatherModifier: typeof r.weatherModifier === 'number' ? r.weatherModifier : 0,
    lastYearFoodBalance:
      typeof r.lastYearFoodBalance === 'number' ? r.lastYearFoodBalance : 0,
    orcIdlePenalty:
      typeof r.orcIdlePenalty === 'number' ? Math.min(0, r.orcIdlePenalty) : 0,
    ruler: parseRuler(r.ruler),
    pendingEvents: Array.isArray(r.pendingEvents)
      ? (r.pendingEvents as TurnEvent[])
      : [],
    actionsThisSeason: Array.isArray(r.actionsThisSeason)
      ? (r.actionsThisSeason as ActionLog[])
      : [],
    ongoingActions: Array.isArray(r.ongoingActions)
      ? (r.ongoingActions as OngoingAction[])
      : [],
  }
}

// ============================================================
// I/O — talks to Supabase
// ============================================================

/**
 * Loads a complete RealmState from Supabase. Fetches the realm row plus all
 * dependent rows in parallel (4 queries), then stitches them together.
 *
 * Throws if any of the queries fail or the realm doesn't exist.
 */
export async function loadRealm(
  supabase: SupabaseClient<DB>,
  realmId: string,
): Promise<RealmState> {
  const [realmRes, areasRes, populationsRes, strongholdsRes] = await Promise.all([
    supabase.from('realms').select('*').eq('id', realmId).single(),
    supabase.from('areas').select('*').eq('realm_id', realmId),
    supabase.from('populations').select('*').eq('realm_id', realmId),
    supabase.from('strongholds').select('*').eq('realm_id', realmId),
  ])

  if (realmRes.error) throw realmRes.error
  if (areasRes.error) throw areasRes.error
  if (populationsRes.error) throw populationsRes.error
  if (strongholdsRes.error) throw strongholdsRes.error

  return realmStateFromRows(
    realmRes.data,
    areasRes.data ?? [],
    populationsRes.data ?? [],
    strongholdsRes.data ?? [],
  )
}

/**
 * Persists a RealmState to Supabase.
 *
 * Strategy:
 *   1. UPSERT the realm row (created on first save, updated thereafter).
 *   2. UPSERT all areas / strongholds — they have stable IDs, only fields
 *      like areas.mineral_result change between turns.
 *   3. Reconcile populations: UPSERT current stacks, DELETE any DB rows
 *      whose IDs aren't in the current state (e.g. a stack that hit 0 and
 *      was removed).
 *   4. (Phase 2c+ may add an explicit turn_history INSERT here.)
 *
 * Note: Supabase's JS client doesn't expose interactive transactions; each
 * call is its own statement. For MVP this is acceptable because the realm
 * is owned by one user and we don't have concurrent writers. If we ever
 * see race conditions we'll need to push this into a Postgres function.
 */
export async function saveRealm(
  supabase: SupabaseClient<DB>,
  state: RealmState,
): Promise<void> {
  const payloads = realmStateToRows(state)

  // 1. UPSERT the realm row.
  const realmRes = await supabase.from('realms').upsert(payloads.realm)
  if (realmRes.error) throw realmRes.error

  // 2. UPSERT areas, then DELETE any rows on the realm whose IDs no longer
  //    appear in the current state.
  if (payloads.areas.length > 0) {
    const r = await supabase.from('areas').upsert(payloads.areas)
    if (r.error) throw r.error
  }
  const areaIds = payloads.areas.map((a) => a.id).filter((v): v is string => !!v)
  const delAreasQuery = supabase.from('areas').delete().eq('realm_id', state.id)
  const delAreasRes = areaIds.length > 0
    ? await delAreasQuery.not('id', 'in', `(${areaIds.join(',')})`)
    : await delAreasQuery
  if (delAreasRes.error) throw delAreasRes.error

  // 3. UPSERT strongholds, then DELETE missing.
  if (payloads.strongholds.length > 0) {
    const r = await supabase.from('strongholds').upsert(payloads.strongholds)
    if (r.error) throw r.error
  }
  const strIds = payloads.strongholds.map((s) => s.id).filter((v): v is string => !!v)
  const delStrQuery = supabase
    .from('strongholds')
    .delete()
    .eq('realm_id', state.id)
  const delStrRes = strIds.length > 0
    ? await delStrQuery.not('id', 'in', `(${strIds.join(',')})`)
    : await delStrQuery
  if (delStrRes.error) throw delStrRes.error

  // 4. UPSERT populations, then DELETE missing (stacks that hit 0).
  if (payloads.populations.length > 0) {
    const r = await supabase.from('populations').upsert(payloads.populations)
    if (r.error) throw r.error
  }
  const popIds = payloads.populations.map((p) => p.id).filter((v): v is string => !!v)
  const delPopQuery = supabase
    .from('populations')
    .delete()
    .eq('realm_id', state.id)
  const delPopRes = popIds.length > 0
    ? await delPopQuery.not('id', 'in', `(${popIds.join(',')})`)
    : await delPopQuery
  if (delPopRes.error) throw delPopRes.error
}
