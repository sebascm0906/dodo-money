import { CATALOGO_HELPER, MAPEO_HELPER, type CuentaHelper } from './catalogoHelper';

export const ENTIDAD_RFC: Record<string,string> = { CMS230321FI8:'03', HCM260306B93:'06' };
/** Solo auxiliares o subcuentas terminales de cada entidad. Títulos y mayores no son capturables. */
export function capturables(rfc:string) {
  const entidad=ENTIDAD_RFC[rfc];
  return CATALOGO_HELPER.filter(c=>c.entidades.includes(entidad)&&c.nivel>=2&&!CATALOGO_HELPER.some(h=>h.entidades.includes(entidad)&&h.nivel>c.nivel&&h.codigo.startsWith(c.codigo.slice(0,c.nivel===2?7:3))));
}
export function alternativas(categoria:string|null,rfc:string):CuentaHelper[] {
  const m=MAPEO_HELPER[categoria==='insumos'?'memo_insumos':categoria==='inversiones'?'memo_inversiones':categoria??'otros'];
  return capturables(rfc).filter(c=>m?.cuentas.includes(c.codigo));
}
export function codigoCompatible(codigo:string,categoria:string|null,sucursal:string|null) {
  if(categoria==='insumos')return codigo.startsWith('502-');
  if(categoria==='inversiones')return /^(15\d|17\d)-/.test(codigo);
  return codigo.startsWith(sucursal?'602-':'603-');
}
export type MovimientoContable = {
  clave:string;fecha:string;factura_id:string|null;sucursal_id:string|null;rfc:string|null;
  descripcion:string;categoria:string|null;importe:number;huella:string;cubre_desde:string;cubre_hasta:string;
};
export type AsignacionContable = {
  id:string;clave:string;revision:number;codigo:string|null;rfc:string;huella:string;motivo:string;creado_en:string;autor_nombre:string;
  origen?:MovimientoContable;
};
export function estadoAsignacion(m:MovimientoContable,a:AsignacionContable|undefined) {
  if(!a?.codigo)return 'Pendiente';
  return a.huella===m.huella?'Asignada':'Revisar: cambió el origen';
}
