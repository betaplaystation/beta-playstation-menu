-- Beta Playstation • Supabase SQL Editor'de bir kere çalıştırın.
-- ÖNEMLİ: Daha önce aynı isimli tablolar varsa bu betiği gözden geçirin.
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '🍽️',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.admin_users enable row level security;

-- Herkes kategori ve ürünleri görüntüleyebilir.
drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories" on public.categories for select to anon, authenticated using (true);
drop policy if exists "Public read products" on public.products;
create policy "Public read products" on public.products for select to anon, authenticated using (true);

-- Yönetici tablosunu yalnızca ilgili oturum sahibi sorgulayabilir.
drop policy if exists "Admin check self" on public.admin_users;
create policy "Admin check self" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

-- Yazma yetkisi sadece public.admin_users tablosunda kayıtlı oturumlara verilir.
drop policy if exists "Admin insert categories" on public.categories;
create policy "Admin insert categories" on public.categories for insert to authenticated with check (exists(select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admin update categories" on public.categories;
create policy "Admin update categories" on public.categories for update to authenticated using (exists(select 1 from public.admin_users where user_id=(select auth.uid()))) with check (exists(select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admin delete categories" on public.categories;
create policy "Admin delete categories" on public.categories for delete to authenticated using (exists(select 1 from public.admin_users where user_id=(select auth.uid())));

drop policy if exists "Admin insert products" on public.products;
create policy "Admin insert products" on public.products for insert to authenticated with check (exists(select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admin update products" on public.products;
create policy "Admin update products" on public.products for update to authenticated using (exists(select 1 from public.admin_users where user_id=(select auth.uid()))) with check (exists(select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admin delete products" on public.products;
create policy "Admin delete products" on public.products for delete to authenticated using (exists(select 1 from public.admin_users where user_id=(select auth.uid())));

-- Örnek kategoriler (ilk kurulumda eklenir; sonrasında panelden düzenlenebilir).
insert into public.categories(name,icon,sort_order)
select s.name,s.icon,s.sort_order from (values
 ('Sıcak İçecekler','☕',1),('Soğuk İçecekler','🧊',2),('Atıştırmalıklar','🍟',3),('Tatlılar','🍰',4)
) as s(name,icon,sort_order)
where not exists(select 1 from public.categories c where c.name=s.name);

-- Örnek ürünler (gerçek fiyatlar DEĞİLDİR, panelden değiştirin).
insert into public.products(category_id,name,description,price,sort_order)
select c.id,s.name,s.description,s.price,s.sort_order
from (values
('Sıcak İçecekler','Türk Kahvesi','Geleneksel Türk kahvesi',85,1),
('Sıcak İçecekler','Latte','Espresso ve kadifemsi süt',120,2),
('Sıcak İçecekler','Çay','Taze demlenmiş çay',40,3),
('Soğuk İçecekler','Buzlu Latte','Soğuk süt ve espresso',135,1),
('Soğuk İçecekler','Limonata','Serinletici limon aroması',100,2),
('Atıştırmalıklar','Patates Kızartması','Çıtır patates, sos eşliğinde',145,1),
('Atıştırmalıklar','Tost','Kaşarlı sıcak tost',125,2),
('Tatlılar','Brownie','Yoğun çikolatalı',155,1)
) as s(category,name,description,price,sort_order)
join public.categories c on c.name=s.category
where not exists(select 1 from public.products p where p.name=s.name and p.category_id=c.id);

-- YÖNETİCİ TANIMLAMA (ayrıca, hesabı oluşturduktan SONRA çalıştırın):
-- insert into public.admin_users(user_id)
-- select id from auth.users where email = 'SIZIN_EPOSTANIZ@ORNEK.COM'
-- on conflict (user_id) do nothing;
-- Bu SQL çalıştırılmadan önce Supabase > Authentication > Users üzerinden
-- e-postası ve parolası belirlenmiş bir kullanıcı eklenmiş olmalıdır.
