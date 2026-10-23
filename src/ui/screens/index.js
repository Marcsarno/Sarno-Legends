// Every screen outside the fight, by name, for the app's router:  SCREENS.map.mount(root, ctx) -> { unmount(), update(next?) }
// Each module's header lists the ctx it reads and the act callbacks it calls (BUILD_SPEC section 9).
// update(next) merges `next` into the screen's ctx (when given) and redraws from it; screens that keep no live state
// (title, intro, settings) accept it too, so the router can call update() on whatever is mounted.

import * as title from './title.js';
import * as intro from './intro.js';
import * as map from './map.js';
import * as reward from './reward.js';
import * as rest from './rest.js';
import * as shop from './shop.js';
import * as event from './event.js';
import * as treasure from './treasure.js';
import * as result from './result.js';
import * as armory from './armory.js';
import * as settings from './settings.js';
import * as deck from './deck.js';
import * as picker from './picker.js';
import * as howto from './howto.js';
import * as history from './history.js';
import * as collection from './collection.js';
import * as savecode from './savecode.js';
import * as infection from './infection.js';

export const SCREENS = { title, intro, map, reward, rest, shop, event, treasure, result, armory, settings, deck, picker, howto, history, collection, savecode, infection };

/** Overlays sit on top of another screen (and of the battle) instead of replacing it. */
export const OVERLAYS = new Set(['settings', 'deck', 'picker', 'reward', 'howto', 'history', 'collection', 'savecode', 'infection']);
