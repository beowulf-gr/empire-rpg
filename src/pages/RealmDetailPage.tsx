import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useRealm } from '../hooks/useRealm'
import { useEndSeason, type EndSeasonResult } from '../hooks/useEndSeason'
import { useClearPendingEvents } from '../hooks/useClearPendingEvents'
import type { Race, ResourceKey, ResourcePool, Season } from '../types/rules'
import {
  populationByRaceOnArea,
  strongholdDisplayName,
  totalPopulation,
  type RealmState,
  type StrongholdState,
  type TurnEvent,
} from '../rules/state'
import type { ActionDefinition, ActionId } from '../rules/actions/types'
import { ACTION_REGISTRY } from '../rules/actions/registry'
import { isLimitedActionExhausted } from '../rules/actions/limited'
import { ActionsSection } from '../components/actions/ActionsSection'
import { OngoingActionsSection } from '../components/actions/OngoingActionsSection'
import { LoyaltySection } from '../components/LoyaltySection'
import { RulerSection } from '../components/RulerSection'
import { AppShell } from '../components/AppShell'
import {
  SeasonTransitionDialog,
  formatTransitionTitle,
} from '../components/actions/SeasonTransitionDialog'
import { MoveSettlersPanel } from '../components/actions/panels/MoveSettlersPanel'
import { HarvestTerrainPanel } from '../components/actions/panels/HarvestTerrainPanel'
import { SurveyForNewVeinPanel } from '../components/actions/panels/SurveyForNewVeinPanel'
import { StrongholdNamingDialog } from '../components/actions/StrongholdNamingDialog'
import { OriginStoryDialog } from '../components/OriginStoryDialog'
import { TellOurStorySection } from '../components/TellOurStorySection'
import { BuildRoadsPanel } from '../components/actions/panels/BuildRoadsPanel'
import { BuildStrongholdPanel } from '../components/actions/panels/BuildStrongholdPanel'
import { ConvertTerrainPanel } from '../components/actions/panels/ConvertTerrainPanel'
import { MusterSoldiersPanel } from '../components/actions/panels/MusterSoldiersPanel'
import { HireSoldiersPanel } from '../components/actions/panels/HireSoldiersPanel'
import { RecruitMinistersPanel } from '../components/actions/panels/RecruitMinistersPanel'
import { RecruitSettlersPanel } from '../components/actions/panels/RecruitSettlersPanel'
import { LevelUpUnitPanel } from '../components/actions/panels/LevelUpUnitPanel'
import { SellGoodsPanel } from '../components/actions/panels/SellGoodsPanel'
import { BuyGoodsPanel } from '../components/actions/panels/BuyGoodsPanel'
import { RaiseTaxesPanel } from '../components/actions/panels/RaiseTaxesPanel'
import { RaiseLoansPanel } from '../components/actions/panels/RaiseLoansPanel'
import { ProduceTradeGoodsPanel } from '../components/actions/panels/ProduceTradeGoodsPanel'
import { SellTradeGoodsPanel } from '../components/actions/panels/SellTradeGoodsPanel'
import { OutfitUnitPanel } from '../components/actions/panels/OutfitUnitPanel'
import { MilitarySection } from '../components/MilitarySection'
import { MinistersSection } from '../components/MinistersSection'
import { TradeGoodsSection } from '../components/TradeGoodsSection'
import { TradeRoutesSection } from '../components/TradeRoutesSection'
import { ImageUpload } from '../components/ImageUpload'
import {
  useUploadRealmImage,
  useRemoveRealmImage,
} from '../hooks/useUploadRealmImage'
import { SectionIcon } from '../components/SectionIcon'
import { AreaCard } from '../components/AreaCard'

// ============================================================
// Static labels
// ============================================================

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

const STRONGHOLD_BADGE: Record<string, { letter: string; title: string }> = {
  village:           { letter: 'V',  title: 'Village' },
  town:              { letter: 'T',  title: 'Town' },
  city:              { letter: 'C',  title: 'City' },
  keep:              { letter: 'K',  title: 'Keep' },
  castle:            { letter: 'Ca', title: 'Castle' },
  citadel:           { letter: 'Ci', title: 'Citadel' },
  mine:              { letter: 'M',  title: 'Mine' },
  wall:              { letter: 'W',  title: 'Wall' },
  marketplace:       { letter: 'Mk', title: 'Marketplace' },
  port:              { letter: 'P',  title: 'Port' },
  craftsmens_guild:  { letter: 'G',  title: "Craftsmen's Guild" },
  wizards_academy:   { letter: 'A',  title: "Wizards' Academy" },
  grand_temple:      { letter: 'Te', title: 'Grand Temple' },
}

const RACE_LABELS: Record<Race, string> = {
  humans: 'Humans',
  dwarves: 'Dwarves',
  elves: 'Elves',
  gnomes: 'Gnomes',
  goblins: 'Goblins',
  halflings: 'Halflings',
  orcs: 'Orcs',
  undead: 'Undead',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const NEXT_SEASON: Record<Season, Season> = {
  spring: 'summer',
  summer: 'fall',
  fall: 'winter',
  winter: 'spring',
}

// Which interactive panel is currently open, if any. Each new panel added in
// later steps gets a string id here.
type OpenPanel = null | 'move_settlers' | 'harvest_terrain' | 'survey_for_new_vein' | 'build_roads' | 'build_stronghold' | 'convert_terrain' | 'muster_soldiers' | 'hire_soldiers' | 'recruit_ministers' | 'recruit_settlers' | 'sell_goods' | 'buy_goods' | 'raise_taxes' | 'raise_loans' | 'produce_trade_goods' | 'sell_trade_goods' | 'outfit_unit' | 'level_up_unit'

// ============================================================
// Page
// ============================================================

export function RealmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: realm, isLoading, error } = useRealm(id)
  const endSeason = useEndSeason()
  const clearEvents = useClearPendingEvents()
  const uploadImage = useUploadRealmImage()
  const removeImage = useRemoveRealmImage()

  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'pending'; events: TurnEvent[] }
    | { kind: 'transition'; result: EndSeasonResult }
  >(null)
  // True when the post-creation naming dialog (or a manual "Rename
  // strongholds" click) is open.
  const [showNamingDialog, setShowNamingDialog] = useState(false)
  // True when the post-creation origin-story dialog is queued to open
  // (waits for the stronghold-naming dialog to close first so the player
  // sees one modal at a time).
  const [originStoryQueued, setOriginStoryQueued] = useState(false)
  // True when the player clicked "Edit prologue" from the top bar — opens
  // the same dialog with edit-mode copy and the existing values pre-filled.
  const [editingPrologue, setEditingPrologue] = useState(false)

  // Auto-open the post-creation dialogs. CreateRealmPage redirects with
  // `?name-strongholds=1&origin-story=1` after a successful mutateAsync;
  // we read each param once and clear it so a hard refresh doesn't re-trigger.
  useEffect(() => {
    if (!realm) return
    const wantsNaming = searchParams.get('name-strongholds') === '1'
    const wantsOrigin = searchParams.get('origin-story') === '1'
    if (wantsNaming) setShowNamingDialog(true)
    if (wantsOrigin) setOriginStoryQueued(true)
    if (wantsNaming || wantsOrigin) {
      const next = new URLSearchParams(searchParams)
      next.delete('name-strongholds')
      next.delete('origin-story')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realm?.id])

  // Surface bootSpring events on first realm load
  useEffect(() => {
    if (realm && realm.pendingEvents.length > 0 && !dialog) {
      setDialog({ kind: 'pending', events: realm.pendingEvents })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realm?.id, realm?.pendingEvents.length])

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-[var(--ink-soft)] italic">Gathering your realm's records…</p>
      </AppShell>
    )
  }
  if (error) {
    return (
      <AppShell>
        <p className="text-[var(--rust)]" role="alert">
          Failed to load realm: {error.message}
        </p>
      </AppShell>
    )
  }
  if (!realm || !id) return null

  // Pre-end-season validation — counts ALL races, not just humans, since
  // any unallocated pop fails spring's Assign Population check.
  const unallocatedPop = realm
    ? realm.populations
        .filter((p) => p.homeAreaId === null)
        .reduce((s, p) => s + p.count, 0)
    : 0
  const idlePop = realm
    ? realm.populations
        .filter((p) => p.workAreaId === null)
        .reduce((s, p) => s + p.count, 0)
    : 0
  // Block End Season any time there's an unhoused unit. Housing and work
  // are now independent (post-decoupling), so the player can end up with
  // unhoused workers in any season — e.g. assigning idle units to a
  // full-capacity area auto-fails the auto-house. The book also requires
  // every unit to have a home before spring's Assign Population check;
  // forcing this every season keeps the realm in a always-housed state
  // and prevents drift.
  const blockOnUnallocated = unallocatedPop > 0

  const handleEndSeason = async () => {
    if (blockOnUnallocated) {
      // UI prevents the click anyway; defensive guard
      return
    }
    if (idlePop > 0) {
      const ok = window.confirm(
        `${idlePop} population unit${idlePop === 1 ? ' is' : 's are'} idle (no work assignment). Idle pop produces nothing. End season anyway?`,
      )
      if (!ok) return
    }
    const result = await endSeason.mutateAsync({ realmId: id })
    setDialog({ kind: 'transition', result })
  }

  const handleDialogDismiss = async () => {
    if (dialog?.kind === 'pending') {
      await clearEvents.mutateAsync(id)
    }
    setDialog(null)
  }

  // Action button → panel router.
  const handleTakeAction = (action: ActionDefinition) => {
    if (action.id === 'move_settlers') setOpenPanel('move_settlers')
    else if (action.id === 'harvest_terrain') setOpenPanel('harvest_terrain')
    else if (action.id === 'survey_for_new_vein') setOpenPanel('survey_for_new_vein')
    else if (action.id === 'build_roads') setOpenPanel('build_roads')
    else if (action.id === 'build_stronghold') setOpenPanel('build_stronghold')
    else if (action.id === 'convert_terrain') setOpenPanel('convert_terrain')
    else if (action.id === 'muster_soldiers') setOpenPanel('muster_soldiers')
    else if (action.id === 'level_up_unit') setOpenPanel('level_up_unit')
    else if (action.id === 'hire_soldiers') setOpenPanel('hire_soldiers')
    else if (action.id === 'recruit_ministers') setOpenPanel('recruit_ministers')
    else if (action.id === 'recruit_settlers') setOpenPanel('recruit_settlers')
    else if (action.id === 'sell_goods') setOpenPanel('sell_goods')
    else if (action.id === 'buy_goods') setOpenPanel('buy_goods')
    else if (action.id === 'raise_taxes') setOpenPanel('raise_taxes')
    else if (action.id === 'raise_loans') setOpenPanel('raise_loans')
    else if (action.id === 'produce_trade_goods') setOpenPanel('produce_trade_goods')
    else if (action.id === 'sell_trade_goods') setOpenPanel('sell_trade_goods')
    else if (action.id === 'outfit_unit') setOpenPanel('outfit_unit')
  }

  // Index strongholds by area for the read-only display grid
  const strongholdsByArea = new Map<string, StrongholdState[]>()
  for (const s of realm.strongholds) {
    const list = strongholdsByArea.get(s.areaId) ?? []
    list.push(s)
    strongholdsByArea.set(s.areaId, list)
  }

  // Compute which actions show as "completed" in the menu this season.
  //   - Auto/obligatory actions: marked completed once they fire (per season).
  //   - Limited discretionary actions: rely on isLimitedActionExhausted so
  //     multi-use Limited (Recruit Settlers, Level Up Unit) only show as done
  //     once their per-season cap is fully consumed, not after the first use.
  //   - All other actions: never marked completed (can be repeated).
  const takenIds = new Set<ActionId>()
  for (const action of ACTION_REGISTRY) {
    if (
      action.descriptors.includes('limited') &&
      action.kind === 'interactive' &&
      isLimitedActionExhausted(realm, action.id)
    ) {
      takenIds.add(action.id)
    }
  }
  if (realm.season === 'spring') {
    takenIds.add('orcs_idle_penalty')
    takenIds.add('morale_upkeep')
    takenIds.add('elves_emigration')
    takenIds.add('population_upkeep')
    takenIds.add('assign_population')
    takenIds.add('military_upkeep')
    takenIds.add('minister_upkeep')
  }
  // seasonal_interest fires every season-start, mark as completed in all seasons.
  takenIds.add('seasonal_interest')
  if (realm.season === 'fall') {
    takenIds.add('random_fall_events')
    takenIds.add('harvest_crops')
    takenIds.add('allocate_food')
  }

  return (
    <AppShell
      topBar={
        <div className="flex items-center gap-4">
          <Link to="/realms" className="hover:text-[var(--wine)] transition-colors">
            ← All realms
          </Link>
          <span className="text-[var(--ink-faint)]">·</span>
          <Link
            to={`/realms/${id}/edit`}
            className="text-[var(--ink-soft)] hover:text-[var(--wine)] transition-colors"
            title="Free-form edits that bypass the rules engine"
          >
            DM tools
          </Link>
          <span className="text-[var(--ink-faint)]">·</span>
          {/* Plain <a> because we want a real new-tab navigation; basename from
              the BrowserRouter doesn't apply to raw anchors, so we explicitly
              prepend BASE_URL (which is '/empire/' in prod, '/' in dev). */}
          <a
            href={`${import.meta.env.BASE_URL}realms/${id}/log`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--ink-soft)] hover:text-[var(--wine)] transition-colors"
            title="View the full season-by-season chronicle (opens in a new tab)"
          >
            Game log ↗
          </a>
          <span className="text-[var(--ink-faint)]">·</span>
          <button
            type="button"
            onClick={() => setEditingPrologue(true)}
            className="text-[var(--ink-soft)] hover:text-[var(--wine)] transition-colors"
            title="Edit the optional prologue (used by Tell our story)"
          >
            Edit prologue
          </button>
        </div>
      }
    >
      {/* Cover banner — FB-style wide image at the top of the realm page. */}
      <div className="mb-6 -mt-2">
        <ImageUpload
          currentUrl={realm.coverImageUrl}
          onUpload={(file) =>
            uploadImage.mutate({
              realmId: realm.id,
              ownerId: realm.ownerId,
              kind: 'cover',
              file,
            })
          }
          onRemove={() =>
            removeImage.mutate({ realmId: realm.id, kind: 'cover' })
          }
          pending={
            (uploadImage.isPending && uploadImage.variables?.kind === 'cover') ||
            (removeImage.isPending && removeImage.variables?.kind === 'cover')
          }
          error={
            uploadImage.error && uploadImage.variables?.kind === 'cover'
              ? uploadImage.error.message
              : removeImage.error && removeImage.variables?.kind === 'cover'
                ? removeImage.error.message
                : null
          }
          shape="banner"
          placeholderLabel="Upload a cover photo for this realm"
          alt={`Cover image for ${realm.name}`}
        />
      </div>

      <header className="mb-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="empire-heading text-4xl font-serif font-bold">{realm.name}</h1>
          <div className="text-sm text-[var(--ink-soft)] capitalize tabular">
            {realm.scale} · Year <strong className="text-[var(--ink)]">{realm.year}</strong> · {realm.season}
          </div>
        </div>
      </header>

      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void handleEndSeason()}
            disabled={endSeason.isPending || blockOnUnallocated}
            title={
              blockOnUnallocated
                ? `${unallocatedPop} pop unit${unallocatedPop === 1 ? '' : 's'} need a home — use Move Settlers before ending the season.`
                : undefined
            }
            className="empire-button px-5 py-2.5 rounded-md font-medium"
          >
            {endSeason.isPending ? 'Resolving…' : `End ${cap(realm.season)}`}
          </button>
          {endSeason.error && (
            <span className="text-sm text-[var(--rust)]" role="alert">
              {endSeason.error.message}
            </span>
          )}
        </div>
        {(unallocatedPop > 0 || idlePop > 0) && (
          <div className="mt-2 text-sm space-y-0.5">
            {unallocatedPop > 0 && (
              <div className="text-[var(--rust)] font-medium">
                <strong>{unallocatedPop}</strong> settler{unallocatedPop === 1 ? '' : 's'} need a home — use Move Settlers.
                <span className="text-[var(--ink-soft)] ml-1">
                  (must be housed before you can end the season)
                </span>
              </div>
            )}
            {idlePop > 0 && unallocatedPop === 0 && (
              <div className="text-amber-700 dark:text-amber-400">
                <strong>{idlePop}</strong> worker{idlePop === 1 ? ' is' : 's are'} idle — use Harvest Terrain to assign work.
              </div>
            )}
          </div>
        )}
      </div>

      <section className="mb-8">
        <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
          <SectionIcon name="resources" />
          Resources
        </h2>
        <ResourceGrid pool={realm.resources} />
      </section>

      <RulerSection realm={realm} />

      <PopulationSection realm={realm} />

      <LoyaltySection realm={realm} realmId={realm.id} />

      <MilitarySection realm={realm} />

      <MinistersSection realm={realm} />

      <TradeGoodsSection realm={realm} />

      <TradeRoutesSection realm={realm} />

      <ActionsSection
        season={realm.season}
        takenIds={takenIds}
        onTakeAction={handleTakeAction}
      />

      <OngoingActionsSection ongoing={realm.ongoingActions} />

      <AreasSection realm={realm} strongholdsByArea={strongholdsByArea} />

      <StrongholdsSection realm={realm} onRename={() => setShowNamingDialog(true)} />

      <TellOurStorySection realm={realm} />

      {/* Panels */}
      {openPanel === 'move_settlers' && (
        <MoveSettlersPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'harvest_terrain' && (
        <HarvestTerrainPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'survey_for_new_vein' && (
        <SurveyForNewVeinPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'build_roads' && (
        <BuildRoadsPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'build_stronghold' && (
        <BuildStrongholdPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'convert_terrain' && (
        <ConvertTerrainPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'muster_soldiers' && (
        <MusterSoldiersPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'hire_soldiers' && (
        <HireSoldiersPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'recruit_ministers' && (
        <RecruitMinistersPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'recruit_settlers' && (
        <RecruitSettlersPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'level_up_unit' && (
        <LevelUpUnitPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'sell_goods' && (
        <SellGoodsPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'buy_goods' && (
        <BuyGoodsPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'raise_taxes' && (
        <RaiseTaxesPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'raise_loans' && (
        <RaiseLoansPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'produce_trade_goods' && (
        <ProduceTradeGoodsPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'sell_trade_goods' && (
        <SellTradeGoodsPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'outfit_unit' && (
        <OutfitUnitPanel
          realm={realm}
          realmId={realm.id}
          onClose={() => setOpenPanel(null)}
        />
      )}

      {/* Dialogs */}
      {dialog?.kind === 'pending' && (
        <SeasonTransitionDialog
          title={`${cap(realm.season)} of year ${realm.year}`}
          subtitle="Your reign begins. Here's what just happened."
          events={dialog.events}
          realm={realm}
          onDismiss={() => void handleDialogDismiss()}
          dismissing={clearEvents.isPending}
        />
      )}
      {dialog?.kind === 'transition' && (
        <SeasonTransitionDialog
          {...formatTransitionTitle(
            dialog.result.endedSeason,
            dialog.result.endedYear,
            NEXT_SEASON[dialog.result.endedSeason],
            dialog.result.endedSeason === 'winter'
              ? dialog.result.endedYear + 1
              : dialog.result.endedYear,
          )}
          events={dialog.result.events}
          realm={realm}
          onDismiss={() => setDialog(null)}
        />
      )}
      {showNamingDialog && (
        <StrongholdNamingDialog
          realm={realm}
          title="Name your strongholds"
          description="Give your starting strongholds names — the defaults are placeholders. You can rename them any time from the Strongholds section."
          onClose={() => setShowNamingDialog(false)}
        />
      )}
      {!showNamingDialog && originStoryQueued && (
        <OriginStoryDialog
          realm={realm}
          onClose={() => setOriginStoryQueued(false)}
        />
      )}
      {editingPrologue && !originStoryQueued && (
        <OriginStoryDialog
          realm={realm}
          onClose={() => setEditingPrologue(false)}
          title="Edit your realm's prologue"
          description="Used only if you later ask Empire to 'Tell our story.' Update any field, leave blanks where you'd rather not say, or clear all three to remove the prologue entirely."
        />
      )}
    </AppShell>
  )
}

// ============================================================
// Areas section — read-only display. The work +/- mode stays until 2f.5.
// ============================================================

function AreasSection({
  realm,
  strongholdsByArea,
}: {
  realm: RealmState
  strongholdsByArea: Map<string, StrongholdState[]>
}) {
  const isSpring = realm.season === 'spring'
  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="areas" />
        Areas <span className="text-sm text-stone-500 font-normal">({realm.areas.length})</span>
      </h2>
      <p className="text-sm text-stone-500 mb-3">
        Each tile shows residents and workers. Use <strong>Move Settlers</strong> to relocate
        residents; use <strong>Harvest Terrain</strong> to set work assignments.{' '}
        {!isSpring && (
          <span className="text-amber-600 dark:text-amber-400">
            Both actions are Spring-only.
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {realm.areas.map((area, i) => (
          <AreaCard
            key={area.id}
            area={area}
            realm={realm}
            strongholds={strongholdsByArea.get(area.id) ?? []}
            indexLabel={`#${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}

// ============================================================
// Population section
// ============================================================

function PopulationSection({ realm }: { realm: RealmState }) {
  const total = totalPopulation(realm)
  const unallocated = realm.populations
    .filter((p) => p.homeAreaId === null)
    .reduce((s, p) => s + p.count, 0)
  const idle = realm.populations
    .filter((p) => p.workAreaId === null)
    .reduce((s, p) => s + p.count, 0)
  const working = total - idle

  const byRace = new Map<Race, number>()
  for (const s of realm.populations) {
    byRace.set(s.race, (byRace.get(s.race) ?? 0) + s.count)
  }

  return (
    <section className="mb-8">
      <h2 className="empire-subheading text-xl font-serif font-semibold mb-3 flex items-center gap-2">
        <SectionIcon name="population" />
        Population
      </h2>
      <div className="text-stone-700 dark:text-stone-300 mb-3">
        <span className="text-2xl font-semibold">{total}</span>
        <span className="text-sm text-stone-500 ml-2">units</span>
        <span className="text-sm text-stone-500 ml-3">
          {unallocated > 0 && (
            <span className="text-red-600 dark:text-red-400 font-semibold">
              {unallocated} unallocated
            </span>
          )}
          {unallocated > 0 && ' · '}
          {working} working · {idle} idle
        </span>
      </div>
      {byRace.size > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {Array.from(byRace.entries()).map(([race, count]) => (
            <span
              key={race}
              className="border border-stone-200 dark:border-stone-800 rounded px-2 py-1 bg-white dark:bg-stone-900"
            >
              {RACE_LABELS[race]} <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

// ============================================================
// Strongholds section
// ============================================================

function StrongholdsSection({
  realm,
  onRename,
}: {
  realm: RealmState
  onRename: () => void
}) {
  const areasById = new Map(realm.areas.map((a) => [a.id, a]))
  const areaIndexById = new Map<string, number>()
  realm.areas.forEach((a, i) => areaIndexById.set(a.id, i + 1))

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="empire-subheading text-xl font-serif font-semibold flex items-center gap-2">
          <SectionIcon name="strongholds" />
          Strongholds <span className="text-sm text-stone-500 font-normal">({realm.strongholds.length})</span>
        </h2>
        {realm.strongholds.length > 0 && (
          <button
            onClick={onRename}
            className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline-offset-2 hover:underline"
          >
            Rename strongholds
          </button>
        )}
      </div>
      {realm.strongholds.length === 0 ? (
        <p className="text-stone-500 text-sm">None yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded">
          {realm.strongholds.map((s) => {
            const area = areasById.get(s.areaId)
            const idx = areaIndexById.get(s.areaId)
            const races = area ? populationByRaceOnArea(realm, s.areaId) : {}
            const raceTags = Object.entries(races)
              .map(([race, n]) => `${n} ${RACE_LABELS[race as Race].toLowerCase()}`)
              .join(', ')
            const kindLabel = STRONGHOLD_BADGE[s.kind]?.title ?? s.kind.replace(/_/g, ' ')
            const displayName = strongholdDisplayName(s, realm.strongholds)
            const hasCustomName = !!s.name && s.name.trim().length > 0
            return (
              <li key={s.id} className="px-4 py-3 flex items-baseline justify-between">
                <div>
                  <span className="font-medium">{displayName}</span>
                  {hasCustomName && (
                    <span className="ml-2 text-xs text-stone-500 capitalize">{kindLabel}</span>
                  )}
                  {s.source === 'homebrew' && (
                    <span className="ml-2 text-xs text-stone-500">(homebrew)</span>
                  )}
                </div>
                <div className="text-sm text-stone-500">
                  {area ? (
                    <>
                      on a <span className="capitalize">{area.terrain}</span> tile
                      {idx !== undefined && <span className="ml-1">(#{idx})</span>}
                      {raceTags && <span className="ml-2">· {raceTags} living here</span>}
                    </>
                  ) : (
                    'unattached'
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ============================================================
// Resource grid
// ============================================================

function ResourceGrid({ pool }: { pool: ResourcePool }) {
  const entries = (Object.entries(pool) as [ResourceKey, number][]).filter(([, v]) => v > 0)
  if (entries.length === 0) {
    return <p className="text-stone-500 text-sm">Empty treasury.</p>
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="border border-stone-200 dark:border-stone-800 rounded px-3 py-2 text-sm bg-white dark:bg-stone-900"
        >
          <div className="text-stone-500 text-xs">{RESOURCE_LABELS[key]}</div>
          <div className="font-semibold">{value}</div>
        </div>
      ))}
    </div>
  )
}
