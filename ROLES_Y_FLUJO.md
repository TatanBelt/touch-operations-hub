# Roles y flujo de compras – Touch Operations Hub

## Flujo recomendado
1. **KAM / Solicitante** registra la solicitud de compra y adjunta el soporte general.
2. La solicitud pasa por la ruta de aprobación configurada.
3. **Comprador** consulta la solicitud y carga las cotizaciones recibidas de los proveedores.
4. **Comprador** genera la orden de compra cuando corresponde.
5. **Tesorería y Pagos** registra facturas, vencimientos y estado de pago.
6. **Control de Gestión** consulta la trazabilidad y administra el control presupuestal.
7. **Administrador** gestiona usuarios, perfiles y accesos.

## Roles
- ADMIN: control total.
- KAM: crea solicitudes y hace seguimiento.
- SOLICITANTE: crea y consulta sus propias solicitudes.
- COMPRADOR: carga cotizaciones, gestiona proveedores y órdenes.
- TESORERIA_PAGOS: facturación, vencimientos y pagos.
- CONTROL_GESTION: presupuesto, ejecución y trazabilidad.
- APROBADOR: aprueba según nivel COORDINACION / DIRECCION / GERENCIA.

## Control de accesos simplificado
Cada módulo se configura con solo tres niveles:
- **Sin acceso**
- **Solo consulta**
- **Gestionar**

El botón **Restaurar perfil recomendado** devuelve un rol a los permisos base definidos por el sistema.

## Persistencia
La aplicación usa `STORAGE_DIR` como raíz de almacenamiento. Con disco persistente en Render montado en `/var/data`, configurar:

`STORAGE_DIR=/var/data`

La base SQLite queda en `/var/data/data`, los adjuntos generales en `/var/data/uploads` y las cotizaciones en `/var/data/quotations`.
