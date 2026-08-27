// ═══════════════════════════════════════════════════════════
// repositorio.js — Lógica de repositorio, solicitudes y descargas
// ═══════════════════════════════════════════════════════════

const token = localStorage.getItem('cemmu_token');
const userData = localStorage.getItem('cemmu_user');

if (!token || !userData) {
  window.location.href = '/login';
}

const user = JSON.parse(userData || '{}');

// Elementos de cabecera
const userTextEl = document.getElementById('repoUserText');
const btnVolverEl = document.getElementById('btnVolver');
const btnUploadNav = document.getElementById('btnUploadNav');
const btnNuevaSolicitud = document.getElementById('btnNuevaSolicitud');
const btnMisSolicitudes = document.getElementById('btnMisSolicitudes');
const btnSolicitudesPendientes = document.getElementById('btnSolicitudesPendientes');
const btnHistorialCargas = document.getElementById('btnHistorialCargas');

if (user.username) {
  const orgText = user.organization ? ` (${user.organization})` : '';
  userTextEl.textContent = `${user.username}${orgText}`;
}

// Configurar visibilidad según Rol
if (user.role === 'externo') {
  btnVolverEl.style.display = 'none'; // Restringido para externos
  btnNuevaSolicitud.style.display = 'inline-block';
  btnMisSolicitudes.style.display = 'inline-block';
} else if (user.role === 'operador' || user.role === 'admin') {
  btnUploadNav.style.display = 'inline-block';
  btnSolicitudesPendientes.style.display = 'inline-block';
  if (btnHistorialCargas) btnHistorialCargas.style.display = 'inline-block';
  fetchPendingSolicitudesCount();
}

function openProfileModal() {
  document.getElementById('profUsername').textContent = user.username || '—';
  document.getElementById('profFullName').textContent = user.full_name || '—';
  document.getElementById('profOrg').textContent = user.organization || 'CeMMU';

  const roleEl = document.getElementById('profRole');
  const roleNames = { 'admin': 'Administrador', 'operador': 'Operador', 'externo': 'Externo' };
  roleEl.textContent = roleNames[user.role] || user.role;
  roleEl.className = 'badge';
  if (user.role === 'admin') roleEl.classList.add('badge-admin');
  else if (user.role === 'operador') roleEl.classList.add('badge-operator');
  else roleEl.classList.add('badge-external');

  document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('active');
}

function logout() {
  localStorage.removeItem('cemmu_user');
  localStorage.removeItem('cemmu_token');
  window.location.href = '/login';
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

let currentPage = 1;
let totalPages = 1;

const camaraNames = {
  'frontal': 'Frontal (calle)',
  'escalera': 'Escalera ascenso',
  'chofer': 'Asiento chofer',
  'interior': 'Fondo interior'
};

// ═══════════════════════════════════════════════════════════
// CARGAR REPOSITORIO DE EVIDENCIAS
// ═══════════════════════════════════════════════════════════
async function loadEvidencias(page = 1) {
  currentPage = page;
  const linea = document.getElementById('filterLinea').value.trim();
  const interno = document.getElementById('filterInterno').value.trim();
  const camara = document.getElementById('filterCamara').value;
  const expediente = document.getElementById('filterExpediente').value.trim();
  const fecha_desde = document.getElementById('filterDesde').value;
  const fecha_hasta = document.getElementById('filterHasta').value;

  let url = `/api/evidencia?page=${page}&limit=12`;
  if (linea) url += `&linea=${encodeURIComponent(linea)}`;
  if (interno) url += `&interno=${encodeURIComponent(interno)}`;
  if (camara) url += `&camara=${encodeURIComponent(camara)}`;
  if (expediente) url += `&expediente=${encodeURIComponent(expediente)}`;
  if (fecha_desde) url += `&fecha_desde=${fecha_desde}`;
  if (fecha_hasta) url += `&fecha_hasta=${fecha_hasta}`;

  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login';
      return;
    }
    const json = await res.json();

    if (!json.ok) {
      showToast(json.error || 'Error al cargar repositorio', 'error');
      return;
    }

    renderGrid(json.data);
    renderPagination(json.pagination);

  } catch (e) {
    showToast('Error de conexión con el servidor', 'error');
  }
}

function renderGrid(evidencias) {
  const grid = document.getElementById('evidenceGrid');
  grid.innerHTML = '';

  if (!evidencias || evidencias.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--color-text-muted);">
        <p style="font-size: 2.5rem; margin-bottom: 10px;">📂</p>
        <p style="font-size: 1.1rem; font-weight: 600;">No se encontraron imágenes o registros fílmicos</p>
        <p style="font-size: 0.85rem;">Si necesitás material fílmico, podés enviar una Solicitud formal usando el botón superior.</p>
      </div>`;
    return;
  }

  evidencias.forEach(item => {
    const fechaEv = new Date(item.fecha_evento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const sizeMb = (item.tamano_bytes / (1024 * 1024)).toFixed(1);
    const shortHash = item.checksum_sha256 ? item.checksum_sha256.slice(0, 12) + '...' : 'N/A';

    // Limpiar caracteres extraños en el nombre de archivo si fuera necesario
    let cleanFileName = item.nombre_archivo_original || 'Archivo';
    try {
      if (cleanFileName.includes('Ã')) {
        cleanFileName = decodeURIComponent(escape(cleanFileName));
      }
    } catch (e) { }

    const card = document.createElement('div');
    card.className = 'evidence-card';
    card.innerHTML = `
      <div>
        <!-- Fila Superior: Badge ID y Cámara -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="background: rgba(59, 130, 246, 0.12); color: var(--color-primary); border: 1px solid rgba(59, 130, 246, 0.25); padding: 3px 10px; border-radius: 12px; font-weight: 700; font-size: 0.78rem;">
            ID: ${item.id}
          </span>
          <span class="cam-badge">${camaraNames[item.camara] || item.camara}</span>
        </div>

        <!-- Título Principal (Línea e Interno) -->
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--color-text); margin-bottom: 4px; line-height: 1.3;">
          ${item.linea} — Interno ${item.interno}
        </div>

        <!-- Fecha y Hora -->
        <div style="font-size: 0.82rem; color: var(--color-text-muted); display: flex; gap: 12px; align-items: center; margin-bottom: 14px;">
          <span>📅 Evento: <strong>${fechaEv}</strong></span>
          ${item.hora_evento ? `<span>🕒 <strong>${item.hora_evento}</strong></span>` : ''}
        </div>

        <!-- Bloque de Expediente u Organismo Solicitante -->
        ${item.expediente ? `
          <div style="background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 0.86rem; font-weight: 700; color: var(--color-text); display: flex; align-items: center; gap: 6px;">
              <span>⚖️ Expediente:</span>
              <span style="color: var(--color-primary);">${item.expediente}</span>
            </div>
            ${item.organismo_solicitante ? `
              <div style="font-size: 0.78rem; color: var(--color-text-muted);">
                🏛️ Solicitante: <strong>${item.organismo_solicitante}</strong>
              </div>` : ''}
          </div>` : ''
      }

        <!-- Descripción del Hecho -->
        ${item.descripcion ? `
          <div style="font-size: 0.85rem; color: var(--color-text); padding: 8px 12px; background: rgba(59, 130, 246, 0.04); border-left: 3px solid var(--color-primary); border-radius: 0 8px 8px 0; margin-bottom: 14px;">
            ${item.descripcion}
          </div>` : ''
      }

        <!-- Metadatos de Archivo y Checksum -->
        <div style="background: var(--color-bg); border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--color-text);" title="${cleanFileName}">📁 ${cleanFileName}</span>
            <span style="white-space: nowrap; color: var(--color-text-muted); font-size: 0.78rem;">💾 ${sizeMb} MB</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--color-primary); font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <span>🛡️ SHA-256:</span>
            <code style="background: rgba(59, 130, 246, 0.08); padding: 1px 6px; border-radius: 4px; font-family: monospace;">${shortHash}</code>
          </div>
        </div>
      </div>

      <!-- Botones de Acción -->
      <div class="card-actions" style="display: flex; gap: 8px; justify-content: flex-end;">
        <button class="btn-action btn-download" style="flex: 1; justify-content: center;" onclick="directDownload(${item.id})">📥 Descargar</button>
        ${(user.role === 'operador' || user.role === 'admin') ? `
          <button class="btn-action btn-share" style="flex: 1; justify-content: center;" onclick="openShareModal(${item.id})">🔗 Compartir</button>` : ''
      }
        ${user.role === 'admin' ? `
          <button class="btn-action btn-delete-card" style="padding: 8px 12px;" onclick="deleteEvidence(${item.id})">🗑️</button>` : ''
      }
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderPagination(pagination) {
  const controls = document.getElementById('paginationControls');
  if (!pagination || pagination.pages <= 1) {
    controls.style.display = 'none';
    return;
  }

  controls.style.display = 'flex';
  totalPages = pagination.pages;
  document.getElementById('pageInfo').textContent = `Página ${pagination.page} de ${pagination.pages} (${pagination.total} registros)`;
  document.getElementById('btnPrevPage').disabled = pagination.page <= 1;
  document.getElementById('btnNextPage').disabled = pagination.page >= pagination.pages;
}

function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    loadEvidencias(newPage);
  }
}

function clearFilters() {
  document.getElementById('filterLinea').value = '';
  document.getElementById('filterInterno').value = '';
  document.getElementById('filterCamara').value = '';
  document.getElementById('filterExpediente').value = '';
  document.getElementById('filterDesde').value = '';
  document.getElementById('filterHasta').value = '';
  loadEvidencias(1);
}

// ═══════════════════════════════════════════════════════════
// VISUALIZACIÓN / DESCARGA AUTORIZADA DE INSTRUMENTO LEGAL
// ═══════════════════════════════════════════════════════════
async function viewInstrumentoLegal(e, solicitudId) {
  if (e) e.preventDefault();
  try {
    showToast('⏳ Abriendo documento legal...');

    const url = `/api/solicitudes/${solicitudId}/instrumento`;
    const fileRes = await fetch(url, { headers: authHeaders() });

    if (!fileRes.ok) {
      const errJson = await fileRes.json().catch(() => ({}));
      showToast(errJson.error || 'Error al obtener el documento legal', 'error');
      return;
    }

    const blob = await fileRes.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const win = window.open(blobUrl, '_blank');
    if (!win) {
      // Si el navegador bloqueó la ventana emergente, forzar descarga directa
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `instrumento_solicitud_${solicitudId}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

  } catch (err) {
    showToast('Error al procesar el documento legal', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// DESCARGA DIRECTA DE EVIDENCIA (AUTORIZADA POR JWT)
// ═══════════════════════════════════════════════════════════
async function directDownload(evidenceId) {
  try {
    showToast('⏳ Preparando descarga desencriptada...');

    const downloadUrl = `/api/evidencia/${evidenceId}/descargar`;
    const fileRes = await fetch(downloadUrl, { headers: authHeaders() });

    if (!fileRes.ok) {
      const errJson = await fileRes.json().catch(() => ({}));
      showToast(errJson.error || 'Error al autorizar descarga', 'error');
      return;
    }

    // Extraer nombre original de la cabecera Content-Disposition
    const disposition = fileRes.headers.get('Content-Disposition');
    let filename = `evidencia_${evidenceId}.bin`;
    if (disposition && disposition.includes('filename=')) {
      const matches = disposition.match(/filename="?([^";]+)"?/);
      if (matches && matches[1]) {
        filename = decodeURIComponent(matches[1]);
      }
    }

    const blob = await fileRes.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);

    showToast('✅ Descarga completada');

  } catch (e) {
    showToast('Error en el proceso de descarga', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// COMPARTIR EVIDENCIA CON USUARIOS ESPECÍFICOS DE ORGANIZACIÓN
// ═══════════════════════════════════════════════════════════
let selectedEvidenceForShare = null;
let currentOrgUsersList = [];

async function openShareModal(evidenceId) {
  selectedEvidenceForShare = evidenceId;
  document.getElementById('shareEvidenceId').value = evidenceId;
  document.getElementById('shareNotes').value = '';
  
  const orgSelect = document.getElementById('shareOrgSelect');
  orgSelect.innerHTML = '<option value="">Cargando organizaciones...</option>';
  document.getElementById('shareUsersContainer').innerHTML = '<p style="font-size: 0.82rem; color: var(--color-text-muted); margin: 0;">Selecciona una organización para cargar los usuarios.</p>';

  try {
    const res = await fetch('/api/usuarios/organizaciones', { headers: authHeaders() });
    const json = await res.json();

    if (json.ok && Array.isArray(json.data)) {
      let options = '<option value="">-- Seleccionar Organización --</option>';
      json.data.forEach(org => {
        options += `<option value="${org.nombre}">${org.nombre} (${org.tipo})</option>`;
      });
      orgSelect.innerHTML = options;
    }
  } catch (e) {
    orgSelect.innerHTML = '<option value="">Error al cargar organizaciones</option>';
  }

  document.getElementById('shareModal').classList.add('active');
}

function closeShareModal() {
  document.getElementById('shareModal').classList.remove('active');
}

async function onShareOrgChange() {
  const orgName = document.getElementById('shareOrgSelect').value;
  const container = document.getElementById('shareUsersContainer');

  if (!orgName) {
    container.innerHTML = '<p style="font-size: 0.82rem; color: var(--color-text-muted); margin: 0;">Selecciona una organización para cargar los usuarios.</p>';
    return;
  }

  container.innerHTML = '<p style="font-size: 0.82rem; color: var(--color-text-muted); margin: 0;">⏳ Buscando usuarios de ' + orgName + '...</p>';

  try {
    const res = await fetch(`/api/usuarios?organization=${encodeURIComponent(orgName)}`, { headers: authHeaders() });
    const json = await res.json();

    if (json.ok && Array.isArray(json.data)) {
      currentOrgUsersList = json.data;

      if (json.data.length === 0) {
        container.innerHTML = `<p style="font-size: 0.82rem; color: var(--color-warning); margin: 0;">Sin usuarios individuales cargados. El archivo digital se compartirá a nivel de organización general.</p>`;
        return;
      }

      let html = `
        <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.85rem; padding-bottom: 6px; border-bottom: 1px dashed var(--color-border); margin-bottom: 6px; cursor: pointer;">
          <input type="checkbox" id="chkSelectAllUsers" onchange="toggleSelectAllUsers(this.checked)">
          <span>[ Seleccionar Todos los usuarios de ${orgName} ]</span>
        </label>
      `;

      json.data.forEach(u => {
        const fullNameStr = u.full_name ? ` (${u.full_name})` : '';
        html += `
          <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; padding: 4px 0; cursor: pointer;">
            <input type="checkbox" class="chk-share-user" value="${u.id}">
            <span>👤 <strong>${u.username}</strong>${fullNameStr}</span>
          </label>
        `;
      });

      container.innerHTML = html;
    }
  } catch (e) {
    container.innerHTML = '<p style="font-size: 0.82rem; color: var(--color-danger); margin: 0;">Error al cargar usuarios.</p>';
  }
}

function toggleSelectAllUsers(checked) {
  const checkboxes = document.querySelectorAll('.chk-share-user');
  checkboxes.forEach(chk => chk.checked = checked);
}

async function submitShareDirect() {
  const evidenceId = document.getElementById('shareEvidenceId').value;
  const target_org = document.getElementById('shareOrgSelect').value;
  const notes = document.getElementById('shareNotes').value.trim();

  if (!target_org) {
    showToast('Seleccioná una organización de destino', 'error');
    return;
  }

  const userCheckboxes = document.querySelectorAll('.chk-share-user:checked');
  const target_user_ids = Array.from(userCheckboxes).map(chk => parseInt(chk.value));

  try {
    const res = await fetch(`/api/evidencia/${evidenceId}/compartir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ target_org, target_user_ids, notes })
    });

    const json = await res.json();
    if (json.ok) {
      showToast('✅ Archivo digital compartido correctamente');
      closeShareModal();
    } else {
      showToast(json.error || 'Error al compartir archivo digital', 'error');
    }
  } catch (e) {
    showToast('Error al procesar la compartición', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// GESTIÓN DE SOLICITUDES DE EVIDENCIA
// ═══════════════════════════════════════════════════════════

function openNuevaSolicitudModal() {
  document.getElementById('formSolicitud').reset();
  document.getElementById('modalNuevaSolicitud').classList.add('active');
}

function closeNuevaSolicitudModal() {
  document.getElementById('modalNuevaSolicitud').classList.remove('active');
}

async function submitNuevaSolicitud(e) {
  e.preventDefault();

  const solFileInput = document.getElementById('solFile');
  if (!solFileInput.files || solFileInput.files.length === 0) {
    showToast('El archivo de Instrumento Legal es obligatorio', 'error');
    return;
  }

  const legalFile = solFileInput.files[0];
  if (legalFile.size > 3 * 1024 * 1024) {
    showToast('El instrumento legal supera el tamaño máximo permitido (3 MB)', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('instrumento_legal', legalFile);
  formData.append('linea', document.getElementById('solLinea').value.trim());
  formData.append('interno', document.getElementById('solInterno').value.trim());
  formData.append('camara', document.getElementById('solCamara').value);
  formData.append('fecha_evento', document.getElementById('solFecha').value);
  formData.append('hora_aproximada', document.getElementById('solHora').value || '');
  formData.append('expediente', document.getElementById('solExpediente').value.trim());
  formData.append('motivo', document.getElementById('solMotivo').value.trim());
  formData.append('prioridad', document.getElementById('solPrioridad').value);

  try {
    const res = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const json = await res.json();
    if (json.ok) {
      showToast('✅ Solicitud enviada exitosamente con instrumento legal adjunto');
      closeNuevaSolicitudModal();
      if (user.role === 'externo') {
        openListaSolicitudesModal();
      }
    } else {
      showToast(json.error || 'Error al enviar solicitud', 'error');
    }
  } catch (err) {
    showToast('Error de conexión al enviar solicitud', 'error');
  }
}

async function fetchPendingSolicitudesCount() {
  try {
    const res = await fetch('/api/solicitudes?estado=PENDIENTE', { headers: authHeaders() });
    const json = await res.json();
    if (json.ok && Array.isArray(json.data)) {
      const badge = document.getElementById('solicitudesBadge');
      if (badge) badge.textContent = json.data.length;
    }
  } catch (e) { }
}

async function openListaSolicitudesModal() {
  const container = document.getElementById('solicitudesListContainer');
  container.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.9rem;">⏳ Cargando solicitudes y repositorio...</p>';

  document.getElementById('modalListaSolicitudes').classList.add('active');

  try {
    const res = await fetch('/api/solicitudes', { headers: authHeaders() });
    const json = await res.json();

    if (!json.ok || !Array.isArray(json.data)) {
      container.innerHTML = '<p style="color: var(--color-danger);">Error al obtener solicitudes.</p>';
      return;
    }

    if (json.data.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--color-text-muted);">
          <p style="font-size: 2rem; margin-bottom: 5px;">📋</p>
          <p style="font-size: 1rem; font-weight: 600;">No hay solicitudes registradas</p>
        </div>`;
      return;
    }

    // Obtener evidencias para el desplegable del operador
    let availableEvidencias = [];
    if (user.role === 'operador' || user.role === 'admin') {
      try {
        const evRes = await fetch('/api/evidencia?limit=100', { headers: authHeaders() });
        const evJson = await evRes.json();
        if (evJson.ok && Array.isArray(evJson.data)) {
          availableEvidencias = evJson.data;
        }
      } catch (e) { }
    }

    let html = '';
    json.data.forEach(sol => {
      const fechaEv = new Date(sol.fecha_evento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const fechaCreacion = new Date(sol.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      let badgeColor = '#f59e0b'; // PENDIENTE
      if (sol.estado === 'COMPLETADA') badgeColor = '#10b981';
      else if (sol.estado === 'RECHAZADA') badgeColor = '#ef4444';
      else if (sol.estado === 'EN_PROCESO') badgeColor = '#3b82f6';

      // Construir opciones del selector de evidencia para el operador
      let evOptions = '<option value="">-- Sin archivo vinculado / Solo Nota --</option>';
      availableEvidencias.forEach(ev => {
        const isSelected = (sol.evidencia_id === ev.id || (!sol.evidencia_id && ev.linea === sol.linea && ev.interno === sol.interno));
        const expStr = ev.expediente ? ` [Exp: ${ev.expediente}]` : '';
        evOptions += `<option value="${ev.id}" ${isSelected ? 'selected' : ''}>ID: ${ev.id} — ${ev.linea} Int ${ev.interno}${expStr} (${ev.nombre_archivo_original})</option>`;
      });

      html += `
        <div style="background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
            <div>
              <span style="font-size: 0.78rem; font-weight: 700; color: var(--color-text-muted);">SOLICITUD #${sol.id} — ${sol.organismo}</span>
              <h4 style="margin: 2px 0 0 0; font-size: 1.05rem;">⚖️ Exp: <strong>${sol.expediente}</strong> (${sol.linea} — Int ${sol.interno})</h4>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${sol.prioridad === 'URGENTE' ? '<span style="background: rgba(239,68,68,0.15); color:#ef4444; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">URGENTE</span>' : ''}
              <span style="background: ${badgeColor}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 700;">${sol.estado}</span>
            </div>
          </div>

          <div style="font-size: 0.88rem; color: var(--color-text);">
            <strong>Detalle de Petición:</strong> ${sol.motivo}
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px; font-size: 0.8rem; color: var(--color-text-muted); background: var(--color-card); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--color-border);">
            <span>📅 Evento: <strong>${fechaEv} ${sol.hora_aproximada || ''}</strong></span>
            <span>📹 Cámara: <strong>${camaraNames[sol.camara] || sol.camara}</strong></span>
            <span>👤 Solicitante: <strong>${sol.solicitante_username}</strong></span>
            <span>⏱️ Creada: <strong>${fechaCreacion}</strong></span>
          </div>

          ${sol.instrumento_archivo_original ? `
            <div style="margin-top: 2px;">
              <a href="/api/solicitudes/${sol.id}/instrumento?token=${encodeURIComponent(token)}" target="_blank" onclick="viewInstrumentoLegal(event, ${sol.id})" style="color: var(--color-primary); font-size: 0.84rem; font-weight: 600; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">
                📄 Ver / Descargar Instrumento Legal Adjunto (${sol.instrumento_archivo_original})
              </a>
            </div>` : ''}

          ${sol.respuesta_notas ? `
            <div style="font-size: 0.85rem; background: rgba(59,130,246,0.08); padding: 8px 12px; border-radius: 8px; border-left: 3px solid var(--color-primary);">
              <strong>Respuesta del Operador:</strong> ${sol.respuesta_notas}
            </div>` : ''}

          <!-- Botón de Descarga para el usuario solicitante si la solicitud está COMPLETADA -->
          ${(sol.estado === 'COMPLETADA' && sol.evidencia_id) ? `
            <div style="margin-top: 8px; background: rgba(59, 130, 246, 0.05); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.15); display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 0.78rem; color: var(--color-text-muted);">
                <span>⏳ Disponible hasta: <strong>${sol.expires_at ? new Date(sol.expires_at).toLocaleDateString('es-AR') : '30 días'}</strong></span>
                <span>📥 Descargas: <strong>${sol.downloads_count || 0} / ${sol.max_downloads || 4}</strong></span>
                <button style="background: none; border: none; color: var(--color-primary); cursor: pointer; text-decoration: underline; font-weight: 700; padding: 0; font-size: 0.78rem;" onclick="openInfoTerminosModal()">ℹ️ Términos de Uso</button>
              </div>
              <button class="btn-action btn-download" style="padding: 8px 16px; justify-content: center;" onclick="directDownload(${sol.evidencia_id})">
                📥 Descargar Archivo Digital Adjunto (${sol.nombre_archivo_original || 'Archivo'})
              </button>
            </div>` : ''}

          <!-- Panel de Respuesta para Operadores/Admins -->
          ${(user.role === 'operador' || user.role === 'admin') ? `
            <div style="border-top: 1px dashed var(--color-border); padding-top: 10px; margin-top: 5px; display: flex; flex-direction: column; gap: 8px;">
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-primary);">⚙️ Gestionar Solicitud (Operador)</span>
              
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: grid; grid-template-columns: 140px 180px 1fr; gap: 8px;">
                  <select id="solRespState-${sol.id}" style="padding: 8px; font-size: 0.85rem; border-radius: 6px;">
                    <option value="COMPLETADA" ${sol.estado === 'COMPLETADA' ? 'selected' : ''}>COMPLETADA</option>
                    <option value="EN_PROCESO" ${sol.estado === 'EN_PROCESO' ? 'selected' : ''}>EN PROCESO</option>
                    <option value="RECHAZADA" ${sol.estado === 'RECHAZADA' ? 'selected' : ''}>RECHAZADA</option>
                  </select>

                  <input type="number" id="solRespEvId-${sol.id}" placeholder="ID Registro (Ej: 20261000)" value="${sol.evidencia_id || ''}" style="padding: 8px; font-size: 0.85rem; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text);" />

                  <input type="text" id="solRespNotas-${sol.id}" placeholder="Notas de respuesta para el usuario..." value="${sol.respuesta_notas || ''}" style="padding: 8px; font-size: 0.85rem; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text);" />
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                <button class="btn-filter" style="padding: 8px 16px; font-size: 0.85rem;" onclick="submitResponderSolicitud(${sol.id})">✔ Guardar Respuesta</button>
              </div>
            </div>` : ''}
        </div>
      `;
    });

    container.innerHTML = html;

  } catch (e) {
    container.innerHTML = '<p style="color: var(--color-danger);">Error de conexión al cargar solicitudes.</p>';
  }
}

function closeListaSolicitudesModal() {
  document.getElementById('modalListaSolicitudes').classList.remove('active');
}

async function submitResponderSolicitud(solicitudId) {
  const estado = document.getElementById(`solRespState-${solicitudId}`).value;
  const evidencia_id = document.getElementById(`solRespEvId-${solicitudId}`).value.trim();
  const respuesta_notas = document.getElementById(`solRespNotas-${solicitudId}`).value.trim();

  try {
    const res = await fetch(`/api/solicitudes/${solicitudId}/responder`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ estado, evidencia_id, respuesta_notas })
    });

    const json = await res.json();
    if (json.ok) {
      showToast('✅ Solicitud actualizada');
      openListaSolicitudesModal();
      fetchPendingSolicitudesCount();
      loadEvidencias(currentPage);
    } else {
      showToast(json.error || 'Error al responder solicitud', 'error');
    }
  } catch (e) {
    showToast('Error al conectar con el servidor', 'error');
  }
}

async function deleteEvidence(id) {
  if (!confirm('¿Eliminar este archivo digital? El registro se desactivará.')) return;

  try {
    const res = await fetch(`/api/evidencia/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const json = await res.json();

    if (json.ok) {
      showToast('Archivo digital eliminado');
      loadEvidencias(currentPage);
    } else {
      showToast(json.error, 'error');
    }
  } catch (e) {
    showToast('Error al eliminar', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// GESTIÓN DE HISTORIAL DE CARGAS (OPERADORES Y ADMIN)
// ═══════════════════════════════════════════════════════════
async function openHistorialCargasModal() {
  const modal = document.getElementById('modalHistorialCargas');
  const container = document.getElementById('historialCargasList');
  modal.classList.add('active');

  try {
    container.innerHTML = '<p style="font-size: 0.85rem; color: var(--color-text-muted);">⏳ Cargando registro de cargas...</p>';
    const res = await fetch('/api/evidencia/historial', { headers: authHeaders() });
    const json = await res.json();

    if (json.ok && Array.isArray(json.data)) {
      if (json.data.length === 0) {
        container.innerHTML = '<p style="font-size: 0.85rem; color: var(--color-text-muted);">Sin registros de cargas encontradas.</p>';
        return;
      }

      let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; color: var(--color-text);">
          <thead>
            <tr style="border-bottom: 2px solid var(--color-border); text-align: left; background: var(--color-bg);">
              <th style="padding: 8px;">ID</th>
              <th style="padding: 8px;">Línea / Int.</th>
              <th style="padding: 8px;">Archivo Original</th>
              <th style="padding: 8px;">Subido por</th>
              <th style="padding: 8px;">Fecha Carga</th>
              <th style="padding: 8px;">SHA-256</th>
              <th style="padding: 8px;">Estado</th>
            </tr>
          </thead>
          <tbody>
      `;

      json.data.forEach(item => {
        const fechaCarga = new Date(item.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const shortHash = item.checksum_sha256 ? item.checksum_sha256.substring(0, 10) + '...' : '—';
        const isDeleted = item.status === 'deleted';
        const statusBadge = isDeleted
          ? `<span style="background: rgba(239,68,68,0.12); color: #ef4444; padding: 2px 6px; border-radius: 4px; font-weight: bold;">DELETED</span>`
          : `<span style="background: rgba(16,185,129,0.12); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: bold;">ACTIVE</span>`;

        html += `
          <tr style="border-bottom: 1px solid var(--color-border); ${isDeleted ? 'opacity: 0.65; background: rgba(239,68,68,0.03);' : ''}">
            <td style="padding: 8px; font-weight: bold; color: var(--color-primary);">#${item.id}</td>
            <td style="padding: 8px;">${item.linea} — Int. ${item.interno}</td>
            <td style="padding: 8px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.nombre_archivo_original}">📁 ${item.nombre_archivo_original}</td>
            <td style="padding: 8px;">👤 ${item.uploader_username || 'Operador'}</td>
            <td style="padding: 8px;">${fechaCarga}</td>
            <td style="padding: 8px; font-family: monospace; font-size: 0.75rem;">${shortHash}</td>
            <td style="padding: 8px;">${statusBadge}</td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    } else {
      container.innerHTML = `<p style="font-size: 0.85rem; color: var(--color-danger);">${json.error || 'Error al obtener el historial.'}</p>`;
    }

  } catch (e) {
    container.innerHTML = '<p style="font-size: 0.85rem; color: var(--color-danger);">Error de conexión al cargar el registro.</p>';
  }
}

function closeHistorialCargasModal() {
  document.getElementById('modalHistorialCargas').classList.remove('active');
}

function openInfoTerminosModal() {
  document.getElementById('modalInfoTerminos').classList.add('active');
}

function closeInfoTerminosModal() {
  document.getElementById('modalInfoTerminos').classList.remove('active');
}

// Init
loadEvidencias(1);
