/* Egresos históricos: libros anuales de Finanzas, sin listas BI. */
window.egresosExcelEstado={meses:{},cargando:true};
const egresosExcelMemoria=new Map();
async function cargarEgresosExcel(){
 let manifest;
 try{const r=await fetch('egresos-excel.php?modo=manifest',{credentials:'same-origin',cache:'no-store'});
  if(r.status===401||r.status===403){egresosExcelMemoria.clear();window.egresosExcelEstado={meses:{},error:'Acceso no autorizado'};return [];}
  if(!r.ok)throw new Error('Egresos HTTP '+r.status);manifest=await r.json();
  if(manifest.fuente!=='EXCEL_ORIGINAL_EGRESOS'||manifest.biEgresos!==false)throw new Error('Fuente de Egresos inválida');
 }catch(e){const old=window.egresosExcelEstado;window.egresosExcelEstado={...old,cargando:false,error:e.message,meses:Object.fromEntries(Object.entries(old.meses||{}).map(([m,s])=>[m,{...s,antigua:true}]))};return [...egresosExcelMemoria.values()].flatMap(s=>s.movimientos);}
 const entries=Object.entries(manifest.meses||{});const rows=[];let next=0;
 await Promise.all(Array.from({length:2},async()=>{while(next<entries.length){const [mes,s]=entries[next++];if(!s.cacheDisponible){egresosExcelMemoria.delete(mes);continue;}
  try{let cache=egresosExcelMemoria.get(mes);if(!cache||cache.hashContenido!==s.hashContenido){const r=await fetch('egresos-excel.php?modo=detalle&mes='+encodeURIComponent(mes),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('Detalle HTTP '+r.status);cache=await r.json();
   if(cache.mes!==mes||!cache.auditoria?.validado||cache.auditoria.control!=='TABLA_COMPLETA_SIN_FILTROS'||!Array.isArray(cache.movimientos)||cache.movimientos.length!==cache.auditoria.registros)throw new Error('Detalle sin validar');
   const sums={importe:0,pagado:0,porPagar:0};const keys=new Set();for(const row of cache.movimientos){if(row.mesHoja!==mes||row.fuenteOrigen!=='excel_original_egresos'||keys.has(row.claveRegistro))throw new Error('Fila de Egresos inválida o duplicada');keys.add(row.claveRegistro);for(const k of Object.keys(sums)){if(!Number.isSafeInteger(row[k+'Micros']))throw new Error('Importe no exacto');sums[k]+=row[k+'Micros'];}}
   if(Object.keys(sums).some(k=>sums[k]!==cache.auditoria.totalesMicros[k]))throw new Error('No coinciden importes y detalle');egresosExcelMemoria.set(mes,cache);
  }rows.push(...cache.movimientos);}catch(e){s.error=e.message;const old=egresosExcelMemoria.get(mes);if(old){s.antigua=true;s.estado='ultima_validada_con_error';rows.push(...old.movimientos);}else{s.cacheDisponible=false;s.estado='no_disponible';}}
 }}));window.egresosExcelEstado={...manifest,cargando:false};return rows;
}
function egresosExcelDisponibles(periodo){const meses=Array.isArray(periodo)?periodo:[periodo];return meses.length>0&&meses.every(m=>window.egresosExcelEstado?.meses?.[m]?.cacheDisponible===true);}
function renderEstadoEgresosExcel(){
 const el=document.getElementById('egresosExcelEstado');if(!el)return;const m=window.egresosExcelEstado;const selected=obtenerMesesRangoSeleccionado();const missing=selected.filter(k=>!m.meses?.[k]?.cacheDisponible);const stale=selected.filter(k=>m.meses?.[k]?.antigua);const warnings=selected.reduce((n,k)=>n+(m.meses?.[k]?.auditoria?.advertencias?.length||0),0);
 el.replaceChildren();const text=document.createElement('span');text.textContent=missing.length?'Egresos: Información no disponible para '+missing.join(', ')+'. Se requieren archivos anuales validados en RELACION DE PAGOS.':'Egresos desde Excel original de Finanzas · '+(stale.length?'Última versión validada; actualización pendiente. ':'')+warnings+' advertencias del archivo original.';el.append(text);
 const when=document.createElement('small');when.textContent=' Verificación: '+(m.verificadoUTC?new Date(m.verificadoUTC).toLocaleString('es-MX',{timeZone:'America/Monterrey'}):'pendiente');el.append(when);const a=document.createElement('a');a.href='egresos-excel.php?modo=admin';a.textContent=' Revisar / actualizar Egresos';a.target='_blank';a.rel='noopener';el.append(a);
 if(missing.length)for(const id of ['kpiEgresos','kpiFlujo','pageEgresosTotal','pageEgresosPorPagar','pageEgresosRegistros']){const n=document.getElementById(id);if(n)n.textContent='Información no disponible';}
}
// Egresos se consultan en la carga inicial, el refresco manual y el único
// ciclo del Dashboard (15 minutos). No se permiten sondeos independientes.
