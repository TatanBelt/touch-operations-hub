# Touch Compras Enterprise — by Ohla

Versión avanzada de la plataforma de compras para Visual Studio Code.

## Qué incluye

### Flujo de compras
- Solicitud de compra.
- Proveedor.
- Centro de costo.
- Proyecto / cliente.
- Cotización o soporte adjunto.
- Aprobaciones multinivel acumulativas.
- Generación de orden de compra.
- OC en PDF con logo Touch by Ohla.
- Registro de factura.
- Estado de factura.
- Estado de pago.

### Aprobación multinivel

Regla demo:

- Hasta $1.000.000:
  - Coordinación.
- $1.000.001 a $5.000.000:
  - Coordinación.
  - Dirección.
- Más de $5.000.000:
  - Coordinación.
  - Dirección.
  - Gerencia.

Una solicitud solo queda `APROBADA` después de completar todos los niveles aplicables.

### Presupuestos
- Presupuesto por centro de costo.
- Presupuesto por proyecto / cliente.
- Valor comprometido por órdenes de compra.
- Disponible.
- Edición de presupuesto para Admin.

### Dashboard financiero
- Presupuesto total.
- Total comprometido.
- Facturado.
- Pagado.
- Facturas vencidas.
- Ejecución por centro de costo.

### Notificaciones
- Notificaciones dentro de la app.
- Aviso al siguiente nivel aprobador.
- Aviso al solicitante al aprobar o rechazar.

### Email opcional
La app puede enviar correos si configuras SMTP en `.env`.

Copia:

`.env.example`

como:

`.env`

y completa los datos SMTP.

Si no configuras SMTP, la app sigue funcionando y las alertas aparecen dentro de Touch Compras.

## Usuarios demo

Administrador:
- admin@touchlatam.com
- 0000

Comprador:
- compras@touchlatam.com
- 0000

Aprobador Coordinación:
- coord@touchlatam.com
- 0000

Aprobador Dirección:
- direccion@touchlatam.com
- 0000

Aprobador Gerencia:
- gerencia@touchlatam.com
- 0000

## Instalar

Debes tener Node.js instalado.

En VS Code abre la terminal dentro de la carpeta y ejecuta:

```bash
npm install
```

Luego:

```bash
npm start
```

Abre:

```text
http://localhost:3000
```

## Modo desarrollo

```bash
npm run dev
```

## Archivos principales

- `server.js` — backend y API.
- `public/index.html` — interfaz.
- `public/styles.css` — identidad Touch.
- `public/app.js` — frontend.
- `public/logo-touch-ohla.png` — logo.
- `data/` — base SQLite.
- `uploads/` — cotizaciones y facturas.
- `.env.example` — configuración de email.

## Producción

Antes de publicar para uso real:

- cambiar `SESSION_SECRET`;
- usar HTTPS;
- migrar sesiones a un almacén persistente;
- definir reglas corporativas reales de aprobación;
- conectar correo corporativo;
- definir permisos por área;
- usar almacenamiento seguro para documentos;
- configurar copias de seguridad;
- revisar seguridad y cumplimiento.


## Módulo de Inventarios

Clasifica y controla:
- Activo fijo.
- Activo de tecnología.
- Activo de información.
- Activo circulante.

Cada ingreso permite código automático, nombre, descripción, cantidad, unidad, costo unitario, marca, modelo, serial, ubicación, responsable, proveedor, factura, fechas, soporte y observaciones.

Movimientos disponibles: salida, asignación, devolución, traslado, ajuste de cantidad y baja. Cada activo conserva su historial de movimientos.

Permisos: Administrador y Comprador pueden registrar ingresos y movimientos. Aprobador puede consultar.


## Interfaz Marketing Operations

Esta versión incorpora una renovación visual del `index` y del dashboard orientada a una compañía/agencia de marketing:

- Login corporativo tipo Marketing Operations Hub.
- Mensajes enfocados en campañas, activaciones, eventos, BTL, retail y producción.
- Dashboard con lenguaje de inversión y operación de proyectos.
- Accesos rápidos a solicitudes, órdenes de compra e inventarios.
- Interfaz premium basada en azul y turquesa Touch by Ohla.
- Experiencia responsive para desktop y móvil.


## Roles, accesos y dashboards dinámicos

Esta versión agrega:

- Dashboard dinámico según el rol:
  - ADMIN: control total del hub.
  - COMPRADOR: compras, órdenes, proveedores, facturas e inventarios.
  - APROBADOR: pendientes por aprobar, trazabilidad y presupuesto.
- Control de accesos por rol desde un módulo nuevo: **Control de accesos**.
- Matriz de permisos configurable por el administrador para cada módulo:
  - Ver
  - Crear
  - Editar
  - Aprobar
  - Gestionar
- Menú lateral dinámico según permisos reales del rol.
- Gestión de usuarios con edición de:
  - nombre
  - correo
  - rol
  - nivel aprobador
  - estado activo/inactivo
  - cambio opcional de contraseña

### Nota
Después de cambiar permisos, los usuarios verán el nuevo menú y las nuevas restricciones al volver a cargar sesión.

## Corrección RBAC

Esta compilación corrige el orden de inicialización del sistema de roles y permisos.
`DEFAULT_ROLE_PERMISSIONS` y `MODULES` se cargan antes de ejecutar `initDB()`.


## Eliminación exclusiva para ADMIN

La eliminación queda protegida en dos niveles:

- El botón `Eliminar` solo se muestra cuando el usuario tiene rol `ADMIN`.
- Las rutas `DELETE` del backend también validan estrictamente que el rol sea `ADMIN`.

Se habilitó eliminación para:
- Solicitudes de compra.
- Órdenes de compra.
- Facturas.
- Proveedores.
- Inventarios.
- Usuarios.

Reglas de seguridad:
- Una solicitud con OC asociada no puede borrarse.
- Una OC con facturas asociadas no puede borrarse.
- Un proveedor con compras, órdenes o activos asociados no puede borrarse.
- Al eliminar un activo se elimina también su historial de movimientos.
- Los usuarios se desactivan de forma lógica para conservar trazabilidad histórica.
- El administrador no puede eliminar su propia cuenta activa.
