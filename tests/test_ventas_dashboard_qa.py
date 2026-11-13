"""Safeguards for the four-file, admin-only Sales Excel dashboard QA."""
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"deploy-ventas-dashboard-qa"

class TestVentasDashboardQA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r=subprocess.run(["python3",str(ROOT/"tools/build_ventas_dashboard_qa.py")],
                         cwd=ROOT,capture_output=True,text=True)
        if r.returncode:
            raise RuntimeError(r.stderr+"\n"+r.stdout)

    def read(self,name):
        return (OUTPUT/name).read_text(encoding="utf-8")

    def test_exact_isolated_file_set(self):
        self.assertEqual(set(p.name for p in OUTPUT.iterdir()),{
            "ventas-dashboard-qa.php","ventas-dashboard-qa-app.js",
            "ventas-dashboard-qa-graph.js","ventas-dashboard-qa-excel.js",
            "ventas-dashboard-qa-yoy.js"})

    def test_private_access_and_relative_assets(self):
        page=self.read("ventas-dashboard-qa.php")
        self.assertIn("portal_require_authentication();",page)
        self.assertIn("portal_user_can_tool('dashboard')",page)
        self.assertIn("gabriel.guerra@juanpablo.com.mx",page)
        self.assertIn("noindex, nofollow",page)
        self.assertIn("PRUEBAS — Ventas desde Excel",page)
        self.assertIn('src="ventas-dashboard-qa-app.js?',page)
        self.assertIn('src="ventas-dashboard-qa-graph.js?',page)
        self.assertIn('src="ventas-dashboard-qa-excel.js?',page)
        self.assertIn('src="ventas-dashboard-qa-yoy.js?',page)
        self.assertNotIn('src="app.js?',page)
        self.assertNotIn('src="graph.js?',page)

    def test_no_bi_ventas_read_or_cached_production_cross_contamination(self):
        graph=self.read("ventas-dashboard-qa-graph.js")
        app=self.read("ventas-dashboard-qa-app.js")
        self.assertNotIn("obtenerVentasSharePoint(",graph)
        self.assertIn("permitirMesesIncompletos: true",graph)
        self.assertIn("dashboardVentasExcelQADatos",app)
        self.assertIn("dashboardVentasExcelQACacheDB",app)
        self.assertIn("const totalVentas = ventasPrevision;",app)
        self.assertIn('setText("pageVentasUiTotal", "No conciliado")',app)
        self.assertIn("renderEstadoVentasExcel()",app)
        yoy=self.read("ventas-dashboard-qa-yoy.js")
        self.assertIn("Comparativo diario no disponible",yoy)

    def test_no_fabricated_service_type_revenue(self):
        client=self.read("ventas-dashboard-qa-excel.js")
        self.assertIn("tipoBody.replaceChildren(row)",client)
        self.assertIn("Desglose por tipo no verificable",client)
        self.assertIn("20261113-ventas-qa-visual-5",client)

    def test_cron_sales_only_and_off_by_default(self):
        cron=(ROOT/"cpanel-preview-20261105/private-code/ventas_excel_cron_qa.php").read_text(encoding="utf-8")
        self.assertIn("JJP_VENTAS_CRON_QA",cron)
        self.assertIn("if (PHP_SAPI !== 'cli')",cron)
        self.assertIn("veRun(false)",cron)
        self.assertNotIn("hsRun()",cron)
        self.assertNotIn("egRun()",cron)
        self.assertIn("exit(75)",cron)
        self.assertEqual(subprocess.run(["php","-l",
            str(ROOT/"cpanel-preview-20261105/private-code/ventas_excel_cron_qa.php")],
            capture_output=True).returncode,0)

    def test_php_and_node_syntax(self):
        for name in ("ventas-dashboard-qa.php",):
            r=subprocess.run(["php","-l",str(OUTPUT/name)],
                             capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
        for name in ("ventas-dashboard-qa-app.js","ventas-dashboard-qa-graph.js",
                     "ventas-dashboard-qa-excel.js","ventas-dashboard-qa-yoy.js"):
            r=subprocess.run(["node","--check",str(OUTPUT/name)],
                             capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)

if __name__=="__main__":
    unittest.main()
