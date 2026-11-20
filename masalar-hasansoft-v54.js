/* Beta Playstation V54 — Hesap Kes çift tık + boş alan sağ tık Yenile.
   IMPORTANT: Replaces V53 JavaScript (do NOT load v53 JS alongside).
   Does not create/update any Supabase records; uses existing app actions.
*/
(()=>{'use strict';
 const el=id=>document.getElementById(id);
 const menu=el('tableContextMenu');
 const cards=el('cards');
 const surface=el('tableIconsArea');
 if(!menu||!cards||!surface)return;
 const findTable=id=>state.tables.find(t=>String(t.id)===String(id));
 const live=id=>{const t=findTable(id);return t?active(t):null};

 // Existing masalar.js dblclick listener is intentionally LEFT ALONE:
 // active table => showReceipt (Hesap Kes), empty table => openSessionDialog.
 // No 'Hesap Özeti' dialog or right-click action is created here.

 // Original right-click menu remains in use for table items.
 // Add only opening shortcuts and a refresh shortcut where useful.
 const extra=document.createElement('div');
 extra.className='hs-context-extra';
 menu.prepend(extra);
 const originalShow=showTableContext;
 showTableContext=function(id,x,y){
   originalShow(id,x,y);
   const s=live(id);
   const actions=s
     ? [['refresh','⟳ Yenile'],...(s.mode==='timed'?[['adjust-time','◷ Süre Ekle / Düş']]:[]),['move','↔ Masa Değiştir']]
     : [['open-unlimited','▶ Süresiz Hesap Aç'],['open-timed','◷ Süreli Hesap Aç'],['refresh','⟳ Yenile']];
   extra.replaceChildren();
   for(const [action,label] of actions){
     const b=document.createElement('button');b.type='button';
     b.dataset.hsAction=action;b.setAttribute('role','menuitem');b.textContent=label;
     extra.append(b);
   }
   menu.dataset.hsTable=id;
   menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-12))+'px';
   menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-12))+'px';
 };
 menu.addEventListener('click',e=>{
   const b=e.target.closest('[data-hs-action]');if(!b||!menu.contains(b))return;
   e.preventDefault();e.stopImmediatePropagation();
   const action=b.dataset.hsAction,id=menu.dataset.hsTable;
   hideTableContext();
   const s=id?live(id):null;
   if(action==='refresh'){el('refresh')?.click();return;}
   if(action==='open-unlimited'||action==='open-timed'){
     if(id&&!s){
       openSessionDialog(id);
       const mode=el('mode');if(mode){mode.value=action==='open-timed'?'timed':'unlimited';mode.dispatchEvent(new Event('change',{bubbles:true}));}
     }
     return;
   }
   if(!s)return;
   if(action==='adjust-time'||action==='move'){
     openManageSession(s.id);
     el(action==='adjust-time'?'manageDelta':'manageTarget')?.focus();
   }
 },true);

 // Blank SPACE right-click (not empty *table*): show only 'Yenile'.
 const blankMenu=document.createElement('div');
 blankMenu.id='hsBlankContextMenu';
 blankMenu.className='hs-blank-context-menu';
 blankMenu.hidden=true;
 blankMenu.setAttribute('role','menu');
 const refresh=document.createElement('button');refresh.type='button';
 refresh.textContent='⟳ Yenile';refresh.setAttribute('role','menuitem');
 blankMenu.append(refresh);
 document.body.append(blankMenu);
 function hideBlank(){blankMenu.hidden=true;}
 refresh.addEventListener('click',()=>{hideBlank();el('refresh')?.click();});
 document.addEventListener('contextmenu',e=>{
   // Capture phase: prevent browser's right-click menu only on the empty plan canvas.
   if(!surface.contains(e.target))return;
   if(e.target.closest('.desk-tile,button,input,select,textarea,a,[role="button"],.table-context-menu'))return;
   // Restrict to actual unoccupied grid/canvas, not the title or toolbar.
   if(!e.target.closest('#cards') && e.target!==surface)return;
   e.preventDefault();e.stopImmediatePropagation();
   hideTableContext();
   blankMenu.hidden=false;
   blankMenu.style.left=Math.max(8,Math.min(e.clientX,innerWidth-blankMenu.offsetWidth-10))+'px';
   blankMenu.style.top=Math.max(8,Math.min(e.clientY,innerHeight-blankMenu.offsetHeight-10))+'px';
 },true);
 document.addEventListener('pointerdown',e=>{if(!blankMenu.hidden&&!blankMenu.contains(e.target))hideBlank();},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hideBlank();});
 window.addEventListener('scroll',hideBlank,true);
})();
