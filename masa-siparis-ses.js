'use strict';
// Beta Playstation: masa yönetimi açıkken yeni müşteri QR siparişlerini sesli bildirir.
// Mevcut masalar.js, masaların hesap ve adisyon işlemleri değiştirilmez.
(() => {
  const button = document.getElementById('enableTableOrderSound');
  const notice = document.getElementById('tableOrderSoundAlert');
  if (!button || !notice || typeof db === 'undefined' || typeof state === 'undefined') return;

  let audio = null;
  let enabled = false;
  let known = null;
  let accountId = null;
  let busy = false;
  let cycle = 0;
  const oldTitle = document.title;

  function playChime() {
    if (!enabled || !audio) return;
    try {
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const start = audio.currentTime + 0.03;
      for (const [offset, frequency, duration] of [
        [0, 784, .20], [.24, 1047, .28], [.73, 784, .20], [.98, 1047, .36]
      ]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        gain.gain.setValueAtTime(.0001, start + offset);
        gain.gain.linearRampToValueAtTime(.18, start + offset + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + duration + .01);
      }
    } catch (error) { console.warn('Sipariş sesi:', error); }
  }

  button.addEventListener('click', async () => {
    if (enabled) {
      enabled = false;
      button.textContent = '🔔 Sipariş sesini aç';
      button.setAttribute('aria-pressed', 'false');
      return;
    }
    try {
      const Constructor = window.AudioContext || window.webkitAudioContext;
      if (!Constructor) throw new Error('Bu tarayıcı ses özelliğini desteklemiyor.');
      audio ||= new Constructor();
      await audio.resume();
      enabled = true;
      button.textContent = '🔊 Sipariş sesi açık';
      button.setAttribute('aria-pressed', 'true');
      playChime(); // Açıldığına dair kısa test sesi.
      await checkOrders();
    } catch (error) {
      notice.hidden = false;
      notice.textContent = 'Ses açılamadı: ' + error.message;
    }
  });

  notice.addEventListener('click', () => {
    notice.hidden = true;
    document.title = oldTitle;
  });

  async function checkOrders() {
    if (!db || busy) return;
    const userId = state.user?.id || null;
    if (!userId) {
      if (accountId !== null) {
        accountId = null;
        known = null;
        cycle++;
        notice.hidden = true;
        document.title = oldTitle;
        enabled = false;
        button.textContent = '🔔 Sipariş sesini aç';
        button.setAttribute('aria-pressed', 'false');
      }
      return;
    }
    if (accountId !== userId) {
      accountId = userId;
      known = null;
      cycle++;
    }
    const myCycle = cycle;
    busy = true;
    try {
      const { data, error } = await db.from('orders')
        .select('id,loca_code,status,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (myCycle !== cycle || !state.user) return;
      const rows = data || [];
      const current = new Set(rows.map(x => x.id));
      if (known !== null) {
        const fresh = rows.filter(x => x.status === 'new' && !known.has(x.id));
        if (fresh.length) {
          playChime();
          const names = [...new Set(fresh.map(x => {
            const code = x.loca_code || '';
            return state.tables.find(t => t.code === code)?.name || code || 'Masa';
          }))].join(', ');
          notice.textContent = `🔔 ${fresh.length} yeni QR siparişi! ${names}. Sipariş ayrıntılarını masa kartında veya Yönetici Paneli'nde görebilirsin. (Kapatmak için tıkla.)`;
          notice.hidden = false;
          document.title = `🔔 ${fresh.length} yeni sipariş | Beta Playstation`;
          // Mevcut adisyonun güncellenmesi için var olan yenileme mekanizmasını kullan.
          if (typeof reload === 'function') reload(true);
        }
      }
      known = current;
    } catch (error) {
      console.warn('Masa ekranında sipariş bildirimi alınamadı:', error);
    } finally { busy = false; }
  }

  setInterval(checkOrders, 5000);
  window.addEventListener('focus', checkOrders);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkOrders(); });
  checkOrders();
})();
