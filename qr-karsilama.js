'use strict';
(function () {
  if (document.getElementById('betaQrWelcome')) return;
  const links = window.BETA_QR_LINKS || {};
  const root = document.createElement('div');
  root.id = 'betaQrWelcome';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'betaQrTitle');
  root.innerHTML = `
    <div class="beta-qr-box">
      <div class="beta-qr-mark" aria-hidden="true">🎮</div>
      <h1 id="betaQrTitle">BETA <em>PLAYSTATION</em></h1>
      <p class="beta-qr-subtitle">CAFE & GAMING</p>
      <nav class="beta-qr-links" aria-label="QR bağlantı seçenekleri">
        <button id="betaQrMenu" type="button" class="beta-qr-link beta-qr-link--menu"><span class="beta-qr-item"><span class="beta-qr-emoji" aria-hidden="true">📋</span> Menüye Git</span><span class="beta-qr-arrow" aria-hidden="true">›</span></button>
        <a id="betaQrInstagram" class="beta-qr-link" target="_blank" rel="noopener noreferrer"><span class="beta-qr-item"><span class="beta-qr-emoji" aria-hidden="true">📸</span> Instagram</span><span class="beta-qr-arrow" aria-hidden="true">›</span></a>
        <a id="betaQrWhatsapp" class="beta-qr-link" target="_blank" rel="noopener noreferrer"><span class="beta-qr-item"><span class="beta-qr-emoji" aria-hidden="true">💬</span> WhatsApp</span><span class="beta-qr-arrow" aria-hidden="true">›</span></a>
        <a id="betaQrGoogle" class="beta-qr-link" target="_blank" rel="noopener noreferrer"><span class="beta-qr-item"><span class="beta-qr-emoji" aria-hidden="true">⭐</span> Google Yorumlar</span><span class="beta-qr-arrow" aria-hidden="true">›</span></a>
      </nav>
      <div id="betaQrMessage" class="beta-qr-message" role="status"></div>
      <p class="beta-qr-note">Sipariş vermek için locanızdaki QR kodu kullanın.</p>
    </div>`;
  document.body.appendChild(root);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const menuButton = root.querySelector('#betaQrMenu');
  menuButton.addEventListener('click', () => {
    root.hidden = true;
    document.body.style.overflow = previousOverflow;
    // Mevcut URL ve ?loca= parametresi korunur; mevcut menü/sipariş kodları değişmez.
  });
  const options = [
    ['#betaQrInstagram', links.instagram],
    ['#betaQrWhatsapp', links.whatsapp],
    ['#betaQrGoogle', links.googleReviews]
  ];
  for (const [id, value] of options) {
    const el = root.querySelector(id);
    let valid = false;
    try {
      const url = new URL(String(value || '').trim());
      valid = (url.protocol === 'https:' || url.protocol === 'http:');
      if (valid) el.href = url.href;
    } catch (_) { /* Bağlantı henüz tanımlanmadı. */ }
    if (!valid) {
      el.setAttribute('aria-disabled', 'true');
      el.removeAttribute('href');
      el.removeAttribute('target');
      el.addEventListener('click', event => {
        event.preventDefault();
        root.querySelector('#betaQrMessage').textContent = 'Bu bağlantı henüz eklenmedi. İşletme yöneticisine başvurun.';
      });
    }
  }
  menuButton.focus({ preventScroll: true });
})();
