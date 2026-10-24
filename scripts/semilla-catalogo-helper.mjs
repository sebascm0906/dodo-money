import fs from 'node:fs';
const ruta=new URL('../supabase/migrations/20261024001536_cuentas_contables_exactas.sql',import.meta.url);
const datos=JSON.parse(fs.readFileSync(new URL('../lib/finanzas/catalogoHelper.datos.json',import.meta.url),'utf8'));
const literal=v=>v==null?'null':`'${String(v).replaceAll("'","''")}'`;
const filas=[];
for(const [rfc,entidad] of Object.entries({CMS230321FI8:'03',HCM260306B93:'06'})) {
 for(const c of datos.cuentas.filter(c=>c.entidades.includes(entidad))) {
  const capturable=c.nivel>=2&&!datos.cuentas.some(h=>h.entidades.includes(entidad)&&h.nivel>c.nivel&&h.codigo.startsWith(c.codigo.slice(0,c.nivel===2?7:3)));
  filas.push(`(${[rfc,c.codigo,c.nombre].map(literal).join(',')},${c.nivel},${capturable},${literal(c.rubro)},${literal(datos.sha256)},${c.fila})`);
 }
}
const semilla=`-- INICIO SEMILLA GENERADA\ninsert into public.contabilidad_catalogo(rfc,codigo,nombre,nivel,capturable,rubro,fuente,fila) values\n${filas.join(',\n')};\n-- FIN SEMILLA GENERADA`;
const sql=fs.readFileSync(ruta,'utf8');
fs.writeFileSync(ruta,sql.includes('-- SEMILLA_CATALOGO')?sql.replace('-- SEMILLA_CATALOGO',semilla):sql.replace(/-- INICIO SEMILLA GENERADA[\s\S]*?-- FIN SEMILLA GENERADA/,semilla));
