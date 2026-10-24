import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { obtenerPerfil } from '@/lib/contexto';
import { alternativas, codigoCompatible, estadoAsignacion, type MovimientoContable, type AsignacionContable } from '@/lib/finanzas/asignacion';
import { pesos } from '@/lib/formato';
import { confirmarCuenta } from '../acciones';

type Cuenta={codigo:string;nombre:string;rubro:string|null};
export default async function Revisar({params,searchParams}:{params:Promise<{clave:string}>;searchParams:Promise<{rfc?:string;codigo?:string;ok?:string;error?:string}>}) {
  const {clave}=await params;const q=await searchParams;
  const {supabase,perfil}=await obtenerPerfil();
  const [{data:m,error},{data:historial,error:eh},{data:razones,error:er}]=await Promise.all([
    supabase.from('contabilidad_movimientos').select('*').eq('clave',clave).maybeSingle<MovimientoContable>(),
    supabase.from('contabilidad_asignaciones').select('*').eq('clave',clave).order('revision',{ascending:false}).returns<AsignacionContable[]>(),
    supabase.from('razones_sociales').select('rfc,razon_social').eq('activa',true).order('razon_social').returns<{rfc:string;razon_social:string}[]>(),
  ]);
  if(error||eh||er)throw new Error('No se pudo cargar la revisión contable completa.');
  const actual=historial?.[0];
  const rfc=m?.rfc??q.rfc??actual?.rfc??'';
  const {data:cuentas,error:ec}=rfc?await supabase.from('contabilidad_catalogo').select('codigo,nombre,rubro').eq('rfc',rfc).eq('capturable',true).order('codigo').returns<Cuenta[]>():{data:[],error:null};
  if(ec)throw new Error('No se pudo cargar el catálogo contable.');
  const permitidas=m?(cuentas??[]).filter(c=>codigoCompatible(c.codigo,m.categoria,m.sucursal_id)):[];
  const propuesta=permitidas.find(c=>c.codigo===q.codigo);
  const retirar=q.codigo==='retirar'&&!!actual?.codigo;
  const candidatos=m?alternativas(m.categoria,rfc):[];
  return <div className="panel-admin"><Link href={`/finanzas/asignacion?mes=${m?.fecha.slice(0,7)??'2026-10'}`}>← Revisión de cuentas</Link>
    <h1>Revisar equivalencia contable</h1>{q.error&&<p role="alert">{q.error}</p>}{q.ok&&<p role="status">{q.ok}</p>}
    {!m?<p>El origen ya no está vigente o no existe. Su historial se conserva.</p>:<>
      <section className="seccion"><h2>{m.descripcion}</h2><p>{m.fecha} · {m.categoria??'Otros'} · importe de origen {pesos(Number(m.importe))}</p><p>{m.factura_id&&<Link href={`/compras/facturas/${m.factura_id}`}>Ver documento original</Link>}</p>
      <p>Actual: <strong>{actual?.codigo??'Sin asignar'}</strong> · {estadoAsignacion(m,actual)}</p>
      <p>Cobertura: {m.cubre_desde} al {m.cubre_hasta}.</p><p>La asignación conserva importes, impuestos, pagos, cobertura y sucursal. No modifica todavía la agrupación del P&L.</p></section>
      {perfil.rol==='admin'&&<section className="seccion"><h2>Seleccionar cuenta</h2>
        {!m.rfc&&<form method="get"><label>Razón social del gasto<select name="rfc" defaultValue={rfc} required><option value="">Elige…</option>{razones?.map(r=><option key={r.rfc} value={r.rfc}>{r.razon_social} · {r.rfc}</option>)}</select></label><button className="boton boton-secundario">Cargar cuentas</button><p>Confirma la empresa responsable; no se deduce solamente de la sucursal.</p></form>}
        {rfc&&<><p>RFC: <strong>{rfc}</strong></p><p>Referencias de la categoría: {candidatos.length?candidatos.map(c=>`${c.codigo} · ${c.nombre}`).join(' / '):'Requiere revisión por documento; no hay equivalencia exacta propuesta.'}</p>
          <form method="get"><input type="hidden" name="rfc" value={rfc}/><label>Cuenta exacta<select name="codigo" defaultValue={q.codigo??''} required><option value="">Elige una cuenta…</option>{permitidas.map(c=><option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre} · {c.rubro??'sin rubro'}</option>)}{actual?.codigo&&<option value="retirar">Retirar asignación y dejar pendiente</option>}</select></label><button className="boton boton-secundario">Vista previa</button></form>
        </>}
      </section>}
      {perfil.rol==='admin'&&(propuesta||retirar)&&<section className="seccion"><h2>Confirmar equivalencia</h2><p>De <strong>{actual?.codigo??'Sin asignar'}</strong> a <strong>{retirar?'Pendiente (retiro con historial)':`${propuesta!.codigo} · ${propuesta!.nombre}`}</strong></p><p>RFC {rfc} · rubro {retirar?'—':propuesta!.rubro??'sin rubro'} · importe original {pesos(Number(m.importe))}.</p>
        <form action={confirmarCuenta}><input type="hidden" name="clave" value={clave}/><input type="hidden" name="solicitud" value={randomUUID()}/><input type="hidden" name="anterior" value={actual?.id??''}/><input type="hidden" name="huella" value={m.huella}/><input type="hidden" name="rfc" value={rfc}/><input type="hidden" name="codigo" value={retirar?'retirar':propuesta!.codigo}/>
          <label>Motivo de la asignación<textarea name="motivo" required minLength={12} maxLength={1000}/></label><label><input type="checkbox" name="confirmar" value="si" required/> Revisé el documento, la razón social y la cuenta exacta.</label><button className="boton">Confirmar asignación</button>
        </form></section>}
    </>}
    <section className="seccion"><h2>Historial de asignaciones</h2>{!historial?.length&&<p>Sin cambios registrados.</p>}<ol>{historial?.map(a=><li key={a.id}><strong>Versión {a.revision} · {a.codigo??'Asignación retirada'}</strong> · {a.rfc}<p>{a.motivo}</p>{a.origen&&<p>Origen revisado: {a.origen.descripcion} · {pesos(Number(a.origen.importe))} · {a.origen.categoria??'Otros'} · {a.origen.cubre_desde} al {a.origen.cubre_hasta}</p>}<small>{a.autor_nombre} · {new Date(a.creado_en).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}</small></li>)}</ol></section>
  </div>;
}
