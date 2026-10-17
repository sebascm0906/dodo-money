import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { Icono } from "@/components/Icono";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { puedeImportarVentas, veVentasDeTodas } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { leerConciliaciones } from "./datos";
import { ConciliacionMes, type DiaConciliacion } from "./ConciliacionMes";

type Dia = { sucursal_id:string; fecha:string; importacion_id:string; total:number; efectivo:number; tarjeta:number; en_linea:number; iva:number };
type Producto = { sucursal_id:string; fecha:string; importe:number; importe_sin_descuento:number };
export default async function Conciliacion({searchParams}:{searchParams:Promise<{mes?:string;sucursal?:string;ok?:string;error?:string}>}) {
 const {supabase,perfil}=await obtenerPerfil(),q=await searchParams;
 const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes??"")?q.mes!:hoyCalendarioMX().slice(0,7);
 const desde=`${mes}-01`,hasta=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
 const todas=veVentasDeTodas(perfil.rol),edita=puedeImportarVentas(perfil.rol);
 const [{data:sucursales,error},datos,productos,conciliaciones,{data:personas}]=await Promise.all([
  supabase.from("sucursales").select("id,nombre").order("nombre"),
  leerTodo<Dia>((a,b)=>supabase.from("ventas_dia").select("sucursal_id,fecha,importacion_id,total,efectivo,tarjeta,en_linea,iva").gte("fecha",desde).lte("fecha",hasta).order("sucursal_id").order("fecha").range(a,b)),
  leerTodo<Producto>((a,b)=>supabase.from("ventas_producto").select("sucursal_id,fecha,importe,importe_sin_descuento").gte("fecha",desde).lte("fecha",hasta).order("sucursal_id").order("fecha").order("dodo_id").range(a,b)),
  leerConciliaciones(supabase,desde,hasta,true),
  supabase.from("perfiles").select("id,nombre"),
 ]);
 if(error)throw Error(error.message);
 const sucursal=todas?(sucursales??[]).find(s=>s.id===q.sucursal)?.id:perfil.sucursal_id;
 const dias=datos.filter(d=>!sucursal||d.sucursal_id===sucursal),nombres=new Map((sucursales??[]).map(s=>[s.id,s.nombre]));
 const autores=new Map((personas??[]).map(p=>[p.id,p.nombre]));
 const suma=new Map<string,{importe:number;bruta:number;n:number}>();
 for(const p of productos){const k=`${p.sucursal_id}|${p.fecha}`,s=suma.get(k)??{importe:0,bruta:0,n:0};s.importe+=Number(p.importe);s.bruta+=Number(p.importe_sin_descuento);s.n++;suma.set(k,s);}
 const filas:DiaConciliacion[]=dias.map(d=>{
  const s=suma.get(`${d.sucursal_id}|${d.fecha}`),diferencia=Math.round((Number(d.total)-(s?.importe??0))*100)/100;
  const historial=conciliaciones.filas.filter(c=>c.sucursal_id===d.sucursal_id&&c.fecha===d.fecha);
  const activa=historial.find(c=>!c.anulado_en&&c.importacion_id===d.importacion_id)??null;
  return {importacion_id:d.importacion_id,sucursal_id:d.sucursal_id,sucursal:nombres.get(d.sucursal_id)??"",fecha:d.fecha,
   total:Number(d.total),efectivo:Number(d.efectivo),tarjeta:Number(d.tarjeta),en_linea:Number(d.en_linea),
   importe:s?s.importe:null,bruta:s?s.bruta:null,diferencia,estado:activa?"vigente":Math.abs(diferencia)<=1?"cuadra":"revisar",activa,historial};
 });
 return <><EncabezadoPagina titulo="Conciliación con Dodo IS" descripcion="Compara la venta diaria con los productos vendidos, corrige formas de pago y justifica lo que no cuadra. La importación original se conserva."
   acciones={<Link className="boton boton-secundario" href="/ventas">Ver ventas</Link>}/>
  <Aviso ok={q.ok} error={q.error}/>
  {!conciliaciones.disponible&&<p className="aviso aviso-error">Falta aplicar la migración 0034_conciliacion_ventas.sql en Supabase.</p>}
  <form className="barra-filtros" aria-label="Periodo">
   <label htmlFor="mes" className="solo-lector">Mes</label><input id="mes" name="mes" type="month" defaultValue={mes} required/>
   {todas&&<><label htmlFor="sucursal" className="solo-lector">Sucursal</label><select id="sucursal" name="sucursal" defaultValue={sucursal??""}><option value="">Todas las sucursales</option>{sucursales?.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></>}
   <button className="boton boton-secundario boton-compacto">Consultar</button>
   <details className="nota-plegable"><summary><Icono nombre="info"/>Cómo afecta un ajuste</summary><p>Los ajustes de cobro se reflejan en Ventas, en el comparativo con cierres y en las comisiones estimadas del P&L. La venta total, el IVA, los pedidos y los costos de receta se conservan. El detalle de pedidos mantiene la forma de pago original.</p></details>
  </form>
  <ConciliacionMes mes={mes} dias={filas} autores={Object.fromEntries(autores)} edita={edita} disponible={conciliaciones.disponible}/>
 </>;
}