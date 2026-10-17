"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Cajon } from "@/components/Cajon";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { fechaTexto, pesos } from "@/lib/formato";
import type { ConciliacionVenta } from "@/lib/ventas/conciliacion";
import { anularConciliacion, guardarConciliacion } from "./acciones";

/** vigente = tiene conciliación activa; cuadra = diferencia de $1 o menos; revisar = lo demás. Mismo criterio que antes. */
export type EstadoDia = "vigente" | "cuadra" | "revisar";
export type DiaConciliacion = {
  importacion_id: string; sucursal_id: string; sucursal: string; fecha: string;
  total: number; efectivo: number; tarjeta: number; en_linea: number;
  /** Suma de productos con descuento y bruta; null si el día no tiene detalle de productos. */
  importe: number | null; bruta: number | null;
  diferencia: number; estado: EstadoDia;
  activa: ConciliacionVenta | null; historial: ConciliacionVenta[];
};

const ETIQUETA: Record<EstadoDia, string> = { revisar: "Requiere revisión", vigente: "Conciliación vigente", cuadra: "Cuadra" };
const TONO: Record<EstadoDia, string> = { revisar: "peligro", vigente: "aviso", cuadra: "exito" };
const ICONO = { revisar: "alerta", vigente: "documento", cuadra: "ok" } as const;
const FILTROS: { clave: "" | EstadoDia; texto: string }[] = [
  { clave: "", texto: "Todos" }, { clave: "revisar", texto: "Por revisar" }, { clave: "vigente", texto: "Conciliados" }, { clave: "cuadra", texto: "Cuadran" },
];

function Estado({ estado }: { estado: EstadoDia }) {
  return <span className="insignia" data-tono={TONO[estado]}><Icono nombre={ICONO[estado]} />{ETIQUETA[estado]}</span>;
}

/** Mes de conciliación: tira de días por sucursal, lista filtrable y el detalle del día (con sus formularios) en el cajón. */
export function ConciliacionMes({ mes, dias, autores, edita, disponible }: {
  mes: string; dias: DiaConciliacion[]; autores: Record<string, string>; edita: boolean; disponible: boolean;
}) {
  const [filtro, setFiltro] = useState<"" | EstadoDia>("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const actual = dias.find((d) => d.importacion_id === abierto);

  const cuenta = (e: EstadoDia) => dias.filter((d) => d.estado === e).length;
  const sinRevisar = dias.filter((d) => d.estado === "revisar").reduce((s, d) => s + d.diferencia, 0);
  const ultimoDia = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  const fechas = Array.from({ length: ultimoDia }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
  const sucursales = [...new Map(dias.map((d) => [d.sucursal_id, d.sucursal])).entries()];
  const visibles = dias.filter((d) => !filtro || d.estado === filtro);

  if (!dias.length) return <EstadoVacio titulo="Sin ventas Dodo IS en este mes" descripcion="Cuando se importen las ventas del periodo, cada día aparecerá aquí con su estado." icono="calendario" />;

  return (
    <>
      <section className="seccion" aria-labelledby="t-tira">
        <div className="seccion-cabecera">
          <h2 id="t-tira">Día por día</h2>
          <p className="saldo-nota">Toca un día para ver su detalle.</p>
        </div>
        <div className="conteos">
          <p><strong>{cuenta("cuadra")}</strong><span><span className="marca-punto" data-tono="exito" />cuadran</span></p>
          <p><strong>{cuenta("vigente")}</strong><span><span className="marca-punto" data-tono="aviso" />conciliados</span></p>
          <p><strong className={cuenta("revisar") ? "texto-alerta" : undefined}>{cuenta("revisar")}</strong><span><span className="marca-punto" data-tono="peligro" />por revisar</span></p>
          <p className="conteos-total"><span>Diferencia por revisar</span><strong className={sinRevisar ? "texto-alerta" : undefined}>{pesos(sinRevisar)}</strong></p>
        </div>
        {sucursales.map(([id, nombre]) => (
          <div className="tira" key={id}>
            {sucursales.length > 1 && <p className="tira-nombre">{nombre}</p>}
            <div className="tira-dias" role="group" aria-label={`Días de ${nombre}`} style={{ "--dias": ultimoDia } as React.CSSProperties}>
              {fechas.map((f) => {
                const d = dias.find((x) => x.sucursal_id === id && x.fecha === f);
                const n = Number(f.slice(8));
                return d ? (
                  <button key={f} type="button" data-estado={d.estado} aria-pressed={abierto === d.importacion_id}
                    title={`${fechaTexto(f)} · ${ETIQUETA[d.estado]} · ${pesos(d.diferencia)}`} aria-label={`${fechaTexto(f)}: ${ETIQUETA[d.estado]}`}
                    onClick={() => setAbierto(d.importacion_id)}>{n}</button>
                ) : <span key={f} data-estado="sin" title={`${fechaTexto(f)} · sin importación`}>{n}</span>;
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="seccion" aria-labelledby="t-dias">
        <div className="seccion-cabecera">
          <h2 id="t-dias" className="solo-lector">Días del mes</h2>
          <div className="segmentos" role="group" aria-label="Filtrar días">
            {FILTROS.map((f) => <button key={f.clave} type="button" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)}>{f.texto}</button>)}
          </div>
          <p className="saldo-nota" aria-live="polite">{visibles.length} {visibles.length === 1 ? "día" : "días"}</p>
        </div>
        <ul className="renglones-dia">
          {visibles.map((d) => (
            <li key={d.importacion_id}>
              <button type="button" onClick={() => setAbierto(d.importacion_id)} aria-haspopup="dialog">
                <span className="renglon-fecha"><strong>{fechaTexto(d.fecha)}</strong><small>{d.sucursal}</small></span>
                <span className="renglon-cifras"><small>Venta diaria</small>{pesos(d.total)}</span>
                <span className="renglon-cifras"><small>Productos</small>{d.importe === null ? "Sin detalle" : pesos(d.importe)}</span>
                <span className="renglon-diferencia" data-estado={d.estado}><small>Diferencia</small>{pesos(d.diferencia)}</span>
                <Estado estado={d.estado} />
                <Icono nombre="derecha" />
              </button>
            </li>
          ))}
          {!visibles.length && <li className="vacio">Ningún día con este estado.</li>}
        </ul>
      </section>

      <Cajon abierto={!!actual} alCerrar={() => setAbierto(null)} titulo={actual ? fechaTexto(actual.fecha) : ""} antetitulo={actual?.sucursal}>
        {actual && <DetalleDia d={actual} mes={mes} autores={autores} edita={edita} disponible={disponible} />}
      </Cajon>
    </>
  );
}

function DetalleDia({ d, mes, autores, edita, disponible }: { d: DiaConciliacion; mes: string; autores: Record<string, string>; edita: boolean; disponible: boolean }) {
  const mayor = Math.max(d.total, d.importe ?? 0, 1);
  const pagos = [
    { clave: "efectivo", texto: "Efectivo", valor: d.activa ? Number(d.activa.efectivo) : d.efectivo },
    { clave: "tarjeta", texto: "Tarjeta", valor: d.activa ? Number(d.activa.tarjeta) : d.tarjeta },
    { clave: "en_linea", texto: "En línea", valor: d.activa ? Number(d.activa.en_linea) : d.en_linea },
  ];
  const sumaPagos = pagos.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <>
      <div className="dia-diferencia">
        <p className="cajon-antetitulo">Diferencia</p>
        <strong data-estado={d.estado}>{pesos(d.diferencia)}</strong>
        <Estado estado={d.estado} />
      </div>

      <section className="cajon-grupo" aria-label="Venta contra productos">
        <h3>Venta contra productos</h3>
        <div className="comparar">
          <p><span>Venta diaria</span><span className="comparar-barra"><span style={{ width: `${(d.total / mayor) * 100}%` }} /></span><strong>{pesos(d.total)}</strong></p>
          <p><span>Productos con descuentos</span><span className="comparar-barra" data-alt="si"><span style={{ width: `${((d.importe ?? 0) / mayor) * 100}%` }} /></span><strong>{d.importe === null ? "Sin detalle" : pesos(d.importe)}</strong></p>
        </div>
        <p className="saldo-nota">Venta bruta de productos: {d.bruta === null ? "Sin dato" : pesos(d.bruta)}</p>
      </section>

      <section className="cajon-grupo" aria-label="Formas de pago">
        <h3>Formas de pago {d.activa ? "conciliadas" : "importadas"}</h3>
        <div className="pagos-barra" aria-hidden="true">{pagos.map((p) => <span key={p.clave} data-pago={p.clave} style={{ flexGrow: p.valor / sumaPagos }} />)}</div>
        <dl className="pagos-leyenda">{pagos.map((p) => <div key={p.clave}><dt><span className="marca-punto" data-pago={p.clave} />{p.texto}</dt><dd>{pesos(p.valor)}</dd></div>)}</dl>
        {d.activa && <p className="saldo-nota">{d.activa.conciliar_productos ? "Diferencia de productos justificada" : "Sin aprobación de diferencia de productos"}</p>}
      </section>

      {edita && disponible && !d.activa && (
        <section className="cajon-grupo" aria-label="Conciliar este día">
          <h3>Conciliar este día</h3>
          <form action={guardarConciliacion} className="formulario">
            <input type="hidden" name="importacion_id" value={d.importacion_id} /><input type="hidden" name="mes" value={mes} />
            <p className="saldo-nota">Importado: efectivo {pesos(d.efectivo)}, tarjeta {pesos(d.tarjeta)}, en línea {pesos(d.en_linea)}. La suma corregida debe conservar {pesos(Number(d.efectivo) + Number(d.tarjeta) + Number(d.en_linea))}.</p>
            {(["efectivo", "tarjeta", "en_linea"] as const).map((k) => (
              <div className="campo" key={k}>
                <label htmlFor={`${d.importacion_id}-${k}`}>{k === "efectivo" ? "Efectivo correcto" : k === "tarjeta" ? "Tarjeta correcta" : "En línea correcto"}</label>
                <input id={`${d.importacion_id}-${k}`} name={k} type="number" min="0" step="0.01" defaultValue={Number(d[k]).toFixed(2)} required />
              </div>
            ))}
            <label className="casilla conciliacion-casilla"><input type="checkbox" name="conciliar_productos" value="si" disabled={d.importe === null && Number(d.total) !== 0} />Revisé y justifiqué la diferencia entre el detalle de productos y la venta diaria.</label>
            <p className="saldo-nota">Esta confirmación justifica la diferencia; no cambia los importes de productos ni fuerza el cuadre. Si falta detalle, reimporta el archivo.</p>
            <div className="campo">
              <label htmlFor={`${d.importacion_id}-motivo`}>Motivo y evidencia de la corrección</label>
              <textarea id={`${d.importacion_id}-motivo`} name="motivo" minLength={10} maxLength={1000} required placeholder="Ejemplo: cobro de $500 registrado en efectivo; comprobante de terminal…" />
            </div>
            <BotonEnviar>Guardar conciliación</BotonEnviar>
          </form>
        </section>
      )}

      {d.historial.length > 0 && (
        <section className="cajon-grupo" aria-label="Historial">
          <h3>Historial ({d.historial.length})</h3>
          <ol className="historial-dia">
            {d.historial.map((c) => (
              <li key={c.id} data-anulada={c.anulado_en ? "si" : undefined}>
                <strong>{c.anulado_en ? "Anulada" : c.importacion_id === d.importacion_id ? "Vigente" : "Importación reemplazada; requiere nueva revisión"}</strong>
                <small>{autores[c.registrado_por] ?? "Usuario registrado"} · {new Date(c.registrado_en).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</small>
                <p>{c.motivo}</p>
                <small>Efectivo {pesos(c.original.efectivo)} → {pesos(c.efectivo)} · Tarjeta {pesos(c.original.tarjeta)} → {pesos(c.tarjeta)} · En línea {pesos(c.original.en_linea)} → {pesos(c.en_linea)}</small>
                <small>Diferencia original {pesos(Number(c.original.total) - Number(c.original.suma_productos))} · {c.conciliar_productos ? "Productos conciliados" : "Solo formas de pago"}</small>
                {c.anulado_en && <small>Motivo de anulación: {c.motivo_anulacion}</small>}
                {edita && !c.anulado_en && (
                  <form action={anularConciliacion} className="formulario anular">
                    <input type="hidden" name="id" value={c.id} /><input type="hidden" name="mes" value={mes} />
                    <div className="campo"><label htmlFor={`${c.id}-anular`}>Motivo para anular</label><input id={`${c.id}-anular`} name="motivo" minLength={10} maxLength={1000} required /></div>
                    <BotonEnviar className="boton boton-secundario">Anular conciliación</BotonEnviar>
                  </form>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
