const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');
const appPath = path.join(root, 'public', 'app.js');
const indexPath = path.join(root, 'public', 'index.html');
const cssPath = path.join(root, 'public', 'styles.css');

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,s){ fs.writeFileSync(p,s,'utf8'); }
function replaceRequired(text, from, to, label){
  if(text.includes(to)) return text;
  if(!text.includes(from)) throw new Error(`No se encontró el bloque para ${label}`);
  return text.replace(from,to);
}

// ---- server.js ----
let server = read(serverPath);
if(!server.includes('const crypto = require("crypto");')){
  server = replaceRequired(server,
    'const nodemailer = require("nodemailer");\n',
    'const nodemailer = require("nodemailer");\nconst crypto = require("crypto");\n',
    'crypto'
  );
}

if(!server.includes('CREATE TABLE IF NOT EXISTS password_reset_tokens')){
  server = replaceRequired(server,
`    CREATE TABLE IF NOT EXISTS notifications (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,`,
`    CREATE TABLE IF NOT EXISTS password_reset_tokens (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      user_id INTEGER NOT NULL,\n      token_hash TEXT UNIQUE NOT NULL,\n      expires_at TEXT NOT NULL,\n      used_at TEXT,\n      created_at TEXT DEFAULT CURRENT_TIMESTAMP,\n      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE\n    );\n\n    CREATE TABLE IF NOT EXISTS notifications (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    'tabla password_reset_tokens'
  );
}

const oldLogin = `app.post("/api/login",(req,res)=>{\n  const {email,password}=req.body;\n  const u=db.prepare("SELECT * FROM users WHERE email=? AND active=1").get(email);\n  if(!u || !bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:"Credenciales incorrectas"});\n  req.session.user={id:u.id,name:u.name,email:u.email,role:u.role,approval_level:u.approval_level};\n  res.json(req.session.user);\n});\napp.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));\napp.get("/api/me",(req,res)=>res.json(req.session.user||null));`;

if(!server.includes('app.post("/api/password/forgot"')){
  const newLogin = `app.post("/api/login",(req,res)=>{\n  const email=String(req.body?.email||"").trim().toLowerCase();\n  const password=String(req.body?.password||"");\n  const u=db.prepare("SELECT * FROM users WHERE lower(email)=? AND active=1").get(email);\n  if(!u || !bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:"Credenciales incorrectas"});\n  req.session.user={id:u.id,name:u.name,email:u.email,role:u.role,approval_level:u.approval_level};\n  res.json(req.session.user);\n});\n\napp.post("/api/password/forgot",async(req,res)=>{\n  const email=String(req.body?.email||"").trim().toLowerCase();\n  const u=db.prepare("SELECT * FROM users WHERE lower(email)=? AND active=1").get(email);\n  if(u){\n    const rawToken=crypto.randomBytes(32).toString("hex");\n    const tokenHash=crypto.createHash("sha256").update(rawToken).digest("hex");\n    const expiresAt=new Date(Date.now()+30*60*1000).toISOString();\n    db.prepare("DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at < ?").run(u.id,new Date().toISOString());\n    db.prepare("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES (?,?,?)").run(u.id,tokenHash,expiresAt);\n    const base=String(process.env.APP_BASE_URL||\`${'${req.protocol}'}://${'${req.get("host")}' }\`).replace(/\\/$/,"");\n    const resetUrl=\`${'${base}'}/?reset=${'${encodeURIComponent(rawToken)}'}\`;\n    const sent=await maybeSendEmail(u.email,"Touch Colombia Compras - Restablecer contraseña",\`Hola ${'${u.name}'},\\n\\nRecibimos una solicitud para cambiar tu contraseña de Touch Colombia Compras.\\n\\nAbre este enlace (vigente por 30 minutos):\\n${'${resetUrl}'}\\n\\nSi no solicitaste este cambio, puedes ignorar este mensaje.\`);\n    if(!sent) console.warn("No se pudo enviar el correo de recuperación. Revisa SMTP_PASS.");\n  }\n  res.json({ok:true,message:"Si el correo está registrado, recibirás un enlace de recuperación."});\n});\n\napp.post("/api/password/reset",async(req,res)=>{\n  const token=String(req.body?.token||"").trim();\n  const newPassword=String(req.body?.new_password||"");\n  if(newPassword.length<8) return res.status(400).json({error:"La nueva contraseña debe tener mínimo 8 caracteres"});\n  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");\n  const row=db.prepare(\`SELECT prt.*,u.email,u.name FROM password_reset_tokens prt JOIN users u ON u.id=prt.user_id WHERE prt.token_hash=? AND prt.used_at IS NULL AND prt.expires_at>?\`).get(tokenHash,new Date().toISOString());\n  if(!row) return res.status(400).json({error:"El enlace de recuperación no es válido o ya venció"});\n  db.transaction(()=>{\n    db.prepare("UPDATE users SET password_hash=?,active=1 WHERE id=?").run(bcrypt.hashSync(newPassword,10),row.user_id);\n    db.prepare("UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);\n  })();\n  await maybeSendEmail(row.email,"Touch Colombia Compras - Contraseña actualizada",\`Hola ${'${row.name}'},\\n\\nTu contraseña fue actualizada correctamente. Si no realizaste este cambio, contacta al administrador.\`);\n  res.json({ok:true});\n});\n\napp.post("/api/password/change",auth,async(req,res)=>{\n  const currentPassword=String(req.body?.current_password||"");\n  const newPassword=String(req.body?.new_password||"");\n  if(newPassword.length<8) return res.status(400).json({error:"La nueva contraseña debe tener mínimo 8 caracteres"});\n  const u=db.prepare("SELECT * FROM users WHERE id=? AND active=1").get(req.session.user.id);\n  if(!u || !bcrypt.compareSync(currentPassword,u.password_hash)) return res.status(400).json({error:"La contraseña actual no es correcta"});\n  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(newPassword,10),u.id);\n  await maybeSendEmail(u.email,"Touch Colombia Compras - Contraseña actualizada",\`Hola ${'${u.name}'},\\n\\nTu contraseña fue modificada correctamente en Touch Colombia Compras.\`);\n  res.json({ok:true});\n});\n\napp.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));\napp.get("/api/me",(req,res)=>res.json(req.session.user||null));`;
  server = replaceRequired(server, oldLogin, newLogin, 'login y recuperación');
}
write(serverPath, server);

// ---- index.html ----
let html = read(indexPath);
html = html.replace(/<h2>Bienvenido a Touch[^<]*<\/h2>/, '<h2>Bienvenido a Touch Colombia Compras</h2>');
html = html.replace(/<input id="email" type="email"[^>]*required>/, '<input id="email" type="email" value="beltranse13@gmail.com" autocomplete="username" required>');
html = html.replace(/<input id="password" type="password"[^>]*required>/, '<input id="password" type="password" placeholder="Ingresa tu contraseña" autocomplete="current-password" required>');
html = html.replace(/<button class="primary big login-submit refined-submit">[^<]*(?:<span>→<\/span>)?<\/button>/, '<button class="primary big login-submit refined-submit">Ingresar <span>→</span></button>');
if(!html.includes('id="forgotPassword"')){
  html = html.replace('<button class="primary big login-submit refined-submit">Ingresar <span>→</span></button>', '<button class="primary big login-submit refined-submit">Ingresar <span>→</span></button>\n      <button type="button" id="forgotPassword" class="password-link">¿Olvidaste tu contraseña?</button>');
}
if(!html.includes('id="changePassword"')){
  html = html.replace('<button class="logout" id="logout">Cerrar sesión <span>↗</span></button>', '<button class="logout change-password-btn" id="changePassword">Cambiar contraseña <span>→</span></button>\n    <button class="logout" id="logout">Cerrar sesión <span>↗</span></button>');
}
write(indexPath, html);

// ---- app.js ----
let app = read(appPath);
const oldSubmit = `$("#loginForm").onsubmit=async e=>{\n e.preventDefault();\n try{\n   me=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#email").value,password:$("#password").value})});\n   await start();\n }catch(err){toast(err.message)}\n};`;
if(!app.includes('forgotPasswordModal')){
  const newSubmit = `$("#loginForm").onsubmit=async e=>{\n e.preventDefault();\n const submit=e.submitter||e.target.querySelector("button[type=submit],button:not([type])");\n if(submit) submit.disabled=true;\n try{\n   me=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#email").value.trim(),password:$("#password").value})});\n   await start();\n }catch(err){toast(err.message)}\n finally{if(submit) submit.disabled=false;}\n};\n$("#forgotPassword").onclick=()=>forgotPasswordModal();\n$("#changePassword").onclick=()=>changePasswordModal();`;
  app = replaceRequired(app, oldSubmit, newSubmit, 'submit login');

  const marker = 'async function notificationsModal(){';
  const funcs = `function forgotPasswordModal(){\n const email=$("#email")?.value?.trim()||"";\n openModal("Recuperar contraseña",\`<form id="forgotPasswordForm" class="formgrid"><div class="field full"><label>Correo registrado</label><input type="email" name="email" value="${'${email}'}" required></div><div class="notice full">Te enviaremos un enlace de recuperación con vigencia de 30 minutos.</div><div class="full"><button class="primary">Enviar enlace</button></div></form>\`);\n $("#forgotPasswordForm").onsubmit=async e=>{e.preventDefault();try{const r=await api("/api/password/forgot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e.target.email.value.trim()})});$("#modal").classList.add("hidden");toast(r.message||"Revisa tu correo")}catch(err){toast(err.message)}};\n}\nfunction changePasswordModal(){\n openModal("Cambiar contraseña",\`<form id="changePasswordForm" class="formgrid"><div class="field full"><label>Contraseña actual</label><input type="password" name="current_password" required></div><div class="field"><label>Nueva contraseña</label><input type="password" name="new_password" minlength="8" required></div><div class="field"><label>Confirmar nueva contraseña</label><input type="password" name="confirm_password" minlength="8" required></div><div class="notice full">Al cambiarla recibirás una notificación en tu correo registrado.</div><div class="full"><button class="primary">Actualizar contraseña</button></div></form>\`);\n $("#changePasswordForm").onsubmit=async e=>{e.preventDefault();if(e.target.new_password.value!==e.target.confirm_password.value){toast("Las contraseñas no coinciden");return;}try{await api("/api/password/change",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({current_password:e.target.current_password.value,new_password:e.target.new_password.value})});$("#modal").classList.add("hidden");toast("Contraseña actualizada")}catch(err){toast(err.message)}};\n}\nfunction resetPasswordModal(token){\n openModal("Crear nueva contraseña",\`<form id="resetPasswordForm" class="formgrid"><div class="field"><label>Nueva contraseña</label><input type="password" name="new_password" minlength="8" required></div><div class="field"><label>Confirmar contraseña</label><input type="password" name="confirm_password" minlength="8" required></div><div class="full"><button class="primary">Guardar nueva contraseña</button></div></form>\`);\n $("#resetPasswordForm").onsubmit=async e=>{e.preventDefault();if(e.target.new_password.value!==e.target.confirm_password.value){toast("Las contraseñas no coinciden");return;}try{await api("/api/password/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,new_password:e.target.new_password.value})});history.replaceState({},"",location.pathname);$("#modal").classList.add("hidden");toast("Contraseña actualizada. Ya puedes iniciar sesión.")}catch(err){toast(err.message)}};\n}\n\n`;
  if(!app.includes(marker)) throw new Error('No se encontró notificationsModal');
  app = app.replace(marker, funcs + marker);
  app = app.replace(/\nboot\(\);\s*$/, '\nboot();\nconst resetToken=new URLSearchParams(location.search).get("reset");\nif(resetToken) setTimeout(()=>resetPasswordModal(resetToken),80);\n');
}
write(appPath, app);

// ---- styles.css ----
let css = read(cssPath);
if(!css.includes('.password-link{')){
  css += `\n.password-link{border:0;background:transparent;color:#0d56c6;font-weight:800;cursor:pointer;margin:12px auto 0;padding:8px 12px;font-size:13px}.password-link:hover{text-decoration:underline}.change-password-btn{margin-top:auto;margin-bottom:8px;border-color:rgba(255,255,255,.14)!important;background:rgba(255,255,255,.04)!important}.change-password-btn+.logout{margin-top:0}\n`;
}
write(cssPath, css);

for(const f of [serverPath, appPath]){
  const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
  if(r.status!==0) throw new Error(`Error de sintaxis en ${f}: ${r.stderr}`);
}
console.log('Auth/password patch aplicado correctamente.');