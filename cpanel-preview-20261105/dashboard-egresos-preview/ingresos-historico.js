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
  window.ingresosExcelEstado={...manifest,cargando:false};
  if (typeof refrescarMetasHistoricasEnSegundoPlano === 'function')
    queueMicrotask(refrescarMetasHistoricasEnSegundoPlano);
  return result;
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


/* Metas históricas: extraer de cada carátula validada, sin BI_Metas_Cobranza.
 * Los meses antiguos se incorporan por lotes en segundo plano; las consultas
 * de un periodo elegido siempre tienen prioridad frente a la precarga. */
const metasCobranzaExcelPendientes = new Map();
const metasCobranzaExcelReintentarEn = new Map();
const metasCobranzaExcelVerificadas = new Map();
const metasCobranzaExcelIncidencias = new Map();
const METAS_EXCEL_AREAS = ["Panteon", "Servicios CH", "Servicios AF", "Total Service"];
let metasHistoricasCargando = false;
let metasHistoricasProximaRevision = 0;

function mesesHistoricosDeIngresosValidados() {
  return Object.entries(window.ingresosExcelEstado?.meses || {})
    .filter(([mes, estado]) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(mes) &&
      estado?.cacheDisponible === true)
    .map(([mes]) => mes)
    .sort();
}

// Mantener cuatro metas por cada mes validado; no borrar las del histórico
// cuando Graph realiza una recarga incremental de los dos últimos meses.
function mezclarMetasExcelVerificadas(actuales = [], nuevas = [], mesesRevisados = []) {
  const anteriores = (actuales || []).filter(m => m?.fuenteOrigen === "excel_original_caratula");
  const aprobadas = (nuevas || []).filter(m => m?.fuenteOrigen === "excel_original_caratula");
  const mesesValidos = new Set(mesesRevisados.filter(m =>
    aprobadas.filter(row => row.mes === m).length === 4));
  const combinadas = anteriores.filter(row => !mesesValidos.has(row.mes))
    .concat(aprobadas.filter(row => mesesValidos.has(row.mes)));
  const indices = new Set();
  return combinadas.filter(row => {
    const clave = row.mes + "/" + row.area;
    if (indices.has(clave)) return false;
    indices.add(clave);
    return true;
  });
}

function refrescarMetasHistoricasEnSegundoPlano() {
  if (metasHistoricasCargando || window.ingresosExcelEstado?.cargando ||
      Date.now() < metasHistoricasProximaRevision) return;
  const disponibles = window.ingresosExcelEstado?.meses || {};
  const pendientes = mesesHistoricosDeIngresosValidados().filter(m => {
    const huella = disponibles[m]?.excel?.sha256;
    const previo = metasCobranzaExcelVerificadas.get(m);
    const actual = (state.datos.metasCobranza || []).filter(row =>
      row.mes === m && row.fuenteOrigen === "excel_original_caratula");
    const validado = actual.length === 4 &&
      (!huella || (previo && previo.sha === huella));
    return !validado && !metasCobranzaExcelPendientes.has(m) &&
      (metasCobranzaExcelReintentarEn.get(m) || 0) <= Date.now();
  });
  if (!pendientes.length) {
    metasHistoricasProximaRevision = Date.now() + 60000;
    return;
  }
  // Una sola descarga de carátula por turno: evita saturar Graph y el cron.
  const mes = pendientes[0];
  metasHistoricasCargando = true;
  obtenerMetasCobranzaExcel([mes]).then(rows => {
    if (rows.length === 4) {
      state.datos.metasCobranza = mezclarMetasExcelVerificadas(
        state.datos.metasCobranza, rows, [mes]);
      renderGraficasIngresos?.(obtenerMesesRangoSeleccionado());
      if (typeof guardarDatosEnCache === "function") guardarDatosEnCache();
    } else {
      metasCobranzaExcelReintentarEn.set(mes, Date.now() + 15 * 60000);
    }
  }).catch(error => {
    console.warn("Precarga de meta histórica",mes,error.message);
    metasCobranzaExcelIncidencias.set(mes,"SERVICIO_NO_DISPONIBLE");
    metasCobranzaExcelReintentarEn.set(mes, Date.now() + 15 * 60000);
  }).finally(() => {
    metasHistoricasCargando = false;
    metasHistoricasProximaRevision = Date.now() + 1000;
  });
}
setInterval(refrescarMetasHistoricasEnSegundoPlano, 5000);

async function obtenerMetasCobranzaExcel(mesesFiltro = []) {
  const mesesConOrigen = Object.entries(window.ingresosExcelEstado?.meses || {})
    .filter(([, st]) => st?.cacheDisponible === true)
    .map(([m]) => m);
  const objetivo = (Array.isArray(mesesFiltro) && mesesFiltro.length
    ? mesesFiltro : obtenerMesesRangoSeleccionado())
    .filter(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))
    .filter((m, i, arr) => arr.indexOf(m) === i);
  const meses = objetivo.filter(m => mesesConOrigen.includes(m));
  const todos = [];
  for (let idx = 0; idx < meses.length; idx += 3) {
    const lote = meses.slice(idx, idx + 3);
    const query = new URLSearchParams({ modo: "metas", meses: lote.join(",") });
    const resp = await fetch("ingresos-historico.php?" + query.toString(), {
      credentials: "same-origin", cache: "no-store"
    });
    if (!resp.ok) throw new Error("Metas de Excel no disponibles: HTTP " + resp.status);
    const body = await resp.json();
    if (body.ok !== true || body.fuente !== "EXCEL_ORIGINAL_CARATULA" ||
        body.biMetasCobranza !== false || !body.meses) throw new Error("Respuesta de metas inválida");
    for (const m of lote) {
      const bloque = body.meses[m];
      if (!bloque?.validado || bloque.fuente !== "EXCEL_ORIGINAL_CARATULA" ||
          !Array.isArray(bloque.metas) || bloque.metas.length !== 4) {
        metasCobranzaExcelIncidencias.set(m, bloque?.motivo || 'CARATULA_NO_VALIDADA');
        continue;
      }
      const nombres = bloque.metas.map(row => row.area);
      if (METAS_EXCEL_AREAS.some((area, i) => nombres[i] !== area)) continue;
      if (bloque.metas.some(row => row.mes !== m || row.fuenteOrigen !== "excel_original_caratula" ||
          !Number.isFinite(row.metaMensual) || row.metaMensual < 0 ||
          !Number.isFinite(row.realCaratula) || row.realCaratula < 0)) continue;
      const totalMeta = bloque.metas.reduce((n, row) => n + Math.round(row.metaMensual * 100), 0);
      const totalReal = bloque.metas.reduce((n, row) => n + Math.round(row.realCaratula * 100), 0);
      if (totalMeta !== Math.round(bloque.metaTotal * 100) ||
          totalReal !== Math.round(bloque.realTotal * 100)) continue;
      metasCobranzaExcelIncidencias.delete(m);
      metasCobranzaExcelVerificadas.set(m, {
        sha: bloque.excelSha256, filas: bloque.metas, verificadoUTC: bloque.verificadoUTC
      });
      todos.push(...bloque.metas);
    }
  }
  return todos;
}
function asegurarMetasCobranzaExcel(mesesSolicitados) {
  if (!window.ingresosExcelEstado || window.ingresosExcelEstado.cargando) return;
  const disponibles = window.ingresosExcelEstado.meses || {};
  const meses = (Array.isArray(mesesSolicitados) ? mesesSolicitados : [mesesSolicitados])
    .filter(m => disponibles[m]?.cacheDisponible === true);
  for (const mes of meses) {
    const fingerprint = disponibles[mes]?.excel?.sha256 || null;
    const cached = metasCobranzaExcelVerificadas.get(mes);
    // El manifiesto puede no contener SHA tras un ciclo sin cambios. En
    // ese caso, conservar el dato validado y dejar que el PHP verifique
    // nuevamente la huella exacta del Excel antes de servir un cambio.
    if (cached && (!fingerprint || cached.sha === fingerprint)) {
      if (!(state.datos.metasCobranza || []).some(row =>
          row.mes === mes && row.fuenteOrigen === "excel_original_caratula")) {
        state.datos.metasCobranza = (state.datos.metasCobranza || [])
          .filter(row => row.mes !== mes).concat(cached.filas);
      }
      continue;
    }
    if (metasCobranzaExcelPendientes.has(mes) ||
        (metasCobranzaExcelReintentarEn.get(mes) || 0) > Date.now()) continue;
    const tarea = obtenerMetasCobranzaExcel([mes])
      .then(rows => {
        if (rows.length !== 4) {
          metasCobranzaExcelIncidencias.set(mes,
            metasCobranzaExcelIncidencias.get(mes) || 'CARATULA_NO_VALIDADA');
          metasCobranzaExcelReintentarEn.set(mes, Date.now() + 60000);
          renderAvanceMetasCobranza(obtenerMesesRangoSeleccionado());
          return;
        }
        metasCobranzaExcelIncidencias.delete(mes);
        state.datos.metasCobranza = (state.datos.metasCobranza || [])
          .filter(row => row.mes !== mes).concat(rows);
        renderDashboard();
      })
      .catch(err => {
        console.warn("Metas Excel " + mes + ":", err.message);
        metasCobranzaExcelIncidencias.set(mes, 'SERVICIO_NO_DISPONIBLE');
        metasCobranzaExcelReintentarEn.set(mes, Date.now() + 60000);
        renderAvanceMetasCobranza(obtenerMesesRangoSeleccionado());
      })
      .finally(() => metasCobranzaExcelPendientes.delete(mes));
    metasCobranzaExcelPendientes.set(mes, tarea);
  }
}
