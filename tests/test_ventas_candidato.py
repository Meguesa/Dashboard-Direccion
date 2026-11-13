"""Validate the reviewed five-file Excel Sales cutover candidate without deployment."""
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/"deploy-ventas-excel-candidato"

class VentasCutoverCandidate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result=subprocess.run(["python3",str(ROOT/"tools/build_ventas_excel_candidato.py")],
                              cwd=ROOT,capture_output=True,text=True)
        if result.returncode:
            raise RuntimeError("Sales candidate build failed: "+result.stderr+" / "+result.stdout)
    def text(self,name):
        return (TARGET/name).read_text(encoding="utf-8")
    def test_only_five_overlay_files(self):
        self.assertEqual(set(p.name for p in TARGET.iterdir()),{
            "index.php","app.js","graph.js","ventas-excel.js","ventas-excel.php"})
    def test_no_graph_sales_or_bi_sales(self):
        graph=self.text("graph.js")
        self.assertNotIn("obtenerVentasSharePoint(",graph)
        self.assertIn("const ventas = await cargarVentasExcelOriginal();",graph)
        self.assertIn("const metasVentas = usarVentasExcelQA ? []",graph)
    def test_targets_are_from_original_manual_excel(self):
        app=self.text("app.js")
        self.assertIn('if (typeof metasVentasExcelPeriodo==="function")',app)
        self.assertIn("return metasVentasExcelPeriodo(mes);",app)
        self.assertIn("return sumarMetaPrevisionMensual(mes);",app)
        self.assertIn("return NaN;",app)
        self.assertIn("const totalVentas = ventasPrevision;",app)
        self.assertIn('setText("pageVentasUiTotal", "No conciliado")',app)
        self.assertIn('setText("pageVentasMetaUi", "No conciliado")',app)
        self.assertIn("const metaVentas = metaPrevision;",app)
        self.assertIn("const esperado = auditoria?.contratosUnicosNoRepetidos;",app)
        self.assertIn('setText("pageVentasTicketServicios", "No calculable")',app)
        self.assertIn('label: "Ventas comerciales (Excel)"',app)
        self.assertNotIn('label: "Ventas UI"',app)
    def test_role_read_only_endpoint(self):
        php=self.text("ventas-excel.php")
        self.assertIn("if(!portal_user_can_tool('dashboard'))",php)
        self.assertNotIn("if(!$admin||!portal_user_can_tool('dashboard'))",php)
        self.assertIn("'noSumarContratos'=>true",php)
        self.assertIn("'fuente'=>'EXCEL_ORIGINAL_VENTAS'",php)
    def test_php_and_js_syntax(self):
        for name in ("index.php","ventas-excel.php"):
            r=subprocess.run(["php","-l",str(TARGET/name)],
                             capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
        for name in ("app.js","graph.js","ventas-excel.js"):
            r=subprocess.run(["node","--check",str(TARGET/name)],
                             capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
    def test_source_switch_only_via_intended_release(self):
        html=self.text("index.php")
        self.assertIn("ventas-excel.js?v=20261113-ventas-directo-candidato-3",html)
        self.assertIn("Ventas comerciales del periodo",html)
        self.assertIn("portal_user_can_tool('dashboard')",html)

if __name__=="__main__":
    unittest.main()
