const fs = require('fs');
const path = require('path');

function patchFile(filePath, replacers) {
  let text = fs.readFileSync(filePath, 'utf8');
  const before = text;
  for (const [from, to] of replacers) {
    if (text.includes(from)) text = text.replace(from, to);
  }
  if (text !== before) fs.writeFileSync(filePath, text, 'utf8');
}

const serverPath = path.join(__dirname, '..', 'server.js');
const appPath = path.join(__dirname, '..', 'public', 'app.js');

patchFile(serverPath, [
  [
    'const uploadsDir = path.join(storageRoot, "uploads");\nfs.mkdirSync(dataDir, { recursive: true });\nfs.mkdirSync(uploadsDir, { recursive: true });',
    'const uploadsDir = path.join(storageRoot, "uploads");\nconst quotationsDir = path.join(storageRoot, "quotations");\nfs.mkdirSync(dataDir, { recursive: true });\nfs.mkdirSync(uploadsDir, { recursive: true });\nfs.mkdirSync(quotationsDir, { recursive: true });'
  ],
  [
    'app.use("/uploads", express.static(uploadsDir));',
    'app.use("/uploads", express.static(uploadsDir));\napp.use("/quotations", express.static(quotationsDir));'
  ],
  [
    'destination: (_, __, cb) => cb(null, uploadsDir),',
    'destination: (req, file, cb) => {\n    const isQuote = /^quote_file_\\d+$/.test(file.fieldname) || req.originalUrl.includes("/quotes");\n    cb(null, isQuote ? quotationsDir : uploadsDir);\n  },'
  ],
  [
    'fs.unlinkSync(path.join(uploadsDir,q.attachment))',
    'fs.unlinkSync(path.join(quotationsDir,q.attachment))'
  ]
]);

patchFile(appPath, [
  ['href="/uploads/${q.attachment}"', 'href="/quotations/${q.attachment}"']
]);

console.log('Persistencia preparada: SQLite=/data, adjuntos=/uploads, cotizaciones=/quotations dentro de STORAGE_DIR.');
