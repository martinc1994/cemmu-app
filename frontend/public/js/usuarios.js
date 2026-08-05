// ═══════════════════════════════════════════════════════════
// usuarios.js — Lógica CRUD de usuarios y organizaciones
// ═══════════════════════════════════════════════════════════

// Auth check
const userData = localStorage.getItem('cemmu_user');
const token = localStorage.getItem('cemmu_token');
if (!userData || !token || JSON.parse(userData).role !== 'admin') {
  window.location.href = '/login';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

const toast = document.getElementById("toast");
function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

let organizaciones = [];

// ═══════════════════════════════════════════════════════════
// Cargar datos
// ═══════════════════════════════════════════════════════════

async function loadUsers() {
  try {
    const res = await fetch('/api/usuarios', { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return; }
    const json = await res.json();

    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    json.data.forEach(u => {
      const roleBadge = u.role === 'admin' ? 'badge-admin'
        : u.role === 'operador' ? 'badge-operator' : 'badge-external';
      const statusBadge = u.is_active ? 'badge-active' : 'badge-inactive';
      const lastLogin = u.last_login
        ? new Date(u.last_login).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Nunca';

      const roleNames = {
        'admin': 'Administrador',
        'operador': 'Operador',
        'externo': 'Externo'
      };
      const displayRole = roleNames[u.role] || u.role;

      tbody.innerHTML += `
        <tr>
          <td><strong>${u.username}</strong></td>
          <td>${u.full_name || '—'}</td>
          <td><span class="badge ${roleBadge}">${displayRole}</span></td>
          <td><strong>${u.organization || 'CeMMU'}</strong></td>
          <td><span class="badge ${statusBadge}">${u.is_active ? 'Activo' : 'Inactivo'}</span></td>
          <td style="font-size: 0.82rem; color: var(--color-text-muted);">${lastLogin}</td>
          <td style="min-width: 180px;">
            <button class="btn-small btn-edit" onclick="openEditModal(${u.id}, '${u.username}', '${u.full_name || ''}', '${u.email || ''}', '${u.role}', '${u.organization || 'CeMMU'}', ${u.is_active})">✏️ Edit</button>
            <button class="btn-small btn-reset" onclick="openResetModal(${u.id}, '${u.username}')">🔑 Clave</button>
            <button class="btn-small btn-delete" onclick="deleteUser(${u.id}, '${u.username}')">🗑️ Borrar</button>
          </td>
        </tr>`;
    });
  } catch (e) {
    showToast('Error cargando usuarios', 'error');
  }
}

async function loadOrganizaciones() {
  try {
    const res = await fetch('/api/usuarios/organizaciones', { headers: authHeaders() });
    const json = await res.json();
    organizaciones = json.data || [];

    // Poblar select de modal de usuario
    const select = document.getElementById('modalOrg');
    select.innerHTML = '';
    
    // Asegurar que CeMMU esté presente
    let hasCeMMU = false;
    organizaciones.forEach(o => {
      if (o.nombre === 'CeMMU') hasCeMMU = true;
      select.innerHTML += `<option value="${o.nombre}">${o.nombre} (${o.tipo})</option>`;
    });

    if (!hasCeMMU) {
      select.innerHTML = `<option value="CeMMU">CeMMU (Interno)</option>` + select.innerHTML;
    }

    // Renderizar tabla de organizaciones en modal de gestión
    renderOrgsTable();

  } catch (e) {
    console.error('Error cargando organizaciones:', e);
  }
}

function renderOrgsTable() {
  const tbody = document.getElementById('orgsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (organizaciones.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--color-text-muted);">No hay organizaciones registradas</td></tr>';
    return;
  }

  organizaciones.forEach(o => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${o.nombre}</strong></td>
        <td><span class="badge badge-operator">${o.tipo}</span></td>
        <td>${o.contacto || '—'}</td>
        <td><strong>${o.user_count || 0}</strong> usuarios</td>
        <td>
          ${o.nombre !== 'CeMMU' ? `<button class="btn-small btn-delete" onclick="deleteOrg(${o.id}, '${o.nombre}')">🗑️ Eliminar</button>` : '<span style="font-size:0.75rem; color:var(--color-text-muted);">Sistema</span>'}
        </td>
      </tr>`;
  });
}

// ═══════════════════════════════════════════════════════════
// Modales
// ═══════════════════════════════════════════════════════════

function openCreateModal() {
  document.getElementById('modalTitle').textContent = 'Nuevo Usuario';
  document.getElementById('editUserId').value = '';
  document.getElementById('modalUsername').value = '';
  document.getElementById('modalUsername').disabled = false;
  document.getElementById('modalFullName').value = '';
  document.getElementById('modalRole').value = 'operador';
  document.getElementById('modalOrg').value = 'CeMMU';
  document.getElementById('modalPassword').value = '';
  document.getElementById('passwordField').style.display = 'block';
  document.getElementById('userModal').classList.add('active');
}

function openEditModal(id, username, fullName, email, role, org, isActive) {
  document.getElementById('modalTitle').textContent = `Editar: ${username}`;
  document.getElementById('editUserId').value = id;
  document.getElementById('modalUsername').value = username;
  document.getElementById('modalUsername').disabled = true;
  document.getElementById('modalFullName').value = fullName;
  document.getElementById('modalEmail').value = email;
  document.getElementById('modalRole').value = role;
  document.getElementById('modalOrg').value = org || 'CeMMU';
  document.getElementById('passwordField').style.display = 'none';
  document.getElementById('userModal').classList.add('active');
}

function openManageOrgsModal() {
  loadOrganizaciones();
  document.getElementById('manageOrgsModal').classList.add('active');
}

function openCreateOrgModal() {
  document.getElementById('orgNombre').value = '';
  document.getElementById('orgTipo').value = 'MPF';
  document.getElementById('orgContacto').value = '';
  document.getElementById('createOrgModal').classList.add('active');
}

function openResetModal(id, username) {
  document.getElementById('resetUserId').value = id;
  document.getElementById('resetPassword').value = '';
  document.getElementById('resetModal').classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// ═══════════════════════════════════════════════════════════
// Acciones
// ═══════════════════════════════════════════════════════════

async function saveUser() {
  const editId = document.getElementById('editUserId').value;
  const payload = {
    username: document.getElementById('modalUsername').value.trim(),
    full_name: document.getElementById('modalFullName').value.trim(),
    email: document.getElementById('modalEmail').value.trim(),
    role: document.getElementById('modalRole').value,
    organization: document.getElementById('modalOrg').value || 'CeMMU',
  };

  if (!payload.username) {
    showToast('El nombre de usuario es obligatorio', 'error');
    return;
  }

  if (editId) {
    // Update
    try {
      const res = await fetch(`/api/usuarios/${editId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.ok) {
        showToast('Usuario actualizado');
        closeModal('userModal');
        loadUsers();
      } else {
        showToast(json.error, 'error');
      }
    } catch (e) { showToast('Error al actualizar', 'error'); }
  } else {
    // Create
    const password = document.getElementById('modalPassword').value.trim();
    if (!password) { showToast('La contraseña es obligatoria', 'error'); return; }
    payload.password = password;

    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.ok) {
        showToast('✅ Usuario creado exitosamente');
        closeModal('userModal');
        loadUsers();
      } else {
        showToast(json.error, 'error');
      }
    } catch (e) { showToast('Error al crear usuario', 'error'); }
  }
}

async function deleteUser(id, username) {
  if (!confirm(`¿Estás seguro de eliminar definitivamente al usuario "${username}" de la base de datos?`)) return;

  try {
    const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE', headers: authHeaders() });
    const json = await res.json();
    if (json.ok) {
      showToast('🗑️ Usuario eliminado definitivamente');
      loadUsers();
    } else {
      showToast(json.error, 'error');
    }
  } catch (e) { showToast('Error al eliminar usuario', 'error'); }
}

async function resetPassword() {
  const id = document.getElementById('resetUserId').value;
  const password = document.getElementById('resetPassword').value.trim();
  if (!password) { showToast('Ingresá una contraseña temporal', 'error'); return; }

  try {
    const res = await fetch(`/api/usuarios/${id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ reset_password: password })
    });
    const json = await res.json();
    if (json.ok) {
      showToast('✅ Contraseña reseteada. Se forzará cambio en próximo login.');
      closeModal('resetModal');
    } else {
      showToast(json.error, 'error');
    }
  } catch (e) { showToast('Error', 'error'); }
}

async function saveOrg() {
  const nombre = document.getElementById('orgNombre').value.trim();
  const tipo = document.getElementById('orgTipo').value;
  const contacto = document.getElementById('orgContacto').value.trim();

  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }

  try {
    const res = await fetch('/api/usuarios/organizaciones', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ nombre, tipo, contacto })
    });
    const json = await res.json();
    if (json.ok) {
      showToast('✅ Organización creada');
      closeModal('createOrgModal');
      loadOrganizaciones();
    } else {
      showToast(json.error, 'error');
    }
  } catch (e) { showToast('Error', 'error'); }
}

async function deleteOrg(id, nombre) {
  if (!confirm(`¿Estás seguro de eliminar definitivamente la organización "${nombre}" de la base de datos?`)) return;

  try {
    const res = await fetch(`/api/usuarios/organizaciones/${id}`, {
      method: 'DELETE', headers: authHeaders()
    });
    const json = await res.json();
    if (json.ok) {
      showToast('🗑️ Organización eliminada definitivamente');
      loadOrganizaciones();
    } else {
      showToast(json.error, 'error');
    }
  } catch (e) { showToast('Error al eliminar organización', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════
loadUsers();
loadOrganizaciones();
