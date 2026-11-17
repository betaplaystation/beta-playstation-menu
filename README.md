# 🎮 Beta Playstation — Ücretsiz QR Menü

**İki sayfa:** `index.html` (müşterinin QR ile açtığı menü), `admin.html` (e-posta ve şifreyle korunan yönetim paneli).

**Özellikler:** Siyah/neon yeşili mobil tasarım, kategori filtreleme, ürün arama, görseller, fiyatlar, ürün gizleme, kategori ve ürün ekleme/düzenleme/silme, merkezi bulut veritabanı. Sipariş ve ödeme toplamaz.

## 1. Önizleme

`index.html` dosyasını tarayıcıda açın. Supabase kurulmadan önce 8 **temsili ürün ve fiyat** gösterilir. Bu veriler gerçek işletme fiyatları değildir.

## 2. Ücretsiz Supabase veritabanını kurun

1. https://supabase.com adresinde hesap açıp **New project** ile proje oluşturun. Supabase'in ücretsiz katmanını seçin (ücretsiz katmanda kullanım ve proje duraklatma sınırları olabilir).
2. Supabase panelinde **SQL Editor → New query** yoluyla `setup.sql` dosyasının tüm içeriğini çalıştırın. Bu işlem tabloları, örnek ürünleri ve erişim güvenlik kurallarını kurar.
3. **Project Settings → API Keys** bölümünden `anon / publishable` anahtarını ve **Project Settings → Data API** bölümünden proje URL'sini bulun. Panel adları zamanla değişebilir.
4. `config.js` dosyasını şöyle doldurun:

```js
window.BETA_CONFIG = {
  supabaseUrl: 'https://PROJE_KODUNUZ.supabase.co',
  supabaseAnonKey: 'SB_PUBLISHABLE_VEYA_ANON_ANAHTARINIZ',
  currency: 'TRY'
};
```

**Güvenlik:** `service_role`, `sb_secret_...` ya da veritabanı şifresini asla tarayıcı dosyalarına koymayın. `anon` / `publishable` anahtarı istemci için tasarlanmıştır; korumayı SQL'deki RLS kuralları sağlar.

## 3. Yöneticiyi oluşturun

1. Supabase → **Authentication → Users → Add user** üzerinden kendi e-posta adresiniz ve güçlü şifreniz ile bir kullanıcı oluşturun. Kullanıcının e-posta doğrulamasını tamamlayın / panelde doğrulanmış oluşturun.
2. Supabase SQL Editor'de aşağıdakini **kendi e-postanızla değiştirerek** çalıştırın:

```sql
insert into public.admin_users(user_id)
select id from auth.users where email = 'SIZIN_EPOSTANIZ@ORNEK.COM'
on conflict (user_id) do nothing;
```

3. SQL sorgusunun bir kullanıcı eklediğinden emin olun. Sonra `admin.html` sayfasında oturum açın.

> Güvenlik tavsiyesi: Supabase Authentication → Providers bölümünden genel e-posta kaydını kapalı tutun; yalnızca panelde oluşturduğunuz kullanıcıları yönetin. Sitenin ziyaretçileri **yönetici hesabı açamaz**. `admin_users` tablosuna kullanıcı ekleme hakkı tarayıcıya verilmez.

## 4. Ücretsiz yayınlama — GitHub Pages

1. https://github.com adresinden hesap açın. **New repository** ile örneğin `beta-playstation-menu` adında bir **public** depo oluşturun.
2. Bu klasördeki `index.html`, `admin.html`, `styles.css`, `menu.js`, `admin.js`, `data.js`, `config.js`, `setup.sql` (isteğe bağlı), `README.md` dosyalarını deponun kök dizinine yükleyin (`Add file → Upload files`). **Şifre veya gizli anahtar yüklemeyin.**
3. Repo → **Settings → Pages → Build and deployment → Deploy from a branch**; `main` ve `/ (root)` seçerek kaydedin.
4. Yayınlanan bağlantı şu biçimde olacaktır: `https://KULLANICI_ADINIZ.github.io/beta-playstation-menu/`. Bunun için herhangi bir ücretli alan adı gerekmez.
5. `https://KULLANICI_ADINIZ.github.io/beta-playstation-menu/admin.html` adresinden giriş yapın ve fiyatları güncelleyin. Menüde değişiklikler sayfa yeniden açıldığında / yenilendiğinde görünür; otomatik anlık güncelleme açık değildir.

**Alternatif:** Aynı klasörü Cloudflare Pages üzerinden `Direct Upload` ile de ücretsiz barındırabilirsiniz: https://pages.cloudflare.com/ . Kendi alan adınız isteğe bağlıdır ve ücretli olabilir.

## 5. Masalar için QR kod

1. Yayındaki `index.html` adresini kopyalayın (`.../beta-playstation-menu/` ana sayfa adresi de olur).
2. QR kodunu cihazınızın/tasarım uygulamanızın QR oluşturma özelliğiyle veya güvenilir ücretsiz QR servisinden oluşturun.
3. QR kodu telefon kamerasıyla test edin. Masa üstü baskıya şu metni ekleyin: **BETA PLAYSTATION — MENÜ İÇİN TARA**.
4. Menü URL'sini değiştirmediğiniz sürece fiyatları güncellediğinizde QR kodu tekrar basmanız gerekmez.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `index.html` + `menu.js` | Müşteri menüsü |
| `admin.html` + `admin.js` | Yetkili kullanıcı paneli |
| `styles.css` | Mobil/koyu tasarım |
| `config.js` | Supabase URL ve istemci API anahtarı |
| `data.js` | Kurulum öncesi yerel örnek içerik |
| `setup.sql` | Tablolar, RLS güvenliği ve örnek ürünler |

## Önemli notlar

- Müşteriler yalnızca menüyü görüntüler; sipariş gönderme ve online ödeme bulunmaz.
- Fotoğraf yükleme yerine **doğrudan HTTPS resim URL'si** kullanılır. Böylece ayrıca depolama kurulumu gerekmez.
- Örnek fiyatları yayınlamadan önce gerçek fiyatlarınızla değiştirin.
- Ücretsiz planlar sağlayıcıların koşullarına ve kullanım sınırlarına tabidir; sınırsız çalışma garantisi değildir.
- Supabase projesi bakım/pasiflik nedeniyle duraklatılırsa menü örnek ürünlere döner ve hata gösterir; `data.js` içeriği canlı veri yerine kullanılmaz.
- Canlı sistem için internet gerekir. QR kodunu yayınlanan URL'ye yönlendirin, yerel `file://` bağlantısına değil.
