(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---------- Always start at the top on reload ---------- */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  /* ---------- Intro: ring fills with the phone's load progress, then fades away ---------- */
  const intro = document.getElementById('intro');
  const introFill = document.getElementById('introFill');
  const INTRO_C = 2 * Math.PI * 56;
  const introStart = performance.now();
  let introTarget = 0.08, introShown = 0, introReady = false, introFinished = false;
  document.documentElement.classList.add('intro-on');
  addEventListener('phone:progress', e => { introTarget = Math.max(introTarget, 0.08 + 0.82 * e.detail); });
  addEventListener('phone:ready', () => { introReady = true; });
  setTimeout(() => { introReady = true; }, 6000); // never hold the page longer than this
  function finishIntro() {
    if (introFinished) return;
    introFinished = true;
    window.__introDone = true;
    intro.classList.add('done');
    document.documentElement.classList.remove('intro-on');
    if (window.__lenis) window.__lenis.start();
    dispatchEvent(new Event('intro:done'));
    setTimeout(() => intro.remove(), 900);
  }
  let introLast = introStart;
  (function tickIntro(now) {
    if (introFinished) return;
    // done once loaded and shown for a moment: the ring fills to the end, then the screen fades
    if (introReady && now - introStart > 900) introTarget = 1;
    const dt = Math.min((now - introLast) / 1000, 0.5);
    introLast = now;
    introShown += (introTarget - introShown) * (1 - Math.exp(-7 * dt)); // time-based, same at any frame rate
    introFill.style.strokeDashoffset = (INTRO_C * (1 - introShown)).toFixed(2);
    if (introTarget === 1 && introShown > 0.99) setTimeout(finishIntro, 180);
    else requestAnimationFrame(tickIntro);
  })(introStart);
  if (reduce) finishIntro();

  /* ---------- Lenis smooth scroll ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ autoRaf: true, lerp: 0.08, smoothWheel: true });
  }
  window.__lenis = lenis; // the 3D phone reads the scroll from here (step 2)
  if (lenis && !window.__introDone) lenis.stop(); // held while the intro is up
  document.querySelectorAll('a[data-scroll]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      const target = id === '#top' ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      if (lenis) {
        // Longer trips take longer, eased in and out.
        const to = target === 0 ? 0 : target.getBoundingClientRect().top + scrollY;
        const duration = clamp(1.1 + Math.abs(to - scrollY) / 5000, 1.2, 2.8);
        lenis.scrollTo(target, { duration, easing: easeInOutCubic });
      }
      else if (target === 0) scrollTo(0, 0);
      else target.scrollIntoView();
    });
  });

  /* ---------- Contract address button (closing section): shows the full address, copies on click ---------- */
  const CA = '0000000000000000000000000000000000000000pump'; // placeholder until the real address exists
  document.querySelectorAll('.ca').forEach(btn => {
    const v = btn.querySelector('.ca-v');
    const label = CA;
    v.textContent = label;
    const fallbackCopy = () => {
      const t = document.createElement('textarea');
      t.value = CA; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    };
    btn.addEventListener('click', () => {
      // Confirm straight away; the clipboard API can stay pending (permissions), so it isn't awaited.
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(CA).catch(fallbackCopy);
      else fallbackCopy();
      btn.classList.add('copied');
      v.textContent = 'Copied';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.classList.remove('copied');
        v.textContent = label;
      }, 1600);
    });
  });

  /* ---------- Nav: active section, island capsule after the hero, mobile sheet ---------- */
  const navEl = document.querySelector('.nav');
  const links = document.getElementById('links');
  const navLinks = [...links.querySelectorAll('a')];
  const heroEl = document.getElementById('hero');

  const navSecs = navLinks.map(a => document.getElementById(a.dataset.sec));
  const afterNav = document.getElementById('final'); // at the final CTA nothing is highlighted
  let navActive = null;
  function updateNav(y) {
    const line = y + M.vh * 0.4;
    let active = -1;
    M.nav.forEach((top, i) => { if (top <= line) active = i; });
    if (M.final <= line) active = -1;
    if (active === navActive) return;
    navActive = active;
    navLinks.forEach((a, i) => a.classList.toggle('active', i === active));
  }

  const burger = document.getElementById('burger');
  const setSheet = open => {
    navEl.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  burger.addEventListener('click', () => setSheet(!navEl.classList.contains('open')));
  document.querySelectorAll('.sheet a').forEach(a => a.addEventListener('click', () => setSheet(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') setSheet(false); });

  let M; // cached layout (see measure() near the end)

  /* ---------- Scroll: the nav becomes an island past the hero ---------- */
  function updateProgress(y) {
    navEl.classList.toggle('compact', y > M.heroH * 0.5);
  }

  /* ---------- How it works: scrolling through the pinned section walks Log → Earn ---------- */
  // Each step owns a quarter of the pinned scroll. The green line runs continuously between the
  // number circles and reaches each circle just as its step becomes active.
  const how = document.getElementById('how');
  const loopEl = document.getElementById('loop');
  const loopLine = loopEl.querySelector('.loop-line');
  const steps = [...loopEl.querySelectorAll('li')];
  const nums = steps.map(li => li.querySelector('.n'));
  window.__how = { p: 0, step: 0, shift: 0 }; // read by the phone screen visuals
  // Soft pin: instead of freezing the instant the section pins, the content keeps gliding up and slows to a
  // stop over EASE_IN of scroll (speed eases from page speed to 0, landing with no jolt), then speeds back up the
  // same way over the last EASE_IN before the section lets go. It sits R/3 low beforehand so it's centred while held.
  const howContent = how.querySelector('.how-pin > .wrap');
  const EASE_IN = 0.9; // share of the screen height
  function softPin(d, L) {
    const R = Math.min(innerHeight * EASE_IN, L / 2);
    let f;
    if (d <= 0) f = 0;
    else if (d < R) f = -(R / 3) * (1 - (1 - d / R) ** 3);
    else if (d <= L - R) f = -R / 3;
    else if (d < L) f = -R / 3 - (R / 3) * ((d - (L - R)) / R) ** 3;
    else f = -2 * R / 3;
    return f + R / 3;
  }
  let howStep = -1;
  function updateHow(y) {
    const d = y - M.howTop, L = M.howH - M.vh;
    const shift = softPin(d, L);
    howContent.style.transform = `translate3d(0,${shift.toFixed(1)}px,0)`;
    window.__how.shift = shift; // the phone's slot inside the pin moves with it (mobile)
    const p = clamp(d / L, 0, 1);
    const step = Math.min(steps.length - 1, Math.floor(p * steps.length));
    if (step !== howStep) {
      howStep = step;
      steps.forEach((li, i) => {
        li.classList.toggle('on', i === step);
        li.classList.toggle('done', i < step);
      });
    }
    window.__how.p = p;
    window.__how.step = step;
    drawLoopLine();
  }
  // Line runs from the first circle's centre to the last one's, filling circle to circle rather than by a flat share.
  // The circles only move when a step's description opens or closes, so they're measured then (a ResizeObserver
  // reports it after layout, when reading positions is free) and every scroll frame just draws from those numbers.
  let loopC = null;
  function measureLoop() {
    const base = loopEl.getBoundingClientRect().top;
    loopC = nums.map(n => { const b = n.getBoundingClientRect(); return b.top + b.height / 2 - base; });
    drawLoopLine();
  }
  function drawLoopLine() {
    if (!loopC) return;
    const c = loopC, len = c[c.length - 1] - c[0];
    const q = clamp(window.__how.p * steps.length, 0, steps.length - 1);
    const k = Math.min(Math.floor(q), c.length - 2);
    const at = c[k] + (c[k + 1] - c[k]) * (q - k);
    loopLine.style.setProperty('--lt', c[0] + 'px');
    loopLine.style.setProperty('--lh', len + 'px');
    loopLine.style.setProperty('--fill', len > 0 ? ((at - c[0]) / len).toFixed(4) : 0);
  }
  const loopRO = new ResizeObserver(measureLoop);
  steps.forEach(li => loopRO.observe(li));

  /* ---------- Headings: words come in one after another (Coldly's blur-in, without the blur) ---------- */
  // Words are wrapped individually; <em>/<span> inside a heading (highlight, green words) are kept.
  const wordHeads = [...document.querySelectorAll('main h1, main h2')];
  wordHeads.forEach(h => {
    let i = 0;
    const wrap = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.style.setProperty('--i', i++);
            w.textContent = part;
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) wrap(n);
      });
    };
    wrap(h);
    h.classList.add('words-in');
  });
  const wordObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); wordObserver.unobserve(en.target); }
    });
  }, { threshold: 0.4 });
  wordHeads.forEach(h => {
    if (h.closest('.hero')) {
      const go = () => setTimeout(() => h.classList.add('in'), 150);
      if (window.__introDone) go(); else addEventListener('intro:done', go, { once: true });
    }
    else wordObserver.observe(h);
  });

  /* ---------- Section paragraphs: letter-by-letter fill on scroll (Coldly's) ---------- */
  const fills = [...document.querySelectorAll('.sec:not(.final) .lead')].map(el => {
    el.classList.add('fill');
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w =>
      `<span class="fw">${[...w].map(c => `<span class="ch">${c}</span>`).join('')}</span>`
    ).join(' ');
    const chars = [...el.querySelectorAll('.ch')];
    return { el, chars, last: chars.map(() => ''), base: 0.2 };
  });
  const EDGE = 14; // how many letters are mid-fade at once
  function updateFills(y) {
    const vh = M.vh;
    fills.forEach((f, n) => {
      const top = M.fills[n].top - y, h = M.fills[n].h;
      if (top + h < -vh || top > vh * 2) return;
      const p = reduce ? 1 : clamp((vh * 0.88 - top) / (vh * 0.43 + h), 0, 1);
      const head = p * (f.chars.length + EDGE);
      f.chars.forEach((c, i) => {
        const v = (f.base + (1 - f.base) * clamp((head - i) / EDGE, 0, 1)).toFixed(3);
        if (v !== f.last[i]) { f.last[i] = v; c.style.setProperty('--o', v); }
      });
    });
  }

  /* ---------- Background: tone follows the section in view; drawings drift slowly ---------- */
  // How green the background is around each section (0 = black page, 1 = deep green). Eased between section centres.
  const TONE = { hero: 0, how: 0.25, logging: 0.55, nutrition: 0.9, habits: 0.45, rewards: 1, privacy: 0.3, final: 0.7 };
  const toneEl = document.getElementById('bgTone');
  const toneSecs = Object.keys(TONE).map(id => document.getElementById(id));
  const arts = [...document.querySelectorAll('.bg-art')];
  function updateBackground(y) {
    const mid = M.vh / 2;
    const pts = toneSecs.map((s, i) => ({ c: M.tone[i] - y, v: TONE[s.id] }));
    let v = pts[0].v;
    if (mid >= pts[pts.length - 1].c) v = pts[pts.length - 1].v * clamp(1 - (mid - pts[pts.length - 1].c) / M.vh, 0, 1);
    else for (let i = 0; i < pts.length - 1; i++) {
      if (mid >= pts[i].c && mid < pts[i + 1].c) {
        const t = (mid - pts[i].c) / (pts[i + 1].c - pts[i].c);
        v = pts[i].v + (pts[i + 1].v - pts[i].v) * (t * t * (3 - 2 * t));
      }
    }
    toneEl.style.opacity = v.toFixed(3);
    arts.forEach((a, i) => {
      const c = M.arts[i].c - y, half = M.arts[i].h / 2;
      if (c + half < -200 || c - half > M.vh + 200) return;
      const off = (c - mid) * -0.18; // drifts slower than the page
      a.style.transform = `translate3d(0,${off.toFixed(1)}px,0) rotate(${(off * 0.012).toFixed(2)}deg)`;
    });
  }

  /* ---------- Loop ---------- */
  // Section positions are measured once here (and again when the layout changes), so a scroll frame only
  // does arithmetic and style writes. Reading positions on every frame between writes made the browser
  // redo layout several times per frame.
  const pageTop = el => el.getBoundingClientRect().top + scrollY;
  function measure() {
    M = {
      vh: innerHeight,
      docMax: document.documentElement.scrollHeight - innerHeight,
      heroH: heroEl.offsetHeight,
      nav: navSecs.map(s => (s ? pageTop(s) : Infinity)), // Docs has no section
      final: pageTop(afterNav),
      howTop: pageTop(how), howH: how.offsetHeight,
      fills: fills.map(f => ({ top: pageTop(f.el), h: f.el.offsetHeight })),
      tone: toneSecs.map(s => pageTop(s) + s.offsetHeight / 2),
      arts: arts.map(a => ({ c: pageTop(a.parentElement) + a.parentElement.offsetHeight / 2, h: a.parentElement.offsetHeight })),
    };
  }
  function onScroll() {
    const y = scrollY;
    updateNav(y); updateProgress(y); updateHow(y); updateFills(y); updateBackground(y);
  }
  measure();
  if (lenis) lenis.on('scroll', onScroll);
  else addEventListener('scroll', onScroll, { passive: true });
  const remeasure = () => { measure(); onScroll(); };
  addEventListener('resize', remeasure);
  new ResizeObserver(remeasure).observe(document.body);
  document.fonts.ready.then(remeasure);
  onScroll();
})();
