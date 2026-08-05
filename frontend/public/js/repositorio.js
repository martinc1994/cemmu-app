// ═══════════════════════════════════════════════════════════
// repositorio.js — Lógica de búsqueda, consulta y descarga
// ═══════════════════════════════════════════════════════════

const token = localStorage.getItem('cemmu_token');
const userData = localStorage.getItem('cemmu_user');

if (!token || !userData) {
  window.location.href = '/login';
}

const user = JSON.parse(userData || '{}');

// Control de navegación y perfil del usuario
const userTextEl = document.getElementById('repoUserText');
const btnVolverEl = document.getElementById('btnVolver');

if (user.username) {
  const orgText = user.organization ? ` (${user.organization})` : '';
  userTextEl.textContent = `${user.username}${orgText}`;
}

if (user.role === 'externo') {
  btnVolverEl.style.display = 'none'; // Restringido para externos
}

// Mostrar botón de upload si es operador o admin
if (user.role === 'operador' || user.role === 'admin') {
  document.getElementById('btnUploadNav').style.display = 'inline-block';
}

function openProfileModal() {
  document.getElementById('profUsername').textContent = user.username || '—';
  document.getElementById('profFullName').textContent = user.full_name || '—';
  document.getElementById('profOrg').textContent = user.organization || 'CeMMU';
  
  const roleEl = document.getElementById('profRole');
  const roleNames = {
    'admin': 'Administrador',
    'operador': 'Operador',
    'externo': 'Externo'
  };
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

// Nombres legibles para cámaras
const camaraNames = {
  'frontal': '📹 Frontal (calle)',
  'escalera': '🪜 Escalera ascenso',
  'chofer': '🚘 Asiento chofer',
  'interior': '🚍 Fondo interior'
};

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
    showToast('Error de conexión', 'error');
  }
}

function renderGrid(evidencias) {
  const grid = document.getElementById('evidenceGrid');
  grid.innerHTML = '';

  if (!evidencias || evidencias.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--color-text-muted);">
        <p style="font-size: 2.5rem; margin-bottom: 10px;">📂</p>
        <p style="font-size: 1.1rem; font-weight: 600;">No se encontraron registros de evidencia</p>
        <p style="font-size: 0.85rem;">Ajustá los filtros de búsqueda o cargá nuevos registros.</p>
      </div>`;
    return;
  }

  evidencias.forEach(item => {
    const fechaEv = new Date(item.fecha_evento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const sizeMb = (item.tamano_bytes / (1024 * 1024)).toFixed(1);
    const shortHash = item.checksum_sha256 ? item.checksum_sha256.slice(0, 12) + '...' : 'N/A';

    const card = document.createElement('div');
    card.className = 'evidence-card';
    card.innerHTML = `
      <div>
        <div class="card-header">
          <div>
            <div class="card-title">${item.linea} — Int ${item.interno}</div>
            <div class="card-subtitle">Fecha Evento: ${fechaEv} ${item.hora_evento || ''}</div>
          </div>
          <span class="cam-badge">${camaraNames[item.camara] || item.camara}</span>
        </div>

        ${item.expediente ? `
          <div class="card-expediente">
            <span>⚖️ Exp: <strong>${item.expediente}</strong></span>
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">${item.organismo_solicitante || ''}</span>
          </div>` : ''
      }

        <div class="card-body">
          ${item.descripcion}
        </div>

        <div class="card-meta">
          <span>📁 ${item.nombre_archivo_original}</span>
          <span>💾 ${sizeMb} MB</span>
        </div>

        <div class="integrity-indicator">
          <span>🛡️ Checksum SHA-256: <code>${shortHash}</code></span>
        </div>
      </div>

      <div class="card-actions">
        <button class="btn-action btn-download" onclick="directDownload(${item.id})">📥 Descargar</button>
        ${(user.role === 'operador' || user.role === 'admin') ? `
          <button class="btn-action btn-share" onclick="openShareModal(${item.id})">🔗 Compartir</button>` : ''
      }
        ${user.role === 'admin' ? `
          <button class="btn-action btn-delete-card" onclick="deleteEvidence(${item.id})">🗑️</button>` : ''
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
// Descarga Directa & Compartir
// ═══════════════════════════════════════════════════════════

/**
 * Descarga directa: genera un token temporal en caliente y descarga el archivo streameado
 */
async function directDownload(evidenceId) {
  try {
    showToast('⏳ Preparando descarga desencriptada...');

    // 1. Generar token
    const tokenRes = await fetch(`/api/evidencia/${evidenceId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ expires_hours: 1, max_downloads: 1 })
    });

    const tokenJson = await tokenRes.json();
    if (!tokenJson.ok) {
      showToast(tokenJson.error || 'Error al autorizar descarga', 'error');
      return;
    }

    // 2. Descargar usando el token con JWT (doble verificación)
    const downloadUrl = `/api/evidencia/download/${tokenJson.data.token}`;
    const fileRes = await fetch(downloadUrl, { headers: authHeaders() });

    if (!fileRes.ok) {
      showToast('Error al descargar archivo', 'error');
      return;
    }

    // 3. Disparar guardado de archivo en browser
    const blob = await fileRes.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = tokenJson.data.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);

    showToast('✅ Descarga completada');

  } catch (e) {
    showToast('Error en el proceso de descarga', 'error');
  }
}

// Modal de compartir link
let currentShareToken = '';

function openShareModal(evidenceId) {
  document.getElementById('shareEvidenceId').value = evidenceId;
  document.getElementById('generatedLinkBox').style.display = 'none';
  document.getElementById('btnCopyLink').style.display = 'none';
  document.getElementById('btnGenerateToken').style.display = 'inline-block';
  document.getElementById('shareModal').classList.add('active');
}

function closeShareModal() {
  document.getElementById('shareModal').classList.remove('active');
}

async function generateToken() {
  const evidenceId = document.getElementById('shareEvidenceId').value;
  const expires_hours = document.getElementById('shareHours').value;
  const max_downloads = document.getElementById('shareMaxDownloads').value;

  try {
    const res = await fetch(`/api/evidencia/${evidenceId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ expires_hours, max_downloads })
    });

    const json = await res.json();
    if (json.ok) {
      const fullUrl = `${window.location.origin}${json.data.download_url}`;
      currentShareToken = fullUrl;

      const linkBox = document.getElementById('generatedLinkBox');
      linkBox.textContent = fullUrl;
      linkBox.style.display = 'block';

      document.getElementById('btnGenerateToken').style.display = 'none';
      document.getElementById('btnCopyLink').style.display = 'inline-block';
      showToast('✅ Enlace generado');
    } else {
      showToast(json.error || 'Error al generar enlace', 'error');
    }
  } catch (e) {
    showToast('Error al generar enlace', 'error');
  }
}

function copyLink() {
  if (currentShareToken) {
    navigator.clipboard.writeText(currentShareToken);
    showToast('📋 Link copiado al portapapeles');
  }
}

async function deleteEvidence(id) {
  if (!confirm('¿Eliminar esta evidencia? El archivo se desactivará.')) return;

  try {
    const res = await fetch(`/api/evidencia/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const json = await res.json();

    if (json.ok) {
      showToast('Evidencia eliminada');
      loadEvidencias(currentPage);
    } else {
      showToast(json.error, 'error');
    }
  } catch (e) {
    showToast('Error al eliminar', 'error');
  }
}

// Init
loadEvidencias(1);
