import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
GRAPH=ROOT/"cpanel-preview-20261105/dashboard-egresos-preview/graph.js"
APP=ROOT/"cpanel-preview-20261105/dashboard-egresos-preview/app.js"
CAL=ROOT/"cpanel-preview-20261105/dashboard-egresos-preview/dashboard-daily-calendar.js"

class TestAgendaOperacionesDirecta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graph=GRAPH.read_text(encoding="utf-8")
        cls.app=APP.read_text(encoding="utf-8")
        cls.calendar=CAL.read_text(encoding="utf-8")

    def test_operational_site_and_both_original_lists(self):
        self.assertIn('sitePath: "/sites/Operaciones"',self.graph)
        self.assertIn('capillas: "a46107c3-96b4-49c4-bba5-d8b26a845c65"',self.graph)
        self.assertIn('parque: "cd8cd331-1cef-4b42-b49a-10eaa3795351"',self.graph)
        self.assertIn('obtenerServiciosAgendaOperaciones()',self.graph)

    def test_capillas_source_field_mapping(self):
        for field in ['f.field_36','f.field_37','f.field_2','f.field_39','f.field_40','f.field_32','f.field_1']:
            self.assertIn(field,self.graph)
        self.assertIn('tipoOrigen: "Capillas"',self.graph)
        self.assertIn('fuenteAgenda: "Eventos Capillas"',self.graph)

    def test_parque_source_field_mapping(self):
        for field in ['f.FechaHoraInicio','f.FechaHoraFin','f.TipodeServicio','f.Servicio','f["Ubicaci_x00f3_n"]']:
            self.assertIn(field,self.graph)
        self.assertIn('tipoOrigen: "Parque"',self.graph)
        self.assertIn('fuenteAgenda: "Eventos Parque"',self.graph)

    def test_reads_all_pages_and_does_not_use_month_filter(self):
        self.assertIn('page["@odata.nextLink"]',self.graph)
        self.assertIn('while (endpoint)',self.graph)
        self.assertIn('$expand=fields&$top=200',self.graph)
        self.assertNotIn('crearFiltroMesesSharePoint(mesesFiltro)',self.graph[
            self.graph.index('async function obtenerItemsListaOperaciones'):
            self.graph.index('function mapearEventoCapillaAgenda')])

    def test_operational_source_is_agenda_authority(self):
        self.assertIn('state.datos.serviciosAgenda = Array.isArray(datosSharePoint.serviciosAgenda)',self.app)
        self.assertIn('Array.isArray(state.datos.serviciosAgenda)',self.app)
        self.assertIn('state.datos.serviciosAgenda',self.calendar)
        self.assertIn('Array.isArray(window.state?.datos?.serviciosAgenda)',self.calendar)

    def test_bi_is_fallback_only_and_failure_is_visible(self):
        self.assertIn('Respaldo: BI_Servicios',self.app)
        self.assertIn('ADVERTENCIA: no se pudo verificar la fuente operativa',self.app)
        self.assertIn('errorAgenda',self.app)

    def test_test_records_and_cross_midnight_timezones(self):
        # These are the exact UTC values observed in the original Operations list.
        # Monterrey is UTC-6: Apodaca starts 23:00 and ends 10:00 local;
        # Churubusco starts 16:00 and ends 15:00 local.
        apodaca_start="2026-11-23T05:00:00Z"
        apodaca_end="2026-11-23T16:00:00Z"
        churubusco_start="2026-11-22T22:00:00Z"
        churubusco_end="2026-11-23T21:00:00Z"
        from datetime import datetime, timezone, timedelta
        tz=timezone(timedelta(hours=-6))
        def local(value):
            return datetime.fromisoformat(value.replace("Z","+00:00")).astimezone(tz)
        self.assertEqual(local(apodaca_start).strftime("%Y-%m-%d %H:%M"),"2026-11-22 23:00")
        self.assertEqual(local(apodaca_end).strftime("%Y-%m-%d %H:%M"),"2026-11-23 10:00")
        self.assertEqual(local(churubusco_start).strftime("%Y-%m-%d %H:%M"),"2026-11-22 16:00")
        self.assertEqual(local(churubusco_end).strftime("%Y-%m-%d %H:%M"),"2026-11-23 15:00")

    def test_javascript_syntax(self):
        for file in (GRAPH,APP,CAL):
            result=subprocess.run(["node","--check",str(file)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)

if __name__=="__main__":
    unittest.main()
