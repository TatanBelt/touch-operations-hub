const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
let server = fs.readFileSync(serverPath, 'utf8');

function replaceOnce(from, to, label) {
  if (server.includes(to)) return;
  if (!server.includes(from)) {
    console.warn(`[stability] No se encontró el bloque: ${label}`);
    return;
  }
  server = server.replace(from, to);
}

// 1) Store de sesiones persistido en SQLite. Evita MemoryStore en producción.
if (!server.includes('class SQLiteSessionStore extends session.Store')) {
  const marker = 'db.pragma("foreign_keys = ON");';
  const block = `db.pragma("foreign_keys = ON");\n\nclass SQLiteSessionStore extends session.Store {\n  constructor(database){\n    super();\n    this.db=database;\n    this.db.exec(\`CREATE TABLE IF NOT EXISTS web_sessions (sid TEXT PRIMARY KEY, expires INTEGER NOT NULL, sess TEXT NOT NULL)\`);\n    this.getStmt=this.db.prepare("SELECT expires,sess FROM web_sessions WHERE sid=?");\n    this.setStmt=this.db.prepare("INSERT INTO web_sessions(sid,expires,sess) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET expires=excluded.expires,sess=excluded.sess");\n    this.delStmt=this.db.prepare("DELETE FROM web_sessions WHERE sid=?");\n    this.cleanStmt=this.db.prepare("DELETE FROM web_sessions WHERE expires<=?");\n  }\n  get(sid,cb){\n    try{\n      const row=this.getStmt.get(sid);\n      if(!row) return cb(null,null);\n      if(Number(row.expires)<=Date.now()){this.delStmt.run(sid);return cb(null,null);}\n      cb(null,JSON.parse(row.sess));\n    }catch(e){cb(e);}\n  }\n  set(sid,sess,cb){\n    try{\n      const maxAge=Number(sess?.cookie?.maxAge||1000*60*60*8);\n      const expires=sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now()+maxAge;\n      this.setStmt.run(sid,expires,JSON.stringify(sess));\n      if(Math.random()<0.02) this.cleanStmt.run(Date.now());\n      if(cb) cb(null);\n    }catch(e){if(cb) cb(e);}\n  }\n  destroy(sid,cb){\n    try{this.delStmt.run(sid);if(cb)cb(null);}catch(e){if(cb)cb(e);}\n  }\n  touch(sid,sess,cb){this.set(sid,sess,cb);}\n}\nconst sessionStore=new SQLiteSessionStore(db);`;
  replaceOnce(marker, block, 'SQLite session store');
}

if (!server.includes('store: sessionStore,')) {
  replaceOnce(
    'app.use(session({\n  secret:',
    'app.set("trust proxy", 1);\napp.use(session({\n  store: sessionStore,\n  secret:',
    'configuración de session store'
  );
}

server = server.replace(
  'cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true, sameSite: "lax" }',
  'cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }'
);

// 2) Límites de carga para evitar archivos/campos excesivos.
replaceOnce(
  'const upload = multer({ storage });',
  'const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024, files: 6, fields: 80, fieldNameSize: 120, fieldNestingDepth: 3, fieldArrayIndexLimit: 20 } });',
  'límites de Multer'
);

// Helper seguro para eliminar adjuntos sin permitir traversal.
if (!server.includes('function safeUnlink(')) {
  const marker = 'function initDB() {';
  const helper = `function safeUnlink(dir,filename){\n  if(!filename) return;\n  try{\n    const root=path.resolve(dir)+path.sep;\n    const target=path.resolve(dir,String(filename));\n    if(target.startsWith(root) && fs.existsSync(target)) fs.unlinkSync(target);\n  }catch(e){console.warn("No se pudo eliminar adjunto:",e.message);}\n}\n\nfunction initDB() {`;
  replaceOnce(marker, helper, 'safeUnlink');
}

// 3) Solo Comprador/Admin puede cargar cotizaciones; nunca se cargan al crear la solicitud.
if (!server.includes('Las cotizaciones se cargan después de crear la solicitud')) {
  replaceOnce(
    'const quoteFiles=files.filter(f=>/^quote_file_\\d+$/.test(f.fieldname));',
    'const quoteFiles=files.filter(f=>/^quote_file_\\d+$/.test(f.fieldname));\n  if(quoteFiles.length) return res.status(400).json({error:"Las cotizaciones se cargan después de crear la solicitud desde el perfil Comprador"});',
    'bloqueo de cotizaciones en creación'
  );
}

if (!server.includes('Solo Compras puede registrar cotizaciones de proveedores')) {
  replaceOnce(
    'app.post("/api/requests/:id/quotes",access("requests","edit"),upload.single("file"),(req,res)=>{',
    'app.post("/api/requests/:id/quotes",access("requests","edit"),upload.single("file"),(req,res)=>{\n  if(!["ADMIN","COMPRADOR"].includes(req.session.user.role)) return res.status(403).json({error:"Solo Compras puede registrar cotizaciones de proveedores"});',
    'autorización de cotizaciones'
  );
}

// 4) Normalizar correos al crear/editar usuarios para evitar duplicados por mayúsculas/espacios.
if (!server.includes('Correo de usuario inválido')) {
  replaceOnce(
    'const {name,email,password,role: userRole,approval_level}=req.body;',
    'const {name,password,role: userRole,approval_level}=req.body;\n  const email=String(req.body.email||"").trim().toLowerCase();\n  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return res.status(400).json({error:"Correo de usuario inválido"});',
    'normalización correo crear usuario'
  );
  replaceOnce(
    'const {name,email,role:userRole,approval_level,active,password}=req.body;',
    'const {name,role:userRole,approval_level,active,password}=req.body;\n  const email=String(req.body.email||"").trim().toLowerCase();\n  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return res.status(400).json({error:"Correo de usuario inválido"});',
    'normalización correo editar usuario'
  );
}

// 5) Validaciones de datos obligatorios y montos.
if (!server.includes('Área y concepto son obligatorios')) {
  replaceOnce(
    'const value=Number(amount);\n  if(!value || value<=0) return res.status(400).json({error:"Valor inválido"});',
    'const value=Number(amount);\n  if(!String(area||"").trim() || !String(concept||"").trim()) return res.status(400).json({error:"Área y concepto son obligatorios"});\n  if(!Number.isFinite(value) || value<=0) return res.status(400).json({error:"Valor inválido"});',
    'validación solicitud'
  );
}

if (!server.includes('Valor de factura inválido')) {
  replaceOnce(
    'const {po_id,invoice_number,invoice_date,due_date,amount}=req.body;\n  const po=',
    'const {po_id,invoice_number,invoice_date,due_date,amount}=req.body;\n  const invoiceAmount=Number(amount);\n  if(!Number.isFinite(invoiceAmount) || invoiceAmount<=0) return res.status(400).json({error:"Valor de factura inválido"});\n  if(!String(invoice_number||"").trim()) return res.status(400).json({error:"Número de factura obligatorio"});\n  const po=',
    'validación factura'
  );
  server = server.replace(
    '.run(po_id,invoice_number,invoice_date||null,due_date||null,Number(amount),req.file?req.file.filename:null);',
    '.run(po_id,String(invoice_number).trim(),invoice_date||null,due_date||null,invoiceAmount,req.file?req.file.filename:null);'
  );
}

// 6) Limpiar archivos físicos al eliminar registros.
server = server.replace(
  'try{ if(q.attachment) fs.unlinkSync(path.join(quotationsDir,q.attachment)); }catch(_){}',
  'safeUnlink(quotationsDir,q.attachment);'
);

if (!server.includes('const requestQuoteFiles=db.prepare("SELECT attachment FROM request_quotes')) {
  server = server.replace(
    'const po=db.prepare("SELECT id FROM purchase_orders WHERE request_id=?").get(request.id);',
    'const requestQuoteFiles=db.prepare("SELECT attachment FROM request_quotes WHERE request_id=?").all(request.id);\n  const po=db.prepare("SELECT id FROM purchase_orders WHERE request_id=?").get(request.id);'
  );
  server = server.replace(
    'tx();\n  res.json({ok:true});\n});\n\napp.delete("/api/suppliers/:id"',
    'tx();\n  safeUnlink(uploadsDir,request.attachment);\n  requestQuoteFiles.forEach(x=>safeUnlink(quotationsDir,x.attachment));\n  res.json({ok:true});\n});\n\napp.delete("/api/suppliers/:id"'
  );
}

if (!server.includes('safeUnlink(uploadsDir,item.attachment);')) {
  server = server.replace(
    'db.prepare("DELETE FROM inventory_items WHERE id=?").run(item.id);\n  });\n  tx();\n  res.json({ok:true});',
    'db.prepare("DELETE FROM inventory_items WHERE id=?").run(item.id);\n  });\n  tx();\n  safeUnlink(uploadsDir,item.attachment);\n  res.json({ok:true});'
  );
}

if (!server.includes('safeUnlink(uploadsDir,invoice.attachment);')) {
  server = server.replace(
    'db.prepare("DELETE FROM invoices WHERE id=?").run(req.params.id);\n  res.json({ok:true});',
    'db.prepare("DELETE FROM invoices WHERE id=?").run(req.params.id);\n  safeUnlink(uploadsDir,invoice.attachment);\n  res.json({ok:true});'
  );
}

// 7) Manejo consistente de errores de carga y errores internos API.
if (!server.includes('Error de carga de archivo')) {
  const marker = 'app.get("/health",(req,res)=>res.status(200).json({ok:true,service:"Touch Operations Hub"}));';
  const handler = `app.use((err,req,res,next)=>{\n  if(err instanceof multer.MulterError){\n    const msg=err.code==="LIMIT_FILE_SIZE" ? "El archivo supera el máximo de 20 MB" : "Error de carga de archivo";\n    return res.status(400).json({error:msg,code:err.code});\n  }\n  console.error("Error no controlado:",err);\n  if(req.path.startsWith("/api/")) return res.status(500).json({error:"Error interno de la plataforma"});\n  next(err);\n});\n\n${marker}`;
  replaceOnce(marker, handler, 'manejador de errores');
}

fs.writeFileSync(serverPath, server, 'utf8');
const check=spawnSync(process.execPath,['--check',serverPath],{encoding:'utf8'});
if(check.status!==0) throw new Error(`Error de sintaxis tras patch-stability: ${check.stderr}`);
console.log('Stability patch aplicado: sesiones SQLite, uploads protegidos, permisos de cotizaciones, validaciones y limpieza de adjuntos.');
