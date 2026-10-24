import {precioUnitario} from '@/lib/formato';
import {RecepcionDirecta} from "../RecepcionDirecta";
import { RecepcionesDodo } from "../RecepcionesDodo";
import {randomUUID} from 'node:crypto';
import {guardarUuidManualFactura} from '../acciones';
import {ConvertirPrefactura} from "../ConvertirPrefactura";
import {OrigenPrefactura} from "../OrigenPrefactura";
import {AdjuntarDocumento,AdjuntosCompra} from "../../adjuntos/Componentes";
import {avanceFactura,type RecepcionFactura} from "@/lib/compras/recepcionFactura";
import {leerTodo} from "@/lib/ventas/paginar";
import {soloInsumos} from "@/lib/compras/periodoInsumos";
import { HistorialCompra, type EventoCompra } from "@/components/HistorialCompra";
import { agregarNotaFactura } from "../acciones";
import { FichaPestanas } from "@/components/FichaPestanas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import { cotejar, NOMBRE_COTEJO, nombreEstadoFactura, nombreFactura, valorRecibido, vencida, type EstadoFactura } from "@/lib/compras/facturas";
import { avanceOrden, totalesOrden } from "@/lib/compras/ordenes";
import { FORMAS_PAGO, NOMBRE_FORMA_PAGO, nombreRegimen, type FormaPago, type TasaIva } from "@/lib/compras/proveedores";
import { diaDePagoSugerido, textoDia } from "@/lib/compras/diasPago";
import { fechaEsperada } from "@/lib/compras/entregas";
import { diasDePago } from "../../servidor";
import { CUENTAS_GASTO, CUENTAS_MEMO, NOMBRE_CUENTA, esCuentaPl } from "@/lib/finanzas/cuentas";
import { textoCubre } from "@/lib/finanzas/cubre";
import { puedeEditarCompras } from "@/lib/roles";
import {
  asignarCuentaFactura, asignarDestino, cambiarPeriodoFactura, cambiarVencimientoFactura, cancelarFacturaAccion, guardarCuentasConceptos, ligarOrdenes, marcarRevisada,
  programarPagoFactura, programarRecepcionFactura, sustituirGastoManual,
} from "../acciones";

type Factura = {
  id: string; uuid: string | null; uuid_manual:string|null; origen: "cfdi" | "manual"; sustituido_por: string | null; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha_emision: string;
  rfc_receptor:string;rfc_emisor: string; nombre_emisor: string; regimen_emisor: string; metodo_pago: string | null; forma_pago: string | null;
  subtotal: number; descuento: number; iva: number; retenciones: number; total: number; saldo: number; proveedor_id: string; sucursal_id: string | null; cuenta_pl: string | null;
  cubre_desde: string; cubre_hasta: string;
  uuid_relacionado: string | null; vence_el: string; estado: EstadoFactura; revisada: boolean; revision_nota: string | null;
  recepcion_programada_el:string|null; pago_programado_forma:FormaPago|null;
  pagado: number; falta_complemento: boolean; pago_programado_el: string | null;
  xml_ruta: string | null; pdf_ruta: string | null; motivo_cancelacion: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null; regimen_fiscal: string; dias_entrega:number|null } | null;
};
type Concepto = { id: number; descripcion: string; cantidad: number; unidad: string; valor_unitario: number; importe: number; cuenta_pl: string | null };
type Orden = { id: string; folio: string; estado: string; sucursales: { nombre: string } | null };
type Renglon = { orden_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number };
type Relacionada = { id: string; serie: string | null; folio: string | null; uuid: string; tipo: string; total: number; estado: EstadoFactura };

export default async function DetalleFactura({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: f } = await supabase.from("facturas_saldo")
    .select("id, uuid, uuid_manual, origen, sustituido_por, serie, folio, tipo, fecha_emision, rfc_receptor, rfc_emisor, nombre_emisor, regimen_emisor, metodo_pago, forma_pago, subtotal, descuento, iva, retenciones, total, saldo, proveedor_id, sucursal_id, cuenta_pl, cubre_desde, cubre_hasta, uuid_relacionado, vence_el, estado, revisada, revision_nota, pagado, falta_complemento, recepcion_programada_el,pago_programado_forma, pago_programado_el, xml_ruta, pdf_ruta, motivo_cancelacion, proveedores(razon_social, nombre_comercial, regimen_fiscal,dias_entrega)")
    .eq("id", id).maybeSingle<Factura>();
  if (!f) notFound();

  const { data: pagosFactura } = await supabase.from("pago_aplicaciones")
    .select("id, monto, pagos!inner(id, fecha, anulado_en,creado_en,motivo_anulacion,creador:perfiles!creado_por(nombre),anulador:perfiles!anulado_por(nombre))").eq("factura_id", id).order("id")
    .returns<{ id: number; monto: number; pagos: { id: string; fecha: string; anulado_en: string | null;creado_en:string;motivo_anulacion:string|null;creador:{nombre:string}|null;anulador:{nombre:string}|null } }[]>();
  const [{ data: conceptos }, { data: ligas }, { data: candidatas }, { data: sucursales }, { data: relacionadas }, { data: sinCfdi }, { data: sustituye }] = await Promise.all([
    supabase.from("factura_conceptos").select("id, descripcion, cantidad, unidad, valor_unitario, importe, cuenta_pl").eq("factura_id", id).order("id").returns<Concepto[]>(),
    supabase.from("factura_ordenes").select("orden_id").eq("factura_id", id).returns<{ orden_id: string }[]>(),
    supabase.from("ordenes_compra").select("id, folio, estado, sucursales(nombre)").eq("proveedor_id", f.proveedor_id).eq("rfc_receptor",f.rfc_receptor).in("estado", ["confirmada", "cerrada"])
      .order("confirmada_en", { ascending: false }).limit(50).returns<Orden[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    f.tipo === "ingreso"
      ? supabase.from("facturas").select("id, serie, folio, uuid, tipo, total, estado").eq("uuid_relacionado", f.uuid ?? "").returns<Relacionada[]>()
      : supabase.from("facturas").select("id, serie, folio, uuid, tipo, total, estado").eq("uuid", f.uuid_relacionado ?? "").returns<Relacionada[]>(),
    f.origen === "cfdi" && f.tipo === "ingreso"
      ? supabase.from("facturas").select("id, folio, fecha_emision, total").eq("proveedor_id", f.proveedor_id).eq("rfc_receptor",f.rfc_receptor).eq("origen", "manual").neq("estado", "cancelada")
        .order("fecha_emision").returns<{ id: string; folio: string; fecha_emision: string; total: number }[]>()
      : Promise.resolve({ data: [] as { id: string; folio: string; fecha_emision: string; total: number }[] }),
    supabase.from("facturas").select("id, folio").eq("sustituido_por", f.id).returns<{ id: string; folio: string }[]>(),
  ]);
  const directas=await leerTodo<RecepcionFactura>((d,h)=>supabase.from("factura_recepciones").select("*,autor:perfiles!usuario_id(nombre),anulador:perfiles!anulada_por(nombre)").eq("factura_id",id).order("creado_en",{ascending:false}).order("id").range(d,h));
  const esInsumos=soloInsumos((conceptos??[]).map(c=>c.cuenta_pl),f.cuenta_pl);
  const ligadas = (ligas ?? []).map((l) => l.orden_id);
  const { data: renglones } = ligadas.length
    ? await supabase.from("renglones_recibido").select("orden_id, descripcion, cantidad, precio, tasa_iva, recibido").in("orden_id", ligadas).returns<Renglon[]>()
    : { data: [] as Renglon[] };
  // Todas las facturas vigentes ligadas a esas órdenes (para el cotejo del grupo), por su neto: los pagos no cuentan.
  const { data: delGrupo } = ligadas.length
    ? await supabase.from("factura_ordenes").select("factura_id, facturas_saldo!inner(neto, estado, tipo)").in("orden_id", ligadas)
      .returns<{ factura_id: string; facturas_saldo: { neto: number; estado: string; tipo: string } }[]>()
    : { data: [] as { factura_id: string; facturas_saldo: { neto: number; estado: string; tipo: string } }[] };
  const facturado = [...new Map((delGrupo ?? []).filter((x) => x.facturas_saldo.estado !== "cancelada" && x.facturas_saldo.tipo === "ingreso")
    .map((x) => [x.factura_id, Number(x.facturas_saldo.neto)])).values()].reduce((s, v) => s + v, 0);
  // Las órdenes ya ligadas siempre aparecen en la lista, aunque no estén entre las 50 más recientes (guardar no las suelta).
  const faltantes = ligadas.filter((oid) => !(candidatas ?? []).some((o) => o.id === oid));
  const { data: ligadasViejas } = faltantes.length
    ? await supabase.from("ordenes_compra").select("id, folio, estado, sucursales(nombre)").in("id", faltantes).returns<Orden[]>()
    : { data: [] as Orden[] };
  const opcionesOrden = [...(candidatas ?? []), ...(ligadasViejas ?? [])];
  const rs = renglones ?? [];
  const recepcionCompleta = ligadas.length > 0
    ? rs.length > 0 && avanceOrden(rs) === "completa"
    : avanceFactura(conceptos ?? [], directas) === "completa";
  const cotejo = cotejar({
    tieneOrdenes: ligadas.length > 0, ordenado: totalesOrden(rs).total, recibido: valorRecibido(rs),
    recepcionCompleta: rs.length > 0 && avanceOrden(rs) === "completa", facturado,
  });

  const {data:razon}=await supabase.from("razones_sociales").select("razon_social").eq("rfc",f.rfc_receptor).maybeSingle<{razon_social:string}>();
  const firmar = async (ruta: string | null) => (ruta ? (await supabase.storage.from("facturas").createSignedUrl(ruta, 3600)).data?.signedUrl ?? null : null);
  const [urlXml, urlPdf] = await Promise.all([firmar(f.xml_ruta), firmar(f.pdf_ruta)]);
  const { data: cancelacion } = await supabase.from("factura_cancelaciones").select("motivo, creado_en, ordenes, perfiles!usuario_id(nombre)").eq("factura_id", id).maybeSingle<{motivo:string;creado_en:string;ordenes:string[];perfiles:{nombre:string}|null}>();
  const [auditoria,programaciones,notas] = await Promise.all([
   supabase.from("facturas").select("creado_en,revisada_en,revision_nota,cancelada_en,motivo_cancelacion,creador:perfiles!creado_por(nombre),revisor:perfiles!revisada_por(nombre),cancelador:perfiles!cancelada_por(nombre)").eq("id",id).maybeSingle<{creado_en:string;revisada_en:string|null;revision_nota:string|null;cancelada_en:string|null;motivo_cancelacion:string|null;creador:{nombre:string}|null;revisor:{nombre:string}|null;cancelador:{nombre:string}|null}>(),
   supabase.from("factura_programacion_historial").select("id,tipo,fecha_anterior,fecha_nueva,forma_anterior,forma_nueva,creado_en,perfiles!usuario_id(nombre)").eq("factura_id",id).order("creado_en").returns<{id:number;tipo:string;fecha_anterior:string|null;fecha_nueva:string|null;forma_anterior:FormaPago|null;forma_nueva:FormaPago|null;creado_en:string;perfiles:{nombre:string}|null}[]>(),
   supabase.from("compra_notas").select("id,texto,creado_en,perfiles!usuario_id(nombre)").eq("factura_id",id).order("creado_en").returns<{id:string;texto:string;creado_en:string;perfiles:{nombre:string}|null}[]>(),
  ]);
  if(auditoria.error||programaciones.error||notas.error)throw Error("No se pudo consultar el historial de la factura.");
  const eventos:EventoCompra[]=[];
  for(const r of directas){eventos.push({id:`recibida-${r.id}`,en:r.creado_en,titulo:"Recepción sin orden registrada",nota:`Fecha real ${fechaTexto(r.fecha)} · ${r.motivo}`,autor:r.autor?.nombre});if(r.anulada_en)eventos.push({id:`recepcion-anulada-${r.id}`,en:r.anulada_en,titulo:"Recepción anulada",nota:r.motivo_anulacion,autor:r.anulador?.nombre});}
  const audit=auditoria.data;
  if(audit){
   eventos.push({id:"creada",en:audit.creado_en,titulo:"Factura registrada",autor:audit.creador?.nombre});
   if(audit.revisada_en)eventos.push({id:"revisada",en:audit.revisada_en,titulo:"Última revisión registrada",nota:audit.revision_nota,autor:audit.revisor?.nombre});
   if(audit.cancelada_en)eventos.push({id:"cancelada",en:audit.cancelada_en,titulo:"Factura cancelada",nota:audit.motivo_cancelacion,autor:audit.cancelador?.nombre});
  }
  for(const h of programaciones.data??[])eventos.push({id:`programacion-${h.id}`,en:h.creado_en,titulo:h.tipo==="pago"?"Programación de pago":"Programación de recepción",nota:`${h.fecha_anterior?fechaTexto(h.fecha_anterior):"Sin fecha"} → ${h.fecha_nueva?fechaTexto(h.fecha_nueva):"Sin programación"}${h.tipo==="pago"?` · ${h.forma_anterior?NOMBRE_FORMA_PAGO[h.forma_anterior]:"Sin forma"} → ${h.forma_nueva?NOMBRE_FORMA_PAGO[h.forma_nueva]:"Sin forma"}`:""}`,autor:h.perfiles?.nombre});
  for(const n of notas.data??[])eventos.push({id:`nota-${n.id}`,en:n.creado_en,titulo:"Nota interna",nota:n.texto,autor:n.perfiles?.nombre});
  for(const aplicacion of pagosFactura??[]){
   const pago=aplicacion.pagos;
   eventos.push({id:`pago-${aplicacion.id}`,en:pago.creado_en,titulo:"Pago registrado",nota:`${pesos(aplicacion.monto)} aplicados · fecha del pago: ${fechaTexto(pago.fecha)}`,autor:pago.creador?.nombre,href:`/compras/pagos/${pago.id}`});
   if(pago.anulado_en)eventos.push({id:`anulacion-${aplicacion.id}`,en:pago.anulado_en,titulo:"Pago anulado",nota:pago.motivo_anulacion,autor:pago.anulador?.nombre,href:`/compras/pagos/${pago.id}`});
  }
  const edita = puedeEditarCompras(perfil.rol) && f.estado !== "cancelada";
  const notasVigentes = f.tipo === "ingreso" ? (relacionadas ?? []).filter((n) => n.estado !== "cancelada").length : 0;
  const regimenDistinto = f.proveedores && f.regimen_emisor && f.regimen_emisor !== f.proveedores.regimen_fiscal;
  const hoy = hoyCalendarioMX();
  const dias = await diasDePago(supabase);
  const plazo = f.proveedores?.dias_entrega;
  const recepcionSugerida=fechaEsperada(hoy,plazo??null);


  return (
    <>
      <div className="encabezado ficha-encabezado">
        <h1>{f.tipo === "egreso" ? "Nota de crédito" : "Factura"} {f.serie ?? ""}{f.folio ?? ""} · {f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social}</h1>
        <p>{nombreEstadoFactura(f.tipo, f.estado)}{f.motivo_cancelacion ? ` · ${f.motivo_cancelacion}` : ""}{f.origen === "manual" ? " · Sin CFDI" : ` · UUID ${f.uuid}`}</p>
      </div>
      <p className="saldo-nota">Empresa: {razon?.razon_social??f.rfc_receptor} · {f.rfc_receptor}</p>
      {f.origen==='manual'&&f.uuid_manual&&<p className="saldo-nota">UUID: <strong>{f.uuid_manual}</strong> · capturado manualmente · XML pendiente</p>}
      {!ligadas.length&&f.tipo==="ingreso"&&f.estado!=="cancelada"&&<RecepcionDirecta id={id} conceptos={conceptos??[]} recepciones={directas} hoy={hoy} edita={edita}/>}
      <div className="ficha-indicadores"><div><small>Estado del documento</small><strong className="ficha-estado" data-estado={f.estado}>{nombreEstadoFactura(f.tipo, f.estado)}</strong></div><div><small>Total original</small><strong>{pesos(f.total)}</strong></div><div><small>Saldo pendiente</small><strong>{pesos(f.estado === "cancelada" ? 0 : f.saldo)}</strong></div><div><small>Fecha de vencimiento</small><strong>{fechaTexto(f.vence_el)}</strong></div></div>
      <div className="orden-acciones-encabezado ficha-barra">
        {edita&&<AdjuntarDocumento tipo="factura" id={f.id}/>}
        {edita&&f.origen==='manual'&&f.tipo==='ingreso'&&!f.sustituido_por&&!f.xml_ruta&&<details className="orden-accion-desplegable"><summary className="boton boton-secundario">{f.uuid_manual?'Corregir UUID manual':'Capturar UUID sin XML'}</summary><div className="orden-accion-formulario"><form action={guardarUuidManualFactura} className="formulario">
          <input type="hidden" name="id" value={id}/><input type="hidden" name="solicitud" value={randomUUID()}/><input type="hidden" name="uuid_anterior" value={f.uuid_manual??''}/>
          <label className="campo">UUID del comprobante<input name="uuid_manual" defaultValue={f.uuid_manual??''} maxLength={36} pattern="[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" required={!f.uuid_manual}/></label>
          <label className="campo">Motivo<input name="motivo" minLength={5} maxLength={500} required placeholder="UUID tomado del PDF; XML pendiente"/></label>
          <p className="saldo-nota">Se guarda como dato manual y aparece en Tesorería. No cambia importes, pagos ni convierte la prefactura a CFDI. Cuando tengas el XML, usa «Convertir con XML».{f.uuid_manual?' Puedes dejar el campo vacío para quitar un UUID equivocado, conservando el historial.':''}</p>
          <BotonEnviar>Guardar UUID manual</BotonEnviar>
        </form></div></details>}
        {edita&&f.origen==='manual'&&f.tipo==='ingreso'&&f.estado!=='cancelada'&&!f.sustituido_por&&<ConvertirPrefactura id={f.id}/>}
        {edita && f.tipo === "ingreso" && opcionesOrden.filter(o=>ligadas.includes(o.id)&&o.estado==="confirmada").map(o=><Link key={o.id} className="boton boton-secundario" href={`/compras/ordenes/${o.id}?recibir=1#recepcion-orden`}>Registrar recepción{ligadas.length>1?` · ${o.folio}`:""}</Link>)}
        {edita && <details><summary>Programar / revisar</summary>      {edita && (
        <section className="seccion">
          <h2>Programación y revisión</h2>
          {!f.revisada && NOMBRE_COTEJO[cotejo].alerta && f.tipo === "ingreso" && (
            <form action={marcarRevisada} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              {(cotejo==='nada_recibido'||cotejo==='facturado_de_mas')&&<p className="aviso">Todavía falta recibir todo lo facturado. Para registrar un anticipo, revisa la orden y el monto, escribe el motivo de autorización y marca la factura como revisada. Esto permite pagar; no registra una recepción ni cierra la orden.</p>}
              <div className="campo"><label htmlFor="nota">Revisada: ¿qué verificaste?</label><input id="nota" name="nota" required placeholder={cotejo==='nada_recibido'||cotejo==='facturado_de_mas'?'Ej. anticipo autorizado; orden y monto verificados':'Ej. el proveedor aplicó un aumento autorizado'} /></div>
              <BotonEnviar className="boton boton-secundario">Marcar como revisada</BotonEnviar>
            </form>
          )}
          {f.tipo === "ingreso" && (f.estado === "por_pagar" || f.estado === "parcial") && (
            <form action={cambiarVencimientoFactura} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="vence">Vencimiento</label><input id="vence" name="vence_el" type="date" defaultValue={f.vence_el} required /></div>
              <BotonEnviar className="boton boton-secundario">Cambiar vencimiento</BotonEnviar>
            </form>
          )}
          {f.tipo === "ingreso" && (f.estado === "por_pagar" || f.estado === "parcial") && (
            <form action={programarPagoFactura} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo">
                <label htmlFor="programada">Día de pago</label>
                <input id="programada" name="pago_programado_el" type="date" min={hoy} defaultValue={f.pago_programado_el ?? ""} />
                <small>Recomendado: {textoDia(diaDePagoSugerido(f.vence_el, hoy, dias))}. Puedes elegir cualquier día desde hoy; deja vacío para quitar la programación.</small>
              </div>
              <div className="campo"><label htmlFor="pago_programado_forma">Forma de pago prevista</label>
                <select id="pago_programado_forma" name="pago_programado_forma" defaultValue={f.pago_programado_forma??""}>
                  <option value="">Elige al programar una fecha…</option>
                  {FORMAS_PAGO.map(forma=><option key={forma} value={forma}>{NOMBRE_FORMA_PAGO[forma]}</option>)}
                </select><small>Es una previsión; no registra el pago ni reserva efectivo.</small>
              </div>
              <BotonEnviar className="boton boton-secundario">Programar pago</BotonEnviar>
            </form>
          )}
          {f.tipo==="ingreso" && !recepcionCompleta && <form action={programarRecepcionFactura} className="formulario">
            <h3>Programar recepción de insumos</h3>
            <input type="hidden" name="id" value={f.id}/>
            <div className="campo"><label htmlFor="recepcion_programada_el">Fecha de recepción prevista</label>
              <input id="recepcion_programada_el" name="recepcion_programada_el" type="date" min={hoy} defaultValue={f.recepcion_programada_el??""}/>
              <small>{plazo!=null?`Recomendado: ${fechaTexto(recepcionSugerida??hoy)} (hoy + ${plazo} días naturales del proveedor).`:"El proveedor no tiene plazo de entrega configurado."} Puedes elegir cualquier día desde hoy; deja vacío para quitar la programación.</small>
            </div>
            <p className="saldo-nota">Actualiza también la entrega esperada de todas las órdenes vinculadas que siguen pendientes. No registra cantidades recibidas ni entradas de inventario.</p>
            <BotonEnviar className="boton boton-secundario">Guardar recepción prevista</BotonEnviar>
          </form>}

        </section>
      )}
</details>}
        {edita && f.tipo === "ingreso" && Number(f.saldo) > 0 && <Link className="boton" href={`/compras/pagos/nuevo?proveedor=${f.proveedor_id}&factura=${f.id}`}>Registrar pago</Link>}
        {urlPdf && <a className="boton boton-secundario" href={urlPdf} target="_blank" rel="noreferrer">{f.origen === "manual" ? "Ver adjunto" : "Ver PDF"}</a>}
        {urlXml && <a className="boton boton-secundario" href={urlXml} target="_blank" rel="noreferrer">Ver XML</a>}
      {edita && (          <details>
            <summary>Cancelar factura / gasto</summary>
            <form action={cancelarFacturaAccion} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="motivo">Motivo</label><input id="motivo" name="motivo" required minLength={5} maxLength={1000} placeholder="Ej. Rappi absorbió el gasto de marketing; ya no corresponde pagarlo." /></div>
              {f.tipo === "ingreso" && notasVigentes > 0 && (
                <p className="saldo-nota">
                  Tiene {notasVigentes === 1 ? "1 nota de crédito vigente" : `${notasVigentes} notas de crédito vigentes`}: quedarán ligadas a una factura cancelada.
                  Si el proveedor la sustituye por otra, cancela también la nota y pide que la emita sobre la nueva.
                </p>
              )}
              <p className="saldo-nota">Se retira del saldo pendiente, del calendario y del P&amp;L. Se conservan el importe original, el motivo, quién canceló y la fecha. Las órdenes que esta factura cerró solas se reabren.</p>
              <p className="saldo-nota">Primero anula los pagos y cancela las reservas de bóveda activas. Esta acción es interna y no cancela un CFDI ante el SAT.</p>
              <BotonEnviar className="boton boton-alerta" confirmar="¿Cancelar esta factura? Se quitan sus ligas a órdenes y las que había cerrado se reabren.">Cancelar factura</BotonEnviar>
            </form>
          </details>
      )}
      </div>
      <Aviso ok={ok} error={error} />
      {f.estado === "cancelada" && <section className="seccion"><h2>Cancelación registrada</h2><p>{f.motivo_cancelacion}</p><p>Este registro ya no cuenta como gasto en el P&amp;L ni como pago pendiente.</p>{cancelacion && <><p>{cancelacion.perfiles?.nombre ?? "Administración"} · {new Date(cancelacion.creado_en).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</p><p>Importe original: <strong>{pesos(f.total)}</strong></p>{cancelacion.ordenes.length > 0 && <p>Órdenes anteriormente vinculadas: {cancelacion.ordenes.map((orden, i) => <Fragment key={orden}>{i > 0 && " · "}<Link href={`/compras/ordenes/${orden}`}>Ver orden {i + 1}</Link></Fragment>)}</p>}</>}</section>}

      <div className="detalle-con-lado compra-ficha-lado"><div className="detalle-principal">
      <FichaPestanas pestanas={[
        {id:"conceptos", titulo:`Conceptos (${conceptos?.length ?? 0})`, contenido:<>      <section className="seccion" aria-labelledby="t-conceptos"><h2 id="t-conceptos">{f.origen === "manual" ? "Renglones" : "Conceptos del XML"}</h2>
        {edita && (conceptos ?? []).length > 0 ? (
          <form action={guardarCuentasConceptos} className="formulario">
            <input type="hidden" name="id" value={f.id} />
            <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
              {(conceptos ?? []).map((c) => (
                <li key={c.id} className="fila">
                  <div className="fila-nombre"><strong>{c.descripcion}</strong><small>{c.cantidad} {c.unidad} · {precioUnitario(c.valor_unitario)}</small></div>
                  <div className="fila-datos">
                    <span>{pesos(c.importe)}</span>
                    <span>
                      <input type="hidden" name="concepto_id" value={c.id} />
                      <select name="concepto_cuenta" defaultValue={c.cuenta_pl ?? ""} aria-label={`Cuenta del P&L de ${c.descripcion}`}>
                        <option value="">La de la factura</option>
                        {[...CUENTAS_GASTO, ...CUENTAS_MEMO].map((k) => <option key={k} value={k}>{NOMBRE_CUENTA[k]}</option>)}
                      </select>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <BotonEnviar className="boton boton-secundario">Guardar cuentas</BotonEnviar>
          </form>
        ) : (
          <dl className="tarjeta-datos">
            {(conceptos ?? []).map((c) => <Fragment key={c.id}><dt>{c.cantidad} {c.unidad}</dt><dd>{c.descripcion} · {pesos(c.importe)} · {c.cuenta_pl && esCuentaPl(c.cuenta_pl) ? NOMBRE_CUENTA[c.cuenta_pl] : "cuenta de la factura"}</dd></Fragment>)}
          </dl>
        )}
        {rs.length > 0 && (
          <>
            <h3>Renglones de las órdenes</h3>
            <dl className="tarjeta-datos">
              {rs.map((r, i) => <Fragment key={i}><dt>{r.cantidad} pedidos · {r.recibido} recibidos</dt><dd>{r.descripcion} · {precioUnitario(r.precio)}</dd></Fragment>)}
            </dl>
          </>
        )}
      </section>

</>},
        {id:"datos", titulo:"Datos y contabilidad", contenido:<>      <section className="seccion">
        <p><Link className="boton boton-secundario" href={`/finanzas/asignacion?mes=${f.fecha_emision.slice(0,7)}&factura=${id}`}>Revisar cuentas contables de esta factura</Link></p>
        <dl className="tarjeta-datos">
          <dt>Emitida</dt><dd>{fechaTexto(f.fecha_emision)} · {f.metodo_pago ?? "sin método"}{f.forma_pago ? ` · forma ${f.forma_pago}` : ""}</dd>
          <dt>Subtotal</dt><dd>{pesos(f.subtotal)}{Number(f.descuento) ? ` · descuento ${pesos(f.descuento)}` : ""}</dd>
          <dt>IVA</dt><dd>{pesos(f.iva)}{Number(f.retenciones) ? ` · retenciones ${pesos(f.retenciones)}` : ""}</dd>
          <dt>Total</dt><dd><strong>{pesos(f.total)}</strong>{f.tipo === "ingreso" && f.estado !== "cancelada" ? ` · saldo ${pesos(f.saldo)}` : ""}</dd>
          {f.tipo === "ingreso" && <><dt>Vence</dt><dd>{fechaTexto(f.vence_el)}{vencida(f, hoy) ? " · vencida" : ""}</dd></>}
          {f.tipo === "ingreso" && Number(f.pagado) > 0 && <><dt>Pagado</dt><dd>{pesos(f.pagado)}</dd></>}
          {f.pago_programado_el && <><dt>Pago programado</dt><dd>{fechaTexto(f.pago_programado_el)} · {f.pago_programado_forma?NOMBRE_FORMA_PAGO[f.pago_programado_forma]:"Forma por definir"}</dd></>}
          {f.recepcion_programada_el && <><dt>Recepción programada</dt><dd>{fechaTexto(f.recepcion_programada_el)}</dd></>}
          {f.falta_complemento && <><dt>Aviso</dt><dd>Falta el complemento de pago del proveedor (factura PPD).</dd></>}
          <dt>Emisor</dt><dd>{f.nombre_emisor} · {f.rfc_emisor} · {f.regimen_emisor} {nombreRegimen(f.regimen_emisor)}</dd>
          {regimenDistinto && <><dt>Aviso</dt><dd>El régimen del XML ({f.regimen_emisor}) no es el de la cartera ({f.proveedores!.regimen_fiscal}).</dd></>}
          {f.revisada && <><dt>Revisada</dt><dd>{f.revision_nota}</dd></>}
          <dt>Cuenta del P&L</dt><dd>{f.cuenta_pl && esCuentaPl(f.cuenta_pl) ? NOMBRE_CUENTA[f.cuenta_pl] : "Sin cuenta (va a Otros)"}</dd>
          {!esInsumos&&<><dt>Cubre</dt><dd>{textoCubre({ desde: f.cubre_desde, hasta: f.cubre_hasta })}</dd></>}
        </dl>
        {edita && (
          <form action={asignarCuentaFactura} className="acciones">
            <input type="hidden" name="id" value={f.id} />
            <select name="cuenta_pl" defaultValue={f.cuenta_pl ?? ""} aria-label="Cuenta del P&L">
              <option value="">Sin cuenta (va a Otros)</option>
              {[...CUENTAS_GASTO, ...CUENTAS_MEMO].map((c) => <option key={c} value={c}>{NOMBRE_CUENTA[c]}</option>)}
            </select>
            <BotonEnviar className="boton boton-secundario">Guardar cuenta</BotonEnviar>
          </form>
        )}
        {edita && !esInsumos && (
          <form action={cambiarPeriodoFactura} className="acciones">
            <input type="hidden" name="id" value={f.id} />
            <label htmlFor="cubre_desde" className="etiqueta">Cubre desde</label>
            <input id="cubre_desde" name="cubre_desde" type="month" defaultValue={f.cubre_desde.slice(0, 7)} placeholder="AAAA-MM" required />
            <label htmlFor="cubre_hasta" className="etiqueta">hasta</label>
            <input id="cubre_hasta" name="cubre_hasta" type="month" defaultValue={f.cubre_hasta.slice(0, 7)} placeholder="AAAA-MM" required />
            <BotonEnviar className="boton boton-secundario">Guardar periodo</BotonEnviar>
          </form>
        )}
        <div className="acciones">
          {urlXml && <a className="boton boton-secundario" href={urlXml} target="_blank" rel="noreferrer">Ver XML</a>}
          {urlPdf && <a className="boton boton-secundario" href={urlPdf} target="_blank" rel="noreferrer">{f.origen === "manual" ? "Ver adjunto" : "Ver PDF"}</a>}
        </div>
      </section>

</>},
        {id:"pagos", titulo:`Pagos (${pagosFactura?.length ?? 0})`, contenido:<section className="seccion"><h2>Pagos aplicados</h2>{!(pagosFactura ?? []).length && <p className="vacio">Todavía no hay pagos registrados.</p>}        {(pagosFactura ?? []).length > 0 && (
          <dl className="tarjeta-datos">
            {(pagosFactura ?? []).map((a) => (
              <Fragment key={a.id}><dt><Link href={`/compras/pagos/${a.pagos.id}`}>{fechaTexto(a.pagos.fecha)}</Link></dt><dd>{pesos(a.monto)}{a.pagos.anulado_en ? " · anulado" : ""}</dd></Fragment>
            ))}
          </dl>
        )}
        {edita && f.tipo === "ingreso" && Number(f.saldo) > 0 && (f.estado === "por_pagar" || f.estado === "parcial") && (
          <div className="acciones"><Link className="boton" href={`/compras/pagos/nuevo?proveedor=${f.proveedor_id}&factura=${f.id}`}>Registrar pago</Link></div>
        )}
</section>},
        {id:"recepcion", titulo:"Órdenes y recepción", contenido:<>{f.tipo === "ingreso" && <RecepcionesDodo supabase={supabase} facturaId={f.id} subtotal={Number(f.subtotal) - Number(f.descuento)} />}      {f.tipo === "ingreso" && (
        <section className="seccion" aria-labelledby="t-cotejo">
          <h2 id="t-cotejo">Órdenes y recepción</h2>
          <p className="saldo-nota">Puedes recibir una orden confirmada aunque la factura esté por pagar. La recepción registra cantidades recibidas; el pago se registra por separado.</p>
          {opcionesOrden.filter(o=>ligadas.includes(o.id)).map(o=><p key={o.id}><Link href={`/compras/ordenes/${o.id}${o.estado==="confirmada"?"?recibir=1#recepcion-orden":""}`}>{o.folio} · {o.estado==="confirmada"?"Registrar recepción sin requerir pago":"Ver recepción de la orden"}</Link></p>)}
          <p className={NOMBRE_COTEJO[cotejo].alerta ? "aviso aviso-error" : "aviso aviso-ok"}>{NOMBRE_COTEJO[cotejo].texto}</p>
          {ligadas.length > 0 && (
            <dl className="tarjeta-datos">
              <dt>Ordenado</dt><dd>{pesos(totalesOrden(rs).total)}</dd>
              <dt>Recibido</dt><dd>{pesos(valorRecibido(rs))}</dd>
              <dt>Facturado</dt><dd>{pesos(facturado)}</dd>
            </dl>
          )}
          {edita && (
            <form action={ligarOrdenes} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <fieldset className="campo">
                <legend>Órdenes de compra de este proveedor</legend>
                {!opcionesOrden.length && <p className="vacio">Este proveedor no tiene órdenes confirmadas.</p>}
                {opcionesOrden.map((o) => (
                  <label key={o.id}><input type="checkbox" name="ordenes" value={o.id} defaultChecked={ligadas.includes(o.id)} /> {o.folio} · {o.sucursales?.nombre ?? "Oficina"}{o.estado === "cerrada" ? " · cerrada" : ""}</label>
                ))}
              </fieldset>
              <BotonEnviar>Guardar órdenes</BotonEnviar>
            </form>
          )}
          {!ligadas.length && edita && (
            <form action={asignarDestino} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo">
                <label htmlFor="destino">Sin orden: ¿a dónde se carga?</label>
                <select id="destino" name="sucursal_id" defaultValue={f.sucursal_id ?? "oficina"}>
                  {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  <option value="oficina">Oficina</option>
                </select>
              </div>
              <BotonEnviar className="boton boton-secundario">Guardar destino</BotonEnviar>
            </form>
          )}
        </section>
      )}

      {(relacionadas ?? []).length > 0 && (
        <section className="seccion">
          <h2>{f.tipo === "ingreso" ? "Notas de crédito" : "Factura que corrige"}</h2>
          <dl className="tarjeta-datos">
            {(relacionadas ?? []).map((n) => (
              <Fragment key={n.id}><dt><Link href={`/compras/facturas/${n.id}`}>{nombreFactura(n)}</Link></dt><dd>{pesos(n.total)} · {nombreEstadoFactura(n.tipo, n.estado)}</dd></Fragment>
            ))}
          </dl>
        </section>
      )}
      {f.tipo === "egreso" && !(relacionadas ?? []).length && f.uuid_relacionado && (
        <p className="aviso aviso-error">La factura que corrige ({f.uuid_relacionado}) aún no se sube. Cuando se suba, su saldo ya restará esta nota.</p>
      )}

</>},
        {id:"documentos", titulo:"Documentos relacionados", contenido:<><OrigenPrefactura id={f.id}/><p className="saldo-nota">Adjuntos, notas de crédito y sustituciones de este documento.</p>      {(sustituye ?? []).length > 0 && (
        <p className="aviso">Sustituye a: {(sustituye ?? []).map((x) => <Link key={x.id} href={`/compras/facturas/${x.id}`}>{x.folio}</Link>)}</p>
      )}
      {f.sustituido_por && <p className="aviso">Sustituido por <Link href={`/compras/facturas/${f.sustituido_por}`}>su CFDI</Link>.</p>}
      {edita && (sinCfdi ?? []).length > 0 && (
        <section className="seccion">
          <h2>¿Sustituye a un gasto sin CFDI?</h2>
          <form action={sustituirGastoManual} className="formulario">
            <input type="hidden" name="id" value={f.id} />
            <div className="campo">
              <label htmlFor="manual_id">Gasto sin CFDI de este proveedor (este CFDI: {pesos(f.total)})</label>
              <select id="manual_id" name="manual_id" required defaultValue="">
                <option value="" disabled>Elige…</option>
                {(sinCfdi ?? []).map((m) => <option key={m.id} value={m.id}>{m.folio} · {fechaTexto(m.fecha_emision)} · {pesos(m.total)}</option>)}
              </select>
              <small>Sus pagos pasan a esta factura y el gasto sin CFDI queda cancelado; así no se cuenta doble.</small>
            </div>
            <BotonEnviar className="boton boton-secundario" confirmar="¿Sustituir ese gasto sin CFDI con esta factura?">Sustituir</BotonEnviar>
          </form>
        </section>
      )}

</>},
        {id:"adjuntos",titulo:"Adjuntos",contenido:<AdjuntosCompra tipo="factura" id={f.id}/>},
      ]} /></div><HistorialCompra id={f.id} edita={puedeEditarCompras(perfil.rol)} accion={agregarNotaFactura} eventos={eventos}/></div>
    </>
  );
}
