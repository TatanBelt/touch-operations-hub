const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const appPath = path.join(root, 'public', 'app.js');
const indexPath = path.join(root, 'public', 'index.html');
const cssPath = path.join(root, 'public', 'styles.css');
const backendFragmentPath = path.join(__dirname, 'supplier-backend.fragment');
const uiFragmentPath = path.join(__dirname, 'supplier-ui.fragment');

let server = fs.readFileSync(serverPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');
let html = fs.readFileSync(indexPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');
const supplierRoutes = fs.readFileSync(backendFragmentPath, 'utf8').trim() + '\n\n';
const supplierUi = fs.readFileSync(uiFragmentPath, 'utf8').trim() + '\n\n';

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`No se encontró el bloque para ${label}`);
  return text.replace(from, to);
}

if (!server.includes('const supplierDocsDir = path.join(storageRoot, "supplier-documents");')) {
  server = replaceRequired(
    server,
    'const quotationsDir = path.join(storageRoot, "quotations");',
    'const quotationsDir = path.join(storageRoot, "quotations");\nconst supplierDocsDir = path.join(storageRoot, "supplier-documents");',
    'carpeta de documentos de proveedores'
  );
  server = replaceRequired(
    server,
    'fs.mkdirSync(quotationsDir, { recursive: true });',
    'fs.mkdirSync(quotationsDir, { recursive: true });\nfs.mkdirSync(supplierDocsDir, { recursive: true });',
    'creación de carpeta de documentos de proveedores'
  );
}

if (!server.includes('const isSupplierDocument = req.originalUrl.startsWith("/api/suppliers")')) {
  const oldDest = 'destination: (req, file, cb) => {\n    const isQuote = /^quote_file_\\d+$/.test(file.fieldname) || req.originalUrl.includes("/quotes");\n    cb(null, isQuote ? quotationsDir : uploadsDir);\n  },';
  const newDest = 'destination: (req, file, cb) => {\n    const isQuote = /^quote_file_\\d+$/.test(file.fieldname) || req.originalUrl.includes("/quotes");\n    const isSupplierDocument = req.originalUrl.startsWith("/api/suppliers") && !req.originalUrl.includes("/quotes");\n    cb(null, isQuote ? quotationsDir : (isSupplierDocument ? supplierDocsDir : uploadsDir));\n  },';
  server = replaceRequired(server, oldDest, newDest, 'destino privado de documentos de proveedores');
}

if (!server.includes('CREATE TABLE IF NOT EXISTS supplier_documents')) {
  const marker = '// Inicializar la base únicamente después de cargar la configuración de roles y permisos.\ninitDB();';
  const migration = '// Inicializar la base únicamente después de cargar la configuración de roles y permisos.\ninitDB();\n\ndb.exec(`\n  CREATE TABLE IF NOT EXISTS supplier_documents (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    supplier_id INTEGER NOT NULL,\n    document_type TEXT NOT NULL,\n    filename TEXT NOT NULL,\n    original_name TEXT,\n    issue_date TEXT,\n    uploaded_by INTEGER,\n    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,\n    UNIQUE(supplier_id, document_type),\n    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,\n    FOREIGN KEY(uploaded_by) REFERENCES users(id)\n  );\n`);';
  server = replaceRequired(server, marker, migration, 'tabla documental de proveedores');
}

if (!server.includes('SUPPLIER_DOCUMENT_FIELDS')) {
  const start = server.indexOf('app.get("/api/suppliers",access("suppliers")');
  const end = server.indexOf('app.get("/api/users",access("users")', start);
  if (start < 0 || end < 0) throw new Error('No se encontró el bloque de rutas de proveedores');
  server = server.slice(0,start) + supplierRoutes + server.slice(end);
}

if (!server.includes('const supplierDocumentFiles=db.prepare("SELECT filename FROM supplier_documents')) {
  server = server.replace(
    'db.prepare("DELETE FROM suppliers WHERE id=?").run(req.params.id);\n  res.json({ok:true});',
    'const supplierDocumentFiles=db.prepare("SELECT filename FROM supplier_documents WHERE supplier_id=?").all(req.params.id);\n  db.prepare("DELETE FROM supplier_documents WHERE supplier_id=?").run(req.params.id);\n  db.prepare("DELETE FROM suppliers WHERE id=?").run(req.params.id);\n  supplierDocumentFiles.forEach(x=>safeUnlink(supplierDocsDir,x.filename));\n  res.json({ok:true});'
  );
}

if (!app.includes('const esc=')) {
  app = app.replace(
    'const $=s=>document.querySelector(s);',
    'const $=s=>document.querySelector(s);\nconst esc=s=>String(s??"").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\\\'":"&#39;"}[c]));'
  );
}

if (!app.includes('supplierDocumentLabels')) {
  const start = app.indexOf('async function suppliers(){');
  const end = app.indexOf('async function users(){', start);
  if(start < 0 || end < 0) throw new Error('No se encontró el bloque visual de proveedores');
  app = app.slice(0,start) + supplierUi + app.slice(end);
}

const appTranslations = [
  ['Overview','Resumen'],
  ['PARTNER NETWORK','RED DE PROVEEDORES'],
  ['IDENTITY & ROLES','USUARIOS Y ROLES'],
  ['PURCHASE ORDERS','ÓRDENES DE COMPRA'],
  ['FINANCE CONTROL','CONTROL FINANCIERO'],
  ['COST CENTERS','CENTROS DE COSTO'],
  ['PROJECTS','PROYECTOS'],
  ['ADMIN CONTROL CENTER','CENTRO DE CONTROL ADMINISTRATIVO'],
  ['PURCHASING WORKSPACE','GESTIÓN DE COMPRAS'],
  ['APPROVAL DESK','BANDEJA DE APROBACIONES'],
  ['Marketing operations en un mismo lugar.','La operación de compras de Touch Colombia en un solo lugar.'],
  ['Touch Hub','Touch Colombia Compras'],
  ['<label>Email</label>','<label>Correo electrónico</label>'],
  ['<th>Email</th>','<th>Correo electrónico</th>']
];
for(const [from,to] of appTranslations) app=app.split(from).join(to);

html=html.replace('<title>Touch Operations | by Ohla</title>','<title>Touch Colombia Compras | by Ohla</title>');
html=html.replace(/<!-- LOGIN \/ BRAND EXPERIENCE -->/g,'<!-- ACCESO / EXPERIENCIA DE MARCA -->');

if(!css.includes('.supplier-doc-grid{')){
  css += '\n.supplier-form-heading{display:flex;flex-direction:column;gap:5px;margin-top:8px;padding:14px 16px;border-radius:12px;background:#f5f8fc}.supplier-form-heading strong{color:#06388f}.supplier-form-heading span,.field small{font-size:12px;color:#667085}.supplier-status{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:800}.supplier-status.ok{background:#eaf8ef;color:#177245}.supplier-status.warn{background:#fff4dc;color:#9a5b00}.supplier-status.pending{background:#eef2f7;color:#475467}.supplier-profile{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}.supplier-profile>div{padding:12px;border:1px solid #e4eaf1;border-radius:10px}.supplier-profile span{display:block;font-size:11px;color:#667085;margin-bottom:4px}.supplier-document-summary{display:flex;align-items:center;gap:10px;margin:12px 0}.supplier-document-summary>span:last-child{font-size:12px;color:#667085}.supplier-doc-grid{display:grid;grid-template-columns:1fr;gap:9px}.supplier-doc-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #e4eaf1;border-radius:10px}.supplier-doc-card.complete{background:#fbfdfc}.supplier-doc-card.missing{background:#fafafa}.supplier-doc-card small{display:block;color:#667085;margin-top:4px}.supplier-doc-actions{display:flex;justify-content:flex-end;margin-top:16px}@media(max-width:720px){.supplier-profile{grid-template-columns:1fr}.supplier-doc-card{align-items:flex-start;flex-direction:column}}\n';
}

fs.writeFileSync(serverPath,server,'utf8');
fs.writeFileSync(appPath,app,'utf8');
fs.writeFileSync(indexPath,html,'utf8');
fs.writeFileSync(cssPath,css,'utf8');

for(const file of [serverPath,appPath]){
  const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(check.status!==0) throw new Error(`Error de sintaxis en ${path.basename(file)}: ${check.stderr}`);
}
console.log('Proveedores Colombia patch aplicado: expediente documental, Cámara de Comercio <=30 días y entorno en español.');
