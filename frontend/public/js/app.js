//JWT checked
const userDataString = localStorage.getItem('cemmu_user');
const token = localStorage.getItem('cemmu_token');
if (!userDataString || !token) {
  window.location.href = '/login';
}

const user = JSON.parse(userDataString || "{}");

if (user.role === 'externo') {
  window.location.href = '/repositorio';
}

const toast = document.getElementById("toast");

// Helper: headers con JWT
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function setToday() {
  const now = new Date();
  document.getElementById("fecha").value = now.toISOString().slice(0, 10);
}
setToday();

const operadorInput = document.getElementById("operadorLogin");
const direccionInput = document.getElementById("direccion");
const lineaInput = document.getElementById("linea");

window.addEventListener("DOMContentLoaded", () => {
  if (user.username) {
    operadorInput.value = user.username;
    document.getElementById('userInfo').innerText = "Conectado como: " + user.username + (user.organization ? ` (${user.organization})` : '');
    if (user.role === 'admin') {
      document.getElementById('adminBtn').style.display = 'inline-block';
      document.getElementById('usersBtn').style.display = 'inline-block';
    }
    if (user.role === 'admin' || user.role === 'operador') {
      document.getElementById('evidenciaBtn').style.display = 'inline-block';
    }
  }
  limpiarHistorialDiario();
  renderHistorial();
});

window.addEventListener("DOMContentLoaded", () => {
  const puntoGuardado = localStorage.getItem("puntoControl");
  const lineaGuardada = localStorage.getItem("linea");
  if (puntoGuardado) direccionInput.value = puntoGuardado;
  if (lineaGuardada) lineaInput.value = lineaGuardada;
});

direccionInput.addEventListener("change", () => {
  localStorage.setItem("puntoControl", direccionInput.value);
});
lineaInput.addEventListener("change", () => {
  localStorage.setItem("linea", lineaInput.value);
});

// local data history
function obtenerHistorial() {
  const data = localStorage.getItem("pasosDelDia");
  return data ? JSON.parse(data) : [];
}

function guardarHistorial(registro) {
  const historial = obtenerHistorial();
  historial.unshift(registro);
  if (historial.length > 20) historial.pop();
  localStorage.setItem("pasosDelDia", JSON.stringify(historial));
  renderHistorial();
}

function renderHistorial() {
  const lista = document.getElementById("historialLista");
  const historial = obtenerHistorial();
  lista.innerHTML = "";
  historial.forEach(p => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="histHora">${p.hora}</span>
      <span class="histLinea">${p.linea}</span>
      <span class="histInterno">Int ${p.interno}</span>
    `;
    lista.appendChild(li);
  });
}

// send form
document.getElementById("registroForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    fecha: document.getElementById("fecha").value,
    hora: document.getElementById("hora").value,
    direccion: direccionInput.value,
    linea: lineaInput.value,
    interno: document.getElementById("interno").value,
    operador: user.username,
    observaciones: document.getElementById("observaciones").value,
  };

  try {
    const response = await fetch('/api/registros', {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data), 
    });

    if (response.status === 401 || response.status === 403) {
      showToast("Sesión expirada, ingresá de nuevo", "error");
      setTimeout(() => { window.location.href = '/login'; }, 1500);
      return;
    }

    if (!response.ok) throw new Error("Error en petición");

    showToast("✅ Registro guardado correctamente");
    document.getElementById("hora").value = "";
    document.getElementById("interno").value = "";
    document.getElementById("observaciones").value = "";

    guardarHistorial({ hora: data.hora, linea: data.linea, interno: data.interno });

  } catch {
    showToast("❌ Error al guardar el registro", "error");
  }
});

function limpiarHistorialDiario() {
  const hoy = new Date().toISOString().slice(0, 10);
  const fechaGuardada = localStorage.getItem("fechaHistorial");
  if (fechaGuardada !== hoy) {
    localStorage.setItem("fechaHistorial", hoy);
    localStorage.removeItem("pasosDelDia");
  }
}