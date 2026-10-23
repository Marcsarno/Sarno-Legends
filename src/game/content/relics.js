// RELICS: things found in the hospital, the starter Nurse's Kit, and the equipped weapons (rarity 'weapon').
// Pure data + hook functions. combat.js calls the combat hooks; the run layer (run.js) reads the run fields.
//
// Every hook gets (ctx, r, ...) where r = the live relic { id, counter, data }:
//   counter persists between combats (it is saved in run.relics[i].counter; -1 means "used up", grey it out),
//   data is scratch that resets every combat.
// ctx is the live Combat (combat.js); hooks use its helper methods: ctx.state, ctx.turn, ctx.party, ctx.rng (misc stream),
//   ctx.flash(id) (the relic glows), ctx.gainBlock(n, { raw }), ctx.gainEnergy(n), ctx.draw(n), ctx.heal(n), ctx.setHp(n),
//   ctx.loseHp(n), ctx.gainMaxHp(n), ctx.applyParty(status, n), ctx.applyEnemy(enemy, status, n), ctx.applyAll(status, n),
//   ctx.damageAll(n, { kind, pure }), ctx.alive(), ctx.addCard(id, to, n). Each emits its own events.
//
// Combat hooks (all optional):
//   onCombatStart(ctx, r)               after the deck is shuffled, before turn 1
//   onTurnStart(ctx, r, turn)           player turn start: after block clears and energy refills, before the draw
//   onTurnStartPostDraw(ctx, r, turn)   after the turn's draw
//   onTurnEnd(ctx, r, turn)             end of the player's turn, before the hand is discarded
//   onCardPlay(ctx, r, card, info)      a card was played, before its effects (card = resolved view + uid; info = { target, hero })
//   onCardPlayed(ctx, r, card, info)    after the card resolved (info.killed = it killed something)
//   onEnemyDeath(ctx, r, enemy)
//   onHpLost(ctx, r, amount)            the party lost HP
//   onCombatEnd(ctx, r, won)            ctx.state.endHp = the HP the fight ended on (before end-of-combat heals)
//   damageBonus(ctx, r, info) -> n      flat damage added per hit to a party attack (before Weak/Staggered)
//   modifyDamage(ctx, r, dmg, info) -> dmg   multiplier stage for a party attack (info.preview = only a preview)
//   modifyHpLoss(ctx, r, n) -> n        party HP loss after block
//   onWouldDie(ctx, r) -> true if it saved the party (it must set the HP itself)
// Flags read directly: vulnMult (Staggered multiplier for party attacks), keepEnergy (unspent energy carries over),
//   innate: [cardIds] (those cards start in hand).
// Run fields (run.js): onPickup(run), onCardAdded(run, card), shopDiscount (price multiplier), removalCost (fixed price).

export const RELICS = {
  // ---------------------------------------------------------------- starter
  nurses_kit: {
    name: "Nurse's Kit", rarity: 'starter', model: 'items/medkit',
    text: 'At the end of each fight, heal 6 HP.',
    onCombatEnd(ctx, r, won) { if (won) { ctx.flash(r.id); ctx.heal(6); } },
  },

  // ---------------------------------------------------------------- common
  duct_tape: {
    name: 'Duct Tape', rarity: 'common',
    text: 'Start each fight with 10 Block.',
    onCombatStart(ctx, r) { ctx.flash(r.id); ctx.gainBlock(10, { raw: true }); },
  },
  coffee_thermos: {
    name: 'Coffee Thermos', rarity: 'common', model: 'props/mug',
    text: 'Gain 1 extra energy on the first turn of each fight.',
    onTurnStart(ctx, r, turn) { if (turn === 1) { ctx.flash(r.id); ctx.gainEnergy(1); } },
  },
  stethoscope: {
    name: 'Stethoscope', rarity: 'common',
    text: 'Draw 2 extra cards on the first turn of each fight.',
    onTurnStartPostDraw(ctx, r, turn) { if (turn === 1) { ctx.flash(r.id); ctx.draw(2); } },
  },
  pager: {
    name: 'Pager', rarity: 'common', model: 'items/radio',
    text: 'At the start of each fight, apply 1 Staggered to ALL zombies.',
    onCombatStart(ctx, r) { ctx.flash(r.id); ctx.applyAll('vulnerable', 1); },
  },
  protein_bar: {
    name: 'Protein Bar', rarity: 'common',
    text: 'Start each fight with 1 Strength.',
    onCombatStart(ctx, r) { ctx.flash(r.id); ctx.applyParty('strength', 1); },
  },
  knee_brace: {
    name: 'Knee Brace', rarity: 'common',
    text: 'Start each fight with 1 Agility.',
    onCombatStart(ctx, r) { ctx.flash(r.id); ctx.applyParty('dexterity', 1); },
  },
  granola: {
    name: 'Granola Bar', rarity: 'common', model: 'items/food-can',
    text: 'Raise your Max HP by 7 when you pick this up.',
    onPickup(run) { run.maxHp += 7; run.hp = Math.min(run.maxHp, run.hp + 7); },
  },
  iv_bag: {
    name: 'IV Bag', rarity: 'common', model: 'props/iv_stand',
    text: 'At the start of each fight, heal 2 HP.',
    onCombatStart(ctx, r) { ctx.flash(r.id); ctx.heal(2); },
  },
  coin_jar: {
    name: 'Coin Jar', rarity: 'common',
    text: 'Whenever you add a card to your deck, gain 9 supplies.',
    onCardAdded(run) { run.gold += 9; },
  },
  tally_marks: {
    name: 'Tally Marks', rarity: 'common', counterMax: 10,
    text: 'Every 10th Attack you play deals double damage.',
    modifyDamage(ctx, r, dmg, info) { return info.card.type === 'attack' && (r.counter || 0) === 9 ? dmg * 2 : dmg; },
    onCardPlayed(ctx, r, card) {
      if (card.type !== 'attack') return;
      r.counter = (r.counter || 0) + 1;
      if (r.counter >= 10) { r.counter = 0; ctx.flash(r.id); }
    },
  },

  // ---------------------------------------------------------------- uncommon
  riot_vest: {
    name: 'Riot Vest', rarity: 'common', model: 'props/guard_duffel_open',
    text: 'If you end your turn without Block, gain 6 Block.',
    onTurnEnd(ctx, r) { if (ctx.party.block === 0) { ctx.flash(r.id); ctx.gainBlock(6, { raw: true }); } },
  },
  combo_counter: {
    name: 'Combo Counter', rarity: 'uncommon', model: 'props/wall_clock',
    text: 'Every time you play 3 Attacks in a single turn, gain 1 Strength.',
    onTurnStart(ctx, r) { r.counter = 0; },
    onCardPlayed(ctx, r, card) {
      if (card.type !== 'attack') return;
      r.counter = (r.counter || 0) + 1;
      if (r.counter >= 3) { r.counter = 0; ctx.flash(r.id); ctx.applyParty('strength', 1); }
    },
    onCombatEnd(ctx, r) { r.counter = 0; },
  },
  box_cutter: {
    name: 'Box Cutter', rarity: 'uncommon',
    text: 'Every time you play 3 Skills in a single turn, deal 5 damage to ALL zombies.',
    onTurnStart(ctx, r) { r.counter = 0; },
    onCardPlayed(ctx, r, card) {
      if (card.type !== 'skill') return;
      r.counter = (r.counter || 0) + 1;
      if (r.counter >= 3) { r.counter = 0; ctx.flash(r.id); ctx.damageAll(5, { kind: 'thorns', pure: true }); }
    },
    onCombatEnd(ctx, r) { r.counter = 0; },
  },
  door_wedge: {
    name: 'Door Wedge', rarity: 'uncommon', model: 'props/wet_floor_sign',
    text: 'At the start of your 2nd turn, gain 14 Block.',
    onTurnStart(ctx, r, turn) { if (turn === 2) { ctx.flash(r.id); ctx.gainBlock(14, { raw: true }); } },
  },
  trophy_belt: {
    name: 'Trophy Belt', rarity: 'uncommon', model: 'items/backpack',
    text: 'Whenever a zombie dies, gain 1 energy and draw 1 card.',
    onEnemyDeath(ctx, r) { ctx.flash(r.id); ctx.gainEnergy(1); ctx.draw(1); },
  },
  emergency_rations: {
    name: 'Emergency Rations', rarity: 'uncommon', model: 'items/food-can',
    text: 'If you end a fight at 50% HP or less, heal 12 HP.',
    onCombatEnd(ctx, r, won) {
      if (won && ctx.state.endHp <= ctx.party.maxHp / 2) { ctx.flash(r.id); ctx.heal(12); }
    },
  },

  // ---------------------------------------------------------------- rare
  hollow_points: {
    name: 'Hollow Points', rarity: 'uncommon', model: 'items/pistol',
    text: 'Staggered zombies take 75% more damage from attacks instead of 50%.',
    vulnMult: 1.75,
  },
  steel_plate: {
    name: 'Steel Plate', rarity: 'rare',
    text: 'Whenever you would lose HP, lose 1 less.',
    modifyHpLoss(ctx, r, n) { return n > 0 ? n - 1 : n; },
  },
  defib_pads: {
    name: 'Defib Pads', rarity: 'rare', model: 'props/patient_monitor',
    text: 'Once per run: when you would die, heal to 50% of your Max HP instead.',
    onWouldDie(ctx, r) {
      if (r.counter === -1) return false;
      r.counter = -1;
      ctx.flash(r.id);
      ctx.setHp(Math.floor(ctx.party.maxHp * 0.5));
      return true;
    },
  },
  cooler: {
    name: 'Cooler', rarity: 'rare', model: 'props/courier_coolers',
    text: 'Unspent energy carries over to your next turn.',
    keepEnergy: true,
  },

  // ---------------------------------------------------------------- shop
  staff_badge: {
    name: 'Staff Badge', rarity: 'shop',
    text: 'Everything in the Pharmacy costs 50% less.',
    shopDiscount: 0.5,
  },
  doctors_note: {
    name: "Doctor's Note", rarity: 'shop', model: 'props/filing_cabinet',
    text: 'Removing a card at the Pharmacy always costs 50 supplies.',
    removalCost: 50,
  },

  // ---------------------------------------------------------------- weapons (equipped in the Armory; see weapons.js)
  wood_bat: {
    name: 'Wood Bat', rarity: 'weapon', hero: 'marc', model: 'weapons/wood_bat',
    text: 'The first Bat Swing you play each fight deals double damage.',
    onCardPlay(ctx, r, card) {
      if (card.id === 'bat_swing' && !r.data.used) { r.data.used = true; r.data.active = true; ctx.flash(r.id); }
    },
    modifyDamage(ctx, r, dmg, info) {
      // the preview doubles one card only: the first Bat Swing in hand (or the one asked about when none is in hand)
      const first = () => { const b = ctx.state.hand.find(c => c.id === 'bat_swing'); return !b || !info.uid || b.uid === info.uid; };
      const on = info.card.id === 'bat_swing' && (r.data.active || (info.preview && !r.data.used && first()));
      return on ? dmg * 2 : dmg;
    },
    onCardPlayed(ctx, r) { r.data.active = false; },
  },
  nail_bat: {
    name: 'Nail Bat', rarity: 'weapon', hero: 'marc', model: 'weapons/wood_bat',
    text: 'Your Bat Swings are Nail Swings: they make zombies Bleed.',
  },
  wire_bat: {
    name: 'Wire-and-Tape Bat', rarity: 'weapon', hero: 'marc', model: 'weapons/wood_bat',
    text: 'Your Bat Swings are Barbed Swings. Bleeding zombies take 2 more damage from Marc\'s attacks.',
    damageBonus(ctx, r, info) { return info.hero === 'marc' && info.target && (info.target.statuses.bleed || 0) > 0 ? 2 : 0; },
  },
  crowbar: {
    name: 'Crowbar', rarity: 'weapon', hero: 'marc', model: 'weapons/crowbar',
    text: 'Home Run becomes Pry Loose. Your first Attack each fight also applies 2 Staggered.',
    onCardPlayed(ctx, r, card, info) {
      if (card.type !== 'attack' || r.data.used) return;
      r.data.used = true;
      const targets = info.target ? [info.target] : (info.hitTargets || []);
      const alive = targets.filter(e => e && e.alive);
      if (!alive.length) return;
      ctx.flash(r.id);
      for (const e of alive) ctx.applyEnemy(e, 'vulnerable', 2);
    },
  },
  fire_axe: {
    name: 'Fire Axe', rarity: 'weapon', hero: 'marc', model: 'weapons/fire_axe',
    text: 'One Brace becomes Chop Block. Marc\'s attacks deal 2 more damage. Start each fight with 1 Shaken.',
    damageBonus(ctx, r, info) { return info.hero === 'marc' ? 2 : 0; },
    onCombatStart(ctx, r) { ctx.flash(r.id); ctx.applyParty('frail', 1); },
  },
  sledgehammer: {
    name: 'Sledgehammer', rarity: 'weapon', hero: 'marc', model: 'weapons/sledgehammer',
    text: 'Home Run becomes Sledge. Start each fight with 1 less energy on the first turn.',
    onTurnStart(ctx, r, turn) { if (turn === 1) { ctx.flash(r.id); ctx.gainEnergy(-1); } },
  },
  pistol: {
    name: 'Pistol', rarity: 'weapon', hero: 'yola', model: 'weapons/pistol_core',
    text: 'Clean Shot is Innate: it always starts in your hand.',
    innate: ['clean_shot'],
  },
  shotgun: {
    name: 'Pump Shotgun', rarity: 'weapon', hero: 'yola', model: 'weapons/pump_shotgun',
    text: 'Your 2 Pistol Shots become Buckshot: damage to ALL zombies.',
  },
  sawed_off: {
    name: 'Sawed-Off', rarity: 'weapon', hero: 'yola', model: 'weapons/pump_short',
    text: 'Clean Shot becomes Both Barrels. Yola\'s attacks deal 3 more damage to Staggered zombies.',
    damageBonus(ctx, r, info) { return info.hero === 'yola' && info.target && (info.target.statuses.vulnerable || 0) > 0 ? 3 : 0; },
  },
};

for (const [id, r] of Object.entries(RELICS)) r.id = id;

export const RELIC_RARITIES = ['common', 'uncommon', 'rare', 'shop'];

/** Relic ids of one rarity that a run can find (no starter or weapon relics). exclude = ids already owned. */
export function relicPool(rarity, exclude = []) {
  const skip = new Set((exclude || []).map(x => (typeof x === 'string' ? x : x.id)));
  return Object.values(RELICS).filter(r => r.rarity === rarity && !skip.has(r.id)).map(r => r.id);
}

/** Starting relic list for a run: the starter relic. Weapon relics come from run.weapons (combat adds them). */
export const STARTER_RELICS = ['nurses_kit'];

/** The weapon relics a run carries (for the relic bar: show these first). */
export function weaponRelics(weapons = {}) {
  return ['marc', 'yola'].map(h => weapons[h]).filter(id => id && RELICS[id]);
}
