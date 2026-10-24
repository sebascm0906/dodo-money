# Asignación contable con revisión

El catálogo del PR 52 es referencia. Esta entrega añade una clasificación exacta por concepto de factura (cabecera únicamente si no tiene conceptos), gasto y ajuste de gastos del mes. Incluye los históricos que tengan cobertura en octubre, aunque la factura sea de otro mes. Las nuevas capturas aparecen en el mismo flujo después de guardar el origen; la ficha de factura y Gastos enlazan a la revisión. No hay asignación masiva ni herencia silenciosa por proveedor.

## Uso y equivalencias

1. P&L → Asignar cuentas → octubre 2026. Revisar documento, categoría, RFC e importe de referencia. La lista tiene páginas de 50 y contador; no es un reporte de importes devengados ni netos (las notas de crédito y descuentos conservan su tratamiento en el P&L).
2. Elegir la razón social si el gasto no la identifica. La factura conserva su receptor. Solo cuentas capturables de esa entidad; títulos y mayores quedan fuera. Una subcuenta de nivel 2 solo es capturable si no tiene auxiliares activos para esa entidad.
3. Las referencias de la categoría son alternativas del maestro, nunca una asignación por coincidencia del nombre. Elegir cuenta, abrir vista previa, revisar origen, anterior/propuesta y RFC, y confirmar con motivo de 12–1000 caracteres.
4. Corregir o retirar por el mismo flujo. Cada versión conserva autor, fecha, motivo, cuenta anterior y fotografía de metadatos revisados. El archivo original continúa en su módulo.

Se protege la separación entre compras de insumos (502, memo), inversiones (15x/17x, memo), gastos de tienda (602) y oficina (603). El RFC histórico inactivo requiere corregir primero el origen con su procedimiento existente; nunca se remapea por parecido. No se infiere tratamiento fiscal por falta de XML.

## Datos y permisos

Catálogo inmutable para los usuarios, semilla versionada por SHA-256 del archivo. `contabilidad_asignaciones` es un diario sin UPDATE/DELETE/INSERT para authenticated. Su vista actual toma la mayor revisión, no el timestamp. Función pública invoker delega en función privada definer de búsqueda vacía, con validación de administrador activo, confirmación, fuente, entidad/sucursal y cuenta. Corporativo consulta; gerente/encargado/anónimo no asignan ni consultan el diario.

Bloqueos de origen + por clave y solicitud, versión anterior esperada y huella de origen impiden confirmaciones obsoletas. Cambiar un dato de la factura, incluso pagos o estado, invalida la huella: la clasificación se muestra «Revisar», no se considera verificada automáticamente. Facturas canceladas/sustituidas y gastos anulados salen de pendientes; su historial conserva acceso por la ruta original.

## Alcance del P&L

La cuenta exacta queda guardada para el desglose contable. Esta entrega no cambia `cuenta_pl`, los cálculos, prorrateos, costo, ni agrupa todavía el P&L por el nuevo rubro. No reclasifica automáticamente octubre, nómina, movimientos bancarios o cargos calculados. La siguiente entrega de agrupación por cuenta/rubro debe conciliar antes/después y separar R312 de R319; no sumar estas filas de referencia como si fueran el estado financiero.

## Instalación y validación

Sebastián ejecuta primero `supabase/migrations/20261024001536_cuentas_contables_exactas.sql`, después `supabase/pruebas/20261024001536_cuentas_contables_exactas.sql`. Las pruebas terminan con NOTICE «PRUEBAS OK» y ROLLBACK. La migración crea estructura y catálogo; no aplica asignaciones reales. No publicar las pantallas dependientes sin recibir el resultado, según AGENTS.md.

Ensayo local en PostgreSQL/PGlite con tablas de soporte aisladas: migración completa y pruebas reversibles. Falta validación con el esquema completo de Supabase por Sebastián y revisión visual autenticada en preview después de la migración. No se ejecutaron modificaciones en producción.
