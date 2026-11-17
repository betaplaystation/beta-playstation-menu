'use strict';
const $=s=>document.querySelector(s),conf=window.BETA_CONFIG||{},configured=!!(conf.supabaseUrl&&conf.supabaseAnonKey);
const db=configured&&window.supabase?window.supabase.createClient(conf.supabaseUrl,conf.supabaseAnonKey):null;
const store={categories:[],products:[]};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
const message=(text,isError=false,sel='#globalMsg')=>{const el=$(sel);el.textContent=text;el.classList.toggle('error',isError)};
const btnBusy=(form,busy)=>{form.querySelector('button[type="submit"]').disabled=busy};
function showDashboard(email){$('#loginPanel').classList.add('hidden');$('#dashboard').classList.remove('hidden');$('#accountLabel').textContent='Giriş yapan: '+email}
function showLogin(){ $('#dashboard').classList.add('hidden');$('#loginPanel').classList.remove('hidden') }
async function authorized(user){if(!user)return false;const {data,error}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;return !!data}
async function init(){if(!db){$('#setupAlert').classList.remove('hidden');$('#loginForm').querySelector('button').disabled=true;return}try{const {data:{user}}=await db.auth.getUser();if(user){if(await authorized(user)){showDashboard(user.email);await reload()}else{await db.auth.signOut();message('Bu hesaba yönetici yetkisi verilmemiş. README.md dosyasındaki SQL adımını tamamlayın.',true,'#loginMsg')}}}catch(e){message(e.message,true,'#loginMsg')}}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!db)return;const form=e.currentTarget;btnBusy(form,true);message('Giriş kontrol ediliyor...',false,'#loginMsg');try{const {data,error}=await db.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(error)throw error;if(!(await authorized(data.user))){await db.auth.signOut();throw new Error('Bu kullanıcı yönetici olarak tanımlı değil.')}showDashboard(data.user.email);message('',false,'#loginMsg');await reload()}catch(err){message(err.message,true,'#loginMsg')}finally{btnBusy(form,false)}});
$('#signout').addEventListener('click',async()=>{await db.auth.signOut();showLogin();$('#password').value=''});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));['orders','products','categories','info'].forEach(v=>$('#'+v+'View').classList.toggle('hidden',v!==b.dataset.view));if(b.dataset.view==='orders')loadOrders();$('#pageTitle').textContent=({orders:'Gelen siparişler',products:'Ürün yönetimi',categories:'Kategori yönetimi',info:'Menü bilgileri'})[b.dataset.view]}));
async function reload(){try{const [c,p]=await Promise.all([db.from('categories').select('*').order('sort_order'),db.from('products').select('*').order('sort_order')]);if(c.error)throw c.error;if(p.error)throw p.error;store.categories=c.data;store.products=p.data;render();message('')}catch(e){message('Veri alınamadı: '+e.message,true)}}
function render(){
 const cur=$('#productCategory').value;
 $('#productCategory').innerHTML='<option value="">Kategori seçin</option>'+store.categories.map(c=>`<option value="${safe(c.id)}">${safe(c.icon||'')} ${safe(c.name)}</option>`).join('');if(store.categories.some(c=>c.id===cur))$('#productCategory').value=cur;
 $('#productsList').innerHTML=store.products.length?store.products.map(p=>`<div class="listrow"><div class="mini-img">${p.image_url?`<img src="${safe(p.image_url)}" alt="" onerror="this.remove()">`:'🎮'}</div><div class="grow"><div class="list-title">${safe(p.name)} <span class="muted">${p.available?'':'• Gizli'}</span></div><div class="list-sub">${safe(store.categories.find(c=>c.id===p.category_id)?.name||'Kategorisiz')} · ${money(p.price)}</div></div><div class="actions"><button class="btn secondary" data-edit-product="${safe(p.id)}">Düzenle</button><button class="btn danger" data-delete-product="${safe(p.id)}">Sil</button></div></div>`).join(''):'<p class="muted">Henüz ürün yok.</p>';
 $('#categoriesList').innerHTML=store.categories.length?store.categories.map(c=>`<div class="listrow"><div class="mini-img">${safe(c.icon||'🗂️')}</div><div class="grow"><div class="list-title">${safe(c.name)}</div><div class="list-sub">Sıra: ${Number(c.sort_order)||0}</div></div><div class="actions"><button class="btn secondary" data-edit-category="${safe(c.id)}">Düzenle</button><button class="btn danger" data-delete-category="${safe(c.id)}">Sil</button></div></div>`).join(''):'<p class="muted">Henüz kategori yok.</p>';
 document.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));document.querySelectorAll('[data-delete-product]').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.deleteProduct));
 document.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=()=>editCategory(b.dataset.editCategory));document.querySelectorAll('[data-delete-category]').forEach(b=>b.onclick=()=>deleteCategory(b.dataset.deleteCategory));
}
function resetProduct(){$('#productForm').reset();$('#productId').value='';$('#productFormTitle').textContent='Yeni ürün ekle';$('#productOrder').value='0';$('#productAvailable').checked=true}
function editProduct(id){const p=store.products.find(x=>x.id===id);if(!p)return;$('#productId').value=p.id;$('#productName').value=p.name;$('#productPrice').value=p.price;$('#productCategory').value=p.category_id;$('#productOrder').value=p.sort_order;$('#productDescription').value=p.description||'';$('#productImage').value=p.image_url||'';$('#productAvailable').checked=p.available;$('#productFormTitle').textContent='Ürün düzenle';window.scrollTo({top:0,behavior:'smooth'})}
$('#clearProduct').onclick=resetProduct;
$('#productForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;btnBusy(form,true);try{const raw=$('#productImage').value.trim();if(raw&&!/^https:\/\//i.test(raw))throw new Error('Fotoğraf bağlantısı HTTPS ile başlamalı.');const payload={name:$('#productName').value.trim(),price:Number($('#productPrice').value),category_id:$('#productCategory').value,sort_order:Number($('#productOrder').value)||0,description:$('#productDescription').value.trim(),image_url:raw||null,available:$('#productAvailable').checked};if(!payload.name||!payload.category_id||!Number.isFinite(payload.price)||payload.price<0)throw new Error('Gerekli alanları kontrol edin.');let query=$('#productId').value?db.from('products').update(payload).eq('id',$('#productId').value):db.from('products').insert(payload);const {error}=await query;if(error)throw error;resetProduct();await reload();message('Ürün kaydedildi.')}catch(err){message(err.message,true)}finally{btnBusy(form,false)}});
async function deleteProduct(id){const p=store.products.find(x=>x.id===id);if(!p||!confirm('"'+p.name+'" silinsin mi?'))return;const {error}=await db.from('products').delete().eq('id',id);if(error)message(error.message,true);else{await reload();message('Ürün silindi.')}}
function resetCategory(){$('#categoryForm').reset();$('#categoryId').value='';$('#categoryOrder').value='0';$('#categoryFormTitle').textContent='Yeni kategori ekle'}
function editCategory(id){const c=store.categories.find(x=>x.id===id);if(!c)return;$('#categoryId').value=c.id;$('#categoryName').value=c.name;$('#categoryIcon').value=c.icon||'';$('#categoryOrder').value=c.sort_order;$('#categoryFormTitle').textContent='Kategori düzenle';window.scrollTo({top:0,behavior:'smooth'})}
$('#clearCategory').onclick=resetCategory;
$('#categoryForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;btnBusy(form,true);try{const payload={name:$('#categoryName').value.trim(),icon:$('#categoryIcon').value.trim()||'🍽️',sort_order:Number($('#categoryOrder').value)||0};if(!payload.name)throw new Error('Kategori adı gerekli.');const query=$('#categoryId').value?db.from('categories').update(payload).eq('id',$('#categoryId').value):db.from('categories').insert(payload);const {error}=await query;if(error)throw error;resetCategory();await reload();message('Kategori kaydedildi.')}catch(err){message(err.message,true)}finally{btnBusy(form,false)}});
async function deleteCategory(id){const c=store.categories.find(x=>x.id===id);if(!c||!confirm('"'+c.name+'" silinsin mi? İçindeki ürünler varsa silme işlemi engellenir.'))return;const {error}=await db.from('categories').delete().eq('id',id);if(error)message('Kategori silinemedi: Önce bu kategorideki ürünleri taşıyın veya silin. '+error.message,true);else{await reload();message('Kategori silindi.')}}
$('#menuUrl').textContent=new URL('index.html',location.href).href;$('#copyLink').onclick=async()=>{const url=new URL('index.html',location.href).href;try{await navigator.clipboard.writeText(url);message('Menü linki kopyalandı.')}catch(e){message('Link: '+url)}};
init();

const orderLabels={'platinum':'Platinum Loca','gold-1':'Gold 1','gold-2':'Gold 2','gold-3':'Gold 3','gold-4':'Gold 4','alt-1':'Alt Kat 1','alt-2':'Alt Kat 2','alt-3':'Alt Kat 3'};
const statusLabels={new:'Yeni',preparing:'Hazırlanıyor',delivered:'Teslim edildi',cancelled:'İptal'};
async function loadOrders(){
 if(!db||$('#ordersView').classList.contains('hidden')||$('#dashboard').classList.contains('hidden'))return;
 const el=$('#ordersList');
 const {data,error}=await db.from('orders').select('id,loca_code,status,total,note,created_at,order_items(product_name,qty,unit_price)').order('created_at',{ascending:false}).limit(100);
 if(error){el.textContent='Siparişler alınamadı: '+error.message+' (siparis-kurulum.sql çalıştırıldı mı?)';return}
 el.replaceChildren();
 if(!data.length){el.textContent='Henüz sipariş yok.';return}
 for(const o of data){
  const card=document.createElement('article');card.className='order-card';
  const title=document.createElement('h3');title.textContent=(orderLabels[o.loca_code]||o.loca_code)+' · '+money(o.total);card.append(title);
  const when=document.createElement('p');when.className='muted';when.textContent=new Date(o.created_at).toLocaleString('tr-TR')+' · #'+o.id.slice(0,8).toUpperCase();card.append(when);
  for(const item of o.order_items||[]){const d=document.createElement('p');d.textContent=item.qty+' × '+item.product_name;card.append(d)}
  if(o.note){const d=document.createElement('p');d.textContent='Not: '+o.note;card.append(d)}
  const sel=document.createElement('select');sel.setAttribute('aria-label','Sipariş durumu');
  for(const [key,label] of Object.entries(statusLabels)){const opt=document.createElement('option');opt.value=key;opt.textContent=label;sel.append(opt)}sel.value=o.status;
  sel.onchange=async()=>{sel.disabled=true;const {error}=await db.from('orders').update({status:sel.value}).eq('id',o.id);if(error)message(error.message,true);sel.disabled=false;await loadOrders()};
  card.append(sel);el.append(card);
 }
}
$('#refreshOrders').addEventListener('click',loadOrders);
setInterval(loadOrders,10000);
