// EVENTS: the "?" locked rooms. Pure data + small functions; run.js runs them (see startEvent / chooseEvent there).
// Text is a placeholder: short and neutral. Marc decides the story.
//
// An event:
//   { id, title, room (painter room key), canAppear?(run) -> bool,
//     steps: { start: { text: string | (run, vars) => string, choices(run, vars) -> [choice] }, ...more steps },
//     picks?: { name(x, uid) }        what happens when a card picker this event opened is answered }
// A choice: { label, desc?, disabled?, reason?, go(x) }   (label/desc/disabled/reason are what the screen shows)
// x is the helper run.js hands to go() and picks (every call changes the run and adds a result chip):
//   x.run, x.vars (this event's saved scratch: plain JSON), x.rng.{events,cards,relics,potions} (run streams)
//   x.loseHp(n)  x.heal(n)  x.gainMaxHp(n)  x.gainGold(n)  x.loseGold(n)
//   x.addCard(id, up?)  x.relic(id?) -> id (random 50/33/17 when no id)  x.potion(id?) -> id (random when no id)
//   x.upgradeRandom(n)  x.removeCard(uid)  x.upgradeCard(uid)  x.transformCard(uid)
//   x.rollRelic() / x.rollPotion() -> an id without giving it (for loot shown later)
//   x.noteCards() -> 3 new cards (one Marc, one Yola, one either) for a 'pick'; x.addPicked(uid) adds the one picked
//   x.pick(mode, { then, cards?, title?, sub?, cancelable? })   opens the card picker; the answer calls picks[then](x, uid)
//   x.fight(encounterId, { loot })   ends the event in a fight; loot = extra reward rows ([{ kind, ... }]) after the win
//   x.text(t)   new body text, same step        x.step(name)   go to another step
//   x.done(text?)   show the outcome with a single Continue     x.leave()   back to the map at once
//   x.chip(text, tone)   an extra result chip ('good' | 'bad' | '')
// A potion that finds no free slot waits as loot; Continue then goes through the reward screen so a slot can be freed.
// HP loss in events never kills (you stay on 1); choices you can't afford are disabled with a reason.
// Numbers follow the Slay the Spire events they borrow from (named in the comment on each).

const pct = (run, p) => Math.floor(run.maxHp * p);

export const EVENTS = {
  // Scrap Ooze: lose 3 HP (+1 per try), 25% (+10% per try) a relic
  vending: {
    title: 'Vending Machine', room: 'corridor',
    steps: {
      start: {
        text: 'The glass is cracked. Something shiny is wedged behind the last coil.',
        choices(run, v) {
          const cost = 3 + (v.tries || 0);
          const chance = Math.min(100, 25 + 10 * (v.tries || 0));
          return [
            { label: 'Smash it', desc: `Lose ${cost} HP. ${chance}% chance a relic falls out.`,
              disabled: run.hp <= cost, reason: 'Not enough HP',
              go(x) {
                x.loseHp(cost);
                if (x.rng.events.int(100) < chance) { x.relic(); x.done('It drops into the tray with the glass.'); return; }
                x.vars.tries = (x.vars.tries || 0) + 1;
                x.text('Nothing yet. The coil bends a little more.');
              } },
            { label: 'Walk away', go(x) { x.leave(); } },
          ];
        },
      },
    },
  },

  // A rest-style trade: heal a third / Max HP / relic with a curse
  break_room: {
    title: 'Break Room', room: 'break_room',
    steps: {
      start: {
        text: 'A coffee pot is still warm on the counter. A sealed snack box sits on the top shelf.',
        choices(run) {
          const heal = Math.floor(run.maxHp / 3);
          return [
            { label: 'Coffee', desc: `Heal ${heal} HP.`, go(x) { x.heal(heal); x.done('It is terrible, and it helps.'); } },
            { label: 'Donuts', desc: 'Raise your Max HP by 5.', go(x) { x.gainMaxHp(5); x.done('Stale, but filling.'); } },
            { label: 'Grab the snack box', desc: 'Get a random relic. Add Infection, a curse, to your deck.',
              go(x) { x.relic(); x.addCard('infection'); x.done('Something inside was not food.'); } },
          ];
        },
      },
    },
  },

  // The Cleric: 35 gold heal 25%, 50 gold remove a card
  wounded_doctor: {
    title: 'A Doctor Who Stayed', room: 'ward',
    steps: {
      start: {
        text: 'A doctor is still working at the back of the ward. She can help, for a price.',
        choices(run) {
          const heal = pct(run, 0.25);
          return [
            { label: 'Treatment', desc: `Pay 35 supplies. Heal ${heal} HP.`, disabled: run.gold < 35, reason: 'Not enough supplies',
              go(x) { x.loseGold(35); x.heal(heal); x.done('She works fast and says nothing.'); } },
            { label: 'Cut it out', desc: 'Pay 50 supplies. Remove a card from your deck.',
              disabled: run.gold < 50 || !run.deck.length, reason: run.gold < 50 ? 'Not enough supplies' : 'No cards',
              go(x) { x.pick('remove', { then: 'paidRemoval', cancelable: true }); } },
            { label: 'Leave', go(x) { x.leave(); } },
          ];
        },
      },
    },
    picks: {
      paidRemoval(x, uid) { x.loseGold(50); x.removeCard(uid); x.done('One less thing to carry.'); },
    },
  },

  // Dead Adventurer: each search 25% / 50% / 75% that the elite wakes; loot in order supplies, potion, relic
  supply_cart: {
    title: 'Abandoned Supply Cart', room: 'storage',
    steps: {
      start: {
        text: 'A supply cart in the storage room. Something big is slumped against it, not moving.',
        choices(run, v) {
          const found = v.found || 0;
          const chance = Math.min(100, 25 * (found + 1));
          return [
            { label: 'Search', desc: `Find something. ${chance}% chance it wakes up: an elite fight, with the rest of the loot as the reward.`,
              go(x) {
                const left = LOOT.slice(x.vars.found || 0);
                if (x.rng.events.int(100) < chance) {
                  x.fight('cart_walker', { loot: left.map(kind => lootRow(x, kind)) });
                  return;
                }
                const kind = left[0];
                if (kind === 'gold') x.gainGold(30);
                else if (kind === 'potion') x.potion();
                else x.relic();
                x.vars.found = (x.vars.found || 0) + 1;
                if (x.vars.found >= LOOT.length) x.done('That was everything. It still has not moved.');
                else x.text('It twitches. You keep digging anyway?');
              } },
            { label: 'Leave', go(x) { x.leave(); } },
          ];
        },
      },
    },
  },

  // Shining Light: upgrade 2 random cards, lose 20% Max HP as HP
  xray: {
    title: 'X-Ray Room', room: 'xray',
    canAppear: run => run.deck.some(c => !c.up && c.id !== 'infection'),
    steps: {
      start: {
        text: 'The X-ray room still has power. The machine hums when you step close.',
        choices(run) {
          const loss = pct(run, 0.2);
          const canUp = run.deck.filter(c => !c.up && !['panic', 'bile', 'infection'].includes(c.id)).length;
          return [
            { label: 'Step in', desc: `Upgrade 2 random cards. Lose ${loss} HP.`,
              disabled: !canUp || run.hp <= loss, reason: !canUp ? 'Nothing to upgrade' : 'Not enough HP',
              go(x) { x.loseHp(loss); x.upgradeRandom(2); x.done('Your skin tingles for a long time after.'); } },
            { label: 'Leave', go(x) { x.leave(); } },
          ];
        },
      },
    },
  },

  // HP for gold / heal for a curse
  blood_bank: {
    title: 'Blood Bank', room: 'ward',
    steps: {
      start: {
        text: 'The blood bank fridge is still cold. There is a sign-up sheet on a clipboard.',
        choices(run) {
          return [
            { label: 'Donate', desc: 'Lose 10 HP. Gain 75 supplies.', disabled: run.hp <= 10, reason: 'Not enough HP',
              go(x) { x.loseHp(10); x.gainGold(75); x.done('Someone left a box of supplies by the chair.'); } },
            { label: 'Steal plasma', desc: 'Heal 15 HP. Add Infection, a curse, to your deck.',
              go(x) { x.heal(15); x.addCard('infection'); x.done('Some of the bags were not clean.'); } },
            { label: 'Leave', go(x) { x.leave(); } },
          ];
        },
      },
    },
  },

  // HP for potions / a gamble
  pharmacy_cabinet: {
    title: 'Locked Cabinet', room: 'pharmacy',
    steps: {
      start: {
        text: 'A locked medicine cabinet behind the nurses\' station.',
        choices(run) {
          return [
            { label: 'Pry it open', desc: 'Marc: lose 8 HP. Get 2 potions.', disabled: run.hp <= 8, reason: 'Not enough HP',
              go(x) { x.loseHp(8); x.potion(); x.potion(); x.done('The door gives. So does Marc\'s shoulder.'); } },
            { label: 'Pick the lock', desc: 'Yola: 50% chance to get a potion.',
              go(x) {
                if (x.rng.events.int(100) < 50) { x.potion(); x.done('A click. Yola does not look surprised.'); }
                else x.done('The pick snaps. Nothing.');
              } },
            { label: 'Leave', go(x) { x.leave(); } },
          ];
        },
      },
    },
  },

  // Living Wall: remove / transform / upgrade one card
  intercom: {
    title: 'The Intercom', room: 'security_gate',
    steps: {
      start: {
        text: 'Static, then a voice counting slowly. It stops when you lean in.',
        choices(run) {
          const canUp = run.deck.some(c => !c.up && !['panic', 'bile', 'infection'].includes(c.id));
          return [
            { label: 'Forget', desc: 'Remove a card from your deck.', go(x) { x.pick('remove', { then: 'remove', cancelable: true }); } },
            { label: 'Change', desc: 'Transform a card into a random card of the same hero.', go(x) { x.pick('transform', { then: 'transform', cancelable: true }); } },
            { label: 'Practise', desc: 'Upgrade a card.', disabled: !canUp, reason: 'Nothing to upgrade',
              go(x) { x.pick('upgrade', { then: 'upgrade', cancelable: true }); } },
          ];
        },
      },
    },
    picks: {
      remove(x, uid) { x.removeCard(uid); x.done('The voice stops counting.'); },
      transform(x, uid) { x.transformCard(uid); x.done('The voice starts again, from a different number.'); },
      upgrade(x, uid) { x.upgradeCard(uid); x.done('The voice counts faster.'); },
    },
  },

  // The Library-style pick: one Marc card, one Yola card, one either
  survivor_note: {
    title: 'A Note on the Wall', room: 'corridor',
    steps: {
      start: {
        text: 'A note is taped to the wall, with a few tips scribbled on it.',
        choices() {
          return [
            { label: 'Read it', desc: 'Choose 1 of 3 cards to add to your deck.',
              go(x) {
                x.vars.cards ||= x.noteCards(); // rolled once: putting them back and reading again shows the same three
                x.pick('pick', { then: 'take', cards: x.vars.cards, title: 'A Note on the Wall', sub: 'Take one card.', cancelable: true });
              } },
            { label: 'Leave', go(x) { x.leave(); } },
          ];
        },
      },
    },
    picks: {
      take(x, uid) { x.addPicked(uid); x.done('You fold the note into your pocket.'); },
    },
  },

  // Mushrooms-style: a fight, then a relic
  gurney: {
    title: 'Overturned Gurney', room: 'ward',
    steps: {
      start: {
        text: 'An overturned gurney. Something shiny underneath. Something moving, too.',
        choices() {
          return [
            { label: 'Look under it', desc: 'Fight 2 Biters. Then get a relic.',
              go(x) { x.fight('gurney_biters', { loot: [{ kind: 'relic', id: x.rollRelic() }] }); } },
            { label: 'Leave', go(x) { x.leave(); } },
          ];
        },
      },
    },
  },
};

const LOOT = ['gold', 'potion', 'relic'];
function lootRow(x, kind) {
  if (kind === 'gold') return { kind: 'gold', amount: 30 };
  if (kind === 'potion') return { kind: 'potion', id: x.rollPotion() };
  return { kind: 'relic', id: x.rollRelic() };
}

for (const [id, e] of Object.entries(EVENTS)) e.id = id;

export const EVENT_IDS = Object.keys(EVENTS);
