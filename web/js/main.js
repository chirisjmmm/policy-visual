/* Tab controller + lazy view init. */
(function () {
  const inited = {};
  function activate(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    if (!inited[tab]) {
      inited[tab] = true;
      try {
        if (tab === 'graph') GraphView.init();
        if (tab === 'sim') SimView.init();
        if (tab === 'feedback') FeedbackView.init();
      } catch (e) { console.error('init', tab, e); }
    } else if (tab === 'graph') {
      // re-run layout so the SVG sizes correctly after being shown
      const r = document.getElementById('replayGraph'); if (r) r.click();
    }
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => activate(t.dataset.tab));
  activate('graph');
})();
