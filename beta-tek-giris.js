/* Beta Playstation V48 - Kullanıcı adı girişi ve ortak oturum.
 * Bu dosyada parola bulunmaz. Parola Supabase Auth tarafından doğrulanır.
 * Eski e-posta girişleri de çalışmaya devam eder.
 */
(() => {
  'use strict';
  const ACCOUNT_EMAIL = 'beta@accounts.betaplaystation.github.io';
  const aliasToEmail = (value) => String(value || '').trim().toLocaleUpperCase('tr-TR') === 'BETA'
    ? ACCOUNT_EMAIL : String(value || '').trim();

  function setupLogin() {
    const loginForm = document.getElementById('loginForm');
    const identity = document.getElementById('email');
    if (!loginForm || !identity) return;

    identity.type = 'text';
    identity.autocomplete = 'username';
    identity.placeholder = 'BETA veya e-posta adresiniz';
    const label = document.querySelector('label[for="email"]');
    if (label) label.textContent = 'Kullanıcı adı veya e-posta';
    // Önceki sayfanın Supabase giriş işleyicisi çalışmadan kullanıcı adını
    // Auth sistemindeki e-posta kimliğine dönüştürür.
    loginForm.addEventListener('submit', () => {
      identity.value = aliasToEmail(identity.value);
    }, { capture: true });
  }

  function setupNavigation() {
    const page = location.pathname.split('/').pop().toLowerCase();
    if (page === 'masalar.html') {
      const orders = document.getElementById('tabOrders');
      if (orders) {
        orders.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          location.href = 'admin.html#orders';
        }, {capture: true});
      }
    }
    if (page === 'admin.html') {
      const nav = document.querySelector('.sidebar');
      if (nav && !document.getElementById('v48TablesLink')) {
        const link = document.createElement('a');
        link.id = 'v48TablesLink';
        link.href = 'masalar.html';
        link.className = 'navitem';
        link.textContent = '🎮 Masalar';
        link.style.cssText = 'display:block;text-decoration:none;color:inherit;padding:12px 16px;';
        nav.prepend(link);
      }
      if (location.hash === '#orders') {
        let attempts = 0;
        const timer = setInterval(() => {
          attempts++;
          const dashboard = document.getElementById('dashboard');
          const orders = document.querySelector('[data-view="orders"]');
          if (dashboard && orders && !dashboard.classList.contains('hidden')) {
            orders.click();
            clearInterval(timer);
          }
          if (attempts >= 60) clearInterval(timer);
        }, 250);
      }
    }
  }

  function init() { setupLogin(); setupNavigation(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
