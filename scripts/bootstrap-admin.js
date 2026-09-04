require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const email = String(process.env.ADMIN_EMAIL || 'admin@touchlatam.com').trim().toLowerCase();
const hash = String(process.env.ADMIN_PASSWORD_HASH || '');
if (!hash) {
  console.log('ADMIN bootstrap omitido: falta ADMIN_PASSWORD_HASH.');
  process.exit(0);
}

const storageRoot = process.env.STORAGE_DIR || path.join(__dirname, '..');
const dataDir = path.join(storageRoot, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'touch_compras_enterprise.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    approval_level TEXT,
    active INTEGER DEFAULT 1
  );
`);

let user = db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email);
if (user) {
  db.prepare("UPDATE users SET name=?, password_hash=?, role='ADMIN', approval_level=NULL, active=1 WHERE id=?")
    .run('Administrador Touch', hash, user.id);
} else {
  user = db.prepare("SELECT id FROM users WHERE role='ADMIN' ORDER BY id LIMIT 1").get();
  if (user) {
    db.prepare("UPDATE users SET name=?, email=?, password_hash=?, role='ADMIN', approval_level=NULL, active=1 WHERE id=?")
      .run('Administrador Touch', email, hash, user.id);
  } else {
    db.prepare('INSERT INTO users(name,email,password_hash,role,approval_level,active) VALUES (?,?,?,?,?,1)')
      .run('Administrador Touch', email, hash, 'ADMIN', null);
  }
}

console.log('ADMIN bootstrap listo:', email);
db.close();
