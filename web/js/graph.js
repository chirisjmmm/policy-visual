/* Dependency-free force-directed knowledge-graph renderer (actor-centric).
   - Hover a node: highlight only its connected actors/edges.
   - Click a node: open an inspector panel (description + duties/benefits items).
   - Edges are curved so opposing arrows between two actors never overlap.
   - Legend is built per-graph (only the groups actually present). */
const GraphView = (() => {
  let DATA = null, current = 'bk21', sim = null, showLabels = true;
  const SVGNS = 'http://www.w3.org/2000/svg';
  let svg, W, H, nodes = [], edges = [], relTypes = {}, groups = {}, itemCats = {};
  let panel, selected = null;

  const el = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  async function init() {
    DATA = await fetch('data/graph.json').then(r => r.json());
    relTypes = DATA.relation_types; groups = DATA.node_groups; itemCats = DATA.item_cats || {};
    svg = document.getElementById('graphSvg');
    panel = document.getElementById('nodePanel');
    document.querySelectorAll('.gbtn').forEach(b =>
      b.onclick = () => { document.querySelectorAll('.gbtn').forEach(x => x.classList.remove('active')); b.classList.add('active'); current = b.dataset.graph; closePanel(); render(); });
    document.getElementById('replayGraph').onclick = render;
    document.getElementById('toggleLabels').onchange = e => { showLabels = e.target.checked; render(); };
    // clicking empty svg closes panel
    svg.addEventListener('click', e => { if (e.target === svg) closePanel(); });
    render();
  }

  function buildLegend(g) {
    const lg = document.getElementById('graphLegend');
    let h = '<h4>관계 (화살표 색)</h4>';
    const usedRel = new Set(g.edges.map(e => e.rel));
    for (const k in relTypes) if (usedRel.has(k))
      h += `<div class="lg-row"><span class="lg-line" style="background:${relTypes[k].color}"></span>${relTypes[k].label}</div>`;
    h += '<h4 style="margin-top:9px">행위자 유형 (점 색)</h4>';
    const usedGrp = [];
    g.nodes.forEach(n => { if (!usedGrp.includes(n.group)) usedGrp.push(n.group); });
    usedGrp.forEach(k => { if (groups[k])
      h += `<div class="lg-row"><span class="lg-dot" style="background:${groups[k].color}"></span>${groups[k].label}</div>`; });
    lg.innerHTML = h;
  }

  function render() {
    const g = DATA.graphs[current];
    document.getElementById('graphTitle').textContent = g.title;
    document.getElementById('graphSubtitle').textContent = g.subtitle;
    document.getElementById('graphOverview').innerHTML =
      `<h4>정책 개요</h4><p>${g.overview || ''}</p>`;
    buildLegend(g);

    const rect = svg.getBoundingClientRect();
    W = rect.width || 1000; H = 660;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';

    // arrow markers per relation color
    const defs = el('defs', {});
    for (const k in relTypes) {
      const m = el('marker', { id: 'arr-' + k, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 6.5, markerHeight: 6.5, orient: 'auto-start-reverse' });
      m.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: relTypes[k].color }));
      defs.appendChild(m);
    }
    svg.appendChild(defs);

    const idMap = {};
    nodes = g.nodes.map((n, i) => {
      const o = Object.assign({}, n);
      o.x = W / 2 + Math.cos(i / g.nodes.length * 6.283) * 200 + (Math.random() - .5) * 40;
      o.y = H / 2 + Math.sin(i / g.nodes.length * 6.283) * 200 + (Math.random() - .5) * 40;
      o.vx = 0; o.vy = 0; o.deg = 0;
      idMap[n.id] = o; return o;
    });
    // bidirectional detection
    const pairCount = {};
    edges = g.edges.map(e => ({ ...e, s: idMap[e.source], t: idMap[e.target] })).filter(e => e.s && e.t);
    edges.forEach(e => {
      e.s.deg++; e.t.deg++;
      const key = [e.source, e.target].sort().join('__');
      pairCount[key] = (pairCount[key] || 0) + 1;
    });
    edges.forEach(e => {
      const key = [e.source, e.target].sort().join('__');
      const bidir = pairCount[key] > 1;
      // canonical sign so the two opposing edges bend to opposite sides
      const forward = e.source < e.target;
      e.curve = bidir ? (forward ? 30 : -30) : 16;
    });

    const layers = { edge: el('g', {}), elabel: el('g', {}), node: el('g', {}) };
    svg.appendChild(layers.edge); svg.appendChild(layers.elabel); svg.appendChild(layers.node);

    edges.forEach(e => {
      e.path = el('path', { class: 'gedge', fill: 'none', stroke: relTypes[e.rel].color,
        'stroke-width': 2.2, 'marker-end': 'url(#arr-' + e.rel + ')', 'stroke-opacity': .8 });
      layers.edge.appendChild(e.path);
      if (showLabels && e.label) {
        e.lblBg = el('rect', { class: 'gedge-bg', rx: 4, fill: '#ffffff', 'fill-opacity': .82 });
        e.lbl = el('text', { class: 'gedge-label', 'text-anchor': 'middle' });
        e.lbl.textContent = e.label;
        layers.elabel.appendChild(e.lblBg); layers.elabel.appendChild(e.lbl);
      }
    });

    nodes.forEach(n => {
      n.r = 17 + (n.weight || 1) * 4 + n.deg * 1.0;
      const gEl = el('g', { class: 'gnode' });
      const col = groups[n.group] ? groups[n.group].color : '#64748b';
      const ring = el('circle', { r: n.r + 4, fill: 'none', 'stroke-opacity': .4, 'stroke-width': 2,
        stroke: n.group === 'track_future' ? '#1c64f2' : n.group === 'track_innov' ? '#e8590c' : col });
      const c = el('circle', { r: n.r, fill: col, stroke: '#ffffff', 'stroke-width': 2.5 });
      gEl.appendChild(ring); gEl.appendChild(c);
      const lines = (n.label || n.id).split('\n');
      lines.forEach((ln, i) => {
        const t = el('text', { class: 'gnode-label', 'text-anchor': 'middle', y: (i - (lines.length - 1) / 2) * 12.5 + 4 });
        t.textContent = ln; gEl.appendChild(t);
      });
      n.g = gEl; n.c = c; n.ringEl = ring;
      layers.node.appendChild(gEl);
      attachInteract(n);
    });

    runForce();
  }

  function attachInteract(n) {
    n.g.addEventListener('mouseenter', () => { if (!selected) highlight(n); });
    n.g.addEventListener('mouseleave', () => { if (!selected) unhighlight(); });
    n.g.addEventListener('click', e => { e.stopPropagation(); openPanel(n); });
    // drag
    n.g.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      let moved = false;
      n.fixed = true;
      const move = ev => {
        moved = true;
        const pt = toSvg(ev); n.x = pt.x; n.y = pt.y; n.vx = n.vy = 0;
        if (!sim) tick();
      };
      const up = () => { n.fixed = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }

  function toSvg(ev) {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }

  function highlight(n) {
    const keep = new Set([n.id]);
    edges.forEach(e => { if (e.s === n || e.t === n) { keep.add(e.s.id); keep.add(e.t.id); } });
    nodes.forEach(m => m.g.classList.toggle('dim', !keep.has(m.id)));
    edges.forEach(e => {
      const on = e.s === n || e.t === n;
      e.path.classList.toggle('dim', !on); e.path.classList.toggle('hl', on);
      if (e.lbl) { e.lbl.classList.toggle('dim', !on); e.lblBg.classList.toggle('dim', !on); }
    });
  }
  function unhighlight() {
    nodes.forEach(m => m.g.classList.remove('dim', 'sel'));
    edges.forEach(e => { e.path.classList.remove('dim', 'hl'); if (e.lbl) { e.lbl.classList.remove('dim'); e.lblBg.classList.remove('dim'); } });
  }

  /* ---------- node inspector panel ---------- */
  function openPanel(n) {
    selected = n;
    highlight(n);
    nodes.forEach(m => m.g.classList.toggle('sel', m === n));
    const grpLabel = groups[n.group] ? groups[n.group].label : '';
    const grpColor = groups[n.group] ? groups[n.group].color : '#64748b';
    // group items by category
    const byCat = {};
    (n.items || []).forEach(it => { (byCat[it.cat] = byCat[it.cat] || []).push(it); });
    let itemsHtml = '';
    Object.keys(byCat).forEach(cat => {
      const cc = itemCats[cat] ? itemCats[cat].color : '#64748b';
      const chips = byCat[cat].map((it, i) =>
        `<button class="np-chip" data-cat="${cat}" data-i="${i}" style="border-color:${cc}">`
        + `${it.deontic ? `<span class="np-deontic">${it.deontic}</span>` : ''}${it.label}</button>`).join('');
      itemsHtml += `<div class="np-cat"><span class="np-cat-name" style="color:${cc}">${cat}</span><div class="np-chips">${chips}</div></div>`;
    });
    const bullets = (n.bullets || []).map(b => `<li>${b}</li>`).join('');
    panel.innerHTML = `
      <button class="np-close" aria-label="닫기">×</button>
      <div class="np-grp" style="color:${grpColor}">● 행위자 · ${grpLabel}</div>
      <h3 class="np-title">${(n.label || '').replace(/\n/g, ' ')}</h3>
      ${n.subtitle ? `<div class="np-sub">${n.subtitle}</div>` : ''}
      <ul class="np-bullets">${bullets}</ul>
      ${itemsHtml ? `<div class="np-items-head">관계 · 수행 항목 <span class="muted-sm">(이 행위자가 관여하는 자원·정보·규정·과제 — 클릭)</span></div>${itemsHtml}` : ''}
      <div class="np-detail" id="npDetail"></div>`;
    panel.classList.add('show');
    panel.querySelector('.np-close').onclick = closePanel;
    panel.querySelectorAll('.np-chip').forEach(btn => btn.onclick = () => {
      panel.querySelectorAll('.np-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const it = byCat[btn.dataset.cat][+btn.dataset.i];
      document.getElementById('npDetail').innerHTML =
        `<b>${it.label}</b>${it.deontic ? ` <span class="np-deontic sm">${it.deontic}</span>` : ''}<br>${it.desc || ''}`;
    });
  }
  function closePanel() {
    selected = null; panel.classList.remove('show'); panel.innerHTML = '';
    unhighlight();
  }

  /* ---------- force simulation ---------- */
  function runForce() {
    if (sim) cancelAnimationFrame(sim);
    let iter = 0;
    const step = () => { physics(); tick(); if (++iter < 460) sim = requestAnimationFrame(step); else sim = null; };
    step();
  }
  function physics() {
    const k = 0.04, rep = 17000, cx = W / 2, cy = H / 2;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + .01, d = Math.sqrt(d2);
        const mind = a.r + b.r + 50;
        let f = rep / d2;
        if (d < mind) f += (mind - d) * 0.9 / d;
        const fx = dx / d * f, fy = dy / d * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      a.vx += (cx - a.x) * 0.004; a.vy += (cy - a.y) * 0.004;
    }
    edges.forEach(e => {
      let dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.hypot(dx, dy) || 1;
      const target = 158 + (e.s.r + e.t.r) * 0.6;
      const f = (d - target) * k, fx = dx / d * f, fy = dy / d * f;
      e.s.vx += fx; e.s.vy += fy; e.t.vx -= fx; e.t.vy -= fy;
    });
    nodes.forEach(n => {
      if (n.fixed) { n.vx = n.vy = 0; return; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-12, Math.min(12, n.vx)); n.y += Math.max(-12, Math.min(12, n.vy));
      n.x = Math.max(n.r + 10, Math.min(W - n.r - 10, n.x));
      n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y));
    });
  }

  function tick() {
    nodes.forEach(n => n.g.setAttribute('transform', `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`));
    edges.forEach(e => {
      const p0 = { x: e.s.x, y: e.s.y }, p1 = { x: e.t.x, y: e.t.y };
      const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
      let dx = p1.x - p0.x, dy = p1.y - p0.y, d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;                 // unit normal
      const cxp = mx + nx * e.curve, cyp = my + ny * e.curve;   // control point
      // start/end trimmed to node rims, aimed at control point
      let sdx = cxp - p0.x, sdy = cyp - p0.y, sd = Math.hypot(sdx, sdy) || 1;
      const sx = p0.x + sdx / sd * e.s.r, sy = p0.y + sdy / sd * e.s.r;
      let edx = cxp - p1.x, edy = cyp - p1.y, ed = Math.hypot(edx, edy) || 1;
      const ex = p1.x + edx / ed * (e.t.r + 7), ey = p1.y + edy / ed * (e.t.r + 7);
      e.path.setAttribute('d', `M${sx.toFixed(1)},${sy.toFixed(1)} Q${cxp.toFixed(1)},${cyp.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
      if (e.lbl) {
        // label at quadratic midpoint (t=0.5)
        const lx = 0.25 * sx + 0.5 * cxp + 0.25 * ex, ly = 0.25 * sy + 0.5 * cyp + 0.25 * ey;
        e.lbl.setAttribute('x', lx.toFixed(1)); e.lbl.setAttribute('y', (ly + 3).toFixed(1));
        const w = (e.label.length * 6.2) + 8, h = 15;
        e.lblBg.setAttribute('x', (lx - w / 2).toFixed(1)); e.lblBg.setAttribute('y', (ly - h + 4).toFixed(1));
        e.lblBg.setAttribute('width', w.toFixed(1)); e.lblBg.setAttribute('height', h);
      }
    });
  }

  return { init };
})();
