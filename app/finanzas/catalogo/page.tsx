import Link from 'next/link';
import { obtenerPerfil } from '@/lib/contexto';
import { cuentasHelper, ENTIDADES_HELPER, FUENTE_HELPER, MAPEO_HELPER } from '@/lib/finanzas/catalogoHelper';

export default async function Catalogo({searchParams}:{searchParams:Promise<{entidad?:string;q?:string}>}) {
  await obtenerPerfil();
  const q=await searchParams;
  const entidad=q.entidad==='03'?'03':'06';
  const cuentas=cuentasHelper(entidad,q.q);
  return <div className="panel-admin">
    <Link href="/finanzas">← P&L</Link>
    <h1>Catálogo contable · Grupo Helper</h1>
    <Link className="boton boton-secundario" href="/finanzas/asignacion">Revisar y asignar cuentas</Link>
    <p>Cuentas activas del maestro de contabilidad, por razón social. La sucursal se conserva como dimensión separada.</p>
    <form method="get" className="barra-filtros">
      <label>Razón social<select name="entidad" defaultValue={entidad}>{Object.entries(ENTIDADES_HELPER).map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select></label>
      <label>Buscar cuenta, nombre o rubro<input name="q" defaultValue={q.q??''} type="search" /></label>
      <button className="boton boton-secundario">Buscar</button>
    </form>
    <p>{cuentas.length} cuentas · {ENTIDADES_HELPER[entidad]}</p>
    <details className="nota-plegable"><summary>Correspondencia con el P&L y pendientes</summary>
      <p>El catálogo muestra referencias en el P&L, incluido octubre. Para registrar una cuenta exacta por documento, abre «Revisar y asignar cuentas»: selección, vista previa y confirmación con motivo. Las categorías y los importes del P&L se conservan; una referencia por sí sola no equivale a una asignación.</p>
      <p>Servicios, renta, nómina, oficina y otros necesitan revisión por movimiento. No se infiere deducibilidad por faltar el XML. Los cálculos conciliados de Rappi, inventarios, pagos e importes se conservan.</p>
      <ul>{Object.entries(MAPEO_HELPER).filter(([,m])=>m.nota).map(([clave,m])=><li key={clave}><strong>{clave}: {m.cuentas.join(' / ')}</strong> · {m.nota}</li>)}</ul>
    </details>
    <div className="tabla-contenedor"><table className="tabla"><thead><tr><th>Cuenta</th><th>Descripción</th><th>Nivel</th><th>Agrupador</th><th>Rubro financiero</th><th>Fuente</th></tr></thead><tbody>
      {cuentas.map(c=><tr key={c.codigo}><td>{c.codigo}</td><td>{c.nombre}</td><td>{c.nivel===0?'Título':c.nivel}</td><td>{c.agrupador??'—'}</td><td>{c.rubro?`${c.rubro} · ${c.nombreRubro}`:'Sin rubro'}</td><td>Fila {c.fila}</td></tr>)}
    </tbody></table></div>
    {!cuentas.length&&<p>No hay cuentas activas con estos filtros.</p>}
    <details><summary>Fuente y versión</summary><p>{FUENTE_HELPER.archivo} · {FUENTE_HELPER.hoja}</p><p>SHA-256: <code style={{overflowWrap:'anywhere'}}>{FUENTE_HELPER.sha256}</code></p><p>Importación de valores guardados del archivo; no se ejecutaron macros. Esta vista no valida las notas fiscales del libro.</p></details>
  </div>;
}
