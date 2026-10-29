-- Ejecutar completo en Supabase SQL Editor como postgres.
-- ENSAYO por defecto: ROLLBACK al final. Después de revisar el resultado,
-- cambiar únicamente el último ROLLBACK por COMMIT para aplicar.
-- No crea otro pago, compra, gasto ni aplicación. No modifica cortes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- El bloqueo exclusivo de pagos impide cualquier escritura concurrente durante
-- la excepción puntual al guard de respaldo histórico; RLS y demás triggers
-- siguen activos. El guard se restaura antes de terminar esta transacción.
LOCK TABLE public.pagos IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.cajas,public.movimientos,public.reservas_boveda,
 public.pago_aplicaciones,public.facturas,public.pagos_boveda_eventos,
 public.pagos_ventas_eventos,public.gastos_caja_chica,public.compra_notas,
 public.cierres_dia,public.recolecciones_corporativo IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE arca_resultado(resultado text,pago_id uuid,fecha_pago date,
 monto numeric,saldo_antes numeric,saldo_despues numeric) ON COMMIT DROP;
DO $$
DECLARE
 p public.pagos; despues public.pagos; f public.facturas;
 s constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 pago constant uuid:='3a9631e2-8dca-45b7-8223-07feb878332e';
 factura constant uuid:='74a7dfab-19b9-446d-a3cb-1933f930e937';
 autor constant uuid:='fab8c3e1-636d-45bc-80e3-a7185ebc75fd';
 marca constant text:='ARCA-EFECTIVO-20261027';
 motivo constant text:='ARCA-EFECTIVO-20261027. Corrección autorizada por Sebastián: el pago de $2,610.50 a Arca del 23/10/2026 no estaba descontado. El efectivo de ventas del 22/10 ya fue ingresado a bóveda por los retiros de turno. Se reconoce ahora una única salida del acumulado de bóveda; se conserva el mismo pago, compra, fecha, ticket y aplicación. No modifica conteos ni cortes anteriores ni duplica el gasto en el P&L.';
 saldo0 numeric;saldo1 numeric;libre numeric;reserva uuid;op date;
 aplicaciones0 jsonb;f0 jsonb;cierres0 jsonb;movimientos0 jsonb;
 gastos0 jsonb;recolecciones0 jsonb;eventos0 bigint;pagos0 bigint;
 respaldo text;parte integer;permitidos text[]:=ARRAY['origen_fondos','origen_historico',
 'sucursal_historica_id','nota_regularizacion','reserva_boveda_id','cuenta_origen','nota_boveda'];
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Ejecutar como postgres en SQL Editor.';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=autor AND activo AND rol::text='admin') THEN
   RAISE EXCEPTION 'El autor esperado no es administrador activo.';END IF;
 SELECT * INTO p FROM public.pagos WHERE id=pago;
 SELECT * INTO f FROM public.facturas WHERE id=factura;
 IF p.id IS NULL OR f.id IS NULL OR p.monto<>2610.50 OR p.fecha<>'2026-10-23'::date
 OR p.anulado_en IS NOT NULL OR p.forma::text<>'efectivo'
 OR f.sucursal_id IS DISTINCT FROM s OR p.proveedor_id IS DISTINCT FROM f.proveedor_id
 OR f.folio IS DISTINCT FROM 'Ticket 6230676446' OR f.total<>2610.50
 OR p.comprobante_ruta IS NULL THEN RAISE EXCEPTION 'Pago o compra difiere del expediente esperado.';END IF;
 IF (SELECT count(*) FROM public.pago_aplicaciones WHERE pago_id=pago)<>1
 OR NOT EXISTS(SELECT 1 FROM public.pago_aplicaciones WHERE pago_id=pago AND factura_id=factura AND monto=2610.50)
 OR public.saldo_factura(factura)<>0 THEN RAISE EXCEPTION 'Aplicación o saldo de factura inesperado.';END IF;
 IF EXISTS(SELECT 1 FROM public.compra_notas WHERE factura_id=factura AND texto LIKE marca||'. Corrección aplicada%') THEN
   IF p.origen_fondos<>'boveda' OR p.reserva_boveda_id IS NULL
   OR (SELECT count(*) FROM public.pagos_boveda_eventos WHERE pago_id=pago)<>1
   OR NOT EXISTS(SELECT 1 FROM public.pagos_boveda_eventos WHERE pago_id=pago AND tipo='pago' AND importe=2610.50 AND sucursal_id=s)
   THEN RAISE EXCEPTION 'Marca previa inconsistente; revisar sin modificar.';END IF;
   INSERT INTO arca_resultado SELECT 'YA APLICADO; SIN OTRO DESCUENTO',pago,p.fecha,p.monto,saldo,saldo
   FROM public.saldos_cajas WHERE sucursal_id=s AND tipo='boveda';RETURN;
 END IF;
 IF p.origen_fondos IS DISTINCT FROM 'historico' OR p.origen_historico IS DISTINCT FROM 'ventas'
 OR p.sucursal_historica_id IS DISTINCT FROM s OR p.reserva_boveda_id IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.pagos_boveda_eventos WHERE pago_id=pago)
 OR EXISTS(SELECT 1 FROM public.pagos_ventas_eventos WHERE pago_id=pago)
 THEN RAISE EXCEPTION 'El pago ya tiene efecto de efectivo o cambió su origen.';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pagos'::regclass
 AND tgname='proteger_respaldo_pago_historico' AND tgenabled='O') THEN
   RAISE EXCEPTION 'Guard histórico ausente o no habilitado; no continuar.';END IF;
 SELECT saldo INTO saldo0 FROM public.saldos_cajas WHERE sucursal_id=s AND tipo='boveda';
 SELECT saldo0-fondo_boveda
 -coalesce((SELECT sum(pendiente) FROM public.reservas_boveda_saldo WHERE sucursal_id=s AND anulado_en IS NULL),0)
 -coalesce((SELECT sum(monto) FROM public.movimientos WHERE sucursal_id=s AND tipo='salida_corporativo' AND estado='pendiente'),0)
 INTO libre FROM public.sucursales WHERE id=s;
 IF libre IS NULL OR libre<2610.50 THEN RAISE EXCEPTION 'Sin efectivo libre; conserva fondo y entrega pendiente.';END IF;
 op:=((now() AT TIME ZONE 'America/Mexico_City')-interval '4 hours')::date;
 IF EXISTS(SELECT 1 FROM public.cierres_dia WHERE sucursal_id=s AND fecha=op) THEN
   RAISE EXCEPTION 'Día operativo cerrado; ejecutar en un día abierto.';END IF;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY id) INTO aplicaciones0 FROM public.pago_aplicaciones a WHERE pago_id=pago;
 f0:=to_jsonb(f);
 SELECT jsonb_agg(to_jsonb(c) ORDER BY id) INTO cierres0 FROM public.cierres_dia c WHERE sucursal_id=s;
 SELECT jsonb_agg(to_jsonb(m) ORDER BY id) INTO movimientos0 FROM public.movimientos m WHERE sucursal_id=s;
 SELECT jsonb_agg(to_jsonb(g) ORDER BY id) INTO gastos0 FROM public.gastos_caja_chica g WHERE sucursal_id=s;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO recolecciones0 FROM public.recolecciones_corporativo r WHERE sucursal_id=s;
 SELECT count(*) INTO pagos0 FROM public.pagos;
 SELECT count(*) INTO eventos0 FROM public.pagos_boveda_eventos;
 -- Respaldo íntegro en notas privadas de la misma compra, en partes de <2000 caracteres.
 respaldo:=jsonb_build_object('pago_anterior',to_jsonb(p),'aplicaciones',aplicaciones0,
 'saldo_boveda_antes',saldo0,'autor',autor,'capturado_en',now())::text;
 FOR parte IN 0..((length(respaldo)-1)/1700) LOOP
   INSERT INTO public.compra_notas(factura_id,texto,usuario_id)
   VALUES(factura,marca||'. Respaldo anterior parte '||(parte+1)||': '||substr(respaldo,parte*1700+1,1700),autor);
 END LOOP;
 -- Reserva consumida por el MISMO pago: permite también una devolución correcta
 -- por el flujo estándar si en el futuro se anula este pago con motivo.
 INSERT INTO public.reservas_boveda(sucursal_id,factura_id,monto,fecha_pago,motivo,creado_por)
 VALUES(s,factura,2610.50,op,motivo,autor) RETURNING id INTO reserva;
 ALTER TABLE public.pagos DISABLE TRIGGER proteger_respaldo_pago_historico;
 UPDATE public.pagos SET origen_fondos='boveda',origen_historico=NULL,
 sucursal_historica_id=NULL,nota_regularizacion=NULL,reserva_boveda_id=reserva,
 cuenta_origen='Bóveda · corrección de efectivo histórico',nota_boveda=motivo
 WHERE id=pago;
 ALTER TABLE public.pagos ENABLE TRIGGER proteger_respaldo_pago_historico;
 INSERT INTO public.pagos_boveda_eventos(pago_id,sucursal_id,tipo,importe,fecha_operativa,usuario_id)
 VALUES(pago,s,'pago',2610.50,op,autor);
 SELECT * INTO despues FROM public.pagos WHERE id=pago;
 SELECT saldo INTO saldo1 FROM public.saldos_cajas WHERE sucursal_id=s AND tipo='boveda';
 IF saldo1 IS DISTINCT FROM saldo0-2610.50
 OR (to_jsonb(despues)-permitidos) IS DISTINCT FROM (to_jsonb(p)-permitidos)
 OR (SELECT to_jsonb(x) FROM public.facturas x WHERE id=factura) IS DISTINCT FROM f0
 OR (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.pago_aplicaciones a WHERE pago_id=pago) IS DISTINCT FROM aplicaciones0
 OR (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.cierres_dia c WHERE sucursal_id=s) IS DISTINCT FROM cierres0
 OR (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.movimientos m WHERE sucursal_id=s) IS DISTINCT FROM movimientos0
 OR (SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM public.gastos_caja_chica g WHERE sucursal_id=s) IS DISTINCT FROM gastos0
 OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.recolecciones_corporativo r WHERE sucursal_id=s) IS DISTINCT FROM recolecciones0
 OR (SELECT count(*) FROM public.pagos)<>pagos0
 OR (SELECT count(*) FROM public.pagos_boveda_eventos)<>eventos0+1
 OR (SELECT pendiente FROM public.reservas_boveda_saldo WHERE id=reserva)<>0
 OR public.saldo_factura(factura)<>0 THEN
   RAISE EXCEPTION 'No se cumple la conservación o el descuento exacto; todo revertido.';END IF;
 INSERT INTO public.compra_notas(factura_id,texto,usuario_id)
 VALUES(factura,marca||'. Corrección aplicada. '||motivo||' Saldo bóveda: '||saldo0||' → '||saldo1||'. Pago conservado: '||pago,autor);
 INSERT INTO arca_resultado VALUES('CORRECCIÓN VALIDADA',pago,p.fecha,p.monto,saldo0,saldo1);
END $$;
SELECT *, 'Ensayo reversible: el ROLLBACK final no guarda cambios' AS modo FROM arca_resultado;
ROLLBACK;
