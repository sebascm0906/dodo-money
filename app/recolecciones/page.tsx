import Link from 'next/link';
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {randomUUID} from 'node:crypto';
import {obtenerPerfil} from '@/lib/contexto';
import {hoyMX,pesos,fechaTexto} from '@/lib/formato';
import {Aviso} from '@/components/Aviso';
import {EstadoVacio} from '@/components/EstadoVacio';
import {BotonEnviar} from '@/components/BotonEnviar';
import {leerTodo} from '@/lib/ventas/paginar';
import {estadoSalida,NOMBRE_ESTADO_SALIDA,type EstadoSalida,type Recepcion} from '@/lib/salidas';
import type {EstadoMovimiento} from '@/lib/tipos';
import {Expediente,type ExpedienteRecoleccion} from './Expediente';
import {registrarRecoleccion} from './acciones';
type Registro={id:string;desde:string;hasta:string;sucursales:{nombre:string}|null;movimientos:{monto:number;folio:string;estado:EstadoMovimiento;recepcion:Recepcion|null}|null};
export default async function Pagina({searchParams}:{searchParams:Promise<{sucursal?:string;desde?:string;hasta?:string;error?:string;ok?:string}>}){
 const {supabase,perfil}=await obtenerPerfil(),q=await searchParams;
 let consulta=supabase.from('sucursales').select('id,nombre').order('nombre');if(perfil.rol==='gerente')consulta=consulta.eq('id',perfil.sucursal_id);
 const {data:lugares,error}=await consulta;if(error)throw new Error(error.message);
 const sucursal=(lugares??[]).find(s=>s.id===q.sucursal)?.id??(perfil.rol==='gerente'?perfil.sucursal_id:'');
 const hoy=hoyMX(),dia=new Date(`${hoy}T12:00:00Z`);dia.setUTCDate(dia.getUTCDate()-6);
 const desde=q.desde??dia.toISOString().slice(0,10),hasta=q.hasta??hoy;
 let exp:ExpedienteRecoleccion|null=null,problema:string|null=null;
 if(sucursal&&q.desde&&q.hasta){const r=await supabase.rpc('vista_recoleccion',{p_sucursal:sucursal,p_desde:desde,p_hasta:hasta});if(r.error)problema=r.error.message;else exp=r.data as ExpedienteRecoleccion;}
 const registros=await leerTodo<Registro>((d,h)=>supabase.from('recolecciones_corporativo').select('id,desde,hasta,sucursales(nombre),movimientos!recolecciones_corporativo_id_fkey(monto,folio,estado,recepcion)').order('creado_en',{ascending:false}).order('id').range(d,h).returns<Registro[]>());
 const rango=(s:string)=>`/recolecciones?${new URLSearchParams({sucursal:s,desde,hasta})}`;
 const elegida=(lugares??[]).find(s=>s.id===sucursal);
 return <><EncabezadoPagina titulo="Recolecciones a corporativo" descripcion="Efectivo que cada sucursal entrega según sus cierres, con respaldo de compras y conteo al recibir." acciones={<Link className="boton boton-secundario" href="/efectivo">Salidas y entregas anteriores</Link>}/><Aviso ok={q.ok} error={q.error??problema??undefined}/>
 <div className="barra-filtros">
  {(lugares??[]).length>1&&<nav className="segmentos" aria-label="Sucursal">{lugares?.map(s=><Link key={s.id} href={rango(s.id)} aria-current={s.id===sucursal?'page':undefined}>{s.nombre}</Link>)}</nav>}
  <form className="barra-filtros" aria-label="Rango de cierres"><input type="hidden" name="sucursal" value={sucursal??''}/>
   <label className="campo-en-linea">Cierres del<input name="desde" type="date" defaultValue={desde} max={hoy} required/></label>
   <label className="campo-en-linea">al<input name="hasta" type="date" defaultValue={hasta} max={hoy} required/></label>
   <button className="boton boton-secundario boton-compacto" type="submit" disabled={!sucursal}>Revisar cierres</button>
  </form>
 </div>
 {!sucursal&&<EstadoVacio icono="tienda" titulo="Elige una sucursal" descripcion="Verás el efectivo que tiene lista para entregar según sus cierres de los últimos 7 días, y podrás preparar la entrega."/>}
 {sucursal&&!exp&&!problema&&<EstadoVacio icono="calendario" titulo={`Revisa los cierres de ${elegida?.nombre??'la sucursal'}`} descripcion="Elige el rango de cierres y toca Revisar cierres para calcular cuánto efectivo puede entregar." accion={<Link className="boton" href={rango(sucursal)}>Revisar últimos 7 días</Link>}/>}
 {exp&&<><Expediente exp={exp} compras={perfil.rol!=='gerente'}/>{['admin','gerente'].includes(perfil.rol)&&Number(exp.maximo)>0&&<form action={registrarRecoleccion} className="seccion formulario seccion-accion"><div className="seccion-cabecera"><h2>Preparar entrega</h2><span className="insignia" data-tono="exito">Máximo {pesos(Number(exp.maximo))}</span></div><input type="hidden" name="solicitud" value={randomUUID()}/><input type="hidden" name="sucursal" value={sucursal??''}/><input type="hidden" name="desde" value={desde}/><input type="hidden" name="hasta" value={hasta}/><div className="rejilla"><label className="campo">Efectivo contado para entregar<input name="monto" type="number" step="0.01" required min="0.01" defaultValue={exp.maximo}/></label><label className="campo">Folio / recibo<input name="folio" minLength={3} maxLength={100} required/></label></div><label className="campo">Nota de la entrega<textarea name="nota" required minLength={5} maxLength={1000}/></label>{exp.historicos_por_revisar.length>0&&<label className="casilla"><input type="checkbox" name="historicos_revisados" value="si" required/> Revisé los pagos históricos y el efectivo físico sin descontar movimientos dos veces.</label>}<div className="acciones"><BotonEnviar confirmar="¿Preparar esta entrega y asociar todos los cierres del rango?">Preparar recolección</BotonEnviar></div></form>}</>}
 <section className="seccion" aria-labelledby="t-entregas"><div className="seccion-cabecera"><h2 id="t-entregas">Entregas registradas</h2><span className="insignia">{registros.length}</span></div>{!registros.length?<p className="vacio">Aún no hay entregas. Cuando prepares una, aparecerá aquí con su folio y el conteo al recibir.</p>:<div className="tabla-contenedor"><table className="tabla tabla-tarjetas"><thead><tr><th>Folio</th><th>Sucursal</th><th>Cierres</th><th>Estado</th><th className="monto">Efectivo</th></tr></thead><tbody>{registros.map(r=>{const e=r.movimientos?estadoSalida(r.movimientos):null;return <tr key={r.id}><td data-label="Folio"><Link href={`/recolecciones/${r.id}`}>{r.movimientos?.folio??'Ver expediente'}</Link></td><td data-label="Sucursal">{r.sucursales?.nombre}</td><td data-label="Cierres">{fechaTexto(r.desde)} a {fechaTexto(r.hasta)}</td><td data-label="Estado">{e?<span className="insignia" data-tono={TONO_SALIDA[e]}>{NOMBRE_ESTADO_SALIDA[e]}</span>:<span className="insignia">Sin movimiento</span>}</td><td data-label="Efectivo" className="monto">{pesos(Number(r.movimientos?.monto??0))}</td></tr>;})}</tbody></table></div>}</section>
 </>;
}
/** Solo color de la insignia: el texto sigue siendo NOMBRE_ESTADO_SALIDA. */
const TONO_SALIDA:Record<EstadoSalida,string|undefined>={por_recoger:'aviso',en_camino:'info',en_corporativo:'exito',no_cuadro:'peligro',rechazada:'peligro'};