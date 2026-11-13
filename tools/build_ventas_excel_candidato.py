#!/usr/bin/env python3
"""Candidate overlay for direct Excel Ventas; builds files, NEVER deploys.

Run after building the existing dashboard candidate from the audited snapshot.
No changes to Ingresos, Egresos, Services, Marketing, BI lists or cron.
The incumbent Power Automate Sales flow must stay ON through validation.
"""
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"cpanel-preview-20261105"/"dashboard-egresos-preview"
CURRENT=ROOT/"deploy-excel-directo"
TARGET=ROOT/"deploy-ventas-excel-candidato"
VERSION="20261113-ventas-directo-candidato-2"
FILES=("index.php","app.js","graph.js","ventas-excel.js","ventas-excel.php")


def replace_exact(source,old,new,why):
    count=source.count(old)
    if count != 1:
        raise RuntimeError(f"{why}: expected one anchor, saw {count}")
    return source.replace(old,new,1)


def build():
    subprocess.run(["python3",str(ROOT/"tools"/"build_excel_directo_dashboard.py")],
                   cwd=ROOT,check=True)
    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True)
    for name in FILES:
        src=(CURRENT if name in ("index.php","app.js","graph.js") else SOURCE)/name
        shutil.copy2(src,TARGET/name)

    # Preserve the existing Dashboard role gate, not the QA admin-only check.
    php=(TARGET/"ventas-excel.php").read_text(encoding="utf-8")
    php=replace_exact(
        php,
        "if(!$admin||!portal_user_can_tool('dashboard')){",
        "if(!portal_user_can_tool('dashboard')){",
        "Production read-only Sales data authorization")
    (TARGET/"ventas-excel.php").write_text(php,encoding="utf-8")

    graph=(TARGET/"graph.js").read_text(encoding="utf-8")
    old='''    const usarVentasExcelQA = new URLSearchParams(window.location.search).get("ventas_excel_qa") === "1" &&
      String(window.PORTAL_USER_EMAIL || "").trim().toLowerCase() ===
        "gabriel.guerra@juanpablo.com.mx";
    // QA opt-in: prueba de lectura directa sin sustituir BI_Ventas en producción.
    const ventas = usarVentasExcelQA
      ? await cargarVentasExcelOriginal(usarFiltroMeses ? mesesRecargados : [])
      : await obtenerVentasSharePoint(usarFiltroMeses ? mesesRecargados : []);'''
    graph=replace_exact(graph,old,
        '''    // Ventas siempre desde los Excel originales en el candidato.
    const usarVentasExcelQA = true;
    const ventas = await cargarVentasExcelOriginal();''',
        "Require Excel Sales source in production candidate")
    start=graph.index("async function obtenerVentasSharePoint(")
    end=graph.index("\nasync function obtenerServiciosSharePoint(",start)
    graph=graph[:start]+graph[end:]
    (TARGET/"graph.js").write_text(graph,encoding="utf-8")

    app=(TARGET/"app.js").read_text(encoding="utf-8")
    old='''  if (new URLSearchParams(window.location.search).get("ventas_excel_qa")==="1" &&
      String(window.PORTAL_USER_EMAIL || "").toLowerCase()==="gabriel.guerra@juanpablo.com.mx") {
    if(window.ventasExcelEstado?.error) return NaN;'''
    app=replace_exact(app,old,
      '''  if (typeof cargarVentasExcelOriginal === "function") {
    if(window.ventasExcelEstado?.error) return NaN;''',"No QA-only sales KPI")
    old='''  if (new URLSearchParams(window.location.search).get("ventas_excel_qa")==="1" &&
      String(window.PORTAL_USER_EMAIL || "").toLowerCase()==="gabriel.guerra@juanpablo.com.mx" &&
      typeof metasVentasExcelPeriodo==="function") {'''
    app=replace_exact(app,old,
      '''  if (typeof metasVentasExcelPeriodo==="function") {''',
      "Authoritative manual goals for all Dashboard readers")
    app=replace_exact(app,
      '''function sumarMetaVentasMensual(mes) {
  return sumarMetaPrevisionMensual(mes) + sumarMetaUiMensual(mes);
}''',
      '''function sumarMetaVentasMensual(mes) {
  // Commercial total: UI cannot be added again.
  return sumarMetaPrevisionMensual(mes);
}''',"No double count Commercial target")
    app=replace_exact(app,
      '''function sumarVentasUiPeriodo(mes) {
  return calcularVentasUiPorResponsable(mes)''',
      '''function sumarVentasUiPeriodo(mes) {
  // No standalone monetized UI source verified in the original workbook.
  if (window.ventasExcelEstado?.fuente==="EXCEL_ORIGINAL_VENTAS") return NaN;
  return calcularVentasUiPorResponsable(mes)''',
      "Do not invent immediate-use revenue")
    app=replace_exact(app,
      '''function sumarMetaUiMensual(mes) {
  const metasVentas = obtenerMetasVentasMes(mes);''',
      '''function sumarMetaUiMensual(mes) {
  if (window.ventasExcelEstado?.fuente==="EXCEL_ORIGINAL_VENTAS") return NaN;
  const metasVentas = obtenerMetasVentasMes(mes);''',
      "Do not reuse obsolete BI targets for immediate use")
    app=replace_exact(app,
      '''  const totalVentas = ventasPrevision + ventasUi;''',
      '''  // El total de la columna G ya contiene las ventas comerciales.
  // Uso Inmediato de BI_Servicios no se suma otra vez.
  const totalVentas = ventasPrevision;''',
      "No double-count in main Dashboard headline")
    app=replace_exact(app,
      '''  const metaVentas = metaPrevision + metaUi;''',
      '''  const metaVentas = metaPrevision;''',
      "Commercial goal only, never add unrelated UI target")
    app=replace_exact(app,
      '''  setText(
    "pageVentasCumplimientoUi",
    metaUi > 0 ? formatoPorcentaje(porcentajeCumplimientoUi) : "—"
  );''',
      '''  setText("pageVentasCumplimientoUi", "No conciliado");''',
      "Do not show UI compliance as zero")
    app=replace_exact(app,
      '''  setText("pageVentasUiTotal", formatoMoneda(ventasUi));''',
      '''  setText("pageVentasUiTotal", "No conciliado");''',
      "No unsupported UI amount in sales")
    app=replace_exact(app,
      '''  setText("pageVentasMetaUi", formatoMoneda(metaUi));''',
      '''  setText("pageVentasMetaUi", "No conciliado");''',
      "No unsupported UI target")
    app=replace_exact(app,
      '''  renderEstadoEgresosExcel();''',
      '''  renderEstadoEgresosExcel();
  if (typeof renderEstadoVentasExcel==="function") renderEstadoVentasExcel();''',
      "Show source/reconciliation warning in dashboard")
    app=replace_exact(app,
      '''function obtenerVentasMensuales(mes) {
  return obtenerVentasOperativas(mes)
    .filter((item) => {
      const tipoRegistro = normalizarTexto(item.tipoRegistro).toUpperCase();
      const montoVenta = obtenerMontoVenta(item);

      return montoVenta > 0''',
      '''function obtenerVentasMensuales(mes) {
  return obtenerVentasOperativas(mes)
    .filter((item) => {
      const tipoRegistro = normalizarTexto(item.tipoRegistro).toUpperCase();
      const montoVenta = obtenerMontoVenta(item);

      return montoVenta >= 0''',
      "Keep zero-value advisor records in commercial rows")
    (TARGET/"app.js").write_text(app,encoding="utf-8")

    index=(TARGET/"index.php").read_text(encoding="utf-8")
    for old,new in (
      ("Ventas Previsión del periodo","Ventas comerciales del periodo"),
      ("Meta Previsión Mensual","Meta comercial mensual"),
      ("% Cumplimiento Previsión","% Cumplimiento comercial"),
      ("Ventas Previsión/UI vs metas mensuales","Ventas comerciales vs metas mensuales"),
      ("Comparativo mensual de ventas de Previsión y Uso Inmediato contra sus metas correspondientes.",
        "Ventas comerciales de la columna G contra las metas manuales de Comercial. Uso Inmediato aún sin conciliación separada."),
    ):
        index=replace_exact(index,old,new,"Sales label "+old)
    index=replace_exact(index,
      'ventas-excel.js?v=20261110-cobranza-caratula-huella-1','ventas-excel.js?v='+VERSION,
      "Sales client cache bust")
    index=replace_exact(index,
      'graph.js?v=20261110-cobranza-caratula-huella-1',
      'graph.js?v='+VERSION,
      "Graph client cache bust")
    index=replace_exact(index,
      'app.js?v=20261110-cobranza-caratula-huella-1',
      'app.js?v='+VERSION,
      "Dashboard client cache bust")
    (TARGET/"index.php").write_text(index,encoding="utf-8")

    assert "obtenerVentasSharePoint(" not in graph
    assert "await cargarVentasExcelOriginal()" in graph
    assert 'const metasVentas = usarVentasExcelQA ? []' in graph
    assert "portal_user_can_tool('dashboard')" in php
    assert 'soloLectura' in php
    assert "ventas-excel.js?v="+VERSION in index
    assert all((TARGET/name).is_file() for name in FILES)
    print("Excel Sales cutover candidate prepared: 5 files, no deployment.")


if __name__=="__main__":
    build()
