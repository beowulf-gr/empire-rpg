/**
 * The Action Registry — a static list of every action the player can take.
 *
 * Sources:
 *   - "official": from chapter 1 of AEG's Empire (rules-digest.md §6 and §7).
 *   - "homebrew": added by us to fill UX gaps the book doesn't address (e.g.
 *     Move Settlers — the book treats settlement placement as implicit; in a
 *     digital UI the player needs an explicit way to relocate residents).
 *
 * `bookText` strings are CONDENSED PARAPHRASES suitable for in-app reading.
 * They lean on the OCR'd extract (Empire-ocr.pdf pp. 6–33) and rules-digest.md.
 * For full fidelity the user can replace them later with verbatim text from
 * the physical book.
 */

import type { ActionDefinition } from './types'

export const ACTION_REGISTRY: ActionDefinition[] = [
  // ============================================================
  // Spring — obligatory chain (auto-resolved at season start)
  // ============================================================

  {
    id: 'orcs_idle_penalty',
    name: 'Orcs Idle-Warriors Penalty',
    category: 'spring',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      "If fewer than half your orcs are mustered as warriors, their loyalty drifts -1 per year (cumulative). Half-or-more mustered → recovers +1/year (floors at 0).",
    bookText:
      "For each year that passes without at least half the orc population units used as soldiers, the orcs suffer a cumulative -1 penalty to loyalty. Reduce this penalty by 1 for each year that the orcs are mustered. This penalty cannot be transformed into a bonus.",
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  {
    id: 'morale_upkeep',
    name: 'Morale Upkeep',
    category: 'spring',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Determine attitudes of people, army, ministers; possible loyalty changes and revolt checks.',
    bookText:
      'The first action for the spring phase is to determine the current attitudes of the people, army, ministers, and others who have loyalty scores. Each group must make a loyalty check with a DC determined by the DM. The DC reflects the realm\'s current situation: blatant mismanagement and famine = DC 20, food shortages and brutal policies = DC 15, excessive taxation = DC 10, average year = DC 5, benevolent leadership = DC 0, brilliant golden age = DC -5. Beat the DC by 10+ → +2 loyalty; pass = no change; fail by 1-9 → -1; fail by 10+ → -2. The ruler may spend 1 gp to give any one group a +2 bonus (or +5 to an individual); on success this also adds +1 loyalty as bribery (bread and circuses) repairs reputation. If any group\'s loyalty drops below -5, they revolt or plot against the crown.',
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  {
    id: 'elves_emigration',
    name: 'Elves Emigration',
    category: 'spring',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      "Each elf population stack rolls d20 + (commoners loyalty doubled if negative) vs DC 5. On a fail, one elf unit drifts away.",
    bookText:
      "There is a chance each spring that the elves wander away from their current home to seek new lands. Each spring, the elves check for emigration as if their loyalty was +0. If their loyalty slips below zero, double it for purposes of the emigration check.",
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  {
    id: 'population_upkeep',
    name: 'Population Upkeep / Recruitment',
    category: 'spring',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Roll d20 + food balance + loyalty/2 to determine if your population grows or declines this year.',
    bookText:
      'This action determines if your population naturally grows or falls and if you can attract more settlers. First determine the shortfall or surplus in food production from the previous fall — total shortfall is a penalty to your growth check, surplus is a bonus. Next, divide the commoners\' loyalty score in half (rounded up) and use it as a loyalty modifier. Roll a d20 and add those modifiers, then consult the population growth table: 21+ = +10%, 11-20 = +5%, 1-10 = no change, 0 to -10 = -5%, -11 or lower = -10%. Apply to your total population pool. After growth, you may attempt up to three settler checks (one per race) to attract new arrivals: roll d20 + Charisma mod + commoner loyalty, +4 per gp spent, then consult settler check table.',
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  {
    id: 'assign_population',
    name: 'Assign Population',
    category: 'spring',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Verify your population fits within total living space. Overcrowding causes loyalty penalties.',
    bookText:
      'After determining your population\'s total growth and any additions due to settlers moving into the region, you must check to make sure that you have enough living space to fit all your people. Total up the living space provided by each area and stronghold under your control. If the result is greater than or equal to your population pool, you have enough living space. On the other hand, if the total living space is less than your population pool, your realm faces overcrowding. Subtract your available living space from your population pool and divide the result in half. The total is a negative modifier that you must immediately apply to your commoners\' loyalty score.',
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  {
    id: 'military_upkeep',
    name: 'Military Upkeep',
    category: 'spring',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Pay yearly food and gold for each military unit. Units that can\'t be supported automatically disband.',
    bookText:
      'Each spring you must pay food and gold to support your military units. Mustered soldiers (created via Muster Soldiers) cost food and gold per the Military Unit Upkeep table — Medium-size = 1 food + 1 gold, scaling up by size, plus an additional 1 gp per level above 1st. Mercenaries (Hire Soldiers) cost their pay rate (2 × CR × pay multiplier from the Mercenary Pay Rate Table) plus food per the Mercenary Food Table. If the realm cannot afford a unit\'s upkeep, that unit automatically disbands.',
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },
  {
    id: 'minister_upkeep',
    name: 'Minister Upkeep',
    category: 'spring',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Pay each minister\'s annual stipend (1 gp per 3 levels). Unpaid ministers resign immediately.',
    bookText:
      'Each spring you must pay your ministers\' annual stipend — 1 gold unit for every three minister levels they have, rounded up. Treasurer, General, and Prime Minister are tracked separately. If you cannot afford a minister\'s stipend, they resign at once and their loyalty group is removed; the role becomes vacant until you take Recruit Ministers again. While a role is vacant, the ruler covers it personally and suffers a -2 circumstance penalty on related checks.',
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },
  {
    id: 'seasonal_interest',
    name: 'Loan Interest',
    category: 'generic',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Pay 10% interest on each outstanding loan, except in the season the loan was taken.',
    bookText:
      'You pay 10% interest on each outstanding loan, due at the beginning of every season except the season the loan was taken. If you cannot afford to pay a loan\'s interest, the payment is missed; missing four seasons in a row triggers the banker conspiracy — you must sell double the normal number of resources for the same gold until the loan is paid off.',
    availability: { seasons: ['spring', 'summer', 'fall', 'winter'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },
  {
    id: 'random_spring_events',
    name: 'Random Spring Events',
    category: 'spring',
    descriptors: ['obligatory'],
    shortDescription: 'Roll d20 for the random event that befalls your realm at the end of spring.',
    bookText:
      'At the end of the spring phase you must roll on the random events table (d20): 1-2 Incursion (1d4 enemy units invade in a random season this year — roll on the threat table for type/size); 3-5 Infestation (random resource loses 1d4 × 10%); 6-8 Poor Weather (-10% to all production for the rest of the year); 9-15 No event; 16-18 Good Weather (+10% to all production for the rest of the year); 19-20 Beneficial Find (a mineral area also produces gold, OR +1d4 gold to the treasury). The cleric class can modify this roll.',
    availability: { seasons: ['spring'] },
    kind: 'auto',
    obligatoryTiming: 'season_end',
    source: 'official',
    implemented: true,
  },

  // ============================================================
  // Spring — discretionary (interactive panels)
  // ============================================================

  {
    id: 'move_settlers',
    name: 'Move Settlers',
    category: 'generic',
    descriptors: [],
    shortDescription:
      'Relocate population units between home areas. Available year-round so workers returning from construction or production can be re-housed promptly. Homebrew interactive action.',
    bookText:
      'Homebrew addition. The book\'s Assign Population action only checks total living space, leaving the placement of each population unit to the GM\'s mental model. In the digital realm-management view it\'s useful to see — and adjust — where each unit lives. This action lets you pick a source area and a destination area and move N residents between them. By default their work assignment moves with them; you can opt to keep their existing work area (so they commute). Available all seasons (homebrew) so the player can re-home workers that return from in-flight ongoing actions in summer or fall.',
    availability: { seasons: ['spring', 'summer', 'fall', 'winter'] },
    kind: 'interactive',
    panel: 'MoveSettlers',
    source: 'homebrew',
    implemented: true,
  },

  {
    id: 'survey_for_new_vein',
    name: 'Survey for New Vein',
    category: 'spring',
    descriptors: ['construction'],
    shortDescription:
      'Commit 1 population unit for 2 seasons to prospect an already-surveyed hills or mountain area for an additional ore vein. Pass d100 (≥95 hills, ≥90 mountains), then roll the minerals table — a new mineral is added to the area.',
    bookText:
      "You can assign 1 population unit to spend 2 seasons surveying the mountains for new veins. Roll a d100. On a result of 90 or higher, you can roll again to see if you found a new vein of ore. For hills, the same procedure applies but the threshold is 95 or higher.",
    cost: { population: 1, seasons: 2 },
    availability: {
      seasons: ['spring'],
      restricted: [
        { season: 'summer', penalty: '+1 season duration' },
        { season: 'fall', penalty: '+2 seasons duration' },
      ],
      prohibited: ['winter'],
    },
    kind: 'interactive',
    panel: 'SurveyForNewVein',
    source: 'official',
    implemented: true,
  },

  {
    id: 'harvest_terrain',
    name: 'Harvest Terrain',
    category: 'spring',
    descriptors: ['construction'],
    shortDescription:
      'Assign population to harvest specific land areas this year. Each area must have its minimum workforce to produce resources at fall harvest.',
    bookText:
      'By assigning a population unit to an area, you can produce raw materials for sale or to supply construction efforts. The required workforce depends on terrain: plains/forest/water need 1 unit; hills/mountains/swamp/ruins need 2 units. Production per area: forest 4 lumber + 1 food; hills 2 stone OR 1 mineral; plains 4 food; mountains 2 mineral OR 4 stone; swamp 1 food + 1 gold; water 2 food; ruins 1d10 - 4 gold (random). Race modifiers apply (elves +1 lumber +1 food in forest, dwarves +1 stone or +0.5 mineral in hills/mountains, goblins -1 to each resource produced, undead 0 food, etc.). You can only assign harvest during spring.',
    cost: { population: 1, variable: true, note: 'Population per area depends on terrain.' },
    availability: { seasons: ['spring'] },
    kind: 'interactive',
    panel: 'HarvestTerrain',
    source: 'official',
    implemented: true,
  },

  {
    id: 'build_roads',
    name: 'Build Roads',
    category: 'spring',
    descriptors: ['construction'],
    shortDescription:
      'Connect settlements with a road that crosses up to 4 areas. 2 seasons; if not starting from a stronghold or existing road, +1 pop and +1 lumber.',
    bookText:
      'Roads are critical to your realm\'s development. Without them, you cannot engage in trade and may have problems moving troops and supplies during war. With this action, you can build a road that crosses up to four areas. If the road does not start at a stronghold or a previously built road, increase the costs by 1 population unit and 1 lumber unit. Population units: 1; seasons: 2; resources: 1 stone unit, 2 lumber units.',
    cost: { population: 1, stone: 1, lumber: 2, seasons: 2 },
    availability: {
      seasons: ['spring'],
      prohibited: ['winter'],
      restricted: [
        { season: 'summer', penalty: '+1 season duration' },
        { season: 'fall', penalty: '+2 seasons duration' },
      ],
    },
    kind: 'interactive',
    panel: 'BuildRoads',
    source: 'official',
    implemented: true,
  },

  {
    id: 'build_stronghold',
    name: 'Build Stronghold',
    category: 'spring',
    descriptors: ['construction'],
    shortDescription:
      'Erect a Village, Town, City, Keep, Castle, Citadel, Mine, Wall, Marketplace, Port, Guild, Academy, or Temple on an area.',
    bookText:
      'Building a stronghold requires different levels of time and effort to complete. Costs vary by stronghold type: Village 2 stone / 2 gold / 2 lumber / 1 pop / 2 seasons; Town 5/5/5/1/2; City 10/10/10/2/4; Keep 5/4/4/1/2; Castle 10/8/8/2/4; Citadel (homebrew) 20/16/16/4/8; Mine 4/3/3/1/2; Wall 2/1/2/1/2; Marketplace 0/2/2/1/2; Port 0/2/4/1/2; Craftsmen\'s Guild 0/2/2/1/2; Wizards\' Academy 0/4/2/1/2 (+1 gp/year upkeep); Grand Temple 4/4/4/1/4 (+1 gp/year per temple). Wall, Marketplace, Port, Guild, Academy, Temple are add-ons that attach to a Town or City. Strongholds can be upgraded along their tier track (Village→Town→City; Keep→Castle→Citadel) by paying the new tier\'s full cost.',
    cost: { variable: true, note: 'Varies by stronghold type — see book.' },
    availability: {
      seasons: ['spring'],
      prohibited: ['winter'],
      restricted: [
        { season: 'summer', penalty: '+1 season duration' },
        { season: 'fall', penalty: '+2 seasons duration' },
      ],
    },
    kind: 'interactive',
    panel: 'BuildStronghold',
    source: 'official',
    implemented: true,
  },

  {
    id: 'convert_terrain',
    name: 'Convert Terrain',
    category: 'spring',
    descriptors: ['construction'],
    shortDescription:
      'Transform a wasteland area into its secondary terrain type (plains, forest, etc.). 2 seasons + costs.',
    bookText:
      'You can convert an area of wasteland terrain to a different type if the area lists a secondary terrain type. By spending the necessary resources, you convert the area from wasteland to its secondary type. A road must connect the area to a stronghold, or it must be adjacent to one. Otherwise, increase the resources needed by 5 lumber units and the time needed to 4 seasons. Population units: 2; seasons: 2; resources: 3 lumber units, 2 food units.',
    cost: { population: 2, lumber: 3, food: 2, seasons: 2 },
    availability: {
      seasons: ['spring'],
      prohibited: ['winter'],
      restricted: [
        { season: 'summer', penalty: '+1 season duration' },
        { season: 'fall', penalty: '+2 seasons duration' },
      ],
    },
    kind: 'interactive',
    panel: 'ConvertTerrain',
    source: 'official',
    implemented: true,
  },

  {
    id: 'hire_soldiers',
    name: 'Hire Soldiers',
    category: 'spring',
    descriptors: [],
    shortDescription:
      'Recruit mercenary units. Diplomacy check determines max CR/level; +2 per gp spent on the check.',
    bookText:
      'You seek out mercenaries to serve in your military for the coming year. Make a Diplomacy check; for each unit of gold spent on this action, gain a +2 circumstance bonus. Total check determines the max mercenary CR you can hire (DC 15 = CR ½, DC 25 = CR 1, +1 CR per +10 over 25). You can only hire mercenaries not directly opposed to your alignment on the good-evil axis. Mercenary pay is 2 × CR × pay multiplier (Solo ×⅛, Tiny ×¼, Small ×½, Medium-size ×1, Large ×2, Huge ×4, Gargantuan ×8, Colossal ×12). Pay must be made up front. Food upkeep also required.',
    cost: { gold: 1, variable: true, note: 'Diplomacy check + variable pay per unit.' },
    availability: {
      seasons: ['spring'],
      restricted: [
        { season: 'summer', penalty: '+5 to recruitment DCs' },
        { season: 'fall', penalty: '+5 to recruitment DCs' },
        { season: 'winter', penalty: '+5 to recruitment DCs' },
      ],
    },
    kind: 'interactive',
    panel: 'HireSoldiers',
    source: 'official',
    implemented: true,
  },

  {
    id: 'level_up_unit',
    name: 'Level Up Unit',
    category: 'spring',
    descriptors: ['limited'],
    shortDescription:
      "Spend (1 + current level) gp to raise a mustered unit's level by 1. Each unit may only be levelled once per year.",
    bookText:
      "During the spring phase, you can spend a number of gold units equal to one plus the unit's current level to increase its level. You cannot raise a unit's level by more than one per year. A high-level unit expects better pay than normal — you must pay it one additional gold unit per year per level above 1st.",
    cost: { variable: true, note: "Cost = 1 + unit's current level." },
    availability: { seasons: ['spring'] },
    kind: 'interactive',
    panel: 'LevelUpUnit',
    source: 'official',
    implemented: true,
  },

  {
    id: 'muster_soldiers',
    name: 'Muster Soldiers',
    category: 'spring',
    descriptors: [],
    shortDescription:
      'Convert 1 population unit + 1 gold into a Medium-size 1st-level warrior unit. Trained over Spring.',
    bookText:
      'This action allows you to create a new military unit by recruiting soldiers from your citizens. Each time you take this action, you convert a population unit into a Medium-size military unit (150 soldiers in Barony scale, 750 in Kingdom, 1500 in Empire). Spend 1 gold unit to equip the unit (100 gp per individual soldier worth of gear). Training takes the entire spring season. You must spend food from your stores to supply the unit during its first year. Mustered units are 1st-level warriors of the source race. Each year you can spend gold to raise the unit\'s level by 1.',
    cost: { population: 1, gold: 1, food: 1, seasons: 1 },
    availability: {
      seasons: ['spring'],
      restricted: [
        { season: 'summer', penalty: '+1 gold to train (out of season)' },
        { season: 'fall', penalty: '+1 gold to train' },
        { season: 'winter', penalty: '+1 gold to train' },
      ],
    },
    kind: 'interactive',
    panel: 'MusterSoldiers',
    source: 'official',
    implemented: true,
  },

  {
    id: 'recruit_settlers',
    name: 'Recruit Settlers',
    category: 'spring',
    descriptors: ['limited'],
    shortDescription:
      'Roll a settler check to attract new arrivals of a chosen race. Up to three checks per spring (each race only once); +4 to the roll per gold spent.',
    bookText:
      'After your population grows, you may attempt up to three settler checks per spring (one per race) to attract new arrivals to your domain. Each check is a d20 + Charisma modifier + Prime Minister bonus + commoner loyalty + 4 per gold unit spent on incentives. Consult the settler check table: ≤10 → no settlers; 11-15 → 1; 16-20 → 2; +5 above 20 → +1 more. New settlers join the unallocated pool — you must assign them a home (Move Settlers) and work (Harvest Terrain) before they contribute. Choose carefully: settlers will eat in fall, so attracting more than your food production supports invites famine.',
    cost: { variable: true, note: 'Variable gold "incentives"; 0 gp is allowed.' },
    availability: { seasons: ['spring'] },
    kind: 'interactive',
    panel: 'RecruitSettlers',
    source: 'official',
    implemented: true,
  },

  {
    id: 'recruit_ministers',
    name: 'Recruit Ministers',
    category: 'spring',
    descriptors: [],
    shortDescription:
      'Hire courtiers to fill Treasurer, General, or Prime Minister roles. 1 gp per 3 minister levels.',
    bookText:
      'You attempt to find and recruit a new minister to replace an old one or to help you manage your domain. For every gold unit you spend, you can recruit three levels worth of ministers. You immediately spend this money to gain the ministers\' services. Each year you must spend a gold unit for every three levels these aides have as ongoing payment. The three primary roles are Treasurer (handles finances and Knowledge(economics) checks), General (commands the army during war), and Prime Minister (the diplomatic/social face). Vacant roles incur a -2 circumstance penalty when the ruler covers them.',
    cost: { gold: 1, variable: true, note: '1 gold per 3 minister levels recruited.' },
    availability: {
      seasons: ['spring'],
      restricted: [
        { season: 'summer', penalty: '+1 gold to hire' },
        { season: 'fall', penalty: '+1 gold to hire' },
        { season: 'winter', penalty: '+1 gold to hire' },
      ],
    },
    kind: 'interactive',
    panel: 'RecruitMinisters',
    source: 'official',
    implemented: true,
  },

  {
    id: 'outfit_unit',
    name: 'Outfit Unit',
    category: 'generic',
    descriptors: [],
    shortDescription:
      'Issue Weapons & Armor or Magic Items trade goods to a military unit. Adds gp/soldier of gear; supply count scales with unit size.',
    bookText:
      'Magic Items and Weapons & Armor trade goods can be issued to military units instead of sold. The number of supply units required to grant 100 gp/soldier of gear depends on unit size: Solo 1/8, Tiny 1/4, Small 1/2, Medium-size 1, Large 2, Huge 4, Gargantuan 8, Colossal 16. Multiples scale linearly: 2× the listed amount → 200 gp/soldier. Better-equipped units are stronger in mass combat (chapter 2). Weapons & Armor and Magic Items track separately on the unit.',
    cost: { variable: true, note: 'Trade goods issued; varies by size and quantity.' },
    availability: { seasons: ['spring', 'summer', 'fall', 'winter'] },
    kind: 'interactive',
    panel: 'OutfitUnit',
    source: 'official',
    implemented: true,
  },

  // ============================================================
  // Summer
  // ============================================================

  {
    id: 'manage_forces',
    name: 'Manage Forces',
    category: 'summer',
    descriptors: ['obligatory'],
    shortDescription:
      'Allocate supplies for each military unit by linking them to a supplying stronghold.',
    bookText:
      'For each unit under your command, you must link it to a stronghold within your lands. That stronghold holds the unit\'s barracks and food. In the event of an invasion or war, that stronghold produces supply units in sufficient quantities to keep the units it supports going. Once you have allocated supplies, they remain in place until next summer. (See chapter 2 for more information on supplies during sieges and campaigns.)',
    availability: { seasons: ['summer'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: false,
  },

  {
    id: 'sack_enemy_lands',
    name: 'Sack Enemy Lands',
    category: 'summer',
    descriptors: [],
    shortDescription:
      'Loot a captured enemy stronghold for 1d6 gold. Stronghold is destroyed afterward.',
    bookText:
      'Your forces loot an enemy stronghold for money, treasure, and supplies. The occupying military unit must spend two days looting with a clear path between the point it occupies and your borders. After sacking, the stronghold is considered destroyed and you gain 1d6 gold units in loot, added to your resource pool. Prerequisite: your army must seize control of an enemy stronghold.',
    availability: { seasons: ['summer'] },
    kind: 'interactive',
    panel: 'SackEnemyLands',
    source: 'official',
    implemented: false,
  },

  // ============================================================
  // Fall — obligatory chain (auto, season_start)
  // ============================================================

  {
    id: 'random_fall_events',
    name: 'Random Fall Events',
    category: 'fall',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Roll d20 for the random event at the start of fall (same table as spring events).',
    bookText:
      'At the beginning of the fall phase, you must roll on the random events table — same as the spring random events check. Apply the result\'s effects immediately to your resource production for the rest of the year, before harvest is calculated.',
    availability: { seasons: ['fall'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  {
    id: 'harvest_crops',
    name: 'Harvest Crops',
    category: 'fall',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Add all production from worked areas to your resource pool. Mineral discoveries roll here.',
    bookText:
      'At the onset of fall, you immediately add to your resource pool all units produced on the land areas to which you have assigned people to work. For example, if you have four plains areas with workers on them you add 16 food units to your pool. All resources are immediately available for you to use. Mountains have their mineral type determined here on first harvest by rolling on the d100 minerals table.',
    availability: { seasons: ['fall'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  {
    id: 'allocate_food',
    name: 'Allocate Food',
    category: 'fall',
    descriptors: ['limited', 'obligatory'],
    shortDescription:
      'Spend 1 food per population unit. Shortfalls cause famine or food shortage flags.',
    bookText:
      'With this action, you must spend food units to feed your people for the coming year. If you do not have enough food, you risk revolt or at least a drop in your population\'s loyalty. If you have only half the food you need, your population suffers a famine (DC 20 morale check next spring). If you have only three-quarters of the necessary food supplies, your realm suffers from a food shortage (DC 10). Food allocated is considered spent. You must allocate one food unit per population unit in your domain or you suffer the penalties outlined above.',
    cost: { food: 1, variable: true, note: '1 food per population unit.' },
    availability: { seasons: ['fall'] },
    kind: 'auto',
    obligatoryTiming: 'season_start',
    source: 'official',
    implemented: true,
  },

  // ============================================================
  // Winter
  // ============================================================

  {
    id: 'adventure',
    name: 'Adventure',
    category: 'winter',
    descriptors: ['limited'],
    shortDescription:
      'Leave your post and adventure with companions. Best taken in winter; otherwise causes loyalty checks.',
    bookText:
      'When you take this action, you decide to leave your post and go adventuring with your companions. You cannot take any more realm management actions during this season, leaving your NPC followers to manage your realm in your place. The DM makes all decisions for them, some of which you may not agree with — find trustworthy followers. Winter is the best time to adventure as your absence has little effect on the realm. If you take this action during spring, summer, or fall, your followers must make loyalty checks (DC 15) or suffer a -1 penalty to their loyalty scores. The DC increases by 1 per consecutive season away.',
    availability: {
      seasons: ['winter'],
      restricted: [
        { season: 'spring', penalty: 'Followers DC 15 loyalty save or -1 loyalty' },
        { season: 'summer', penalty: 'Followers DC 15 loyalty save or -1 loyalty' },
        { season: 'fall',   penalty: 'Followers DC 15 loyalty save or -1 loyalty' },
      ],
    },
    kind: 'auto',
    source: 'official',
    implemented: false,
  },

  // ============================================================
  // Generic — any season
  // ============================================================

  {
    id: 'buy_goods',
    name: 'Buy Goods',
    category: 'generic',
    descriptors: [],
    shortDescription:
      'Purchase resource units at listed gold prices. Knowledge(economics) DC 10; +1 free unit per +10.',
    bookText:
      'You can purchase units of resources at their listed gold prices. To find any specific good, you or your minister of finance must make a Knowledge (economics) check against DC 10. Fail → item not for sale. Beat by 10+ → +1 free unit at the same price. You must have a port or roads connecting your strongholds to a market to use this action. Otherwise, merchants cannot reach you. Marketplace +2, Port +2 to economics rolls.',
    cost: { variable: true, note: 'Listed gold prices per resource type.' },
    availability: {
      seasons: ['spring', 'summer', 'fall'],
      restricted: [{ season: 'winter', penalty: '+5 to DC' }],
    },
    kind: 'interactive',
    panel: 'BuyGoods',
    source: 'official',
    implemented: true,
  },

  {
    id: 'sell_goods',
    name: 'Sell Goods',
    category: 'generic',
    descriptors: [],
    shortDescription:
      'Trade resource units for gold. Treasurer Knowledge(economics) check (DC 20) reduces conversion ratio by 1 per +10.',
    bookText:
      'With the assistance of your minister of finance, you may trade resource units for gold at the listed prices. With each transaction, your minister may attempt a Knowledge (economics) check (DC 20). On a success, reduce the units of a resource you must sell for 1 gold unit by 1; for every 10 over the DC, reduce by another 1 (minimum 1 unit per gold). On a natural 1 or check below 10, increase the conversion ratio by 1d4. Once you commit to selling, you must complete the transaction. Selling takes time; gold is not received until the start of the next season. Prerequisite: a stronghold connected to a port or trade center.',
    availability: {
      seasons: ['spring', 'summer', 'fall'],
      restricted: [{ season: 'winter', penalty: '+2 to conversion ratio' }],
    },
    kind: 'interactive',
    panel: 'SellGoods',
    source: 'official',
    implemented: true,
  },

  {
    id: 'produce_trade_goods',
    name: 'Produce Trade Goods',
    category: 'generic',
    descriptors: ['construction'],
    shortDescription:
      'Convert raw resources into finished goods at strongholds. Village = 1/season, Town = 4, City = 8.',
    bookText:
      'You may assign free population units to your strongholds for the purposes of transforming raw resources into finished products. Goods include: Exotic Items (mineral worth 1 gp + 1 pop + 1 season → 2 gp/unit), Magic Items (mineral worth 4 gp + 1 pop + 4 seasons → 6 gp/unit, requires Wizards\' Academy or elves), Weapons & Armor (5 iron + 1 pop + 1 season → 1 gp/unit, requires Craftsmen\'s Guild), Wooden Goods (10 lumber + 1 pop + 1 season → 1 gp/unit). Production capacity per stronghold per season: Village 1, Town 4, City 8. Magic Items and Weapons & Armor can also be issued to military units instead of sold (see Unit Outfitting Table).',
    cost: { variable: true, note: 'Varies by trade good type.' },
    availability: { seasons: ['spring', 'summer', 'fall', 'winter'] },
    kind: 'interactive',
    panel: 'ProduceTradeGoods',
    source: 'official',
    implemented: true,
  },

  {
    id: 'sell_trade_goods',
    name: 'Sell Trade Goods',
    category: 'generic',
    descriptors: [],
    shortDescription:
      'Convert finished trade goods (Exotic / Magic / Weapons / Wooden) to gold at their book sale prices. Instant.',
    bookText:
      'Sell finished trade goods to merchants at their listed prices. Exotic Items 2 gp/unit, Magic Items 6 gp/unit, Weapons & Armor 1 gp/unit, Wooden Goods 1 gp/unit. Goods are produced via Produce Trade Goods. Requires a trade route (Port or any road).',
    cost: { variable: true, note: 'No upfront cost; gold per unit per kind.' },
    availability: {
      seasons: ['spring', 'summer', 'fall', 'winter'],
    },
    kind: 'interactive',
    panel: 'SellTradeGoods',
    source: 'official',
    implemented: true,
  },
  {
    id: 'buy_from_traveling_merchant',
    name: 'Buy from Traveling Merchant',
    category: 'generic',
    descriptors: ['limited'],
    shortDescription:
      'Spend 1 gold for a small parcel from a wandering trader (e.g. 6 stone, 10 food, 7 lumber). No port or road needed. Forbidden in winter. Once per season.',
    bookText:
      "Homebrew addition. Closes the soft-lock where an inland realm with no hills or mountains has no way to acquire stone (Buy Goods requires a port or road, both of which are gated by stone). A wandering trader visits regardless of infrastructure, but his cart is small and his prices steep: 1 gold buys half what the open market would (food 10, lumber 7, stone 6, copper 5, iron 5 per gold). He carries only the common bulk goods — no silver, gold ore, mithral, or adamantine. The road is too dangerous in winter, so he stays home. Limited: one purchase per season; the Sell variant has its own separate cap.",
    cost: { gold: 1 },
    availability: {
      seasons: ['spring', 'summer', 'fall'],
      prohibited: ['winter'],
    },
    kind: 'interactive',
    panel: 'BuyFromTravelingMerchant',
    source: 'homebrew',
    implemented: true,
  },
  {
    id: 'sell_to_traveling_merchant',
    name: 'Sell to Traveling Merchant',
    category: 'generic',
    descriptors: ['limited'],
    shortDescription:
      'Sell a small parcel to a wandering trader for 1 gold (e.g. 24 stone, 40 food, or 2 W&A / Wooden Goods). No port or road needed. Forbidden in winter. Once per season.',
    bookText:
      "Homebrew addition — the Sell counterpart to Buy from Traveling Merchant. The trader pays you 1 gold but expects to flip the goods at a profit, so he accepts only at half the open-market price. Resources: hand over food 40, lumber 30, stone 24, copper 20, or iron 20 per gold. Trade goods: he takes Weapons & Armor and Wooden Goods at 2 units per gold but won't touch Exotic or Magic Items (too risky for his cart). Silver, gold ore, mithral and adamantine are likewise refused. Forbidden in winter. Limited: one sale per season; the Buy variant has its own separate cap.",
    cost: { variable: true, note: 'Hand over the listed unit count to gain 1 gold.' },
    availability: {
      seasons: ['spring', 'summer', 'fall'],
      prohibited: ['winter'],
    },
    kind: 'interactive',
    panel: 'SellToTravelingMerchant',
    source: 'homebrew',
    implemented: true,
  },
  {
    id: 'raise_loans',
    name: 'Raise Loans',
    category: 'generic',
    descriptors: ['limited'],
    shortDescription:
      'Borrow gold against future resources. Knowledge(economics) − 20 = gp gained, 10% interest per season.',
    bookText:
      'You may attempt to secure a loan to purchase supplies or fund your military. To gain a loan, you or your ministers must make a Knowledge (economics) check. Subtract 20 from the check\'s total to determine how much gold you can gain as a loan. You pay 10% interest on this loan until you pay it off, due at the beginning of every season except the season the loan was taken. If you have an outstanding loan, you may take new ones as long as you pay current interest. Skip interest for a year and bankers conspire against you — you must sell double the normal number of resources for the same gold until the loan is paid off.',
    cost: { variable: true, note: 'Variable principal; 10% interest per season.' },
    availability: { seasons: ['spring', 'summer', 'fall', 'winter'] },
    kind: 'interactive',
    panel: 'RaiseLoans',
    source: 'official',
    implemented: true,
  },

  {
    id: 'raise_taxes',
    name: 'Raise Taxes',
    category: 'generic',
    descriptors: ['limited'],
    shortDescription:
      '-2 commoner loyalty in exchange for +10% to current resource pool. Best done in fall after harvest.',
    bookText:
      'The system assumes that you have taxes and supply contracts in place that allow you direct access to many of the supplies your realm produces. You can attempt to raise taxes to increase your share. Raising taxes causes a -2 penalty to loyalty amongst all your subjects except members of your government. In return, you may increase the resources currently available in your resource pool by 10%. Generally speaking, it makes the most sense to increase taxes in the fall, right after you have harvested your realm\'s goods. Limited: only once per season.',
    availability: { seasons: ['spring', 'summer', 'fall', 'winter'] },
    kind: 'interactive',
    panel: 'RaiseTaxes',
    source: 'official',
    implemented: true,
  },

  {
    id: 'dispatch_diplomats',
    name: 'Dispatch Diplomats',
    category: 'generic',
    descriptors: ['limited', 'political'],
    shortDescription:
      'Send a diplomat to a neighboring realm to forge an alliance. Cost 1 gold; Diplomacy check governs result.',
    bookText:
      'You send a diplomat to a neighboring realm in hopes of securing an alliance. Your diplomat (a servant, minister, or ally available to visit there) must make a Diplomacy check. The result, modified by alignment / shared goals / past relations (-10 to +10), determines the alliance loyalty: subtract 20 from the check; the result, if above 0, divided by 4 is the base loyalty score your diplomat wins for you. Replaces the neighbor\'s current loyalty only if higher. Alliance benefits scale with loyalty: 1-3 Trade Pact, 4-6 Armed Alliance, 7-9 Open Travel, 10+ Vassal. You must hold up your end or suffer a -5 stacking penalty to future diplomacy. Cost: 1 gold per dispatch. Prerequisite: a servant available, a method of getting them there. Winter forbidden (poor weather).',
    cost: { gold: 1 },
    availability: {
      seasons: ['spring', 'summer', 'fall'],
      prohibited: ['winter'],
    },
    kind: 'interactive',
    panel: 'DispatchDiplomats',
    source: 'official',
    implemented: false,
  },
]

// ============================================================
// Lookup helpers
// ============================================================

const byId = new Map(ACTION_REGISTRY.map((a) => [a.id, a]))

export function findActionById(id: string): ActionDefinition | undefined {
  return byId.get(id as ActionDefinition['id'])
}

export function actionsByCategory(category: ActionDefinition['category']): ActionDefinition[] {
  return ACTION_REGISTRY.filter((a) => a.category === category)
}

export function obligatoryActionsForSeason(
  season: ActionDefinition['availability']['seasons'][number],
  timing: 'season_start' | 'season_end',
): ActionDefinition[] {
  return ACTION_REGISTRY.filter(
    (a) =>
      a.descriptors.includes('obligatory') &&
      a.availability.seasons.includes(season) &&
      a.obligatoryTiming === timing,
  )
}
