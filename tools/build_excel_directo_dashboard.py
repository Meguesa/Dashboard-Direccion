#!/usr/bin/env python3
"""Prepare a reviewable production package from the audited Excel pilots.

This script NEVER deploys anything, reads credentials, or changes the live site.
It consumes the archived cPanel snapshot and produces deploy-excel-directo/.
"""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cpanel-preview-20261105" / "dashboard-egresos-preview"
TARGET = ROOT / "deploy-excel-directo"
VERSION = "20261106-excel-historico-2"
FILES = [
    "index.php", "app.js", "graph.js", "auth.js", "config.js",
    "ingresos-historico.php", "ingresos-historico.js",
    "egresos-excel.php", "egresos-excel.js",
    "account-menu.css", "portal-integration.css", "styles.css",
    "dashboard-role-access.css", "dashboard-role-access.js",
    "dashboard-table-tools.js", "dashboard-annual-history.js",
    "dashboard-current-time.js", "dashboard-daily-calendar.css",
    "dashboard-daily-calendar.js", "dashboard-header-map.css",
    "dashboard-history-refresh.js",
    "dashboard-yoy-comparison.js",
]
PRIVATE_SOURCE = ROOT / "cpanel-preview-20261105" / "private-code"
SERVER_FILES = [
    "ingresos_engine.php",
    "egresos_engine.php",
    "ingresos_lector_prueba.php",
    "dashboard_excel_cron.php",
]
LOCAL_READY = ".dashboard-local-ready"
PROTECT_SOURCE = ROOT / "tools" / "dashboard-htaccess.txt"


def add_server_components():
    for name in SERVER_FILES:
        shutil.copy2(PRIVATE_SOURCE / name, TARGET / name)
    shutil.copy2(PROTECT_SOURCE, TARGET / ".htaccess")


def prepare_local_reader(source):
    old = "require_once '/home/juanpab1/bi-ingresos-privado/ingresos_engine.php';"
    new = (
        "require_once ("
        "is_file(__DIR__.'/.dashboard-local-ready') "
        "&& is_file(__DIR__.'/historico_estado.json') "
        "&& is_file(__DIR__.'/egresos_estado.json') "
        "? __DIR__.'/ingresos_engine.php' "
        ": '/home/juanpab1/bi-ingresos-privado/ingresos_engine.php');"
    )
    return replace_once(source, old, new, "conmutacion sin interrupciones de Excel")


def replace_once(text, old, new, purpose):
    if text.count(old) != 1:
        raise RuntimeError(f"{purpose}: expected exactly one source match, got {text.count(old)}")
    return text.replace(old, new, 1)

def write_file(name, content):
    (TARGET / name).write_text(content, encoding="utf-8")

def build_frontend():
    source = (TARGET / "index.php").read_text(encoding="utf-8")
    source = replace_once(
        source,
        "require_once dirname(__DIR__) . '/includes/bootstrap.php';",
        "require_once dirname(__DIR__) . '/includes/bootstrap.php';\n"
        "require_once dirname(__DIR__) . '/includes/portal-access.php';",
        "use Portal's role-based permission check",
    )
    old = """if (strtolower(trim((string) (portal_user()['email'] ?? ''))) !== 'gabriel.guerra@juanpablo.com.mx') {
    http_response_code(403);
    exit('Vista de pruebas restringida.');
}"""
    new = """if (!portal_user_can_tool('dashboard')) {
    http_response_code(403);
    exit('Sin permiso para consultar el Dashboard.');
}"""
    source = replace_once(source, old, new, "replace pilot-only access")
    source = re.sub(
        r'((?:src|href)=")([A-Za-z0-9_.-]+\.(?:js|css))(?:\?v=[^"]*)?"',
        lambda m: f'{m.group(1)}{m.group(2)}?v={VERSION}"',
        source,
    )
    # Do not let a prior preview's branding imply that it is a new app.
    source = source.replace("Egresos Excel: verificando información.", "Egresos desde Excel: verificando información.")
    # Correct literal backslash+n leftover from the archived preview HTML.
    source = source.replace(r"</script>\n<script", "</script>" + "\n" + "<script")
    write_file("index.php", source)

    app = (TARGET / "app.js").read_text(encoding="utf-8")
    app = replace_once(app, '"dashboardExcelEgresosPruebasDatos"', '"dashboardExcelDirectoDatos"', "dedicated production cache namespace")
    app = replace_once(app, '"dashboardExcelEgresosPruebasCacheDB"', '"dashboardExcelDirectoCacheDB"', "dedicated production IndexedDB namespace")
    fn = app.index("function obtenerFechaEgreso(item) {")
    mark = "  const fechaIso = new Date(texto);"
    pos = app.find(mark, fn)
    if pos < 0:
        raise RuntimeError("Date-only parsing location not found")
    block = """  // Excel calendar dates have no time zone. Parsing YYYY-MM-DD as UTC
  // shifts the displayed day backwards in Monterrey.
  const fechaSinZona = texto.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (fechaSinZona) {
    const local = new Date(Number(fechaSinZona[1]), Number(fechaSinZona[2]) - 1, Number(fechaSinZona[3]));
    if (local.getFullYear() === Number(fechaSinZona[1]) &&
        local.getMonth() === Number(fechaSinZona[2]) - 1 &&
        local.getDate() === Number(fechaSinZona[3])) return local;
    return null;
  }

"""
    app = app[:pos] + block + app[pos:]
    write_file("app.js", app)

def build_expense_javascript():
    path = TARGET / "egresos-excel.js"
    source = path.read_text(encoding="utf-8")
    source = replace_once(
        source,
        "el.append(when);const a=document.createElement('a');a.href='egresos-excel.php?modo=admin';",
        "el.append(when);if(m.puedeActualizar){const a=document.createElement('a');a.href='egresos-excel.php?modo=admin';",
        "show expense admin link only to approved auditors",
    )
    source = replace_once(
        source,
        "a.rel='noopener';el.append(a);",
        "a.rel='noopener';el.append(a);}",
        "close admin-only expense link",
    )
    write_file("egresos-excel.js", source)


def build_income_endpoint():
    path = TARGET / "ingresos-historico.php"
    source = prepare_local_reader(path.read_text(encoding="utf-8"))
    source = replace_once(
        source,
        "if(!$admin||!portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso restringido a la auditoría de pruebas.');}",
        "if(!portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso no autorizado.');}",
        "Dashboard role read-only access to income",
    )
    source = replace_once(
        source,
        "if($_SERVER['REQUEST_METHOD']==='POST'){",
        "if($_SERVER['REQUEST_METHOD']==='POST'){\n    if(!$admin){http_response_code(403);exit('Solo administradores pueden actualizar.');}",
        "protect manual income refresh",
    )
    source = replace_once(
        source,
        "if($mode==='admin'){session_write_close();",
        "if($mode==='admin'){if(!$admin){http_response_code(403);exit('Solo administradores.');}session_write_close();",
        "protect income admin interface",
    )
    write_file("ingresos-historico.php", source)

def build_expense_endpoint():
    path = TARGET / "egresos-excel.php"
    source = prepare_local_reader(path.read_text(encoding="utf-8"))
    old = "if(strtolower(trim((string)($u['email']??'')))!=='gabriel.guerra@juanpablo.com.mx'||!portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso restringido a pruebas.');}"
    new = "$admin=strtolower(trim((string)($u['email']??'')))==='gabriel.guerra@juanpablo.com.mx';\nif(!portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso no autorizado.');}"
    source = replace_once(source, old, new, "Dashboard role read-only access to expense")
    source = replace_once(
        source,
        "if($_SERVER['REQUEST_METHOD']==='POST'){",
        "if($_SERVER['REQUEST_METHOD']==='POST'){\n if(!$admin){http_response_code(403);exit('Solo administradores pueden actualizar.');}",
        "protect manual expense refresh",
    )
    source = replace_once(
        source,
        "if($mode==='admin'){",
        "if($mode==='admin'){if(!$admin){http_response_code(403);exit('Solo administradores.');}",
        "protect expense admin interface",
    )
    source = replace_once(
        source,
        "echo json_encode(egManifest(),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);",
        "$manifest=egManifest();$manifest['puedeActualizar']=$admin;echo json_encode($manifest,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);",
        "hide admin controls from regular readers",
    )
    write_file("egresos-excel.php", source)

def validate():
    index = (TARGET / "index.php").read_text(encoding="utf-8")
    graph = (TARGET / "graph.js").read_text(encoding="utf-8")
    app = (TARGET / "app.js").read_text(encoding="utf-8")
    assert "portal_user_can_tool('dashboard')" in index
    assert "Vista de pruebas restringida." not in index
    assert "cargarIngresosExcelHistorico" in graph
    assert "cargarEgresosExcel" in graph
    assert "obtenerIngresosSharePoint" not in graph
    assert "obtenerEgresosSharePoint" not in graph
    assert "dashboardExcelDirectoDatos" in app
    assert "const fechaSinZona = texto.match" in app
    assert "ingresos-historico.js" in index and "egresos-excel.js" in index
    assert "if(m.puedeActualizar)" in (TARGET / "egresos-excel.js").read_text(encoding="utf-8")
    assert "return JSON" not in index
    for name in FILES + SERVER_FILES + [".htaccess"]:
        if not (TARGET / name).is_file() or not (TARGET / name).stat().st_size:
            raise RuntimeError(f"Output missing: {name}")
    for name in ["ingresos-historico.php", "egresos-excel.php"]:
        if "is_file(__DIR__.'/.dashboard-local-ready')" not in (TARGET / name).read_text(encoding="utf-8"):
            raise RuntimeError(f"Dashboard should stay on legacy reader until activated: {name}")
    if "Require all denied" not in (TARGET / ".htaccess").read_text(encoding="utf-8"):
        raise RuntimeError("The financial-data protection rules are missing.")

def main():
    if not SOURCE.is_dir():
        raise RuntimeError("Archived audited pilot snapshot not found")
    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True)
    for name in FILES:
        source = SOURCE / name
        if not source.is_file():
            raise RuntimeError(f"Snapshot file missing: {name}")
        shutil.copy2(source, TARGET / name)
    add_server_components()
    build_frontend()
    build_expense_javascript()
    build_income_endpoint()
    build_expense_endpoint()
    validate()
    print(f"Excel direct production candidate prepared, {len(FILES) + len(SERVER_FILES) + 1} files. No deployment performed.")

if __name__ == "__main__":
    main()
