'use strict';
const $ = s => document.querySelector(s);
const conf = window.BETA_CONFIG || {};
const configured = !!(conf.supabaseUrl && conf.supabaseAnonKey);
const db = configured && window.supabase ? window.supabase.createClient(conf.supabaseUrl,conf.supabaseAnonKey) : null;
const state = {categories:[],products:[],category:'all',query:''};
window.betaMenuState=state;
const symbols = {'☕':'☕','🧊':'🧊','🍟':'🍟','🍰':'🍰'};
const safe = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(Number(n)||0);
const iconFor = id => state.categories.find(x=>x.id===id)?.icon || '🎮';
const outOfStock = p => p.stock_tracking_enabled === true && Number(p.stock_quantity) <= 0;
window.betaProductOutOfStock = outOfStock;
function render(){
 const cats=[{id:'all',name:'Tümü',icon:'✨'},...state.categories];
 $('#tabs').innerHTML=cats.map(c=>`<button class="tab ${state.category===c.id?'active':''}" data-id="${safe(c.id)}">${safe(c.icon||'🍽️')} ${safe(c.name)}</button>`).join('');
 const filtered=state.products.filter(p=>p.available&&(state.category==='all'||p.category_id===state.category)&&(`${p.name} ${p.description||''}`).toLocaleLowerCase('tr').includes(state.query));
 $('#sectionTitle').textContent=state.category==='all'?'Tüm Ürünler':state.categories.find(c=>c.id===state.category)?.name||'Ürünler';
 $('#sectionInfo').textContent=filtered.length+' ürün';$('#count').textContent=filtered.length+' sonuç';
 $('#products').innerHTML=filtered.length?filtered.map(p=>{
 const img=p.image_url ? `<img loading="lazy" src="${safe(p.image_url)}" alt="${safe(p.name)}" onerror="this.remove()">` : safe(iconFor(p.category_id));
 const sold=outOfStock(p);
 const badge=sold?'<span class="pill" style="background:#4b2025;color:#ffb9b9;border:1px solid #b64c54;font-weight:700">⛔ STOKTA YOK</span>':'<span class="pill">● Menüde</span>';
 const loca=new URLSearchParams(location.search).get('loca');
 const action=loca && loca!=='kasa'?(sold?'<button class="add-cart" disabled style="opacity:.48;cursor:not-allowed" aria-label="Ürün stokta yok">Tükendi</button>':`<button class="add-cart" data-add-to-cart="${safe(p.id)}">+ Sepete</button>`):'';
 return `<article class="product" ${sold?'style="opacity:.68"':''}><div class="product-img">${img}</div><div class="product-body"><div class="product-title">${safe(p.name)}</div><div class="product-desc">${safe(p.description||'')}</div><div class="product-bottom"><span class="price">${money(p.price)}</span>${badge}${action}</div></div></article>`;
 }).join(''):'<div class="empty">Bu kategoride gösterilecek ürün bulunamadı.</div>';
 document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>{state.category=el.dataset.id;render()}));
}
async function load(){
 if(!db){state.categories=window.BETA_DEMO.categories;state.products=window.BETA_DEMO.products;$('#message').textContent='Örnek menü görüntüleniyor. Canlı menü için config.js dosyasını yapılandırın.';render();return}
 try{
  const [cats,products]=await Promise.all([db.from('categories').select('*').order('sort_order'),db.from('products').select('*').order('sort_order')]);
  if(cats.error)throw cats.error;if(products.error)throw products.error;
  state.categories=cats.data||[];state.products=products.data||[];$('#message').textContent='';render();
 }catch(err){$('#message').classList.add('error');$('#message').textContent='Canlı menü alınamadı. Stok bilgisi doğrulanamadı: '+err.message;state.products=[];render()}
}
let stockRefreshBusy=false;
async function refreshStock(){
 if(!db||stockRefreshBusy||document.hidden)return;
 stockRefreshBusy=true;
 try{
  const {data,error}=await db.from('products').select('id,stock_quantity,stock_tracking_enabled,available');
  if(error)throw error;
  const current=new Map((data||[]).map(p=>[p.id,p]));
  let changed=false;
  for(const p of state.products){const newP=current.get(p.id);if(!newP)continue;
   if(p.stock_quantity!==newP.stock_quantity||p.stock_tracking_enabled!==newP.stock_tracking_enabled||p.available!==newP.available){Object.assign(p,newP);changed=true;}
  }
  if(changed){render();window.dispatchEvent(new Event('beta-stock-updated'))}
 }catch(err){console.warn('Stok yenileme başarısız:',err)}finally{stockRefreshBusy=false}
}
window.betaRefreshStock=refreshStock;
$('#search').addEventListener('input',e=>{state.query=e.target.value.trim().toLocaleLowerCase('tr');render()});$('#year').textContent=new Date().getFullYear();load();
setInterval(refreshStock,15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshStock()});
window.addEventListener('focus',refreshStock);
