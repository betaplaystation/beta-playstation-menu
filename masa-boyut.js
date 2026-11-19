/* Beta Playstation V13 — Sadece masa kartlarının görünüm boyutunu değiştirir.
   Supabase, adisyon, süre ve masa hesapları üzerinde hiçbir işlem yapmaz. */
(() => {
  'use strict';
  const sizes = [180, 210, 255, 300, 350, 420];
  const defaultIndex = 2;
  const storageKey = 'beta-playstation-card-size-v13';
  const down = document.getElementById('cardSizeDown');
  const up = document.getElementById('cardSizeUp');
  const reset = document.getElementById('cardSizeReset');
  const display = document.getElementById('cardSizeDisplay');
  const cards = document.getElementById('cards');
  if (!down || !up || !reset || !display || !cards) return;

  let index = defaultIndex;
  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (Number.isInteger(saved) && saved >= 0 && saved < sizes.length) index = saved;
  } catch (_) { /* Özel pencerede depolama kapalı olabilir. */ }

  function update() {
    cards.style.setProperty('--beta-card-width', `${sizes[index]}px`);
    display.textContent = `${Math.round(sizes[index] / sizes[defaultIndex] * 100)}%`;
    display.title = `${sizes[index]} piksel asgari masa genişliği`;
    down.disabled = index === 0;
    up.disabled = index === sizes.length - 1;
    reset.disabled = index === defaultIndex;
    try { localStorage.setItem(storageKey, String(index)); } catch (_) {}
  }
  down.addEventListener('click', () => { if (index > 0) { index--; update(); } });
  up.addEventListener('click', () => { if (index < sizes.length - 1) { index++; update(); } });
  reset.addEventListener('click', () => { index = defaultIndex; update(); });
  update();
})();
