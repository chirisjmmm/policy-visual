/* Round-table multi-agent simulation view.
   Focus: FORWARD -> BACKWARD pass only.
   Story per phase: agents post diverging forward estimates (outliers visible)
   -> discussion converges to consensus -> backward (bottom-up) re-derivation
   -> forward/backward cross-check reveals where consensus held vs. broke. */
const SimView = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  let DATA = null, sc = null;          // current scenario
  let steps = [], stepIdx = 0;         // flattened (phase, stage) steps
  let playing = false, timer = null;
  let svg, wrap, seats = [];

  const STAGE_LABEL = {
    fwd_initial:  { dir: 'FORWARD ▸ 개별 추정', note: '각 에이전트가 독립적으로 추정합니다. 값이 갈리고 이상치가 보입니다.' },
    fwd_consensus:{ dir: 'FORWARD ▸ 토의 후 합의', note: '근거를 교환하며 이상치가 흡수되고 하나의 값으로 수렴합니다.' },
    backward:     { dir: 'BACKWARD ◂ 역방향 재검토', note: '결과에서 거꾸로 내려오며 상향식으로 다시 추정합니다.' },
    reconcile:    { dir: 'CROSS-CHECK ⇄ 교차검증', note: 'forward와 backward를 대조해 합의가 유지된 곳과 깨진 곳을 가립니다.' },
  };

  const fmtVal = (v, fmt, unit) => {
    if (v === null || v === undefined) return '—';
    if (fmt === 'budget') return (v / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억';
    if (fmt === 'pct') return (Math.round(v * 100) / 100) + (unit || '%');
    return v.toLocaleString('ko-KR') + (unit || '');
  };

  async function init() {
    DATA = await fetch('data/simulation.json').then(r => r.json());
    svg = document.getElementById('tableSvg');
    wrap = document.querySelector('.roundtable-wrap');
    const sel = document.getElementById('scenarioSel');
    DATA.scenarios.forEach((s, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = `${s.id} · ${s.agents.map(a => a.name).join(', ')}`;
      sel.appendChild(o);
    });
    sel.onchange = () => loadScenario(+sel.value);
    document.getElementById('prevStep').onclick = () => { stop(); go(stepIdx - 1); };
    document.getElementById('nextStep').onclick = () => { stop(); go(stepIdx + 1); };
    document.getElementById('playPause').onclick = togglePlay;
    loadScenario(0);
  }

  function loadScenario(i) {
    sc = DATA.scenarios[i];
    steps = [];
    sc.phases.forEach((ph, pi) => {
      ['fwd_initial', 'fwd_consensus', 'backward', 'reconcile'].forEach(stage =>
        steps.push({ pi, stage }));
    });
    buildPhaseTrack();
    drawSeats();
    go(0);
  }

  function buildPhaseTrack() {
    const tr = document.getElementById('phaseTrack');
    tr.innerHTML = '';
    sc.phases.forEach((ph, i) => {
      const d = document.createElement('div');
      d.className = 'phase-pill';
      d.innerHTML = `${ph.label_ko}<span class="pp-en">${ph.label_en}</span>` +
        (ph.contested_count ? `<span class="pp-flag">!${ph.contested_count}</span>` : '');
      d.onclick = () => { stop(); go(steps.findIndex(s => s.pi === i)); };
      tr.appendChild(d);
    });
  }

  // ---- seating geometry ----
  function seatPos(idx, n) {
    const ang = -Math.PI / 2 + idx / n * Math.PI * 2;   // start at top
    return { ang, x: 300 + Math.cos(ang) * 205, y: 300 + Math.sin(ang) * 205 };
  }

  function drawSeats() {
    svg.innerHTML = '';
    seats = [];
    // table surface
    const tbl = document.createElementNS(SVGNS, 'ellipse');
    tbl.setAttribute('cx', 300); tbl.setAttribute('cy', 300);
    tbl.setAttribute('rx', 150); tbl.setAttribute('ry', 138);
    tbl.setAttribute('fill', 'url(#tableGrad)');
    tbl.setAttribute('stroke', '#33415e'); tbl.setAttribute('stroke-width', 2);
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.innerHTML = `<radialGradient id="tableGrad" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#243352"/><stop offset="100%" stop-color="#161f33"/></radialGradient>`;
    svg.appendChild(defs); svg.appendChild(tbl);

    const n = sc.agents.length;
    sc.agents.forEach((a, i) => {
      const p = seatPos(i, n);
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'seat-g');
      g.setAttribute('transform', `translate(${p.x},${p.y})`);
      // connector line to table
      const cl = document.createElementNS(SVGNS, 'line');
      const ix = (300 - p.x) * 0.32, iy = (300 - p.y) * 0.32;
      cl.setAttribute('x1', 0); cl.setAttribute('y1', 0);
      cl.setAttribute('x2', ix); cl.setAttribute('y2', iy);
      cl.setAttribute('stroke', '#2c3650'); cl.setAttribute('stroke-width', 1.5);
      g.appendChild(cl);
      // avatar
      const av = document.createElementNS(SVGNS, 'circle');
      av.setAttribute('r', 30); av.setAttribute('fill', a.color);
      av.setAttribute('stroke', '#0b101b'); av.setAttribute('stroke-width', 3);
      g.appendChild(av);
      // person glyph
      const ic = document.createElementNS(SVGNS, 'text');
      ic.setAttribute('text-anchor', 'middle'); ic.setAttribute('y', 6);
      ic.setAttribute('font-size', 26); ic.textContent = '👤';
      g.appendChild(ic);
      // name + role
      const nm = document.createElementNS(SVGNS, 'text');
      nm.setAttribute('class', 'seat-name'); nm.setAttribute('text-anchor', 'middle');
      nm.setAttribute('y', 50); nm.textContent = a.name;
      g.appendChild(nm);
      const rl = document.createElementNS(SVGNS, 'text');
      rl.setAttribute('class', 'seat-role'); rl.setAttribute('text-anchor', 'middle');
      rl.setAttribute('y', 64); rl.setAttribute('fill', a.color); rl.textContent = a.type_ko;
      g.appendChild(rl);
      // value chip (rect + text), placed toward center
      const chipG = document.createElementNS(SVGNS, 'g');
      chipG.setAttribute('transform', `translate(${ix * 1.15},${iy * 1.15})`);
      const chipR = document.createElementNS(SVGNS, 'rect');
      chipR.setAttribute('x', -34); chipR.setAttribute('y', -13); chipR.setAttribute('rx', 9);
      chipR.setAttribute('width', 68); chipR.setAttribute('height', 26);
      chipR.setAttribute('fill', '#0d131f'); chipR.setAttribute('stroke', a.color); chipR.setAttribute('stroke-width', 1.5);
      const chipT = document.createElementNS(SVGNS, 'text');
      chipT.setAttribute('text-anchor', 'middle'); chipT.setAttribute('y', 5);
      chipT.setAttribute('font-size', 12); chipT.setAttribute('font-weight', 700); chipT.setAttribute('fill', '#fff');
      chipG.appendChild(chipR); chipG.appendChild(chipT);
      chipG.style.opacity = 0; chipG.style.transition = 'opacity .35s';
      g.appendChild(chipG);

      svg.appendChild(g);
      seats.push({ a, p, ix, iy, av, chipG, chipR, chipT });
    });
  }

  // pixel position within wrap for HTML bubbles
  function seatPx(seat) {
    const r = wrap.getBoundingClientRect();
    return { x: seat.p.x / 600 * r.width, y: seat.p.y / 600 * r.height, w: r.width, h: r.height };
  }

  function clearBubbles() { wrap.querySelectorAll('.bubble').forEach(b => b.remove()); }

  function showBubble(seat, html, outlier) {
    const px = seatPx(seat);
    const b = document.createElement('div');
    b.className = 'bubble' + (outlier ? ' outlier' : '');
    b.innerHTML = html;
    wrap.appendChild(b);
    // place between seat and center
    let bx = px.x + (px.w / 2 - px.x) * 0.34 - 100;
    let by = px.y + (px.h / 2 - px.y) * 0.34 - 30;
    bx = Math.max(6, Math.min(px.w - 222, bx));
    by = Math.max(6, Math.min(px.h - 90, by));
    b.style.left = bx + 'px'; b.style.top = by + 'px';
    requestAnimationFrame(() => b.classList.add('show'));
    return b;
  }

  // ---- main render of a step ----
  function go(i) {
    if (i < 0) i = 0; if (i >= steps.length) i = steps.length - 1;
    stepIdx = i;
    const { pi, stage } = steps[i];
    const ph = sc.phases[pi];
    const hv = ph.variables[0];   // headline (most contested) variable
    clearBubbles();

    // phase track state
    document.querySelectorAll('.phase-pill').forEach((p, k) => {
      p.classList.toggle('active', k === pi);
      p.classList.toggle('done', k < pi);
    });

    // center labels
    document.getElementById('tcPhase').textContent = `${ph.label_ko} · ${ph.label_en}`;
    document.getElementById('tcDir').textContent = STAGE_LABEL[stage].dir;
    const tcc = document.getElementById('tcConsensus');

    // build per-agent values for headline variable
    const fwdInit = {}; hv.initial.forEach(o => fwdInit[o.agent] = o);
    const bwdPost = {}; (ph.backward_posts || []).forEach(p => bwdPost[p.agent] = p);

    // reconciliation panel (always reflects the phase)
    renderRecon(ph, stage);
    document.getElementById('consensusNote').innerHTML =
      `<b>${STAGE_LABEL[stage].dir}</b> — ${STAGE_LABEL[stage].note}` +
      (stage === 'reconcile' ? `<br><br><b>이 단계 요약.</b> ${ph.summary || ''}` : '');

    // chip + bubble behaviour by stage
    seats.forEach(s => { s.chipG.style.opacity = 0; });

    if (stage === 'fwd_initial') {
      tcc.innerHTML = `<span class="muted-sm">개별 추정 — 값이 갈립니다</span>`;
      // reveal in posting order, sequentially
      const order = ph.posting_order && ph.posting_order.length ? ph.posting_order : sc.agents.map(a => a.name);
      let delay = 0;
      order.forEach(name => {
        const s = seats.find(x => x.a.name === name);
        if (!s) return;
        const o = fwdInit[name];
        const v = o ? o.value : null, out = o && o.outlier;
        setTimeout(() => {
          s.chipT.textContent = fmtVal(v, hv.fmt, hv.unit);
          s.chipR.setAttribute('stroke', out ? '#f59e0b' : s.a.color);
          s.chipR.setAttribute('fill', out ? '#3a2a08' : '#0d131f');
          s.chipG.style.opacity = 1;
          const post = ph.agent_posts.find(p => p.agent === name);
          const rat = post ? post.rationale : '';
          clearBubbles();
          showBubble(s, `${out ? '<span class="b-flag">이상치</span>' : ''}` +
            `<span class="b-val">${hv.label}: ${fmtVal(v, hv.fmt, hv.unit)}</span>` +
            `<span class="b-rat">${rat}</span>`, out);
        }, delay);
        delay += playing ? 700 : 0;
      });
    }
    else if (stage === 'fwd_consensus') {
      const cv = hv.consensus;
      tcc.innerHTML = `<span style="color:#5ee08a">합의 ${hv.label}<br><b style="font-size:15px;color:#fff">${fmtVal(cv, hv.fmt, hv.unit)}</b></span>`;
      seats.forEach(s => {
        s.chipT.textContent = fmtVal(cv, hv.fmt, hv.unit);
        s.chipR.setAttribute('stroke', '#22c55e'); s.chipR.setAttribute('fill', '#0e2417');
        s.chipG.style.opacity = 1;
      });
      const outs = hv.initial.filter(o => o.outlier).map(o => o.agent);
      showCenterBubble(outs.length
        ? `토의 끝에 <b>${outs.join(', ')}</b> 의 이상치가 흡수되어 <b>${fmtVal(cv, hv.fmt, hv.unit)}</b> 로 수렴`
        : `다섯 명 모두 <b>${fmtVal(cv, hv.fmt, hv.unit)}</b> 에 합의 (이견 없음)`);
    }
    else if (stage === 'backward') {
      tcc.innerHTML = `<span style="color:#c4b5fd">역방향 재추정<br><span class="muted-sm">상향식으로 다시</span></span>`;
      seats.forEach(s => {
        const bp = bwdPost[s.a.name];
        const bv = bp && bp.values ? bp.values[hv.key] : null;
        s.chipT.textContent = bv != null ? fmtVal(bv, hv.fmt, hv.unit) : '—';
        s.chipR.setAttribute('stroke', '#a855f7'); s.chipR.setAttribute('fill', '#1e1233');
        s.chipG.style.opacity = bv != null ? 1 : 0.35;
      });
      const anyB = (ph.backward_posts || [])[0];
      if (anyB) showCenterBubble(`결과(Impact)에서 거꾸로 내려오며 같은 값을 다시 점검합니다. 일부 변수에서 forward와 차이가 드러납니다.`);
    }
    else { // reconcile
      const fa = hv.forward_agg, ba = hv.backward_agg, cons = hv.consistency;
      tcc.innerHTML = `<span class="muted-sm">forward ${fmtVal(fa, hv.fmt, hv.unit)} · backward ${fmtVal(ba, hv.fmt, hv.unit)}</span>` +
        `<br><b style="font-size:15px;color:#fff">합의도 ${(cons != null ? Math.round(cons * 100) : 100)}%</b>`;
      seats.forEach(s => { s.chipG.style.opacity = 0; });
    }

    document.getElementById('stepCaption').textContent =
      `${stepIdx + 1} / ${steps.length} 단계 · ${ph.label_ko}(${ph.label_en}) — ${STAGE_LABEL[stage].dir}`;
    document.getElementById('prevStep').disabled = stepIdx === 0;
    document.getElementById('nextStep').disabled = stepIdx === steps.length - 1;
  }

  function showCenterBubble(html) {
    clearBubbles();
    const b = document.createElement('div');
    b.className = 'bubble show';
    b.style.left = '50%'; b.style.top = '50%';
    b.style.transform = 'translate(-50%,-50%) scale(1)';
    b.style.maxWidth = '230px'; b.style.textAlign = 'center';
    b.innerHTML = `<span class="b-rat" style="font-size:11.5px;color:#1a2235">${html}</span>`;
    wrap.appendChild(b);
  }

  function renderRecon(ph, stage) {
    const panel = document.getElementById('reconPanel');
    panel.innerHTML = '';
    ph.variables.forEach(v => {
      const cons = v.consistency == null ? 1 : v.consistency;
      const cls = cons >= 0.95 ? 'high' : cons >= 0.8 ? 'mid' : 'low';
      const consTxt = cons >= 0.95 ? '합의' : cons >= 0.8 ? '부분 합의' : '미합의';
      const fa = v.forward_agg, ba = v.backward_agg;
      const mx = Math.max(fa || 0, ba || 0, 1);
      const card = document.createElement('div');
      card.className = 'recon-card';
      card.innerHTML = `
        <div class="rc-top">
          <span class="rc-label">${v.label}</span>
          <span class="rc-final">${fmtVal(v.reconciled != null ? v.reconciled : v.consensus, v.fmt, v.unit)}</span>
        </div>
        <div class="rc-bars">
          <div class="rc-bar-row"><span class="rc-tag">forward</span>
            <span class="rc-track"><span class="rc-fill fwd" style="width:${(fa || 0) / mx * 100}%"></span></span>
            <span class="rc-num">${fmtVal(fa, v.fmt, v.unit)}</span></div>
          <div class="rc-bar-row"><span class="rc-tag">backward</span>
            <span class="rc-track"><span class="rc-fill bwd" style="width:${(ba || 0) / mx * 100}%"></span></span>
            <span class="rc-num">${fmtVal(ba, v.fmt, v.unit)}</span></div>
        </div>
        <div class="rc-consist"><span class="consist-pill ${cls}">${consTxt} ${Math.round(cons * 100)}%</span>
          ${v.spread ? `<span class="muted-sm">초기 분산 ${fmtVal(Math.min(...v.initial.map(o=>o.value)),v.fmt,v.unit)}~${fmtVal(Math.max(...v.initial.map(o=>o.value)),v.fmt,v.unit)}</span>` : ''}</div>`;
      panel.appendChild(card);
    });
  }

  // ---- playback ----
  function togglePlay() { playing ? stop() : start(); }
  function start() {
    playing = true;
    document.getElementById('playPause').textContent = '❚❚ 일시정지';
    if (stepIdx >= steps.length - 1) go(0);
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!playing) return;
      if (stepIdx < steps.length - 1) { go(stepIdx + 1); schedule(); }
      else stop();
    }, 2400);
  }
  function stop() {
    playing = false; clearTimeout(timer);
    document.getElementById('playPause').textContent = '▶ 자동재생';
  }

  return { init };
})();
