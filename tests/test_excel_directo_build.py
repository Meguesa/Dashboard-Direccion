#!/usr/bin/env python3
"""Non-deploying checks for the Excel-direct Dashboard production candidate."""
from pathlib import Path
import os
import re
import subprocess
import unittest
import json
import tempfile

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

    def test_history_expense_engines_and_future_income_discovery(self):
        expense = (ROOT / "cpanel-preview-20261105/private-code/egresos_engine.php").read_text(encoding="utf-8")
        income = (ROOT / "cpanel-preview-20261105/private-code/ingresos_engine.php").read_text(encoding="utf-8")
        self.assertIn("EG_MIN_YEAR=2024", expense)
        self.assertIn("function egSources(", expense)
        self.assertIn("RELACION DE PAGOS (20", expense)
        self.assertIn("function egAudit(string $file,string $year)", expense)
        self.assertIn("strtoupper(trim($sheet))", expense)
        self.assertIn("if($key==='banco')", expense)
        self.assertNotIn("const EG_YEAR=", expense)
        self.assertIn("egCacheName(string $month)", expense)
        self.assertIn("<900", income)
        for name in ["egresos_engine.php", "ingresos_engine.php"]:
            filename = ROOT / "cpanel-preview-20261105/private-code" / name
            subprocess.run(["php", "-l", str(filename)], check=True, capture_output=True, text=True)

    def test_income_manifest_preserves_verified_sha(self):
        engine = (ROOT / "cpanel-preview-20261105/private-code/ingresos_engine.php").read_text(encoding="utf-8")
        self.assertIn("array_merge($cache['excel']??[],$old['excel']??[],$state['excel'])", engine)
        self.assertIn("array_merge($cache['excel']??[],$state['excel'])", engine)
        endpoint = self.read("ingresos-historico.php")
        self.assertIn("HUELLA_EXCEL_INCOMPLETA", endpoint)
        self.assertIn("excelSha256", endpoint)

    def test_legacy_income_fingerprint_requires_same_workbook_version(self):
        # Previously validated snapshots may have an eTag but lack sha256.
        # Recovery must never disable the financial audit nor accept another file.
        source = self.read("ingresos-historico.php")
        self.assertIn("($ingresos['auditoria']['validado']??false)", source)
        self.assertIn("if($etag==='')", source)
        self.assertIn("$huellaLegada=!$shaValido;", source)
        self.assertIn("$shaDescargado=(string)($descarga['sha256']??'');", source)
        self.assertIn("if($shaValido&&!hash_equals($sha,$shaDescargado))", source)
        self.assertIn("if($huellaLegada&&!preg_match", source)
        self.assertIn("$resultado['excelSha256']=$shaValido?$sha:$shaDescargado;", source)
        self.assertIn("($metaFinal['eTag']??'')!==$etag", source)
        self.assertIn("EXCEL_MODIFICADO_DURANTE_LECTURA", source)
        self.assertIn("version_guardada_tras_reintentos", source)
        self.assertIn("EXCEL_ACTUAL_NO_DISPONIBLE", source)
        self.assertIn("huellaLegada", source)
        self.assertIn("hsMetaDesdeExcel($descarga['temporal'],$mes)", source)
        self.assertIn("hsWrite($nombre,$resultado)", source)

    def test_legacy_meta_sha_recovery_and_etag_guard_runtime(self):
        """Exercise the actual PHP routine with synthetic caches and mocked Graph."""
        source = self.read("ingresos-historico.php")
        start = source.index("function hsMetaMesValidado(")
        end = source.index("\n$mode=$_GET", start)
        php_function = source[start:end]
        script = """<?php
declare(strict_types=1);
const HS_RULES=2;
const HS_DIR=__DIR__;
const JJP_COBRANZA_DRIVE_ID='FAKE';
$GLOBALS['data']=[
 'cache_excel_ingresos_2026-08.json'=>[
   'auditoria'=>['validado'=>true], 'reglasVersion'=>2,
   'excel'=>['etag'=>'book-v1']],
 'historico_catalogo.json'=>['meses'=>['2026-08'=>['id'=>'I1']]]];
$GLOBALS['sha']=hash('sha256','book-v1');
$GLOBALS['finalEtag']='book-v1';
$GLOBALS['method']='contenido_actual_guardado';
function hsRead(string $name,array $fallback=[]):array{
 return $GLOBALS['data'][$name]??$fallback;
}
function hsWrite(string $name,array $data):void{$GLOBALS['data'][$name]=$data;}
function hsCacheName(string $month):string{return 'cache_excel_ingresos_'.$month.'.json';}
function hsToken():string{return 'fake';}
function hsSources(string $token):array{return [];}
function hsGraph(string $path,string $token):array{
 return ['eTag'=>str_contains($path,'$select')?$GLOBALS['finalEtag']:'book-v1'];
}
function hsSnapshotDownload(string $drive,array $meta,string $token):array{
 $path=tempnam(__DIR__,'test_xls_');
 file_put_contents($path,'book-v1');
 return ['temporal'=>$path,'metodo'=>$GLOBALS['method'],
   'nuevaVersionPendiente'=>false,'sha256'=>$GLOBALS['sha']];
}
function hsMetaDesdeExcel(string $archivo,string $mes):array{
 return ['mes'=>$mes,'metas'=>[['area'=>'Panteon','metaMensual'=>100]],
   'metaTotal'=>100,'realTotal'=>120];
}
""" + php_function + """
function check(bool $ok,string $msg):void{
 if(!$ok)throw new RuntimeException($msg);
}
$token=null;
$res=hsMetaMesValidado('2026-08',$token);
check(($res['validado']??false)===true,'expected recovery');
check(($res['excelSha256']??null)===hash('sha256','book-v1'),'missing SHA not recovered');
check(($GLOBALS['data']['cache_metas_cobranza_excel_2026-08.json']['excelEtag']??'')==='book-v1','cache missing');
$GLOBALS['data']['cache_metas_cobranza_excel_2026-08.json']=[];
$GLOBALS['finalEtag']='book-v2';
$token=null;
$res=hsMetaMesValidado('2026-08',$token);
check(($res['validado']??false)===false,'changed eTag accepted');
check(($res['motivo']??'')==='EXCEL_MODIFICADO_DURANTE_LECTURA','wrong reason for eTag mismatch');
$GLOBALS['data']['cache_excel_ingresos_2026-08.json']['excel']['sha256']=hash('sha256','book-old');
$GLOBALS['finalEtag']='book-v1';
$token=null;
$res=hsMetaMesValidado('2026-08',$token);
check(($res['validado']??false)===false,'wrong SHA accepted');
check(($res['motivo']??'')==='EXCEL_MODIFICADO_DURANTE_LECTURA','wrong reason for SHA mismatch');
$GLOBALS['data']['cache_excel_ingresos_2026-08.json']['excel']['sha256']='';
$GLOBALS['method']='version_guardada_tras_reintentos';
$token=null;
$res=hsMetaMesValidado('2026-08',$token);
check(($res['validado']??false)===false,'fallback version accepted');
check(($res['motivo']??'')==='EXCEL_ACTUAL_NO_DISPONIBLE','wrong fallback reason');
echo 'All legacy fingerprint checks passed';
"""
        with tempfile.TemporaryDirectory(prefix="test-metas-legacy-") as tmp:
            file = Path(tmp) / "verify.php"
            file.write_text(script, encoding="utf-8")
            result = subprocess.run(["php", str(file)], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("All legacy fingerprint checks passed", result.stdout)

    def test_real_november_cover_layout_parser(self):
        # Matches the published November cover sheet: B=BANCOS, C:G=areas + total.
        source = self.read("ingresos-historico.php")
        start = source.index("function hsMetaDesdeFilas(")
        end = source.index("function hsMetaDesdeExcel(", start)
        parser = source[start:end]
        code = """<?php
function hsText($v) { return mb_strtoupper(trim((string)$v), 'UTF-8'); }
function hsCents($v) { return (int) round((float)$v * 100); }
""" + parser + """
$rows = [
 [23,[1=>'BANCOS',2=>'Panteon',3=>'Servicios CH',4=>'Servicios AF',5=>'TOTAL SERVICE',6=>'TOTAL'],[]],
 [28,[1=>'Ingreso Total',2=>'2375',3=>'41438.89',4=>'92645.54',5=>'191489.48',6=>'327948.91'],[]],
 [29,[1=>'META',2=>'120000',3=>'950646',4=>'1393562.50',5=>'2425791.50',6=>'4890000'],[]],
];
echo json_encode(hsMetaDesdeFilas($rows,'2026-11'));
"""
        with tempfile.TemporaryDirectory(prefix="nov-cover-") as tmp:
            file = Path(tmp) / "verify.php"
            file.write_text(code, encoding="utf-8")
            result = subprocess.run(["php", str(file)], check=True, capture_output=True, text=True)
            meta = json.loads(result.stdout)
            self.assertEqual([r["area"] for r in meta["metas"]],
                             ["Panteon", "Servicios CH", "Servicios AF", "Total Service"])
            self.assertEqual([r["metaMensual"] for r in meta["metas"]],
                             [120000, 950646, 1393562.5, 2425791.5])
            self.assertAlmostEqual(meta["realTotal"], 327948.91)
            self.assertEqual(meta["metaTotal"], 4890000)

    def test_historical_cover_keeps_original_total_with_warning(self):
        source = self.read("ingresos-historico.php")
        parser = source[source.index("function hsMetaDesdeFilas("):
                        source.index("function hsMetaDesdeExcel(")]
        code = """<?php
function hsText($v) { return mb_strtoupper(trim((string)$v), 'UTF-8'); }
function hsCents($v) { return (int) round((float)$v * 100); }
""" + parser + """
$rows = [
 [19,[1=>'BANCOS',2=>'Panteon',3=>'Servicios CH',4=>'Servicios AF',5=>'TOTAL SERVICE',6=>'TOTAL'],[]],
 [24,[1=>'Ingreso Total',2=>'67333.06',3=>'824540.41',4=>'870033.32',5=>'2201154.65',6=>'3963061.44'],[]],
 [25,[1=>'META',2=>'90000',3=>'765303',4=>'797304',5=>'1469053',6=>'3300000'],[]],
];
echo json_encode(hsMetaDesdeFilas($rows,'2024-07'));
"""
        with tempfile.TemporaryDirectory(prefix="historic-cover-") as tmp:
            file = Path(tmp) / "test.php"
            file.write_text(code, encoding="utf-8")
            r = subprocess.run(["php", str(file)], capture_output=True, text=True, check=True)
            data = json.loads(r.stdout)
            self.assertEqual(data["metaTotal"], 3300000)
            self.assertEqual(data["mes"], "2024-07")
            self.assertEqual(len(data["metas"]), 4)
            self.assertEqual(data["advertencias"][0]["codigo"], "META_TOTAL_DIFIERE_AREAS")
            self.assertEqual(data["advertencias"][0]["diferenciaCentavos"], 17834000)

    def test_historical_goals_load_all_valid_months_without_erasing_cache(self):
        historical = self.read("ingresos-historico.js")
        app = self.read("app.js")
        graph = self.read("graph.js")
        self.assertIn("mesesHistoricosDeIngresosValidados()", historical)
        self.assertIn("refrescarMetasHistoricasEnSegundoPlano()", historical)
        self.assertIn("mesesMetaRecientes", graph)
        self.assertIn("mezclarMetasExcelVerificadas(", app)
        self.assertIn("excelSha256", historical)
        self.assertIn("const valoresMetas = meses.map", app)
        self.assertIn("return filas.length === 4", app)
        self.assertIn("metaTotalCaratula", app)
        self.assertNotIn("state.datos.metasCobranza = reemplazarRegistrosPorMes(", app)
        self.assertNotIn("fetch(\"BI_Metas_Cobranza", historical)
        self.assertNotIn("obtenerMetasCobranzaSharePoint", historical)

    def test_services_day_does_not_render_or_log_multiple_times(self):
        app = self.read("app.js")
        self.assertNotIn('console.log("Servicios del día:"', app)
        self.assertEqual(app.count("renderServiciosDelDiaSeguro();"), 1)
        self.assertNotIn("setTimeout(() => {\n    renderServiciosDelDia();", app)
        self.assertIn("ultimaFuenteServiciosDelDia === fuenteActual", app)
        self.assertIn("ultimoMinutoServiciosDelDia === minutoActual", app)
        self.assertIn("Math.floor(Date.now() / 60000)", app)
        self.assertIn("renderServiciosDelDia();", app)
        self.assertIn("const DASHBOARD_REFRESH_MS = 15 * 60 * 1000;", app)

    def test_fifteen_minute_refresh_without_background_polling(self):
        app = self.read("app.js")
        income = self.read("ingresos-historico.js")
        expense = self.read("egresos-excel.js")
        self.assertIn("const DASHBOARD_REFRESH_MS = 15 * 60 * 1000;", app)
        self.assertIn("if (intervaloActualizacionDashboard) return;", app)
        self.assertIn("}, DASHBOARD_REFRESH_MS);", app)
        self.assertNotIn("setInterval(async()=>{if(ingresosExcelActualizando)", income)
        self.assertNotIn("setInterval(async()=>{if(egresosExcelActualizando)", expense)
        self.assertNotIn("setInterval(refrescarMetasHistoricasEnSegundoPlano, 5000)", income)
        self.assertIn("async function refrescarMetasHistoricasEnSegundoPlano()", income)
        self.assertIn("metasHistoricasProximaRevision = Date.now() + DASHBOARD_REFRESH_MS;", income)
        self.assertIn("await guardarDatosEnCache();", income)
        self.assertIn("if (firma === ultimaFirmaCacheDashboard) return true;", app)

    def test_indexeddb_writes_only_when_snapshot_changes(self):
        app = self.read("app.js")
        begin = app.index("const cacheReferencias = new WeakMap();")
        end = app.index("window.dashboardCacheReady =", begin)
        variables_and_fingerprint = app[begin:end]
        begin = app.index("async function guardarDatosEnCache()")
        end = app.index("async function cargarDatosDesdeCache()", begin)
        save = app[begin:end]
        script = """
const state = {
  anioSeleccionado: "2026", mesSeleccionado: "2026-08",
  mesInicioSeleccionado: "2026-08", mesFinSeleccionado: "2026-08",
  datos: {ingresos:[{importe:100}], egresos:[], metasCobranza:[]}
};
const DASHBOARD_CACHE_KEY="test";
const DASHBOARD_CACHE_KEY_BASE="test";
const localStorage={};
let writes=0;
async function escribirDashboardCacheIndexedDb() {
  writes += 1;
  await Promise.resolve();
}
""" + variables_and_fingerprint + save + """
(async()=>{
  // Concurrencia: tres disparos sobre el mismo estado no triplican escrituras.
  const outcomes=await Promise.all([
    guardarDatosEnCache(), guardarDatosEnCache(), guardarDatosEnCache()
  ]);
  if (outcomes.some(v=>v!==true) || writes!==1)
    throw Error('Duplicated initial IndexedDB write: '+writes);
  await guardarDatosEnCache();
  if(writes!==1)throw Error('Unchanged state was rewritten');
  state.mesInicioSeleccionado="2026-07";
  await guardarDatosEnCache();
  if(writes!==2)throw Error('Period change not saved');
  state.datos.metasCobranza=[{mes:"2026-07",metaMensual:4450000}];
  await guardarDatosEnCache();
  if(writes!==3)throw Error('Historical metas change not saved');
  await guardarDatosEnCache();
  if(writes!==3)throw Error('Unchanged metas were rewritten');
  process.stdout.write('Cache deduplication passed');
})().catch(e=>{console.error(e);process.exitCode=1});
"""
        with tempfile.TemporaryDirectory(prefix="dashboard-cache-") as tmp:
            js = Path(tmp) / "test.js"
            js.write_text(script, encoding="utf-8")
            result = subprocess.run(["node", str(js)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Cache deduplication passed", result.stdout)

    def test_expense_file_discovery_with_mock_graph(self):
        source = (ROOT / "cpanel-preview-20261105/private-code/egresos_engine.php").as_posix()
        php = """<?php
require_once '__ENGINE__';
function hsRemoteJson($drive, $path, $token) {
    if(str_contains($path, 'parentReference')) return ['name'=>'RELACION DE PAGOS 2026.xlsx',
        'parentReference'=>['id'=>'folder','driveId'=>EG_DRIVE]];
    return ['value'=>[
        ['name'=>'RELACION DE PAGOS 2024.xlsx','id'=>'a','file'=>[]],
        ['name'=>'RELACION DE PAGOS 2025.xlsx','id'=>'b','file'=>[]],
        ['name'=>'RELACION DE PAGOS 2026.xlsx','id'=>'c','file'=>[]],
        ['name'=>'RELACION DE PAGOS 2027.xlsx','id'=>'d','file'=>[]],
        ['name'=>'FLUJO 2027.xlsx','id'=>'e','file'=>[]],
        ['name'=>'RELACION DE PAGOS 2023.xlsx','id'=>'f','file'=>[]]
    ]];
}
echo json_encode(egSources('dummy'));
""".replace('__ENGINE__', source)
        with tempfile.TemporaryDirectory(prefix="yearly-expenses-") as tmp:
            file = Path(tmp) / "mock.php"
            file.write_text(php, encoding="utf-8")
            result = subprocess.run(["php", str(file)], check=True, capture_output=True, text=True)
            years = json.loads(result.stdout)
            self.assertEqual(list(years.keys()), ["2027", "2026", "2025", "2024"])

    def test_protected_engine_package_and_safe_fallback(self):
        for name in ["ingresos_engine.php", "egresos_engine.php",
                     "ingresos_lector_prueba.php", "dashboard_excel_cron.php",
                     ".htaccess"]:
            self.assertTrue((OUTPUT / name).is_file(), name)
        rules = self.read(".htaccess")
        self.assertIn("Require all denied", rules)
        self.assertIn("jsonl", rules)
        self.assertIn("dashboard_excel_cron", rules)
        for name in ["ingresos-historico.php", "egresos-excel.php"]:
            self.assertIn(".dashboard-local-ready", self.read(name))

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


    def run_php_with_mock_portal(self, endpoint, email, allow, method="GET", mode="manifest"):
        """Simulates a second authorized viewer without handling any real credentials.

        The production PHP file is copied to a temporary isolated harness. Only
        require/import statements and the income-only CLI shortcut are stubbed.
        All authorization, admin gates and JSON output remain the actual code.
        """
        source = self.read(endpoint)
        source = source.replace("<?php", "", 1)
        source = source.replace("declare(strict_types=1);", "", 1)
        imports = [
            "require_once '/home/juanpab1/bi-ingresos-privado/ingresos_engine.php';",
            "require_once (is_file(__DIR__.'/.dashboard-local-ready') && is_file(__DIR__.'/historico_estado.json') && is_file(__DIR__.'/egresos_estado.json') ? __DIR__.'/ingresos_engine.php' : '/home/juanpab1/bi-ingresos-privado/ingresos_engine.php');",
            "require_once HS_DIR.'/egresos_engine.php';",
            "require_once dirname(__DIR__).'/includes/bootstrap.php';",
            "require_once dirname(__DIR__).'/includes/portal-access.php';",
            "require_once dirname(__DIR__) . '/includes/bootstrap.php';",
            "require_once dirname(__DIR__) . '/includes/portal-access.php';",
        ]
        for item in imports:
            source = source.replace(item, "")
        cli_shortcut = ("if(PHP_SAPI==='cli'){echo json_encode(hsRun(),"
                        "JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;exit;}")
        source = source.replace(cli_shortcut, "")
        self.assertNotIn("require_once", source)
        self.assertNotIn("if(PHP_SAPI==='cli')", source)
        mocks = r"""
$_SERVER['REQUEST_METHOD'] = getenv('MOCK_METHOD') ?: 'GET';
$_GET = ['modo' => getenv('MOCK_MODE') ?: 'manifest'];
$_POST = ['csrf'=>'mock-safe-test-token'];
$_SESSION = [
  'ingresos_historico_csrf'=>'mock-safe-test-token',
  'egresos_excel_csrf'=>'mock-safe-test-token'
];
function portal_require_authentication(): void {}
function portal_user(): array {
    return ['email' => getenv('MOCK_EMAIL') ?: ''];
}
function portal_user_can_tool(string $name): bool {
    return $name === 'dashboard' && getenv('MOCK_CAN_VIEW') === '1';
}
function hsManifest(bool $admin): array {
    return ['fuente'=>'EXCEL_ORIGINAL', 'puedeActualizar'=>$admin];
}
function egManifest(): array {
    return ['fuente'=>'EXCEL_ORIGINAL_EGRESOS','puedeActualizar'=>true];
}
function hsRun(...$args): array { return ['estado'=>'mock_sin_mutacion']; }
function egRun(...$args): array { return ['estado'=>'mock_sin_mutacion']; }
"""
        php = "<?php\ndeclare(strict_types=1);\n" + mocks + "\n" + source
        with tempfile.TemporaryDirectory(prefix="role-simulation-") as tmp:
            path = Path(tmp) / endpoint
            path.write_text(php, encoding="utf-8")
            env = os.environ.copy()
            env.update({
                "MOCK_METHOD": method, "MOCK_MODE": mode,
                "MOCK_EMAIL": email, "MOCK_CAN_VIEW": "1" if allow else "0",
            })
            return subprocess.run(
                ["php", "-d", "display_errors=0", str(path)],
                env=env, capture_output=True, text=True, check=True,
            ).stdout

    def test_second_authorized_user_can_read_but_not_update(self):
        for endpoint in ["ingresos-historico.php", "egresos-excel.php"]:
            with self.subTest(endpoint=endpoint):
                reader = "second.viewer@example.invalid"
                result = self.run_php_with_mock_portal(endpoint, reader, True)
                response = json.loads(result)
                self.assertEqual(response["puedeActualizar"], False)
                self.assertIn("EXCEL_ORIGINAL", response["fuente"])
                blocked_admin = self.run_php_with_mock_portal(
                    endpoint, reader, True, mode="admin")
                self.assertIn("Solo administradores", blocked_admin)
                blocked_refresh = self.run_php_with_mock_portal(
                    endpoint, reader, True, method="POST")
                self.assertIn("Solo administradores", blocked_refresh)

    def test_dashboard_denies_user_without_permission(self):
        for endpoint in ["ingresos-historico.php", "egresos-excel.php"]:
            with self.subTest(endpoint=endpoint):
                result = self.run_php_with_mock_portal(
                    endpoint, "not-authorized@example.invalid", False)
                self.assertIn("Acceso no autorizado", result)
                self.assertNotIn("fuente", result)

    def test_admin_can_view_and_request_mock_refresh(self):
        # Only fake data is returned: no network, SharePoint or live cPanel writes.
        for endpoint in ["ingresos-historico.php", "egresos-excel.php"]:
            with self.subTest(endpoint=endpoint):
                admin = "gabriel.guerra@juanpablo.com.mx"
                result = self.run_php_with_mock_portal(endpoint, admin, True)
                response = json.loads(result)
                self.assertTrue(response["puedeActualizar"])
                admin_page = self.run_php_with_mock_portal(
                    endpoint, admin, True, mode="admin")
                self.assertIn("Auditor", admin_page)
                refresh = self.run_php_with_mock_portal(
                    endpoint, admin, True, method="POST")
                response = json.loads(refresh)
                self.assertEqual(response["estado"], "mock_sin_mutacion")


if __name__ == "__main__":
    unittest.main(verbosity=2)
