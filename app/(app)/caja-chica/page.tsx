import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import Link from 'next/link';
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeGestionar } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { BUCKET_FOTOS } from "@/lib/fotos";
import { porReponerAEmpleados, sumaPorOrigen } from "@/lib/gastos";
import {ListaGastos,type Gasto} from "./ListaGastos";
import type {HistorialGasto} from './EdicionGasto';
import {leerTodo} from "@/lib/ventas/paginar";
import { CampoOrigen } from "./CampoOrigen";
import { marcarRepuesto, registrarGasto, solicitarReposicion } from "./actions";

const COLUMNAS = "id, fecha, fecha_capturada_original, concepto, proveedor, monto, comprobante, creado_en, foto_path, origen, pagado_por, repuesto_en, informativo, motivo_informativo, referencia_informativa, informado_por, informado_en, respaldo_informativo, uuid_cfdi, cuenta_pl, version, anulado_en, motivo_anulacion";

export default async function CajaChica({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();

  const [{ data: ultima }, { data: saldo }, { data: personas }, { data: deEmpleados }] = await Promise.all([
    supabase.from("movimientos").select("creado_en").eq("sucursal_id", sucursal.id)
      .eq("tipo", "reposicion_caja_chica").neq("estado", "rechazado")
      .order("creado_en", { ascending: false }).limit(1).maybeSingle<{ creado_en: string }>(),
    supabase.from("saldos_cajas").select("saldo").eq("sucursal_id", sucursal.id).eq("tipo", "caja_chica")
      .maybeSingle<{ saldo: number }>(),
    supabase.from("perfiles").select("id, nombre, sucursal_id, activo").order("nombre")
      .returns<{ id: string; nombre: string; sucursal_id:string|null; activo:boolean }[]>(),
    supabase.from("gastos_caja_chica").select(COLUMNAS).eq("sucursal_id", sucursal.id)
      .eq("origen", "empleado").eq("informativo", false).is("anulado_en",null).is("repuesto_en", null).order("fecha").returns<Gasto[]>(),
  ]);
  const nombre = new Map((personas ?? []).map((p) => [p.id, p.nombre]));
  const pagadores=(personas??[]).filter(p=>p.sucursal_id===sucursal.id),pagadoresNombre=new Map(pagadores.map(p=>[p.id,p.nombre]));

  const todos=await leerTodo<Gasto>((d,h)=>supabase.from("gastos_caja_chica").select(COLUMNAS).eq("sucursal_id",sucursal.id).order("creado_en",{ascending:false}).order("id").range(d,h).returns<Gasto[]>());
  const activos=todos.filter(g=>!g.anulado_en),eliminados=todos.filter(g=>g.anulado_en);
  const historial=await leerTodo<HistorialGasto>((d,h)=>supabase.from("gastos_historial").select("id,gasto_id,autor_id,accion,motivo,antes,despues,creado_en,gastos_caja_chica!inner(sucursal_id)").eq("gastos_caja_chica.sucursal_id",sucursal.id).order("creado_en",{ascending:false}).order("id").range(d,h).returns<HistorialGasto[]>());
  const gastos=ultima?activos.filter(g=>new Date(g.creado_en).getTime()>new Date(ultima.creado_en).getTime()):activos;
  const anteriores=ultima?activos.filter(g=>new Date(g.creado_en).getTime()<=new Date(ultima.creado_en).getTime()):[];

  // Enlaces temporales (1 hora): las fotos están en un bucket privado.
  const rutas = todos.flatMap(g=>[g.foto_path,g.respaldo_informativo].filter((p):p is string=>Boolean(p)));
  const { data: firmadas } = rutas.length
    ? await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(rutas, 3600)
    : { data: [] };
  const urlFoto = new Map((firmadas ?? []).flatMap((f) => (f.path && f.signedUrl ? [[f.path, f.signedUrl] as const] : [])));

  // Solo lo que salió de la caja chica se repone desde corporativo; lo de bóveda no se repone y lo de empleados va aparte.
  const porReponer = sumaPorOrigen(gastos ?? []).caja_chica;
  const empleados = porReponerAEmpleados(deEmpleados ?? []);
  const marca = puedeGestionar(perfil.rol) && !soloLectura;
  const fondo = Number(sucursal.fondo_caja_chica);
  const enCaja = Number(saldo?.saldo ?? 0);
  const sinComprobante = (gastos ?? []).filter((g) => g.comprobante === "sin_comprobante").length;

  return (
    <>
      <EncabezadoPagina titulo="Gastos" descripcion="Registra limpieza, agua y otros gastos con su origen y comprobante. Si ya estaban descontados en un corte anterior, elige el registro informativo para evitar otra salida." />
      {perfil.rol==='admin'&&<p><Link className="boton boton-secundario" href="/finanzas/asignacion">Revisar cuentas contables de gastos</Link></p>}
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-estado">
        <h2 id="t-estado">Fondo de caja chica</h2>
        <div className="rejilla">
          <div className="saldo"><span>Fondo autorizado</span><span className="saldo-monto">{pesos(fondo)}</span></div>
          <div className="saldo"><span>Gastos de caja chica por reponer</span><span className="saldo-monto">{pesos(porReponer)}</span>
            {sinComprobante > 0 && <span className="saldo-nota">{sinComprobante} sin comprobante</span>}</div>
          <div className="saldo"><span>Debe haber en caja</span><span className="saldo-monto">{pesos(enCaja)}</span>
            <span className="saldo-nota">Fondo menos gastos, más reposiciones confirmadas</span></div>
        </div>
        {porReponer > 0 && !soloLectura && (
          <form action={solicitarReposicion} className="acciones">
            <input type="hidden" name="monto" value={porReponer} />
            <BotonEnviar className="boton boton-secundario" pendiente="Solicitando…">Solicitar reposición de {pesos(porReponer)}</BotonEnviar>
          </form>
        )}
      </section>

      {!soloLectura && (
      <details className="seccion caja-chica-acordeon">
        <summary id="t-gasto">Registrar gasto <span>Capturar un nuevo gasto y su comprobante</span></summary>
      <form action={registrarGasto} aria-labelledby="t-gasto">
        <input type="hidden" name="solicitud" value={crypto.randomUUID()}/>
        <div className="rejilla">
          <div className="campo"><label htmlFor="fecha">Fecha</label><input id="fecha" name="fecha" type="date" defaultValue={hoyMX()} max={hoyMX()} required /></div>
          <div className="campo"><label htmlFor="concepto">Concepto</label><input id="concepto" name="concepto" required placeholder="Ej. garrafón de agua" /></div>
          <div className="campo"><label htmlFor="proveedor">Proveedor</label><input id="proveedor" name="proveedor" /></div>
          <CampoOrigen personas={pagadores.filter(p=>p.activo)} yo={perfil.id} />
          <div className="campo"><label htmlFor="monto">Monto</label><input id="monto" name="monto" type="number" inputMode="decimal" min="0.5" step="0.01" required /></div>
          <div className="campo">
            <label htmlFor="comprobante">Comprobante</label>
            <select id="comprobante" name="comprobante" defaultValue="cfdi">
              <option value="cfdi">Factura (CFDI)</option>
              <option value="nota">Nota o ticket</option>
              <option value="sin_comprobante">Sin comprobante</option>
            </select>
          </div>
          <div className="campo"><label htmlFor="uuid_cfdi">Folio fiscal (UUID)</label><input id="uuid_cfdi" name="uuid_cfdi" placeholder="Solo si hay factura" /></div>
        </div>
        <div className="acciones"><BotonEnviar>Registrar gasto</BotonEnviar></div>
      </form>
      </details>
      )}

      <details className="seccion caja-chica-acordeon">
        <summary id="t-empleados">Por reponer a empleados <span>{empleados.length} {empleados.length === 1 ? "empleado" : "empleados"} · {pesos(empleados.reduce((total, e) => total + e.total, 0))}</span></summary>
        {!empleados.length ? <p className="vacio">No hay gastos pagados por empleados pendientes de reponer.</p> : (
          <div className="tarjetas">
            {empleados.map((e) => (
              <article key={e.persona} className="tarjeta" data-alerta="si">
                <div className="tarjeta-encabezado">
                  <div>
                    <h3>{nombre.get(e.persona) ?? "Empleado"} · {pesos(e.total)}</h3>
                    <p className="tarjeta-estado">{e.gastos.length} {e.gastos.length === 1 ? "gasto" : "gastos"} por reponer</p>
                  </div>
                </div>
                <ul className="lista-repuestos">
                  {e.gastos.map((g) => (
                    <li key={g.id}>
                      <span>{fechaTexto(g.fecha)} · {g.concepto} · <strong>{pesos(g.monto)}</strong></span>
                      {marca && (
                        <form action={marcarRepuesto}>
                          <input type="hidden" name="id" value={g.id} />
                          <BotonEnviar className="boton boton-secundario" pendiente="…" confirmar={`¿Ya se le regresaron ${pesos(g.monto)} a ${nombre.get(e.persona) ?? "esta persona"}?`}>Marcar repuesto</BotonEnviar>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </details>

      <details className="seccion caja-chica-acordeon">
        <summary id="t-gastos">Gastos desde la última reposición <span>{gastos?.length ?? 0} registros · {pesos((gastos ?? []).reduce((total, g) => total + Number(g.monto), 0))}</span></summary>
        <ListaGastos gastos={gastos} nombres={nombre} fotos={urlFoto} edita={perfil.rol==="admin"} historial={historial} pagadores={pagadoresNombre}/>

      </details>
      {anteriores.length>0&&<details className="seccion caja-chica-acordeon"><summary>Gastos anteriores <span>{anteriores.length} registros · historial</span></summary><ListaGastos gastos={anteriores} nombres={nombre} fotos={urlFoto} edita={perfil.rol==="admin"} historial={historial} pagadores={pagadoresNombre}/></details>}
      {eliminados.length>0&&<details className="seccion caja-chica-acordeon"><summary>Eliminados <span>{eliminados.length} capturas · no cuentan en saldo ni P&L</span></summary><ListaGastos gastos={eliminados} nombres={nombre} fotos={urlFoto} edita={false} historial={historial} pagadores={pagadoresNombre}/></details>}
    </>
  );
}
