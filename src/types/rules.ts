import type { Database } from './database'

// ============================================================
// Type aliases re-exported from the generated DB types
// ============================================================
export type RealmScale = Database['public']['Enums']['realm_scale']
export type Season = Database['public']['Enums']['season']
export type ClimateTemplate = Database['public']['Enums']['climate_template']
export type Terrain = Database['public']['Enums']['terrain_type']
export type Race = Database['public']['Enums']['race']
export type StrongholdKind = Database['public']['Enums']['stronghold_kind']
export type MineResource = Database['public']['Enums']['mine_resource']

// ============================================================
// Resources
// ============================================================
// The 10 resource types tracked in a realm's resource_pool JSONB column.
export type ResourceKey =
  | 'food'
  | 'lumber'
  | 'stone'
  | 'gold'
  | 'copper'
  | 'iron'
  | 'silver'
  | 'gold_metal'
  | 'mithral'
  | 'adamantine'

export type ResourcePool = Record<ResourceKey, number>

// Conversion: how many units of `resource` are worth 1 gold unit.
export const RESOURCE_GOLD_RATIO: Record<ResourceKey, number> = {
  food: 20,
  lumber: 15,
  stone: 12,
  gold: 1, // gold is the base
  copper: 10,
  iron: 10,
  silver: 5,
  gold_metal: 1, // gold-metal nuggets — 1:1 with gold currency
  mithral: 0.5, // 1 mithral = 2 gold → 0.5 mithral per gold
  adamantine: 1 / 3, // 1 adamantine = 3 gold
}

export const EMPTY_RESOURCE_POOL: ResourcePool = {
  food: 0,
  lumber: 0,
  stone: 0,
  gold: 0,
  copper: 0,
  iron: 0,
  silver: 0,
  gold_metal: 0,
  mithral: 0,
  adamantine: 0,
}

// ============================================================
// Stronghold tiers (homebrew stacking system)
// ============================================================
export type StrongholdTier = 1 | 2 | 3
export type StrongholdTrack = 'habitation' | 'fortification' | 'resource' | 'addon'

interface StrongholdMeta {
  track: StrongholdTrack
  tier?: StrongholdTier
  source: 'official' | 'homebrew'
}

export const STRONGHOLD_META: Record<StrongholdKind, StrongholdMeta> = {
  // Habitation (tier-1 city, tier-2 town, tier-3 village)
  city: { track: 'habitation', tier: 1, source: 'official' },
  town: { track: 'habitation', tier: 2, source: 'official' },
  village: { track: 'habitation', tier: 3, source: 'official' },
  // Fortification (citadel is homebrew)
  citadel: { track: 'fortification', tier: 1, source: 'homebrew' },
  castle: { track: 'fortification', tier: 2, source: 'official' },
  keep: { track: 'fortification', tier: 3, source: 'official' },
  // Resource
  mine: { track: 'resource', source: 'official' },
  // Add-ons (attach to a settlement)
  wall: { track: 'addon', source: 'official' },
  marketplace: { track: 'addon', source: 'official' },
  port: { track: 'addon', source: 'official' },
  craftsmens_guild: { track: 'addon', source: 'official' },
  wizards_academy: { track: 'addon', source: 'official' },
  grand_temple: { track: 'addon', source: 'official' },
}

// Per-area slot caps by realm scale (homebrew)
export const SLOT_CAPS: Record<RealmScale, Record<StrongholdTier, number>> = {
  empire:  { 1: 1, 2: 3, 3: 9 },
  kingdom: { 1: 1, 2: 2, 3: 5 },
  barony:  { 1: 1, 2: 1, 3: 2 },
}

/**
 * Settlement-cap bonus contributed by each stronghold kind on top of the
 * area's base terrain cap. From the rules digest §2.3 / §2.3.4. Bonuses
 * stack additively on the same tile.
 *
 *   Village +1, Town +2, City +4 (habitation track)
 *   Keep    +1, Castle +1, Citadel +2 (fortifications include some quartering)
 *   Mine, add-ons (wall/marketplace/port/guild/academy/temple): no cap bonus
 */
export const STRONGHOLD_SETTLEMENT_CAP_BONUS: Record<StrongholdKind, number> = {
  village: 1,
  town: 2,
  city: 4,
  keep: 1,
  castle: 1,
  citadel: 2,
  mine: 0,
  wall: 0,
  marketplace: 0,
  port: 0,
  craftsmens_guild: 0,
  wizards_academy: 0,
  grand_temple: 0,
}

export const MINE_CAP: Record<RealmScale, number> = {
  empire: 2,
  kingdom: 2,
  barony: 1,
}

// ============================================================
// Realm scale conversions
// ============================================================
export interface ScaleDefinition {
  populationUnit: number  // people per population unit
  goldUnit: number        // gp per gold unit
  landUnit: number        // sq mi per area
}

export const SCALE_DEFINITIONS: Record<RealmScale, ScaleDefinition> = {
  barony:  { populationUnit: 100,    goldUnit: 1_000,   landUnit: 1 },
  kingdom: { populationUnit: 1_000,  goldUnit: 10_000,  landUnit: 20 },
  empire:  { populationUnit: 10_000, goldUnit: 100_000, landUnit: 400 },
}

// ============================================================
// Land production (per area, per harvest)
// ============================================================
export interface TerrainProduction {
  food?: number
  lumber?: number
  stone?: number
  mineral?: number       // resolved later via mineral d100 table
  gold?: number          // for swamps and (random-roll) ruins
  randomGold?: { dice: 'd10'; modifier: number }  // e.g. ruins: 1d10 - 4 gold
}

export interface TerrainStats {
  production: TerrainProduction
  harvestPop: number     // pop units required to activate production
  settlementCap: number  // base pop units that can live there
}

export const TERRAIN_STATS: Record<Terrain, TerrainStats> = {
  forest:    { production: { lumber: 4, food: 1 }, harvestPop: 1, settlementCap: 2 },
  hills:     { production: {}, harvestPop: 2, settlementCap: 2 }, // 2 stone OR 1 mineral — chosen at harvest
  plains:    { production: { food: 4 }, harvestPop: 1, settlementCap: 4 },
  mountains: { production: {}, harvestPop: 2, settlementCap: 2 }, // 2 mineral OR 4 stone
  ruins:     { production: { randomGold: { dice: 'd10', modifier: -4 } }, harvestPop: 2, settlementCap: 2 },
  swamp:     { production: { food: 1, gold: 1 }, harvestPop: 2, settlementCap: 1 },
  wasteland: { production: {}, harvestPop: 0, settlementCap: 1 },
  water:     { production: { food: 2 }, harvestPop: 1, settlementCap: 1 },
}

// ============================================================
// Starting domain templates (chapter 1)
// ============================================================
export const STARTING_TEMPLATES: Record<ClimateTemplate, Record<Terrain, number>> = {
  standard: {
    forest: 5, hills: 2, plains: 10, mountains: 0,
    ruins: 0, swamp: 1, wasteland: 0, water: 2,
  },
  coastal: {
    forest: 2, hills: 0, plains: 7, mountains: 0,
    ruins: 0, swamp: 3, wasteland: 0, water: 8,
  },
  desert: {
    forest: 2, hills: 2, plains: 8, mountains: 2,
    ruins: 0, swamp: 0, wasteland: 5, water: 1,
  },
  forest: {
    forest: 10, hills: 2, plains: 6, mountains: 0,
    ruins: 1, swamp: 1, wasteland: 0, water: 0,
  },
  hills: {
    forest: 4, hills: 8, plains: 6, mountains: 2,
    ruins: 0, swamp: 0, wasteland: 0, water: 0,
  },
  mountains: {
    forest: 3, hills: 2, plains: 4, mountains: 6,
    ruins: 1, swamp: 0, wasteland: 4, water: 0,
  },
}
