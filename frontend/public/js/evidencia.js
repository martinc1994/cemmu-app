// ═══════════════════════════════════════════════════════════
// evidencia.js — Lógica de carga de evidencia digital
// ═══════════════════════════════════════════════════════════

const token = localStorage.getItem('cemmu_token');
const userData = localStorage.getItem('cemmu_user');

if (!token || !userData) {
  window.location.href = '/login';
}

const user = JSON.parse(userData || '{}');

// Solo operator o admin pueden acceder a esta página
if (user.role !== 'operator' && user.role !== 'admin') {
  window.location.href = '/repositorio';
}

const toast = document.getElementById("toast");
function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// Set fecha por defecto
document.getElementById('fecha_evento').value = new Date().toISOString().slice(0, 10);

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
    showToast('Debés seleccionar un archivo de evidencia', 'error');
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
  formData.append('organismo_solicitante', document.getElementById('organismo_solicitante').value);
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
    submitBtn.textContent = '🔒 Cargar y Encriptar Evidencia';
    progressContainer.style.display = 'none';

    if (xhr.status === 201) {
      const json = JSON.parse(xhr.responseText);
      showToast(`✅ Evidencia cargada y encriptada (SHA-256: ${json.data.checksum_sha256.slice(0, 8)}...)`);
      clearFile();
      document.getElementById('descripcion').value = '';
      document.getElementById('expediente').value = '';
      document.getElementById('interno').value = '';
    } else {
      let err = 'Error al subir evidencia';
      try {
        const json = JSON.parse(xhr.responseText);
        err = json.error || err;
      } catch (e) { }
      showToast(err, 'error');
    }
  };

  xhr.onerror = () => {
    submitBtn.disabled = false;
    submitBtn.textContent = '🔒 Cargar y Encriptar Evidencia';
    progressContainer.style.display = 'none';
    showToast('Error de conexión con el servidor local', 'error');
  };

  xhr.send(formData);
});
