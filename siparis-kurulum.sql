-- Beta Playstation: mevcut setup.sql üzerine EKLENECEK sipariş sistemi.
-- Supabase SQL Editor'de TAMAMINI bir kez çalıştırın.
create extension if not exists pgcrypto;
create table if not exists public.locas (
 code text primary key check (code ~ '^[a-z0-9-]{2,40}$'),
 name text not null check (length(name) between 1 and 60),
 active boolean not null default true,
 sort_order integer not null default 0
);
insert into public.locas(code,name,sort_order) values
 ('platinum','Platinum Loca',1),('gold-1','Gold 1',2),('gold-2','Gold 2',3),
 ('gold-3','Gold 3',4),('gold-4','Gold 4',5),('alt-1','Alt Kat 1',6),
 ('alt-2','Alt Kat 2',7),('alt-3','Alt Kat 3',8)
on conflict (code) do nothing;
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 loca_code text not null references public.locas(code),
 status text not null default 'new' check(status in ('new','preparing','delivered','cancelled')),
 total numeric(10,2) not null check(total >= 0),
 note text not null default '' check(length(note)<=200),
 created_at timestamptz not null default now()
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null,
 product_name text not null,
 unit_price numeric(10,2) not null,
 qty integer not null check(qty between 1 and 10)
);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
alter table public.locas enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
-- Yalnızca yöneticiler loca ve sipariş kayıtlarını okuyabilir/değiştirebilir.
drop policy if exists "Admin read locas" on public.locas;
create policy "Admin read locas" on public.locas for select to authenticated using
 (exists(select 1 from public.admin_users a where a.user_id = (select auth.uid())));
drop policy if exists "Admin edit locas" on public.locas;
create policy "Admin edit locas" on public.locas for update to authenticated using
 (exists(select 1 from public.admin_users a where a.user_id = (select auth.uid()))) with check
 (exists(select 1 from public.admin_users a where a.user_id = (select auth.uid())));
drop policy if exists "Admin read orders" on public.orders;
create policy "Admin read orders" on public.orders for select to authenticated using
 (exists(select 1 from public.admin_users a where a.user_id = (select auth.uid())));
drop policy if exists "Admin update orders" on public.orders;
create policy "Admin update orders" on public.orders for update to authenticated using
 (exists(select 1 from public.admin_users a where a.user_id = (select auth.uid()))) with check
 (exists(select 1 from public.admin_users a where a.user_id = (select auth.uid())));
drop policy if exists "Admin read order items" on public.order_items;
create policy "Admin read order items" on public.order_items for select to authenticated using
 (exists(select 1 from public.admin_users a where a.user_id = (select auth.uid())));
-- Anonim müşteri yalnızca kontrollü RPC ile sipariş verebilir; fiyat sunucuda hesaplanır.
create or replace function public.place_order(p_loca text, p_items jsonb, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
 v_id uuid; v_total numeric(10,2) := 0; v_item jsonb; v_product record;
 v_qty integer; v_count integer; v_code text := trim(p_loca);
begin
 if not exists(select 1 from public.locas where code=v_code and active) then
   raise exception 'Geçersiz veya kapalı loca';
 end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' then
   raise exception 'Ürün listesi geçersiz';
 end if;
 v_count := jsonb_array_length(p_items);
 if v_count < 1 or v_count > 15 then raise exception 'Sepette 1-15 farklı ürün olmalı'; end if;
 if length(coalesce(p_note,''))>200 then raise exception 'Not çok uzun'; end if;
 -- Tek bir locadan saniyeler içinde tekrar tekrar sipariş gönderilmesini sınırlar.
 perform pg_advisory_xact_lock(hashtext(v_code));
 if exists(select 1 from public.orders where loca_code=v_code and created_at>now()-interval '15 seconds') then
   raise exception 'Aynı locadan yeni sipariş için kısa süre bekleyin';
 end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(v_item)<>'object' or coalesce(v_item->>'qty','') !~ '^[0-9]{1,2}$'
      or coalesce(v_item->>'id','') !~ '^[a-fA-F0-9-]{36}$' then
     raise exception 'Geçersiz ürün';
   end if;
   v_qty := (v_item->>'qty')::integer;
   if v_qty < 1 or v_qty > 10 then raise exception 'Ürün miktarı 1-10 olmalı'; end if;
   select id,name,price into v_product from public.products
     where id=(v_item->>'id')::uuid and available=true;
   if not found then raise exception 'Ürün artık satışta değil'; end if;
   v_total:=v_total+v_product.price*v_qty;
 end loop;
 if v_total>10000 then raise exception 'Sipariş tutarı limiti aşıldı'; end if;
 insert into public.orders(loca_code,total,note) values (v_code,v_total,coalesce(p_note,'')) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_qty:=(v_item->>'qty')::integer;
   select id,name,price into v_product from public.products where id=(v_item->>'id')::uuid and available=true;
   insert into public.order_items(order_id,product_id,product_name,unit_price,qty)
    values(v_id,v_product.id,v_product.name,v_product.price,v_qty);
 end loop;
 return v_id;
end; $$;
revoke all on function public.place_order(text,jsonb,text) from public;
grant execute on function public.place_order(text,jsonb,text) to anon,authenticated;
