/* QA: el Dashboard solo consume snapshots privados validados de Ventas 2026.
 * No modifica BI_Ventas, Excel ni Power Automate.
 * Se habilita exclusivamente con ?ventas_excel_qa=1 y administrador autorizado.
 */
window.ventasExcelEstado={meses:{},cargando:true,fuente:"EXCEL_ORIGINAL_VENTAS"};
const ventasExcelMemoria=new Map();

function validacionVentasExcelDetalle(detalle,manifest,mes) {
  if (!detalle||detalle.validado!==true||detalle.fuente!=="EXCEL_ORIGINAL_VENTAS"||
      detalle.mes!==mes||detalle.version!==manifest.version||detalle.noSumarContratos!==true||
      !detalle.auditoria?.validado||!Array.isArray(detalle.ventas)||
      !Array.isArray(detalle.contratos))
    throw new Error("Snapshot de Ventas inválido para "+mes);
  const claves=new Set();let cents=0;
  for(const fila of detalle.ventas){
    if(fila.mes!==mes||fila.fuenteOrigen!=="excel_original_ventas"||
        fila.fuente!=="Ventas 2026"||fila.tipoRegistro!=="Mensual"||
        !fila.id||claves.has(fila.id)||!Number.isFinite(fila.montoVenta)||
        fila.montoVenta<0)throw new Error("Registro comercial inválido "+mes);
    claves.add(fila.id);cents+=Math.round(fila.montoVenta*100);
  }
  if(!Number.isSafeInteger(cents)||cents!==detalle.auditoria.ventasCentavos||
      cents!==detalle.auditoria.semanasCentavos||
      detalle.auditoria.diferenciaCentavos!==0||
      claves.size!==detalle.auditoria.registros)
    throw new Error("Total de Ventas no conciliado "+mes);
  const expedientes=new Set();
  for(const contrato of detalle.contratos){
    if(contrato.mes!==mes||contrato.fuenteOrigen!=="excel_original_contratos"||
       contrato.fuente!=="CONTRATOS"||!contrato.id||expedientes.has(contrato.id)||
       contrato.montoVenta!==null||contrato.total!==null||
       contrato.aportaTotalComercial!==false)
      throw new Error("Contrato no válido o aditivo "+mes);
    expedientes.add(contrato.id);
  }
  if(expedientes.size!==detalle.contratosUnicosNoRepetidos)
    throw new Error("Conteo contractual diferente del origen "+mes);
  return [...detalle.ventas,...detalle.contratos];
}

async function cargarVentasExcelOriginal(mesesSolicitados=null){
  window.ventasExcelEstado={...window.ventasExcelEstado,cargando:true};
  try {
    const res=await fetch("ventas-excel.php?modo=manifest",{
      credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}
    });
    if(!res.ok){
      let issue={};
      try{issue=await res.json();}catch(_e){}
      const reason=issue.motivo||issue.error||"SIN_DIAGNOSTICO";
      throw new Error("Manifiesto Ventas HTTP "+res.status+": "+reason+
        (issue.accion==="REVALIDAR_GRAPH" ? ". Presiona Revalidar Excel / Graph." : ""));
    }
    const manifest=await res.json();
    if(manifest.validado!==true||manifest.fuente!=="EXCEL_ORIGINAL_VENTAS"||
       manifest.biVentas!==false||manifest.fuenteMetas!=="METAS"||
       manifest.soloLectura!==true||
       !/^[a-f0-9]{64}$/.test(manifest.version||"")||!manifest.meses)
      throw new Error("Manifiesto de origen Ventas no autorizado");
    const months=mesesSolicitados===null
      ? Array.from({length:12},(_,i)=>"2026-"+String(i+1).padStart(2,"0"))
      : [...new Set(mesesSolicitados)];
    if(!months.length||months.some(m=>!/^2026-(0[1-9]|1[0-2])$/.test(m)))
      throw new Error("Periodo de Ventas no válido");
    if(months.some(m=>!Object.hasOwn(manifest.meses,m)))
      throw new Error("Falta un mes en el manifiesto de Ventas");
    const entries=months.map(m=>[m,manifest.meses[m]]);
    const nextCache=new Map();
    let cursor=0;const collected=[];
    await Promise.all(Array.from({length:2},async()=>{
      while(cursor<entries.length){
        const [mes,state]=entries[cursor++];
        if(!state.cacheDisponible||!state.auditoria?.validado||
           state.auditoria.diferenciaCentavos!==0)
          throw new Error("El mes "+mes+" no está conciliado en Excel");
        let detalle=ventasExcelMemoria.get(mes);
        if(!detalle||detalle.version!==manifest.version){
          const r=await fetch("ventas-excel.php?modo=detalle&mes="+encodeURIComponent(mes),{
            credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}
          });
          if(!r.ok){
            let issue={};try{issue=await r.json();}catch(_e){}
            throw new Error("Detalle Excel "+mes+" HTTP "+r.status+
              (issue.error?": "+issue.error:"")+
              (issue.diferenciaSemanalCentavos!=null
                ? " · Diferencia entre G y semanas: "+(issue.diferenciaSemanalCentavos/100).toLocaleString("es-MX",{style:"currency",currency:"MXN"})
                : ""));
          }
          detalle=await r.json();
        }
        const filas=validacionVentasExcelDetalle(detalle,manifest,mes);
        nextCache.set(mes,detalle);
        collected.push(...filas);
      }
    }));
    if(mesesSolicitados===null)ventasExcelMemoria.clear();
    for(const [key,value] of nextCache)ventasExcelMemoria.set(key,value);
    window.ventasExcelEstado={...manifest,cargando:false,error:null};
    return collected;
  }catch(error){
    // Nunca mezclar un snapshot antiguo o una lista BI con un Excel fallido.
    window.ventasExcelEstado={...window.ventasExcelEstado,cargando:false,
      error:String(error?.message||error),
      meses:Object.fromEntries(Object.entries(window.ventasExcelEstado?.meses||{})
       .map(([m,state])=>[m,{...state,antigua:true}]))};
    throw error;
  }
}

function metasVentasExcelPeriodo(mes){
  const meses=Array.isArray(mes)?mes:[mes];
  if(!meses.length)return NaN;
  let cents=0;
  for(const key of meses){
    const st=window.ventasExcelEstado?.meses?.[key];
    if(!st?.cacheDisponible||!st.metaDisponible||!Number.isSafeInteger(st.metaCentavos))
      return NaN;
    cents+=st.metaCentavos;
  }
  return cents/100;
}

function renderEstadoVentasExcel(){
  const el=document.getElementById("ventasExcelEstado");
  if(!el)return;
  const state=window.ventasExcelEstado||{};
  const meses=typeof obtenerMesesRangoSeleccionado==="function"
    ?obtenerMesesRangoSeleccionado():[];
  const invalidos=meses.filter(m=>!state.meses?.[m]?.cacheDisponible);
  const faltantes=meses.reduce((total,m)=>total+Number(state.meses?.[m]?.asesoresSinMeta||0),0);
  el.replaceChildren();
  const status=document.createElement("strong");
  status.textContent=state.error?"Ventas Excel: "+state.error:
    invalidos.length?"Ventas Excel: sin validación para "+invalidos.join(", "):
    "Ventas desde archivos Excel originales · Comercial + Contratos";
  el.appendChild(status);
  const detail=document.createElement("div");
  const cuando=state.verificadoUTC
    ?new Date(state.verificadoUTC).toLocaleString("es-MX",{timeZone:"America/Monterrey"})
    :"pendiente";
  detail.textContent="Verificado: "+cuando+" · Asesores sin meta: "+faltantes+
    " · Contratos informativos, sin sumar al total de ventas.";
  el.appendChild(detail);
}
