from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "deploy"


def require_file(path: Path) -> None:
    if not path.is_file():
        raise RuntimeError(f"No se encontro el archivo requerido: {path}")


def require_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"No se encontro el bloque esperado para: {label}")
    return text.replace(old, new, 1)


def reset_target() -> None:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.mkdir(parents=True, exist_ok=True)


def copy_runtime_files() -> None:
    names = [
        "app.js",
        "auth.js",
        "config.js",
        "graph.js",
        "styles.css",
        "portal-integration.css",
        "account-menu.css",
        "dashboard-role-access.css",
        "dashboard-role-access.js",
        "kpi-fit.js",
    ]

    for name in names:
        require_file(ROOT / name)
        shutil.copy2(ROOT / name, TARGET / name)


def build_config() -> None:
    path = TARGET / "config.js"
    source = path.read_text(encoding="utf-8")
    old = 'redirectUri: "https://meguesa.github.io/Dashboard-Direccion/"'
    new = 'redirectUri: "https://portal.juanpablo.com.mx/dashboard/"'
    source = require_replace(source, old, new, "redirect URI del Dashboard")
    path.write_text(source, encoding="utf-8")


def build_auth() -> None:
    path = TARGET / "auth.js"
    source = path.read_text(encoding="utf-8")

    old_init = '''  const cuentas = msalInstance.getAllAccounts();

  if (cuentas.length > 0) {
    currentAccount = cuentas[0];
  
    mostrarDashboard();
    setAuthStatus(`Sesión activa: ${currentAccount.username}`);
    actualizarEstadoLogin(`Sesión activa: ${currentAccount.username}`);
    mostrarUsuario(currentAccount.username);
  
    if (typeof window.actualizarDatosDashboard === "function") {
      await window.actualizarDatosDashboard({
        mensaje: "Cargando información inicial desde SharePoint..."
      });
    }
  } else {
    currentAccount = null;

    mostrarLogin();
    actualizarEstadoLogin("Sin sesión iniciada.");
    mostrarUsuario("No conectado");
  }

  configurarBotonesAuth();'''

    new_init = '''  const redirectResponse = await msalInstance.handleRedirectPromise();

  if (redirectResponse && redirectResponse.account) {
    currentAccount = redirectResponse.account;
  }

  const cuentas = msalInstance.getAllAccounts();

  if (!currentAccount && cuentas.length > 0) {
    currentAccount = cuentas[0];
  }

  if (currentAccount) {
    mostrarDashboard();
    setAuthStatus(`Sesión activa: ${currentAccount.username}`);
    actualizarEstadoLogin(`Sesión activa: ${currentAccount.username}`);
    mostrarUsuario(currentAccount.username);

    const dashboardAuthorized = typeof window.configurarAccesoDashboardDesdeCuenta === "function"
      ? window.configurarAccesoDashboardDesdeCuenta(currentAccount, currentAccount.idTokenClaims)
      : true;

    if (!dashboardAuthorized) {
      configurarBotonesAuth();
      return;
    }

    if (typeof window.actualizarDatosDashboard === "function") {
      await window.actualizarDatosDashboard({
        mensaje: window.cacheCargadoDashboard
          ? "Actualizando solo información reciente desde SharePoint..."
          : "Cargando información inicial desde SharePoint...",
        modoCarga: window.cacheCargadoDashboard ? "incremental" : "completa"
      });
    }
  } else {
    currentAccount = null;
    mostrarLogin();
    actualizarEstadoLogin("Conectando con Microsoft 365...");
    mostrarUsuario(window.PORTAL_USER_EMAIL || "No conectado");
    configurarBotonesAuth();

    await msalInstance.loginRedirect({
      ...loginRequest,
      loginHint: window.PORTAL_USER_EMAIL || undefined
    });
    return;
  }

  configurarBotonesAuth();'''

    source = require_replace(source, old_init, new_init, "inicio automatico de sesion")

    source, replacements = re.subn(
        r"async function logoutMicrosoft\(\) \{.*?\n\}\n\n",
        'async function logoutMicrosoft() {\n  window.location.assign("/logout.php");\n}\n\n',
        source,
        count=1,
        flags=re.S,
    )
    if replacements != 1:
        raise RuntimeError("No se encontro logoutMicrosoft() esperado")

    path.write_text(source, encoding="utf-8")


def build_app() -> None:
    path = TARGET / "app.js"
    source = path.read_text(encoding="utf-8")

    source = require_replace(
        source,
        'const DASHBOARD_CACHE_KEY = "dashboardDireccionUltimosDatos";',
        '''const DASHBOARD_CACHE_KEY_BASE = "dashboardDireccionUltimosDatos";
const DASHBOARD_CACHE_VERSION = 2;

function obtenerDashboardCacheKey() {
  const usuario = String(window.PORTAL_USER_EMAIL || "anonimo")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, "_");

  return `${DASHBOARD_CACHE_KEY_BASE}:v${DASHBOARD_CACHE_VERSION}:${usuario}`;
}

const DASHBOARD_CACHE_KEY = obtenerDashboardCacheKey();''',
        "cache por usuario",
    )

    source = require_replace(
        source,
        '''  seleccionarMesActual();

  cargarSelectorAnios();''',
        '''  // Si existe cache valida, conserva el ultimo periodo visualizado.
  // Solo las instalaciones sin cache arrancan en el mes local actual.
  if (!cacheCargadoDashboard) {
    seleccionarMesActual();
  }

  window.cacheCargadoDashboard = cacheCargadoDashboard;

  cargarSelectorAnios();''',
        "conservar ultimo periodo visualizado",
    )

    source = require_replace(
        source,
        '''      state.mesSeleccionado = state.mesFinSeleccionado;

      cargarSelectorAnios();
      cargarSelectorMeses();
      renderDashboard();''',
        '''      state.mesSeleccionado = state.mesFinSeleccionado;

      cargarSelectorAnios();
      cargarSelectorMeses();
      guardarDatosEnCache();
      renderDashboard();''',
        "guardar cambio de anio",
    )

    source = source.replace(
        '''      cargarSelectorAnios();
      cargarSelectorMeses();
      renderDashboard();''',
        '''      cargarSelectorAnios();
      cargarSelectorMeses();
      guardarDatosEnCache();
      renderDashboard();''',
        3,
    )

    source = require_replace(
        source,
        '''    state.datos.parquePropiedades = datosSharePoint.parquePropiedades || [];

    cargarSelectorAnios();''',
        '''    if (modoCargaSolicitado === "completa" || !cacheCargadoDashboard) {
      state.datos.parquePropiedades = datosSharePoint.parquePropiedades || [];
      state.datos.marketing = datosSharePoint.marketing || [];
      state.datos.marketingMedios = datosSharePoint.marketingMedios || [];
      state.datos.marketingRedes = datosSharePoint.marketingRedes || [];
    } else {
      if ((datosSharePoint.parquePropiedades || []).length > 0) {
        state.datos.parquePropiedades = datosSharePoint.parquePropiedades;
      }
      if ((datosSharePoint.marketing || []).length > 0) {
        state.datos.marketing = datosSharePoint.marketing;
      }
      if ((datosSharePoint.marketingMedios || []).length > 0) {
        state.datos.marketingMedios = datosSharePoint.marketingMedios;
      }
      if ((datosSharePoint.marketingRedes || []).length > 0) {
        state.datos.marketingRedes = datosSharePoint.marketingRedes;
      }
    }

    cargarSelectorAnios();''',
        "preservar fuentes no mensuales en incremental",
    )

    source = require_replace(
        source,
        '''    guardarDatosEnCache();
    cacheCargadoDashboard = true;

    renderDashboard();''',
        '''    guardarDatosEnCache();
    cacheCargadoDashboard = true;
    window.cacheCargadoDashboard = true;

    renderDashboard();''',
        "publicar estado de cache",
    )

    path.write_text(source, encoding="utf-8")


def build_graph() -> None:
    path = TARGET / "graph.js"
    source = path.read_text(encoding="utf-8")

    source = require_replace(
        source,
        '''    const marketing = await obtenerMarketingSharePoint();
    const marketingMedios = await obtenerMarketingMediosSharePoint();
    const marketingRedes = await obtenerMarketingRedesSharePoint();''',
        '''    const marketing = modoCarga === "completa" ? await obtenerMarketingSharePoint() : [];
    const marketingMedios = modoCarga === "completa" ? await obtenerMarketingMediosSharePoint() : [];
    const marketingRedes = modoCarga === "completa" ? await obtenerMarketingRedesSharePoint() : [];''',
        "evitar historia completa de marketing",
    )

    source = require_replace(
        source,
        '''    const parquePropiedades = await obtenerParquePropiedadesSharePoint();''',
        '''    const parquePropiedades = modoCarga === "completa"
      ? await obtenerParquePropiedadesSharePoint()
      : [];''',
        "evitar recarga completa de parque",
    )

    path.write_text(source, encoding="utf-8")


def build_index() -> None:
    source = (ROOT / "index.html").read_text(encoding="utf-8")

    source = require_replace(
        source,
        "<title>Centro de Control Dirección</title>",
        "<title>Dashboard de Dirección | Portal Interno JdJP</title>",
        "titulo",
    )

    source = require_replace(
        source,
        '<link rel="stylesheet" href="styles.css?v=20260804-3" />',
        '<link rel="stylesheet" href="styles.css?v=20260804-3" />\n'
        '  <link rel="stylesheet" href="portal-integration.css?v=20260823-5" />\n'
        '  <link rel="stylesheet" href="account-menu.css?v=20260823-2" />\n'
        '  <link rel="stylesheet" href="dashboard-role-access.css?v=20260823-2" />',
        "estilos propios de integracion",
    )

    user_menu_start = source.find("          <!-- Usuario -->")
    notifications_start = source.find("          <!-- Notificaciones -->", user_menu_start)
    if user_menu_start == -1 or notifications_start == -1:
        raise RuntimeError("No se encontro el menu interno de usuario del Dashboard")

    source = (
        source[:user_menu_start]
        + "          <!-- Cuenta administrada desde el encabezado del Portal Interno -->\n\n"
        + source[notifications_start:]
    )

    app_script = '''  <script
    id="dashboardAppScript"
    src="app.js?v=20260804-3"
  ></script>'''

    source = require_replace(
        source,
        app_script,
        '''  <script
    id="dashboardAppScript"
    src="app.js?v=20260823-2"
  ></script>
  <script src="kpi-fit.js?v=20260823-3"></script>
  <script src="dashboard-role-access.js?v=20260823-2"></script>''',
        "control de acceso por rol y ajuste de KPIs",
    )

    source = source.replace('src="graph.js?v=20260804-3"', 'src="graph.js?v=20260823-2"', 1)

    toolbar = '''<body class="dashboard-portal-page">
  <nav class="dashboard-portal-toolbar" aria-label="Navegación del Portal Interno">
    <div class="dashboard-portal-toolbar-inner">
      <div class="dashboard-portal-title">
        <div class="dashboard-portal-title-text">
          <strong>Dashboard de Dirección</strong>
          <span>Portal Interno JdJP · Jardines de Juan Pablo</span>
        </div>
      </div>

      <div class="dashboard-portal-actions">
        <a class="dashboard-portal-back" href="/">Regresar al portal</a>
        <details class="account-menu">
          <summary class="account-trigger" aria-label="Abrir menú de usuario" title="<?= $name ?>">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="4" fill="currentColor" />
              <path d="M4 20c0-4.1 3.6-6 8-6s8 1.9 8 6v1H4z" fill="currentColor" />
            </svg>
          </summary>
          <div class="account-menu-panel">
            <div class="account-menu-info">
              <strong><?= $name ?></strong>
              <span><?= $email ?></span>
            </div>
            <a class="account-menu-logout" href="/logout.php">Cerrar sesión</a>
          </div>
        </details>
      </div>
    </div>
  </nav>
  <script>window.PORTAL_USER_EMAIL = <?= json_encode($email, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>;</script>'''

    source = require_replace(source, "<body>", toolbar, "barra superior")

    php = '''<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/bootstrap.php';
portal_require_authentication();

$user = portal_user();
$name = htmlspecialchars((string) ($user['name'] ?? 'Usuario'), ENT_QUOTES, 'UTF-8');
$email = htmlspecialchars((string) ($user['email'] ?? ''), ENT_QUOTES, 'UTF-8');
?>
'''

    (TARGET / "index.php").write_text(php + source, encoding="utf-8")


def main() -> None:
    reset_target()
    copy_runtime_files()
    build_config()
    build_auth()
    build_app()
    build_graph()
    build_index()
    print("Dashboard de Direccion preparado autonomamente para /dashboard/")


if __name__ == "__main__":
    main()
