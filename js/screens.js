// What the 3D phone's screen shows. Draws into the canvas phone3d.js maps onto the display.
// The screens are redrawn 1:1 from the real app's screenshots (D:\Downloads\CALORIE APP SCREENSHOTS.png), so they
// stay sharp on the phone and can animate. All drawing happens in "shot space": 720×1560, the screenshots at 2×,
// scaled down to the 540×1170 canvas — positions are read straight off the screenshots.
// The screen follows the section in the middle of the viewport and crossfades when it changes.
// How it works is tied to scrolling (window.__how from main.js); the rest play a short intro, then hold.

const screen = window.__phoneScreen;
const { width: W, height: H, texture } = screen;
const screenCtx = screen.ctx;
// During a crossfade the incoming screen is drawn whole on this offscreen canvas first, then faded in as one
// image. (Drawing it layer by layer at partial opacity let its dark background dim the old screen mid-fade.)
const fadeCanvas = document.createElement('canvas');
fadeCanvas.width = W; fadeCanvas.height = H;
const fadeCtx = fadeCanvas.getContext('2d');
let ctx = screenCtx; // every drawing helper draws into whichever canvas this points at
const UW = 720, UH = 1560, US = W / UW; // shot space

const C = {
  text: '#ffffff', mute: 'rgba(232,242,228,.62)', dim: 'rgba(232,242,228,.36)',
  acc: '#a9e48c', accText: '#0d1a0b', glass: 'rgba(150,205,135,.15)', glassLine: 'rgba(255,255,255,.12)',
  chip: 'rgba(150,205,135,.11)', soft: 'rgba(255,255,255,.07)', red: '#f0a28c',
};

const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
const easeOut = (t) => 1 - (1 - clamp(t)) ** 3;
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const span = (t, a, b) => clamp((t - a) / (b - a)); // 0→1 while t goes a→b
const press = (k) => 1 - Math.sin(clamp(k) * Math.PI) * 0.05; // button squeeze

/* ---------- drawing helpers ---------- */
function font(size, weight = 400) { ctx.font = `${weight} ${size}px Inter, "DM Sans", sans-serif`; }
function text(s, x, y, size, color = C.text, weight = 400, align = 'left') {
  font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}
const lines = (arr, x, y, lh, size, color = C.mute, weight = 400, align = 'left') => arr.forEach((s, i) => text(s, x, y + i * lh, size, color, weight, align));
function box(x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function circle(cx, cy, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
// the app's frosted cards: tinted fill, hairline border, faint sheen along the top
function glass(x, y, w, h, r = 40, fill = C.glass) {
  box(x, y, w, h, r, fill, C.glassLine);
  const g = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 160));
  g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  box(x, y, w, h, r, g);
}
function pill(x, y, w, h, label, { fill = C.chip, color = C.text, size = 23, weight = 500 } = {}) {
  box(x, y, w, h, h / 2, fill);
  text(label, x + w / 2, y + h / 2 + size * 0.36, size, color, weight, 'center');
}
// Draw with extra transparency on top of whatever is current (keeps the crossfade intact).
function faded(a, fn) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  fn();
  ctx.restore();
}
// A screen's blocks. They used to fade in one by one, but that left the screen mostly dark background for a
// moment (it read as the screen dimming), so screens now arrive whole and only the crossfade moves them in.
function rise(t, i, fn) { fn(); }

// The app's mark = the logo's black crossing arrows, in the accent green: cut out of logo.jpg by darkness.
const logo = new Image();
logo.src = 'assets/logo.jpg';
let markImg = null;
function makeMark() {
  const c = document.createElement('canvas'); c.width = c.height = 200;
  const x = c.getContext('2d');
  const n = logo.naturalWidth; // only the middle of the logo: the mark sits there on bright green (corners are dark)
  x.drawImage(logo, n * 0.27, n * 0.27, n * 0.46, n * 0.46, 0, 0, 200, 200);
  const d = x.getImageData(0, 0, 200, 200), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
    px[i + 3] = Math.round(clamp(1 - lum / 0.32) * 255);
    px[i] = 169; px[i + 1] = 228; px[i + 2] = 140;
  }
  x.putImageData(d, 0, 0);
  markImg = c;
}

/* ---------- icons (line icons, centred on cx, cy; s = size) ---------- */
function icon(name, cx, cy, s, color = C.acc, lw = 3) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const k = s / 2, P = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k))); ctx.stroke(); };
  const O = (x, y, r) => { ctx.beginPath(); ctx.arc(x * k, y * k, r * k, 0, Math.PI * 2); ctx.stroke(); };
  const R = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x * k, y * k, w * k, h * k, r * k); ctx.stroke(); };
  switch (name) {
    case 'person': O(0, -0.35, 0.3); ctx.beginPath(); ctx.arc(0, 0.95 * k, 0.7 * k, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); break;
    case 'chevL': P([[0.25, -0.5], [-0.25, 0], [0.25, 0.5]]); break;
    case 'chevR': P([[-0.25, -0.5], [0.25, 0], [-0.25, 0.5]]); break;
    case 'fork': // crossed knife and fork
      // knife: handle bottom-left, blade top-right
      P([[-0.75, 0.75], [-0.05, 0.05]]);
      ctx.beginPath(); ctx.moveTo(-0.1 * k, 0.1 * k); ctx.lineTo(0.55 * k, -0.75 * k); ctx.quadraticCurveTo(0.85 * k, -0.6 * k, 0.25 * k, 0.15 * k); ctx.closePath(); ctx.stroke();
      // fork: handle bottom-right, tines top-left
      P([[0.75, 0.75], [-0.2, -0.2]]);
      P([[-0.2, -0.2], [-0.42, -0.02]]); P([[-0.2, -0.2], [0.02, -0.42]]);
      P([[-0.42, -0.02], [-0.8, -0.4]]); P([[0.02, -0.42], [-0.4, -0.8]]); P([[-0.2, -0.2], [-0.6, -0.6]]);
      break;
    case 'sun': O(0, 0, 0.36); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; P([[Math.cos(a) * 0.62, Math.sin(a) * 0.62], [Math.cos(a) * 0.88, Math.sin(a) * 0.88]]); } break;
    case 'cal': R(-0.8, -0.7, 1.6, 1.5, 0.25); P([[-0.8, -0.3], [0.8, -0.3]]); P([[-0.4, -0.95], [-0.4, -0.6]]); P([[0.4, -0.95], [0.4, -0.6]]); break;
    case 'calFill': ctx.beginPath(); ctx.roundRect(-0.8 * k, -0.7 * k, 1.6 * k, 1.5 * k, 0.25 * k); ctx.fill(); break;
    case 'bars': [[-0.75, 0.2], [-0.3, -0.2], [0.15, -0.75], [0.6, -0.35]].forEach(([x, top]) => { ctx.beginPath(); ctx.roundRect(x * k, top * k, 0.3 * k, (0.8 - top) * k, 0.1 * k); lw > 3 ? ctx.fill() : ctx.stroke(); }); break;
    case 'gift': R(-0.75, -0.25, 1.5, 1.05, 0.12); P([[-0.85, -0.25], [0.85, -0.25]]); P([[0, -0.25], [0, 0.8]]); P([[0, -0.25], [-0.45, -0.75], [-0.1, -0.7], [0, -0.25], [0.1, -0.7], [0.45, -0.75], [0, -0.25]]); break;
    case 'plus': P([[-0.7, 0], [0.7, 0]]); P([[0, -0.7], [0, 0.7]]); break;
    case 'search': O(-0.15, -0.15, 0.55); P([[0.27, 0.27], [0.75, 0.75]]); break;
    case 'camera': R(-0.85, -0.5, 1.7, 1.25, 0.25); O(0, 0.12, 0.33); P([[-0.35, -0.5], [-0.2, -0.75], [0.2, -0.75], [0.35, -0.5]]); break;
    case 'barcode': P([[-0.9, -0.45], [-0.9, -0.75], [-0.6, -0.75]]); P([[0.6, -0.75], [0.9, -0.75], [0.9, -0.45]]); P([[-0.9, 0.45], [-0.9, 0.75], [-0.6, 0.75]]); P([[0.6, 0.75], [0.9, 0.75], [0.9, 0.45]]);
      [-0.55, -0.3, -0.1, 0.15, 0.35, 0.55].forEach((x) => P([[x, -0.45], [x, 0.45]])); break;
    case 'close': P([[-0.6, -0.6], [0.6, 0.6]]); P([[0.6, -0.6], [-0.6, 0.6]]); break;
    case 'db': ctx.beginPath(); ctx.ellipse(0, -0.5 * k, 0.6 * k, 0.25 * k, 0, 0, Math.PI * 2); ctx.stroke(); P([[-0.6, -0.5], [-0.6, 0.55]]); P([[0.6, -0.5], [0.6, 0.55]]);
      [0, 0.55].forEach((y) => { ctx.beginPath(); ctx.ellipse(0, y * k, 0.6 * k, 0.25 * k, 0, 0, Math.PI); ctx.stroke(); }); break;
    case 'userc': O(0, 0, 0.85); O(0, -0.2, 0.28); ctx.beginPath(); ctx.arc(0, 0.75 * k, 0.5 * k, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
    case 'wallet': R(-0.8, -0.55, 1.6, 1.15, 0.2); P([[-0.8, -0.2], [0.8, -0.2]]); R(0.2, 0.0, 0.6, 0.3, 0.1); break;
    case 'flag': P([[-0.6, 0.8], [-0.6, -0.75]]); P([[-0.6, -0.75], [0.6, -0.75], [0.35, -0.4], [0.6, -0.05], [-0.6, -0.05]]); break;
    case 'spark': [[0.1, -0.1, 0.55], [-0.5, 0.45, 0.28], [-0.5, -0.5, 0.2]].forEach(([x, y, r]) => P([[x, y - r], [x + r * 0.25, y - r * 0.25], [x + r, y], [x + r * 0.25, y + r * 0.25], [x, y + r], [x - r * 0.25, y + r * 0.25], [x - r, y], [x - r * 0.25, y - r * 0.25], [x, y - r]])); break;
    case 'people': O(-0.3, -0.3, 0.25); O(0.4, -0.25, 0.2); ctx.beginPath(); ctx.arc(-0.3 * k, 0.55 * k, 0.5 * k, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(0.45 * k, 0.5 * k, 0.4 * k, Math.PI * 1.2, Math.PI * 1.9); ctx.stroke(); break;
    case 'trend': P([[-0.85, 0.4], [-0.35, -0.1], [0.05, 0.25], [0.8, -0.45]]); P([[0.45, -0.45], [0.8, -0.45], [0.8, -0.1]]); break;
    case 'buoy': O(0, 0, 0.8); O(0, 0, 0.35); [0.25, 0.75, 1.25, 1.75].forEach((a) => { const c = Math.cos(a * Math.PI), s2 = Math.sin(a * Math.PI); P([[c * 0.35, s2 * 0.35], [c * 0.8, s2 * 0.8]]); }); break;
    case 'down': P([[0, -0.75], [0, 0.25]]); P([[-0.35, -0.1], [0, 0.25], [0.35, -0.1]]); P([[-0.75, 0.1], [-0.75, 0.75], [0.75, 0.75], [0.75, 0.1]]); break;
    case 'trash': P([[-0.75, -0.5], [0.75, -0.5]]); P([[-0.25, -0.5], [-0.2, -0.8], [0.2, -0.8], [0.25, -0.5]]); P([[-0.55, -0.5], [-0.45, 0.8], [0.45, 0.8], [0.55, -0.5]]); P([[-0.15, -0.2], [-0.15, 0.5]]); P([[0.15, -0.2], [0.15, 0.5]]); break;
    case 'pencil': P([[0.1, -0.75], [-0.75, -0.75], [-0.75, 0.75], [0.75, 0.75], [0.75, -0.1]]); P([[-0.2, 0.25], [-0.15, -0.05], [0.55, -0.75], [0.8, -0.5], [0.1, 0.2], [-0.2, 0.25]]); break;
    case 'check': P([[-0.7, 0.05], [-0.2, 0.55], [0.7, -0.5]]); break;
    case 'doc': P([[0.25, -0.85], [-0.65, -0.85], [-0.65, 0.85], [0.65, 0.85], [0.65, -0.45], [0.25, -0.85], [0.25, -0.45], [0.65, -0.45]]); P([[-0.35, 0.05], [0.35, 0.05]]); P([[-0.35, 0.4], [0.35, 0.4]]); break;
    case 'mark': if (markImg) ctx.drawImage(markImg, -k, -k, k * 2, k * 2); break;
    case 'apple': {
      ctx.beginPath();
      ctx.moveTo(0, -0.45 * k);
      ctx.bezierCurveTo(-0.3 * k, -0.7 * k, -0.85 * k, -0.6 * k, -0.8 * k, 0.05 * k);
      ctx.bezierCurveTo(-0.75 * k, 0.6 * k, -0.4 * k, 0.95 * k, -0.2 * k, 0.9 * k);
      ctx.bezierCurveTo(-0.05 * k, 0.85 * k, 0.05 * k, 0.85 * k, 0.2 * k, 0.9 * k);
      ctx.bezierCurveTo(0.45 * k, 0.95 * k, 0.65 * k, 0.55 * k, 0.75 * k, 0.3 * k);
      ctx.bezierCurveTo(0.4 * k, 0.15 * k, 0.4 * k, -0.35 * k, 0.7 * k, -0.45 * k);
      ctx.bezierCurveTo(0.5 * k, -0.7 * k, 0.25 * k, -0.65 * k, 0, -0.45 * k);
      ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.12 * k, -0.8 * k, 0.12 * k, 0.25 * k, 0.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/* ---------- app chrome ---------- */
function greenBg() {
  ctx.fillStyle = '#040504'; ctx.fillRect(0, 0, UW, UH);
  const g = ctx.createRadialGradient(430, 150, 0, 430, 150, 760);
  g.addColorStop(0, '#3fa54e'); g.addColorStop(0.28, '#2a8a3a'); g.addColorStop(0.55, 'rgba(22,84,32,.75)'); g.addColorStop(1, 'rgba(4,5,4,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, UW, UH);
  const v = ctx.createLinearGradient(0, 0, 0, UH);
  v.addColorStop(0, 'rgba(4,5,4,0)'); v.addColorStop(0.28, 'rgba(4,5,4,0)'); v.addColorStop(0.5, 'rgba(4,5,4,.85)'); v.addColorStop(0.6, '#040504');
  ctx.fillStyle = v; ctx.fillRect(0, 0, UW, UH);
  const l = ctx.createLinearGradient(0, 0, UW, 0);
  l.addColorStop(0, 'rgba(4,5,4,.45)'); l.addColorStop(0.45, 'rgba(4,5,4,0)');
  ctx.fillStyle = l; ctx.fillRect(0, 0, UW, UH);
}
// modal sheet over the green: dark panel from y, rounded top, grab handle
function sheet(y = 112) {
  greenBg();
  box(0, y, UW, UH - y + 60, 60, '#070907');
  box(330, y + 28, 60, 8, 4, 'rgba(255,255,255,.22)');
}
function statusBar() {
  text('9:41', 90, 56, 30, C.text, 600);
  [512, 523, 534, 545].forEach((x) => circle(x, 67, 2.6, 'rgba(255,255,255,.4)'));
  // wifi
  ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineWidth = 4.5;
  [20, 13, 6].forEach((r) => { ctx.beginPath(); ctx.arc(578, 68, r, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke(); });
  circle(578, 66, 2.5, '#fff'); ctx.restore();
  box(612, 46, 44, 22, 7, '#fff');
  box(658, 52, 4, 10, 2, 'rgba(255,255,255,.5)');
}
function header(title, sub, { chevrons = false } = {}) {
  circle(650, 165, 38, 'rgba(150,215,135,.3)', 'rgba(255,255,255,.2)');
  icon('person', 650, 165, 30, C.acc, 3);
  text(title, 30, 278, 60, C.text, 700);
  if (sub) text(sub, 30, 324, 24, 'rgba(255,255,255,.78)');
  if (chevrons) monthNav(284);
}
function monthNav(cy, dark = false) {
  circle(560, cy, 37, dark ? 'rgba(255,255,255,.08)' : 'rgba(150,215,135,.3)', 'rgba(255,255,255,.14)');
  icon('chevL', 560, cy, 22, C.acc, 3.5);
  circle(650, cy, 37, dark ? 'rgba(255,255,255,.04)' : 'rgba(150,215,135,.12)', 'rgba(255,255,255,.08)');
  icon('chevR', 650, cy, 22, 'rgba(169,228,140,.45)', 3.5);
}
const TABS = [['Today', 'sun'], ['History', 'cal'], ['Progress', 'bars'], ['Rewards', 'gift']];
function tabBar(active) {
  box(33, 1393, 522, 110, 55, 'rgba(26,30,26,.94)', 'rgba(255,255,255,.12)');
  TABS.forEach(([label, ic], i) => {
    const cx = 100 + i * 128.7, on = i === active;
    if (on) box(cx - 63, 1399, 126, 98, 49, 'rgba(255,255,255,.1)');
    const col = on ? C.acc : 'rgba(255,255,255,.72)';
    icon(on && ic === 'cal' ? 'calFill' : ic, cx, 1435, 32, col, on && ic === 'bars' ? 4 : 2.6);
    text(label, cx, 1477, 19, on ? C.text : 'rgba(255,255,255,.72)', on ? 600 : 500, 'center');
  });
  circle(633, 1447, 57, C.acc);
  icon('plus', 633, 1447, 34, C.accText, 3.5);
}
function chevRow(y) { icon('chevR', 645, y, 18, 'rgba(255,255,255,.35)', 3); }
function rowIcon(name, cy) { circle(93, cy, 36, C.soft); icon(name, 93, cy, 30, C.acc, 2.6); }
function calendar(top, { dot = null } = {}) {
  // October 2026 (the 1st is a Thursday); today = 24, later days dimmed
  const xs = [100, 186, 272, 358, 445, 531, 618];
  'MTWTFSS'.split('').forEach((d, i) => text(d, xs[i], top + 57, 19, C.mute, 500, 'center'));
  for (let day = 1; day <= 31; day++) {
    const idx = day + 2, col = idx % 7, row = Math.floor(idx / 7), cy = top + 111 + row * 82.5;
    if (day === 24) {
      const d = dot ?? 0;
      if (d > 0) circle(xs[col], cy, 33, `rgba(169,228,140,${0.9 * d})`);
      circle(xs[col], cy, 33, null, C.acc, 3);
      text('24', xs[col], cy + 9, 26, d > 0.5 ? C.accText : C.text, d > 0.5 ? 600 : 400, 'center');
    } else text(String(day), xs[col], cy + 9, 26, day > 24 ? C.dim : C.text, 400, 'center');
  }
}

/* ---------- screens ---------- */
// t = seconds since it came on screen (null = no intro); how-it-works steps take lp = scroll progress 0..1 in that step.

function today(t = null, { addPress = 0 } = {}) {
  greenBg();
  rise(t, 0, () => header('Today', 'Saturday 24 October', { chevrons: true }));
  rise(t, 1, () => {
    glass(30, 367, 660, 493);
    circle(360, 473, 57, 'rgba(255,255,255,.1)');
    icon('fork', 360, 473, 44, C.acc, 3);
    text('Nothing logged yet today', 360, 588, 30, C.text, 600, 'center');
    lines(['Add your first meal. Search, scan a barcode, or', 'type it in.'], 360, 643, 32, 23, C.mute, 400, 'center');
    const s = press(addPress), bw = 604 * s, bh = 92 * s;
    box(360 - bw / 2, 764 - bh / 2, bw, bh, bh / 2, C.acc);
    icon('plus', 290, 764, 22, C.accText, 3);
    text('Add food', 322, 773, 26, C.accText, 600);
  });
  rise(t, 2, () => {
    glass(30, 883, 660, 455, 40, 'rgba(150,205,135,.13)');
    circle(100, 955, 35, 'rgba(0,0,0,.12)', 'rgba(255,255,255,.07)');
    text('Daily check-in', 165, 950, 28, C.text, 600);
    text('Log or repeat a meal, then check in.', 165, 984, 21, C.mute);
    [100, 186, 272, 358, 445, 531, 618].forEach((x, i) => {
      text('MTWTFSS'[i], x, 1050, 20, i === 5 ? C.text : C.mute, i === 5 ? 600 : 500, 'center');
      if (i < 6) circle(x, 1092, 27, 'rgba(0,0,0,.14)', i === 5 ? C.acc : 'rgba(255,255,255,.05)', i === 5 ? 3 : 2);
    });
    box(58, 1148, 604, 42, 21, 'rgba(255,255,255,.06)');
    circle(87, 1169, 7, null, C.mute, 2);
    text('Any 5 days a week · a fresh week starts Monday', 106, 1177, 20, C.mute, 500);
    box(58, 1220, 604, 90, 45, 'rgba(255,255,255,.06)', 'rgba(255,255,255,.05)');
    text('Add food first', 360, 1275, 27, C.dim, 500, 'center');
  });
  tabBar(0);
}

function addFood(t = null, { typed = '', caret = false, chip = 0, slide = 1 } = {}) {
  // the sheet slides up over Today when it opens
  if (slide < 1) today();
  ctx.save();
  ctx.translate(0, (1 - easeOut(slide)) * UH);
  sheet();
  text('Add food', 30, 212, 40, C.text, 700);
  text('Lunch · Today', 30, 244, 21, C.mute);
  circle(657, 211, 33, 'rgba(255,255,255,.12)'); icon('close', 657, 211, 20, C.text, 3.5);
  box(30, 272, 454, 88, 44, C.chip, typed ? 'rgba(169,228,140,.55)' : null);
  icon('search', 72, 316, 26, C.mute, 3);
  text(typed || 'Search packaged foods', 105, 326, 27, typed ? C.text : 'rgba(255,255,255,.42)');
  if (caret) { font(27); box(107 + (typed ? ctx.measureText(typed).width : 0), 300, 3, 34, 1, C.acc); }
  circle(542, 316, 44, 'rgba(255,255,255,.07)', 'rgba(255,255,255,.1)'); icon('camera', 542, 316, 34, C.acc, 2.6);
  circle(646, 316, 44, 'rgba(255,255,255,.07)', 'rgba(255,255,255,.1)'); icon('barcode', 646, 316, 34, C.acc, 2.6);
  const s = press(chip);
  ctx.save(); ctx.translate(102, 416); ctx.scale(s, s); pill(-74, -33.5, 148, 67, 'Search', { fill: C.acc, color: C.accText }); ctx.restore();
  pill(190, 383, 147, 67, 'Recent', { fill: 'rgba(150,205,135,.09)' });
  pill(351, 383, 219, 67, 'Saved meals', { fill: 'rgba(150,205,135,.09)' });
  lines(['Search packaged foods by name or brand, then', 'press Search. Coverage is crowd-sourced and', 'incomplete; you can always enter a food manually.'], 37, 532, 32.5, 23);
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, 1389, UW, 2);
  box(30, 1413, 660, 90, 45, 'rgba(255,255,255,.1)', 'rgba(255,255,255,.1)');
  icon('pencil', 244, 1459, 26, C.text, 2.6);
  text('Enter manually', 280, 1469, 28, C.text, 600);
  ctx.restore();
}

const ESTIMATE = [['salmon', '1 small fillet · ~100 g', 'Clear', 120], ['peas', '6 small spheres · ~10 g', 'Rough', 20], ['rice', '1 small pile · ~30 g', 'Rough', 60]];
function photoEstimate(t = null, { shown = 1, tap = -1, tapK = 0, addPress = 0 } = {}) {
  sheet();
  text('Photo estimate', 30, 212, 40, C.text, 700);
  text('Lunch · Today', 30, 244, 21, C.mute);
  circle(657, 211, 33, 'rgba(255,255,255,.12)'); icon('close', 657, 211, 20, C.text, 3.5);
  // the bottom edge of the meal photo (scrolled up under the title)
  ctx.save(); ctx.beginPath(); ctx.roundRect(30, 262, 660, 54, [0, 0, 30, 30]); ctx.clip();
  const wood = ctx.createLinearGradient(0, 262, 0, 316); wood.addColorStop(0, '#5a4130'); wood.addColorStop(1, '#3b2a1d');
  ctx.fillStyle = wood; ctx.fillRect(30, 262, 660, 54);
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2; [282, 298, 309].forEach((y) => { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(690, y + 4); ctx.stroke(); });
  ctx.beginPath(); ctx.ellipse(360, 262, 40, 10, 0, 0, Math.PI); ctx.fillStyle = 'rgba(240,240,235,.85)'; ctx.fill();
  ctx.restore();
  // total counts up as the foods come in
  const total = ESTIMATE.reduce((sum, e, i) => sum + e[3] * easeOut(clamp(shown * 3 - i)), 0);
  const tg = ctx.createLinearGradient(30, 0, 690, 0); tg.addColorStop(0, 'rgba(45,110,45,.55)'); tg.addColorStop(1, 'rgba(30,60,30,.35)');
  box(30, 345, 660, 138, 40, tg, C.glassLine);
  text('Estimated total', 58, 397, 20, C.mute);
  text(`${Math.round(total)} kcal`, 58, 444, 40, C.text, 700);
  box(468, 375, 194, 42, 21, 'rgba(210,200,120,.14)');
  icon('spark', 496, 396, 24, '#dcd28e', 2.2);
  text('AI estimate', 518, 404, 20, '#dcd28e', 600);
  glass(30, 505, 660, 493, 40, 'rgba(120,175,110,.13)');
  ESTIMATE.forEach(([name, sub, tag, kcal], i) => {
    const a = easeOut(clamp(shown * 3 - i)), y = 505 + i * 165;
    if (i) { ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(58, y, 632, 2); }
    faded(a, () => {
      if (i === tap) faded(Math.sin(clamp(tapK) * Math.PI), () => box(34, y + 4, 652, 157, i ? 0 : [36, 36, 0, 0], 'rgba(255,255,255,.07)'));
      text(name, 58, y + 50, 27, C.text, 500);
      text(sub, 58, y + 87, 21, C.mute);
      const clear = tag === 'Clear';
      pill(58, y + 103, clear ? 95 : 107, 40, tag, { fill: clear ? 'rgba(150,205,135,.18)' : 'rgba(255,255,255,.08)', color: clear ? C.acc : C.mute, size: 19, weight: 600 });
      text(`~${kcal}`, 606, y + 92, 28, C.text, 600, 'right');
      icon('chevR', 645, y + 82, 18, 'rgba(255,255,255,.35)', 3);
    });
  });
  lines(['The salmon is a bit stylized, but the portion and shape are', 'clear'], 37, 1045, 27, 20);
  lines(['Tap a food to adjust it before saving. Estimates can be', 'wrong, especially oils, sauces and portion sizes.'], 37, 1121, 27, 20);
  lines(['Estimated on your iPhone by Apple Intelligence. Not', 'medical advice.'], 360, 1205, 27, 20, C.mute, 400, 'center');
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, 1289, UW, 2);
  const s = press(addPress), bw = 660 * s, bh = 92 * s;
  const bg = ctx.createLinearGradient(30, 0, 690, 0); bg.addColorStop(0, '#cdf6ae'); bg.addColorStop(1, '#94dc70');
  box(360 - bw / 2, 1358 - bh / 2, bw, bh, bh / 2, bg);
  icon('check', 238, 1358, 24, C.accText, 3);
  text('Add all to Lunch', 272, 1367, 27, C.accText, 600);
  text('Retake', 360, 1468, 27, C.acc, 600, 'center');
}

function history(t = null, { dot = null } = {}) {
  greenBg();
  rise(t, 0, () => header('History', 'Browse, edit or repeat past meals.'));
  rise(t, 1, () => {
    text('October 2026', 37, 415, 32, C.text, 600);
    monthNav(403);
    glass(30, 461, 660, 559);
    calendar(461, { dot: dot === null ? null : dot.fill });
    // legend; while checking in, the matching entry lights up
    const lg = dot ? dot.logged : 0, ck = dot ? dot.fill : 0;
    circle(68, 979, 10, `rgba(150,205,135,${0.25 + 0.2 * lg})`);
    text('Logged', 90, 987, 21, lg > 0.5 && ck < 0.5 ? C.text : C.mute, 500);
    circle(212, 979, 10, C.acc);
    text('Checked in', 234, 987, 21, ck > 0.5 ? C.text : C.mute, 500);
    if (dot && dot.logged > 0) circle(531, 870, 6, ck > 0.5 ? C.acc : `rgba(150,205,135,${0.6 * dot.logged})`); // small mark under today
  });
  rise(t, 2, () => {
    text('Saved meals', 37, 1106, 31, C.text, 600);
    glass(30, 1137, 660, 183, 40, 'rgba(150,205,135,.13)');
    lines(['Open any day and choose “Save foods as a', 'meal” to keep a combination you eat often.', 'Logging it again creates new entries and never', 'changes the original.'], 58, 1190, 32, 23);
    text('Logged days', 37, 1406, 31, C.text, 600);
    glass(30, 1432, 660, 200, 40, 'rgba(150,205,135,.13)');
  });
  tabBar(1);
}

function progress(t = null) {
  greenBg();
  rise(t, 0, () => header('Progress', 'Your routine, based on what you’ve actually logged.'));
  rise(t, 1, () => {
    glass(30, 367, 660, 390);
    text('This week · 19 Oct – 25 Oct', 58, 418, 20, C.dim, 500);
    text('0', 58, 512, 84, C.text, 700);
    text('of 7 days logged', 127, 508, 24, C.mute);
    for (let i = 0; i < 7; i++) {
      const x = 58 + i * 88.4;
      box(x, 555, 74, 64, 16, i < 6 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.05)');
      text('MTWTFSS'[i], x + 37, 652, 19, C.mute, 500, 'center');
    }
    box(58, 688, 604, 42, 21, 'rgba(255,255,255,.07)');
    icon('flag', 87, 709, 20, C.mute, 2);
    text('Any 5 days counts · a fresh week starts Monday', 106, 717, 20, C.mute, 500);
  });
  rise(t, 2, () => {
    text('Participation', 37, 842, 31, C.text, 600);
    text('October 2026', 37, 921, 32, C.text, 600);
    monthNav(908, true);
    glass(30, 967, 660, 640, 40, 'rgba(150,205,135,.13)');
    calendar(967);
  });
  tabBar(2);
}

function rewards(t = null, { scroll = 0 } = {}) {
  greenBg();
  ctx.save();
  ctx.translate(0, -scroll);
  rise(t, 0, () => header('Rewards', 'Recognition for a consistent routine.'));
  rise(t, 1, () => {
    glass(30, 367, 660, 227);
    text('Your rewards', 58, 418, 20, C.dim, 500);
    text('0', 58, 512, 84, C.text, 700);
    text('Nothing earned yet. No campaign has run.', 58, 561, 21, C.mute);
    circle(605, 481, 57, 'rgba(0,0,0,.35)');
    icon('mark', 605, 481, 50, C.acc, 3);
  });
  rise(t, 2, () => {
    glass(30, 618, 660, 238, 40, 'rgba(150,205,135,.13)');
    text('No active campaign', 58, 694, 36, C.text, 700);
    lines(['There’s nothing to join right now. Your diary,', 'check-ins and progress work fully without', 'rewards.'], 58, 752, 32, 23);
  });
  rise(t, 3, () => {
    text('Status', 37, 942, 31, C.text, 600);
    glass(30, 973, 660, 418, 40, 'rgba(150,205,135,.13)');
    const rowS = (y, ic, title, sub, badge, on) => {
      rowIcon(ic, y + 70);
      text(title, 151, y + 50, 26, C.text, 600);
      lines(sub, 151, y + 85, 28, 21);
      font(20, 600);
      const bw = ctx.measureText(badge).width + 36;
      pill(662 - bw, y + 22, bw, 42, badge, { fill: on ? 'rgba(150,205,135,.18)' : 'rgba(255,255,255,.08)', color: on ? C.acc : C.mute, size: 20, weight: 600 });
    };
    rowS(973, 'db', 'Rewards service', ['Connected. No campaign', 'published yet.'], 'Connected', true);
    rowS(1113, 'userc', 'Account', ['Sign in from Settings.', 'Campaigns need an account.'], 'Signed out', false);
    rowS(1252, 'wallet', 'Token distribution', ['Turned off in this build. No token has', 'launched.'], 'Off', false);
    text('How campaigns will work', 37, 1474, 31, C.text, 600);
    glass(30, 1505, 660, 200, 40, 'rgba(150,205,135,.13)');
    icon('doc', 78, 1554, 28, C.acc, 2.6);
    text('Published rules first', 120, 1563, 27, C.text, 600);
  });
  ctx.restore();
  if (scroll > 0) { // content scrolls under the status bar
    const g = ctx.createLinearGradient(0, 0, 0, 175); g.addColorStop(0, '#2b8a3a'); g.addColorStop(0.78, '#2a8139'); g.addColorStop(1, 'rgba(42,129,57,0)');
    faded(clamp(scroll / 100), () => { ctx.fillStyle = g; ctx.fillRect(0, 0, UW, 175); });
  }
  tabBar(3);
}

function settings(t = null, { numbers = 1 } = {}) {
  sheet();
  text('Settings', 30, 220, 40, C.text, 700);
  circle(657, 205, 33, 'rgba(255,255,255,.12)'); icon('close', 657, 205, 20, C.text, 3.5);
  text('You', 37, 343, 31, C.text, 600);
  glass(30, 375, 660, 368, 40, 'rgba(120,175,110,.15)');
  rowIcon('people', 432); text('Age group', 151, 426, 27, C.text, 600); text('18 or older', 151, 461, 21, C.mute); chevRow(432);
  rowIcon('trend', 558); text('Show nutrition numbers', 151, 539, 27, C.text, 600);
  lines(['Turn off to use the diary as a plain', 'food journal.'], 151, 575, 27, 21);
  // toggle
  const k = easeInOut(numbers);
  box(549, 511, 113, 50, 25, k > 0.5 ? C.acc : 'rgba(255,255,255,.16)');
  circle(574 + 63 * k, 536, 21, '#f4f6f2');
  rowIcon('buoy', 688); text('Replay quick tour', 151, 697, 27, C.text, 600); chevRow(688);
  text('Account', 37, 828, 31, C.text, 600);
  lines(['Optional. Sign in to back up your diary privately and', 'keep it in sync across your devices. Only your Apple', 'account’s private ID is used; no name or email is', 'collected.'], 37, 885, 32, 22);
  box(30, 1009, 660, 92, 46, '#ffffff');
  icon('apple', 210, 1053, 30, '#000', 2);
  text('Sign in with Apple', 236, 1066, 29, '#000', 600);
  text('Your data', 37, 1186, 31, C.text, 600);
  glass(30, 1218, 660, 252, 40, 'rgba(120,175,110,.15)');
  rowIcon('down', 1288); text('Export diary', 151, 1267, 27, C.text, 600);
  lines(['Save a JSON copy of all entries and', 'saved meals.'], 151, 1302, 28, 21); chevRow(1285);
  rowIcon('trash', 1413); text('Delete all diary data', 151, 1408, 27, C.red, 600);
  text('Removes everything from this device.', 151, 1443, 21, C.mute); chevRow(1413);
  lines(['Your diary is stored in this app’s private storage,', 'protected by your device’s passcode and the operating'], 37, 1515, 29, 21);
}

function final(t) {
  // lock screen: big clock, then a check-in reminder slides down
  const g = ctx.createLinearGradient(0, 0, UW, UH);
  g.addColorStop(0, '#0e2410'); g.addColorStop(1, '#030503');
  ctx.fillStyle = g; ctx.fillRect(0, 0, UW, UH);
  text('Saturday 24 October', 360, 210, 30, 'rgba(255,255,255,.85)', 500, 'center');
  text('9:41', 360, 420, 200, C.text, 600, 'center');
  const n = easeOut((t - 0.5) / 0.7);
  faded(n, () => {
    const y = 520 + (1 - n) * -50, x = 36, w = UW - 72, h = 172;
    box(x, y, w, h, 40, 'rgba(38,48,36,.92)', 'rgba(255,255,255,.08)');
    if (logo.complete && logo.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(x + 28, y + 32, 74, 74, 18); ctx.clip();
      ctx.drawImage(logo, x + 28, y + 32, 74, 74); ctx.restore();
    }
    text('CalorieEarn', x + 126, y + 62, 28, C.text, 600);
    text('now', x + w - 30, y + 62, 24, C.mute, 400, 'right');
    text('Time for your daily check-in.', x + 126, y + 106, 27, C.text);
    text('Keep your streak going.', x + 126, y + 144, 25, C.mute);
  });
  box(290, UH - 60, 140, 10, 5, 'rgba(255,255,255,.6)');
}

/* ---------- How it works: one app moment per step, driven by scroll ---------- */
function howLog(lp) {
  const typed = 'Greek yogurt'.slice(0, Math.round(span(lp, 0.3, 0.7) * 12));
  const blink = Math.floor(performance.now() / 500) % 2 === 0;
  addFood(null, { slide: span(lp, 0, 0.22), typed, caret: lp > 0.24 && lp < 0.96 && blink, chip: span(lp, 0.78, 0.9) });
}
function howReview(lp) {
  photoEstimate(null, { shown: span(lp, 0.05, 0.5), tap: 0, tapK: span(lp, 0.55, 0.75), addPress: span(lp, 0.85, 0.97) });
}
function howCheckin(lp) {
  history(null, { dot: { logged: easeOut(span(lp, 0.15, 0.35)), fill: easeOut(span(lp, 0.5, 0.7)) } });
}
function howEarn() { rewards(); }

/* ---------- which screen, and switching ---------- */
const SECTIONS = ['hero', 'how', 'logging', 'nutrition', 'habits', 'rewards', 'treasury', 'privacy', 'final']
  .map((id) => document.getElementById(id));
const HOW_STEPS = [howLog, howReview, howCheckin, howEarn];

// Section tops in page pixels, measured on layout changes, so picking the screen never reads layout per frame.
let tops = [];
function measureTops() { tops = SECTIONS.map((s) => s.getBoundingClientRect().top + scrollY); }
measureTops();
new ResizeObserver(measureTops).observe(document.body);
addEventListener('load', measureTops);

function activeKey() {
  const mid = scrollY + innerHeight / 2;
  let i = 0;
  tops.forEach((t, j) => { if (t <= mid) i = j; });
  const id = SECTIONS[i].id;
  if (id === 'how') return 'how' + (window.__how?.step ?? 0);
  return id;
}

const DRAW = {
  hero: (t) => today(t),
  logging: (t) => addFood(null, { slide: easeOut(t / 0.7) }),
  nutrition: (t) => progress(t),
  habits: (t) => history(t),
  rewards: (t) => rewards(t),
  treasury: (t) => rewards(null, { scroll: 205 * easeInOut((t - 0.15) / 1.1) }),
  privacy: (t) => settings(null, { numbers: 1 - span(t, 0.7, 1.0) }),
  final,
};
// How long each screen keeps animating after it appears (s). After that it's a still image.
const ANIM = { logging: 0.8, treasury: 1.3, privacy: 1.1, final: 1.4 };
function howLp(k) { return clamp((window.__how?.p ?? 0) * 4 - k); }
function drawScreen(key, t) {
  ctx.save();
  ctx.scale(US, US);
  if (key.startsWith('how')) {
    const k = +key.slice(3);
    HOW_STEPS[k](howLp(k));
  } else DRAW[key](t);
  if (key !== 'final') statusBar(); // the lock screen shows the time big instead
  ctx.restore();
}

const FADE = 0.4;
let current = activeKey(), since = performance.now(), prev = null, prevSince = 0;
let last = 0, lastP = -1, drawn = false;

// Redraws (and re-uploads to the GPU) only when the picture can have changed: a screen switch or crossfade,
// a screen still in its intro animation, or How-it-works scroll progress. A still screen costs nothing.
function needsDraw(key, t) {
  if (!drawn || prev) return true;
  if (key.startsWith('how')) {
    const p = window.__how?.p ?? 0;
    if (p !== lastP) return true;
    const lp = howLp(+key.slice(3));
    return key === 'how0' && lp > 0.24 && lp < 0.96; // blinking caret
  }
  return t < (ANIM[key] ?? 0) + 0.1;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (now - last < 1000 / 40) return; // 40 fps is plenty for the screen
  last = now;
  const key = activeKey();
  if (key !== current) {
    prev = current; prevSince = since;
    current = key; since = now;
  }
  const t = (now - since) / 1000;
  if (!needsDraw(current, t)) return;
  const fade = prev ? easeOut(t / FADE) : 1;
  if (prev && fade < 1) {
    drawScreen(prev, (now - prevSince) / 1000);
    ctx = fadeCtx;
    drawScreen(current, t);
    ctx = screenCtx;
    ctx.globalAlpha = fade;
    ctx.drawImage(fadeCanvas, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    prev = null;
    drawScreen(current, t);
  }
  lastP = window.__how?.p ?? 0;
  drawn = true;
  texture.needsUpdate = true;
}
logo.onload = () => { makeMark(); drawn = false; };
Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 40px Inter`)))
  .finally(() => { drawn = false; requestAnimationFrame(frame); });
