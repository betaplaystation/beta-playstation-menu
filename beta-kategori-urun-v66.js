/* Beta Playstation V66 — kategori içinde ürün fotoğrafı, düzenleme ve yeni ürün.
   V64'ten SONRA yüklenir. Mevcut admin.js / Supabase veri yazma akışını kullanır. */
(() => {
  'use strict';
  const list = document.getElementById('categoriesList');
  if (!list) return;
  let working = false;

  function enhance() {
    if (working) return;
    working = true;
    try {
      const panels = list.querySelectorAll('.v64-category-products');
      for (const panel of panels) {
        const prev = panel.previousElementSibling;
        const categoryId = prev?.querySelector('[data-edit-category]')?.dataset.editCategory;
        if (!categoryId || panel.dataset.v66Ready === '1') continue;
        panel.dataset.v66Ready = '1';

        // Kategorinin içine yeni ürün eklemeye doğrudan geç.
        const toolbar = document.createElement('div');
        toolbar.className = 'v66-category-toolbar';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn v66-add-product';
        add.textContent = '＋ Bu Kategoriye Ürün Ekle';
        add.addEventListener('click', () => {
          document.querySelector('[data-view="products"]')?.click();
          if (typeof resetProduct === 'function') resetProduct();
          const select = document.getElementById('productCategory');
          if (select) select.value = categoryId;
          document.getElementById('productName')?.focus();
          window.scrollTo({top: 0, behavior: 'smooth'});
        });
        toolbar.append(add);
        const title = panel.querySelector('h3');
        if (title) title.insertAdjacentElement('afterend', toolbar);
        else panel.prepend(toolbar);

        for (const row of panel.querySelectorAll('.v64-product-row')) {
          const id = row.dataset.v64Product;
          const p = typeof store !== 'undefined' ? store.products.find(x => x.id === id) : null;
          if (!p) continue;
          const info = row.querySelector('.v64-product-name');
          if (!info) continue;
          const media = document.createElement('span');
          media.className = 'v66-product-media';
          if (p.image_url && /^https:\/\//i.test(p.image_url)) {
            const img = document.createElement('img');
            img.src = p.image_url;
            img.alt = p.name + ' fotoğrafı';
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', () => {media.textContent = '📷';});
            media.append(img);
          } else {
            media.textContent = '📷';
            media.title = 'Bu ürün için fotoğraf tanımlanmamış';
          }
          row.insertBefore(media, info);
          const actions = row.querySelector('.v64-status-actions');
          if (actions) {
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn secondary v66-edit-product';
            edit.textContent = '✎ Düzenle';
            edit.addEventListener('click', () => {
              document.querySelector('[data-view="products"]')?.click();
              if (typeof editProduct === 'function') editProduct(id);
              document.getElementById('productName')?.focus();
            });
            actions.prepend(edit);
          }
        }
      }
    } finally { working = false; }
  }

  const observer = new MutationObserver(enhance);
  observer.observe(list, {childList: true, subtree: true});
  enhance();
})();
