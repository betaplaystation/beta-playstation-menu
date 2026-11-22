/* Beta Playstation V64 — admin sipariş yönlendirmesi, kategori ürünleri, ikili stok görünürlüğü.
   Mevcut hesap, ödeme, QR sipariş ve adet bazlı stok kodlarını değiştirmez. */
(() => {
  'use strict';
  const adminCategories = document.getElementById('categoriesList');
  const tableOrders = document.getElementById('tabOrders');
  if (tableOrders) {
    tableOrders.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(new URL('admin.html?view=orders', window.location.href).href);
    }, true);
  }
  if (!adminCategories) return;
  // Stok sadece kategori içinden Var/Yok olarak yönetilsin.
  const legacyStockNav = document.querySelector('[data-view="stock"]');
  if (legacyStockNav) legacyStockNav.hidden = true;

  // admin.js is the owner of store/db/reload. This add-on uses those existing
  // authorized objects, and never embeds credentials in the browser.
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatPrice = value => new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY'}).format(Number(value) || 0);
  let expandedId = null;
  let rendering = false;

  function mountCategoryRows() {
    if (rendering) return;
    rendering = true;
    try {
      for (const editButton of adminCategories.querySelectorAll('[data-edit-category]')) {
        const row = editButton.closest('.listrow');
        if (!row || row.dataset.v64Ready) continue;
        row.dataset.v64Ready = '1';
        const id = editButton.dataset.editCategory;
        const label = row.querySelector('.grow');
        if (!label) continue;
        label.classList.add('v64-category-opener');
        label.setAttribute('role', 'button');
        label.setAttribute('tabindex', '0');
        label.setAttribute('aria-expanded', String(expandedId === id));
        label.setAttribute('title', 'İçindeki ürünleri ve stok durumlarını göster');
        label.addEventListener('click', () => toggleCategory(id));
        label.addEventListener('keydown', (e) => {if (e.key === 'Enter' || e.key === ' ') {e.preventDefault(); toggleCategory(id)}});
      }
      if (expandedId && !adminCategories.querySelector('.v64-category-products')) {
        showCategory(expandedId);
      }
    } finally { rendering = false; }
  }

  function toggleCategory(id) {
    if (expandedId === id) {
      expandedId = null;
      adminCategories.querySelectorAll('.v64-category-products').forEach(x => x.remove());
      adminCategories.querySelectorAll('.v64-category-opener').forEach(x => x.setAttribute('aria-expanded','false'));
    } else {
      expandedId = id;
      showCategory(id);
    }
  }

  function showCategory(id) {
    const row = [...adminCategories.querySelectorAll('.listrow')].find(r => r.querySelector('[data-edit-category]')?.dataset.editCategory === id);
    if (!row) return;
    adminCategories.querySelectorAll('.v64-category-products').forEach(x => x.remove());
    adminCategories.querySelectorAll('.v64-category-opener').forEach(x => x.setAttribute('aria-expanded', String(x.closest('.listrow') === row)));
    const products = store.products.filter(p => p.category_id === id).sort((a,b) => (Number(a.sort_order)||0) - (Number(b.sort_order)||0));
    const category = store.categories.find(c => c.id === id);
    const panel = document.createElement('div');
    panel.className = 'v64-category-products';
    panel.innerHTML = `<h3>${escapeHtml(category?.name || 'Kategori')} — Ürünler (${products.length})</h3><p class="v64-tip">Stok Yok seçilen ürün müşteri menüsünde gizlenir. Adet bazlı stok sayacı değiştirilmez.</p>` +
      (products.length ? products.map(p => `<div class="v64-product-row" data-v64-product="${escapeHtml(p.id)}"><div class="v64-product-name"><strong>${escapeHtml(p.name)}</strong><small>${formatPrice(p.price)}</small></div><div class="v64-status-actions"><button type="button" class="v64-stock-btn ${p.available ? 'is-active v64-yes' : ''}" data-v64-stock="1">✓ Stok Var</button><button type="button" class="v64-stock-btn ${!p.available ? 'is-active v64-no' : ''}" data-v64-stock="0">✕ Stok Yok</button></div></div>`).join('') : '<p class="v64-tip">Bu kategoride henüz ürün yok.</p>');
    row.insertAdjacentElement('afterend', panel);
    for (const button of panel.querySelectorAll('[data-v64-stock]')) {
      button.addEventListener('click', () => changeStatus(button.closest('[data-v64-product]').dataset.v64Product, button.dataset.v64Stock === '1'));
    }
  }

  async function changeStatus(productId, available) {
    const product = store.products.find(p => p.id === productId);
    if (!product || Boolean(product.available) === available) return;
    const panel = adminCategories.querySelector('.v64-category-products');
    if (!panel) return;
    const buttons = [...panel.querySelectorAll('[data-v64-stock]')];
    buttons.forEach(b => b.disabled = true);
    try {
      // Varsa eski adet bazlı stok takibini kaldır: aksi halde stok 0 ise
      // 'Stok Var' denmesine rağmen müşteri menüsünde 'Tükendi' kalır.
      if (available && product.stock_tracking_enabled === true) {
        const tracking = await db.rpc('manage_product_stock', {p_product_id: productId, p_delta: 0, p_tracking: false});
        if (tracking.error) throw Error('Eski adetli stok takibi kapatılamadı: ' + tracking.error.message);
      }
      const {error} = await db.from('products').update({available}).eq('id', productId);
      if (error) throw error;
      product.available = available;
      await reload();
      message(product.name + (available ? ' — Stok Var: menüde gösteriliyor.' : ' — Stok Yok: menüde gizlendi.'));
    } catch (error) {
      buttons.forEach(b => b.disabled = false);
      message('Stok durumu kaydedilemedi: ' + error.message, true);
    }
  }

  const observer = new MutationObserver(mountCategoryRows);
  observer.observe(adminCategories, {childList: true});
  mountCategoryRows();

  // Direct landing into the administrator's real orders screen, not the
  // tables-only summary. Authorization still takes place in admin.js.
  if (new URLSearchParams(window.location.search).get('view') === 'orders') {
    const dashboard = document.getElementById('dashboard');
    let done = false;
    const openOrders = () => {
      if (done || !dashboard || dashboard.classList.contains('hidden')) return;
      done = true;
      document.querySelector('[data-view="orders"]')?.click();
      authObserver.disconnect();
    };
    const authObserver = new MutationObserver(openOrders);
    if (dashboard) authObserver.observe(dashboard, {attributes: true, attributeFilter: ['class']});
    openOrders();
  }
})();
