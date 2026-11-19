/* V31 — Masa simgelerinin boyutu; isimler sabit kalır. */
(() => {
  'use strict';
  const iconSizes = [34, 42, 54, 66, 80, 96];
  const defaultIndex = 2;
  const storageKey = 'beta-playstation-icon-size-v31';
  const down = document.getElementById('cardSizeDown');
  const up = document.getElementById('cardSizeUp');
  const reset = document.getElementById('cardSizeReset');
  const display = document.getElementById('cardSizeDisplay');
  const cards = document.getElementById('cards');
  if (!down || !up || !reset || !display || !cards) return;
  let index = defaultIndex;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) {
      const saved = Number(raw);
      if (Number.isInteger(saved) && saved >= 0 && saved < iconSizes.length) index = saved;
    }
  } catch (_) {}
  function update() {
    const n = iconSizes[index];
    cards.style.setProperty('--beta-icon-size', n + 'px');
    cards.style.setProperty('--beta-tile-width', Math.max(100,n + 42) + 'px');
    cards.style.setProperty('--beta-tile-height', Math.max(123,n + 83) + 'px');
    display.textContent = Math.round(n / iconSizes[defaultIndex] * 100) + '%';
    display.title = 'Simge boyutu: ' + n + ' piksel. Masa adı sabit puntoda.';
    down.disabled = index === 0;
    up.disabled = index === iconSizes.length - 1;
    reset.disabled = index === defaultIndex;
    try {localStorage.setItem(storageKey,String(index));}catch(_) {}
  }
  down.addEventListener('click',()=>{if(index>0){index--;update();}});
  up.addEventListener('click',()=>{if(index<iconSizes.length-1){index++;update();}});
  reset.addEventListener('click',()=>{index=defaultIndex;update();});
  update();
})();
