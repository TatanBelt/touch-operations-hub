require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const email = String(process.env.EXTRA_ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.EXTRA_ADMIN_PASSWORD || '');

if (!email || !password) {
  console.log('ADMIN adicional omitido: faltan EXTRA_ADMIN_EMAIL o EXTRA_ADMIN_PASSWORD.');
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

const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email);

if (existing) {
  db.prepare("UPDATE users SET name=?, password_hash=?, role='ADMIN', approval_level=NULL, active=1 WHERE id=?")
    .run('Sebastian Beltran', hash, existing.id);
  console.log('ADMIN adicional actualizado:', email);
} else {
  db.prepare('INSERT INTO users(name,email,password_hash,role,approval_level,active) VALUES (?,?,?,?,?,1)')
    .run('Sebastian Beltran', email, hash, 'ADMIN', null);
  console.log('ADMIN adicional creado:', email);
}

db.close();
