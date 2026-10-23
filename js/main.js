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

  // Placeholders until the official Telegram / development links exist.
  document.querySelectorAll('.tg-link, .dev-link').forEach(a => a.addEventListener('click', e => {
    if (a.getAttribute('href') === '#') e.preventDefault();
  }));

  /* ---------- Contract address buttons: short in the pill, full in the drop-down, copies on click ---------- */
  const CA = '0000000000000000000000000000000000000000pump'; // placeholder until the real address exists
  document.querySelectorAll('.ca').forEach(btn => {
    const v = btn.querySelector('.ca-v');
    const label = btn.classList.contains('ca-big') ? CA : CA.slice(0, 4) + '…' + CA.slice(-4); // the big one shows it all
    v.textContent = label;
    if (btn.closest('.menu')) btn.insertAdjacentHTML('beforeend', `<span class="ca-tip">${CA}<small>Click to copy</small></span>`);
    const tip = btn.querySelector('.ca-tip small');
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
      if (tip) tip.textContent = 'Copied to clipboard';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.classList.remove('copied');
        v.textContent = label;
        if (tip) tip.textContent = 'Click to copy';
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
  function updateNav() {
    const line = innerHeight * 0.4;
    let active = -1;
    navSecs.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) active = i; });
    if (afterNav.getBoundingClientRect().top <= line) active = -1;
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

  /* ---------- Scroll progress: the ring around the logo fills; the nav becomes an island past the hero ---------- */
  const ring = document.getElementById('ringFill');
  const RING = 2 * Math.PI * 20;
  function updateProgress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    ring.style.strokeDashoffset = (RING * (1 - p)).toFixed(2);
    navEl.classList.toggle('compact', scrollY > heroEl.offsetHeight * 0.5);
  }

  /* ---------- How it works: scrolling through the pinned section walks Log → Earn ---------- */
  // Each step owns a quarter of the pinned scroll. The green line runs continuously between the
  // number circles and reaches each circle just as its step becomes active.
  const how = document.getElementById('how');
  const loopEl = document.getElementById('loop');
  const loopLine = loopEl.querySelector('.loop-line');
  const steps = [...loopEl.querySelectorAll('li')];
  const nums = steps.map(li => li.querySelector('.n'));
  window.__how = { p: 0, step: 0 }; // read by the phone screen visuals
  // Soft pin: instead of freezing the instant the section pins, the content keeps drifting up and slows to a
  // stop over EASE_IN of scroll, then speeds back up over the last EASE_IN before the section lets go. It sits
  // R/2 low beforehand so it's centred while held. Speed is continuous at both ends (no hard stop).
  const howContent = how.querySelector('.how-pin > .wrap');
  const EASE_IN = 0.4; // share of the screen height
  function softPin(d, L) {
    const R = Math.min(innerHeight * EASE_IN, L / 2);
    let f;
    if (d <= 0) f = 0;
    else if (d < R) f = -(d - (d * d) / (2 * R));
    else if (d <= L - R) f = -R / 2;
    else if (d < L) { const e = d - (L - R); f = -R / 2 - (e * e) / (2 * R); }
    else f = -R;
    return f + R / 2;
  }
  function updateHow() {
    const r = how.getBoundingClientRect();
    howContent.style.transform = `translate3d(0,${softPin(-r.top, r.height - innerHeight).toFixed(1)}px,0)`;
    const p = clamp(-r.top / (r.height - innerHeight), 0, 1);
    const step = Math.min(steps.length - 1, Math.floor(p * steps.length));
    steps.forEach((li, i) => {
      li.classList.toggle('on', i === step);
      li.classList.toggle('done', i < step);
    });
    window.__how.p = p;
    window.__how.step = step;
  }
  // Line runs from the first circle's centre to the last one's. The open description moves the circles,
  // so re-measure every frame (cheap: four rects), and fill circle to circle rather than by a flat share.
  function sizeLoopLine() {
    const base = loopEl.getBoundingClientRect().top;
    const c = nums.map(n => { const b = n.getBoundingClientRect(); return b.top + b.height / 2 - base; });
    const len = c[c.length - 1] - c[0];
    const q = clamp(window.__how.p * steps.length, 0, steps.length - 1);
    const k = Math.min(Math.floor(q), c.length - 2);
    const at = c[k] + (c[k + 1] - c[k]) * (q - k);
    loopLine.style.setProperty('--lt', c[0] + 'px');
    loopLine.style.setProperty('--lh', len + 'px');
    loopLine.style.setProperty('--fill', len > 0 ? ((at - c[0]) / len).toFixed(4) : 0);
    if (howVisible) requestAnimationFrame(sizeLoopLine);
  }
  // Only runs while the section is on screen (it reads layout every frame).
  let howVisible = false;
  new IntersectionObserver(([e]) => {
    const was = howVisible;
    howVisible = e.isIntersecting;
    if (howVisible && !was) requestAnimationFrame(sizeLoopLine);
  }).observe(how);

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
    return { el, chars: [...el.querySelectorAll('.ch')], base: 0.2 };
  });
  const EDGE = 14; // how many letters are mid-fade at once
  function updateFills() {
    const vh = innerHeight;
    for (const f of fills) {
      const r = f.el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const p = reduce ? 1 : clamp((vh * 0.88 - r.top) / (vh * 0.43 + r.height), 0, 1);
      const head = p * (f.chars.length + EDGE);
      f.chars.forEach((c, i) => {
        const t = clamp((head - i) / EDGE, 0, 1);
        c.style.setProperty('--o', (f.base + (1 - f.base) * t).toFixed(3));
      });
    }
  }

  /* ---------- Background: tone follows the section in view; drawings drift slowly ---------- */
  // How green the background is around each section (0 = black page, 1 = deep green). Eased between section centres.
  const TONE = { hero: 0, how: 0.25, logging: 0.55, nutrition: 0.9, habits: 0.45, rewards: 1, treasury: 0.6, privacy: 0.3, final: 0.7 };
  const toneEl = document.getElementById('bgTone');
  const toneSecs = Object.keys(TONE).map(id => document.getElementById(id));
  const arts = [...document.querySelectorAll('.bg-art')];
  function updateBackground() {
    const mid = innerHeight / 2;
    const pts = toneSecs.map(s => { const r = s.getBoundingClientRect(); return { c: r.top + r.height / 2, v: TONE[s.id] }; });
    let v = pts[0].v;
    if (mid >= pts[pts.length - 1].c) v = pts[pts.length - 1].v * clamp(1 - (mid - pts[pts.length - 1].c) / innerHeight, 0, 1);
    else for (let i = 0; i < pts.length - 1; i++) {
      if (mid >= pts[i].c && mid < pts[i + 1].c) {
        const t = (mid - pts[i].c) / (pts[i + 1].c - pts[i].c);
        v = pts[i].v + (pts[i + 1].v - pts[i].v) * (t * t * (3 - 2 * t));
      }
    }
    toneEl.style.opacity = v.toFixed(3);
    arts.forEach(a => {
      const r = a.parentElement.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      const off = (r.top + r.height / 2 - mid) * -0.18; // drifts slower than the page
      a.style.transform = `translate3d(0,${off.toFixed(1)}px,0) rotate(${(off * 0.012).toFixed(2)}deg)`;
    });
  }

  /* ---------- Loop ---------- */
  function onScroll() { updateNav(); updateProgress(); updateHow(); updateFills(); updateBackground(); }
  if (lenis) lenis.on('scroll', onScroll);
  else addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
})();
