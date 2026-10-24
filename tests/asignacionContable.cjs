const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function cargar(archivo){const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=id=>id.endsWith('.json')?JSON.parse(fs.readFileSync(path.resolve(path.dirname(archivo),id),'utf8')):cargar(path.resolve(path.dirname(archivo),id+'.ts'));new Function('require','module','exports',js)(req,mod,mod.exports);return mod.exports;}
const {capturables,alternativas,codigoCompatible,estadoAsignacion}=cargar('lib/finanzas/asignacion.ts');
test('asignación: entidad y cuentas terminales, sin usar títulos ni contraparte propia',()=>{
 const sitru=capturables('CMS230321FI8'),helper=capturables('HCM260306B93');
 assert.ok(sitru.length>50&&helper.length>50);
 assert.ok(sitru.every(c=>c.nivel>=2));
 assert.ok(!sitru.some(c=>c.codigo==='100-00-000'));
 assert.ok(!sitru.some(c=>c.codigo==='502-02-003'));
 assert.ok(helper.some(c=>c.codigo==='502-02-003'));
 assert.deepEqual(capturables('RFC_NO_AUTORIZADO'),[]);
});
test('asignación: servicios conserva alternativas y no infiere una cuenta por texto',()=>{
 assert.ok(alternativas('servicios','HCM260306B93').some(c=>c.codigo==='602-52-000'));
 assert.ok(alternativas('servicios','HCM260306B93').length>1);
 assert.ok(!codigoCompatible('502-02-003','servicios','s'));
 assert.ok(codigoCompatible('502-02-003','insumos','s'));
 assert.ok(codigoCompatible('153-01-000','inversiones','s'));
 assert.ok(!codigoCompatible('602-52-000','servicios',null));
 assert.ok(codigoCompatible('603-52-000','servicios',null));
});
test('asignación: cambios de fuente y retiro quedan pendientes sin alterar un importe',()=>{
 const m={huella:'fuente',importe:123.45};
 assert.equal(estadoAsignacion(m,undefined),'Pendiente');
 assert.equal(estadoAsignacion(m,{codigo:'602-52-000',huella:'fuente'}),'Asignada');
 assert.match(estadoAsignacion(m,{codigo:'602-52-000',huella:'otra'}),/Revisar/);
 assert.equal(estadoAsignacion(m,{codigo:null,huella:'fuente'}),'Pendiente');
 assert.equal(m.importe,123.45);
});
