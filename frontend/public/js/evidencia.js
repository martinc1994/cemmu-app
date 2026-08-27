// ═══════════════════════════════════════════════════════════
// evidencia.js — Lógica de carga de imágenes / registros fílmicos
// ═══════════════════════════════════════════════════════════

const token = localStorage.getItem('cemmu_token');
const userData = localStorage.getItem('cemmu_user');

if (!token || !userData) {
  window.location.href = '/login';
}

const user = JSON.parse(userData || '{}');

// Solo operador o admin pueden acceder a esta página
if (user.role !== 'operador' && user.role !== 'admin') {
  window.location.href = '/repositorio';
}

const toast = document.getElementById("toast");
function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function authHeaders() {
  return { 'Authorization': `Bearer ${token}` };
}

// Set fecha por defecto
document.getElementById('fecha_evento').value = new Date().toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════
// CARGAR ORGANIZACIONES Y USUARIOS DINÁMICOS
// ═══════════════════════════════════════════════════════════
async function loadOrganizationsForUpload() {
  const orgSelect = document.getElementById('organismo_solicitante');
  try {
    const res = await fetch('/api/usuarios/organizaciones', { headers: authHeaders() });
    const json = await res.json();

    if (json.ok && Array.isArray(json.data)) {
      let options = '<option value="">-- Seleccionar Organización Destino --</option>';
      json.data.forEach(org => {
        options += `<option value="${org.nombre}">${org.nombre} (${org.tipo})</option>`;
      });
      orgSelect.innerHTML = options;
    }
  } catch (e) {
    orgSelect.innerHTML = '<option value="">Error al cargar organizaciones</option>';
  }
}

async function onUploadOrgChange() {
  const orgName = document.getElementById('organismo_solicitante').value;
  const userWrapper = document.getElementById('targetUserWrapper');
  const userSelect = document.getElementById('target_user_id');

  if (!orgName) {
    userWrapper.style.display = 'none';
    userSelect.innerHTML = '<option value="">-- Todos los usuarios de esta Organización --</option>';
    return;
  }

  userSelect.innerHTML = '<option value="">⏳ Cargando usuarios de ' + orgName + '...</option>';
  userWrapper.style.display = 'block';

  try {
    const res = await fetch(`/api/usuarios?organization=${encodeURIComponent(orgName)}`, { headers: authHeaders() });
    const json = await res.json();

    if (json.ok && Array.isArray(json.data)) {
      let options = `<option value="">-- Todos los usuarios de ${orgName} --</option>`;
      json.data.forEach(u => {
        const fullNameStr = u.full_name ? ` (${u.full_name})` : '';
        options += `<option value="${u.id}">👤 ${u.username}${fullNameStr}</option>`;
      });
      userSelect.innerHTML = options;
    } else {
      userSelect.innerHTML = `<option value="">-- Todos los usuarios de ${orgName} --</option>`;
    }
  } catch (e) {
    userSelect.innerHTML = `<option value="">-- Todos los usuarios de ${orgName} --</option>`;
  }
}

loadOrganizationsForUpload();

// File drag & drop logic
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
let selectedFile = null;

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFileSelect(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFileSelect(fileInput.files[0]);
  }
});

function handleFileSelect(file) {
  // Validar tamaño max 50MB
  if (file.size > 50 * 1024 * 1024) {
    showToast('El archivo supera los 50MB permitidos', 'error');
    return;
  }

  selectedFile = file;
  fileName.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  filePreview.style.display = 'flex';
  dropZone.style.display = 'none';
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.style.display = 'none';
  dropZone.style.display = 'block';
}

// Submit con XMLHttpRequest para barra de progreso
document.getElementById('evidenciaForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedFile) {
    showToast('Debés seleccionar un archivo de video o registro fílmico', 'error');
    return;
  }

  const orgSelected = document.getElementById('organismo_solicitante').value;
  if (!orgSelected) {
    showToast('Seleccioná la Organización Destino', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('archivo', selectedFile);
  formData.append('linea', document.getElementById('linea').value);
  formData.append('interno', document.getElementById('interno').value);

  const camaras = document.getElementsByName('camara');
  let selectedCamara = 'frontal';
  for (const c of camaras) {
    if (c.checked) { selectedCamara = c.value; break; }
  }
  formData.append('camara', selectedCamara);

  formData.append('fecha_evento', document.getElementById('fecha_evento').value);
  formData.append('hora_evento', document.getElementById('hora_evento').value);
  formData.append('expediente', document.getElementById('expediente').value.trim());
  formData.append('organismo_solicitante', orgSelected);
  formData.append('target_user_id', document.getElementById('target_user_id').value);
  formData.append('descripcion', document.getElementById('descripcion').value.trim());

  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const submitBtn = document.getElementById('submitBtn');

  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Encriptando y subiendo...';
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/evidencia/upload', true);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${percent}%`;
    }
  };

  xhr.onload = () => {
    submitBtn.disabled = false;
    submitBtn.textContent = '🔒 Cargar y Encriptar Registro Fílmico';
    progressContainer.style.display = 'none';

    if (xhr.status === 201) {
      const json = JSON.parse(xhr.responseText);
      showToast(`✅ Registro Fílmico encriptado y asignado (SHA-256: ${json.data.checksum_sha256.slice(0, 8)}...)`);
      clearFile();
      document.getElementById('descripcion').value = '';
      document.getElementById('expediente').value = '';
      document.getElementById('interno').value = '';
      document.getElementById('organismo_solicitante').value = '';
      document.getElementById('targetUserWrapper').style.display = 'none';
    } else {
      let err = 'Error al subir registro fílmico';
      try {
        const json = JSON.parse(xhr.responseText);
        err = json.error || err;
      } catch (e) { }
      showToast(err, 'error');
    }
  };

  xhr.onerror = () => {
    submitBtn.disabled = false;
    submitBtn.textContent = '🔒 Cargar y Encriptar Registro Fílmico';
    progressContainer.style.display = 'none';
    showToast('Error de conexión con el servidor local', 'error');
  };

  xhr.send(formData);
});
