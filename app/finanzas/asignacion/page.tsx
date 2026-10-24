import Link from 'next/link';
import { obtenerPerfil } from '@/lib/contexto';
import { hoyCalendarioMX, pesos } from '@/lib/formato';
import { estadoAsignacion, type MovimientoContable, type AsignacionContable } from '@/lib/finanzas/asignacion';

export default async function Asignaciones({searchParams}:{searchParams:Promise<{mes?:string;pagina?:string;factura?:string}>}) {
  const {supabase}=await obtenerPerfil();
  const q=await searchParams;
  const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes??'')?q.mes!:hoyCalendarioMX().slice(0,7);
  const pagina=Math.max(0,Math.min(10000,Number.parseInt(q.pagina??'0')||0));
  const siguiente=new Date(`${mes}-01T12:00:00Z`);siguiente.setUTCMonth(siguiente.getUTCMonth()+1);
  siguiente.setUTCDate(0);
  let consulta=supabase.from('contabilidad_movimientos').select('*',{count:'exact'}).gte('cubre_hasta',`${mes}-01`).lte('cubre_desde',siguiente.toISOString().slice(0,10));
  if(q.factura)consulta=consulta.eq('factura_id',q.factura);
  const {data,error,count}=await consulta.order('fecha').order('clave').range(pagina*50,pagina*50+49).returns<MovimientoContable[]>();
  if(error)return <section><h1>Asignación de cuentas</h1><p>No se pudo cargar la revisión contable. Verifica que se haya ejecutado la migración y sus pruebas; no se muestran datos parciales.</p></section>;
  const movimientos=data??[];
  const actuales=movimientos.length?await supabase.from('contabilidad_actual').select('*').in('clave',movimientos.map(m=>m.clave)).returns<AsignacionContable[]>():{data:[],error:null};
  if(actuales.error)throw new Error('No se pudo consultar el estado de asignaciones.');
  const porClave=new Map((actuales.data??[]).map(a=>[a.clave,a]));
  const enlace=(p:number)=>`/finanzas/asignacion?mes=${mes}&pagina=${p}${q.factura?`&factura=${encodeURIComponent(q.factura)}`:''}`;
  return <div className="panel-admin"><Link href="/finanzas">← P&L</Link><h1>Asignación de cuentas exactas</h1>
    <p>Revisa cada equivalencia antes de aplicarla. Octubre y las nuevas capturas usan el mismo flujo; no hay asignación automática por nombre.</p>
    <p>La cuenta exacta es una clasificación adicional. Conserva la categoría operativa y los cálculos actuales del P&L. Los importes de esta lista son referencia del origen, sin prorrateo; no deben sumarse como un P&L.</p>
    <form method="get" className="barra-filtros"><label>Mes<input name="mes" type="month" defaultValue={mes}/></label>{q.factura&&<input type="hidden" name="factura" value={q.factura}/>}<button className="boton">Ver</button></form>
    <p>{count??0} movimientos · página {pagina+1} · hasta 50 por página</p>
    <div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Fecha / origen</th><th>Descripción</th><th>RFC</th><th>Categoría actual</th><th>Importe de origen</th><th>Cuenta exacta</th><th>Revisión</th></tr></thead><tbody>{movimientos.map(m=>{const a=porClave.get(m.clave);return <tr key={m.clave}><td>{m.fecha}<small className="pl-pct">{m.clave.split(':')[0]}</small></td><td>{m.descripcion}{m.factura_id&&<><br/><Link href={`/compras/facturas/${m.factura_id}`}>Ver factura</Link></>}</td><td>{m.rfc??a?.rfc??'Por confirmar'}</td><td>{m.categoria??'Otros (sin categoría)'}</td><td>{pesos(Number(m.importe))}</td><td>{a?.codigo??'Sin asignar'}<small className="pl-pct">{estadoAsignacion(m,a)}</small></td><td><Link className="boton boton-secundario" href={`/finanzas/asignacion/${encodeURIComponent(m.clave)}`}>Revisar cuenta</Link></td></tr>;})}</tbody></table></div>
    {!movimientos.length&&<p>No hay movimientos vigentes en este filtro.</p>}
    <nav aria-label="Páginas de asignaciones">{pagina>0&&<Link href={enlace(pagina-1)}>← Anterior</Link>} {' '}{(pagina+1)*50<(count??0)&&<Link href={enlace(pagina+1)}>Siguiente →</Link>}</nav>
  </div>;
}
