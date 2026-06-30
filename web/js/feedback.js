/* Feedback as an evaluation-framework checklist:
   left = criteria nav (with checked/total counts), right = checklist of items
   with interactive checkboxes, under an R&D logic-model evaluation framework. */
const FeedbackView = (() => {
  let DATA = null, sel = 0;
  const checked = {};   // key `${ci}:${ii}` -> bool

  async function init() {
    DATA = await fetch('data/feedback.json').then(r => r.json());
    document.getElementById('fbTitle').textContent = DATA.title;
    document.getElementById('fbIntro').textContent = DATA.intro;
    document.getElementById('fbBasis').textContent = DATA.basis || '';
    renderNav();
    renderChecklist();
  }

  function countChecked(ci) {
    const items = DATA.criteria[ci].items;
    let c = 0;
    items.forEach((_, ii) => { if (checked[`${ci}:${ii}`]) c++; });
    return c;
  }

  function renderNav() {
    const nav = document.getElementById('fbNav');
    nav.innerHTML = DATA.criteria.map((cr, ci) => `
      <button class="fbnav-item ${ci === sel ? 'active' : ''}" data-ci="${ci}">
        <div class="fbnav-top">
          <span class="fbnav-name">${cr.bumun ? `<span class="fbnav-bumun">${cr.bumun}</span>` : ''}${cr.name}</span>
          <span class="fbnav-count">${countChecked(ci)}/${cr.items.length}</span></div>
        <div class="fbnav-short">${cr.short}</div>
      </button>`).join('');
    nav.querySelectorAll('.fbnav-item').forEach(b => b.onclick = () => {
      sel = +b.dataset.ci; renderNav(); renderChecklist();
    });
  }

  function renderChecklist() {
    const cr = DATA.criteria[sel];
    const box = document.getElementById('fbChecklist');
    box.innerHTML = `
      <div class="fbck-head"><h3>${cr.bumun ? `<span class="fbck-bumun">${cr.bumun}</span>` : ''}${cr.name}</h3><span class="fbck-desc">${cr.short}</span></div>
      <ul class="fbck-list">${cr.items.map((it, ii) => {
        const key = `${sel}:${ii}`, on = checked[key];
        const tcls = it.target === 'both' ? 'kg' : it.target;
        return `<li class="fbck-item ${on ? 'checked' : ''}" data-ii="${ii}">
          <button class="fbck-box" aria-label="체크">${on ? '✓' : ''}</button>
          <div class="fbck-body">
            <div class="fbck-titlerow">
              <span class="fbck-title">${it.title}</span>
              <span class="target-tag ${tcls}">${DATA.targets[it.target]}</span>
            </div>
            <div class="fbck-text">${it.body}</div>
          </div></li>`;
      }).join('')}</ul>`;
    box.querySelectorAll('.fbck-item').forEach(li => {
      li.querySelector('.fbck-box').onclick = () => {
        const ii = li.dataset.ii, key = `${sel}:${ii}`;
        checked[key] = !checked[key];
        renderNav(); renderChecklist();
      };
    });
  }

  return { init };
})();
