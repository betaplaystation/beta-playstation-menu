# Beta Playstation — 8 Localı QR Sipariş Sistemi

Bu paket, daha önce kurduğunuz Beta Playstation menüsünün güncellemesidir. Mevcut Supabase projenizi ve yönetici hesabınızı korur.

## 1 — Supabase SQL

Supabase → SQL Editor → New Query açın. `siparis-kurulum.sql` dosyasının **tamamını** yapıştırıp Run yapın. `Success. No rows returned` görmelisiniz. **`setup.sql` dosyasını tekrar çalıştırmanız gerekmez.**

## 2 — Mevcut config.js'yi koruyun

Bu paketteki `config.js` örnek/boş bırakılmıştır. **Bilgisayarınızdaki çalışan eski `config.js` dosyasını koruyun**, yeni klasöre kopyalayın; yalnızca Supabase URL ve publishable key olmalı. `service_role`/secret key koymayın.

## 3 — GitHub'da mevcut depoyu güncelleyin

`github.com/Pherke/beta-playstation-menu` → Add file → Upload files. Bu ZIP'in içindeki **index.html, admin.html, menu.js, admin.js, cart.js, styles.css** dosyalarını (ve gerekirse diğer mevcut statik dosyaları) deponun ana dizinine yükleyin. Dosya adları aynı olanlara overwrite/replace yapın; **eski çalışan config.js'yi değiştirmeyin.** Commit changes. Pages'deki main/(root) ayarını değiştirmeyin.

## 4 — Loca QR kodları

QR görselleri `qr-kodlar/` klasöründe 8 ayrı PNG olarak bulunur. Her görseli adının yazdığı locaya koyun. İsterseniz locanın adını veritabanındaki `public.locas` tablosundaki `name` alanından değiştirebilirsiniz; müşteri sayfasında ve yönetici panelindeki `orderLabels` sabitlerini de aynı adlara uyarlayın.

1 Platinum; 4 Gold; 3 Alt Kat olarak **geçici olarak** isimlendirdik. Gerçek loca isimleri farklıysa fiziksel QR'ları dağıtmadan önce eşleştirin.

## 5 — Test

Locadaki QR kodu okutun → sepete örnek ürün ekleyin → Siparişi gönder → Yönetici → Siparişler. Yönetici panelinde sipariş durumu değiştirilebilir. Ödeme online alınmaz, personelde yapılır.

### Güvenlik notu

Sipariş fiyatları tarayıcıdan değil Supabase RPC'de güncel ürün fiyatlarından hesaplanır; siparişler yalnızca yönetici hesabına görünür. Ancak **QR masa kimliği tek başına müşterinin gerçekten o locada olduğunu doğrulamaz.** Kodun paylaşılması, şaka siparişleri ve yoğun kullanım için ek önlemler (personel onayı, rate limiting, CAPTCHA ve oturum doğrulaması) gerekebilir. Mevcut sınır: bir loca için 15 saniyede en fazla bir sipariş, en fazla 15 ürün çeşidi, ürün başına en fazla 10 adet, toplam 10.000 TL. Bu pilot kullanım içindir.

### Sorun giderme

- `Could not find function place_order`: SQL betiği çalıştırılmadı veya Supabase şema önbelleği henüz yenilenmedi.
- `Geçersiz veya kapalı loca`: QR kodu/veritabanındaki loca kodunu kontrol edin.
- Ürünler görünmüyor: eski `config.js` değerlerini koruduğunuzdan emin olun.
- Sipariş ekranı boş: yeni `admin.js` ve `admin.html` dosyalarını yüklediğinizden emin olun ve sayfayı yenileyin.
