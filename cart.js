'use strict';
(() => {
 const $ = s => document.querySelector(s);
 const code = new URLSearchParams(location.search).get('loca');
 const labels = {'platinum':'Platinum Loca','gold-1':'Gold 1','gold-2':'Gold 2','gold-3':'Gold 3','gold-4':'Gold 4','alt-1':'Alt Kat 1','alt-2':'Alt Kat 2','alt-3':'Alt Kat 3','kasa':'Kasa'};
 const cart = new Map();
 const money = n => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n);
 const name = labels[code];
 if (!name) {
  $('#orderNotice').classList.remove('hidden');
  $('#orderNotice').textContent = 'Sipariş verebilmek için locanızdaki QR kodu okutun. Bu sayfadan menüyü inceleyebilirsiniz.';
  return;
 }
 $('#locaBanner').classList.remove('hidden');
 $('#locaBanner').textContent = '📍 Sipariş locası: ' + name;
 if (!window.BETA_CONFIG?.supabaseUrl || !window.BETA_CONFIG?.supabaseAnonKey || !window.supabase) return;
 const db = window.supabase.createClient(window.BETA_CONFIG.supabaseUrl,window.BETA_CONFIG.supabaseAnonKey);
 const productsEl = $('#products');
 const productFor=id=>window.betaMenuState?.products.find(p=>p.id===id && p.available);
 const maxAllowed=p=>p.stock_tracking_enabled===true ? Math.max(0,Math.min(10,Number(p.stock_quantity)||0)) : 10;
 function renderCart() {
  const lines=[...cart.values()];
  $('#cartPanel').classList.toggle('hidden',!lines.length);
  $('#cartItems').replaceChildren();
  for(const line of lines){
   const p=productFor(line.id),limit=p?maxAllowed(p):0;
   const div=document.createElement('div');div.className='cart-line';
   const info=document.createElement('div');info.className='grow';info.textContent=line.name+' · '+money(line.price)+(limit===0?' · ⛔ Stokta yok':line.qty>limit?' · ⚠️ Stok yetersiz':'');
   const ctr=document.createElement('div');ctr.className='qty-controls';
   const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label',line.name+' azalt');minus.onclick=()=>change(line.id,-1);
   const qty=document.createElement('strong');qty.textContent=line.qty;
   const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label',line.name+' artır');plus.disabled=line.qty>=limit;plus.onclick=()=>change(line.id,1);
   ctr.append(minus,qty,plus);div.append(info,ctr);$('#cartItems').append(div);
  }
  $('#cartTotal').textContent='Toplam: '+money(lines.reduce((a,p)=>a+p.price*p.qty,0));
  const valid=lines.every(line=>{const p=productFor(line.id);return !!p&&line.qty<=maxAllowed(p)});
  $('#sendOrder').disabled=!valid;
  $('#orderMsg').classList.toggle('error',!valid);
  if(!valid)$('#orderMsg').textContent='Sepette stokta olmayan veya miktarı yetersiz ürün var. Lütfen miktarı azaltın.';
  else if($('#orderMsg').textContent.startsWith('Sepette stokta'))$('#orderMsg').textContent='';
 }
 function change(id,amount){const line=cart.get(id);if(!line)return;const p=productFor(id);if(amount>0&&(!p||line.qty>=maxAllowed(p)))return;line.qty=Math.min(10,line.qty+amount);if(line.qty<=0)cart.delete(id);renderCart()}
 productsEl.addEventListener('click', e=>{
  const btn=e.target.closest('[data-add-to-cart]');if(!btn)return;
  const id=btn.dataset.addToCart;
  const p=productFor(id);
  if(!p)return;
  if(maxAllowed(p)<1){alert('Bu ürün stokta yok.');return}
  if(!cart.has(id) && cart.size>=15){alert('En fazla 15 farklı ürün ekleyebilirsiniz.');return}
  if(cart.has(id))change(id,1);else {cart.set(id,{id,name:p.name,price:Number(p.price),qty:1});renderCart()}
  $('#cartPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 window.addEventListener('beta-stock-updated',renderCart);
 $('#sendOrder').addEventListener('click',async()=>{
  const btn=$('#sendOrder'),msg=$('#orderMsg');
  if(!cart.size)return;
  btn.disabled=true;msg.classList.remove('error');msg.textContent='Sipariş gönderiliyor...';
  try {
   if(window.betaRefreshStock)await window.betaRefreshStock();
   for(const line of cart.values()){const p=productFor(line.id);if(!p||line.qty>maxAllowed(p))throw new Error(line.name+' için yeterli stok yok. Sepeti güncelleyin.');}
   const {data,error}=await db.rpc('place_order',{p_loca:code,p_items:[...cart.values()].map(p=>({id:p.id,qty:p.qty})),p_note:$('#orderNote').value.trim()});
   if(error)throw error;
   cart.clear();$('#orderNote').value='';renderCart();
   $('#orderNotice').classList.remove('hidden');$('#orderNotice').textContent='✅ Siparişiniz alındı! '+name+' · Sipariş no: '+String(data).slice(0,8).toUpperCase()+' · Ödeme personelde.';
   $('#orderNotice').scrollIntoView({behavior:'smooth'});
   msg.textContent='';
   if(window.betaRefreshStock)window.betaRefreshStock();
  }catch(err){msg.classList.add('error');msg.textContent='Sipariş gönderilemedi: '+err.message}
  finally{btn.disabled=false;renderCart()}
 });
})();
