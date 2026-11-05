#!/usr/bin/env python3
"""Non-deploying checks for the Excel-direct Dashboard production candidate."""
from pathlib import Path
import os
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "deploy-excel-directo"
SNAPSHOT = ROOT / "cpanel-preview-20261105" / "dashboard-egresos-preview"


class ExcelDirectBuildChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(["python3", str(ROOT / "tools" / "build_excel_directo_dashboard.py")],
                       cwd=ROOT, check=True, capture_output=True, text=True)

    def read(self, name):
        return (OUTPUT / name).read_text(encoding="utf-8")

    def test_sources_are_original_excel_caches(self):
        source = self.read("graph.js")
        self.assertIn("cargarIngresosExcelHistorico", source)
        self.assertIn("cargarEgresosExcel", source)
        self.assertNotIn("obtenerIngresosSharePoint", source)
        self.assertNotIn("obtenerEgresosSharePoint", source)
        for name, sentinel in [("ingresos-historico.js", "EXCEL_ORIGINAL"),
                               ("egresos-excel.js", "EXCEL_ORIGINAL_EGRESOS")]:
            self.assertIn(sentinel, self.read(name))

    def test_php_server_authorizes_readers_and_restricts_admin(self):
        index = self.read("index.php")
        self.assertIn("portal_user_can_tool('dashboard')", index)
        self.assertNotIn("Vista de pruebas restringida.", index)
        for name in ["ingresos-historico.php", "egresos-excel.php"]:
            source = self.read(name)
            self.assertIn("portal_require_authentication();", source)
            self.assertIn("portal_user_can_tool('dashboard')", source)
            self.assertRegex(source, r"if\(\$_SERVER\['REQUEST_METHOD'\]==='POST'\)\{\s*if\(!\$admin\)")
            self.assertRegex(source, r"if\(\$mode==='admin'\)\{if\(!\$admin\)")
            self.assertIn("session_write_close()", source)

    def test_all_local_scripts_and_styles_exist(self):
        html = self.read("index.php")
        for name in re.findall(r'(?:src|href)="([\w.-]+\.(?:js|css))(?:\?v=[^"]*)?"', html):
            self.assertTrue((OUTPUT / name).is_file(), name)
        self.assertNotIn("</script>\\n<script", html)
        self.assertIn("egresos-excel.js", html)
        self.assertIn("ingresos-historico.js", html)

    def test_separate_browser_cache_namespace_and_admin_link(self):
        app = self.read("app.js")
        self.assertIn("dashboardExcelDirectoDatos", app)
        self.assertIn("dashboardExcelDirectoCacheDB", app)
        self.assertNotIn("dashboardExcelEgresosPruebasCacheDB", app)
        self.assertIn("if(m.puedeActualizar)", self.read("egresos-excel.js"))

    def test_php_endpoints_and_scripts_parse(self):
        for file in OUTPUT.glob("*.php"):
            with self.subTest(file=file.name):
                subprocess.run(["php", "-l", str(file)], check=True, capture_output=True, text=True)
        for file in OUTPUT.glob("*.js"):
            with self.subTest(file=file.name):
                subprocess.run(["node", "--check", str(file)], check=True, capture_output=True, text=True)

    def test_calendar_date_not_shifted_to_previous_day(self):
        app = self.read("app.js")
        start = app.index("function obtenerFechaEgreso(item) {")
        end = app.index("function obtenerValorFechaEgreso(item) {", start)
        js = """
const obtenerValorFechaEgreso = item => item.fecha;
const normalizarTexto = value => String(value ?? '').trim();
""" + app[start:end] + """
for (const [date, expected] of [['2026-10-17', '2026-10-17'], ['2026-10-20', '2026-10-20']]) {
  const v = obtenerFechaEgreso({fecha:date});
  const actual = [v?.getFullYear(), String((v?.getMonth() ?? -1) + 1).padStart(2,'0'),
                  String(v?.getDate()).padStart(2,'0')].join('-');
  if(actual !== expected) throw new Error('Desfase en FECHA: ' + actual + ' vs ' + expected);
}
if (obtenerFechaEgreso({fecha:'2026-02-30'}) !== null) throw new Error('Fecha imposible aceptada');
"""
        env = os.environ.copy()
        env["TZ"] = "America/Monterrey"
        subprocess.run(["node", "-e", js], check=True, env=env, capture_output=True, text=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
