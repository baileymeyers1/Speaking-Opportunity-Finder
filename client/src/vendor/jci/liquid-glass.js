/* JCI Intelligence kit · liquid glass.
   Real refraction for a few choice elements, after Apple's Liquid Glass (macOS Tahoe).
   - A displacement map shaped to the element bends what sits behind it at the rim and magnifies the middle a
     touch. Red, green and blue bend by slightly different amounts at the edge (dispersion), like real glass.
   - Inset highlights draw the bezel (kit.css, .lg-lens): key light top left, rim light bottom right, depth below.
   - Springs move it. Glass stays glass: speed adds only a little stretch and a little more bend, on a smooth bell.
   Chromium renders the refraction (an SVG filter inside backdrop-filter). Safari and Firefox get a soft frosted
   fallback with the same bezel. Needs engine.js (JCI.Spring, JCI.animator). Only on things that move over
   something worth bending: the date selector, the theme knob, chart tooltips, chart lenses and loupes. */
(function () {
  'use strict';
  const JCI = (window.JCI = window.JCI || {});
  const NS = 'http://www.w3.org/2000/svg';
  const refracts = /Chrome\/\d+/.test(navigator.userAgent);
  const $ = (t) => (typeof t === 'string' ? document.querySelector(t) : t);
  let defs = null, uid = 0;

  function svgNode(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(n);
    return n;
  }
  function getDefs() {
    if (defs) return defs;
    const svg = svgNode('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    defs = svgNode('defs', {}, svg);
    document.body.appendChild(svg);
    return defs;
  }

  // Displacement map for a rounded rectangle. R and G carry the x and y shift (128 means none).
  // Inside the bezel the shift points inward along the surface normal, strongest at the edge, the way light
  // bends through a rounded rim. A small term toward the center magnifies the flat middle. With even, the middle
  // magnifies the same amount both ways (for glass that sits on a label or an icon, which must not stretch).
  const maps = new Map();
  function displacementMap(w, h, radius, bezel, magnify, even) {
    const key = [w, h, radius, bezel, magnify, even ? 1 : 0].join('|');
    if (maps.has(key)) return maps.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h), px = img.data;
    const hx = w / 2, hy = h / 2, r = Math.min(radius, hx, hy);
    const mx = even ? Math.max(hx, hy) : hx, my = even ? Math.max(hx, hy) : hy;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = x + 0.5 - hx, cy = y + 0.5 - hy;
        const qx = Math.abs(cx) - (hx - r), qy = Math.abs(cy) - (hy - r);
        const inside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
        const depth = -inside; // distance from the edge, inward
        let dx = -(cx / mx) * magnify, dy = -(cy / my) * magnify;
        if (depth > 0 && depth < bezel) {
          let nx, ny;
          if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; nx = qx / l; ny = qy / l; }
          else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
          nx *= Math.sign(cx) || 1; ny *= Math.sign(cy) || 1;
          const t = 1 - depth / bezel;       // 1 at the rim, 0 where the flat begins
          const m = t * t * (1.6 - 0.6 * t); // steep at the rim, easing into the flat
          dx -= nx * m; dy -= ny * m;
        }
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        const i = (y * w + x) * 4;
        px[i] = Math.round(128 + dx * 127);
        px[i + 1] = Math.round(128 + dy * 127);
        px[i + 2] = 128;
        px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL();
    maps.set(key, url);
    return url;
  }

  // Calibration: the shift (scale / 2 at most) must stay well under the bezel width, or the rim folds the
  // backdrop over itself and letters vanish. Keep scale below about 1.4 x bezel.
  // The filter: one displacement per color channel at slightly different strengths, recombined.
  function buildFilter(filter, w, h, map, scale, dispersion) {
    while (filter.firstChild) filter.removeChild(filter.firstChild);
    svgNode('feImage', { href: map, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' }, filter);
    const shifts = [];
    if (dispersion > 0) {
      const channels = [
        ['R', 1 + dispersion, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['G', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['B', 1 - dispersion, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
      ];
      channels.forEach(([c, k, matrix]) => {
        const d = svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: scale * k, xChannelSelector: 'R', yChannelSelector: 'G', result: `d${c}` }, filter);
        d.k = k;
        shifts.push(d);
        svgNode('feColorMatrix', { in: `d${c}`, type: 'matrix', values: matrix, result: `c${c}` }, filter);
      });
      svgNode('feBlend', { in: 'cR', in2: 'cG', mode: 'screen', result: 'rg' }, filter);
      svgNode('feBlend', { in: 'rg', in2: 'cB', mode: 'screen' }, filter);
    } else {
      const d = svgNode('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale, xChannelSelector: 'R', yChannelSelector: 'G' }, filter);
      d.k = 1;
      shifts.push(d);
    }
    return shifts;
  }

  const glass = (JCI.glass = { refracts });

  // Turn an element into a glass surface. Adds a lens layer behind its content; content stays sharp on top.
  glass.surface = (target, options = {}) => {
    const el = $(target);
    if (!el) return null;
    const o = { bezel: 14, refraction: 16, dispersion: 0.08, magnify: 0.25, blur: 0.4, saturate: 1.3, brightness: 1.02, fallbackBlur: 8, ...options };
    el.classList.add('lg-surface');
    let lens = el.querySelector(':scope > .lg-lens');
    if (!lens) {
      lens = document.createElement('span');
      lens.className = 'lg-lens';
      lens.setAttribute('aria-hidden', 'true');
      el.prepend(lens);
    }
    const id = `lg-${(++uid).toString(36)}`;
    let filter = null, shifts = [], w = 0, h = 0, scale = o.refraction;
    const tail = `blur(${o.blur}px) saturate(${o.saturate}) brightness(${o.brightness})`;
    const apply = () => {
      const nw = Math.round(lens.offsetWidth), nh = Math.round(lens.offsetHeight);
      if (!nw || !nh) return;
      if (!refracts) {
        const v = `blur(${o.fallbackBlur}px) saturate(${o.saturate})`;
        lens.style.backdropFilter = v; lens.style.webkitBackdropFilter = v;
        return;
      }
      if (filter && nw === w && nh === h) return;
      w = nw; h = nh;
      const radius = o.radius ?? (parseFloat(getComputedStyle(lens).borderTopLeftRadius) || 0);
      const map = displacementMap(w, h, Math.round(radius), Math.min(o.bezel, w / 2, h / 2), o.magnify, o.even);
      if (!filter) filter = svgNode('filter', { id, x: 0, y: 0, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, getDefs());
      filter.setAttribute('width', w);
      filter.setAttribute('height', h);
      shifts = buildFilter(filter, w, h, map, scale, o.dispersion);
      lens.style.backdropFilter = `url(#${id}) ${tail}`;
    };
    new ResizeObserver(apply).observe(lens);
    apply();
    return {
      el, lens,
      setRefraction(s) {
        if (Math.abs(s - scale) < 0.05) return;
        scale = s;
        shifts.forEach((d) => d.setAttribute('scale', (s * d.k).toFixed(2)));
      },
      refresh: apply,
    };
  };

  // Glass that slides and stays glass: a clear lens at rest and in motion, so nothing flips between solid and
  // clear. Speed only adds a little stretch along the path and a little more bend at the rim, and both ride a
  // bell that rises and falls with the slide's own speed (measured against this move's expected peak), so the
  // lens eases out of each position and into the next with no step anywhere.
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function slider(lens, g, o) {
    const k = o.k ?? 190;
    const X = new JCI.Spring(0, { k, c: o.c ?? 24, eps: 0.05 });
    const S = new JCI.Spring(0, { k: 260, c: 32, eps: 0.002 }); // follows speed closely, so the bend peaks mid-slide
    let span = 24;
    const peak = () => 0.42 * span * Math.sqrt(k); // about the top speed of a move this long
    const paint = () => {
      const speed = clamp01(S.x), stretch = Math.min(o.maxStretch ?? 0.16, Math.abs(X.v) / (o.stretchSpeed ?? 3800));
      // No --lift here: tint, sheen and shadow stay exactly as they are at rest.
      lens.style.transform = `translateX(${X.x.toFixed(2)}px) scale(${(1 + stretch).toFixed(4)}, ${(1 - stretch * 0.35).toFixed(4)})`;
      g.setRefraction(o.rest + (o.travel - o.rest) * speed);
      if (o.paint) o.paint(speed, X);
    };
    const wake = JCI.animator((dt) => {
      const a = X.step(dt);
      const t = clamp01(Math.abs(X.v) / peak());
      S.to(a ? t * t * (3 - 2 * t) : 0);
      const b = S.step(dt);
      paint();
      return a || b;
    });
    return {
      X,
      to(x, animate) {
        span = Math.max(24, Math.abs(x - X.x));
        X.to(x, !animate);
        if (!animate) paint(); // placed, not moved: show it now, not a frame late
        wake();
      },
    };
  }

  // Segmented control with a clear glass platter. The chosen label sits under it, magnified a little; sliding,
  // the platter carries that magnification across and the labels it passes bend at its rim.
  glass.segmented = (target, o = {}) => {
    const box = $(target);
    if (!box) return null;
    const btns = [...box.querySelectorAll('button')];
    const lens = document.createElement('span');
    lens.className = 'lseg__lens';
    lens.setAttribute('aria-hidden', 'true');
    box.appendChild(lens);
    const rest = o.rest ?? 8, travel = o.travel ?? 11; // bezel 8 keeps the label in the flat middle
    const g = glass.surface(lens, { bezel: o.bezel ?? 8, refraction: rest, dispersion: 0.06, magnify: 0.8, even: true, blur: 0.2, saturate: 1.25, brightness: 1.03 });
    const s = slider(lens, g, { rest, travel });
    const go = (b, animate) => {
      btns.forEach((n) => n.setAttribute('aria-pressed', String(n === b)));
      lens.style.width = `${b.offsetWidth}px`;
      s.to(b.offsetLeft, animate && !JCI.reduced());
    };
    btns.forEach((b) => b.addEventListener('click', () => go(b, true)));
    const active = () => btns.find((b) => b.getAttribute('aria-pressed') === 'true') || btns[0];
    const settle = () => go(active(), false);
    requestAnimationFrame(settle);
    if (document.fonts) document.fonts.ready.then(settle);
    new ResizeObserver(settle).observe(box);
    return { go: (i) => go(btns[i], true) };
  };

  // Switch with a clear glass knob: a bead of glass that magnifies the icon it rests on (sun or moon on the
  // track) and bends the other as it slides across. --p (0 to 1, on the button) is its position, so the track's
  // icons can brighten as the knob arrives.
  glass.toggle = (target) => {
    const btn = $(target);
    if (!btn) return null;
    const knob = btn.querySelector('.lswitch__knob');
    // No color split here: on an icon this small it reads as a rendering fault, not glass.
    const g = glass.surface(knob, { bezel: 8, refraction: 9, dispersion: 0, magnify: 0.7, even: true, blur: 0.2, saturate: 1.3, brightness: 1.03 });
    const travel = () => btn.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft;
    const s = slider(knob, g, { rest: 9, travel: 11, k: 170, c: 23, maxStretch: 0.2, stretchSpeed: 1500,
      paint: (speed, X) => btn.style.setProperty('--p', clamp01(X.x / (travel() || 1)).toFixed(3)) });
    let on = btn.getAttribute('aria-pressed') === 'true';
    const place = (state, animate) => { on = state; s.to(state ? travel() : 0, animate && !JCI.reduced()); };
    place(on, false);
    new ResizeObserver(() => place(on, false)).observe(btn);
    return {
      go: (state) => place(state, true),
      // Where the knob comes to rest, in viewport coordinates.
      landing: (state) => {
        const r = btn.getBoundingClientRect();
        return { x: r.left + knob.offsetLeft + (state ? travel() : 0) + knob.offsetWidth / 2, y: r.top + r.height / 2 };
      },
    };
  };

  // A magnifier that glides to a point over a chart: clear glass with a strong, even magnify, and a caption below.
  // The chamber and the terrain use it. host must be positioned; to(x, y) takes host pixels and snaps to data
  // (a seat, a column's top), not the raw pointer. It fades on its own element, so nothing above it ever
  // isolates the glass from what it bends.
  glass.loupe = (host, o = {}) => {
    const L = Math.round(o.size || 96);
    const el = document.createElement('div');
    el.className = 'viz-layer loupe';
    el.setAttribute('aria-hidden', 'true');
    const lens = document.createElement('div');
    lens.className = 'loupe__lens';
    lens.style.width = lens.style.height = `${L}px`;
    const cap = document.createElement('div'), head = document.createElement('b'), line = document.createElement('span');
    cap.className = 'loupe__cap';
    cap.append(head, line);
    el.append(lens, cap);
    host.appendChild(el);
    glass.surface(lens, { bezel: Math.round(L * 0.24), refraction: Math.round(L * 0.31), dispersion: o.dispersion ?? 0.08, magnify: o.magnify ?? 0.85, blur: 0.15, saturate: 1.3, brightness: 1.03 });
    const X = new JCI.Spring(0, { k: 210, c: 25, eps: 0.05 }), Y = new JCI.Spring(0, { k: 210, c: 25, eps: 0.05 }), A = new JCI.Spring(0, { k: 200, c: 24, eps: 0.003 });
    const wake = JCI.animator((dt) => {
      const a = X.step(dt), b = Y.step(dt), c = A.step(dt);
      const stretch = Math.min(0.08, Math.hypot(X.v, Y.v) / 9000);
      el.style.transform = `translate(${(X.x - L / 2).toFixed(2)}px, ${(Y.x - L / 2).toFixed(2)}px)`;
      el.style.opacity = A.x.toFixed(3);
      lens.style.transform = `scale(${(0.86 + 0.14 * A.x + stretch).toFixed(4)})`;
      return a || b || c;
    });
    return {
      el,
      to(x, y, title, sub) {
        const jump = A.x < 0.05;
        X.to(x, jump); Y.to(y, jump); A.to(1);
        head.textContent = title || ''; line.textContent = sub || '';
        wake();
      },
      hide() { A.to(0); wake(); },
    };
  };

  // A lens that follows the pointer across a region (demonstration and chart use).
  glass.follow = (target, region, o = {}) => {
    const el = $(target), area = $(region);
    if (!el || !area) return null;
    const g = glass.surface(el, { bezel: o.bezel ?? 28, refraction: o.refraction ?? 26, dispersion: 0.08, magnify: 0.3, blur: 0.3, saturate: 1.25, brightness: 1.02 });
    const X = new JCI.Spring(0, { eps: 0.1 }), L = new JCI.Spring(0, { k: 200, c: 22, eps: 0.002 });
    const home = () => (area.clientWidth - el.offsetWidth) / 2;
    const paint = () => {
      const lift = Math.max(0, L.x), stretch = Math.min(0.1, Math.abs(X.v) / 6000);
      el.style.transform = `translateX(${X.x.toFixed(2)}px) scale(${(1 + 0.05 * lift + stretch).toFixed(4)}, ${(1 + 0.05 * lift - stretch * 0.5).toFixed(4)})`;
      el.style.setProperty('--lift', lift.toFixed(3));
      g.setRefraction((o.refraction ?? 26) * (0.85 + 0.15 * lift));
    };
    const wake = JCI.animator((dt) => { const a = X.step(dt), b = L.step(dt); paint(); return a || b; });
    area.addEventListener('pointermove', (e) => {
      const r = area.getBoundingClientRect();
      X.to(Math.max(0, Math.min(area.clientWidth - el.offsetWidth, e.clientX - r.left - el.offsetWidth / 2)));
      L.to(1); wake();
    });
    area.addEventListener('pointerleave', () => { X.to(home()); L.to(0); wake(); });
    X.to(home(), true); paint();
    new ResizeObserver(() => { X.to(home(), true); paint(); }).observe(area);
    return g;
  };
})();
