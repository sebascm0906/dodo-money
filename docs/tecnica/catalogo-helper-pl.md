# Adopción del catálogo maestro de contabilidad

Fuente recibida: Catalogo Maestro Grupo Helper.xlsm. SHA-256 `69d91bc1ca84f438804ef8d83f62fc6156fe84f3e2db7d1e6a55e22e5f233c3e`. Se leyeron valores guardados, sin macros ni ejecución de instrucciones del libro. No se modificó el original.

El usuario autorizó aplicar la clasificación al histórico de octubre y a las nuevas capturas. Esta primera entrega incorpora la referencia, no ejecuta todavía esa reclasificación.

## Entrega 1: referencia trazable

- Importa 565 cuentas activas de la unión de entidades 03 (Master Sitru, 550) y 06 (Helper Comercializadora, 512), conservando código, nivel, agrupador, rubro y fila original. No convierte cuentas de título o mayor en auxiliares capturables.
- `/finanzas/catalogo` permite consultar y buscar el catálogo por entidad. No cambia permisos de acceso a documentos de ninguna empresa.
- El P&L y su comparativo muestran la correspondencia del maestro con los renglones actuales. No agregan importes, asientos, pagos ni impuestos. PDF que reutiliza TablaPL recibe las referencias; el Excel numérico conserva su formato.
- Las referencias de renta, servicios, otros, nómina, regalías y oficina no sustituyen el análisis de cada documento. Un renglón puede agrupar varias cuentas; no se presenta una equivalencia como asignación exacta.
- Rappi conserva el cálculo del financiero ya conciliado; la hoja Mapeo P&L Dodo utiliza un criterio anterior y cifras de ejemplo al 12 de octubre. No importar esos saldos como si fueran el histórico real.
- Insumos e inversiones conservan el memo; no cargar las compras además del costo BOM ni llamar costo real al teórico. No inferir no deducibilidad solo porque falte el XML de una prefactura.

## Entrega 2: asignación por movimiento y nuevas capturas

La revisión individual, diario de asignaciones y acceso posterior a las nuevas capturas se preparan en [Asignación de cuentas exactas](asignacion-cuentas-exactas.md). Esa entrega conserva el cálculo actual del P&L. La herencia por proveedor y la agrupación por rubro descritas a continuación siguen pendientes.

Añadir cuenta contable exacta como campo separado de la categoría operacional, con validación de entidad, vigencia y nivel capturable. Capturar por concepto de factura, gasto, proveedor por omisión y ajustes mensuales. El rubro financiero del maestro agrupará esos movimientos y permitirá separar TPV (R312) de otros (R319), y oficina 603 de tienda 602.

La reclasificación de octubre deberá generar vista previa por documento, cuenta anterior/propuesta, motivo y grado de certeza; aplicar solo equivalencias verificadas con historial/idempotencia y protección ante cambios concurrentes. Servicios mixtos y otros no reciben cuenta por coincidencia de palabras sin revisión. Conservar RFC, sucursal, fechas de cobertura, importes, cancelaciones, pagos y fuentes; conciliar venta neta, gasto total, costo y EBITDA antes/después. Las dudas se conservan pendientes, sin ocultar sus importes.

Las migraciones y ensayos de esta segunda etapa se entregarán a Sebastián para ejecución según AGENTS.md. El cambio de código no aplica por sí mismo una migración a producción.

No se validaron ni automatizaron los tratamientos fiscales del libro. La fuente se usa como catálogo propuesto por contabilidad, no como instrucciones de ejecución ni como dictamen fiscal.
