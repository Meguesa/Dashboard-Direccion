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

document.addEventListener("DOMContentLoaded", async () => {
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
      setAuthStatus("Sesión activa. Cargando información de SharePoint...");
      await window.actualizarDatosDashboard();
      setAuthStatus(`Sesión activa: ${currentAccount.username}`);
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

    const response = await msalInstance.loginPopup(loginRequest);

    currentAccount = response.account;

    mostrarDashboard();
    setAuthStatus(`Sesión activa: ${currentAccount.username}`);
    actualizarEstadoLogin(`Sesión activa: ${currentAccount.username}`);
    mostrarUsuario(currentAccount.username);

    console.log("Login correcto:", currentAccount);

    if (typeof window.actualizarDatosDashboard === "function") {
      setAuthStatus("Sesión activa. Cargando información de SharePoint...");
      await window.actualizarDatosDashboard();
      setAuthStatus(`Sesión activa: ${currentAccount.username}`);
    }
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

  if (!currentAccount) {
    const cuentas = msalInstance.getAllAccounts();

    if (cuentas.length === 0) {
      throw new Error("No hay sesión activa.");
    }

    currentAccount = cuentas[0];
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...graphRequest,
      account: currentAccount
    });

    return response.accessToken;
  } catch (error) {
    console.warn("No se pudo obtener token silencioso. Intentando popup.", error);

    const response = await msalInstance.acquireTokenPopup(graphRequest);
    return response.accessToken;
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
