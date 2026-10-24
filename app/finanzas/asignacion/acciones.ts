'use server';
import { revalidatePath } from 'next/cache';
import { obtenerPerfil } from '@/lib/contexto';
import { volver } from '@/app/compras/servidor';

export async function confirmarCuenta(fd:FormData) {
  const texto=(c:string)=>String(fd.get(c)??'').trim();
  const clave=texto('clave');
  const ruta=`/finanzas/asignacion/${encodeURIComponent(clave)}`;
  const {supabase,perfil}=await obtenerPerfil();
  if(perfil.rol!=='admin')volver(ruta,'error','Solo administración puede asignar cuentas.');
  const {error}=await supabase.rpc('asignar_cuenta_contable',{
    p_id:texto('solicitud'),p_clave:clave,p_anterior:texto('anterior')||null,p_huella:texto('huella'),
    p_rfc:texto('rfc'),p_codigo:texto('codigo')==='retirar'?null:texto('codigo'),p_motivo:texto('motivo'),p_confirmar:fd.get('confirmar')==='si',
  });
  if(error)volver(ruta,'error',error.message);
  revalidatePath('/finanzas','layout');
  volver(ruta,'ok','Asignación registrada con historial. Los importes originales se conservan.');
}
