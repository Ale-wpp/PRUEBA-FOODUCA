/* ============ FoodUCA · app.js ============ */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

/* ---- 1. PRODUCTOS Y PEDIDOS (EMPIEZAN VACÍOS HASTA QUE ALGUIEN LOS INGRESE AL SISTEMA) ---- */
let hasRegisteredSeller = false;
let changingExistingPlan = false;
const myProducts = [];
const products = [];

let orders = [], sellerOrder = null;
const buyers = [];
const favs = new Set();
const reportBuyer = ['El usuario no envía comprobante de pago.','El usuario no se presentó al lugar acordado.','El usuario se niega a realizar el pago completo.','El usuario incumplió las condiciones del pedido.','Posible fraude o actividad sospechosa.','Otro..'];
const reportSeller = ['El emprendimiento no contesta las solicitudes de pedido.','El emprendimiento no realizó la entrega acordada.','El emprendimiento no muestra detalles de sus productos.','El emprendimiento no ofrece alimentos de calidad.','El emprendimiento cobró más de lo acordado.','El emprendimiento tiene fotos falsas acerca de los productos.','Otro..'];

/* Opciones rápidas: etiqueta visible -> mensaje real que se envía en el chat */
/* Un mensaje rápido solo se puede usar cuando tiene sentido en el flujo del pedido:
   1) El comprador pide  2) El emprendedor ACEPTA o RECHAZA  3) Recién ahí se coordina la entrega y el pago */
const accepted = o => !!o.accepted && !o.rejected;
const isTransfer = o => String(o.payMethod||'').toLowerCase().startsWith('transf');
const HINT_WAIT = 'Disponible cuando el emprendedor acepte el pedido';
const quickBuyer = [
  { label: 'Muchas gracias.', text: 'Muchas gracias.', when: accepted, hint: HINT_WAIT },
  { label: 'Ya estoy en el lugar acordado.', text: 'Ya estoy en el lugar acordado.', when: accepted, hint: HINT_WAIT },
  { label: 'Voy unos minutos tarde.', text: 'Voy unos minutos tarde.', when: accepted, hint: HINT_WAIT },
  { label: 'Perfecto.', text: 'Perfecto.', when: accepted, hint: HINT_WAIT },
  { label: 'Bueno.', text: 'Bueno.', when: accepted, hint: HINT_WAIT }
];

const getQuickSeller = () => {
  const u = JSON.parse(LS.fu || '{}');
  const acc = u.acc || '1234567890 CA';
  const pending = o => !o.accepted && !o.rejected;
  const HINT_FIRST = 'Primero acepta o rechaza el pedido';
  return [
    { label: 'Aceptar pedido.', text: o => `Con gusto, la entrega se realizará a las ${o.time}, en la peatonal.\nSe agregan $0.30 de tarifa.`, when: pending, hint: 'Ya respondiste este pedido' },
    { label: 'Rechazar pedido.', text: 'Lo siento, en este momento no puedo aceptar el pedido.', when: pending, hint: 'Ya respondiste este pedido' },
    { label: 'Enviar número de cuenta', text: `Mi número de cuenta para transferencia es: ${acc}`, when: o => accepted(o) && isTransfer(o), hint: 'Solo si el comprador paga con transferencia (y ya aceptaste)' },
    { label: 'Enviame el comprobante de pago.', text: 'Por favor, envíame el comprobante de pago por este medio.', when: o => accepted(o) && isTransfer(o), hint: 'Solo si el comprador paga con transferencia (y ya aceptaste)' },
    { label: 'Ya estoy en el lugar acordado.', text: 'Ya estoy en el lugar acordado.', when: accepted, hint: HINT_FIRST },
    { label: 'Voy unos minutos tarde.', text: 'Voy unos minutos tarde.', when: accepted, hint: HINT_FIRST },
    { label: 'Muchas gracias.', text: 'Muchas gracias.', when: accepted, hint: HINT_FIRST },
    { label: 'Perfecto.', text: 'Perfecto.', when: accepted, hint: HINT_FIRST }
  ];
};

/* ---- 2. ESTADO ---- */
/* Cada rol tiene su propia cuenta guardada: así la foto y los datos del comprador NO se mezclan con los del emprendedor */
const LS={get fu(){return localStorage[role==='s'?'fuS':'fuB']},set fu(v){localStorage[role==='s'?'fuS':'fuB']=v}};
let role='b', stack=[], cur=null, qty=2, pickedTime=null, plan={name:'Estándar',price:15};
let filt={cat:'todos',text:'',max:null,cats:[]}, chatOrder=null, editing=null, editCat='comida';

/* Solo hay productos visibles cuando alguien los ha ingresado en el sistema */
const all = () => hasRegisteredSeller ? [...myProducts, ...products] : [];
const catalog = () => hasRegisteredSeller ? all().filter(p => Boolean(p.img && p.img.trim()) && p.on !== false) : [];
const money = n => '$' + Number(n).toFixed(2);
const pimg = p => p && p.img
  ? `<div class="ph" style="background-image:url('${p.img}')"></div>`
  : `<div class="ph ph-empty"><span>Sin foto</span></div>`;

function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}

function syncAvatars(){
  const u=JSON.parse(LS.fu||'{}');
  $$('.avatar:not(#pf-avatar)').forEach(a=>{
    a.style.backgroundImage=u.photo?`url('${u.photo}')`:'';
  });
}

/* ---- 3. NAVEGACIÓN ---- */
function go(id,push=true){
  $$('.screen').forEach(s=>s.classList.remove('show'));
  const s=$('#'+id); s.classList.add('show'); window.scrollTo(0,0);
  if(push && stack[stack.length-1]!==id) stack.push(id);
  cur=id;
  let n=s.dataset.nav; if(n==='auto') n=role;
  $('#nav-b').hidden = n!=='b'; $('#nav-s').hidden = n!=='s';
  $$('.nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===id));
  syncAvatars();
  (render[id]||(()=>{}))();
}
const back=()=>{stack.pop();go(stack.pop()||(role==='b'?'home':'s-products'))};
const home=()=>{stack=[];go(role==='b'?'home':'s-products')};
function setRole(r){role=r;document.body.classList.toggle('seller',r==='s')}

/* ---- 4. RENDER ---- */
const render = {
 home(){
  const items = catalog();
  const l = items.filter(p=>(filt.cat==='todos'||p.cat===filt.cat)&&p.name.toLowerCase().includes(filt.text)&&(!filt.max||p.price<=filt.max));
  $('#grid').innerHTML = l.map(p=>`<div class="pc"><button data-open="${p.id}" style="all:unset;display:block;cursor:pointer;width:100%">${pimg(p)}</button>
   <div class="in"><b>${p.name}</b><span>👤</span><b>${money(p.price)}</b><button data-fav="${p.id}" aria-label="Favorito">${favs.has(p.id)?'💙':'♡'}</button></div></div>`).join('')
   || (items.length
      ? '<p class="light" style="grid-column:1/-1">No hay resultados con ese filtro.</p>'
      : '<div class="card cream center-t" style="grid-column:1/-1"><p><b>Todavía no hay productos registrados en el sistema.</b></p><p class="light" style="margin-top:6px">Los productos aparecerán aquí cuando un emprendedor los agregue.</p></div>');
  $$('#chips .chip').forEach(c=>c.classList.toggle('on',c.dataset.cat===filt.cat));
 },
 results(){
  const l=catalog().filter(p=>(!filt.cats.length||filt.cats.includes(p.cat))&&(!filt.max||p.price<=filt.max));
  $('#r-count').value=l.length+' opciones encontradas';
  $('#r-list').innerHTML=l.map(p=>`<div class="li res" data-open="${p.id}" role="button" tabindex="0">${pimg(p)}<div class="in"><button class="rh" data-fav="${p.id}" aria-label="Favorito">${favs.has(p.id)?'💙':'♡'}</button><b>${p.name}</b><b>${money(p.price)}</b><span class="lb">${esc(p.seller)} 👤</span></div></div>`).join('')||'<p class="light">No hay productos disponibles todavía.</p>';
 },
 product(){
  const p=cur_p();
  if(!p) return go('home');
  $('#p-img').outerHTML=`<div id="p-img" class="ph big" style="${p.img?`background-image:url('${p.img}')`:'background:#FFE9A8'}">${p.img?'':'Sin foto'}</div>`;
  $('#p-name').textContent=p.name;$('#p-desc').textContent=p.desc;$('#p-price').textContent=money(p.price);
  $('#p-place').textContent=p.place;$('#p-pay').textContent='Acepta: '+(p.pay||'Efectivo');$('#p-seller').textContent=p.seller;$('#q-n').textContent=qty;
  $('#p-fav').textContent=favs.has(p.id)?'💙':'♡';
 },
 favs(){
  const saved=[...favs].map(id=>catalog().find(p=>p.id===id)).filter(Boolean);
  $('#fav-empty').hidden = saved.length > 0;
  $('#fav-list').innerHTML=saved.map(p=>`<div class="li">${pimg(p)}<div class="in"><span class="tagp">${p.name}</span><span class="tagp">${p.seller}</span><span class="tagp">${money(p.price)}</span>
   <small>Lo guardaste hace poco.</small><button data-fav="${p.id}" aria-label="Quitar" style="align-self:flex-end;font-size:1.8rem">💛</button></div></div>`).join('');
 },
 orders(){
  $('#o-empty').hidden=orders.length>0;
  $('#o-list').innerHTML=orders.map((o,i)=>{const p=all().find(x=>x.id===o.pid)||{name:'Pedido',seller:'FoodUCA',img:''};return `<div class="li" data-chat="${i}" role="button" tabindex="0">${pimg(p)}<div class="in"><b>${p.name} - ${p.seller}</b><div class="ostat">${['En camino','Entregado','Cancelado'].map(s=>`<span class="${o.status===s?'on':''}">${s}</span>`).join('')}</div></div></div>`}).join('');
 },
 chat(){
  const o=ensureOrder();
  const p=all().find(x=>x.id===o.pid)||{name:'Producto',seller:'Emprendimiento',img:''};
  $('#c-title').textContent=o.buyer||(p.name+' - '+p.seller);
  if(!Array.isArray(o.msgs) || !o.msgs.length){
    o.msgs=[{me:1,img:p.img?p:null,t:`Solicito ${o.qty>1?o.qty+' unidades de':'una'} ${p.name}, para las ${o.time}, pagaré con ${p.pay==='Transferencia'?'transferencia':'efectivo'}.`,h:hora()}];
  }
  $('#pre').hidden=true;
  drawMsgs();
 },
 'order-detail'(){
  const o=ensureOrder();
  const p=all().find(x=>x.id===o.pid)||{name:'Producto',price:0,img:''};
  const q=o.qty||1;
  const sub=Number(p.price||0)*q;
  const fee=0.30;
  const tot=sub+fee;
  const thumb=`<div class="ph" style="width:84px;height:68px;aspect-ratio:auto;border-radius:12px;${p.img?`background-image:url('${p.img}')`:'background:#FFE9A8'}"></div>`;
  $('#od-items').innerHTML=`<div class="row between">${thumb}
    <div style="flex:1"><b>${esc(p.name)}</b><div class="lb">${money(p.price||0)} c/u</div></div>
    <div style="background:var(--cream);color:var(--blue);border-radius:12px;padding:10px 16px;font-weight:700">${q}</div></div>`;
  $('#od-sub').textContent=money(sub);
  $('#od-fee').textContent=money(fee);
  $('#od-total').textContent=money(tot);
  $('#od-method').textContent=o.payMethod||'Efectivo';
  $$('.od-pay').forEach(b=>b.classList.toggle('on',b.dataset.pm===(o.payMethod||'Efectivo')));
  const box=$('#od-proof-box');
  if(o.proof){
    box.style.backgroundImage=`url('${o.proof}')`;
    box.classList.add('has-photo');
  } else {
    box.style.backgroundImage='';
    box.classList.remove('has-photo');
  }
 },
 notifs(){ if($('#n-list').children.length)return;
  $('#n-list').innerHTML=(role==='b'?['Activar todas las notificaciones','Actualizaciones de pedido','Notificaciones de mensajes','Nuevos productos','Nuevos emprendimientos','Novedades de FoodUCA']:['Activar todas las notificaciones','Actualizaciones de compradores','Notificaciones de mensajes','Notificaciones de actualización','Nuevos emprendimientos','Novedades de FoodUCA'])
   .map((t,i)=>`<div class="tgl"><span>${t}</span><button class="sw ${i===5?'off':''}" role="switch" aria-checked="${i!==5}" aria-label="${t}"></button></div>`).join('')},
 report(){
  const o=ensureOrder(), p=all().find(x=>x.id===o.pid);
  const arr=role==='b'?reportSeller:reportBuyer, who=role==='b'?(p?.seller||'Emprendimiento'):(o.buyer||'Comprador');
  $('#rep-name').textContent=who;$('#rep-name2').textContent=who;$('#rep-opts').innerHTML=arr.map(t=>`<button class="opt" data-rep>${t}</button>`).join('');
 },
 profile(){
  const u=JSON.parse(LS.fu||'{}');
  $('#pf-user').textContent='@'+(u.user||'Usuario');
  $('#pf-mail').textContent=u.mail||'00009625@uca.edu.sv';
  $('#pf-role').textContent=role==='b'?'comprador':'vendedor';
  $('#pf-acc').textContent=u.acc||'1234567890 CA';
  $('#pf-photo-txt').textContent=role==='b'?'Agregar foto de perfil':'Agregar foto del emprendimiento';
  const av=$('#pf-avatar');
  if(u.photo){
    av.style.backgroundImage=`url('${u.photo}')`;
    av.classList.add('has-photo');
  } else {
    av.style.backgroundImage='';
    av.classList.remove('has-photo');
  }
 },
 's-plans'(){},
 's-schedule'(){ if(!$('#days').children.length)$('#days').innerHTML=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d,i)=>`<label>${d}<input aria-label="${d}" placeholder="${i?'':'Ejemplo: 1:00pm, 3:00 pm'}"></label>`).join('')},
 's-products'(){ $('#s-grid').innerHTML=myProducts.map(p=>`<div class="pc"><button data-edit="${p.id}" style="all:unset;display:block;cursor:pointer;width:100%">${pimg(p)}</button><div class="in" style="grid-template-columns:1fr"><b>${p.name}<br><small class="lb">${p.cat==='snack'?'Snak':'Comida'}</small></b><span class="lb">${money(p.price)}</span>
   <label style="display:flex;gap:6px;align-items:center;font-size:.85rem"><input type="checkbox" style="width:18px;height:18px" data-on="${p.id}" ${p.on?'checked':''}> Activo</label></div></div>`).join('')+`<button class="pc add-tile" data-edit="new" aria-label="Agregar producto"><span class="add-plus">+</span><span>Agregar<br>Producto</span></button>`},
 's-orders'(){
  const limit = plan.name==='Gratuito'?5:(plan.name==='Plus'?40:20);
  $('#so-empty').hidden = buyers.length > 0;
  $('#so-list').innerHTML=buyers.map((b,i)=>{
    const p = all().find(x=>x.id===b.pid);
    return `<div class="card" style="margin:0">
      <div class="row">
        ${p && p.img ? `<div style="width:52px;height:52px;border-radius:12px;background:url('${p.img}') center/cover;flex:none"></div>` : '<span class="avatar"></span>'}
        <button class="btn blue sm" data-schat="${i}">${esc(b.n)} solicita un pedido</button>
      </div>
      <div class="ostat" style="margin:10px 0 0 64px">${['En camino','Entregado','Cancelado'].map(s=>`<button data-bst="${i}|${s}" class="${b.st===s?'on':''}">${s}</button>`).join('')}</div>
    </div>`;
  }).join('');
  $('#so-count').textContent=buyers.filter(b=>b.st!=='Cancelado').length+'/'+limit;
 },
 stats(){drawStats('mes')}
};

const cur_p = () => catalog().find(p=>p.id===window.sel) || catalog()[0] || null;

function ensureOrder(){
  if(chatOrder === -1 && sellerOrder) return sellerOrder;
  if(typeof chatOrder === 'number' && chatOrder >= 0 && orders[chatOrder]) return orders[chatOrder];
  if(orders.length){ chatOrder = 0; return orders[0]; }
  const fallbackProd = catalog()[0] || {id:0,name:'Pedido',seller:'FoodUCA',img:''};
  orders.unshift({pid: fallbackProd.id, qty: 1, time: '11:00 am', status: 'En camino', msgs: null});
  chatOrder = 0;
  return orders[0];
}

const own = () => role==='b' ? 1 : 0;
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function hora(){return new Date().toLocaleTimeString('es-SV',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'America/El_Salvador'})}

function drawMsgs(){
  const o=ensureOrder();
  $('#msgs').innerHTML=o.msgs.map(m=>{
    const c=(role==='b')===!!m.me?'me':'you';
    return (m.img&&m.img.img?`<div class="mimg ${c}">${pimg(m.img)}</div>`:'')+`<div class="m ${c}">${esc(m.t).replace(/\n/g,'<br>')}<small>${m.h||hora()}</small></div>`;
  }).join('');
  const box=$('#msgs'); box.scrollTop=box.scrollHeight;
}

function drawStats(per){
  const activeOrders = buyers.filter(b=>b.st!=='Cancelado');
  const totalSales = activeOrders.reduce((s,b)=>s+(b.total||0),0);
  const totalItems = activeOrders.reduce((s,b)=>s+(b.qty||1),0);
  const d=per==='mes'
    ? {k:[activeOrders.length,money(totalSales),totalItems],b:[20,25,20,30,25],l:['S1','S2','S3','S4','S5']}
    : {k:[activeOrders.length,money(totalSales),totalItems],b:[15,20,15,25,20],l:['Lun','Mar','Mié','Jue','Vie']};
  $('#k1').textContent=d.k[0];$('#k2').textContent=d.k[1];$('#k3').textContent=d.k[2];
  const pts=d.b.map((v,i)=>`${40+i*55},${145-v*3.4}`).join(' ');   /* gráfica de línea como en el PDF */
  $('#bars').innerHTML=`<svg class="lc" viewBox="0 0 300 160" role="img" aria-label="Gráfica de pedidos"><path d="M12 6V150H292" fill="none" stroke="#1E5ABB" stroke-width="5" stroke-linecap="round"/><polyline points="${pts}" fill="none" stroke="#FDBA19" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="lbl">${d.l.map(x=>`<span>${x}</span>`).join('')}</div>`;
  $('#top3').innerHTML=myProducts.length
    ? myProducts.slice(0,3).map(p=>`<div>${pimg(p)}<p>${p.name}</p></div>`).join('')
    : '<p class="light">Sin productos registrados aún</p>';
}

/* ---- 5. VENTANAS EMERGENTES ---- */
function modal(html,cls=''){const m=$('#md');m.className='modal '+cls;m.innerHTML=html;$('#ov').hidden=false}
const closeModal=()=>$('#ov').hidden=true;
function confirmBox(icon,t,p,ok,fn){modal(`<div style="font-size:3rem">${icon}</div><h3>${t}</h3><p>${p}</p><div class="mrow"><button class="btn cancel" id="mc">Cancelar</button><button class="btn yellow" id="mo">${ok}</button></div>`);
  $('#mc').onclick=closeModal;$('#mo').onclick=()=>{closeModal();fn()}}

/* ---- 6. EVENTOS ---- */
document.addEventListener('click',e=>{
  const t=e.target.closest('button,a,[data-go],[data-chat],[data-open]'); if(!t)return;
  if(t.dataset.go){e.preventDefault();return go(t.dataset.go)}
  if('back' in t.dataset)return back();
  if('home' in t.dataset)return home();
  if(t.dataset.role){
    setRole(t.dataset.role);
    changingExistingPlan = false;
    return go(t.dataset.role==='b'?'register':'s-plans');
  }
  if(t.dataset.loginRole){setRole(t.dataset.loginRole);return go(t.dataset.loginRole==='b'?'login':'s-login')}
  if(t.dataset.pay){   /* selección del método de pago (emprendedor) */
    $$('#pay-chips .chip').forEach(c=>{const on=c===t;c.classList.toggle('on',on);c.setAttribute('aria-checked',on)});
    $('#sched-pay').value=t.dataset.pay;$('#f-sched .err').textContent='';return;
  }
  if(t.dataset.cat){filt.cat=t.dataset.cat;return render.home()}
  if(t.dataset.open){window.sel=+t.dataset.open;qty=2;return go('product')}
  if(t.dataset.fav){const id=+t.dataset.fav;favs.has(id)?favs.delete(id):favs.add(id);e.stopPropagation();return render[cur]()}
  if(t.dataset.chat!==undefined){chatOrder=+t.dataset.chat;return go('chat')}
  if(t.dataset.schat!==undefined){
    const b = buyers[+t.dataset.schat];
    chatOrder = -1;
    sellerOrder = b.orderObj || {pid:b.pid||0,qty:b.qty||1,time:b.time||'11:00 am',status:b.st,buyer:b.n,msgs:b.msgs||[]};
    return go('chat');
  }
  if(t.dataset.bst){
    const[i,s]=t.dataset.bst.split('|');
    buyers[i].st=s;
    if(buyers[i].orderObj) buyers[i].orderObj.status=s;
    return render['s-orders']();
  }
  if(t.dataset.pm){ensureOrder().payMethod=t.dataset.pm;return render['order-detail']()}
  if(t.dataset.edit){openEdit(t.dataset.edit);return}
  if(t.dataset.per)return drawStats(t.dataset.per);
  if(t.dataset.c&&t.closest('#f-filter')){t.classList.toggle('on');return}
  if(t.dataset.c&&t.closest('#e-cats')){$$('#e-cats .chip').forEach(c=>c.classList.toggle('on',c===t));editCat=t.dataset.c;return}
  if('rep' in t.dataset){$$('.opt').forEach(o=>o.classList.remove('on'));t.classList.add('on');return}
  if(t.classList.contains('sw')){t.classList.toggle('off');t.setAttribute('aria-checked',!t.classList.contains('off'));if(t.closest('.tgl').firstElementChild.textContent.startsWith('Activar'))$$('.sw').forEach(s=>{s.classList.toggle('off',t.classList.contains('off'))});return}
  if(t.classList.contains('plan')){$$('.plan').forEach(p=>p.classList.remove('sel'));t.classList.add('sel');plan={name:t.dataset.p,price:+t.dataset.pr};return}
  if(t.closest('.s-dev')&&t.classList.contains('btn')){t.closest('.s-dev').remove();return toast('Sesión olvidada')}
});
$('#ov').addEventListener('click',e=>{if(e.target.id==='ov')closeModal()});
$('#p-fav').onclick=()=>{const p=cur_p();if(!p)return;favs.has(p.id)?favs.delete(p.id):favs.add(p.id);render.product()};
document.getElementById('q-').onclick=()=>{qty=Math.max(1,qty-1);$('#q-n').textContent=qty};
document.getElementById('q+').onclick=()=>{qty=Math.min(10,qty+1);$('#q-n').textContent=qty};

/* Horario → solicitar pedido */
$('#sel-time').onclick=()=>{const p=cur_p();if(!p)return;pickedTime=null;
  modal(`${p.times.map(t=>`<button class="btn time" data-t="${t}"><i class="ck"></i>${t}</button>`).join('')}<p>Si ninguno de estos horarios te favorece, podrías intentar pedir otro producto o seleccionar otro emprendedor.</p><button class="btn" style="border:1.5px solid #fff" id="req">Solicitar pedido</button>`,'blue-m');
  $$('.time').forEach(b=>b.onclick=()=>{pickedTime=b.dataset.t;$$('.time').forEach(x=>x.style.outline='');b.style.outline='4px solid #fff'});
  $('#req').onclick=()=>{
    if(!pickedTime)return toast('Elige un horario');
    closeModal();
    const u=JSON.parse(LS.fu||'{}');
    const buyerName=u.user ? u.user : 'Comprador UCA';
    const firstMsg={me:1,img:p.img?p:null,t:`Solicito ${qty>1?qty+' unidades de':'una'} ${p.name}, para las ${pickedTime}, pagaré con ${p.pay==='Transferencia'?'transferencia':'efectivo'}.`,h:hora()};
    const newOrd={pid:p.id,qty,time:pickedTime,status:'En camino',msgs:[firstMsg],payMethod:(p.pay==='Transferencia'?'Transferencia bancaria':'Efectivo'),proof:null};  /* solo el mensaje del comprador: el emprendedor responde después */
    orders.unshift(newOrd);
    buyers.unshift({
      n:buyerName,
      pid:p.id,
      prodName:p.name,
      qty,
      total:p.price*qty,
      time:pickedTime,
      st:'En camino',
      orderObj:newOrd,
      msgs:newOrd.msgs
    });
    chatOrder=0;
    stack.push('orders');
    go('chat');
  }};

/* Chat con mensajes rápidos reales */
$('#pre-btn').onclick=(e)=>{
  e.stopPropagation();
  const p=$('#pre'), o=ensureOrder();
  p.hidden=!p.hidden;
  const list = role==='b' ? quickBuyer : getQuickSeller();
  p.innerHTML = list.map((item, idx) => {
    const ok = !item.when || item.when(o);
    return `<button type="button" data-qidx="${idx}" class="${item.label.startsWith('Rechazar')?'no':''}" ${ok?'':'disabled aria-disabled="true"'}>${esc(item.label)}${ok?'':`<small>${esc(item.hint||'')}</small>`}</button>`;
  }).join('');
};
$('#pre').onclick=e=>{
  const btn = e.target.closest('button[data-qidx]');
  if(!btn || btn.disabled) return;
  const list = role==='b' ? quickBuyer : getQuickSeller();
  const chosen = list[+btn.dataset.qidx];
  if(!chosen) return;
  const o=ensureOrder();
  if(chosen.when && !chosen.when(o)) return toast(chosen.hint||'Todavía no puedes enviar este mensaje');
  o.msgs.push({me:own(),t:typeof chosen.text==='function'?chosen.text(o):chosen.text,h:hora()});
  if(role==='s'){
    if(chosen.label.startsWith('Aceptar')) o.accepted=true;
    if(chosen.label.startsWith('Rechazar')){
      o.rejected=true; o.status='Cancelado';
      const bItem = buyers.find(b=>b.n===o.buyer); if(bItem) bItem.st='Cancelado';
    }
  }
  $('#pre').hidden=true;
  drawMsgs();
};

let pendingProofUrl = null;
$('#send-proof').onclick=()=>{
  pendingProofUrl = null;
  modal(`
    <label class="proof-drop" id="proof-drop" for="proof">
      <span id="proof-icon">🖼➔</span>
      <input type="file" accept="image/*" hidden id="proof">
    </label>
    <button type="button" class="btn yellow" id="proof-submit">Subir</button>
    <button type="button" class="btn cancel" id="mc">Cancelar</button>
  `);
  $('#mc').onclick=closeModal;
  $('#proof-submit').onclick=()=>{
    if(!pendingProofUrl) return toast('Selecciona primero la imagen del comprobante');
    const o=ensureOrder();
    o.proof=pendingProofUrl;
    o.msgs.push({me:own(),t:'📎 Comprobante enviado.',h:hora()});
    closeModal();
    drawMsgs();
  };
};

function sendMsg(){
  const input=$('#msg-in');
  const text=input.value.trim();
  if(!text){ input.focus(); return; }
  const o=ensureOrder();
  o.msgs.push({me:own(),t:text,h:hora()});
  input.value='';
  $('#pre').hidden=true;
  drawMsgs();
  input.focus();
}
$('#msg-send').addEventListener('click',sendMsg);
$('#msg-in').addEventListener('keydown',e=>{
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    sendMsg();
  }
});

document.addEventListener('change',e=>{
  if(e.target.id==='proof' && e.target.files[0]){
    pendingProofUrl = URL.createObjectURL(e.target.files[0]);
    const drop=$('#proof-drop');
    if(drop){
      drop.style.backgroundImage=`url('${pendingProofUrl}')`;
      const ic=$('#proof-icon');
      if(ic) ic.textContent='✓';
    }
  }
  if(e.target.id==='photo'&&e.target.files[0]){
    const reader=new FileReader();
    reader.onload=()=>{
      const u=JSON.parse(LS.fu||'{}');
      u.photo=reader.result;
      LS.fu=JSON.stringify(u);
      syncAvatars();
      render.profile();
      toast('Foto de perfil actualizada');
    };
    reader.readAsDataURL(e.target.files[0]);
  }
  if(e.target.closest('.drop')){e.target.parentElement.classList.add('done');e.target.parentElement.querySelector('span').textContent='✓ '+(e.target.files[0]?.name||'Listo')}
  if(e.target.id==='e-file'&&e.target.files[0]){
    const u=URL.createObjectURL(e.target.files[0]);
    const box=$('#e-img');
    box.style.backgroundImage=`url('${u}')`;
    box.classList.add('has-photo');
    box.dataset.u=u;
    $('#e-img-label').textContent='✓ Fotografía cargada (toca para cambiar)';
  }
  if(e.target.dataset.on){
    const prod=myProducts.find(p=>p.id==e.target.dataset.on);
    if(prod){
      prod.on=e.target.checked;
      if(prod.on && !prod.img) toast('Sube una foto del producto para que sea visible a compradores');
    }
  }
});

$('#c-cancel').onclick=()=>confirmBox('✕','¿Cancelar pedido?','Se marcará como cancelado.','Sí, cancelar',()=>{ensureOrder().status='Cancelado';toast('Pedido cancelado');back()});
$('#c-report').onclick=()=>go('report');
$('#rep-send').onclick=()=>{if(!$('.opt.on'))return $('#err-rep').textContent='Elige un motivo.';$('#err-rep').textContent='';go('report-done')};

/* Formularios con validación */
const uca=m=>/^[^\s@]+@uca\.edu\.sv$/i.test(m.trim());
function form(id,fn){$(id).addEventListener('submit',e=>{e.preventDefault();const f=e.target,er=f.querySelector('.err');er.textContent='';
  const empty=[...f.querySelectorAll('input:not([type=file]),textarea')].find(i=>!i.value.trim()&&!i.id.startsWith('f-')&&!(i.closest('.days')&&i.getAttribute('aria-label')!=='Lunes'));
  const msg=fn(f,empty);if(msg){er.textContent=msg;(empty||f.querySelector('input')).focus()}})}

form('#f-register',(f)=>{const v=f.elements;if(!uca(v.mail.value))return 'Usa tu correo institucional @uca.edu.sv.';if(v.pass.value.length<6)return 'La contraseña debe tener al menos 6 caracteres.';if(!v.user.value.trim())return 'Escribe tu nombre de usuario.';
  const prev=JSON.parse(LS.fu||'{}');
  LS.fu=JSON.stringify({...prev,mail:v.mail.value.trim(),user:v.user.value.trim().replace(/^@+/,''),pass:v.pass.value});go('before')});

form('#f-login',(f)=>{setRole('b');const v=f.elements;if(!uca(v.mail.value))return 'Usa tu correo @uca.edu.sv.';if(!v.pass.value)return 'Escribe tu contraseña.';
  const u=JSON.parse(LS.fu||'{}');if(u.mail&&u.mail.toLowerCase()===v.mail.value.toLowerCase()&&u.pass!==v.pass.value)return 'Contraseña incorrecta.';
  if(!u.mail)LS.fu=JSON.stringify({mail:v.mail.value.trim(),user:v.mail.value.split('@')[0],pass:v.pass.value});
  stack=[];go('home')});

form('#f-slogin',(f)=>{
  setRole('s');const v=f.elements;
  if(!v.biz.value.trim()||!v.own.value.trim())return 'Completa el nombre del emprendimiento y del responsable.';
  if(!uca(v.mail.value))return 'Usa tu correo institucional @uca.edu.sv.';
  if(!v.pass.value)return 'Escribe tu contraseña.';
  const u=JSON.parse(LS.fu||'{}');
  if(u.mail&&u.mail.toLowerCase()===v.mail.value.trim().toLowerCase()&&u.pass!==v.pass.value)return 'Contraseña incorrecta.';
  LS.fu=JSON.stringify({...u,mail:v.mail.value.trim(),user:v.biz.value.trim().replace(/^@+/,''),owner:v.own.value.trim(),pass:v.pass.value,isSeller:true});
  hasRegisteredSeller=true;stack=[];go('s-products');
});
$('#accept-btn').onclick=()=>{if(!$('#accept').checked)return $('#err-accept').textContent='Debes aceptar las normas para continuar.';$('#err-accept').textContent='';stack=[];go('home')};

/* Flujo de Emprendedor: 1. Planes -> 2. Pago (si aplica) -> 3. Términos -> 4. Registro -> 5. Verificación -> 6. Revisión -> 7. Aprobado -> 8. Horarios */
$('#plan-go').onclick=()=>{
  if(plan.price===0){
    if(changingExistingPlan){ changingExistingPlan=false; toast('Plan Gratuito activado'); return home(); }
    return go('s-terms');
  }
  $('#pay-price').textContent=money(plan.price);
  $('#pay-plan').textContent=plan.name;
  go('s-pay');
};
$$('.plan')[1].classList.add('sel');

$('#paid-next').onclick=()=>{
  if(changingExistingPlan){ changingExistingPlan=false; return home(); }
  go('s-terms');
};

$('#m-change-plan').onclick=()=>{
  changingExistingPlan = true;
  go('s-plans');
};

form('#f-sreg',(f)=>{const v=f.elements;if(!v.biz.value.trim()||!v.own.value.trim())return 'Completa el nombre del emprendimiento y del responsable.';if(!uca(v.mail.value))return 'Usa tu correo institucional @uca.edu.sv.';if(!/^\d{8}$/.test(v.id.value))return 'El carnet son 8 dígitos.';if(!v.acc.value.trim())return 'Escribe tu número de cuenta.';if(v.pass.value.length<6)return 'Contraseña de mínimo 6 caracteres.';if(v.pass.value!==v.pass2.value)return 'Las contraseñas no coinciden.';
  hasRegisteredSeller=true;
  const prev=JSON.parse(LS.fu||'{}');
  LS.fu=JSON.stringify({...prev,mail:v.mail.value.trim(),user:v.biz.value.trim().replace(/^@+/,''),acc:v.acc.value.trim(),pass:v.pass.value,isSeller:true});
  go('s-verify')});

$('#send-req').onclick=()=>{if($$('.drop.done').length<2)return $('#err-ver').textContent='Sube la foto de tu producto y tu documento.';go('s-review')};

/* Pago con tarjeta */
($('#demo-pay')||{}).onclick=()=>{
  const v=$('#f-pay').elements;
  v.holder.value='Fulano Contreras';
  v.card.value='4242 4242 4242 4242';
  v.exp.value='12/29';
  v.cvc.value='123';
  v.mail.value='ejemplo@uca.edu.sv';
};
$('#f-pay').elements.card.oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim();
$('#f-pay').elements.exp.oninput=e=>{let d=e.target.value.replace(/\D/g,'').slice(0,4);e.target.value=d.length>2?d.slice(0,2)+'/'+d.slice(2):d};
$('#f-pay').elements.cvc.oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,3);

form('#f-pay',(f)=>{
  const v=f.elements;
  if(!v.holder.value.trim())return 'Escribe el nombre completo del titular de la tarjeta.';
  if(v.card.value.replace(/\s/g,'').length!==16)return 'El número de tarjeta debe tener 16 dígitos.';
  if(!/^(0[1-9]|1[0-2])\/\d{2}$/.test(v.exp.value))return 'Ingresa una fecha de vencimiento válida en formato MM/AA (ej. 12/29).';
  if(v.cvc.value.length!==3)return 'El código CVC son los 3 dígitos al reverso de tu tarjeta.';
  if(!uca(v.mail.value))return 'Usa tu correo institucional @uca.edu.sv para recibir el comprobante.';
  $('#pd-plan').textContent=$('#pd-plan2').textContent=plan.name;$('#pd-price').textContent=money(plan.price);go('s-paid');
});

form('#f-sched',(f)=>{
  const v=f.elements;
  if(![...$$('#days input')].some(i=>i.value.trim()&&i.value.trim()!=='-'))return 'Escribe al menos un horario.';
  if(!v.place.value.trim())return 'Escribe el lugar de la UCA donde entregarás los pedidos.';
  if(!v.pay.value)return 'Selecciona tu método de pago preferido.';
  const u=JSON.parse(LS.fu||'{}');u.pay=v.pay.value;u.place=v.place.value.trim();LS.fu=JSON.stringify(u);
  hasRegisteredSeller=true;stack=[];go('s-products');
});
form('#f-pass',(f)=>{const i=f.querySelectorAll('input');if(i[1].value.length<6)return 'Mínimo 6 caracteres.';if(i[1].value!==i[2].value)return 'Las contraseñas no coinciden.';toast('Contraseña actualizada');back()});
$('#f-filter').onsubmit=e=>{e.preventDefault();filt.max=parseFloat($('#f-max').value)||null;filt.cats=$$('#f-cats .on').map(c=>c.dataset.c);go('results')};
$('#q').oninput=e=>{filt.text=e.target.value.toLowerCase();render.home()};

/* Productos del emprendedor */
function openEdit(id){
  editing=id==='new'?null:myProducts.find(p=>p.id==id);
  const p=editing||{name:'',desc:'',price:'',time:'',cat:'comida',img:''}, f=$('#f-prod').elements;
  const box=$('#e-img');
  delete box.dataset.u;
  $('#e-title').textContent=editing?p.name:'Agregar producto';
  $('#e-name-wrap').hidden=Boolean(editing);
  $('#e-desc-label').firstChild.textContent=editing?'Cambiar descripción':'Escribe una breve descripción de este producto';
  $('#e-cat-label').textContent=editing?'Cambiar categoría seleccionada':'Selecciona la categoría de este producto';
  $('#e-price-label').firstChild.textContent=editing?'Cambiar precio':'Establece precio';
  $('#e-time-label').firstChild.textContent=editing?'Cambiar horarios':'Selecciona uno de tus horarios para este producto';
  f.name.value=p.name; f.desc.value=p.desc; f.price.value=p.price; f.time.value=(p.times||[''])[0];
  editCat=p.cat;
  $$('#e-cats .chip').forEach(c=>c.classList.toggle('on',c.dataset.c===p.cat));
  if(p.img){
    box.style.backgroundImage=`url('${p.img}')`;
    box.classList.add('has-photo');
    $('#e-img-label').textContent='✓ Fotografía cargada (toca para cambiar)';
  } else {
    box.style.backgroundImage='';
    box.classList.remove('has-photo');
    $('#e-img-label').textContent='Agrega foto del producto';
  }
  $('#e-del').hidden=!editing;
  $('#e-save').textContent=editing?'Guardar cambios':'Confirmar';
  go('s-edit');
}

form('#f-prod',(f)=>{
  const v=f.elements;
  const photoUrl=$('#e-img').dataset.u||(editing?.img||'');
  if(!photoUrl)return 'Debes subir una fotografía real de tu producto para publicarlo.';
  const prodName=editing?editing.name:v.name.value.trim();
  if(!prodName||!v.desc.value.trim())return 'Escribe el nombre y la descripción del producto.';
  if(!(parseFloat(v.price.value)>0))return 'Escribe un precio válido mayor a $0.00.';
  hasRegisteredSeller=true;
  const u=JSON.parse(LS.fu||'{}');
  const d={name:prodName,desc:v.desc.value.trim(),price:parseFloat(v.price.value),cat:editCat,times:[v.time.value.trim()||'11:00 am'],img:photoUrl};
  editing?Object.assign(editing,d):myProducts.push({id:Date.now(),seller:u.user||'Mi emprendimiento',place:'Entrega en '+(u.place||'Peatonal'),pay:u.pay||'Efectivo',on:true,...d});
  toast(editing?'Cambios guardados':'Producto guardado');back();
});
$('#e-del').onclick=()=>confirmBox('🗑','¿Eliminar producto?','Esta acción no se puede deshacer.','Eliminar',()=>{myProducts.splice(myProducts.indexOf(editing),1);toast('Producto eliminado');back()});

/* Editar perfil */
$('#edit-profile-btn').onclick=()=>{
  const u=JSON.parse(LS.fu||'{}');
  modal(`
    <h3 class="blue">Editar perfil</h3>
    <form class="form left" id="f-edit-pf" style="width:100%">
      <label>Nombre de usuario
        <input name="user" value="${esc(u.user||'Usuario')}" placeholder="Usuario">
      </label>
      <label>Correo UCA
        <input type="email" name="mail" value="${esc(u.mail||'00009625@uca.edu.sv')}" placeholder="00009625@uca.edu.sv">
      </label>
      <p class="err" id="err-pf"></p>
      <div class="mrow">
        <button type="button" class="btn cancel" id="mc">Cancelar</button>
        <button type="submit" class="btn blue">Guardar</button>
      </div>
    </form>
  `);
  $('#mc').onclick=closeModal;
  $('#f-edit-pf').onsubmit=ev=>{
    ev.preventDefault();
    const v=ev.target.elements;
    const newUser=v.user.value.trim().replace(/^@+/,'');
    const newMail=v.mail.value.trim();
    if(!newUser){$('#err-pf').textContent='Escribe un nombre de usuario.';return;}
    if(!uca(newMail)){$('#err-pf').textContent='Usa un correo institucional @uca.edu.sv.';return;}
    u.user=newUser;
    u.mail=newMail;
    LS.fu=JSON.stringify(u);
    closeModal();
    render.profile();
    toast('Perfil actualizado');
  };
};

/* Ajustes */
$('#m-logout').onclick=()=>confirmBox('🚪','¿Deseas cerrar sesión?','Tendrás que iniciar sesión nuevamente para acceder a tu cuenta de FoodUCA','Cerrar sesión',()=>{stack=[];go('role')});
$('#m-delete').onclick=()=>confirmBox('🗑','¿Deseas borrar tu cuenta?','Al eliminar tu cuenta perderás el acceso a tu perfil','Eliminar',()=>{localStorage.removeItem(role==='s'?'fuS':'fuB');stack=[];toast('Cuenta eliminada');go('role')});
$('#close-all').onclick=()=>confirmBox('👤','¿Cerrar todas las sesiones?','Se cerrará tu sesión en todos los dispositivos.','Cerrar',()=>{stack=[];go('login-role')});

/* Inicio */
go('splash');