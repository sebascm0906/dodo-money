-- Solo lectura, después de la migración de cuentas exactas.
-- Revisar con acceso admin en la aplicación. SQL Editor ejecuta como postgres:
-- se establece identidad admin exclusivamente dentro de esta transacción de lectura.
begin read only;
select set_config('request.jwt.claims',json_build_object('sub',(select id from public.perfiles where rol::text='admin' and activo and not debe_cambiar_contrasena order by id limit 1),'role','authenticated')::text,true);
select m.clave,m.fecha,m.cubre_desde,m.cubre_hasta,m.descripcion,m.rfc,m.sucursal_id,m.categoria,m.importe as importe_origen,
 a.codigo as cuenta_actual,a.rfc as rfc_asignado,
 case when a.codigo is null then 'PENDIENTE' when a.huella<>m.huella then 'REVISAR ORIGEN MODIFICADO' else 'ASIGNADA' end as revision
from public.contabilidad_movimientos m left join public.contabilidad_actual a using(clave)
where m.cubre_desde<='2026-10-31' and m.cubre_hasta>='2026-10-01'
order by m.fecha,m.clave;
rollback;
