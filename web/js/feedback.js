/* Expert feedback framework, organised under real R&D evaluation criteria. */
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

  const TARGET_KO = { kg: '정책 구조', sim: '시뮬레이션', both: '구조+시뮬' };

  function render() {
    const body = document.getElementById('feedbackBody');
    body.innerHTML = '';
    DATA.frameworks.forEach(fw => {
      const block = document.createElement('div');
      block.className = 'fw-block';
      const srcHtml = fw.url
        ? `<a href="${fw.url}" target="_blank" rel="noopener">${fw.source}</a>` : fw.source;
      let crits = '';
      fw.criteria.forEach(cr => {
        const items = cr.feedback.filter(f =>
          filter === 'all' ? true :
          filter === 'kg' ? (f.target === 'kg' || f.target === 'both') :
          (f.target === 'sim' || f.target === 'both'));
        if (!items.length) return;
        const inds = cr.indicators.map(i => `<span class="ind-chip">${i}</span>`).join('');
        const itemsHtml = items.map(f => {
          const col = DATA.expert_types[f.expert] || '#64748b';
          const tcls = f.target === 'both' ? 'kg' : f.target;
          return `<div class="fb-item">
            <div class="fb-left">
              <span class="expert-tag" style="background:${col}">${f.expert}</span>
              <span class="target-tag ${tcls}">${TARGET_KO[f.target]}</span>
            </div>
            <div class="fb-text">${f.text}</div></div>`;
        }).join('');
        crits += `<div class="crit-row">
          <div class="crit-name"><h4>${cr.name}</h4></div>
          <div class="crit-ind">${inds}</div>
          <div class="fb-items">${itemsHtml}</div></div>`;
      });
      if (!crits) return;
      block.innerHTML = `<div class="fw-header">
          <h3>${fw.name}</h3>
          <div class="fw-tagline">${fw.tagline}</div>
          <div class="fw-source">기준 출처: ${srcHtml}</div>
        </div><div class="crit">${crits}</div>`;
      body.appendChild(block);
    });
  }

  return { init };
})();
