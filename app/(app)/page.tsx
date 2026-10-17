import {DashboardVentasInicio} from "@/components/DashboardVentasInicio";
import Link from "next/link";
import { IconoInicio } from "@/components/IconoInicio";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Icono } from "@/components/Icono";
import { obtenerContexto, puedeAbrirTurno } from "@/lib/contexto";
import { fechaTexto, hoyCalendarioMX, hora, pesos } from "@/lib/formato";
import { avanceRenglon } from "@/lib/compras/ordenes";
import { puedeRecibirCompras, puedeVerVentas, puedeVerCompras, puedeVerFinanzas } from "@/lib/roles";
import { NOMBRE_MOVIMIENTO, type Movimiento } from "@/lib/tipos";
import { abrirTurno } from "./actions";
import { confirmarMovimiento, rechazarMovimiento } from "./movimientos/actions";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string;ventas_mes?:string;ventas_sucursal?:string }> }) {
  const { ok, error,ventas_mes,ventas_sucursal } = await searchParams;
  const { supabase, perfil, sucursal, turno, cajas, soloLectura } = await obtenerContexto();

  const [{ data: saldos }, { data: pendientes }, { data: nombres }] = await Promise.all([
    supabase.from("saldos_cajas").select("tipo, nombre, saldo").eq("sucursal_id", sucursal.id)
      .returns<{ tipo: string; nombre: string; saldo: number }[]>(),
    supabase.from("movimientos").select("*").eq("sucursal_id", sucursal.id).eq("estado", "pendiente")
      .order("creado_en").returns<Movimiento[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const { data: porRecibir } = puedeRecibirCompras(perfil.rol) ? await supabase.rpc("ordenes_por_recibir") : { data: [] };
  const ordenesPorRecibir = new Set(((porRecibir ?? []) as { orden_id: string; cantidad: number; recibido: number }[])
    .filter((r) => avanceRenglon(Number(r.cantidad), Number(r.recibido)) !== "completa").map((r) => r.orden_id)).size;

  const accesos = [
    ...(puedeVerVentas(perfil.rol) ? [
      { titulo: "Ventas", nota: "Venta diaria, pedidos y productos", href: `/ventas?sucursal=${sucursal.id}` },
      { titulo: "Rappi", nota: "Órdenes, descuentos y productos", href: `/ventas/rappi?sucursal=${sucursal.id}` },
    ] : []),
    ...(puedeVerCompras(perfil.rol) ? [{ titulo: "Compras y pagos", nota: "Facturas, gastos sin CFDI y proveedores", href: "/compras/facturas" }] : []),
    ...(puedeVerFinanzas(perfil.rol) ? [
      { titulo: "P&L", nota: "Resultados, gastos y metas", href: `/finanzas?sucursal=${sucursal.id}` },
      { titulo: "Retenciones", nota: "Impuestos retenidos en pagos y enteros", href: "/finanzas/retenciones" },
      { titulo: "Mermas", nota: "Productos terminados e insumos al P&L", href: `/finanzas/mermas?sucursal=${sucursal.id}` },
      { titulo: "Costeo y materiales", nota: "Insumos, recetas y costos por producto", href: "/ventas/costos/materiales" },
    ] : []),
    { titulo: "Checklists", nota: "Recorridos y controles de la operación", href: "/checklists" },
  ];
  const fuentes = [
    ...(puedeVerVentas(perfil.rol) ? [
      { tabla: "ventas_dia", nombre: "Ventas Dodo IS", href: `/ventas?sucursal=${sucursal.id}` },
      { tabla: "rappi_ordenes", nombre: "Órdenes Rappi", href: `/ventas/rappi?sucursal=${sucursal.id}` },
    ] : []),
    ...(puedeVerFinanzas(perfil.rol) ? [{ tabla: "mermas_dodo_dias", nombre: "Mermas Dodo IS", href: `/finanzas/mermas?sucursal=${sucursal.id}` }] : []),
  ];
  const actualizacion = await Promise.all(fuentes.map(async (f) => {
    const { data, error } = await supabase.from(f.tabla).select("fecha").eq("sucursal_id", sucursal.id)
      .order("fecha", { ascending: false }).limit(1).maybeSingle<{ fecha: string }>();
    return { ...f, fecha: data?.fecha, error: Boolean(error) };
  }));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const caja = new Map(cajas.map((c) => [c.id, c.nombre]));
  const saldo = (tipo: string) => saldos?.find((s) => s.tipo === tipo)?.saldo ?? 0;
  const cambios = saldo("cambios");

  const hoy = hoyCalendarioMX();
  /** Frescura de cada fuente, solo para el color del chip: al día (≤2 días), atrasada (≤7) o vieja. */
  const frescura = (f: { fecha?: string; error: boolean }) => {
    if (f.error || !f.fecha) return "peligro";
    const dias = (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${f.fecha}T00:00:00Z`)) / 86_400_000;
    return dias <= 2 ? "exito" : dias <= 7 ? "aviso" : "peligro";
  };
  const porConfirmar = pendientes?.length ?? 0;

  return (
    <div className="panel-admin">
      <EncabezadoPagina titulo={sucursal.nombre} descripcion={<>
        {fechaTexto(hoy)} · {turno ? `Turno ${turno.tipo} abierto desde las ${hora(turno.abierto_en)}` : "Sin turno abierto"}
        {actualizacion.length > 0 && <span className="chips-frescura" aria-label="Hasta dónde tenemos datos">
          {actualizacion.map((f) => <Link key={f.tabla} href={f.href} className="chip-frescura" data-tono={frescura(f)}
            title={`Última fecha registrada en ${sucursal.nombre}. No implica que todos los días anteriores estén completos.`}>
            <span className="marca-punto" data-tono={frescura(f)} />{f.nombre} · {f.error ? "no se pudo consultar" : f.fecha ? fechaTexto(f.fecha) : "sin datos"}
          </Link>)}
        </span>}
      </>} />
      <Aviso ok={ok} error={error} />

      {(porConfirmar > 0 || ordenesPorRecibir > 0 || (!turno && puedeAbrirTurno(perfil.rol))) && (
        <section className="atencion" aria-label="Pendientes de hoy">
          {porConfirmar > 0 && <a className="atencion-tarjeta" data-tono="aviso" href="#t-pendientes">
            <span className="atencion-icono"><Icono nombre="billete" tamano={20} /></span>
            <span><strong>{porConfirmar} {porConfirmar === 1 ? "movimiento" : "movimientos"} por confirmar</strong><small>Efectivo que espera tu confirmación</small></span>
            <Icono nombre="derecha" />
          </a>}
          {ordenesPorRecibir > 0 && <Link className="atencion-tarjeta" data-tono="info" href="/recepciones">
            <span className="atencion-icono"><Icono nombre="carrito" tamano={20} /></span>
            <span><strong>{ordenesPorRecibir === 1 ? "1 orden de compra" : `${ordenesPorRecibir} órdenes de compra`} por recibir</strong><small>Equipo, servicios u otros</small></span>
            <Icono nombre="derecha" />
          </Link>}
          {!turno && puedeAbrirTurno(perfil.rol) && <a className="atencion-tarjeta" data-tono="peligro" href="#t-turno">
            <span className="atencion-icono"><Icono nombre="alerta" tamano={20} /></span>
            <span><strong>No hay turno abierto</strong><small>Ábrelo para registrar arqueos y movimientos</small></span>
            <Icono nombre="derecha" />
          </a>}
        </section>
      )}

      <div className="panel-fila">
        <section className="seccion" aria-labelledby="t-saldos">
          <div className="seccion-cabecera">
            <h2 id="t-saldos">Efectivo disponible</h2>
            <p className="saldo-nota">Movimientos confirmados. La caja de venta se revisa en el arqueo.</p>
          </div>
          <div className="indicadores-marco"><div className="indicadores inicio-saldos">
            <div className="indicador">
              <span className="indicador-etiqueta">Bóveda</span>
              <strong className="indicador-valor">{pesos(saldo("boveda"))}</strong>
              <span className="indicador-detalle">Efectivo de ventas por entregar a corporativo</span>
            </div>
            <div className="indicador">
              <span className="indicador-etiqueta">Caja chica</span>
              <strong className="indicador-valor">{pesos(saldo("caja_chica"))}</strong>
              <span className="indicador-detalle">Fondo autorizado {pesos(sucursal.fondo_caja_chica)}</span>
            </div>
            <div className="indicador" data-alerta={Number(cambios) === Number(sucursal.fondo_cambios) ? undefined : "aviso"}>
              <span className="indicador-etiqueta">Fondo de cambios</span>
              <strong className="indicador-valor">{pesos(cambios)}</strong>
              <span className="indicador-cambio">{Number(cambios) === Number(sucursal.fondo_cambios)
                ? <><Icono nombre="ok" /> Completo</>
                : `Debe sumar ${pesos(sucursal.fondo_cambios)}`}</span>
            </div>
          </div></div>
        </section>

        <section className="seccion" id="t-turno" aria-labelledby="t-turno-titulo">
          <div className="seccion-cabecera">
            <h2 id="t-turno-titulo">Turno</h2>
            <span className="insignia" data-tono={turno ? "exito" : "aviso"}>{turno ? "Abierto" : "Cerrado"}</span>
          </div>
          {turno ? (
            <div className="acciones">
              <p>Turno {turno.tipo} abierto desde las {hora(turno.abierto_en)}</p>
              {!soloLectura && <Link className="boton" href="/arqueo">Registrar arqueo</Link>}
            </div>
          ) : puedeAbrirTurno(perfil.rol) ? (
            <form action={abrirTurno} className="acciones">
              <select name="tipo" aria-label="Turno" defaultValue="matutino">
                <option value="matutino">Matutino</option>
                <option value="vespertino">Vespertino</option>
              </select>
              <BotonEnviar pendiente="Abriendo…">Abrir turno</BotonEnviar>
            </form>
          ) : (
            <p className="vacio">{soloLectura ? "No hay turno abierto." : "No hay turno abierto. Pide al encargado que lo abra."}</p>
          )}
        </section>
      </div>

      <section className="seccion" id="t-pendientes" aria-labelledby="t-pendientes-titulo">
        <div className="seccion-cabecera">
          <h2 id="t-pendientes-titulo">Por confirmar</h2>
          <span className="insignia" data-tono={porConfirmar ? "aviso" : "exito"}>{porConfirmar ? porConfirmar : "Al día"}</span>
        </div>
        {!pendientes?.length ? (
          <p className="vacio">No hay movimientos esperando confirmación.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead><tr><th>Hora</th><th>Movimiento</th><th>De → a</th><th>Registró</th><th>Monto</th><th></th></tr></thead>
              <tbody>
                {pendientes.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Hora">{hora(m.creado_en)}</td>
                    <td data-label="Movimiento">{NOMBRE_MOVIMIENTO[m.tipo]}</td>
                    <td data-label="De → a">{caja.get(m.caja_origen_id)} → {caja.get(m.caja_destino_id)}</td>
                    <td data-label="Registró">{persona.get(m.registrado_por)}</td>
                    <td data-label="Monto" className="monto">{pesos(m.monto)}</td>
                    <td data-label="">
                      {soloLectura ? null : m.registrado_por === perfil.id ? (
                        <span className="saldo-nota">Lo confirma otra persona</span>
                      ) : (
                        <div className="acciones">
                          <form action={confirmarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/" />
                            <BotonEnviar pendiente="…">Recibí el efectivo</BotonEnviar>
                          </form>
                          <form action={rechazarMovimiento}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="volver" value="/" />
                            <BotonEnviar className="boton boton-alerta" pendiente="…" confirmar="¿Rechazar este movimiento? No se puede deshacer; habría que registrarlo de nuevo.">Rechazar</BotonEnviar>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {["admin","corporativo"].includes(perfil.rol)&&<DashboardVentasInicio supabase={supabase} rol={perfil.rol} mes={ventas_mes} sucursal={ventas_sucursal} porDefecto={sucursal.id} ruta="/"/>}

      <section className="seccion" aria-labelledby="t-resumen">
        <h2 id="t-resumen">Ir a</h2>
        <div className="inicio-accesos">{accesos.map((a) => <Link key={a.href} className="inicio-acceso" href={a.href}>
          <IconoInicio nombre={a.titulo} />
          <strong>{a.titulo}<span aria-hidden="true">↗</span></strong><span>{a.nota}</span>
        </Link>)}</div>
      </section>
    </div>
  );
}