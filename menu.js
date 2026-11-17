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
function render(){
 const cats=[{id:'all',name:'Tümü',icon:'✨'},...state.categories];
 $('#tabs').innerHTML=cats.map(c=>`<button class="tab ${state.category===c.id?'active':''}" data-id="${safe(c.id)}">${safe(c.icon||'🍽️')} ${safe(c.name)}</button>`).join('');
 const filtered=state.products.filter(p=>p.available&&(state.category==='all'||p.category_id===state.category)&&(`${p.name} ${p.description||''}`).toLocaleLowerCase('tr').includes(state.query));
 $('#sectionTitle').textContent=state.category==='all'?'Tüm Ürünler':state.categories.find(c=>c.id===state.category)?.name||'Ürünler';
 $('#sectionInfo').textContent=filtered.length+' ürün';$('#count').textContent=filtered.length+' sonuç';
 $('#products').innerHTML=filtered.length?filtered.map(p=>{
 const img=p.image_url ? `<img loading="lazy" src="${safe(p.image_url)}" alt="${safe(p.name)}" onerror="this.remove()">` : safe(iconFor(p.category_id));
 return `<article class="product"><div class="product-img">${img}</div><div class="product-body"><div class="product-title">${safe(p.name)}</div><div class="product-desc">${safe(p.description||'')}</div><div class="product-bottom"><span class="price">${money(p.price)}</span><span class="pill">● Menüde</span>${new URLSearchParams(location.search).has('loca')?`<button class="add-cart" data-add-to-cart="${safe(p.id)}">+ Sepete</button>`:''}</div></div></article>`
 }).join(''):'<div class="empty">Bu kategoride gösterilecek ürün bulunamadı.</div>';
 document.querySelectorAll('.tab').forEach(el=>el.addEventListener('click',()=>{state.category=el.dataset.id;render()}));
}
async function load(){
 if(!db){state.categories=window.BETA_DEMO.categories;state.products=window.BETA_DEMO.products;$('#message').textContent='Örnek menü görüntüleniyor. Canlı menü için config.js dosyasını yapılandırın.';render();return}
 try{
  const [cats,products]=await Promise.all([db.from('categories').select('*').order('sort_order'),db.from('products').select('*').order('sort_order')]);
  if(cats.error)throw cats.error;if(products.error)throw products.error;
  state.categories=cats.data||[];state.products=products.data||[];$('#message').textContent='';render();
 }catch(err){state.categories=window.BETA_DEMO.categories;state.products=window.BETA_DEMO.products;$('#message').classList.add('error');$('#message').textContent='Canlı menü alınamadı; örnek ürünler gösteriliyor. '+err.message;render()}
}
$('#search').addEventListener('input',e=>{state.query=e.target.value.trim().toLocaleLowerCase('tr');render()});$('#year').textContent=new Date().getFullYear();load();
