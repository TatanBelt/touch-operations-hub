# Publicación en Render

Esta versión está preparada para un Web Service público de Render.

## Antes de publicar

La aplicación usa:
- Node.js + Express
- SQLite
- archivos adjuntos locales

Por eso necesita un disco persistente. `render.yaml` ya incluye un disco de 1 GB
montado en `/var/data`.

## Variables obligatorias durante el primer deploy

Render solicitará:

- `ADMIN_EMAIL`: correo inicial del administrador.
- `ADMIN_PASSWORD`: contraseña inicial segura del administrador.

SMTP es opcional. Si no usarás correo todavía, puedes dejar esos valores vacíos
o configurarlos luego desde Render.

## Publicación

1. Crea un repositorio privado en GitHub.
2. Sube el contenido de esta carpeta al repositorio.
3. En Render crea un Blueprint / Web Service desde ese repositorio.
4. Render detectará `render.yaml`.
5. Introduce `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
6. Confirma la creación del servicio.
7. Al finalizar tendrás una URL pública similar a:
   `https://touch-operations-hub.onrender.com`

## Importante

- El servicio debe ser público, pero los módulos siguen protegidos por login y roles.
- No publiques con contraseña `0000`.
- SQLite y `uploads` se guardan en el disco persistente.
- El disco persistente requiere un servicio Render de pago.
