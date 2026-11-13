#!/usr/bin/env python3
"""Build the isolated, admin-only Sales Excel dashboard QA.

Only emits four suffixed files into a temporary build folder. No deployment.
Uses live dashboard CSS and shared non-sales modules without overwriting them.
"""
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"deploy-ventas-excel-candidato"
OUTPUT=ROOT/"deploy-ventas-dashboard-qa"
VERSION="20261113-ventas-dashboard-qa-2"
FILES={
    "index.php":"ventas-dashboard-qa.php",
    "app.js":"ventas-dashboard-qa-app.js",
    "graph.js":"ventas-dashboard-qa-graph.js",
    "ventas-excel.js":"ventas-dashboard-qa-excel.js",
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
    files={key:(BASE/key).read_text(encoding="utf-8") for key in FILES}

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
             "declare(strict_types=1);
             "declare(strict_types=1);\nheader('Cache-Control: private, no-store');\nheader('X-Robots-Tag: noindex, nofollow');",
             "Anti-cache and noindex headers")
    page=one(page,"Dashboard de Dirección | Portal Interno JdJP",
             "QA Ventas Excel | Dashboard de Dirección", "Page title")
    for source,target in FILES.items():
        if source=="index.php":continue
        pattern=r'(?<=src=")'+re.escape(source)+r'\?v=[^"]+'
        found=re.findall(pattern,page)
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
    files["app.js"]=app

    for source,target in FILES.items():
        (OUTPUT/target).write_text(files[source],encoding="utf-8")
    assert 'obtenerVentasSharePoint(' not in graph
    assert 'cargarVentasExcelOriginal(null, { permitirMesesIncompletos: true })' in graph
    assert 'catch(error)' in graph
    assert 'ventasDashboardQARevalidar' in page
    assert 'VENTAS_QA_CSRF' in page
    assert 'ventas-excel.php?modo=revalidar' in client
    assert "dashboardVentasExcelQADatos" in app
    assert 'ventas-dashboard-qa-app.js?v='+VERSION in page
    assert "portal_user_can_tool('dashboard')" in page
    assert "gabriel.guerra@juanpablo.com.mx" in page
    assert len(list(OUTPUT.iterdir()))==4
    print("PASS: isolated, admin-only QA dashboard built without deploying")

if __name__=="__main__":
    build()
