
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// En local usa la carpeta del proyecto.
// En Render, STORAGE_DIR apunta al disco persistente (/var/data).
const storageRoot = process.env.STORAGE_DIR || __dirname;
const dataDir = path.join(storageRoot, "data");
const uploadsDir = path.join(storageRoot, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, "touch_compras_enterprise.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "touch-enterprise-demo-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true, sameSite: "lax" }
}));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
    cb(null, safe);
  }
});
const upload = multer({ storage });

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','COMPRADOR','APROBADOR')),
      approval_level TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS cost_centers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      budget REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client TEXT NOT NULL,
      budget REAL DEFAULT 0,
      status TEXT DEFAULT 'ACTIVO'
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nit TEXT,
      city TEXT,
      email TEXT,
      status TEXT DEFAULT 'ACTIVO'
    );

    CREATE TABLE IF NOT EXISTS purchase_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      requester_id INTEGER NOT NULL,
      area TEXT NOT NULL,
      concept TEXT NOT NULL,
      detail TEXT,
      supplier_id INTEGER,
      amount REAL NOT NULL,
      cost_center_id INTEGER,
      project_id INTEGER,
      status TEXT DEFAULT 'PENDIENTE',
      attachment TEXT,
      rejection_reason TEXT,
      FOREIGN KEY(requester_id) REFERENCES users(id),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(cost_center_id) REFERENCES cost_centers(id),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS request_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      supplier_name TEXT NOT NULL,
      amount REAL,
      attachment TEXT NOT NULL,
      original_name TEXT,
      notes TEXT,
      uploaded_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
      FOREIGN KEY(uploaded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approval_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      step_order INTEGER NOT NULL,
      level TEXT NOT NULL,
      status TEXT DEFAULT 'PENDIENTE',
      approver_id INTEGER,
      comment TEXT,
      acted_at TEXT,
      FOREIGN KEY(request_id) REFERENCES purchase_requests(id),
      FOREIGN KEY(approver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      request_id INTEGER UNIQUE NOT NULL,
      supplier_id INTEGER,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'EMITIDA',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(request_id) REFERENCES purchase_requests(id),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL,
      invoice_date TEXT,
      due_date TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'RADICADA',
      attachment TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(po_id) REFERENCES purchase_orders(id)
    );


    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_code TEXT UNIQUE NOT NULL,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('ACTIVO_FIJO','ACTIVO_TECNOLOGIA','ACTIVO_INFORMACION','ACTIVO_CIRCULANTE')),
      name TEXT NOT NULL,
      description TEXT,
      quantity REAL DEFAULT 1,
      unit TEXT DEFAULT 'UND',
      unit_cost REAL DEFAULT 0,
      brand TEXT,
      model TEXT,
      serial TEXT,
      location TEXT,
      responsible TEXT,
      status TEXT DEFAULT 'DISPONIBLE',
      purchase_date TEXT,
      entry_date TEXT DEFAULT CURRENT_DATE,
      supplier_id INTEGER,
      invoice_ref TEXT,
      attachment TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('INGRESO','AJUSTE','SALIDA','ASIGNACION','DEVOLUCION','TRASLADO','BAJA')),
      quantity REAL DEFAULT 1,
      from_location TEXT,
      to_location TEXT,
      responsible TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(item_id) REFERENCES inventory_items(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS module_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','COMPRADOR','APROBADOR')),
      module TEXT NOT NULL,
      can_view INTEGER DEFAULT 0,
      can_create INTEGER DEFAULT 0,
      can_edit INTEGER DEFAULT 0,
      can_approve INTEGER DEFAULT 0,
      can_manage INTEGER DEFAULT 0,
      UNIQUE(role,module)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_type TEXT,
      link_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const users = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (!users) {
    const ins = db.prepare("INSERT INTO users(name,email,password_hash,role,approval_level) VALUES (?,?,?,?,?)");
    const adminEmail = process.env.ADMIN_EMAIL || "admin@touchlatam.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "0000";
    ins.run("Administrador Touch",adminEmail,bcrypt.hashSync(adminPassword,10),"ADMIN",null);

    // En desarrollo local conserva perfiles demo.
    if (process.env.NODE_ENV !== "production") {
      const pw = bcrypt.hashSync("0000", 10);
      ins.run("Comprador Touch","compras@touchlatam.com",pw,"COMPRADOR",null);
      ins.run("Aprobador Coordinación","coord@touchlatam.com",pw,"APROBADOR","COORDINACION");
      ins.run("Aprobador Dirección","direccion@touchlatam.com",pw,"APROBADOR","DIRECCION");
      ins.run("Aprobador Gerencia","gerencia@touchlatam.com",pw,"APROBADOR","GERENCIA");
    }
  }

  const cc = db.prepare("SELECT COUNT(*) c FROM cost_centers").get().c;
  if (!cc) {
    const ins = db.prepare("INSERT INTO cost_centers(code,name,budget) VALUES (?,?,?)");
    ins.run("CC-IMT","IMT / Eventos",45000000);
    ins.run("CC-OPS","Operaciones",30000000);
    ins.run("CC-MKT","Marketing",22000000);
    ins.run("CC-COM","Comercial",16000000);
    ins.run("CC-ADM","Administración",12000000);
  }

  const pr = db.prepare("SELECT COUNT(*) c FROM projects").get().c;
  if (!pr) {
    const ins = db.prepare("INSERT INTO projects(name,client,budget,status) VALUES (?,?,?,?)");
    ins.run("Shopping Season","Aleph / Spotify",18000000,"ACTIVO");
    ins.run("DemoFarm 2026","PepsiCo",25000000,"ACTIVO");
    ins.run("Activaciones Smart Fit","Smart Fit",20000000,"ACTIVO");
    ins.run("Operación Retail","Clientes Retail",15000000,"ACTIVO");
  }

  const sp = db.prepare("SELECT COUNT(*) c FROM suppliers").get().c;
  if (!sp) {
    const ins = db.prepare("INSERT INTO suppliers(name,nit,city,email,status) VALUES (?,?,?,?,?)");
    ins.run("Producciones Creativas SAS","901222333-4","Bogotá","comercial@producciones.com","ACTIVO");
    ins.run("Logística Nacional SAS","900444555-6","Medellín","operaciones@logistica.com","ACTIVO");
    ins.run("Tecnología & Experiencias SAS","901777888-9","Bogotá","ventas@tecnologia.com","ACTIVO");
  }

  seedModulePermissions();
}

function auth(req,res,next){
  if(!req.session.user) return res.status(401).json({error:"No autenticado"});
  next();
}
function role(...roles){
  return (req,res,next)=>{
    if(!req.session.user) return res.status(401).json({error:"No autenticado"});
    if(!roles.includes(req.session.user.role)) return res.status(403).json({error:"Sin permisos"});
    next();
  };
}

const MODULES=["dashboard","requests","approvals","orders","invoices","inventory","budgets","suppliers","users","access"];
const DEFAULT_ROLE_PERMISSIONS={
  ADMIN:{
    dashboard:{view:1,create:0,edit:0,approve:0,manage:0},
    requests:{view:1,create:1,edit:1,approve:0,manage:0},
    approvals:{view:1,create:0,edit:0,approve:1,manage:0},
    orders:{view:1,create:1,edit:1,approve:0,manage:0},
    invoices:{view:1,create:1,edit:1,approve:0,manage:0},
    inventory:{view:1,create:1,edit:1,approve:0,manage:0},
    budgets:{view:1,create:0,edit:1,approve:0,manage:0},
    suppliers:{view:1,create:1,edit:1,approve:0,manage:0},
    users:{view:1,create:1,edit:1,approve:0,manage:1},
    access:{view:1,create:0,edit:1,approve:0,manage:1}
  },
  COMPRADOR:{
    dashboard:{view:1,create:0,edit:0,approve:0,manage:0},
    requests:{view:1,create:1,edit:1,approve:0,manage:0},
    approvals:{view:0,create:0,edit:0,approve:0,manage:0},
    orders:{view:1,create:1,edit:1,approve:0,manage:0},
    invoices:{view:1,create:1,edit:1,approve:0,manage:0},
    inventory:{view:1,create:1,edit:1,approve:0,manage:0},
    budgets:{view:1,create:0,edit:0,approve:0,manage:0},
    suppliers:{view:1,create:0,edit:0,approve:0,manage:0},
    users:{view:0,create:0,edit:0,approve:0,manage:0},
    access:{view:0,create:0,edit:0,approve:0,manage:0}
  },
  APROBADOR:{
    dashboard:{view:1,create:0,edit:0,approve:0,manage:0},
    requests:{view:1,create:0,edit:0,approve:0,manage:0},
    approvals:{view:1,create:0,edit:0,approve:1,manage:0},
    orders:{view:0,create:0,edit:0,approve:0,manage:0},
    invoices:{view:0,create:0,edit:0,approve:0,manage:0},
    inventory:{view:1,create:0,edit:0,approve:0,manage:0},
    budgets:{view:1,create:0,edit:0,approve:0,manage:0},
    suppliers:{view:0,create:0,edit:0,approve:0,manage:0},
    users:{view:0,create:0,edit:0,approve:0,manage:0},
    access:{view:0,create:0,edit:0,approve:0,manage:0}
  }
};

function seedModulePermissions(){
  const count=db.prepare("SELECT COUNT(*) c FROM module_permissions").get().c;
  if(count) return;
  const ins=db.prepare(`
    INSERT INTO module_permissions(role,module,can_view,can_create,can_edit,can_approve,can_manage)
    VALUES (?,?,?,?,?,?,?)
  `);
  for(const roleName of Object.keys(DEFAULT_ROLE_PERMISSIONS)){
    for(const moduleName of MODULES){
      const p=DEFAULT_ROLE_PERMISSIONS[roleName][moduleName]||{};
      ins.run(roleName,moduleName,p.view?1:0,p.create?1:0,p.edit?1:0,p.approve?1:0,p.manage?1:0);
    }
  }
}
function getRolePermissions(roleName){
  const rows=db.prepare(`
    SELECT module,can_view,can_create,can_edit,can_approve,can_manage
    FROM module_permissions
    WHERE role=?
    ORDER BY module
  `).all(roleName);
  const out={};
  rows.forEach(r=>out[r.module]=r);
  return out;
}
function hasAccess(user,moduleName,action="view"){
  if(!user) return false;
  if(user.role==="ADMIN" && moduleName==="access") return true; // evita bloquear al administrador del panel de accesos
  const row=db.prepare(`
    SELECT can_view,can_create,can_edit,can_approve,can_manage
    FROM module_permissions
    WHERE role=? AND module=?
  `).get(user.role,moduleName);
  if(!row) return false;
  const key=`can_${action}`;
  return !!row[key];
}
function access(moduleName,action="view"){
  return (req,res,next)=>{
    if(!req.session.user) return res.status(401).json({error:"No autenticado"});
    if(!hasAccess(req.session.user,moduleName,action)) return res.status(403).json({error:"Sin permisos para este módulo"});
    next();
  };
}

// Inicializar la base únicamente después de cargar la configuración de roles y permisos.
initDB();


function adminOnly(req,res,next){
  if(!req.session.user) return res.status(401).json({error:"No autenticado"});
  if(req.session.user.role!=="ADMIN") return res.status(403).json({error:"Solo el administrador puede eliminar registros"});
  next();
}

function nextCode(prefix,table){
  const row=db.prepare(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`).get();
  return `${prefix}-${String((row?.id||0)+1).padStart(5,"0")}`;
}
function approvalLevels(amount){
  if(amount<=1000000) return ["COORDINACION"];
  if(amount<=5000000) return ["COORDINACION","DIRECCION"];
  return ["COORDINACION","DIRECCION","GERENCIA"];
}

function nextAssetCode(assetType){
  const prefixes={
    ACTIVO_FIJO:"AF",
    ACTIVO_TECNOLOGIA:"AT",
    ACTIVO_INFORMACION:"AI",
    ACTIVO_CIRCULANTE:"AC"
  };
  const prefix=prefixes[assetType] || "INV";
  const row=db.prepare(`
    SELECT asset_code FROM inventory_items
    WHERE asset_type=? ORDER BY id DESC LIMIT 1
  `).get(assetType);
  let next=1;
  if(row?.asset_code){
    const m=String(row.asset_code).match(/(\\d+)$/);
    if(m) next=Number(m[1])+1;
  }
  return `${prefix}-${String(next).padStart(5,"0")}`;
}

function currentPendingStep(requestId){
  return db.prepare(`
    SELECT * FROM approval_steps
    WHERE request_id=? AND status='PENDIENTE'
    ORDER BY step_order ASC LIMIT 1
  `).get(requestId);
}
function createNotification(userId,title,message,linkType=null,linkId=null){
  db.prepare(`
    INSERT INTO notifications(user_id,title,message,link_type,link_id)
    VALUES (?,?,?,?,?)
  `).run(userId,title,message,linkType,linkId);
}
function usersForLevel(level){
  return db.prepare(`
    SELECT * FROM users WHERE active=1 AND role='APROBADOR' AND approval_level=?
  `).all(level);
}
async function maybeSendEmail(to,subject,text){
  const {SMTP_HOST,SMTP_PORT,SMTP_SECURE,SMTP_USER,SMTP_PASS,SMTP_FROM}=process.env;
  if(!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return false;
  try{
    const transporter=nodemailer.createTransport({
      host:SMTP_HOST,
      port:Number(SMTP_PORT||587),
      secure:String(SMTP_SECURE).toLowerCase()==="true",
      auth:{user:SMTP_USER,pass:SMTP_PASS}
    });
    await transporter.sendMail({
      from:SMTP_FROM||SMTP_USER,
      to,subject,text
    });
    return true;
  }catch(e){
    console.error("Email no enviado:",e.message);
    return false;
  }
}
function notifyApproversForStep(requestId,step){
  const request=db.prepare(`
    SELECT pr.code, pr.concept, pr.amount, u.name requester
    FROM purchase_requests pr JOIN users u ON u.id=pr.requester_id
    WHERE pr.id=?
  `).get(requestId);
  const approvers=usersForLevel(step.level);
  for(const a of approvers){
    createNotification(a.id,`Aprobación ${request.code}`,`${request.requester} solicita aprobación de ${request.concept}.`,"REQUEST",requestId);
    maybeSendEmail(a.email,`Touch Compras - ${request.code} pendiente`,`${request.requester} solicita aprobación de ${request.concept} por $${Number(request.amount).toLocaleString("es-CO")}. Nivel: ${step.level}.`);
  }
}

app.post("/api/login",(req,res)=>{
  const {email,password}=req.body;
  const u=db.prepare("SELECT * FROM users WHERE email=? AND active=1").get(email);
  if(!u || !bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:"Credenciales incorrectas"});
  req.session.user={id:u.id,name:u.name,email:u.email,role:u.role,approval_level:u.approval_level};
  res.json(req.session.user);
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json(req.session.user||null));

app.get("/api/options",auth,(req,res)=>{
  res.json({
    suppliers:db.prepare("SELECT * FROM suppliers WHERE status='ACTIVO' ORDER BY name").all(),
    costCenters:db.prepare("SELECT * FROM cost_centers ORDER BY code").all(),
    projects:db.prepare("SELECT * FROM projects WHERE status='ACTIVO' ORDER BY name").all()
  });
});


app.get("/api/access/me",auth,(req,res)=>{
  const permissions=getRolePermissions(req.session.user.role);
  res.json({role:req.session.user.role,permissions});
});

app.get("/api/access/modules",access("access","view"),(req,res)=>{
  const rows=db.prepare(`
    SELECT role,module,can_view,can_create,can_edit,can_approve,can_manage
    FROM module_permissions
    ORDER BY role,module
  `).all();
  res.json({modules:MODULES,roles:["ADMIN","COMPRADOR","APROBADOR"],rows});
});

app.post("/api/access/modules",access("access","manage"),(req,res)=>{
  const {role,module,field,value}=req.body;
  const allowedFields=["can_view","can_create","can_edit","can_approve","can_manage"];
  if(!["ADMIN","COMPRADOR","APROBADOR"].includes(role)) return res.status(400).json({error:"Rol inválido"});
  if(!MODULES.includes(module)) return res.status(400).json({error:"Módulo inválido"});
  if(!allowedFields.includes(field)) return res.status(400).json({error:"Campo inválido"});
  db.prepare(`UPDATE module_permissions SET ${field}=? WHERE role=? AND module=?`).run(value?1:0,role,module);
  res.json({ok:true});
});

app.get("/api/dashboard",access("dashboard"),(req,res)=>{
  const pending=db.prepare("SELECT COUNT(*) c FROM purchase_requests WHERE status='PENDIENTE'").get().c;
  const approved=db.prepare("SELECT COUNT(*) c FROM purchase_requests WHERE status IN ('APROBADA','ORDEN_GENERADA')").get().c;
  const committed=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM purchase_orders").get().total;
  const invoiced=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM invoices").get().total;
  const paid=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM invoices WHERE status='PAGADA'").get().total;
  const budget=db.prepare("SELECT COALESCE(SUM(budget),0) total FROM cost_centers").get().total;
  const overdue=db.prepare("SELECT COUNT(*) c FROM invoices WHERE status!='PAGADA' AND due_date IS NOT NULL AND due_date < date('now')").get().c;
  const inventoryRow=db.prepare("SELECT COALESCE(SUM(quantity * unit_cost),0) value, COUNT(*) items FROM inventory_items WHERE status!='BAJA'").get();
  const usersCount=db.prepare("SELECT COUNT(*) c FROM users WHERE active=1").get().c;
  const myPendingApprovals=req.session.user.role==="APROBADOR"
    ? db.prepare(`SELECT COUNT(*) c FROM purchase_requests pr JOIN approval_steps aps ON aps.request_id=pr.id AND aps.status='PENDIENTE' WHERE pr.status='PENDIENTE' AND aps.level=?`).get(req.session.user.approval_level).c
    : db.prepare("SELECT COUNT(*) c FROM purchase_requests WHERE status='PENDIENTE'").get().c;

  const recent=db.prepare(`
    SELECT pr.*,u.name requester,s.name supplier,cc.code cost_center,p.name project,p.client
    FROM purchase_requests pr
    JOIN users u ON u.id=pr.requester_id
    LEFT JOIN suppliers s ON s.id=pr.supplier_id
    LEFT JOIN cost_centers cc ON cc.id=pr.cost_center_id
    LEFT JOIN projects p ON p.id=pr.project_id
    ORDER BY pr.id DESC LIMIT 8
  `).all();

  const byCostCenter=db.prepare(`
    SELECT cc.code,cc.name,cc.budget,
      COALESCE(SUM(po.amount),0) committed
    FROM cost_centers cc
    LEFT JOIN purchase_requests pr ON pr.cost_center_id=cc.id
    LEFT JOIN purchase_orders po ON po.request_id=pr.id
    GROUP BY cc.id ORDER BY cc.code
  `).all();

  res.json({pending,approved,committed,invoiced,paid,budget,overdue,recent,byCostCenter,inventoryValue:inventoryRow.value,inventoryItems:inventoryRow.items,usersCount,myPendingApprovals});
});

app.get("/api/requests",access("requests"),(req,res)=>{
  const rows=db.prepare(`
    SELECT pr.*,u.name requester,s.name supplier,cc.code cost_center,cc.name cost_center_name,
           p.name project,p.client,p.budget project_budget,
           (SELECT COUNT(*) FROM request_quotes rq WHERE rq.request_id=pr.id) quote_count
    FROM purchase_requests pr
    JOIN users u ON u.id=pr.requester_id
    LEFT JOIN suppliers s ON s.id=pr.supplier_id
    LEFT JOIN cost_centers cc ON cc.id=pr.cost_center_id
    LEFT JOIN projects p ON p.id=pr.project_id
    ORDER BY pr.id DESC
  `).all();
  res.json(rows);
});
app.get("/api/requests/:id",access("requests"),(req,res)=>{
  const request=db.prepare(`
    SELECT pr.*,u.name requester,u.email requester_email,s.name supplier,cc.code cost_center,cc.name cost_center_name,
           p.name project,p.client
    FROM purchase_requests pr
    JOIN users u ON u.id=pr.requester_id
    LEFT JOIN suppliers s ON s.id=pr.supplier_id
    LEFT JOIN cost_centers cc ON cc.id=pr.cost_center_id
    LEFT JOIN projects p ON p.id=pr.project_id
    WHERE pr.id=?
  `).get(req.params.id);
  if(!request) return res.status(404).json({error:"Solicitud no encontrada"});
  const steps=db.prepare(`
    SELECT aps.*,u.name approver
    FROM approval_steps aps LEFT JOIN users u ON u.id=aps.approver_id
    WHERE aps.request_id=? ORDER BY aps.step_order
  `).all(req.params.id);
  const quotes=db.prepare(`
    SELECT rq.*,u.name uploaded_by_name
    FROM request_quotes rq LEFT JOIN users u ON u.id=rq.uploaded_by
    WHERE rq.request_id=? ORDER BY rq.id DESC
  `).all(req.params.id);
  res.json({request,steps,quotes});
});

app.post("/api/requests",access("requests","create"),upload.any(),(req,res)=>{
  const {area,concept,detail,supplier_id,amount,cost_center_id,project_id}=req.body;
  const files=Array.isArray(req.files)?req.files:[];
  const generalAttachment=files.find(f=>f.fieldname==="attachment");
  const quoteFiles=files.filter(f=>/^quote_file_\d+$/.test(f.fieldname));
  const value=Number(amount);
  if(!value || value<=0) return res.status(400).json({error:"Valor inválido"});
  const code=nextCode("SC","purchase_requests");
  const tx=db.transaction(()=>{
    const result=db.prepare(`
      INSERT INTO purchase_requests(code,requester_id,area,concept,detail,supplier_id,amount,cost_center_id,project_id,status,attachment)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(code,req.session.user.id,area,concept,detail||"",supplier_id||null,value,cost_center_id||null,project_id||null,"PENDIENTE",generalAttachment?generalAttachment.filename:null);
    const id=result.lastInsertRowid;
    quoteFiles.forEach(file=>{
      const idx=file.fieldname.replace("quote_file_","");
      const supplierName=(req.body[`quote_supplier_${idx}`]||"").trim()||"Proveedor sin nombre";
      const quoteAmount=Number(req.body[`quote_amount_${idx}`]||0)||null;
      const notes=(req.body[`quote_notes_${idx}`]||"").trim();
      db.prepare(`INSERT INTO request_quotes(request_id,supplier_name,amount,attachment,original_name,notes,uploaded_by) VALUES (?,?,?,?,?,?,?)`)
        .run(id,supplierName,quoteAmount,file.filename,file.originalname,notes,req.session.user.id);
    });
    approvalLevels(value).forEach((level,i)=>{
      db.prepare(`INSERT INTO approval_steps(request_id,step_order,level,status) VALUES (?,?,?,'PENDIENTE')`)
        .run(id,i+1,level);
    });
    return id;
  });
  const id=tx();
  const step=currentPendingStep(id);
  notifyApproversForStep(id,step);
  res.json({ok:true,id,code});
});

app.post("/api/requests/:id/quotes",access("requests","edit"),upload.single("file"),(req,res)=>{
  const request=db.prepare("SELECT id FROM purchase_requests WHERE id=?").get(req.params.id);
  if(!request) return res.status(404).json({error:"Solicitud no encontrada"});
  if(!req.file) return res.status(400).json({error:"Debes adjuntar la cotización"});
  const supplierName=(req.body.supplier_name||"").trim();
  if(!supplierName) return res.status(400).json({error:"Indica el proveedor"});
  const amount=Number(req.body.amount||0)||null;
  db.prepare(`INSERT INTO request_quotes(request_id,supplier_name,amount,attachment,original_name,notes,uploaded_by) VALUES (?,?,?,?,?,?,?)`)
    .run(req.params.id,supplierName,amount,req.file.filename,req.file.originalname,(req.body.notes||"").trim(),req.session.user.id);
  res.json({ok:true});
});

app.delete("/api/requests/:requestId/quotes/:quoteId",adminOnly,(req,res)=>{
  const q=db.prepare("SELECT * FROM request_quotes WHERE id=? AND request_id=?").get(req.params.quoteId,req.params.requestId);
  if(!q) return res.status(404).json({error:"Cotización no encontrada"});
  db.prepare("DELETE FROM request_quotes WHERE id=?").run(q.id);
  try{ if(q.attachment) fs.unlinkSync(path.join(uploadsDir,q.attachment)); }catch(_){}
  res.json({ok:true});
});

app.get("/api/approvals/pending",access("approvals"),(req,res)=>{
  let rows=db.prepare(`
    SELECT pr.id,pr.code,pr.concept,pr.amount,pr.area,u.name requester,
           aps.id step_id,aps.level,aps.step_order
    FROM purchase_requests pr
    JOIN users u ON u.id=pr.requester_id
    JOIN approval_steps aps ON aps.request_id=pr.id AND aps.status='PENDIENTE'
    WHERE pr.status='PENDIENTE'
    ORDER BY pr.id DESC,aps.step_order
  `).all();

  // Only the first pending step for each request is actionable.
  const seen=new Set();
  rows=rows.filter(r=>{
    if(seen.has(r.id)) return false;
    seen.add(r.id); return true;
  });

  if(req.session.user.role==="APROBADOR"){
    rows=rows.filter(r=>r.level===req.session.user.approval_level);
  }
  res.json(rows);
});

app.post("/api/approvals/:requestId/approve",access("approvals","approve"),(req,res)=>{
  const request=db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(req.params.requestId);
  if(!request) return res.status(404).json({error:"Solicitud no encontrada"});
  if(request.status!=="PENDIENTE") return res.status(400).json({error:"La solicitud ya no está pendiente"});

  const step=currentPendingStep(request.id);
  if(!step) return res.status(400).json({error:"No hay paso pendiente"});
  if(req.session.user.role==="APROBADOR" && req.session.user.approval_level!==step.level){
    return res.status(403).json({error:"Este paso corresponde a otro nivel de aprobación"});
  }

  db.prepare(`
    UPDATE approval_steps
    SET status='APROBADA',approver_id=?,comment=?,acted_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(req.session.user.id,req.body.comment||"",step.id);

  const next=currentPendingStep(request.id);
  if(next){
    notifyApproversForStep(request.id,next);
  } else {
    db.prepare("UPDATE purchase_requests SET status='APROBADA' WHERE id=?").run(request.id);
    const requester=db.prepare("SELECT u.* FROM users u JOIN purchase_requests pr ON pr.requester_id=u.id WHERE pr.id=?").get(request.id);
    createNotification(requester.id,`Solicitud ${request.code} aprobada`,`La solicitud ${request.code} completó todas las aprobaciones.`,"REQUEST",request.id);
    maybeSendEmail(requester.email,`Touch Compras - ${request.code} aprobada`,`Tu solicitud ${request.code} fue aprobada completamente.`);
  }
  res.json({ok:true,nextLevel:next?.level||null,completed:!next});
});

app.post("/api/approvals/:requestId/reject",access("approvals","approve"),(req,res)=>{
  const reason=(req.body.reason||"").trim();
  if(!reason) return res.status(400).json({error:"Debes indicar el motivo"});
  const request=db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(req.params.requestId);
  if(!request) return res.status(404).json({error:"Solicitud no encontrada"});
  const step=currentPendingStep(request.id);
  if(!step) return res.status(400).json({error:"No hay paso pendiente"});
  if(req.session.user.role==="APROBADOR" && req.session.user.approval_level!==step.level){
    return res.status(403).json({error:"Este paso corresponde a otro nivel"});
  }

  const tx=db.transaction(()=>{
    db.prepare(`
      UPDATE approval_steps
      SET status='RECHAZADA',approver_id=?,comment=?,acted_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(req.session.user.id,reason,step.id);
    db.prepare(`
      UPDATE approval_steps SET status='CANCELADA'
      WHERE request_id=? AND status='PENDIENTE'
    `).run(request.id);
    db.prepare("UPDATE purchase_requests SET status='RECHAZADA',rejection_reason=? WHERE id=?").run(reason,request.id);
  });
  tx();

  const requester=db.prepare("SELECT u.* FROM users u JOIN purchase_requests pr ON pr.requester_id=u.id WHERE pr.id=?").get(request.id);
  createNotification(requester.id,`Solicitud ${request.code} rechazada`,reason,"REQUEST",request.id);
  maybeSendEmail(requester.email,`Touch Compras - ${request.code} rechazada`,`Motivo: ${reason}`);
  res.json({ok:true});
});

app.get("/api/orders",access("orders"),(req,res)=>{
  res.json(db.prepare(`
    SELECT po.*,pr.code request_code,pr.concept,s.name supplier
    FROM purchase_orders po
    JOIN purchase_requests pr ON pr.id=po.request_id
    LEFT JOIN suppliers s ON s.id=po.supplier_id
    ORDER BY po.id DESC
  `).all());
});
app.post("/api/orders/:requestId",access("orders","create"),(req,res)=>{
  const r=db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(req.params.requestId);
  if(!r) return res.status(404).json({error:"Solicitud no encontrada"});
  if(r.status!=="APROBADA") return res.status(400).json({error:"La solicitud debe completar todas las aprobaciones"});
  if(db.prepare("SELECT 1 FROM purchase_orders WHERE request_id=?").get(r.id)) return res.status(400).json({error:"La OC ya existe"});
  const code=nextCode("OC","purchase_orders");
  db.prepare(`INSERT INTO purchase_orders(code,request_id,supplier_id,amount,status) VALUES (?,?,?,?,?)`)
    .run(code,r.id,r.supplier_id,r.amount,"EMITIDA");
  db.prepare("UPDATE purchase_requests SET status='ORDEN_GENERADA' WHERE id=?").run(r.id);
  res.json({ok:true,code});
});

app.get("/api/invoices",access("invoices"),(req,res)=>{
  res.json(db.prepare(`
    SELECT i.*,po.code po_code,pr.code request_code,s.name supplier
    FROM invoices i
    JOIN purchase_orders po ON po.id=i.po_id
    JOIN purchase_requests pr ON pr.id=po.request_id
    LEFT JOIN suppliers s ON s.id=po.supplier_id
    ORDER BY i.id DESC
  `).all());
});
app.post("/api/invoices",access("invoices","create"),upload.single("attachment"),(req,res)=>{
  const {po_id,invoice_number,invoice_date,due_date,amount}=req.body;
  const po=db.prepare("SELECT * FROM purchase_orders WHERE id=?").get(po_id);
  if(!po) return res.status(404).json({error:"OC no encontrada"});
  const result=db.prepare(`
    INSERT INTO invoices(po_id,invoice_number,invoice_date,due_date,amount,status,attachment)
    VALUES (?,?,?,?,?,'RADICADA',?)
  `).run(po_id,invoice_number,invoice_date||null,due_date||null,Number(amount),req.file?req.file.filename:null);
  res.json({ok:true,id:result.lastInsertRowid});
});
app.post("/api/invoices/:id/status",access("invoices","edit"),(req,res)=>{
  const allowed=["RADICADA","APROBADA","PAGADA"];
  if(!allowed.includes(req.body.status)) return res.status(400).json({error:"Estado inválido"});
  const paid=req.body.status==="PAGADA" ? "CURRENT_TIMESTAMP" : "NULL";
  db.prepare(`UPDATE invoices SET status=?, paid_at=${paid} WHERE id=?`).run(req.body.status,req.params.id);
  res.json({ok:true});
});

app.get("/api/budgets",access("budgets"),(req,res)=>{
  res.json({
    costCenters:db.prepare(`
      SELECT cc.*,
      COALESCE(SUM(po.amount),0) committed
      FROM cost_centers cc
      LEFT JOIN purchase_requests pr ON pr.cost_center_id=cc.id
      LEFT JOIN purchase_orders po ON po.request_id=pr.id
      GROUP BY cc.id ORDER BY cc.code
    `).all(),
    projects:db.prepare(`
      SELECT p.*,
      COALESCE(SUM(po.amount),0) committed
      FROM projects p
      LEFT JOIN purchase_requests pr ON pr.project_id=p.id
      LEFT JOIN purchase_orders po ON po.request_id=pr.id
      GROUP BY p.id ORDER BY p.client,p.name
    `).all()
  });
});
app.post("/api/budgets/cost-center/:id",access("budgets","edit"),(req,res)=>{
  db.prepare("UPDATE cost_centers SET budget=? WHERE id=?").run(Number(req.body.budget),req.params.id);
  res.json({ok:true});
});
app.post("/api/budgets/project/:id",access("budgets","edit"),(req,res)=>{
  db.prepare("UPDATE projects SET budget=? WHERE id=?").run(Number(req.body.budget),req.params.id);
  res.json({ok:true});
});

app.get("/api/notifications",auth,(req,res)=>{
  res.json(db.prepare(`
    SELECT * FROM notifications WHERE user_id=?
    ORDER BY id DESC LIMIT 30
  `).all(req.session.user.id));
});
app.post("/api/notifications/:id/read",auth,(req,res)=>{
  db.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").run(req.params.id,req.session.user.id);
  res.json({ok:true});
});

app.get("/api/suppliers",access("suppliers"),(req,res)=>res.json(db.prepare("SELECT * FROM suppliers ORDER BY id DESC").all()));
app.post("/api/suppliers",access("suppliers","create"),(req,res)=>{
  const {name,nit,city,email}=req.body;
  const result=db.prepare("INSERT INTO suppliers(name,nit,city,email,status) VALUES (?,?,?,?,?)")
    .run(name,nit||"",city||"",email||"","ACTIVO");
  res.json({ok:true,id:result.lastInsertRowid});
});

app.get("/api/users",access("users"),(req,res)=>res.json(db.prepare("SELECT id,name,email,role,approval_level,active FROM users ORDER BY id").all()));
app.post("/api/users",access("users","create"),(req,res)=>{
  const {name,email,password,role: userRole,approval_level}=req.body;
  try{
    const result=db.prepare("INSERT INTO users(name,email,password_hash,role,approval_level) VALUES (?,?,?,?,?)")
      .run(name,email,bcrypt.hashSync(password,10),userRole,approval_level||null);
    res.json({ok:true,id:result.lastInsertRowid});
  }catch(e){
    res.status(400).json({error:"No fue posible crear el usuario. Verifica el correo."});
  }
});

app.put("/api/users/:id",access("users","edit"),(req,res)=>{
  const {name,email,role:userRole,approval_level,active,password}=req.body;
  const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if(!user) return res.status(404).json({error:"Usuario no encontrado"});
  try{
    if(password && String(password).trim()){
      db.prepare("UPDATE users SET name=?,email=?,role=?,approval_level=?,active=?,password_hash=? WHERE id=?")
        .run(name,email,userRole,approval_level||null,active?1:0,bcrypt.hashSync(String(password),10),req.params.id);
    }else{
      db.prepare("UPDATE users SET name=?,email=?,role=?,approval_level=?,active=? WHERE id=?")
        .run(name,email,userRole,approval_level||null,active?1:0,req.params.id);
    }
    res.json({ok:true});
  }catch(e){
    res.status(400).json({error:"No fue posible actualizar el usuario. Verifica la información."});
  }
});

app.get("/api/orders/:id/pdf",access("orders"),(req,res)=>{
  const po=db.prepare(`
    SELECT po.*,pr.code request_code,pr.concept,pr.detail,pr.area,
           s.name supplier,s.nit,s.city,s.email,
           cc.code cost_center,cc.name cost_center_name,
           p.name project,p.client,u.name requester
    FROM purchase_orders po
    JOIN purchase_requests pr ON pr.id=po.request_id
    LEFT JOIN suppliers s ON s.id=po.supplier_id
    LEFT JOIN cost_centers cc ON cc.id=pr.cost_center_id
    LEFT JOIN projects p ON p.id=pr.project_id
    LEFT JOIN users u ON u.id=pr.requester_id
    WHERE po.id=?
  `).get(req.params.id);
  if(!po) return res.status(404).send("OC no encontrada");

  const doc=new PDFDocument({margin:45,size:"A4"});
  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition",`inline; filename="${po.code}.pdf"`);
  doc.pipe(res);

  const logo=path.join(__dirname,"public","logo-touch-ohla.png");
  if(fs.existsSync(logo)){try{doc.image(logo,45,35,{width:190})}catch(e){}}
  doc.fillColor("#06388f").fontSize(22).text("ORDEN DE COMPRA",335,55,{width:215,align:"right"});
  doc.fillColor("#333").fontSize(10).text(po.code,335,85,{width:215,align:"right"});

  doc.roundedRect(45,140,505,78,8).fillAndStroke("#f4f8fd","#dbe5f0");
  doc.fillColor("#06388f").fontSize(11).text("Proveedor",60,155);
  doc.fillColor("#111").fontSize(10).text(po.supplier||"-",60,174);
  doc.text(`NIT: ${po.nit||"-"}`,60,190);
  doc.text(`Email: ${po.email||"-"}`,290,174);
  doc.text(`Ciudad: ${po.city||"-"}`,290,190);

  doc.fillColor("#06388f").fontSize(11).text("Información de la compra",45,245);
  doc.fillColor("#111").fontSize(10);
  [
    `Solicitud: ${po.request_code}`,
    `Solicitante: ${po.requester}`,
    `Área: ${po.area}`,
    `Centro de costo: ${po.cost_center||"-"} ${po.cost_center_name? "- "+po.cost_center_name:""}`,
    `Proyecto / Cliente: ${po.project||"-"} ${po.client? "("+po.client+")":""}`
  ].forEach((t,i)=>doc.text(t,45,265+i*18));

  doc.fillColor("#06388f").fontSize(11).text("Concepto",45,375);
  doc.fillColor("#111").fontSize(10).text(po.concept,45,395,{width:505});
  if(po.detail) doc.text(po.detail,45,420,{width:505});

  doc.roundedRect(330,505,220,78,8).fillAndStroke("#06388f","#06388f");
  doc.fillColor("#fff").fontSize(10).text("TOTAL ORDEN DE COMPRA",345,522);
  doc.fontSize(18).text(new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(po.amount),345,546,{width:190,align:"right"});

  doc.fillColor("#667085").fontSize(8).text("Documento generado desde Touch Compras by Ohla.",45,760,{width:505,align:"center"});
  doc.end();
});


// ---------------- INVENTARIOS ----------------
app.get("/api/inventory/summary",access("inventory"),(req,res)=>{
  const byType=db.prepare(`
    SELECT asset_type,
           COUNT(*) items,
           COALESCE(SUM(quantity),0) quantity,
           COALESCE(SUM(quantity * unit_cost),0) value
    FROM inventory_items
    WHERE status!='BAJA'
    GROUP BY asset_type
  `).all();
  const totalValue=db.prepare(`SELECT COALESCE(SUM(quantity * unit_cost),0) total FROM inventory_items WHERE status!='BAJA'`).get().total;
  const totalItems=db.prepare(`SELECT COUNT(*) total FROM inventory_items WHERE status!='BAJA'`).get().total;
  const assigned=db.prepare(`SELECT COUNT(*) total FROM inventory_items WHERE status IN ('ASIGNADO','EN_USO')`).get().total;
  res.json({byType,totalValue,totalItems,assigned});
});

app.get("/api/inventory",access("inventory"),(req,res)=>{
  const rows=db.prepare(`
    SELECT i.*, s.name supplier, u.name created_by_name,
           (i.quantity * i.unit_cost) total_value
    FROM inventory_items i
    LEFT JOIN suppliers s ON s.id=i.supplier_id
    LEFT JOIN users u ON u.id=i.created_by
    ORDER BY i.id DESC
  `).all();
  res.json(rows);
});

app.get("/api/inventory/:id",access("inventory"),(req,res)=>{
  const item=db.prepare(`
    SELECT i.*, s.name supplier, u.name created_by_name,
           (i.quantity * i.unit_cost) total_value
    FROM inventory_items i
    LEFT JOIN suppliers s ON s.id=i.supplier_id
    LEFT JOIN users u ON u.id=i.created_by
    WHERE i.id=?
  `).get(req.params.id);
  if(!item) return res.status(404).json({error:"Activo no encontrado"});
  const movements=db.prepare(`
    SELECT m.*,u.name created_by_name
    FROM inventory_movements m
    LEFT JOIN users u ON u.id=m.created_by
    WHERE m.item_id=? ORDER BY m.id DESC
  `).all(req.params.id);
  res.json({item,movements});
});

app.post("/api/inventory",access("inventory","create"),upload.single("attachment"),(req,res)=>{
  const {asset_type,name,description,quantity,unit,unit_cost,brand,model,serial,location,responsible,status,purchase_date,entry_date,supplier_id,invoice_ref,notes}=req.body;
  const validTypes=["ACTIVO_FIJO","ACTIVO_TECNOLOGIA","ACTIVO_INFORMACION","ACTIVO_CIRCULANTE"];
  if(!validTypes.includes(asset_type)) return res.status(400).json({error:"Tipo de activo inválido"});
  if(!name?.trim()) return res.status(400).json({error:"El nombre del activo es obligatorio"});
  const qty=Number(quantity||1), cost=Number(unit_cost||0);
  if(qty<0 || Number.isNaN(qty) || Number.isNaN(cost)) return res.status(400).json({error:"Cantidad o costo inválido"});
  const asset_code=nextAssetCode(asset_type);
  const tx=db.transaction(()=>{
    const result=db.prepare(`
      INSERT INTO inventory_items(asset_code,asset_type,name,description,quantity,unit,unit_cost,brand,model,serial,location,responsible,status,purchase_date,entry_date,supplier_id,invoice_ref,attachment,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(asset_code,asset_type,name.trim(),description||"",qty,unit||"UND",cost,brand||"",model||"",serial||"",location||"",responsible||"",status||"DISPONIBLE",purchase_date||null,entry_date||new Date().toISOString().slice(0,10),supplier_id||null,invoice_ref||"",req.file?req.file.filename:null,notes||"",req.session.user.id);
    db.prepare(`INSERT INTO inventory_movements(item_id,movement_type,quantity,to_location,responsible,notes,created_by) VALUES (?,?,?,?,?,?,?)`)
      .run(result.lastInsertRowid,"INGRESO",qty,location||"",responsible||"","Ingreso inicial de inventario",req.session.user.id);
    return result.lastInsertRowid;
  });
  const id=tx();
  res.json({ok:true,id,asset_code});
});

app.post("/api/inventory/:id/movement",access("inventory","edit"),(req,res)=>{
  const item=db.prepare("SELECT * FROM inventory_items WHERE id=?").get(req.params.id);
  if(!item) return res.status(404).json({error:"Activo no encontrado"});
  const {movement_type,quantity,to_location,responsible,notes,status}=req.body;
  const valid=["AJUSTE","SALIDA","ASIGNACION","DEVOLUCION","TRASLADO","BAJA"];
  if(!valid.includes(movement_type)) return res.status(400).json({error:"Movimiento inválido"});
  const qty=Number(quantity||1);
  if(qty<=0 || Number.isNaN(qty)) return res.status(400).json({error:"Cantidad inválida"});
  let newQty=Number(item.quantity), newStatus=item.status, newLocation=item.location, newResponsible=item.responsible;
  if(movement_type==="SALIDA"){
    if(qty>newQty) return res.status(400).json({error:"La salida supera la cantidad disponible"});
    newQty-=qty; if(newQty===0)newStatus="AGOTADO";
  }else if(movement_type==="AJUSTE"){
    newQty=qty;
  }else if(movement_type==="ASIGNACION"){
    newStatus="ASIGNADO"; newResponsible=responsible||item.responsible; if(to_location)newLocation=to_location;
  }else if(movement_type==="DEVOLUCION"){
    newStatus="DISPONIBLE"; newResponsible=""; if(to_location)newLocation=to_location;
  }else if(movement_type==="TRASLADO"){
    if(to_location)newLocation=to_location;
  }else if(movement_type==="BAJA"){
    newStatus="BAJA";
  }
  if(status)newStatus=status;
  const tx=db.transaction(()=>{
    db.prepare(`UPDATE inventory_items SET quantity=?,status=?,location=?,responsible=? WHERE id=?`).run(newQty,newStatus,newLocation,newResponsible,item.id);
    db.prepare(`INSERT INTO inventory_movements(item_id,movement_type,quantity,from_location,to_location,responsible,notes,created_by) VALUES (?,?,?,?,?,?,?,?)`)
      .run(item.id,movement_type,qty,item.location||"",to_location||newLocation||"",responsible||newResponsible||"",notes||"",req.session.user.id);
  });
  tx();
  res.json({ok:true});
});


// ---------------- ELIMINACIÓN SOLO ADMIN ----------------
app.delete("/api/requests/:id",adminOnly,(req,res)=>{
  const request=db.prepare("SELECT * FROM purchase_requests WHERE id=?").get(req.params.id);
  if(!request) return res.status(404).json({error:"Solicitud no encontrada"});

  const po=db.prepare("SELECT id FROM purchase_orders WHERE request_id=?").get(request.id);
  if(po) return res.status(400).json({error:"No se puede eliminar: la solicitud ya tiene una orden de compra asociada"});

  const tx=db.transaction(()=>{
    db.prepare("DELETE FROM approval_steps WHERE request_id=?").run(request.id);
    db.prepare("DELETE FROM request_quotes WHERE request_id=?").run(request.id);
    db.prepare("DELETE FROM notifications WHERE link_type='REQUEST' AND link_id=?").run(request.id);
    db.prepare("DELETE FROM purchase_requests WHERE id=?").run(request.id);
  });
  tx();
  res.json({ok:true});
});

app.delete("/api/suppliers/:id",adminOnly,(req,res)=>{
  const supplier=db.prepare("SELECT * FROM suppliers WHERE id=?").get(req.params.id);
  if(!supplier) return res.status(404).json({error:"Proveedor no encontrado"});

  const linkedRequests=db.prepare("SELECT COUNT(*) c FROM purchase_requests WHERE supplier_id=?").get(req.params.id).c;
  const linkedOrders=db.prepare("SELECT COUNT(*) c FROM purchase_orders WHERE supplier_id=?").get(req.params.id).c;
  const linkedInventory=db.prepare("SELECT COUNT(*) c FROM inventory_items WHERE supplier_id=?").get(req.params.id).c;

  if(linkedRequests || linkedOrders || linkedInventory){
    return res.status(400).json({error:"No se puede eliminar: el proveedor tiene compras, órdenes o activos asociados"});
  }

  db.prepare("DELETE FROM suppliers WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

app.delete("/api/inventory/:id",adminOnly,(req,res)=>{
  const item=db.prepare("SELECT * FROM inventory_items WHERE id=?").get(req.params.id);
  if(!item) return res.status(404).json({error:"Activo no encontrado"});

  const tx=db.transaction(()=>{
    db.prepare("DELETE FROM inventory_movements WHERE item_id=?").run(item.id);
    db.prepare("DELETE FROM inventory_items WHERE id=?").run(item.id);
  });
  tx();
  res.json({ok:true});
});

app.delete("/api/invoices/:id",adminOnly,(req,res)=>{
  const invoice=db.prepare("SELECT * FROM invoices WHERE id=?").get(req.params.id);
  if(!invoice) return res.status(404).json({error:"Factura no encontrada"});
  db.prepare("DELETE FROM invoices WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

app.delete("/api/users/:id",adminOnly,(req,res)=>{
  const id=Number(req.params.id);
  if(id===req.session.user.id) return res.status(400).json({error:"No puedes eliminar tu propio usuario administrador"});

  const user=db.prepare("SELECT * FROM users WHERE id=?").get(id);
  if(!user) return res.status(404).json({error:"Usuario no encontrado"});

  // Se usa desactivación lógica para no romper la trazabilidad histórica.
  db.prepare("UPDATE users SET active=0 WHERE id=?").run(id);
  res.json({ok:true,softDelete:true});
});

app.delete("/api/orders/:id",adminOnly,(req,res)=>{
  const order=db.prepare("SELECT * FROM purchase_orders WHERE id=?").get(req.params.id);
  if(!order) return res.status(404).json({error:"Orden de compra no encontrada"});

  const invoices=db.prepare("SELECT COUNT(*) c FROM invoices WHERE po_id=?").get(order.id).c;
  if(invoices) return res.status(400).json({error:"No se puede eliminar: la orden tiene facturas asociadas"});

  const tx=db.transaction(()=>{
    db.prepare("DELETE FROM purchase_orders WHERE id=?").run(order.id);
    db.prepare("UPDATE purchase_requests SET status='APROBADA' WHERE id=?").run(order.request_id);
  });
  tx();
  res.json({ok:true});
});

app.get("/health",(req,res)=>res.status(200).json({ok:true,service:"Touch Operations Hub"}));

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,"0.0.0.0",()=>console.log(`Touch Operations Hub running on port ${PORT}`));
