// The 3D phone that flies through the page (same machinery as TamaPet's three-scene.js):
// anchor = scroll path pose → follow = cursor tilt → idle = always-on float/sway.
// The screen is a canvas texture, exposed as window.__phoneScreen for the section visuals.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const canvas = document.getElementById('stage');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  console.error('[CalorieEarn] WebGL unavailable', err);
  throw err;
}
// Always render at 2x and let the browser scale it down: on normal (1x) screens that supersamples the phone,
// which smooths the stair-stepping on the thin metal frame. Capped at 2x so high-DPI screens don't go beyond.
renderer.setPixelRatio(2);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 6);

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 4, 5);
scene.add(key);
// Neutral rim from behind so the frame's edge separates from the dark page (no coloured light).
const rim = new THREE.DirectionalLight(0xffffff, 1.6);
rim.position.set(-4, 2, -3);
scene.add(rim);

const anchor = new THREE.Group();
const follow = new THREE.Group();
const idle = new THREE.Group();
anchor.add(follow);
follow.add(idle);
scene.add(anchor);

// Cursor follow: only on real mouse/trackpad devices, eased so it trails the cursor.
const FOLLOW = { yaw: 0.3, pitch: 0.18, shift: 0.06, ease: 3.2 };
const pointer = { x: 0, y: 0 };
if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer.x = 0; pointer.y = 0; });
}

const MODEL_HEIGHT = 1.9;

// Flight path. Each point is reached at a scroll position:
//   f   → that fraction of the element (0 = top, 1 = bottom) is at mid-screen
//   pin → 'start' / 'end' of a pinned (sticky) section: the phone holds still in between
//         (settle = keep gliding this far into the pin, in screen heights, so it comes to rest softly)
//   box → lands on that element, sized to its height
// x = fraction of the screen width from the centre, y = of the height, s = scale.
// a = extra resting angle at that point [tilt back/forward, turn, lean] in radians, on top of the 3/4 turn
// toward the text (THREE_Q), so each stop sits a little differently. The how-it-works hold turns back toward
// you (+turn) so its screen stays readable.
// spin = a twirl on the way in (1 = one way, -1 = the other), finishing screen-forward as it arrives.
const PATH = [
  { el: '#hero',      x: 0.22,  y: -0.01, s: 1, a: [-0.05, 0.05, 0.06] },
  { el: '#how',       pin: 'start', settle: 0.7, x: 0.22, s: 0.92, a: [0, 0.35, 0] },
  { el: '#how',       pin: 'end',   x: 0.22, s: 0.92, a: [0, 0.35, 0] },
  { el: '#logging',   f: 0.5,  x: -0.24, a: [0.1, 0, -0.06] },
  { el: '#nutrition', f: 0.5,  x: 0.24,  a: [-0.06, 0, 0.08], spin: 1 },
  { el: '#habits',    f: 0.5,  x: -0.24, a: [0.05, 0, -0.1] },
  { el: '#rewards',   f: 0.5,  x: 0.24,  a: [-0.08, 0, 0.05], spin: -1 },
  { el: '#treasury',  f: 0.5,  x: -0.24, a: [0.1, 0, 0.08] },
  { el: '#privacy',   f: 0.5,  x: 0.24,  a: [-0.05, 0, -0.06] },
  { el: '.final-spot', box: true, a: [0, 0, 0] },
];
const BASE_SCALE = 0.85;
const BOX_FIT = 1;            // phone height vs. box height when it lands on a box
const SPIN_SPAN = 0.8;        // a spin runs over this much scroll before its point (fraction of screen height)
const THREE_Q = 0.62;         // 3/4 view: how far it turns toward the text at a side stop (~35°), flipping as it crosses
const ZOOM = 0.16;            // pulls back this much (share of its size) mid-crossing, zooming back in as it lands
const TWIRL = { tilt: 0.35, lean: 0.22, lift: 0.035 }; // a spin leans back, sideways and up mid-turn, then settles
const PATH_EASE = 4;          // how tightly the phone trails the path
const AWAY_RAMP = 0.5;        // at the end: scroll (fraction of screen height) over which it eases into moving with the page
const BANK = 0.1;             // sideways tilt per unit of horizontal speed

const PATH_DEBUG = new URLSearchParams(location.search).has('pathdebug');

const view = { w: 1, h: 1, visW: 1, visH: 1, narrow: false, boxW: 1, boxH: 1 };
// Only a box around the phone is rendered, not the whole window: the canvas is that box and follows the phone,
// and the camera renders just that part of its view (setViewOffset). Same picture and the same 2x sharpness,
// a fraction of the pixels. The phone is at most ~0.6 of the window tall, so 0.84 leaves room for spins and tilts.
const BOX = 0.84;
const _c = new THREE.Vector3();
let curves = null;

// Between points: zero sideways speed at each point, fastest mid-crossing (round U-bends).
const ROUND = { min: 2, max: 2.7, slope: 0.35 };
const bend = (t, p) => (t < 0.5 ? 2 ** (p - 1) * t ** p : 1 - (2 - 2 * t) ** p / 2);
function stretchPowers(ats, xs, screenW) {
  return ats.slice(1).map((at, i) => {
    const swing = Math.abs(xs[i + 1] - xs[i]) * screenW;
    const ratio = swing > 0 ? (at - ats[i]) / swing : Infinity;
    return Math.min(ROUND.max, Math.max(ROUND.min, ROUND.max + 0.2 - ROUND.slope * ratio));
  });
}
function waveCurve(ats, vals, pows) {
  const n = ats.length;
  return (s) => {
    if (s <= ats[0]) return vals[0];
    if (s >= ats[n - 1]) return vals[n - 1];
    let i = 0;
    while (s > ats[i + 1]) i++;
    const t = (s - ats[i]) / (ats[i + 1] - ats[i]);
    return vals[i] + (vals[i + 1] - vals[i]) * bend(t, pows ? pows[i] : 2);
  };
}

function measure() {
  view.w = innerWidth;
  view.h = innerHeight;
  view.boxH = Math.min(view.h, Math.ceil(view.h * BOX));
  view.boxW = Math.min(view.w, view.boxH);
  renderer.setSize(view.boxW, view.boxH, false);
  canvas.style.width = view.boxW + 'px';
  canvas.style.height = view.boxH + 'px';
  camera.aspect = view.w / view.h;
  camera.updateProjectionMatrix();
  view.visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  view.visW = view.visH * camera.aspect;
  view.narrow = camera.aspect < 0.9;

  const narrowScale = Math.min(1, (view.visW * 0.8) / (MODEL_HEIGHT * 0.85));
  const pxPerWorld = view.h / view.visH;
  const maxScroll = document.documentElement.scrollHeight - view.h;
  const knots = PATH.map((p, i) => {
    const r = document.querySelector(p.el).getBoundingClientRect();
    const top = r.top + scrollY;
    if (p.box) {
      return {
        at: top + r.height / 2 - view.h / 2,
        x: (r.left + r.width / 2) / view.w - 0.5,
        y: 0,
        s: THREE.MathUtils.clamp((r.height * BOX_FIT) / (MODEL_HEIGHT * pxPerWorld), 0.3, 1),
        a: p.a ?? [0, 0, 0],
      };
    }
    let x = p.x, s = p.s ?? BASE_SCALE;
    if (view.narrow) { x *= 0.4; s *= narrowScale; }
    let at;
    if (i === 0) at = 0;
    else if (p.pin === 'start') at = top + (p.settle ?? 0) * view.h;
    else if (p.pin === 'end') at = top + r.height - view.h;
    else at = top + (p.f ?? 0.5) * r.height - view.h / 2;
    return { at, x, y: p.y ?? 0, s, a: p.a ?? [0, 0, 0] };
  });

  // Points near the bottom can't reach mid-screen (the page ends first): spread them over the remaining scroll.
  const over = knots.findIndex((k) => k.at > maxScroll);
  if (over > 0) {
    const from = knots[over - 1].at, n = knots.length - over;
    for (let j = 0; j < n; j++) knots[over + j].at = from + ((maxScroll - from) * (j + 1)) / n;
  }
  for (let i = 1; i < knots.length; i++) knots[i].at = Math.max(knots[i].at, knots[i - 1].at + 1);

  const span = view.h * SPIN_SPAN;
  // Start no earlier than the previous point, so it never spins while still resting there.
  spins = PATH.flatMap((p, i) => (p.spin
    ? [{ from: Math.max(knots[i].at - span, i > 0 ? knots[i - 1].at : 0), to: knots[i].at, dir: p.spin }]
    : []));

  const ats = knots.map((k) => k.at);
  if (PATH_DEBUG) window.__phoneStops = ats; // `?pathdebug`: scroll positions of each stop, for checking poses
  lastAt = ats[ats.length - 1];
  const xs = knots.map((k) => k.x);
  const pows = stretchPowers(ats, xs, view.w);
  // Zoom: 1 at each stop, pulled back mid-way through every side-to-side crossing.
  const zoom = (s) => {
    let i = 0;
    while (i < ats.length - 1 && s > ats[i + 1]) i++;
    if (i >= ats.length - 1 || s <= ats[i] || Math.abs(xs[i + 1] - xs[i]) < 0.1) return 1;
    return 1 - ZOOM * Math.sin(Math.PI * (s - ats[i]) / (ats[i + 1] - ats[i]));
  };
  curves = {
    x: waveCurve(ats, knots.map((k) => k.x), pows),
    y: waveCurve(ats, knots.map((k) => k.y), pows),
    s: waveCurve(ats, knots.map((k) => k.s), pows),
    zoom,
    ax: waveCurve(ats, knots.map((k) => k.a[0]), pows),
    ay: waveCurve(ats, knots.map((k) => k.a[1]), pows),
    az: waveCurve(ats, knots.map((k) => k.a[2]), pows),
  };
}

const cur = { x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0, bank: 0 };
let spins = [];
// Spin state at a scroll position: total turns so far, and the twirl flourish (0 at rest, 1 mid-turn).
function spinAt(s) {
  let turns = 0, swirl = 0, dir = 0;
  for (const sp of spins) {
    if (s >= sp.to) turns += sp.dir;
    else if (s > sp.from) {
      const e = bend((s - sp.from) / (sp.to - sp.from), 2);
      turns += sp.dir * e;
      swirl = Math.sin(Math.PI * e);
      dir = sp.dir;
    }
  }
  return { turns, swirl, dir };
}
let lastAt = 0; // scroll position of the last path point: past it, the phone scrolls away with the page
let snapped = false;

function updatePath(dt) {
  const k = snapped ? 1 - Math.exp(-PATH_EASE * dt) : 1;
  snapped = true;
  const prevX = cur.x;
  const s = scrollY;
  const spin = spinAt(s);
  const x = curves.x(s);
  const target = {
    x,
    y: curves.y(s) + spin.swirl * TWIRL.lift,
    s: curves.s(s) * curves.zoom(s),
    rx: curves.ax(s) - spin.swirl * TWIRL.tilt,
    // 3/4 turn toward the text: full at a side stop (|x| ≈ 0.24), passing through face-on mid-crossing.
    ry: spin.turns * Math.PI * 2 - THREE.MathUtils.clamp(x / 0.24, -1, 1) * THREE_Q + curves.ay(s),
    rz: curves.az(s) + spin.swirl * spin.dir * TWIRL.lean,
  };
  for (const c in target) cur[c] += (target[c] - cur[c]) * k;
  // Bank into horizontal moves.
  const vx = dt > 0 ? ((cur.x - prevX) * view.visW) / dt : 0;
  const bankTarget = THREE.MathUtils.clamp(-vx * BANK, -0.35, 0.35);
  cur.bank += (bankTarget - cur.bank) * (1 - Math.exp(-4 * dt));

  // Past the last stop it moves up with the page. That part is NOT eased (it has to stay tied to the scroll,
  // or a fast scroll makes it lag and catch up = a bounce). Instead its speed ramps from still to page speed
  // over AWAY_RAMP of scroll centred on the stop, so it doesn't hit a wall; it's exactly on its spot (and moving
  // with the page) at the end of the ramp.
  const R = view.h * AWAY_RAMP, d = s - lastAt;
  const away = (d <= -R / 2 ? 0 : d < R / 2 ? (d + R / 2) ** 2 / (2 * R) : d) / view.h;
  anchor.position.set(cur.x * view.visW, (cur.y + away) * view.visH, 0);
  if (PATH_DEBUG) window.__phoneY = view.h / 2 - (cur.y + away) * view.h; // phone centre on screen, px from top
  anchor.scale.setScalar(cur.s);
  anchor.rotation.set(cur.rx, cur.ry, cur.rz + cur.bank);
}

/* ---------- Screen: a canvas the section visuals (js/screens.js) draw into ---------- */
const SCREEN_W = 540, SCREEN_H = 1170;
const screenCanvas = document.createElement('canvas');
screenCanvas.width = SCREEN_W;
screenCanvas.height = SCREEN_H;
const sctx = screenCanvas.getContext('2d');
const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

window.__phoneScreen = { canvas: screenCanvas, ctx: sctx, texture: screenTex, width: SCREEN_W, height: SCREEN_H };

/* ---------- Model ---------- */
// Brand restyle: graphite frame, near-black green back. (The Apple logo was merged into the back
// material when the model was built, so it doesn't show.)
const RESTYLE = {
  GOLD: { color: 0x3b403a, metalness: 1, roughness: 0.3 }, // a touch rough: razor-thin highlights alias
  Back: { color: 0x0b1209, metalness: 0.35, roughness: 0.6 },
};

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load('assets/phone.glb', (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name;
    if (RESTYLE[name]) {
      const m = o.material;
      m.color.setHex(RESTYLE[name].color);
      m.metalness = RESTYLE[name].metalness;
      m.roughness = RESTYLE[name].roughness;
    }
    if (name === 'Display') {
      o.material = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.scale.setScalar(MODEL_HEIGHT / size.y);
  wrap.rotation.y = -Math.PI / 2; // the model's screen faces +X
  idle.add(wrap);

  measure();
  start();
  // tell the intro we're ready; the phone fades in when the intro has finished
  window.__phoneReady = true;
  dispatchEvent(new Event('phone:ready'));
  const show = () => canvas.classList.add('is-in');
  if (window.__introDone) show(); else addEventListener('intro:done', show, { once: true });
}, (e) => {
  if (e.total) dispatchEvent(new CustomEvent('phone:progress', { detail: e.loaded / e.total }));
}, (err) => {
  console.error('[CalorieEarn] phone model failed to load', err);
  dispatchEvent(new Event('phone:ready')); // don't keep the intro up
});

// Re-measure stop positions whenever the layout or window size changes.
new ResizeObserver(() => curves && measure()).observe(document.body);
addEventListener('resize', () => curves && measure());
document.fonts.ready.then(() => curves && measure());

const clock = new THREE.Clock();
function start() {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    updatePath(dt);
    const k = 1 - Math.exp(-FOLLOW.ease * dt);
    follow.rotation.y += (pointer.x * FOLLOW.yaw - follow.rotation.y) * k;
    follow.rotation.x += (pointer.y * FOLLOW.pitch - follow.rotation.x) * k;
    follow.position.x += (pointer.x * FOLLOW.shift - follow.position.x) * k;
    follow.position.y += (-pointer.y * FOLLOW.shift - follow.position.y) * k;
    if (!reduceMotion) {
      idle.position.y = Math.sin(t * 0.9) * 0.05;
      idle.rotation.y = Math.sin(t * 0.45) * 0.14;
      idle.rotation.z = Math.sin(t * 0.7) * 0.03;
      idle.rotation.x = Math.sin(t * 0.6) * 0.035;
    }
    renderBox();
  });
}
// Find where the phone's centre lands on screen, put the canvas box there and render only that part of the view.
function renderBox() {
  camera.clearViewOffset();
  scene.updateMatrixWorld();
  camera.updateMatrixWorld(); // the camera isn't in the scene: update it here, or the first projection uses a stale camera
  idle.getWorldPosition(_c).project(camera);
  const dpr = devicePixelRatio || 1, snap = (v) => Math.round(v * dpr) / dpr;   // whole device pixels: no resampling blur
  const x = snap((_c.x + 1) / 2 * view.w - view.boxW / 2);
  const y = snap((1 - _c.y) / 2 * view.h - view.boxH / 2);
  canvas.style.translate = `${x}px ${y}px`;
  if (x >= view.w || y >= view.h || x + view.boxW <= 0 || y + view.boxH <= 0) return; // fully off screen: nothing to draw
  camera.setViewOffset(view.w, view.h, x, y, view.boxW, view.boxH);
  renderer.render(scene, camera);
}
