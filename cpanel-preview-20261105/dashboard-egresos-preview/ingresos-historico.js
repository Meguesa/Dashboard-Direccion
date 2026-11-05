/* Ingresos: exclusivamente cachés privadas conciliadas desde Excel. */
window.ingresosExcelEstado = {meses:{},cargando:true};
const ingresosExcelMemoria = new Map();
async function cargarIngresosExcelHistorico() {
  let manifest;
  try {
    const r=await fetch('ingresos-historico.php?modo=manifest',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw new Error('Servicio de Ingresos: HTTP '+r.status);
    manifest=await r.json();
    if(manifest.fuente!=='EXCEL_ORIGINAL'||manifest.biIngresos!==false||!manifest.meses)throw new Error('Manifiesto de Ingresos inválido');
  } catch(e) {
    const old=window.ingresosExcelEstado;
    window.ingresosExcelEstado={...old,cargando:false,error:e.message,meses:Object.fromEntries(Object.entries(old.meses||{}).map(([m,s])=>[m,{...s,antigua:true,error:e.message}]))};
    return [...ingresosExcelMemoria.values()].flatMap(s=>s.movimientos);
  }
  const entries=Object.entries(manifest.meses);let next=0;const result=[];
  await Promise.all(Array.from({length:2},async()=>{
    while(next<entries.length){const [m,s]=entries[next++];if(!s.cacheDisponible){ingresosExcelMemoria.delete(m);continue;}
      try{let snapshot=ingresosExcelMemoria.get(m);
        if(!snapshot||snapshot.generadoUTC!==s.generadoUTC){
          const r=await fetch('ingresos-historico.php?modo=detalle&mes='+encodeURIComponent(m),{credentials:'same-origin',cache:'no-store'});
          if(!r.ok)throw new Error('Caché no disponible: HTTP '+r.status);snapshot=await r.json();
          const a=snapshot.auditoria;const rows=snapshot.movimientos;
          if(snapshot.mes!==m||!a?.validado||a.diferenciaCentavos!==0||!Array.isArray(rows)||rows.length!==a.registros)throw new Error('Caché sin conciliación válida');
          let cents=0;const keys=new Set();const banks={};
          for(const row of rows){if(row.mes!==m||!row.fecha?.startsWith(m)||row.fuenteOrigen!=='excel_original'||!Number.isSafeInteger(row.centavos)||keys.has(row.claveRegistro))throw new Error('Movimiento inválido o duplicado');keys.add(row.claveRegistro);cents+=row.centavos;banks[row.banco]=(banks[row.banco]||0)+row.centavos;}
          if(cents!==a.totalCentavos||Object.entries(a.porBanco).some(([bank,v])=>(banks[bank]||0)!==v.centavos))throw new Error('Importes no conciliados');
          ingresosExcelMemoria.set(m,snapshot);
        }result.push(...snapshot.movimientos);
      }catch(e){s.error=e.message;const old=ingresosExcelMemoria.get(m);if(old){s.antigua=true;s.estado='ultima_validada_con_error';result.push(...old.movimientos);}else{s.cacheDisponible=false;s.estado='no_disponible';}}
    }
  }));
  window.ingresosExcelEstado={...manifest,cargando:false};return result;
}
function ingresosExcelDisponibles(periodo) {
  const meses=Array.isArray(periodo)?periodo:[periodo];
  return meses.length>0&&meses.every(m=>window.ingresosExcelEstado?.meses?.[String(m)]?.cacheDisponible===true);
}
function renderEstadoIngresosExcel() {
  const meses=obtenerMesesRangoSeleccionado();const estado=window.ingresosExcelEstado;
  let el=document.getElementById('ingresosExcelEstado');if(!el){el=document.createElement('div');el.id='ingresosExcelEstado';el.style.cssText='margin:16px;padding:14px;border:1px solid #8ba3a0;border-radius:10px;background:#f4f9f7;color:#183c37;display:block';document.querySelector('main')?.prepend(el);if(!el.isConnected)document.body.prepend(el);}
  const missing=meses.filter(m=>!estado.meses?.[m]?.cacheDisponible);
  const stale=meses.filter(m=>estado.meses?.[m]?.antigua||String(estado.meses?.[m]?.estado||'').startsWith('ultima_validada'));
  const details=meses.map(m=>{const s=estado.meses?.[m];return m+': '+(s?.cacheDisponible?'verificado '+(s.verificadoUTC?new Date(s.verificadoUTC).toLocaleString('es-MX',{timeZone:'America/Monterrey'}):'sin fecha'):(s?.auditoria?.errores?.join('; ')||'Sin Excel validado'));});
  el.replaceChildren();const text=document.createElement('div');text.textContent=missing.length?'Información no disponible para '+missing.join(', ')+'. Ingresos y cálculos derivados requieren todos los meses validados.':stale.length?'Última versión validada; actualización pendiente o con incidencia: '+stale.join(', '):'Ingresos conciliados desde los Excel originales de Cobranza. Todos los meses del periodo están validados.';el.append(text);
  const detail=document.createElement('small');detail.textContent=details.join(' · ');el.append(detail);
  if(estado.puedeActualizar){const link=document.createElement('a');link.href='ingresos-historico.php?modo=admin';link.textContent=' Auditar / actualizar histórico';link.target='_blank';link.rel='noopener';el.append(link);}
  if(!ingresosExcelDisponibles(meses))for(const id of ['kpiIngresos','kpiFlujo','pageIngresosTotal','pageIngresosReal','pageIngresosRegistros','pageIngresosPromedio','pageIngresosCumplimiento','metasCobranzaCumplimiento']){const n=document.getElementById(id);if(n){n.textContent='Información no disponible';n.style.whiteSpace='normal';n.style.overflowWrap='anywhere';n.style.fontSize='1rem';}}
}
// El sondeo de cachés no recarga las listas de los demás módulos.
let ingresosExcelActualizando=false;
setInterval(async()=>{if(ingresosExcelActualizando)return;ingresosExcelActualizando=true;try{const rows=await cargarIngresosExcelHistorico();state.datos.ingresos=rows;renderDashboard();}catch(e){console.warn('Ingresos Excel',e.message);}finally{ingresosExcelActualizando=false;}},60000);
