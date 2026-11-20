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
  // V51: Menüye Git -> dinamik kategori listesi -> seçili kategorinin ürünleri.
  let stage = 'home';
  let categoryObserver = null;
  const box = root.querySelector('.beta-qr-box');
  const home = box.innerHTML;

  function getCategories() {
    // Gerçek müşteri menüsündeki kategori düğmeleri, Supabase yüklemesinden sonra oluşur.
    const buttons = Array.from(document.querySelectorAll('#tabs .tab[data-id]'));
    return buttons.filter(btn => btn.dataset.id && btn.dataset.id !== 'all').map(btn => ({
      id: btn.dataset.id, title: btn.textContent.trim()
    }));
  }
  function stopObserving() {
    if (categoryObserver) { categoryObserver.disconnect(); categoryObserver = null; }
  }
  function drawCategories() {
    if (stage !== 'categories') return;
    const list = root.querySelector('#betaQrCategories');
    if (!list) return;
    const categories = getCategories();
    list.replaceChildren();
    if (!categories.length) {
      const loading = document.createElement('p');
      loading.className = 'beta-qr-loading';
      loading.textContent = document.querySelector('#message.error')?.textContent || 'Kategoriler yükleniyor...';
      list.appendChild(loading);
      return;
    }
    stopObserving();
    for (const category of categories) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'beta-qr-category';
      const name = document.createElement('span');
      name.textContent = category.title;
      const arrow = document.createElement('span');
      arrow.textContent = '›';
      arrow.setAttribute('aria-hidden', 'true');
      btn.append(name, arrow);
      btn.addEventListener('click', () => {
        const tab = Array.from(document.querySelectorAll('#tabs .tab[data-id]'))
          .find(el => el.dataset.id === category.id);
        if (!tab) return;
        tab.click(); // Mevcut menu.js render akışını kullan; sipariş/loca koduna dokunma.
        stage = 'products';
        stopObserving();
        root.hidden = true;
        document.body.style.overflow = previousOverflow;
        const section = document.querySelector('.section-head') || document.querySelector('#products');
        if (section) section.scrollIntoView({ block: 'start' });
      });
      list.appendChild(btn);
    }
  }
  function showCategories() {
    stage = 'categories';
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    box.innerHTML = '<button type="button" id="betaQrBack" class="beta-qr-back">← Ana ekrana dön</button><h1 id="betaQrTitle">MENÜ <em>KATEGORİLERİ</em></h1><p class="beta-qr-subtitle">Görüntülemek istediğin kategoriyi seç</p><div id="betaQrCategories" class="beta-qr-categories" aria-label="Ürün kategorileri"></div>';
    root.querySelector('#betaQrBack').addEventListener('click', showHome);
    drawCategories();
    if (!getCategories().length) {
      stopObserving();
      const tabs = document.querySelector('#tabs');
      if (tabs) {
        categoryObserver = new MutationObserver(drawCategories);
        categoryObserver.observe(tabs, { childList: true, subtree: true });
      }
    }
  }
  function showHome() {
    stopObserving();
    stage = 'home';
    box.innerHTML = home;
    // Dinamik olarak tekrar kurulan ilk ekranın olaylarını yeniden bağla.
    root.querySelector('#betaQrMenu').addEventListener('click', showCategories);
    configureLinks();
  }
  menuButton.addEventListener('click', showCategories);

  // Ürün ekranından tekrar kategorilere dönülebilsin.
  const reopen = document.createElement('button');
  reopen.id = 'betaQrReopenCategories';
  reopen.type = 'button';
  reopen.textContent = '☰ Kategoriler';
  reopen.addEventListener('click', showCategories);
  const search = document.querySelector('.searchrow');
  if (search) search.parentNode.insertBefore(reopen, search);
  else document.body.appendChild(reopen);

  function configureLinks() {
    const options = [
      ['#betaQrInstagram', links.instagram],
      ['#betaQrWhatsapp', links.whatsapp],
      ['#betaQrGoogle', links.googleReviews]
    ];
    for (const [id, value] of options) {
      const el = root.querySelector(id);
      if (!el) continue;
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
          const msg = root.querySelector('#betaQrMessage');
          if (msg) msg.textContent = 'Bu bağlantı henüz eklenmedi. İşletme yöneticisine başvurun.';
        });
      }
    }
  }
  configureLinks();
  menuButton.focus({ preventScroll: true });
})();
