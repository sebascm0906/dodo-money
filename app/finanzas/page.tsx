import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX } from "@/lib/formato";
import { elegirPeriodo, etiquetaSemana, paramsPeriodo, semanasDesde } from "@/lib/finanzas/periodo";
import { INICIO_FECHA, INICIO_PL } from "@/lib/finanzas/pl";
import { comparativoPL, plConHistoria } from "./datos";
import { TablaComparativo } from "./TablaComparativo";
import { TablaPL } from "./TablaPL";
import AdvertenciasPL from "./AdvertenciasPL";
import { ResumenPL } from "./ResumenPL";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";

type Filtros = { periodo?: string; mes?: string; semana?: string; sucursal?: string; vista?: string };

export default async function PaginaPL({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyMX();
  const p = elegirPeriodo(q, hoy, INICIO_FECHA);
  const comparativo = q.vista === "comparativo";
  const meta = comparativo ? null : await plConHistoria(supabase, p, q.sucursal);
  const comp = comparativo ? await comparativoPL(supabase, p, q.sucursal) : null;
  const titulo = meta?.titulo ?? comp?.titulo ?? "Consolidado";
  const sucId = meta ? meta.suc?.id : comp?.suc?.id;
  const sucursales = meta ? meta.datos.porSucursal : comp?.sucursales ?? [];
  const suc: Record<string, string> = sucId ? { sucursal: sucId } : {};
  const vista: Record<string, string> = comparativo ? { vista: "comparativo" } : {};
  const filtro = new URLSearchParams({ ...paramsPeriodo(p), ...suc, ...vista }).toString();
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const pestana = (activa: boolean, href: string, texto: string) => (
    <Link aria-current={activa ? "page" : undefined} href={href}>{texto}</Link>
  );

  return (
    <div className="panel-admin">
      <EncabezadoPagina
        titulo={<>P&L · {titulo}</>}
        descripcion={<>{comp ? comp.periodoTitulo : <>{p.titulo}{enCurso && ` · hasta el ${fechaTexto(p.hasta)}`}</>}. Venta neta sin IVA, después de descuentos; criterio devengado.
          {meta && " Meta: PL Base del modelo de Dodo."}{meta && !meta.suc && " Elige una sucursal para ver de dónde sale cada renglón."}</>}
        acciones={<>
          <Link className="boton boton-secundario boton-compacto" href="/finanzas/catalogo">Catálogo contable</Link>
          <Link className="boton boton-secundario boton-compacto" href="/finanzas/asignacion">Asignar cuentas</Link>
          <Link className="boton boton-secundario boton-compacto" href={`/reporte/pl?${filtro}`} target="_blank"><Icono nombre="documento" />PDF</Link>
          <a className="boton boton-secundario boton-compacto" href={`/reporte/pl/excel?${filtro}`} download><Icono nombre="descargar" />Excel</a>
        </>}
      />
      <div className="barra-filtros">
        <nav className="segmentos" aria-label="Periodo">
          {pestana(p.tipo === "mes", `/finanzas?${new URLSearchParams({ periodo: "mes", ...suc, ...vista })}`, "Mes")}
          {pestana(p.tipo === "semana", `/finanzas?${new URLSearchParams({ periodo: "semana", ...suc, ...vista })}`, "Semana")}
        </nav>
        <nav className="segmentos" aria-label="Vista">
          {pestana(!comparativo, `/finanzas?${new URLSearchParams({ ...paramsPeriodo(p), ...suc })}`, "Contra meta")}
          {pestana(comparativo, `/finanzas?${new URLSearchParams({ ...paramsPeriodo(p), ...suc, vista: "comparativo" })}`, "Comparativo")}
        </nav>
        <form className="barra-filtros" method="get" aria-label="Periodo y sucursal">
          <input type="hidden" name="periodo" value={p.tipo} />
          {comparativo && <input type="hidden" name="vista" value="comparativo" />}
          {p.tipo === "mes" ? (
            <>
              <label htmlFor="mes" className="solo-lector">Mes</label>
              <input id="mes" name="mes" type="month" defaultValue={p.clave} min={INICIO_PL} max={hoy.slice(0, 7)} />
            </>
          ) : (
            <>
              <label htmlFor="semana" className="solo-lector">Semana</label>
              <select id="semana" name="semana" defaultValue={p.clave}>
                {semanasDesde(INICIO_FECHA, hoy).map((s) => <option key={s} value={s}>{etiquetaSemana(s)}</option>)}
              </select>
            </>
          )}
          <label htmlFor="sucursal" className="solo-lector">Sucursal</label>
          <select id="sucursal" name="sucursal" defaultValue={sucId ?? ""}>
            <option value="">Consolidado</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button className="boton boton-secundario boton-compacto" type="submit">Ver</button>
        </form>
        <details className="nota-plegable">
          <summary><Icono nombre="info" />Cómo leer este P&L</summary>
          <p>El desglose Dodo IS / POS y Rappi corresponde a la fuente de importación. Los subtotales por fuente ya están incluidos en los totales. Los porcentajes son sobre la venta neta total.</p>
          <p>Merma: productos terminados e insumos adicionales al BOM, sin IVA. Ambos descuentan del resultado; los costos desconocidos quedan pendientes.</p>
          {p.tipo === "semana" && <p>Lo que se registra por mes (nómina, renta, servicios, facturas, oficina) se reparte por días; si llega una factura de ese mes, la semana se ajusta.</p>}
          <p><Link href="/ventas/conciliacion">Revisar diferencias y conciliaciones de Dodo IS →</Link></p>
        </details>
      </div>
      {comp ? (
        comp.columnas.length === 0
          ? <EstadoVacio icono="calendario" titulo="Todavía no hay días cerrados" descripcion="El comparativo aparece cuando el periodo tenga al menos un día cerrado." />
          : <TablaComparativo columnas={comp.columnas} total={comp.total} />
      ) : meta && p.vacio ? (
        <EstadoVacio icono="calendario" titulo={p.tipo === "semana" ? "La semana apenas empieza" : "El mes apenas empieza"} descripcion="Todavía no hay días cerrados. Elige un periodo anterior para ver resultados." />
      ) : meta && (
        <>
          <ResumenPL filas={meta.filas} />
          <AdvertenciasPL avisos={meta.avisos} />
          <TablaPL r={meta} columnas={meta.columnas} />
        </>
      )}
    </div>
  );
}
