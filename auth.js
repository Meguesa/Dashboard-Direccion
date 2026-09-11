const msalConfig = {
  auth: {
    clientId: CONFIG.microsoft.clientId,
    authority: `https://login.microsoftonline.com/${CONFIG.microsoft.tenantId}`,
    redirectUri: CONFIG.microsoft.redirectUri
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false
  }
};

const loginRequest = {
  scopes: [
    "User.Read",
    "Sites.Read.All"
  ]
};

const graphRequest = {
  scopes: [
    "Sites.Read.All"
  ]
};

let msalInstance = null;
let currentAccount = null;
let graphAccessToken = null;
let graphAccessTokenExpiresAt = 0;
let graphTokenPromise = null;
const GRAPH_REDIRECT_GUARD = "dashboardGraphRedirectAttempted";

function registrarGraphTokenRespuesta(response) {
  if (!response || !response.accessToken) {
    return false;
  }

  graphAccessToken = response.accessToken;

  const expiresOn = response.expiresOn instanceof Date
    ? response.expiresOn.getTime()
    : Date.now() + (45 * 60 * 1000);

  graphAccessTokenExpiresAt = expiresOn;

  try {
    sessionStorage.removeItem(GRAPH_REDIRECT_GUARD);
  } catch (_) {}

  return true;
}

function graphTokenEnMemoriaValido() {
  return Boolean(
    graphAccessToken &&
    graphAccessTokenExpiresAt > Date.now() + 120000
  );
}

async function cargarComparativoInteranual() {
  if (typeof window.instalarComparativoInteranualDashboard === "function") {
    window.instalarComparativoInteranualDashboard();
    return;
  }

  await new Promise((resolve) => {
    const scriptExistente = document.getElementById("dashboardYoyComparisonScript");

    if (scriptExistente) {
      if (typeof window.instalarComparativoInteranualDashboard === "function") {
        window.instalarComparativoInteranualDashboard();
        resolve();
        return;
      }

      scriptExistente.addEventListener("load", resolve, { once: true });
      scriptExistente.addEventListener("error", resolve, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "dashboardYoyComparisonScript";
    script.src = "dashboard-yoy-comparison.js?v=20260910-2";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      console.warn("No se pudo cargar el comparativo interanual.");
      resolve();
    };

    document.head.appendChild(script);
  });

  if (typeof window.instalarComparativoInteranualDashboard === "function") {
    window.instalarComparativoInteranualDashboard();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await cargarComparativoInteranual();
  inicializarAuth();
});

async function inicializarAuth() {
  if (typeof msal === "undefined") {
    console.error("MSAL no está cargado.");
    actualizarEstadoLogin("Error: MSAL no está cargado.");
    mostrarLogin();
    return;
  }

  msalInstance = new msal.PublicClientApplication(msalConfig);

  const cuentas = msalInstance.getAllAccounts();

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

  configurarBotonesAuth();
}

function configurarBotonesAuth() {
  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");

  if (loginButton) {
    loginButton.addEventListener("click", loginMicrosoft);
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logoutMicrosoft);
  }
}

async function loginMicrosoft() {
  try {
    actualizarEstadoLogin("Iniciando sesión con Microsoft...");

    await msalInstance.loginRedirect({
      ...loginRequest,
      loginHint: window.PORTAL_USER_EMAIL || undefined
    });
  } catch (error) {
    console.error("Error en login:", error);
    actualizarEstadoLogin("Error al iniciar sesión con Microsoft.");
    setAuthStatus("Error al iniciar sesión con Microsoft.");
  }
}

async function logoutMicrosoft() {
  try {
    if (!currentAccount) {
      mostrarLogin();
      actualizarEstadoLogin("Sin sesión iniciada.");
      return;
    }

    await msalInstance.logoutPopup({
      account: currentAccount
    });

    currentAccount = null;
    graphAccessToken = null;
    graphAccessTokenExpiresAt = 0;

    mostrarLogin();
    setAuthStatus("Sin sesión iniciada.");
    actualizarEstadoLogin("Sin sesión iniciada.");
    mostrarUsuario("No conectado");
  } catch (error) {
    console.error("Error en logout:", error);
    setAuthStatus("Error al cerrar sesión.");
    actualizarEstadoLogin("Error al cerrar sesión.");
  }
}

async function obtenerAccessToken() {
  if (!msalInstance) {
    throw new Error("MSAL no está inicializado.");
  }

  if (graphTokenEnMemoriaValido()) {
    return graphAccessToken;
  }

  if (!currentAccount) {
    const cuentas = msalInstance.getAllAccounts();

    if (cuentas.length === 0) {
      throw new Error("No hay sesión activa.");
    }

    currentAccount = cuentas[0];
  }

  if (graphTokenPromise) {
    return graphTokenPromise;
  }

  graphTokenPromise = (async () => {
    try {
      const response = await msalInstance.acquireTokenSilent({
        ...graphRequest,
        account: currentAccount
      });

      registrarGraphTokenRespuesta(response);
      return response.accessToken;
    } catch (error) {
      console.warn(
        "No se pudo obtener token silencioso. Se usará redirección segura de Microsoft.",
        error
      );

      let redirectYaIntentado = false;
      try {
        redirectYaIntentado = sessionStorage.getItem(GRAPH_REDIRECT_GUARD) === "1";
      } catch (_) {}

      if (redirectYaIntentado) {
        try {
          sessionStorage.removeItem(GRAPH_REDIRECT_GUARD);
        } catch (_) {}
        throw new Error(
          "Microsoft no pudo completar la autorización de SharePoint después de la redirección. " +
          "Revisa el consentimiento de Sites.Read.All y la Redirect URI de la aplicación."
        );
      }

      try {
        sessionStorage.setItem(GRAPH_REDIRECT_GUARD, "1");
      } catch (_) {}

      setAuthStatus("Renovando autorización de Microsoft 365...");

      try {
        await msalInstance.acquireTokenRedirect({
          ...graphRequest,
          account: currentAccount,
          loginHint: currentAccount?.username || window.PORTAL_USER_EMAIL || undefined
        });
      } catch (redirectError) {
        try {
          sessionStorage.removeItem(GRAPH_REDIRECT_GUARD);
        } catch (_) {}
        throw redirectError;
      }

      // acquireTokenRedirect navega fuera de la página. Esta promesa evita que
      // las llamadas Graph continúen con un token nulo antes de la navegación.
      return await new Promise(() => {});
    }
  })();

  try {
    return await graphTokenPromise;
  } finally {
    graphTokenPromise = null;
  }
}

function setAuthStatus(message) {
  const element = document.getElementById("authStatus");

  if (element) {
    element.textContent = message;
  }
}

function mostrarUsuario(username) {
  const element = document.getElementById("userName");

  if (element) {
    element.textContent = username;
  }
}

function mostrarLogin() {
  const loginPage = document.getElementById("loginPage");
  const dashboardPage = document.getElementById("dashboardPage");

  if (loginPage) {
    loginPage.classList.remove("hidden");
  }

  if (dashboardPage) {
    dashboardPage.classList.add("hidden");
  }
}

function mostrarDashboard() {
  const loginPage = document.getElementById("loginPage");
  const dashboardPage = document.getElementById("dashboardPage");

  if (loginPage) {
    loginPage.classList.add("hidden");
  }

  if (dashboardPage) {
    dashboardPage.classList.remove("hidden");
  }
}

function actualizarEstadoLogin(message) {
  const element = document.getElementById("loginStatus");

  if (element) {
    element.textContent = message;
  }
}