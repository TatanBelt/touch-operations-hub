
let me=null,current="dashboard",options=null,accessState=null;
const $=s=>document.querySelector(s);
const money=v=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(v||0);
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)};
const badge=s=>`<span class="badge ${s}">${String(s).replaceAll("_"," ")}</span>`;
const api=async(url,opts={})=>{const r=await fetch(url,opts);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Error");return d};
const initials=n=>(n||"").split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"TU";
const assetTypeLabels={ACTIVO_FIJO:"Activo fijo",ACTIVO_TECNOLOGIA:"Activo de tecnología",ACTIVO_INFORMACION:"Activo de información",ACTIVO_CIRCULANTE:"Activo circulante"};
const moduleMeta={
  dashboard:{label:"Overview"},
  requests:{label:"Solicitudes"},
  approvals:{label:"Aprobaciones"},
  orders:{label:"Órdenes de compra"},
  invoices:{label:"Facturación & pagos"},
  inventory:{label:"Inventarios"},
  budgets:{label:"Presupuestos"},
  suppliers:{label:"Proveedores"},
  users:{label:"Usuarios"},
  access:{label:"Control de accesos"}
};
const moduleOrder=["dashboard","requests","approvals","orders","invoices","inventory","budgets","suppliers","users","access"];

function isAdmin(){return me?.role==="ADMIN"}
function getPerm(module){return accessState?.permissions?.[module]||{}}
function can(module,action="view"){return !!getPerm(module)[`can_${action}`]}
function visibleModules(){return moduleOrder.filter(m=>can(m,"view"))}
function currentTitle(){
 const titles={
   dashboard:"Centro de operación",
   requests:"Solicitudes de compra",
   approvals:"Aprobaciones multinivel",
   orders:"Órdenes de compra",
   invoices:"Facturación y pagos",
   inventory:"Inventarios",
   budgets:"Presupuestos",
   suppliers:"Proveedores",
   users:"Usuarios",
   access:"Control de accesos"
 };
 return titles[current]||"Touch Hub";
}
function title(t){
 $("#title").textContent=t;
 const subtitles={
   "Centro de operación":"Vista general del rol actual y del flujo operativo del hub.",
   "Solicitudes de compra":"Requerimientos de producción, operación y servicios para campañas y clientes.",
   "Aprobaciones multinivel":"Decisiones de inversión con trazabilidad y responsables claros.",
   "Órdenes de compra":"Formalización de proveedores y compromisos de cada proyecto.",
   "Facturación y pagos":"Seguimiento financiero de proveedores, facturas y vencimientos.",
   "Inventarios":"Activos, equipos y materiales que soportan la operación de marketing.",
   "Presupuestos":"Control de inversión por centro de costo, proyecto y cliente.",
   "Proveedores":"Red de aliados para producción, logística, tecnología y operación.",
   "Usuarios":"Gestión de usuarios, roles y niveles de aprobación.",
   "Control de accesos":"Matriz de permisos por rol administrada por el equipo de administración."
 };
 const sub=$("#pageSubtitle");
 if(sub) sub.textContent=subtitles[t]||"Marketing operations en un mismo lugar.";
}

$("#loginForm").onsubmit=async e=>{
 e.preventDefault();
 try{
   me=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#email").value,password:$("#password").value})});
   await start();
 }catch(err){toast(err.message)}
};
$("#logout").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
$("#closeModal").onclick=()=>$("#modal").classList.add("hidden");
$("#modal").onclick=e=>{if(e.target.id==="modal")$("#modal").classList.add("hidden")};
$("#newRequest").onclick=()=>requestModal();
$("#notificationsBtn").onclick=()=>notificationsModal();

async function boot(){me=await api("/api/me");if(me) await start();}
async function start(){
 $("#login").classList.add("hidden");
 $("#app").classList.remove("hidden");
 [options,accessState]=await Promise.all([api("/api/options"),api("/api/access/me")]);
 const available=visibleModules();
 if(!available.includes(current)) current=available[0]||"dashboard";
 $("#userName").textContent=me.name;
 $("#userRole").textContent=me.role+(me.approval_level?` · ${me.approval_level}`:"");
 $("#avatar").textContent=initials(me.name);
 $("#newRequest").style.display=can("requests","create")?"inline-flex":"none";
 renderNav();
 await refreshNotif();
 await render();
}
function renderNav(){
 const items=visibleModules();
 $("#nav").innerHTML=items.map(id=>`<button class="nav ${current===id?"active":""}" onclick="go('${id}')">${moduleMeta[id]?.label||id}</button>`).join("");
}
window.go=async id=>{current=id;renderNav();await render();}
async function render(){
 if(!can(current,"view")){
   title(currentTitle());
   $("#content").innerHTML=`<div class="card"><div class="empty">No tienes permisos para ver este módulo.</div></div>`;
   return;
 }
 if(current==="dashboard") return dashboard();
 if(current==="requests") return requests();
 if(current==="approvals") return approvals();
 if(current==="orders") return orders();
 if(current==="invoices") return invoices();
 if(current==="inventory") return inventory();
 if(current==="budgets") return budgets();
 if(current==="suppliers") return suppliers();
 if(current==="users") return users();
 if(current==="access") return accessControl();
}
async function refreshNotif(){
 const n=await api("/api/notifications");
 $("#notifCount").textContent=n.filter(x=>!x.is_read).length;
}
function roleTone(){
 if(me.role==="ADMIN") return {hero:"Control total del hub y trazabilidad de la operación.", helper:"Administra usuarios, permisos, presupuesto y visibilidad total del sistema."};
 if(me.role==="COMPRADOR") return {hero:"Gestiona compras, órdenes y proveedores sin perder el ritmo operativo.", helper:"Tu vista prioriza solicitudes, órdenes de compra, facturas e inventarios."};
 return {hero:"Aprueba con contexto y mantén el flujo de inversión bajo control.", helper:"Tu vista está enfocada en aprobaciones pendientes, trazabilidad y presupuesto."};
}
function dashboardKpis(d){
 if(me.role==="ADMIN"){
  return [
   {title:"Usuarios activos",value:d.usersCount,note:"Equipo con acceso al hub"},
   {title:"Inversión comprometida",value:money(d.committed),note:`${d.pending} solicitud(es) pendiente(s)`},
   {title:"Facturación registrada",value:money(d.invoiced),note:`${d.overdue} factura(s) vencida(s)`},
   {title:"Inventario valorizado",value:money(d.inventoryValue),note:`${d.inventoryItems} activo(s) registrados`}
  ];
 }
 if(me.role==="COMPRADOR"){
  return [
   {title:"Solicitudes activas",value:d.pending,note:"Pendientes dentro del flujo"},
   {title:"Compras aprobadas",value:d.approved,note:"Listas para orden de compra"},
   {title:"Pagos registrados",value:money(d.paid),note:"Facturas pagadas"},
   {title:"Activos registrados",value:d.inventoryItems,note:"Inventario disponible"}
  ];
 }
 return [
  {title:"Pendientes por aprobar",value:d.myPendingApprovals,note:"Solicitudes en tu radar"},
  {title:"Solicitudes abiertas",value:d.pending,note:"Operación total en flujo"},
  {title:"Aprobadas",value:d.approved,note:"Compras ya aprobadas"},
  {title:"Presupuesto global",value:money(d.budget),note:"Marco de inversión disponible"}
 ];
}
function dashboardQuickLinks(){
 const links=[];
 if(me.role==="ADMIN"){
   if(can("requests","create")) links.push({label:"Nueva solicitud",action:"requestModal()"});
   if(can("users","view")) links.push({label:"Gestionar usuarios",action:"go('users')"});
   if(can("access","view")) links.push({label:"Roles y accesos",action:"go('access')"});
 }
 if(me.role==="COMPRADOR"){
   if(can("requests","create")) links.push({label:"Nueva solicitud",action:"requestModal()"});
   if(can("orders","view")) links.push({label:"Órdenes de compra",action:"go('orders')"});
   if(can("suppliers","view")) links.push({label:"Directorio proveedores",action:"go('suppliers')"});
 }
 if(me.role==="APROBADOR"){
   if(can("approvals","view")) links.push({label:"Pendientes por aprobar",action:"go('approvals')"});
   if(can("requests","view")) links.push({label:"Ver solicitudes",action:"go('requests')"});
   if(can("budgets","view")) links.push({label:"Consultar presupuesto",action:"go('budgets')"});
 }
 return links.slice(0,3);
}
async function dashboard(){
 title("Centro de operación");
 const d=await api("/api/dashboard");
 const tone=roleTone();
 const kpis=dashboardKpis(d);
 const quick=dashboardQuickLinks();
 const visible=visibleModules().filter(x=>x!=="dashboard").slice(0,5);

 $("#content").innerHTML=`
   <section class="marketing-hero dynamic-role ${me.role}">
     <div class="hero-copy">
       <span class="hero-label">${me.role==="ADMIN"?"ADMIN CONTROL CENTER":me.role==="COMPRADOR"?"PURCHASING WORKSPACE":"APPROVAL DESK"}</span>
       <h2>${tone.hero}</h2>
       <p>${tone.helper}</p>
       <div class="role-chip-row">
         ${visible.map(v=>`<span>${moduleMeta[v].label}</span>`).join("")}
       </div>
     </div>
     <div class="hero-quick">
       ${quick.map(q=>`<a class="quick-link" href="javascript:void(0)" onclick="${q.action}"><span>${q.label}</span><span>→</span></a>`).join("")}
     </div>
   </section>

   <div class="kpis">${kpis.map(k=>`<div class="kpi"><small>${k.title}</small><strong>${k.value}</strong><div class="note">${k.note}</div></div>`).join("")}</div>

   <div class="campaign-strip role-strip">
     ${me.role==="ADMIN"?`
     <div class="campaign-pill"><span>PRESUPUESTO TOTAL</span><strong>${money(d.budget)}</strong></div>
     <div class="campaign-pill"><span>COMPROMETIDO</span><strong>${money(d.committed)}</strong></div>
     <div class="campaign-pill"><span>DISPONIBLE</span><strong>${money(Math.max(0,d.budget-d.committed))}</strong></div>
     `:me.role==="COMPRADOR"?`
     <div class="campaign-pill"><span>ÓRDENES / FACTURAS</span><strong>${money(d.invoiced)}</strong></div>
     <div class="campaign-pill"><span>POR PAGAR</span><strong>${d.overdue} vencida(s)</strong></div>
     <div class="campaign-pill"><span>INVENTARIO</span><strong>${money(d.inventoryValue)}</strong></div>
     `:`
     <div class="campaign-pill"><span>EN TU BANDEJA</span><strong>${d.myPendingApprovals} solicitud(es)</strong></div>
     <div class="campaign-pill"><span>APROBADAS</span><strong>${d.approved}</strong></div>
     <div class="campaign-pill"><span>PRESUPUESTO</span><strong>${money(d.budget)}</strong></div>
     `}
   </div>

   <div class="grid2">
     <div class="card">
       <div class="section-header">
         <div>
           <span class="section-kicker">${me.role==="APROBADOR"?"TRAZABILIDAD":"ACTIVIDAD RECIENTE"}</span>
           <h3>${me.role==="APROBADOR"?"Solicitudes para seguimiento":"Operación de proyectos"}</h3>
         </div>
         ${can("requests","view")?`<button class="secondary" onclick="go('requests')">Ver solicitudes</button>`:""}
       </div>
       ${tableRequests(d.recent)}
     </div>

     <div class="card">
       <div class="section-header">
         <div>
           <span class="section-kicker">${me.role==="APROBADOR"?"PRESUPUESTO":"INVERSIÓN"}</span>
           <h3>${me.role==="COMPRADOR"?"Compromisos por centro de costo":"Ejecución por centro de costo"}</h3>
         </div>
       </div>
       ${d.byCostCenter.map(x=>{
         const p=x.budget?Math.min(100,Math.round((x.committed/x.budget)*100)):0;
         return `<div class="budget-row">
           <div><strong>${x.code}</strong><small>${x.name}</small></div>
           <div class="progress"><span style="width:${p}%"></span></div>
           <strong>${p}%</strong>
         </div>`;
       }).join("")}
     </div>
   </div>
 `;
}
function tableRequests(rows){
 if(!rows?.length) return `<div class="empty">Sin solicitudes</div>`;
 return `<div class="table"><table><thead><tr><th>Solicitud</th><th>Solicitante</th><th>Proyecto</th><th>Valor</th><th>Estado</th><th></th></tr></thead><tbody>
 ${rows.map(r=>`<tr><td><strong>${r.code}</strong></td><td>${r.requester}</td><td>${r.project||"-"}<div class="muted">${r.client||""}</div></td><td class="money">${money(r.amount)}</td><td>${badge(r.status)}</td><td>${can("requests","view")?`<button class="secondary" onclick="requestDetail(${r.id})">Ver</button>`:"-"}</td></tr>`).join("")}
 </tbody></table></div>`;
}

async function requests(){
 title("Solicitudes de compra");
 const rows=await api("/api/requests");
 $("#content").innerHTML=`
 <div class="card">
   <div class="section-header">
     <div><span class="section-kicker">FLOW</span><h3>Solicitudes</h3></div>
     ${can("requests","create")?`<button class="primary" onclick="requestModal()">+ Nueva solicitud</button>`:""}
   </div>
   <div class="table"><table><thead><tr><th>ID</th><th>Solicitante</th><th>Área</th><th>Proyecto / Cliente</th><th>Centro de costo</th><th>Valor</th><th>Estado</th><th>Cotizaciones</th><th>Soporte</th><th></th></tr></thead><tbody>
   ${rows.map(r=>`<tr><td><strong>${r.code}</strong></td><td>${r.requester}</td><td>${r.area}</td><td>${r.project||"-"}<div class="muted">${r.client||""}</div></td><td>${r.cost_center||"-"}</td><td class="money">${money(r.amount)}</td><td>${badge(r.status)}</td><td><strong>${r.quote_count||0}</strong></td><td>${r.attachment?`<a href="/uploads/${r.attachment}" target="_blank">Ver</a>`:"-"}</td><td><div class="actions"><button class="secondary" onclick="requestDetail(${r.id})">Detalle</button>${isAdmin()?`<button class="danger delete-admin" onclick="deleteRequest(${r.id},\`${r.code}\`)">Eliminar</button>`:""}</div></td></tr>`).join("")}
   </tbody></table></div>
 </div>`;
}
window.requestDetail=async id=>{
 const d=await api(`/api/requests/${id}`);
 const r=d.request;
 openModal(`Solicitud ${r.code}`,`
 <div class="formgrid">
   <div class="field"><label>Solicitante</label><div>${r.requester}</div></div>
   <div class="field"><label>Área</label><div>${r.area}</div></div>
   <div class="field"><label>Proveedor</label><div>${r.supplier||"-"}</div></div>
   <div class="field"><label>Valor</label><div class="money">${money(r.amount)}</div></div>
   <div class="field"><label>Centro de costo</label><div>${r.cost_center||"-"} ${r.cost_center_name||""}</div></div>
   <div class="field"><label>Proyecto / cliente</label><div>${r.project||"-"} ${r.client?`· ${r.client}`:""}</div></div>
   <div class="field full"><label>Concepto</label><div>${r.concept}</div></div>
   <div class="field full"><label>Detalle</label><div>${r.detail||"-"}</div></div>
   ${r.attachment?`<div class="field full"><label>Soporte general</label><a href="/uploads/${r.attachment}" target="_blank">Abrir archivo adjunto</a></div>`:""}
 </div>
 <div class="quotes-section">
   <div class="section-header quote-head">
     <div><span class="section-kicker">PROVEEDORES</span><h3>Cotizaciones adjuntas</h3></div>
     ${can("requests","edit")?`<button class="primary" onclick="quoteModal(${r.id},'${r.code}')">+ Subir cotización</button>`:""}
   </div>
   <div class="quotes-grid">
     ${(d.quotes||[]).length?(d.quotes||[]).map(q=>`
       <div class="quote-card">
         <div class="quote-card-top"><div><strong>${q.supplier_name}</strong><div class="muted">${q.original_name||"Cotización"}</div></div>${q.amount?`<span class="quote-amount">${money(q.amount)}</span>`:""}</div>
         ${q.notes?`<div class="quote-notes">${q.notes}</div>`:""}
         <div class="quote-actions"><a class="secondary" href="/uploads/${q.attachment}" target="_blank">Abrir archivo</a>${isAdmin()?`<button class="danger delete-admin" onclick="deleteQuote(${r.id},${q.id},'${r.code}')">Eliminar</button>`:""}</div>
         <small class="muted">Subido por ${q.uploaded_by_name||"Usuario"}</small>
       </div>`).join(""):`<div class="empty-quotes">Aún no hay cotizaciones de proveedores cargadas.</div>`}
   </div>
 </div>
 <h3 style="margin-top:22px">Ruta de aprobación</h3>
 <div class="timeline">${d.steps.map(s=>`
   <div class="step"><span class="dot ${s.status==="APROBADA"?"ok":s.status==="RECHAZADA"?"no":""}"></span>
   <div><strong>${s.step_order}. ${s.level}</strong><div class="muted">${s.status}${s.approver?` · ${s.approver}`:""}${s.comment?` · ${s.comment}`:""}</div></div></div>`).join("")}</div>
 ${r.rejection_reason?`<div class="notice" style="margin-top:14px"><strong>Motivo de rechazo:</strong> ${r.rejection_reason}</div>`:""}
 `);
};

async function approvals(){
 title("Aprobaciones multinivel");
 const rows=await api("/api/approvals/pending");
 $("#content").innerHTML=`
 <div class="card">
   <div class="section-header">
     <div><span class="section-kicker">APPROVAL DESK</span><h3>Pendientes por aprobar</h3></div>
     <div class="pill-compact">${rows.length} pendiente(s)</div>
   </div>
   ${!rows.length?`<div class="empty">No hay solicitudes pendientes para tu nivel.</div>`:`
   <div class="table"><table><thead><tr><th>Solicitud</th><th>Solicitante</th><th>Concepto</th><th>Valor</th><th>Nivel actual</th><th>Acciones</th></tr></thead><tbody>
   ${rows.map(r=>`<tr><td><strong>${r.code}</strong></td><td>${r.requester}</td><td>${r.concept}</td><td class="money">${money(r.amount)}</td><td>${r.level}</td><td class="actions">${can("approvals","approve")?`<button class="success" onclick="approveReq(${r.id})">Aprobar</button><button class="danger" onclick="rejectReq(${r.id})">Rechazar</button>`:""}<button class="secondary" onclick="requestDetail(${r.id})">Ver</button></td></tr>`).join("")}
   </tbody></table></div>`}
 </div>`;
}
window.approveReq=async id=>{
 const comment=prompt("Comentario de aprobación (opcional):")||"";
 try{
   const r=await api(`/api/approvals/${id}/approve`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({comment})});
   toast(r.completed?"Solicitud aprobada completamente":`Aprobada. Sigue ${r.nextLevel}`);
   await refreshNotif(); approvals();
 }catch(e){toast(e.message)}
};
window.rejectReq=async id=>{
 const reason=prompt("Motivo del rechazo:");
 if(!reason) return;
 try{
   await api(`/api/approvals/${id}/reject`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})});
   toast("Solicitud rechazada");
   await refreshNotif(); approvals();
 }catch(e){toast(e.message)}
};

async function orders(){
 title("Órdenes de compra");
 const reqs=(await api("/api/requests")).filter(r=>r.status==="APROBADA");
 const ord=await api("/api/orders");
 $("#content").innerHTML=`
 <div class="card" style="margin-bottom:16px">
   <div class="section-header"><div><span class="section-kicker">PROCUREMENT</span><h3>Listas para generar OC</h3></div></div>
   ${!reqs.length?`<div class="empty">No hay solicitudes completamente aprobadas pendientes de OC.</div>`:`
   <div class="table"><table><thead><tr><th>Solicitud</th><th>Concepto</th><th>Proveedor</th><th>Valor</th><th></th></tr></thead><tbody>
   ${reqs.map(r=>`<tr><td>${r.code}</td><td>${r.concept}</td><td>${r.supplier||"-"}</td><td class="money">${money(r.amount)}</td><td>${can("orders","create")?`<button class="primary" onclick="makePO(${r.id})">Generar OC</button>`:"-"}</td></tr>`).join("")}
   </tbody></table></div>`}
 </div>
 <div class="card">
   <div class="section-header"><div><span class="section-kicker">PURCHASE ORDERS</span><h3>Órdenes emitidas</h3></div></div>
   ${!ord.length?`<div class="empty">Sin órdenes emitidas</div>`:`
   <div class="table"><table><thead><tr><th>OC</th><th>Solicitud</th><th>Proveedor</th><th>Valor</th><th>PDF</th></tr></thead><tbody>
   ${ord.map(o=>`<tr><td><strong>${o.code}</strong></td><td>${o.request_code}</td><td>${o.supplier||"-"}</td><td class="money">${money(o.amount)}</td><td><div class="actions"><a href="/api/orders/${o.id}/pdf" target="_blank">Abrir PDF</a>${isAdmin()?`<button class="danger delete-admin" onclick="deleteOrder(${o.id},\`${o.code}\`)">Eliminar</button>`:""}</div></td></tr>`).join("")}
   </tbody></table></div>`}
 </div>`;
}
window.makePO=async id=>{try{const r=await api(`/api/orders/${id}`,{method:"POST"});toast(`${r.code} generada`);orders()}catch(e){toast(e.message)}};

async function invoices(){
 title("Facturación y pagos");
 const inv=await api("/api/invoices");
 const ord=await api("/api/orders");
 $("#content").innerHTML=`
 <div class="card">
   <div class="section-header">
     <div><span class="section-kicker">FINANCE CONTROL</span><h3>Facturas</h3></div>
     ${can("invoices","create")?`<button class="primary" onclick='invoiceModal(${JSON.stringify(ord).replaceAll("'","&#39;")})'>+ Registrar factura</button>`:""}
   </div>
   ${!inv.length?`<div class="empty">No hay facturas registradas.</div>`:`
   <div class="table"><table><thead><tr><th>Factura</th><th>OC</th><th>Proveedor</th><th>Vence</th><th>Valor</th><th>Estado</th><th>Soporte</th><th>Acción</th></tr></thead><tbody>
   ${inv.map(i=>`<tr><td><strong>${i.invoice_number}</strong><div class="muted">${i.invoice_date||""}</div></td><td>${i.po_code}</td><td>${i.supplier||"-"}</td><td>${i.due_date||"-"}</td><td class="money">${money(i.amount)}</td><td>${badge(i.status)}</td><td>${i.attachment?`<a href="/uploads/${i.attachment}" target="_blank">Ver</a>`:"-"}</td><td>${can("invoices","edit")?`<select onchange="invoiceStatus(${i.id},this.value)"><option value="">Cambiar...</option><option value="RADICADA">RADICADA</option><option value="APROBADA">APROBADA</option><option value="PAGADA">PAGADA</option></select>`:""}${isAdmin()?`<button class="danger delete-admin" onclick="deleteInvoice(${i.id},\`${i.invoice_number}\`)">Eliminar</button>`:""}</td></tr>`).join("")}
   </tbody></table></div>`}
 </div>`;
}
window.invoiceStatus=async(id,status)=>{if(!status)return;try{await api(`/api/invoices/${id}/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});toast("Estado actualizado");invoices()}catch(e){toast(e.message)}};
window.invoiceModal=ord=>{
 openModal("Registrar factura",`
 <form id="invoiceForm" class="formgrid">
   <div class="field"><label>Orden de compra</label><select name="po_id" required><option value="">Seleccionar</option>${ord.map(o=>`<option value="${o.id}">${o.code} · ${o.supplier||""}</option>`).join("")}</select></div>
   <div class="field"><label>Número de factura</label><input name="invoice_number" required></div>
   <div class="field"><label>Fecha factura</label><input type="date" name="invoice_date"></div>
   <div class="field"><label>Fecha vencimiento</label><input type="date" name="due_date"></div>
   <div class="field"><label>Valor</label><input type="number" name="amount" min="1" required></div>
   <div class="field"><label>Adjunto</label><input type="file" name="attachment"></div>
   <div class="full"><button class="primary">Registrar factura</button></div>
 </form>`);
 $("#invoiceForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/invoices",{method:"POST",body:new FormData(e.target)});$("#modal").classList.add("hidden");toast("Factura registrada");invoices()}catch(err){toast(err.message)}};
};

async function budgets(){
 title("Presupuestos");
 const b=await api("/api/budgets");
 $("#content").innerHTML=`
 <div class="grid2">
   <div class="card">
     <div class="section-header"><div><span class="section-kicker">COST CENTERS</span><h3>Centros de costo</h3></div></div>
     <div class="table"><table><thead><tr><th>Centro</th><th>Presupuesto</th><th>Comprometido</th><th>Disponible</th><th></th></tr></thead><tbody>
     ${b.costCenters.map(x=>`<tr><td><strong>${x.code}</strong><div class="muted">${x.name}</div></td><td>${money(x.budget)}</td><td>${money(x.committed)}</td><td>${money(x.budget-x.committed)}</td><td>${can("budgets","edit")?`<button class="secondary" onclick="editBudget('cost-center',${x.id},${x.budget})">Editar</button>`:""}</td></tr>`).join("")}
     </tbody></table></div>
   </div>
   <div class="card">
     <div class="section-header"><div><span class="section-kicker">PROJECTS</span><h3>Proyectos / clientes</h3></div></div>
     <div class="table"><table><thead><tr><th>Proyecto</th><th>Presupuesto</th><th>Comprometido</th><th>Disponible</th><th></th></tr></thead><tbody>
     ${b.projects.map(x=>`<tr><td><strong>${x.name}</strong><div class="muted">${x.client}</div></td><td>${money(x.budget)}</td><td>${money(x.committed)}</td><td>${money(x.budget-x.committed)}</td><td>${can("budgets","edit")?`<button class="secondary" onclick="editBudget('project',${x.id},${x.budget})">Editar</button>`:""}</td></tr>`).join("")}
     </tbody></table></div>
   </div>
 </div>`;
}
window.editBudget=async(type,id,currentValue)=>{
 const v=prompt("Nuevo presupuesto:",currentValue);
 if(v===null) return;
 try{
   await api(`/api/budgets/${type}/${id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({budget:Number(v)})});
   toast("Presupuesto actualizado");
   budgets();
 }catch(e){toast(e.message)}
};

async function suppliers(){
 title("Proveedores");
 const rows=await api("/api/suppliers");
 $("#content").innerHTML=`
 <div class="card">
   <div class="section-header">
     <div><span class="section-kicker">PARTNER NETWORK</span><h3>Proveedores</h3></div>
     ${can("suppliers","create")?`<button class="primary" onclick="supplierModal()">+ Nuevo proveedor</button>`:""}
   </div>
   <div class="table"><table><thead><tr><th>Proveedor</th><th>NIT</th><th>Ciudad</th><th>Email</th><th>Estado</th><th></th></tr></thead><tbody>
   ${rows.map(s=>`<tr><td><strong>${s.name}</strong></td><td>${s.nit||"-"}</td><td>${s.city||"-"}</td><td>${s.email||"-"}</td><td>${s.status}</td><td>${isAdmin()?`<button class="danger delete-admin" onclick="deleteSupplier(${s.id},\`${s.name.replaceAll("`","")}\`)">Eliminar</button>`:""}</td></tr>`).join("")}
   </tbody></table></div>
 </div>`;
}
window.supplierModal=()=>{
 openModal("Nuevo proveedor",`
 <form id="supplierForm" class="formgrid">
   <div class="field"><label>Razón social</label><input name="name" required></div>
   <div class="field"><label>NIT</label><input name="nit"></div>
   <div class="field"><label>Ciudad</label><input name="city"></div>
   <div class="field"><label>Email</label><input name="email" type="email"></div>
   <div class="full"><button class="primary">Guardar</button></div>
 </form>`);
 $("#supplierForm").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api("/api/suppliers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)});$("#modal").classList.add("hidden");toast("Proveedor creado");options=await api("/api/options");suppliers()}catch(err){toast(err.message)}}
};

async function users(){
 title("Usuarios");
 const rows=await api("/api/users");
 $("#content").innerHTML=`
 <div class="card">
   <div class="section-header">
     <div><span class="section-kicker">IDENTITY & ROLES</span><h3>Usuarios</h3></div>
     ${can("users","create")?`<button class="primary" onclick="userModal()">+ Nuevo usuario</button>`:""}
   </div>
   <div class="table"><table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Nivel</th><th>Estado</th><th></th></tr></thead><tbody>
   ${rows.map(u=>`<tr><td><strong>${u.name}</strong></td><td>${u.email}</td><td>${u.role}</td><td>${u.approval_level||"-"}</td><td>${u.active?badge("ACTIVO"):badge("INACTIVO")}</td><td><div class="actions">${can("users","edit")?`<button class="secondary" onclick='userEditModal(${JSON.stringify(u).replaceAll("'","&#39;")})'>Editar</button>`:""}${isAdmin()?`<button class="danger delete-admin" onclick="deleteUser(${u.id},\`${u.name.replaceAll("`","")}\`)">Eliminar</button>`:""}</div></td></tr>`).join("")}
   </tbody></table></div>
 </div>`;
}
window.userModal=()=>{
 openModal("Nuevo usuario",`
 <form id="userForm" class="formgrid">
   <div class="field"><label>Nombre</label><input name="name" required></div>
   <div class="field"><label>Email</label><input name="email" type="email" required></div>
   <div class="field"><label>Contraseña</label><input name="password" required></div>
   <div class="field"><label>Rol</label><select name="role"><option>ADMIN</option><option>COMPRADOR</option><option>APROBADOR</option></select></div>
   <div class="field full"><label>Nivel aprobador (solo si aplica)</label><select name="approval_level"><option value="">No aplica</option><option>COORDINACION</option><option>DIRECCION</option><option>GERENCIA</option></select></div>
   <div class="full"><button class="primary">Crear usuario</button></div>
 </form>`);
 $("#userForm").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api("/api/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)});$("#modal").classList.add("hidden");toast("Usuario creado");users()}catch(err){toast(err.message)}}
};
window.userEditModal=(u)=>{
 openModal(`Editar usuario · ${u.name}`,`
 <form id="userEditForm" class="formgrid">
   <div class="field"><label>Nombre</label><input name="name" value="${u.name||""}" required></div>
   <div class="field"><label>Email</label><input name="email" type="email" value="${u.email||""}" required></div>
   <div class="field"><label>Rol</label><select name="role">
      <option value="ADMIN" ${u.role==="ADMIN"?"selected":""}>ADMIN</option>
      <option value="COMPRADOR" ${u.role==="COMPRADOR"?"selected":""}>COMPRADOR</option>
      <option value="APROBADOR" ${u.role==="APROBADOR"?"selected":""}>APROBADOR</option>
   </select></div>
   <div class="field"><label>Estado</label><select name="active">
      <option value="1" ${u.active?"selected":""}>Activo</option>
      <option value="0" ${!u.active?"selected":""}>Inactivo</option>
   </select></div>
   <div class="field"><label>Nivel aprobador</label><select name="approval_level">
      <option value="" ${!u.approval_level?"selected":""}>No aplica</option>
      <option value="COORDINACION" ${u.approval_level==="COORDINACION"?"selected":""}>COORDINACION</option>
      <option value="DIRECCION" ${u.approval_level==="DIRECCION"?"selected":""}>DIRECCION</option>
      <option value="GERENCIA" ${u.approval_level==="GERENCIA"?"selected":""}>GERENCIA</option>
   </select></div>
   <div class="field"><label>Nueva contraseña (opcional)</label><input name="password" placeholder="Dejar en blanco para conservarla"></div>
   <div class="full"><button class="primary">Guardar cambios</button></div>
 </form>`);
 $("#userEditForm").onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.active=Number(o.active);try{await api(`/api/users/${u.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)});$("#modal").classList.add("hidden");toast("Usuario actualizado");users()}catch(err){toast(err.message)}}
};

async function inventory(){
 title("Inventarios");
 const [summary,rows]=await Promise.all([api("/api/inventory/summary"),api("/api/inventory")]);
 const t={};summary.byType.forEach(x=>t[x.asset_type]=x);
 const canWrite=can("inventory","create")||can("inventory","edit");
 $("#content").innerHTML=`
 <div class="kpis">${["ACTIVO_FIJO","ACTIVO_TECNOLOGIA","ACTIVO_INFORMACION","ACTIVO_CIRCULANTE"].map(type=>`<div class="kpi"><small>${assetTypeLabels[type]}</small><strong>${t[type]?.items||0}</strong><div class="note">${money(t[type]?.value||0)} · ${t[type]?.quantity||0} unidad(es)</div></div>`).join("")}</div>
 <div class="grid2" style="margin-bottom:16px">
   <div class="card"><h3>Resumen del inventario</h3><div class="inventory-summary"><div><span>Activos registrados</span><strong>${summary.totalItems}</strong></div><div><span>Valor inventario</span><strong>${money(summary.totalValue)}</strong></div><div><span>Asignados / en uso</span><strong>${summary.assigned}</strong></div></div></div>
   <div class="card"><h3>Control patrimonial</h3><p class="muted">Activos fijos, tecnología, información y activos circulantes en una sola trazabilidad.</p>${can("inventory","create")?`<button class="primary" onclick="inventoryEntryModal()">+ Ingreso de inventario</button>`:""}</div>
 </div>
 <div class="card">
   <div class="inventory-head"><div><span class="eyebrow">CONTROL DE ACTIVOS</span><h3>Inventario general</h3></div>${can("inventory","create")?`<button class="primary" onclick="inventoryEntryModal()">+ Nuevo ingreso</button>`:""}</div>
   <div class="toolbar">
     <input id="inventorySearch" placeholder="Buscar activo, código, serial..." oninput="filterInventory()">
     <select id="inventoryTypeFilter" onchange="filterInventory()"><option value="">Todos los tipos</option><option value="ACTIVO_FIJO">Activo fijo</option><option value="ACTIVO_TECNOLOGIA">Activo de tecnología</option><option value="ACTIVO_INFORMACION">Activo de información</option><option value="ACTIVO_CIRCULANTE">Activo circulante</option></select>
     <select id="inventoryStatusFilter" onchange="filterInventory()"><option value="">Todos los estados</option><option>DISPONIBLE</option><option>ASIGNADO</option><option>EN_USO</option><option>MANTENIMIENTO</option><option>AGOTADO</option><option>BAJA</option></select>
   </div>
   <div id="inventoryTable">${inventoryTable(rows,canWrite)}</div>
 </div>`;
 window.__inventoryRows=rows;
}
function inventoryTable(rows,canWrite){
 if(!rows.length) return `<div class="empty">No hay activos registrados.</div>`;
 return `<div class="table"><table><thead><tr><th>Código</th><th>Tipo</th><th>Activo</th><th>Serial / Marca</th><th>Cantidad</th><th>Ubicación</th><th>Responsable</th><th>Valor</th><th>Estado</th><th></th></tr></thead><tbody>
 ${rows.map(i=>`<tr><td><strong>${i.asset_code}</strong><div class="muted">${i.entry_date||""}</div></td><td><span class="asset-type ${i.asset_type}">${assetTypeLabels[i.asset_type]||i.asset_type}</span></td><td><strong>${i.name}</strong><div class="muted">${i.description||""}</div></td><td>${i.serial||"-"}<div class="muted">${[i.brand,i.model].filter(Boolean).join(" · ")}</div></td><td>${i.quantity} ${i.unit||"UND"}</td><td>${i.location||"-"}</td><td>${i.responsible||"-"}</td><td class="money">${money(i.total_value)}</td><td>${badge(i.status)}</td><td><button class="secondary" onclick="inventoryDetail(${i.id},${canWrite?1:0})">Ver</button></td></tr>`).join("")}
 </tbody></table></div>`;
}
window.filterInventory=()=>{
 const rows=window.__inventoryRows||[];
 const q=($("#inventorySearch")?.value||"").toLowerCase();
 const type=$("#inventoryTypeFilter")?.value||"";
 const status=$("#inventoryStatusFilter")?.value||"";
 const canWrite=can("inventory","create")||can("inventory","edit");
 const filtered=rows.filter(i=>{
   const text=`${i.asset_code} ${i.name} ${i.description||""} ${i.serial||""} ${i.brand||""} ${i.model||""} ${i.location||""} ${i.responsible||""}`.toLowerCase();
   return text.includes(q)&&(!type||i.asset_type===type)&&(!status||i.status===status)
 });
 $("#inventoryTable").innerHTML=inventoryTable(filtered,canWrite);
};
window.inventoryEntryModal=async()=>{
 openModal("Ingreso de inventario",`
 <form id="inventoryEntryForm" class="formgrid">
   <div class="field"><label>Clasificación del activo</label><select name="asset_type" required><option value="">Seleccionar</option><option value="ACTIVO_FIJO">Activo fijo</option><option value="ACTIVO_TECNOLOGIA">Activo de tecnología</option><option value="ACTIVO_INFORMACION">Activo de información</option><option value="ACTIVO_CIRCULANTE">Activo circulante</option></select></div>
   <div class="field"><label>Nombre del activo</label><input name="name" placeholder="Ej. Portátil Dell Latitude" required></div>
   <div class="field full"><label>Descripción</label><textarea name="description"></textarea></div>
   <div class="field"><label>Cantidad</label><input name="quantity" type="number" min="0" step="0.01" value="1" required></div>
   <div class="field"><label>Unidad</label><select name="unit"><option>UND</option><option>CAJA</option><option>PAQUETE</option><option>LICENCIA</option><option>ARCHIVO</option><option>LOTE</option></select></div>
   <div class="field"><label>Costo unitario</label><input name="unit_cost" type="number" min="0" value="0"></div>
   <div class="field"><label>Proveedor</label><select name="supplier_id"><option value="">Sin proveedor</option>${options.suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select></div>
   <div class="field"><label>Marca</label><input name="brand"></div>
   <div class="field"><label>Modelo</label><input name="model"></div>
   <div class="field"><label>Serial / identificación</label><input name="serial"></div>
   <div class="field"><label>Factura / documento compra</label><input name="invoice_ref"></div>
   <div class="field"><label>Ubicación</label><input name="location" placeholder="Ej. Bodega Bogotá"></div>
   <div class="field"><label>Responsable / custodio</label><input name="responsible"></div>
   <div class="field"><label>Estado inicial</label><select name="status"><option>DISPONIBLE</option><option>ASIGNADO</option><option>EN_USO</option><option>MANTENIMIENTO</option></select></div>
   <div class="field"><label>Fecha de ingreso</label><input name="entry_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
   <div class="field"><label>Fecha de compra</label><input name="purchase_date" type="date"></div>
   <div class="field"><label>Soporte / factura / foto</label><input name="attachment" type="file"></div>
   <div class="field full"><label>Observaciones</label><textarea name="notes"></textarea></div>
   <div class="full"><button class="primary">Registrar ingreso</button></div>
 </form>`);
 $("#inventoryEntryForm").onsubmit=async e=>{e.preventDefault();try{const r=await api("/api/inventory",{method:"POST",body:new FormData(e.target)});$("#modal").classList.add("hidden");toast(`${r.asset_code} ingresado al inventario`);inventory()}catch(err){toast(err.message)}}
};
window.inventoryDetail=async(id,canWrite)=>{
 const d=await api(`/api/inventory/${id}`);
 const i=d.item;
 openModal(`${i.asset_code} · ${i.name}`,`
 <div class="formgrid inventory-detail">
   <div class="field"><label>Tipo</label><div>${assetTypeLabels[i.asset_type]}</div></div>
   <div class="field"><label>Estado</label><div>${badge(i.status)}</div></div>
   <div class="field"><label>Cantidad</label><div>${i.quantity} ${i.unit||"UND"}</div></div>
   <div class="field"><label>Valor total</label><div class="money">${money(i.total_value)}</div></div>
   <div class="field"><label>Marca / Modelo</label><div>${[i.brand,i.model].filter(Boolean).join(" · ")||"-"}</div></div>
   <div class="field"><label>Serial</label><div>${i.serial||"-"}</div></div>
   <div class="field"><label>Ubicación</label><div>${i.location||"-"}</div></div>
   <div class="field"><label>Responsable</label><div>${i.responsible||"-"}</div></div>
   <div class="field"><label>Proveedor</label><div>${i.supplier||"-"}</div></div>
   <div class="field"><label>Factura</label><div>${i.invoice_ref||"-"}</div></div>
   <div class="field full"><label>Descripción</label><div>${i.description||"-"}</div></div>
   <div class="field full"><label>Observaciones</label><div>${i.notes||"-"}</div></div>
   ${i.attachment?`<div class="field full"><label>Soporte</label><a href="/uploads/${i.attachment}" target="_blank">Abrir archivo adjunto</a></div>`:""}
 </div>
 ${can("inventory","edit")?`<div class="inventory-admin-actions" style="margin:20px 0 10px"><button class="primary" onclick="inventoryMovementModal(${i.id},'${i.asset_code}')">+ Registrar movimiento</button>${isAdmin()?`<button class="danger delete-admin" onclick="deleteInventory(${i.id},\`${i.asset_code}\`)">Eliminar activo</button>`:""}</div>`:""}
 <h3>Historial de movimientos</h3>
 ${!d.movements.length?`<div class="empty">Sin movimientos.</div>`:`<div class="table"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Cantidad</th><th>Origen</th><th>Destino</th><th>Responsable</th><th>Usuario</th></tr></thead><tbody>${d.movements.map(m=>`<tr><td>${m.created_at}</td><td><strong>${m.movement_type}</strong></td><td>${m.quantity}</td><td>${m.from_location||"-"}</td><td>${m.to_location||"-"}</td><td>${m.responsible||"-"}</td><td>${m.created_by_name||"-"}</td></tr>`).join("")}</tbody></table></div>`}`);
};
window.inventoryMovementModal=(id,code)=>{
 openModal(`Movimiento de inventario · ${code}`,`
 <form id="inventoryMovementForm" class="formgrid">
   <div class="field"><label>Tipo de movimiento</label><select name="movement_type" required><option value="">Seleccionar</option><option value="SALIDA">Salida</option><option value="ASIGNACION">Asignación</option><option value="DEVOLUCION">Devolución</option><option value="TRASLADO">Traslado</option><option value="AJUSTE">Ajuste de cantidad</option><option value="BAJA">Baja del activo</option></select></div>
   <div class="field"><label>Cantidad</label><input name="quantity" type="number" min="0.01" step="0.01" value="1" required></div>
   <div class="field"><label>Nueva ubicación / destino</label><input name="to_location"></div>
   <div class="field"><label>Responsable / custodio</label><input name="responsible"></div>
   <div class="field full"><label>Observaciones</label><textarea name="notes"></textarea></div>
   <div class="full"><button class="primary">Guardar movimiento</button></div>
 </form>`);
 $("#inventoryMovementForm").onsubmit=async e=>{e.preventDefault();const obj=Object.fromEntries(new FormData(e.target));try{await api(`/api/inventory/${id}/movement`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(obj)});$("#modal").classList.add("hidden");toast("Movimiento registrado");inventory()}catch(err){toast(err.message)}}
};

async function accessControl(){
 title("Control de accesos");
 const d=await api("/api/access/modules");
 const rows=d.rows;
 const roles=d.roles;
 const moduleLabels={
   dashboard:"Overview",
   requests:"Solicitudes",
   approvals:"Aprobaciones",
   orders:"Órdenes de compra",
   invoices:"Facturación y pagos",
   inventory:"Inventarios",
   budgets:"Presupuestos",
   suppliers:"Proveedores",
   users:"Usuarios",
   access:"Control de accesos"
 };
 const grouped={};
 rows.forEach(r=>{grouped[`${r.role}_${r.module}`]=r});
 $("#content").innerHTML=`
   <div class="role-cards">
     <div class="role-card"><span class="section-kicker">ADMIN</span><h3>Control total</h3><p>Administra usuarios, permisos, presupuesto y configuración del hub.</p></div>
     <div class="role-card"><span class="section-kicker">COMPRADOR</span><h3>Operación de compras</h3><p>Solicitud, órdenes, facturas, inventario y consulta operativa.</p></div>
     <div class="role-card"><span class="section-kicker">APROBADOR</span><h3>Flujo de aprobación</h3><p>Visibilidad de solicitudes, presupuesto y decisiones de aprobación.</p></div>
   </div>
   <div class="card">
     <div class="section-header">
       <div><span class="section-kicker">ROLE BASED ACCESS</span><h3>Matriz de permisos por rol</h3></div>
       <div class="pill-compact">Administra vistas y acciones</div>
     </div>
     <div class="table permission-table">
       <table>
         <thead>
           <tr>
             <th>Rol</th><th>Módulo</th><th>Ver</th><th>Crear</th><th>Editar</th><th>Aprobar</th><th>Gestionar</th>
           </tr>
         </thead>
         <tbody>
           ${roles.map(role=>d.modules.map(module=>{
             const item=grouped[`${role}_${module}`]||{};
             return `<tr>
               <td><strong>${role}</strong></td>
               <td>${moduleLabels[module]||module}</td>
               ${["can_view","can_create","can_edit","can_approve","can_manage"].map(field=>`
                 <td><label class="switch"><input type="checkbox" ${item[field]?"checked":""} onchange="saveAccess('${role}','${module}','${field}',this.checked)"><span></span></label></td>
               `).join("")}
             </tr>`;
           }).join("")).join("")}
         </tbody>
       </table>
     </div>
   </div>`;
}
window.saveAccess=async(role,module,field,value)=>{
  try{
    await api("/api/access/modules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role,module,field,value:value?1:0})});
    toast("Permiso actualizado");
  }catch(err){toast(err.message)}
};

async function requestModal(){
 if(!options) options=await api("/api/options");
 openModal("Nueva solicitud de compra",`
 <form id="requestForm" class="formgrid">
   <div class="field"><label>Área</label><select name="area" required><option>IMT / Eventos</option><option>Operaciones</option><option>Marketing</option><option>Comercial</option><option>Administración</option></select></div>
   <div class="field"><label>Valor estimado</label><input type="number" min="1" name="amount" required></div>
   <div class="field full"><label>Concepto</label><input name="concept" required></div>
   <div class="field"><label>Proveedor</label><select name="supplier_id"><option value="">Sin definir</option>${options.suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select></div>
   <div class="field"><label>Centro de costo</label><select name="cost_center_id" required><option value="">Seleccionar</option>${options.costCenters.map(c=>`<option value="${c.id}">${c.code} · ${c.name}</option>`).join("")}</select></div>
   <div class="field full"><label>Proyecto / Cliente</label><select name="project_id"><option value="">Seleccionar</option>${options.projects.map(p=>`<option value="${p.id}">${p.name} · ${p.client}</option>`).join("")}</select></div>
   <div class="field full"><label>Detalle / justificación</label><textarea name="detail"></textarea></div>
   <div class="field full"><label>Soporte general de la solicitud</label><input type="file" name="attachment" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"></div>
   <div class="field full quote-builder">
     <div class="quote-builder-head"><div><label>Cotizaciones de proveedores</label><small class="muted">Puedes adjuntar hasta 5 cotizaciones.</small></div><button type="button" class="secondary" id="addQuoteBtn">+ Agregar cotización</button></div>
     <div id="quoteRows"></div>
   </div>
   <div class="full"><button class="primary">Enviar solicitud</button></div>
 </form>`);
 let quoteIndex=0;
 const addQuoteRow=()=>{
   if(quoteIndex>=5){toast("Máximo 5 cotizaciones");return;}
   const idx=quoteIndex++;
   const row=document.createElement("div");
   row.className="quote-upload-row";
   row.innerHTML=`<div class="quote-upload-title"><strong>Cotización ${idx+1}</strong><button type="button" class="link-btn" onclick="this.closest('.quote-upload-row').remove()">Quitar</button></div><div class="formgrid"><div class="field"><label>Proveedor</label><input name="quote_supplier_${idx}" placeholder="Nombre del proveedor" required></div><div class="field"><label>Valor cotizado</label><input type="number" min="0" name="quote_amount_${idx}" placeholder="0"></div><div class="field full"><label>Archivo</label><input type="file" name="quote_file_${idx}" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" required></div><div class="field full"><label>Notas</label><input name="quote_notes_${idx}" placeholder="Opcional: vigencia, condiciones, observaciones"></div></div>`;
   $("#quoteRows").appendChild(row);
 };
 $("#addQuoteBtn").onclick=addQuoteRow;
 addQuoteRow();
 $("#requestForm").onsubmit=async e=>{e.preventDefault();try{const r=await api("/api/requests",{method:"POST",body:new FormData(e.target)});$("#modal").classList.add("hidden");toast(`${r.code} creada y enviada a aprobación`);await refreshNotif();current="requests";renderNav();render()}catch(err){toast(err.message)}};
}


window.quoteModal=(requestId,code)=>{
 openModal(`Subir cotización · ${code}`,`
 <form id="quoteForm" class="formgrid">
   <div class="field"><label>Proveedor</label><input name="supplier_name" required></div>
   <div class="field"><label>Valor cotizado</label><input type="number" min="0" name="amount"></div>
   <div class="field full"><label>Archivo de cotización</label><input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" required></div>
   <div class="field full"><label>Notas / condiciones</label><textarea name="notes" placeholder="Vigencia, forma de pago, tiempos de entrega, etc."></textarea></div>
   <div class="full"><button class="primary">Guardar cotización</button></div>
 </form>`);
 $("#quoteForm").onsubmit=async e=>{e.preventDefault();try{await api(`/api/requests/${requestId}/quotes`,{method:"POST",body:new FormData(e.target)});toast("Cotización cargada");requestDetail(requestId)}catch(err){toast(err.message)}};
};
window.deleteQuote=(requestId,quoteId,code)=>confirmAdminDelete(
  `¿Eliminar esta cotización de la solicitud ${code}?`,
  `/api/requests/${requestId}/quotes/${quoteId}`,
  ()=>requestDetail(requestId)
);

async function confirmAdminDelete(message,endpoint,onDone){
  if(!isAdmin()){
    toast("Solo el administrador puede eliminar registros");
    return;
  }
  if(!confirm(message)) return;
  try{
    await api(endpoint,{method:"DELETE"});
    toast("Registro eliminado");
    if(typeof onDone==="function") await onDone();
  }catch(err){
    toast(err.message);
  }
}
window.deleteRequest=(id,code)=>confirmAdminDelete(
  `¿Eliminar la solicitud ${code}? Esta acción no se puede deshacer.`,
  `/api/requests/${id}`,
  requests
);
window.deleteSupplier=(id,name)=>confirmAdminDelete(
  `¿Eliminar el proveedor "${name}"?`,
  `/api/suppliers/${id}`,
  async()=>{options=await api("/api/options");suppliers();}
);
window.deleteInventory=(id,code)=>confirmAdminDelete(
  `¿Eliminar el activo ${code} y su historial de movimientos?`,
  `/api/inventory/${id}`,
  async()=>{$("#modal").classList.add("hidden");inventory();}
);
window.deleteInvoice=(id,number)=>confirmAdminDelete(
  `¿Eliminar la factura ${number}?`,
  `/api/invoices/${id}`,
  invoices
);
window.deleteUser=(id,name)=>confirmAdminDelete(
  `¿Eliminar/desactivar el usuario "${name}"?`,
  `/api/users/${id}`,
  users
);
window.deleteOrder=(id,code)=>confirmAdminDelete(
  `¿Eliminar la orden de compra ${code}? La solicitud volverá al estado APROBADA.`,
  `/api/orders/${id}`,
  orders
);


async function notificationsModal(){
 const n=await api("/api/notifications");
 openModal("Notificaciones",n.length?n.map(x=>`<div class="notice ${x.is_read?"":"unread"}"><strong>${x.title}</strong><div class="muted">${x.message}</div><div class="muted">${x.created_at}</div>${!x.is_read?`<button class="secondary" style="margin-top:7px" onclick="readNotif(${x.id})">Marcar leída</button>`:""}</div>`).join(""):`<div class="empty">No tienes notificaciones.</div>`);
}
window.readNotif=async id=>{await api(`/api/notifications/${id}/read`,{method:"POST"});await refreshNotif();notificationsModal()};
function openModal(t,b){$("#modalTitle").textContent=t;$("#modalBody").innerHTML=b;$("#modal").classList.remove("hidden")}
boot();
