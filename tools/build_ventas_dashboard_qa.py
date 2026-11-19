#!/usr/bin/env python3
"""Build the isolated, admin-only Sales Excel dashboard QA.

Builds five QA files; deployment updates only Excel QA client, not the large app or PHP.
Uses live dashboard CSS and shared non-sales modules without overwriting them.
"""
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"deploy-ventas-excel-candidato"
OUTPUT=ROOT/"deploy-ventas-dashboard-qa"
VERSION="20261113-ventas-dashboard-qa-4"
FILES={
    "index.php":"ventas-dashboard-qa.php",
    "app.js":"ventas-dashboard-qa-app.js",
    "graph.js":"ventas-dashboard-qa-graph.js",
    "ventas-excel.js":"ventas-dashboard-qa-excel.js",
    "dashboard-yoy-comparison.js":"ventas-dashboard-qa-yoy.js",
}

def one(text,old,new,desc):
    if text.count(old)!=1:
        raise RuntimeError(f"{desc}: expected exactly one match, found {text.count(old)}")
    return text.replace(old,new,1)

def build():
    subprocess.run(["python3",str(ROOT/"tools"/"build_ventas_excel_candidato.py")],
                   check=True,cwd=ROOT,capture_output=True,text=True)
    OUTPUT.mkdir(parents=True,exist_ok=True)
    for item in OUTPUT.iterdir():
        if item.is_file():
            item.unlink()
    files={key:((BASE/key) if (BASE/key).is_file()
                else (ROOT/"cpanel-preview-20261105"/"dashboard-egresos-preview"/key))
           .read_text(encoding="utf-8") for key in FILES}

    page=files["index.php"]
    page=one(page,
             "if (!portal_user_can_tool('dashboard')) {",
             """if (strtolower(trim((string)(portal_user()['email'] ?? ''))) !==
    'gabriel.guerra@juanpablo.com.mx' || !portal_user_can_tool('dashboard')) {""",
             "Admin-only role check")
    page=one(page,
             "    exit('Sin permiso para consultar el Dashboard.');\n}",
             "    exit('Sin permiso para consultar el Dashboard.');\n}\n"
             "if (empty($_SESSION['ventas_excel_qa_csrf'])) {\n"
             "    $_SESSION['ventas_excel_qa_csrf'] = bin2hex(random_bytes(24));\n"
             "}\n",
             "QA revalidation CSRF shared with the restricted endpoint")
    page=one(page,
             "declare(strict_types=1);",
             "declare(strict_types=1);\nheader('Cache-Control: private, no-store');\nheader('X-Robots-Tag: noindex, nofollow');",
             "Anti-cache and noindex headers")
    page=one(page,"Dashboard de Dirección | Portal Interno JdJP",
             "QA Ventas Excel | Dashboard de Dirección", "Page title")
    for source,target in FILES.items():
        if source=="index.php":continue
        pattern=r'(?<=src=")'+re.escape(source)+r'\?v=[^"]+'
        found=re.findall(pattern,page)
        if source=="dashboard-yoy-comparison.js" and not found:
            # El comparativo YoY se inyectaba por el portal y no figura en el
            # snapshot base. Instalar aquí la variante QA explícitamente.
            page=one(page,"</body>",
              '<script src="'+target+'?v='+VERSION+'"></script>\\n</body>',
              "Install verified YoY QA script")
        else:
            if len(found)!=1:
                raise RuntimeError(f"Script {source}: expected one ref, got {found}")
            page=re.sub(pattern,target+"?v="+VERSION,page,count=1)
    page=one(page,'</head>','''<style>
#ventasExcelEstado{display:block!important;margin:12px 24px!important;
padding:14px!important;border:1px solid #ccac55!important;background:#fff9e8!important;
border-radius:8px;color:#6c4f15!important}
#ventasDashboardQAAcciones{padding:12px 24px;background:#fff9e8;border:1px solid #d6ba6d;
font:14px/1.5 system-ui;color:#483608;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
#ventasDashboardQARevalidar{padding:9px 14px;border:0;background:#145e52;color:#fff;
border-radius:8px;cursor:pointer}
#ventasDashboardQARevalidar:disabled{opacity:.6;cursor:wait}
</style>
</head>''',"Visible Sales data status")
    body=re.search(r"<body\b[^>]*>",page)
    if not body:
        raise RuntimeError("Missing body element")
    page=page[:body.end()]+'''
<div role="status" style="position:relative;z-index:9999;background:#fff4c6;
border-bottom:2px solid #b58a28;padding:10px 24px;font:bold 14px system-ui;color:#483608">
PRUEBAS — Ventas desde Excel · No modificar datos ·
<a href="index.php">Regresar al Dashboard productivo</a>
</div>
<div id="ventasDashboardQAAcciones" role="status">
<button type="button" id="ventasDashboardQARevalidar">Revalidar Ventas Excel / Graph</button>
<span id="ventasDashboardQAEstado">Comprobando snapshot de Ventas…</span>
</div>
<script>
window.VENTAS_QA_CSRF=<?=json_encode((string)$_SESSION['ventas_excel_qa_csrf'],
JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT)?>;
</script>'''+page[body.end():]
    files["index.php"]=page

    app=files["app.js"]
    app=one(app,'"dashboardExcelDirectoDatos"',
            '"dashboardVentasExcelQADatos"',"Separate Sales QA local cache")
    app=one(app,'"dashboardExcelDirectoCacheDB"',
            '"dashboardVentasExcelQACacheDB"',"Separate Sales QA IndexedDB")
    files["app.js"]=app

    graph=files["graph.js"]
    graph=one(graph,
      "const ventas = await cargarVentasExcelOriginal();",
      """let ventas=[];
    try {
      ventas=await cargarVentasExcelOriginal(null, { permitirMesesIncompletos: true });
      const aviso=document.getElementById("ventasDashboardQAEstado");
      if(aviso)aviso.textContent="Ventas Excel: snapshot verificado correctamente.";
    } catch(error) {
      // No abortar Ingresos, Egresos, Servicios o Marketing por un error de Ventas.
      // Mantener Ventas indisponible: nunca regresar silenciosamente a BI_Ventas.
      console.error("Ventas Excel QA (fuente aislada):",error);
      const aviso=document.getElementById("ventasDashboardQAEstado");
      if(aviso)aviso.textContent="Ventas no disponibles: "+String(error?.message||error)+
        ". Revalidar Excel / Graph.";
    }""",
      "Isolate Excel errors without falling back to BI_Ventas")
    files["graph.js"]=graph

    yoy=files["dashboard-yoy-comparison.js"]
    yoy=one(yoy,
      '''  function pintarVentas(periodo) {
    const actual = calcularVentas(periodo.anio, periodo.mes, periodo.diaFinActual);''',
      '''  function pintarVentas(periodo) {
    // Referencia de 2025 corresponde al MES COMPLETO, no al mismo día.
    // 2026 usa la columna G mensual y UI del Excel original al último corte.
    const month=String(periodo.mes).padStart(2,"0");
    const key="2026-"+month;
    const verificado=window.ventasExcelEstado?.meses?.[key]?.cacheDisponible===true;
    const valor=(campo)=>{
      if(!verificado||typeof presupuestoVentasExcelPeriodo!=="function")return NaN;
      return presupuestoVentasExcelPeriodo(key,campo);
    };
    const previsActual=typeof sumarVentasPrevision==="function"&&verificado
      ? sumarVentasPrevision(key):NaN;
    const uiActual=valor("uiVentasCentavos");
    const previsAnterior=valor("ventas2025Centavos");
    const uiAnterior=valor("uiVentas2025Centavos");
    const actualOk=Number.isFinite(previsActual)&&Number.isFinite(uiActual);
    const anteriorOk=Number.isFinite(previsAnterior)&&Number.isFinite(uiAnterior);
    const totalActual=actualOk?previsActual+uiActual:NaN;
    const totalAnterior=anteriorOk?previsAnterior+uiAnterior:NaN;
    const now=new Date();
    // No comparar un acumulado abierto contra todo el mes del año anterior.
    const actualFinalizado=Number(periodo.anio)===2026 &&
       (2026*12+Number(month))<(now.getFullYear()*12+now.getMonth()+1);
    texto("yoyVentasSubtitle","Referencia mensual 2025 completa; 2026 según último corte Excel, sin precisión diaria.");
    texto("yoyVentasActualLabel","2026 · "+month+(actualFinalizado?" (mes cerrado)":" (acumulado)"));
    texto("yoyVentasAnteriorLabel","2025 · "+month+" (mes completo)");
    texto("yoyVentasActual",actualOk?moneda(totalActual):"No conciliado");
    texto("yoyVentasAnterior",anteriorOk?moneda(totalAnterior):"No disponible");
    texto("yoyVentasActualDetail",actualOk
      ?"Previsión "+moneda(previsActual)+" + UI "+moneda(uiActual):"Sin total original verificado");
    texto("yoyVentasAnteriorDetail",anteriorOk
      ?"Previsión "+moneda(previsAnterior)+" + UI "+moneda(uiAnterior):"Sin histórico completo");
    const comparable=actualFinalizado&&actualOk&&anteriorOk&&totalAnterior>0;
    texto("yoyVentasVariacion",comparable
      ?((totalActual/totalAnterior-1)*100).toFixed(1)+"%":"No comparable");
    texto("yoyVentasVariacionDetail",comparable
      ?"Mes completo contra mes completo": "Se requiere cierre del mes y totales verificados para la variación.");
    return;
    const actual = calcularVentas(periodo.anio, periodo.mes, periodo.diaFinActual);''',
      "Show verified full-month 2025 reference without false partial-date YoY comparison")
    files["dashboard-yoy-comparison.js"]=yoy

    client=files["ventas-excel.js"]
    client+=r"""
// Revalidacion explicita QA, protegida por sesion administrativa y CSRF PHP.
document.addEventListener("DOMContentLoaded",()=>{
  const btn=document.getElementById("ventasDashboardQARevalidar");
  const label=document.getElementById("ventasDashboardQAEstado");
  if(!btn||!label)return;
  btn.addEventListener("click",async()=>{
    btn.disabled=true;
    label.textContent="Revalidando archivos originales con Microsoft Graph…";
    try{
      const nonce=String(window.VENTAS_QA_CSRF||"");
      if(!nonce)throw new Error("Sesion QA sin token; inicie sesion nuevamente");
      const response=await fetch("ventas-excel.php?modo=revalidar",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
        body:new URLSearchParams({csrf:nonce}).toString()
      });
      const body=await response.json();
      if(!response.ok||!["auditado","sin_cambios"].includes(body.estado))
        throw new Error(body.error||body.estado||"HTTP "+response.status);
      label.textContent="Snapshot auditado; recargando Dashboard QA…";
      window.location.reload();
    }catch(error){
      label.textContent="Revalidacion no completada: "+String(error?.message||error);
    }finally{btn.disabled=false;}
  });
});
"""
    files["ventas-excel.js"]=client

    app=files["app.js"]
    app=one(app,
      '"SharePoint no devolvió datos para el dashboard."',
      '"Falló una fuente del Dashboard: revisar el aviso QA y la consola."',
      "Do not attribute every failure to SharePoint")
    # El servidor permite actualizar el lector JS pequeno pero rechaza
    # sustituir la aplicacion JS principal. Anexar solo un complemento
    # visual a ventas-dashboard-qa-excel.js, manteniendo el shell PHP
    # y app.js existente en produccion/QA SIN reemplazarlos.
    client+=r"""
// QA v4: rotulos de filas mensuales; nunca modifica la fuente ni los importes.
(function(){
  "use strict";
  const VERSION="20261113-ventas-qa-visual-5";
  const text=(element,value)=>{
    if(element&&element.textContent!==value)element.textContent=value;
  };
  function update(){
    if(!document.getElementById("ventasDashboardQAAcciones")||
       window.ventasExcelEstado?.fuente!=="EXCEL_ORIGINAL_VENTAS")return;
    const contrato=document.getElementById("pageVentasContratos");
    text(contrato?.closest(".detail-kpi-card")?.querySelector(".detail-kpi-label"),
      "Expedientes contractuales únicos");
    const advisorBody=document.getElementById("tablaVentasAsesorBody");
    const advisorTable=advisorBody?.closest("table");
    const headers=advisorTable?.querySelectorAll("thead th")||[];
    text(headers[1],"Registros mensuales");
    text(headers[2],"Unidades");
    // Las columnas H:W de Comercial contienen unidades reales por asesor.
    const contracts=document.getElementById("tablaVentasContratosBody")?.closest(".detail-section-card");
    if(contracts){
      text(contracts.querySelector("h3"),"Expedientes de contratos originales");
      text(contracts.querySelector(".detail-section-header p"),
        "Expedientes únicos informativos; no acreditan vigencia ni se suman a las ventas.");
      const headers=contracts.querySelectorAll("thead th");
      text(headers[3],"Importe nominal");
    }
    const uiBody=document.getElementById("tablaVentasUiResponsableBody");
    const ui=uiBody?.closest(".detail-section-card");
    if(ui){
      text(ui.querySelector("h3"),"Servicios Uso Inmediato por responsable");
      text(ui.querySelector(".detail-section-header p"),
        "Conteos operativos de BI_Servicios; importes sin conciliar con Comercial.");
      for(const row of uiBody.querySelectorAll("tr")){
        if(row.children?.length===6){
          text(row.children[2],"No conciliado");
          text(row.children[4],"No conciliado");
        }
      }
    }
    const tipos=document.getElementById("tablaVentasTipoServicioBody")?.closest(".detail-section-card");
    if(tipos)text(tipos.querySelector(".detail-section-header p"),
      "Unidades originales del Excel Comercial. La venta se prorratea proporcionalmente por categoria.");
    const toolbar=document.getElementById("ventasDashboardQAAcciones");
    if(toolbar)toolbar.dataset.ajusteVentasQa=VERSION;
  }
  function install(){
    if(!document.getElementById("ventasDashboardQAAcciones"))return;
    // Las tablas se vuelven a pintar con innerHTML desde app.js existente.
    // Escuchar exclusivamente sus cambios, sin parchar funciones globales.
    const tableIds=["tablaVentasAsesorBody","tablaVentasContratosBody",
      "tablaVentasUiResponsableBody","tablaVentasTipoServicioBody"];
    for(const id of tableIds){
      const target=document.getElementById(id);
      if(!target)continue;
      const observer=new MutationObserver(()=>update());
      observer.observe(target,{childList:true,subtree:true});
    }
    update();
  }
  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
"""
    # Overlay pequeño para el app.js QA ya publicado: no es necesario
    # sustituir el JS principal, que el servidor FTPS rechaza por tamaño.
    client+=r"""
// QA noviembre 2026: restituir KPIs desde snapshot Excel, SIN listas BI_Ventas.
(function(){
  "use strict";
  const money=v=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(v);
  const pct=v=>(v*100).toFixed(1)+"%";
  const set=(id,txt)=>{
    const el=document.getElementById(id);
    if(el&&el.textContent!==txt)el.textContent=txt;
  };
  const budget=(m,c)=>typeof presupuestoVentasExcelPeriodo==="function"
    ?presupuestoVentasExcelPeriodo(m,c):NaN;
  function patchValues(){
    if(!document.getElementById("ventasDashboardQAAcciones")||
       window.ventasExcelEstado?.fuente!=="EXCEL_ORIGINAL_VENTAS")return;
    const range=typeof obtenerMesesRangoSeleccionado==="function"
      ?obtenerMesesRangoSeleccionado():[];
    if(!range.length)return;
    const ui=budget(range,"uiVentasCentavos");
    const goal=budget(range,"metaUiDireccionCentavos");
    const commercialGoal=budget(range,"metaDireccionCentavos");
    set("pageVentasUiTotal",Number.isFinite(ui)?money(ui):"No conciliado");
    set("pageVentasMetaUi",Number.isFinite(goal)?money(goal):"No conciliado");
    set("pageVentasCumplimientoUi",Number.isFinite(ui)&&Number.isFinite(goal)&&goal>0
      ?pct(ui/goal):"No conciliado");
    set("pageVentasMetaPrevision",Number.isFinite(commercialGoal)
      ?money(commercialGoal):"No conciliado");
    const sales=typeof sumarVentasPrevision==="function"?sumarVentasPrevision(range):NaN;
    set("pageVentasCumplimientoPrevision",Number.isFinite(sales)&&Number.isFinite(commercialGoal)&&commercialGoal>0
      ?pct(sales/commercialGoal):"No conciliado");
    if(typeof ticketsNominalesVentasExcel==="function"){
      const tickets=ticketsNominalesVentasExcel(range);
      set("pageVentasTicketPropiedades",Number.isFinite(tickets.propiedades)
        ?money(tickets.propiedades):"No calculable");
      set("pageVentasTicketServicios",Number.isFinite(tickets.servicios)
        ?money(tickets.servicios):"No calculable");
    }
  }
  function patchChart(){
    if(typeof dashboardCharts==="undefined")return;
    const chart=dashboardCharts.ventasMensuales;
    if(!chart||typeof obtenerMesesDelAnioSeleccionado!=="function")return;
    const meses=obtenerMesesDelAnioSeleccionado();
    if(!meses.length)return;
    const commercial=meses.map(m=>{
      const value=budget(m.clave,"metaDireccionCentavos");
      return Number.isFinite(value)?value:null;
    });
    const ui=meses.map(m=>{
      const value=budget(m.clave,"uiVentasCentavos");
      return Number.isFinite(value)?value:null;
    });
    const goals=meses.map(m=>{
      const value=budget(m.clave,"metaUiDireccionCentavos");
      return Number.isFinite(value)?value:null;
    });
    if(chart.data.datasets[1]){
      chart.data.datasets[1].label="Meta Previsión (Dirección)";
      chart.data.datasets[1].data=commercial;
    }
    chart.data.datasets=chart.data.datasets.slice(0,2);
    chart.data.datasets.push(
      {label:"Ventas UI (Excel)",data:ui,fill:false,tension:0.3,
        borderWidth:3,pointRadius:4,pointHoverRadius:6},
      {label:"Meta UI (Dirección)",data:goals,fill:false,tension:0.3,
        borderWidth:3,borderDash:[6,6],pointRadius:4,pointHoverRadius:6}
    );
    chart.update("none");
  }
  function install(){
    if(typeof renderDashboard!=="function")return;
    // Functions are replaced ONLY in the admin-only QA page; normal app.js
    // is not edited. The underlying Excel must pass the manifest first.
    const oldRender=renderDashboard;
    renderDashboard=function(...args){
      const result=oldRender.apply(this,args);
      patchValues();patchChart();
      return result;
    };
    window.renderDashboard=renderDashboard;
    patchValues();patchChart();
  }
  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
"""
    files["ventas-excel.js"]=client
    files["app.js"]=app

    for source,target in FILES.items():
        (OUTPUT/target).write_text(files[source],encoding="utf-8")
    assert 'obtenerVentasSharePoint(' not in graph
    assert 'cargarVentasExcelOriginal(null, { permitirMesesIncompletos: true })' in graph
    assert 'catch(error)' in graph
    assert 'ventasDashboardQARevalidar' in page
    assert 'VENTAS_QA_CSRF' in page
    assert 'ventas-excel.php?modo=revalidar' in client
    assert '20261113-ventas-qa-visual-5' in client
    assert 'data-ventas-qa-sin-desglose' not in client
    assert 'tipoBody.replaceChildren(row)' not in client
    assert 'Registros mensuales' in client
    assert 'MutationObserver(()=>update())' in client
    assert "dashboardVentasExcelQADatos" in app
    assert 'ventas-dashboard-qa-app.js?v='+VERSION in page
    assert "portal_user_can_tool('dashboard')" in page
    assert "gabriel.guerra@juanpablo.com.mx" in page
    assert 'Referencia mensual 2025 completa' in yoy
    assert len(list(OUTPUT.iterdir()))==5
    print("PASS: isolated, admin-only QA dashboard built without deploying")

if __name__=="__main__":
    build()
