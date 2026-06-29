/* Round-table multi-agent simulation view (FORWARD then BACKWARD).
   The whole forward pass (Inputs..Impact) runs first; then the whole backward
   pass (Impact..Inputs) re-derives bottom-up and is cross-checked against forward.
   A U-turn flow map shows where we are; clicking a result box reveals the
   reasoning of agents who dissented. */
const SimView = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  let DATA = null, sc = null;
  let steps = [], stepIdx = 0;
  let playing = false, timer = null;
  let svg, wrap, seats = [];
  let policy = 'ssf';
  const AUTOPLAY_MS = 3600, REVEAL_MS = 1100;
  const BADGE_NOTE = { ssf: '(macro-avg 최상)', bk21: '(BK21 대표 시나리오)' };

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
    // policy toggle (BK21 / SSF)
    const polWrap = document.getElementById('simPolicy');
    const policies = DATA.policies || { ssf: '세종과학펠로우십' };
    polWrap.innerHTML = Object.keys(policies).map(p =>
      `<button class="spbtn ${p === policy ? 'active' : ''}" data-policy="${p}">${policies[p]}</button>`).join('');
    polWrap.querySelectorAll('.spbtn').forEach(b => b.onclick = () => selectPolicy(b.dataset.policy));
    sel.onchange = () => loadScenario(+sel.value);
    document.getElementById('prevStep').onclick = () => { stop(); go(stepIdx - 1); };
    document.getElementById('nextStep').onclick = () => { stop(); go(stepIdx + 1); };
    document.getElementById('playPause').onclick = togglePlay;
    selectPolicy(policy);
  }

  function selectPolicy(p) {
    stop();
    policy = p;
    document.querySelectorAll('.spbtn').forEach(b => b.classList.toggle('active', b.dataset.policy === p));
    const sel = document.getElementById('scenarioSel');
    sel.innerHTML = '';
    let first = -1;
    DATA.scenarios.forEach((s, i) => {
      if (s.policy !== p) return;
      if (first < 0) first = i;
      const o = document.createElement('option');
      o.value = i; o.textContent = `${s.id} · ${s.agents.map(a => a.name).join(', ')}`;
      sel.appendChild(o);
    });
    const badge = document.getElementById('passBadge');
    if (badge) badge.innerHTML = `진행 방식: <b>Forward → Backward</b> <i>${BADGE_NOTE[p] || ''}</i>`;
    if (first >= 0) loadScenario(first);
  }

  function loadScenario(i) {
    sc = DATA.scenarios[i];
    const n = sc.phases.length;
    steps = [];
    // whole forward pass first (each phase: spread -> consensus)
    for (let pi = 0; pi < n; pi++) {
      steps.push({ pi, dir: 'fwd', stage: 'initial' });
      steps.push({ pi, dir: 'fwd', stage: 'consensus' });
    }
    // then whole backward pass (Impact -> Inputs)
    for (let pi = n - 1; pi >= 0; pi--) {
      steps.push({ pi, dir: 'bwd', stage: 'backward' });
    }
    buildFlowMap();
    drawSeats();
    go(0);
  }

  /* ---------- U-turn flow map ---------- */
  function buildFlowMap() {
    const fm = document.getElementById('flowMap');
    const cells = (cls) => sc.phases.map((ph, pi) =>
      `<div class="flow-cell ${cls}" data-pi="${pi}" data-row="${cls}">
         <span class="fc-ko">${ph.label_ko}</span><span class="fc-en">${ph.label_en}</span></div>`
    ).join('<span class="flow-arrow">▸</span>');
    fm.innerHTML = `
      <div class="flow-row">
        <span class="flow-tag fwd">FORWARD ▶<small>하향식</small></span>
        <div class="flow-cells">${cells('fwd')}</div>
        <span class="flow-uturn">⤾</span>
      </div>
      <div class="flow-row">
        <span class="flow-tag bwd">◀ BACKWARD<small>상향식</small></span>
        <div class="flow-cells reverse">${cells('bwd')}</div>
        <span class="flow-uturn ghost"></span>
      </div>`;
    fm.querySelectorAll('.flow-cell').forEach(c => c.onclick = () => {
      stop();
      const pi = +c.dataset.pi, row = c.dataset.row;
      const idx = steps.findIndex(s => s.pi === pi && (row === 'fwd' ? s.dir === 'fwd' : s.dir === 'bwd'));
      if (idx >= 0) go(idx);
    });
  }
  function updateFlow(step) {
    document.querySelectorAll('.flow-cell').forEach(c => {
      const pi = +c.dataset.pi, row = c.dataset.row;
      c.classList.remove('active', 'done');
      if (row === 'fwd') {
        if (step.dir === 'fwd' && step.pi === pi) c.classList.add('active');
        else if (step.dir === 'bwd' || (step.dir === 'fwd' && step.pi > pi)) c.classList.add('done');
      } else {
        if (step.dir === 'bwd' && step.pi === pi) c.classList.add('active');
        else if (step.dir === 'bwd' && pi > step.pi) c.classList.add('done');
      }
    });
  }

  /* ---------- seating ---------- */
  function seatPos(idx, n) {
    const ang = -Math.PI / 2 + idx / n * Math.PI * 2;
    return { ang, x: 300 + Math.cos(ang) * 205, y: 300 + Math.sin(ang) * 205 };
  }
  function drawSeats() {
    svg.innerHTML = ''; seats = [];
    const defs = document.createElementNS(SVGNS, 'defs');
    defs.innerHTML = `<radialGradient id="tableGrad" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#f7f9fc"/><stop offset="100%" stop-color="#dde5f1"/></radialGradient>`;
    svg.appendChild(defs);
    const tbl = document.createElementNS(SVGNS, 'ellipse');
    tbl.setAttribute('cx', 300); tbl.setAttribute('cy', 300);
    tbl.setAttribute('rx', 150); tbl.setAttribute('ry', 138);
    tbl.setAttribute('fill', 'url(#tableGrad)');
    tbl.setAttribute('stroke', '#c6cfdd'); tbl.setAttribute('stroke-width', 2);
    svg.appendChild(tbl);

    const n = sc.agents.length;
    sc.agents.forEach((a, i) => {
      const p = seatPos(i, n);
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'seat-g'); g.setAttribute('transform', `translate(${p.x},${p.y})`);
      const ix = (300 - p.x) * 0.32, iy = (300 - p.y) * 0.32;
      const cl = document.createElementNS(SVGNS, 'line');
      cl.setAttribute('x1', 0); cl.setAttribute('y1', 0); cl.setAttribute('x2', ix); cl.setAttribute('y2', iy);
      cl.setAttribute('stroke', '#ccd4e1'); cl.setAttribute('stroke-width', 1.5); g.appendChild(cl);
      // plain colored person icon (head + shoulders silhouette)
      const head = document.createElementNS(SVGNS, 'circle');
      head.setAttribute('cx', 0); head.setAttribute('cy', -14); head.setAttribute('r', 11);
      head.setAttribute('fill', a.color); head.setAttribute('stroke', '#ffffff'); head.setAttribute('stroke-width', 2.5);
      const body = document.createElementNS(SVGNS, 'path');
      body.setAttribute('d', 'M0,-2 C-12,-2 -19,8 -19,24 L19,24 C19,8 12,-2 0,-2 Z');
      body.setAttribute('fill', a.color); body.setAttribute('stroke', '#ffffff'); body.setAttribute('stroke-width', 2.5);
      g.appendChild(body); g.appendChild(head);
      const nm = document.createElementNS(SVGNS, 'text');
      nm.setAttribute('class', 'seat-name'); nm.setAttribute('text-anchor', 'middle');
      nm.setAttribute('y', 46); nm.textContent = a.name; g.appendChild(nm);
      const rl = document.createElementNS(SVGNS, 'text');
      rl.setAttribute('class', 'seat-role'); rl.setAttribute('text-anchor', 'middle');
      rl.setAttribute('y', 60); rl.setAttribute('fill', a.color); rl.textContent = a.type_ko; g.appendChild(rl);
      // value chip
      const chipG = document.createElementNS(SVGNS, 'g');
      chipG.setAttribute('transform', `translate(${ix * 1.15},${iy * 1.15})`);
      const chipR = document.createElementNS(SVGNS, 'rect');
      chipR.setAttribute('x', -34); chipR.setAttribute('y', -13); chipR.setAttribute('rx', 9);
      chipR.setAttribute('width', 68); chipR.setAttribute('height', 26);
      chipR.setAttribute('fill', '#ffffff'); chipR.setAttribute('stroke', a.color); chipR.setAttribute('stroke-width', 1.5);
      const chipT = document.createElementNS(SVGNS, 'text');
      chipT.setAttribute('text-anchor', 'middle'); chipT.setAttribute('y', 5);
      chipT.setAttribute('font-size', 12); chipT.setAttribute('font-weight', 700); chipT.setAttribute('fill', '#1c2435');
      chipG.appendChild(chipR); chipG.appendChild(chipT);
      chipG.style.opacity = 0; chipG.style.transition = 'opacity .4s';
      g.appendChild(chipG);
      svg.appendChild(g);
      seats.push({ a, p, ix, iy, chipG, chipR, chipT });
    });
  }

  function seatPx(seat) {
    const r = wrap.getBoundingClientRect();
    return { x: seat.p.x / 600 * r.width, y: seat.p.y / 600 * r.height, w: r.width, h: r.height };
  }
  function clearBubbles() { wrap.querySelectorAll('.bubble').forEach(b => b.remove()); }
  function showBubble(seat, html, outlier) {
    const px = seatPx(seat);
    const b = document.createElement('div');
    b.className = 'bubble' + (outlier ? ' outlier' : '');
    b.innerHTML = html; wrap.appendChild(b);
    let bx = px.x + (px.w / 2 - px.x) * 0.34 - 105, by = px.y + (px.h / 2 - px.y) * 0.34 - 32;
    bx = Math.max(6, Math.min(px.w - 224, bx)); by = Math.max(6, Math.min(px.h - 92, by));
    b.style.left = bx + 'px'; b.style.top = by + 'px';
    requestAnimationFrame(() => b.classList.add('show'));
    return b;
  }
  function showCenterBubble(html) {
    clearBubbles();
    const b = document.createElement('div');
    b.className = 'bubble show'; b.style.left = '50%'; b.style.top = '50%';
    b.style.transform = 'translate(-50%,-50%) scale(1)'; b.style.maxWidth = '232px'; b.style.textAlign = 'center';
    b.innerHTML = `<span class="b-rat" style="font-size:11.5px;color:#1a2235">${html}</span>`;
    wrap.appendChild(b);
  }

  /* ---------- main step render ---------- */
  function go(i) {
    if (i < 0) i = 0; if (i >= steps.length) i = steps.length - 1;
    stepIdx = i;
    const step = steps[i], ph = sc.phases[step.pi], hv = ph.variables[0];
    clearBubbles();
    updateFlow(step);

    document.getElementById('tcPhase').textContent = `${ph.label_ko} · ${ph.label_en}`;
    const tcDir = document.getElementById('tcDir'), tcc = document.getElementById('tcConsensus');

    const fwdInit = {}; hv.initial.forEach(o => fwdInit[o.agent] = o);
    const bwdPost = {}; (ph.backward_posts || []).forEach(p => bwdPost[p.agent] = p);

    seats.forEach(s => { s.chipG.style.opacity = 0; });

    if (step.stage === 'initial') {
      tcDir.textContent = 'FORWARD ▸ 개별 추정';
      tcc.innerHTML = `<span class="muted-sm">각자 독립적으로 추정 — 값이 갈립니다</span>`;
      const order = ph.posting_order && ph.posting_order.length ? ph.posting_order : sc.agents.map(a => a.name);
      let delay = 0;
      order.forEach(name => {
        const s = seats.find(x => x.a.name === name); if (!s) return;
        const o = fwdInit[name], v = o ? o.value : null, out = o && o.outlier;
        setTimeout(() => {
          s.chipT.textContent = fmtVal(v, hv.fmt, hv.unit);
          s.chipR.setAttribute('stroke', out ? '#d97706' : s.a.color);
          s.chipR.setAttribute('fill', out ? '#fff7e6' : '#ffffff');
          s.chipG.style.opacity = 1;
          const post = ph.agent_posts.find(p => p.agent === name);
          clearBubbles();
          showBubble(s, `${out ? '<span class="b-flag">이견</span>' : ''}` +
            `<span class="b-val">${hv.label}: ${fmtVal(v, hv.fmt, hv.unit)}</span>` +
            `<span class="b-rat">${post ? (post.rationale_ko || '') : ''}</span>`, out);
        }, delay);
        delay += playing ? REVEAL_MS : 0;
      });
    } else if (step.stage === 'consensus') {
      tcDir.textContent = 'FORWARD ▸ 토의 후 합의';
      const cv = hv.consensus;
      tcc.innerHTML = `<span style="color:#15803d">합의 ${hv.label}<br><b style="font-size:15px;color:#16203a">${fmtVal(cv, hv.fmt, hv.unit)}</b></span>`;
      seats.forEach(s => {
        s.chipT.textContent = fmtVal(cv, hv.fmt, hv.unit);
        s.chipR.setAttribute('stroke', '#16a34a'); s.chipR.setAttribute('fill', '#e7f7ee');
        s.chipG.style.opacity = 1;
      });
      const outs = hv.initial.filter(o => o.outlier).map(o => o.agent);
      showCenterBubble(outs.length
        ? `토의 끝에 <b>${outs.join(', ')}</b>의 이견이 흡수되어 <b>${fmtVal(cv, hv.fmt, hv.unit)}</b>로 수렴`
        : `다섯 명 모두 <b>${fmtVal(cv, hv.fmt, hv.unit)}</b>에 합의 (이견 없음)`);
    } else { // backward
      tcDir.textContent = 'BACKWARD ◂ 상향식 재추정';
      const cons = hv.consistency, fa = hv.forward_agg, ba = hv.backward_agg;
      tcc.innerHTML = `<span style="color:#7c3aed">forward ${fmtVal(fa, hv.fmt, hv.unit)} ↔ backward ${fmtVal(ba, hv.fmt, hv.unit)}</span>` +
        `<br><b style="font-size:15px;color:#16203a">합의도 ${cons != null ? Math.round(cons * 100) : 100}%</b>`;
      seats.forEach(s => {
        const bp = bwdPost[s.a.name], bv = bp && bp.values ? bp.values[hv.key] : null;
        s.chipT.textContent = bv != null ? fmtVal(bv, hv.fmt, hv.unit) : '—';
        s.chipR.setAttribute('stroke', '#9333ea'); s.chipR.setAttribute('fill', '#f3e9fe');
        s.chipG.style.opacity = bv != null ? 1 : 0.35;
      });
      showCenterBubble(`결과(Impact)에서 거꾸로 내려오며 상향식으로 다시 추정해 forward와 대조합니다.`);
    }

    renderRecon(ph, step);
    showSummary(ph, step);

    document.getElementById('stepCaption').textContent =
      `${stepIdx + 1} / ${steps.length} 단계 · ${step.dir === 'fwd' ? 'Forward' : 'Backward'} · ${ph.label_ko}(${ph.label_en})`;
    document.getElementById('prevStep').disabled = stepIdx === 0;
    document.getElementById('nextStep').disabled = stepIdx === steps.length - 1;
  }

  /* ---------- compact result boxes ---------- */
  function renderRecon(ph, step) {
    const panel = document.getElementById('reconPanel');
    document.getElementById('reconTitle').innerHTML = step.dir === 'bwd'
      ? '이 단계의 결론 <span class="muted-sm">(forward ↔ backward 교차검증)</span>'
      : '이 단계의 결론 <span class="muted-sm">(forward 토의 합의값)</span>';
    panel.innerHTML = '';
    ph.variables.forEach((v, idx) => {
      const cons = v.consistency == null ? 1 : v.consistency;
      const cls = cons >= 0.95 ? 'high' : cons >= 0.8 ? 'mid' : 'low';
      const consTxt = cons >= 0.95 ? '합의' : cons >= 0.8 ? '부분합의' : '미합의';
      const hasDis = (v.dissent || []).length > 0;
      const finalVal = fmtVal(v.reconciled != null ? v.reconciled : v.consensus, v.fmt, v.unit);
      const row = document.createElement('div');
      row.className = 'vrow' + (hasDis ? ' clickable' : '');
      row.innerHTML = `
        <div class="vrow-main">
          <span class="vrow-label">${v.label}${hasDis ? ` <span class="vrow-dis">이견 ${v.dissent.length}</span>` : ''}</span>
          <span class="vrow-val">${finalVal}</span>
        </div>
        <div class="vrow-meta">
          ${step.dir === 'bwd'
            ? `<span class="vm fwd">F ${fmtVal(v.forward_agg, v.fmt, v.unit)}</span>
               <span class="vm bwd">B ${fmtVal(v.backward_agg, v.fmt, v.unit)}</span>
               <span class="consist-pill ${cls}">${consTxt} ${Math.round(cons * 100)}%</span>`
            : (v.spread ? `<span class="muted-sm">초기 ${fmtVal(Math.min(...v.initial.map(o => o.value)), v.fmt, v.unit)}~${fmtVal(Math.max(...v.initial.map(o => o.value)), v.fmt, v.unit)} → 합의</span>`
                        : `<span class="muted-sm">이견 없음</span>`)}
        </div>`;
      if (hasDis) row.onclick = () => showDissent(v, row);
      panel.appendChild(row);
    });
  }

  function showDissent(v, row) {
    document.querySelectorAll('.vrow').forEach(r => r.classList.remove('open'));
    row.classList.add('open');
    const box = document.getElementById('detailBox');
    const items = v.dissent.map(d => `
      <div class="dis-item">
        <div class="dis-head"><b>${d.agent}</b> <span class="dis-type">${d.type_ko}</span>
          <span class="dis-dir">${v.label} ${d.value} · ${d.direction}</span></div>
        <div class="dis-persona">“${d.persona}”</div>
      </div>`).join('');
    box.innerHTML = `<div class="db-head">‘${v.label}’에 이견을 낸 참여자 <button class="db-back" id="dbBack">← 토의 요약</button></div>
      <div class="dis-list">${items}</div>
      <div class="dis-note">위 참여자들은 각자의 배경·관점 때문에 다수와 다른 값을 제시했고, 토의 과정에서 근거를 교환하며 합의값으로 수렴했습니다.</div>`;
    document.getElementById('dbBack').onclick = () => { row.classList.remove('open'); showSummary(curPh, curStep); };
  }

  let curPh = null, curStep = null;
  function showSummary(ph, step) {
    curPh = ph; curStep = step;
    document.querySelectorAll('.vrow').forEach(r => r.classList.remove('open'));
    const box = document.getElementById('detailBox');
    if (step.stage === 'initial') {
      box.innerHTML = `<div class="db-head">개별 추정 단계</div>
        <p class="db-text">각 참여자가 자신의 배경·관점에 따라 독립적으로 값을 제시하는 단계입니다. 값이 갈리는 변수와 이견을 낸 참여자(주황)를 확인하세요. 위 ‘이견’ 표시가 있는 결과 박스를 누르면 그 근거가 나타납니다.</p>`;
    } else {
      box.innerHTML = `<div class="db-head">${step.dir === 'bwd' ? 'Forward ↔ Backward 교차검증 요약' : '토의 · 합의 요약'}</div>
        <p class="db-text">${ph.summary_ko || ''}</p>`;
    }
  }

  /* ---------- playback ---------- */
  function togglePlay() { playing ? stop() : start(); }
  function start() {
    playing = true; document.getElementById('playPause').textContent = '❚❚ 일시정지';
    if (stepIdx >= steps.length - 1) go(0); else go(stepIdx);
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!playing) return;
      if (stepIdx < steps.length - 1) { go(stepIdx + 1); schedule(); } else stop();
    }, AUTOPLAY_MS);
  }
  function stop() {
    playing = false; clearTimeout(timer);
    document.getElementById('playPause').textContent = '▶ 자동재생';
  }

  return { init };
})();
