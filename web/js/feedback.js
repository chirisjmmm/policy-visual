/* Expert feedback as a checklist, grouped under real R&D evaluation criteria.
   Each check shows: aspect (what kind of issue) + target (structure / simulation). */
const FeedbackView = (() => {
  let DATA = null, filter = 'all';

  async function init() {
    DATA = await fetch('data/feedback.json').then(r => r.json());
    document.getElementById('fbIntro').textContent = DATA.intro;
    document.querySelectorAll('.fbf').forEach(b =>
      b.onclick = () => {
        document.querySelectorAll('.fbf').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); filter = b.dataset.filter; render();
      });
    render();
  }

  function matches(c) {
    if (filter === 'all') return true;
    if (filter === 'kg') return c.target === 'kg' || c.target === 'both';
    return c.target === 'sim' || c.target === 'both';
  }

  function render() {
    const body = document.getElementById('feedbackBody');
    body.innerHTML = '';
    let total = 0;
    DATA.frameworks.forEach(fw => {
      const srcHtml = fw.url ? `<a href="${fw.url}" target="_blank" rel="noopener">${fw.source}</a>` : fw.source;
      let crits = '';
      fw.criteria.forEach(cr => {
        const checks = cr.checks.filter(matches);
        if (!checks.length) return;
        const inds = cr.indicators.map(i => `<span class="ind-chip">${i}</span>`).join('');
        const rows = checks.map(c => {
          total++;
          const ac = DATA.aspects[c.aspect] || '#64748b';
          const tcls = c.target === 'both' ? 'kg' : c.target;
          return `<li class="ck-item">
            <span class="ck-box">✓</span>
            <div class="ck-body">
              <div class="ck-tags">
                <span class="ck-aspect" style="background:${ac}">${c.aspect}</span>
                <span class="target-tag ${tcls}">${DATA.targets[c.target]}</span>
              </div>
              <div class="ck-text">${c.text}</div>
            </div></li>`;
        }).join('');
        crits += `<div class="crit-row">
          <div class="crit-name"><h4>${cr.name}</h4><span class="crit-count">${checks.length}개 점검</span></div>
          <div class="crit-ind">${inds}</div>
          <ul class="ck-list">${rows}</ul></div>`;
      });
      if (!crits) return;
      const block = document.createElement('div');
      block.className = 'fw-block';
      block.innerHTML = `<div class="fw-header">
          <h3>${fw.name}</h3>
          <div class="fw-source">기준 출처: ${srcHtml}</div>
        </div><div class="crit">${crits}</div>`;
      body.appendChild(block);
    });
    document.getElementById('fbCount').textContent = `점검 항목 ${total}개`;
  }

  return { init };
})();
