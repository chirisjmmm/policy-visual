/* Dependency-free force-directed knowledge-graph renderer.
   Readability-first: relation types are colored, node groups are colored,
   BK21 tracks (future/innovation) are visually distinct. */
const GraphView = (() => {
  let DATA = null, current = 'bk21', sim = null, showLabels = true;
  const SVGNS = 'http://www.w3.org/2000/svg';
  let svg, W, H, nodes = [], edges = [], relTypes = {}, groups = {};
  let tip;

  function el(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  async function init() {
    DATA = await fetch('data/graph.json').then(r => r.json());
    relTypes = DATA.relation_types; groups = DATA.node_groups;
    svg = document.getElementById('graphSvg');
    tip = document.getElementById('nodeTip');
    document.querySelectorAll('.gbtn').forEach(b =>
      b.onclick = () => { document.querySelectorAll('.gbtn').forEach(x => x.classList.remove('active')); b.classList.add('active'); current = b.dataset.graph; render(); });
    document.getElementById('replayGraph').onclick = render;
    document.getElementById('toggleLabels').onchange = e => { showLabels = e.target.checked; render(); };
    buildLegend();
    render();
  }

  function buildLegend() {
    const lg = document.getElementById('graphLegend');
    let h = '<h4>관계 (선 색)</h4>';
    for (const k in relTypes) h += `<div class="lg-row"><span class="lg-line" style="background:${relTypes[k].color}"></span>${relTypes[k].label}</div>`;
    h += '<h4 style="margin-top:9px">행위자 유형 (점 색)</h4>';
    ['gov','institution','beneficiary','resource','program','track_future','track_innov','condition','feature'].forEach(k => {
      if (groups[k]) h += `<div class="lg-row"><span class="lg-dot" style="background:${groups[k].color}"></span>${groups[k].label}</div>`;
    });
    lg.innerHTML = h;
  }

  function render() {
    const g = DATA.graphs[current];
    document.getElementById('graphTitle').textContent = g.title;
    document.getElementById('graphSubtitle').textContent = g.subtitle;
    document.getElementById('graphNote').textContent = g.note;

    const rect = svg.getBoundingClientRect();
    W = rect.width || 1000; H = 690;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';

    // defs: arrow markers per relation color
    const defs = el('defs', {});
    for (const k in relTypes) {
      const m = el('marker', { id: 'arr-' + k, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      m.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: relTypes[k].color }));
      defs.appendChild(m);
    }
    svg.appendChild(defs);

    // build node/edge objects
    const idMap = {};
    nodes = g.nodes.map((n, i) => {
      const o = Object.assign({}, n);
      o.x = W / 2 + Math.cos(i / g.nodes.length * 6.283) * 180 + (Math.random() - .5) * 40;
      o.y = H / 2 + Math.sin(i / g.nodes.length * 6.283) * 180 + (Math.random() - .5) * 40;
      o.vx = 0; o.vy = 0; o.deg = 0;
      idMap[n.id] = o; return o;
    });
    edges = g.edges.map(e => ({ ...e, s: idMap[e.source], t: idMap[e.target] }))
      .filter(e => e.s && e.t);
    edges.forEach(e => { e.s.deg++; e.t.deg++; });

    const layers = { edge: el('g', {}), elabel: el('g', {}), node: el('g', {}) };
    svg.appendChild(layers.edge); svg.appendChild(layers.elabel); svg.appendChild(layers.node);

    // edge elements
    edges.forEach(e => {
      e.line = el('line', { class: 'gedge', stroke: relTypes[e.rel].color, 'stroke-width': 2.2,
        'marker-end': 'url(#arr-' + e.rel + ')', 'stroke-opacity': .75 });
      if (e.track) e.line.setAttribute('stroke-dasharray', '');
      layers.edge.appendChild(e.line);
      if (showLabels && e.label) {
        e.lbl = el('text', { class: 'gedge-label', 'text-anchor': 'middle' });
        e.lbl.textContent = e.label;
        layers.elabel.appendChild(e.lbl);
      }
    });

    // node elements
    nodes.forEach(n => {
      const r = 16 + (n.weight || 1) * 4 + n.deg * 1.2;
      n.r = r;
      const gEl = el('g', { class: 'gnode' });
      const col = groups[n.group] ? groups[n.group].color : '#64748b';
      // outer ring for track distinction
      const ring = el('circle', { r: r + 4, fill: 'none', 'stroke-opacity': .35, 'stroke-width': 2,
        stroke: n.group === 'track_future' ? '#2563eb' : n.group === 'track_innov' ? '#ea580c' : col });
      const c = el('circle', { r, fill: col, stroke: '#0b101b', 'stroke-width': 2.5 });
      gEl.appendChild(ring); gEl.appendChild(c);
      // multi-line label
      const lines = (n.label || n.id).split('\n');
      lines.forEach((ln, i) => {
        const t = el('text', { 'text-anchor': 'middle', y: (i - (lines.length - 1) / 2) * 12.5 + 4 });
        t.textContent = ln; gEl.appendChild(t);
      });
      n.g = gEl; n.c = c;
      layers.node.appendChild(gEl);
      attachInteract(n);
    });

    runForce();
  }

  function attachInteract(n) {
    n.g.addEventListener('mouseenter', e => {
      highlight(n);
      const grp = groups[n.group] ? groups[n.group].label : '';
      tip.innerHTML = `<div class="tt-grp">${grp}</div><h5>${(n.label || '').replace(/\n/g, ' ')}</h5>${n.desc || ''}`;
      tip.style.opacity = 1;
    });
    n.g.addEventListener('mousemove', e => {
      const wrap = svg.parentElement.getBoundingClientRect();
      let x = e.clientX - wrap.left + 14, y = e.clientY - wrap.top + 14;
      if (x + 290 > wrap.width) x -= 310;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
    n.g.addEventListener('mouseleave', () => { unhighlight(); tip.style.opacity = 0; });
    // drag
    n.g.addEventListener('mousedown', e => {
      e.preventDefault();
      n.fixed = true;
      const move = ev => {
        const pt = toSvg(ev); n.x = pt.x; n.y = pt.y; n.vx = n.vy = 0;
        if (sim) ; else tick();
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
      e.line.classList.toggle('dim', !on); e.line.classList.toggle('hl', on);
      if (e.lbl) e.lbl.classList.toggle('dim', !on);
    });
  }
  function unhighlight() {
    nodes.forEach(m => m.g.classList.remove('dim'));
    edges.forEach(e => { e.line.classList.remove('dim', 'hl'); if (e.lbl) e.lbl.classList.remove('dim'); });
  }

  function runForce() {
    if (sim) cancelAnimationFrame(sim);
    let iter = 0;
    const step = () => {
      physics();
      tick();
      iter++;
      if (iter < 440) sim = requestAnimationFrame(step); else sim = null;
    };
    step();
  }

  function physics() {
    const k = 0.04, rep = 16000, cx = W / 2, cy = H / 2;
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + .01;
        let d = Math.sqrt(d2);
        const mind = a.r + b.r + 46;
        let f = rep / d2;
        if (d < mind) f += (mind - d) * 0.9 / d; // hard separation
        const fx = dx / d * f, fy = dy / d * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
      // gravity to center
      a.vx += (cx - a.x) * 0.004; a.vy += (cy - a.y) * 0.004;
    }
    // springs
    edges.forEach(e => {
      let dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.hypot(dx, dy) || 1;
      const target = 150 + (e.s.r + e.t.r) * 0.6;
      const f = (d - target) * k;
      const fx = dx / d * f, fy = dy / d * f;
      e.s.vx += fx; e.s.vy += fy; e.t.vx -= fx; e.t.vy -= fy;
    });
    nodes.forEach(n => {
      if (n.fixed) { n.vx = n.vy = 0; return; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-12, Math.min(12, n.vx));
      n.y += Math.max(-12, Math.min(12, n.vy));
      n.x = Math.max(n.r + 8, Math.min(W - n.r - 8, n.x));
      n.y = Math.max(n.r + 8, Math.min(H - n.r - 8, n.y));
    });
  }

  function tick() {
    nodes.forEach(n => n.g.setAttribute('transform', `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`));
    edges.forEach(e => {
      // shorten to node edge so arrow sits on rim
      let dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.hypot(dx, dy) || 1;
      const sx = e.s.x + dx / d * e.s.r, sy = e.s.y + dy / d * e.s.r;
      const tx = e.t.x - dx / d * (e.t.r + 6), ty = e.t.y - dy / d * (e.t.r + 6);
      e.line.setAttribute('x1', sx); e.line.setAttribute('y1', sy);
      e.line.setAttribute('x2', tx); e.line.setAttribute('y2', ty);
      if (e.lbl) { e.lbl.setAttribute('x', (sx + tx) / 2); e.lbl.setAttribute('y', (sy + ty) / 2 - 3); }
    });
  }

  return { init };
})();
