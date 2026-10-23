// What the 3D phone's screen shows. Draws into the canvas phone3d.js maps onto the display.
// The screen follows the section in the middle of the viewport and crossfades when it changes.
// How it works is tied to scrolling (window.__how from main.js); the rest play small loops.
// Everything here is an illustration of the planned app: no real data, token amounts or ticker.

const screen = window.__phoneScreen;
const { ctx, width: W, height: H, texture } = screen;
const P = 44; // side padding

const C = {
  bg: '#030503', card: '#111C10', line: '#283824', acc: '#B1F58C',
  text: '#F6F8F4', mute: '#9CA995', dim: 'rgba(156,169,149,.55)',
  acc2: '#6fae52', acc3: '#3f6a31',
};

const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
const easeOut = (t) => 1 - (1 - clamp(t)) ** 3;
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const span = (t, a, b) => clamp((t - a) / (b - a)); // 0→1 while t goes a→b

/* ---------- drawing helpers ---------- */
function font(size, weight = 500) { ctx.font = `${weight} ${size}px "DM Sans", sans-serif`; }
function text(s, x, y, size, color = C.text, weight = 500, align = 'left') {
  font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}
function box(x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function card(x, y, w, h, stroke = C.line) { box(x, y, w, h, 26, C.card, stroke); }
function tick(cx, cy, size, color, p = 1, lw = 6) {
  // check mark drawn along its length (p = 0..1)
  const pts = [[-0.45, 0.02], [-0.12, 0.34], [0.48, -0.3]].map(([a, b]) => [cx + a * size, cy + b * size]);
  const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  let d = p * (l1 + l2);
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  if (d <= l1) ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * (d / l1), pts[0][1] + (pts[1][1] - pts[0][1]) * (d / l1));
  else {
    ctx.lineTo(...pts[1]);
    d -= l1;
    ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * (d / l2), pts[1][1] + (pts[2][1] - pts[1][1]) * (d / l2));
  }
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
}
function plus(cx, cy, r) {
  box(cx - r, cy - r, r * 2, r * 2, r, 'rgba(177,245,140,.14)');
  ctx.strokeStyle = C.acc; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy); ctx.lineTo(cx + r * 0.42, cy);
  ctx.moveTo(cx, cy - r * 0.42); ctx.lineTo(cx, cy + r * 0.42);
  ctx.stroke();
}
function lock(cx, cy, s, color, closed = 1) {
  // padlock: shackle rises when open (closed = 0)
  ctx.strokeStyle = color; ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
  const lift = (1 - closed) * s * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.28, cy - s * 0.05 - lift);
  ctx.lineTo(cx - s * 0.28, cy - s * 0.28 - lift);
  ctx.arc(cx, cy - s * 0.28 - lift, s * 0.28, Math.PI, 0);
  ctx.lineTo(cx + s * 0.28, cy - s * 0.05 - (closed < 1 ? lift : 0));
  ctx.stroke();
  box(cx - s * 0.45, cy - s * 0.08, s * 0.9, s * 0.66, s * 0.14, color);
}
// Draw with extra transparency on top of whatever is current (keeps the crossfade intact).
function faded(a, fn) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  fn();
  ctx.restore();
}
function background() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a170b');
  g.addColorStop(0.45, '#040804');
  g.addColorStop(1, C.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function statusBar(time = true) {
  if (time) text('9:41', 64, 64, 26, C.text, 600);
  box(W - 100, 44, 44, 22, 6, null, 'rgba(246,248,244,.6)', 2);
  box(W - 96, 48, 30, 14, 3, C.text);
  box(W - 54, 50, 4, 10, 2, 'rgba(246,248,244,.6)');
}
function header(title, sub) {
  text(title, P, 176, 48, C.text, 500);
  if (sub) text(sub, P, 218, 24, C.mute, 300);
}
function row(y, label, sub, right, opts = {}) {
  card(P, y, W - 2 * P, opts.h ?? 104, opts.stroke);
  text(label, P + 28, y + (sub ? 44 : 60), 26, C.text, 500);
  if (sub) text(sub, P + 28, y + 78, 21, C.mute, 300);
  if (right) text(right, W - P - 28, y + 60, 24, opts.rightColor ?? C.text, 500, 'right');
}

/* ---------- screens ---------- */
// Each takes t = seconds since it came on screen; how-it-works steps take lp = scroll progress 0..1 in that step.

const MACROS = [['Protein', 90, 4, C.acc], ['Carbs', 142, 4, C.acc2], ['Fat', 45, 9, C.acc3]];
const MACRO_KCAL = MACROS.reduce((s, m) => s + m[1] * m[2], 0);

function today(t) {
  header('Today', 'So far today');
  text('1,335', P, 352, 120, C.text, 600);
  text('kcal logged', P + 4, 396, 26, C.mute, 300);
  // one bar split by macro share (no targets)
  const bw = W - 2 * P, grow = easeOut(t / 1.1);
  let x = P;
  MACROS.forEach(([, g, k, col], i) => {
    const w = (bw * g * k) / MACRO_KCAL * grow;
    box(x, 428, Math.max(0, w - (i < 2 ? 6 : 0)), 18, 9, col);
    x += w;
  });
  MACROS.forEach(([name, g, , col], i) => {
    const lx = P + i * 152;
    box(lx, 478, 14, 14, 7, col);
    text(`${name} ${g} g`, lx + 22, 492, 20, C.mute, 400);
  });
  const meals = [['Breakfast', 'Oats, banana', '410'], ['Lunch', 'Chicken wrap', '640'], ['Snack', 'Apple, peanut butter', '285']];
  meals.forEach(([m, d, k], i) => {
    const a = easeOut((t - 0.15 - i * 0.12) / 0.6);
    faded(a, () => row(540 + i * 118 + (1 - a) * 20, m, d, `${k} kcal`));
  });
  const y = 900;
  card(P, y, W - 2 * P, 132, C.acc);
  text('Daily check-in', P + 28, y + 56, 26, C.text, 500);
  text('Streak · 12 days', P + 28, y + 94, 21, C.mute, 300);
  box(W - P - 104, y + 30, 72, 72, 36, C.acc);
  tick(W - P - 68, y + 66, 34, C.bg, easeOut((t - 0.5) / 0.6));
}

const FOODS = [['Greek yogurt', '100 g · 97 kcal'], ['Greek yogurt, 2%', '150 g · 146 kcal'], ['Greek yogurt, honey', '170 g · 214 kcal']];

function howLog(lp) {
  header('Log a meal', 'Search, scan or enter it');
  const typed = 'Greek yog'.slice(0, Math.round(span(lp, 0.05, 0.45) * 9));
  box(P, 260, W - 2 * P, 80, 20, C.card, lp > 0.03 ? C.acc : C.line);
  // magnifier
  ctx.strokeStyle = C.mute; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(P + 40, 296, 12, 0, Math.PI * 2); ctx.moveTo(P + 49, 305); ctx.lineTo(P + 58, 314); ctx.stroke();
  text(typed || 'Search foods', P + 76, 310, 26, typed ? C.text : C.dim, 400);
  if (lp > 0.03 && lp < 0.98 && Math.floor(performance.now() / 500) % 2 === 0) {
    font(26, 400);
    box(P + 78 + ctx.measureText(typed).width, 288, 3, 30, 1, C.acc);
  }
  FOODS.forEach(([n, d], i) => {
    const a = easeOut(span(lp, 0.42 + i * 0.1, 0.62 + i * 0.1));
    faded(a, () => {
      const y = 372 + i * 118 + (1 - a) * 18;
      card(P, y, W - 2 * P, 104, i === 0 && lp > 0.85 ? C.acc : C.line);
      text(n, P + 28, y + 44, 26, C.text, 500);
      text(d, P + 28, y + 78, 21, C.mute, 300);
      plus(W - P - 56, y + 52, 26);
    });
  });
  const by = H - 236;
  [['Scan barcode', P], ['Manual entry', W / 2 + 8]].forEach(([l, x]) => {
    card(x, by, W / 2 - P - 8, 120);
    text(l, x + (W / 2 - P - 8) / 2, by + 70, 22, C.mute, 400, 'center');
  });
}

function howReview(lp) {
  header('Greek yogurt', 'Review and edit the portion');
  const g = Math.round((100 + 70 * easeInOut(span(lp, 0.1, 0.8))) / 5) * 5;
  card(P, 262, W - 2 * P, 150);
  box(P + 22, 290, 94, 94, 22, '#1b2c19');
  box(W - P - 116, 290, 94, 94, 22, '#1b2c19');
  text('−', P + 69, 352, 48, C.text, 400, 'center');
  text('+', W - P - 69, 352, 48, C.text, 400, 'center');
  text(`${g} g`, W / 2, 360, 64, C.text, 600, 'center');
  const m = g / 100;
  const rows = [['Calories', `${Math.round(97 * m)}`, C.acc], ['Protein', `${(9 * m).toFixed(1)} g`], ['Carbs', `${(3.9 * m).toFixed(1)} g`], ['Fat', `${(5 * m).toFixed(1)} g`]];
  card(P, 442, W - 2 * P, 4 * 84 + 16);
  rows.forEach(([l, v, col], i) => {
    const y = 442 + 8 + i * 84;
    if (i) { ctx.fillStyle = C.line; ctx.fillRect(P + 24, y, W - 2 * P - 48, 2); }
    text(l, P + 28, y + 54, i ? 24 : 28, i ? C.mute : C.text, i ? 400 : 500);
    text(v, W - P - 28, y + 54, i ? 24 : 34, col ?? C.text, i ? 500 : 600, 'right');
  });
  const press = span(lp, 0.86, 0.95);
  const s = 1 - Math.sin(press * Math.PI) * 0.04;
  const bw = (W - 2 * P) * s, bh = 100 * s;
  box(W / 2 - bw / 2, H - 200 + (100 - bh) / 2, bw, bh, 24, C.acc);
  text('Add to today', W / 2, H - 138, 28, C.bg, 600, 'center');
}

function howCheckin(lp) {
  header('Daily check-in', 'One tap a day builds your streak');
  const cx = W / 2, cy = 560, r = 150;
  ctx.lineWidth = 14;
  ctx.strokeStyle = C.line;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const ring = easeInOut(span(lp, 0.1, 0.5));
  ctx.strokeStyle = C.acc; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + ring * Math.PI * 2); ctx.stroke();
  const fill = easeOut(span(lp, 0.5, 0.62));
  if (fill > 0) {
    faded(fill, () => { ctx.beginPath(); ctx.arc(cx, cy, (r - 7) * (0.8 + 0.2 * fill), 0, Math.PI * 2); ctx.fillStyle = C.acc; ctx.fill(); });
    tick(cx, cy, 120, C.bg, easeOut(span(lp, 0.56, 0.74)), 16);
  } else {
    text('Check in', cx, cy + 14, 40, C.text, 500, 'center');
  }
  text(lp > 0.6 ? 'Checked in today' : 'Tap to check in', cx, cy + r + 76, 28, lp > 0.6 ? C.acc : C.mute, 400, 'center');
  const y = 900;
  card(P, y, W - 2 * P, 132);
  text('Streak', P + 28, y + 76, 28, C.text, 500);
  const roll = easeInOut(span(lp, 0.7, 0.88));
  ctx.save();
  ctx.beginPath(); ctx.rect(W / 2, y + 20, W / 2 - P - 10, 92); ctx.clip();
  text('12 days', W - P - 28, y + 82 - roll * 76, 34, C.text, 600, 'right');
  text('13 days', W - P - 28, y + 158 - roll * 76, 34, C.acc, 600, 'right');
  ctx.restore();
}

function rewardTiles(y, pendingCount) {
  const tw = (W - 2 * P - 24) / 3;
  [['Pending', pendingCount], ['Available', '—'], ['Claimed', '—']].forEach(([l, v], i) => {
    const x = P + i * (tw + 12);
    card(x, y, tw, 150, i === 0 && pendingCount !== '—' ? C.acc : C.line);
    text(v, x + tw / 2, y + 80, 44, i === 0 && pendingCount !== '—' ? C.acc : C.text, 600, 'center');
    text(l, x + tw / 2, y + 120, 20, C.mute, 400, 'center');
  });
}

function howEarn(lp) {
  header('Rewards', 'Planned token');
  const land = easeOut(span(lp, 0.15, 0.55));
  rewardTiles(262, land > 0.95 ? '1' : '—');
  text('Recent', P, 486, 22, C.mute, 400);
  faded(land, () => {
    const y = 508, off = (1 - land) * (W * 0.6);
    card(P + off, y, W - 2 * P, 120, C.acc);
    text('Daily check-in reward', P + 28 + off, y + 52, 25, C.text, 500);
    text('Under the campaign’s rules', P + 28 + off, y + 88, 20, C.mute, 300);
    box(W - P - 150 + off, y + 38, 124, 44, 22, 'rgba(177,245,140,.14)');
    text('Pending', W - P - 88 + off, y + 68, 20, C.acc, 500, 'center');
  });
  row(650, 'Today’s check-in', null, '✓', { rightColor: C.acc });
  text('No purchase, deposit or trading needed.', W / 2, H - 110, 21, C.dim, 300, 'center');
}

function logging(t) {
  // camera view
  ctx.fillStyle = '#020302';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 520, 40, W / 2, 520, 520);
  g.addColorStop(0, 'rgba(60,90,50,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  header('Scan barcode', 'Point at the package');
  // package with a barcode label
  const px = 100, py = 300, pw = W - 200, ph = 470;
  box(px, py, pw, ph, 18, '#1d2f1a');
  text('OAT GRANOLA', W / 2, py + 86, 30, 'rgba(246,248,244,.75)', 600, 'center');
  const bx = W / 2 - 130, by = py + 190, bw = 260, bh = 150;
  box(bx, by, bw, bh, 10, '#f3f5ef');
  let x = bx + 22;
  const bars = [3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2];
  bars.forEach((w, i) => { if (i % 2 === 0) { ctx.fillStyle = '#0b0f0a'; ctx.fillRect(x, by + 18, w * 3, bh - 52); } x += w * 3 + 1.6; });
  text('5 012345 678900', W / 2, by + bh - 12, 18, '#0b0f0a', 500, 'center');
  // scan frame
  const fx = bx - 26, fy = by - 26, fw = bw + 52, fh = bh + 52, c = 34;
  ctx.strokeStyle = C.acc; ctx.lineWidth = 6; ctx.lineCap = 'round';
  [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(cx + dx * c, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * c); ctx.stroke();
  });
  // scan line sweeps down, then the result slides up
  const cyc = (t % 2.8) / 2.8;
  const sweep = easeInOut(span(cyc, 0, 0.45));
  if (cyc < 0.5) {
    const ly = fy + 10 + sweep * (fh - 20);
    const lg = ctx.createLinearGradient(0, ly - 30, 0, ly);
    lg.addColorStop(0, 'rgba(177,245,140,0)'); lg.addColorStop(1, 'rgba(177,245,140,.35)');
    ctx.fillStyle = lg; ctx.fillRect(fx + 8, ly - 30, fw - 16, 30);
    box(fx + 8, ly - 2, fw - 16, 4, 2, C.acc);
  }
  const res = easeOut(span(cyc, 0.5, 0.62)) * (1 - span(cyc, 0.94, 1));
  faded(res, () => {
    const ry = H - 230 + (1 - res) * 60;
    card(P, ry, W - 2 * P, 132, C.acc);
    text('Oat granola', P + 28, ry + 56, 27, C.text, 500);
    text('45 g · 198 kcal', P + 28, ry + 94, 21, C.mute, 300);
    plus(W - P - 60, ry + 66, 30);
  });
}

function nutrition(t) {
  header('Summary', 'Today');
  const cx = W / 2, cy = 440, r = 140, grow = easeOut(t / 1.2);
  ctx.lineWidth = 34; ctx.lineCap = 'butt';
  ctx.strokeStyle = C.line;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  let a = -Math.PI / 2;
  MACROS.forEach(([, g, k, col]) => {
    const sweep = ((g * k) / MACRO_KCAL) * Math.PI * 2 * grow;
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, r, a + 0.03, a + Math.max(0.03, sweep - 0.03)); ctx.stroke();
    a += sweep;
  });
  text('1,335', cx, cy + 8, 62, C.text, 600, 'center');
  text('kcal', cx, cy + 50, 24, C.mute, 300, 'center');
  MACROS.forEach(([name, g, , col], i) => {
    const y = 640 + i * 54;
    box(P + 6, y - 16, 16, 16, 8, col);
    text(name, P + 36, y, 24, C.text, 400);
    text(`${g} g`, W - P, y, 24, C.mute, 500, 'right');
  });
  text('This week', P, 850, 26, C.text, 500);
  const hs = [0.7, 0.86, 0.62, 0.92, 0.76, 0.82, 0.58];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const bw = 44, gap = (W - 2 * P - 7 * bw) / 6, base = 1080;
  hs.forEach((h, i) => {
    const x = P + i * (bw + gap);
    const bh = 160 * h * easeOut((t - 0.3 - i * 0.07) / 0.7);
    box(x, base - 160, bw, 160, 12, '#0c150b');
    if (bh > 1) box(x, base - bh, bw, bh, 12, i === 6 ? C.acc : '#2f4d28');
    text(days[i], x + bw / 2, base + 38, 20, i === 6 ? C.acc : C.mute, 500, 'center');
  });
}

function habits(t) {
  header('Saved meals', 'Log them again in one tap');
  const cyc = (t % 3.2) / 3.2;
  const meals = [['Usual breakfast', 'Oats, banana, coffee', '450 kcal'], ['Work lunch', 'Chicken wrap, apple', '735 kcal']];
  meals.forEach(([n, d, k], i) => {
    const y = 262 + i * 172;
    card(P, y, W - 2 * P, 152, i === 0 && cyc > 0.35 && cyc < 0.85 ? C.acc : C.line);
    text(n, P + 28, y + 52, 27, C.text, 500);
    text(`${d} · ${k}`, P + 28, y + 88, 21, C.mute, 300);
    const done = i === 0 && cyc > 0.4 && cyc < 0.85;
    const press = i === 0 ? Math.sin(span(cyc, 0.3, 0.42) * Math.PI) : 0;
    const bw = 170 * (1 - press * 0.06), bh = 42 * (1 - press * 0.06);
    box(P + 28, y + 104 + (42 - bh) / 2, bw, bh, 21, done ? C.acc : 'rgba(177,245,140,.14)');
    text(done ? 'Logged ✓' : 'Log again', P + 28 + bw / 2, y + 133, 20, done ? C.bg : C.acc, 600, 'center');
  });
  text('Recent foods', P, 640, 24, C.mute, 400);
  [['Greek yogurt', '150 g · 146 kcal'], ['Banana', '120 g · 107 kcal'], ['Chicken wrap', '1 wrap · 640 kcal']].forEach(([n, d], i) => {
    const y = 662 + i * 112;
    card(P, y, W - 2 * P, 98);
    text(n, P + 28, y + 42, 25, C.text, 500);
    text(d, P + 28, y + 74, 20, C.mute, 300);
    plus(W - P - 52, y + 49, 24);
  });
  text('Meal history  ›', W / 2, H - 70, 22, C.mute, 400, 'center');
}

function rewards(t) {
  header('Rewards', 'Planned token');
  rewardTiles(262, '1');
  const y = 450;
  card(P, y, W - 2 * P, 132, C.acc);
  text('Today’s check-in', P + 28, y + 56, 26, C.text, 500);
  text('Done', P + 28, y + 94, 21, C.acc, 400);
  box(W - P - 104, y + 30, 72, 72, 36, C.acc);
  tick(W - P - 68, y + 66, 34, C.bg, easeOut((t - 0.3) / 0.6));
  row(602, 'Campaign rules', 'Published for each campaign', '›');
  row(726, 'Wallet', 'Optional · logging works without it', '›');
  text('Rewards recognise participation.', W / 2, H - 150, 22, C.mute, 400, 'center');
  text('Not eating less or weight loss.', W / 2, H - 114, 22, C.dim, 300, 'center');
}

function treasury(t) {
  header('Campaigns', 'Funded from the treasury');
  const camp = (y, name, fill, i) => {
    card(P, y, W - 2 * P, 188);
    text(name, P + 28, y + 56, 27, C.text, 500);
    box(W - P - 128, y + 26, 100, 42, 21, 'rgba(177,245,140,.14)');
    text('Capped', W - P - 78, y + 55, 19, C.acc, 500, 'center');
    box(P + 28, y + 92, W - 2 * P - 56, 16, 8, '#0c150b');
    box(P + 28, y + 92, (W - 2 * P - 56) * fill * easeOut((t - 0.2 - i * 0.15) / 1), 16, 8, C.acc);
    text('Backed by available tokens', P + 28, y + 150, 21, C.mute, 300);
  };
  camp(262, 'Daily campaign', 0.64, 0);
  camp(470, 'Weekly campaign', 0.38, 1);
  const y = 678;
  card(P, y, W - 2 * P, 150);
  lock(P + 62, y + 80, 56, C.acc);
  text('Treasury', P + 118, y + 64, 27, C.text, 500);
  text('Fixed token allocation', P + 118, y + 100, 21, C.mute, 300);
  text('Not guaranteed cash earnings.', W / 2, H - 150, 22, C.mute, 400, 'center');
  text('Token value can change.', W / 2, H - 114, 22, C.dim, 300, 'center');
}

function privacy(t) {
  header('Food log', 'Only you can see it');
  const closed = easeInOut((t - 0.25) / 0.6);
  box(P, 250, 290, 56, 28, 'rgba(177,245,140,.14)');
  lock(P + 34, 282, 30, C.acc, closed);
  text('Private · offchain', P + 62, 287, 22, C.acc, 500);
  [['Breakfast', 'Oats, banana'], ['Lunch', 'Chicken wrap'], ['Snack', 'Apple, peanut butter']].forEach(([m, d], i) => row(336 + i * 118, m, d));
  const y = 712;
  card(P, y, W - 2 * P, 150);
  text('Journal mode', P + 28, y + 60, 27, C.text, 500);
  text('No automatic calorie targets', P + 28, y + 98, 21, C.mute, 300);
  const on = easeOut((t - 0.6) / 0.4);
  box(W - P - 108, y + 52, 80, 46, 23, on > 0.5 ? C.acc : C.line);
  box(W - P - 104 + on * 34, y + 56, 38, 38, 19, on > 0.5 ? C.bg : C.mute);
}

const logo = new Image();
logo.src = 'assets/logo.jpg';
function final(t) {
  // lock screen: soft brand glow, big clock, then a check-in reminder slides down
  const g = ctx.createRadialGradient(W / 2, H * 0.72, 40, W / 2, H * 0.72, H * 0.6);
  g.addColorStop(0, 'rgba(177,245,140,.32)'); g.addColorStop(0.5, 'rgba(46,160,70,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  lock(W / 2, 150, 34, 'rgba(246,248,244,.85)');
  text('9:41', W / 2, 330, 150, C.text, 500, 'center');
  const n = easeOut((t - 0.5) / 0.7);
  faded(n, () => {
    const y = 400 + (1 - n) * -40, x = 30, w = W - 60, h = 132;
    box(x, y, w, h, 30, 'rgba(30,40,28,.92)', 'rgba(246,248,244,.08)');
    if (logo.complete && logo.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(x + 22, y + 24, 56, 56, 14); ctx.clip();
      ctx.drawImage(logo, x + 22, y + 24, 56, 56); ctx.restore();
    }
    text('CalorieEarn', x + 96, y + 48, 23, C.text, 600);
    text('now', x + w - 24, y + 48, 20, C.mute, 400, 'right');
    text('Time for your daily check-in.', x + 96, y + 84, 22, C.text, 400);
    text('Keep your streak going.', x + 96, y + 114, 20, C.mute, 300);
  });
  box(W / 2 - 70, H - 46, 140, 8, 4, 'rgba(246,248,244,.6)');
}

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

const DRAW = { hero: today, logging, nutrition, habits, rewards, treasury, privacy, final };
// How long each screen keeps animating after it appears (s). Infinity = a loop. After that it's a still image.
const ANIM = { hero: 1.6, logging: Infinity, nutrition: 1.8, habits: Infinity, rewards: 1.0, treasury: 1.6, privacy: 1.2, final: 1.4 };
function howLp(k) { return clamp((window.__how?.p ?? 0) * 4 - k); }
function drawScreen(key, t) {
  background();
  if (key.startsWith('how')) {
    const k = +key.slice(3);
    HOW_STEPS[k](howLp(k));
  } else DRAW[key](t);
  statusBar(key !== 'final'); // the lock screen shows the time big instead
}

const FADE = 0.4;
let current = activeKey(), since = performance.now(), prev = null, prevSince = 0;
let last = 0, lastP = -1, drawn = false;

// Redraws (and re-uploads to the GPU) only when the picture can have changed: a screen switch or crossfade,
// a screen still in its intro animation or loop, or How-it-works scroll progress. A still screen costs nothing.
function needsDraw(key, t) {
  if (!drawn || prev) return true;
  if (key.startsWith('how')) {
    const p = window.__how?.p ?? 0;
    if (p !== lastP) return true;
    const lp = howLp(+key.slice(3));
    return key === 'how0' && lp > 0.03 && lp < 0.98; // blinking caret
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
  ctx.save();
  if (prev && fade < 1) drawScreen(prev, (now - prevSince) / 1000);
  else prev = null;
  ctx.globalAlpha = fade;
  drawScreen(current, t);
  ctx.restore();
  ctx.globalAlpha = 1;
  lastP = window.__how?.p ?? 0;
  drawn = true;
  texture.needsUpdate = true;
}
logo.onload = () => { drawn = false; };
document.fonts.load('500 40px "DM Sans"').finally(() => { drawn = false; requestAnimationFrame(frame); });
