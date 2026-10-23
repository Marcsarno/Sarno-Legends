// Per-enemy looks: zombies that share a model (the Bloater, the Orderly and the Nurse are all the scrubs body; the Biter
// and the Spitter are the same patient) are told apart without new models, by
//   - a recolour in the material's own shader (no extra pass): the texel's hue / saturation / value is moved inside two
//     bands, the clothes (the scrubs' blue) and the skin (the tan), and the pale gown is tinted; every recoloured
//     material shares one program (customProgramCacheKey), the numbers are per-actor uniforms;
//   - body proportions: a wider, squatter Bloater, a bigger Orderly, a thin tall Spitter, a hunched Biter (the model
//     root's scale; it sits under the yaw, so x is the body's width and z its depth);
//   - the idle: its rate, how much the body sways and the head lolls, a Biter's twitch (actor.js reads actor.look).
//   applyLook(actor, enemyId)   after the Actor is built (director.js createEnemyActor)
// A look the table doesn't list leaves the actor exactly as the model is.
import * as THREE from 'three';

// band: [hue 0..1, half-width, min saturation, hue shift, saturation x, value x]; pale: [r, g, b, amount] on the near-white
// areas (the gowns); tint: [r, g, b, amount] over everything. Hues are measured on the textures (sRGB): scrubs ~0.56,
// skin ~0.08, gowns: saturation under ~0.15.
export const LOOKS = {
  bloater: {
    cloth: [0.56, 0.1, 0.1, -0.11, 0.42, 0.62],          // the scrubs soaked a murky olive-grey
    skin: [0.08, 0.08, 0.15, 0.1, 1.2, 0.84],             // sickly olive-green skin
    tint: [0.88, 1.0, 0.7, 0.32],
    body: [1.28, 0.94, 1.26],                             // wide, squat, a belly front to back
    idle: { rate: 0.72, sway: 1.45, loll: 0.8, breathe: 1 },
  },
  orderly: {
    cloth: [0.56, 0.1, 0.1, 0.08, 1.15, 0.4],             // dark navy scrubs
    skin: [0.08, 0.08, 0.15, 0.0, 0.5, 0.86],             // ashen
    body: [1.08, 1.05, 1.06],                             // a big man
    idle: { rate: 0.8, sway: 0.55, loll: 0.45 },
  },
  biter: {
    pale: [0.66, 0.8, 0.98, 0.85],                        // a washed-out blue hospital gown
    skin: [0.08, 0.08, 0.15, 0.0, 0.65, 0.88],            // grey
    body: [1.0, 0.95, 1.0],
    idle: { rate: 1.28, sway: 0.9, loll: 1.1, twitch: 1 },
  },
  spitter: {
    pale: [0.97, 0.9, 0.6, 0.65],                         // a bile-stained gown
    skin: [0.08, 0.08, 0.15, 0.1, 1.05, 0.88],            // sickly green
    tint: [0.94, 1.0, 0.88, 0.2],
    body: [0.92, 1.04, 0.92],                             // thin and tall
    idle: { rate: 0.95, sway: 1.1, loll: 1.6 },
  },
};

const NO_BAND = [0, 0, 2, 0, 1, 1];   // (min saturation 2: matches nothing)
const PARS = `
uniform vec3 slBandA0; uniform vec3 slBandA1; uniform vec3 slBandB0; uniform vec3 slBandB1; uniform vec4 slPale; uniform vec4 slTint;
vec3 slRgb2Hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-6)), d / (q.x + 1e-6), q.x);
}
vec3 slHsv2Rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
void slBand(inout vec3 hsv, vec3 b0, vec3 b1) {
  float dh = abs(fract(hsv.x - b0.x + 0.5) - 0.5);
  float w = (1.0 - smoothstep(b0.y * 0.55, b0.y, dh)) * smoothstep(b0.z, b0.z + 0.08, hsv.y);
  hsv.x = fract(hsv.x + b1.x * w);
  hsv.y = clamp(hsv.y * mix(1.0, b1.y, w), 0.0, 1.0);
  hsv.z *= mix(1.0, b1.z, w);
}
`;
const APPLY = `
#include <map_fragment>
{
  vec3 slG = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.4545));
  vec3 slH = slRgb2Hsv(slG);
  float slP = (1.0 - smoothstep(0.14, 0.3, slH.y)) * smoothstep(0.3, 0.6, slH.z);
  slBand(slH, slBandA0, slBandA1);
  slBand(slH, slBandB0, slBandB1);
  slG = slHsv2Rgb(slH);
  slG = mix(slG, slG * slPale.rgb, slP * slPale.a);
  slG = mix(slG, slG * slTint.rgb, slTint.a);
  diffuseColor.rgb = pow(slG, vec3(2.2));
}
`;

function recolor(m, L) {
  const A = L.cloth || NO_BAND, B = L.skin || NO_BAND;
  const u = {
    slBandA0: { value: new THREE.Vector3(A[0], A[1], A[2]) }, slBandA1: { value: new THREE.Vector3(A[3], A[4], A[5]) },
    slBandB0: { value: new THREE.Vector3(B[0], B[1], B[2]) }, slBandB1: { value: new THREE.Vector3(B[3], B[4], B[5]) },
    slPale: { value: new THREE.Vector4(...(L.pale || [1, 1, 1, 0])) }, slTint: { value: new THREE.Vector4(...(L.tint || [1, 1, 1, 0])) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <map_fragment>', APPLY);
  };
  m.customProgramCacheKey = () => 'sl-look';
  m.needsUpdate = true;
}

/** Give an enemy actor its look (by its enemy id). Returns the look, or null. */
export function applyLook(actor, enemyId) {
  const L = LOOKS[enemyId];
  if (!L) return null;
  if (L.cloth || L.skin || L.pale || L.tint) {
    actor.data.model.traverse(o => {
      if (!o.isMesh || /^GORE_/.test(o.name)) return;
      for (const m of [].concat(o.material)) if (m.map && !m.userData.slLook) { m.userData.slLook = enemyId; recolor(m, L); }
    });
  }
  if (L.body) {
    const s = actor.scale || 1, r = actor.data.root.scale;
    r.set(s * L.body[0], s * L.body[1], s * L.body[2]);
    actor.height *= L.body[1];
    actor.proxy?.scale.set(L.body[0], L.body[1], 1); if (actor.proxy) actor.proxy.position.y *= L.body[1];
    actor.blob?.scale.multiplyScalar(Math.max(L.body[0], L.body[2]));
  }
  actor.look = L.idle ? { rate: 1, sway: 1, loll: 1, ...L.idle } : null;
  if (actor.look?.rate && actor.cur) actor.cur.timeScale *= actor.look.rate;
  return L;
}
