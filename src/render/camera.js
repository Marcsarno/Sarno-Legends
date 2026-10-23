// The battle camera and stage layout, shared by the live stage (stage.js) and the room painter (painter.js) so the
// painted backdrop and the 3D characters line up. World units are metres; y = 0 is the floor; +x points at the zombies.
// Owner: render core. The painter only imports these.
import * as THREE from 'three';

export const BATTLE = {
  fov: 32,                                   // vertical, at 16:9 (about a 40 mm lens)
  // ~11 deg above the action; a body is ~38% of the screen height with its feet at ~65% (the HUD bars sit under the
  // feet, clear of the hand). Was (0.3, 2.45, 8.0) -> (0.3, 1.02, 0): feet at 74%, in the hand.
  position: new THREE.Vector3(0.3, 2.3, 8.4),
  target: new THREE.Vector3(0.3, 0.62, 0),
  minHalfWidth: 4.15,                        // keep x in [target.x - w, target.x + w] visible on narrow screens
  near: 0.1, far: 80,
};

// Where everyone stands. Marc holds the forward melee spot; Yola is behind him on the left.
export const SLOTS = {
  marc: new THREE.Vector3(-1.4, 0, 0.45),
  yola: new THREE.Vector3(-3.3, 0, -0.5),     // 1.9 m back: her line of fire passes behind Marc, clear of his head
  // up to 5 zombies: front row 0-2, back row 3-4 (slot order = action order, left to right on screen)
  enemy: [
    new THREE.Vector3(1.35, 0, 0.45),
    new THREE.Vector3(2.6, 0, 0.0),
    new THREE.Vector3(3.8, 0, 0.5),
    new THREE.Vector3(1.95, 0, -1.25),
    new THREE.Vector3(3.25, 0, -1.3),
  ],
  // one big zombie (elite or boss) stands here
  boss: new THREE.Vector3(2.45, 0, 0.0),
};

// Target heights (metres) the character loader scales models to before any per-enemy scale.
export const HEIGHTS = { marc: 1.82, yola: 1.68, zombie: 1.76 };

/** Set a PerspectiveCamera to the battle view for a given aspect (width / height). */
export function applyBattleCamera(camera, aspect) {
  camera.aspect = aspect;
  camera.near = BATTLE.near; camera.far = BATTLE.far;
  const dist = BATTLE.position.distanceTo(BATTLE.target);
  // widen the vertical fov when the screen is narrower than needed to show minHalfWidth at the target distance
  const needV = 2 * Math.atan(Math.tan(Math.atan(BATTLE.minHalfWidth / dist)) / aspect) * 180 / Math.PI;
  camera.fov = Math.max(BATTLE.fov, needV);
  camera.position.copy(BATTLE.position);
  camera.lookAt(BATTLE.target);
  camera.updateProjectionMatrix();
  return camera;
}
