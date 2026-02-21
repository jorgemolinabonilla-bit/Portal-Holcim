// Main Logic Module - Holcim Portal de Seguridad
// Author: Holcim Security Team / Reconstructed by Antigravity
// Version: 3.1 - Database, Logout Fix & Auto-Permissions

document.addEventListener('DOMContentLoaded', function () {
    // --- INITIALIZATION ---
    const initializeData = (key, defaultVal) => {
        if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify(defaultVal));
        }
    };

    // Default Admin User
    const defaultAdmin = {
        email: 'admin@holcim.com',
        pass: 'admin123',
        site: 'CORPORATIVO',
        permissions: ['dashboard', 'reports', 'inductions', 'extra-auth', 'keys', 'packages', 'forms', 'database', 'settings']
    };

    initializeData('holcim_users', [defaultAdmin]);

    // Force update admin permissions in localStorage if they exist but are outdated
    let users = JSON.parse(localStorage.getItem('holcim_users') || '[]');
    let adminIdx = users.findIndex(u => u.email === defaultAdmin.email);
    if (adminIdx > -1) {
        // Ensure admin always has all permissions including 'database'
        users[adminIdx].permissions = defaultAdmin.permissions;
        localStorage.setItem('holcim_users', JSON.stringify(users));
    }

    const initialKeys = {
        1: "Portón 1, 2, 3", 2: "Portón 1 Lubricación", 3: "Portón 2 Horomil", 4: "Portón 3 Puzolana",
        5: "Portón GYM", 6: "Portón Caseta Principal", 7: "Portón Cefore y Auditorio", 8: "Comedor",
        9: "Quebrador Primario", 10: "Portón Cancha", 11: "Cefore", 12: "Auditorio",
        13: "Portón de Trailetas", 14: "Gimnasio", 15: "Biblioteca", 16: "Instituto Holcim",
        17: "Oficinas Nítidos", 18: "Vestidores", 19: "Puertas Caseta Principal", 20: "C.P. Sala Inducción / Sanitario",
        21: "C.P. Puerta Oficiales / Limpieza", 22: "Brazo Hidráulico", 23: "Servicio Caseta Principal", 24: "Portón de Silo Clinker",
        25: "Portón de Morado", 26: "Portón del Parqueo", 27: "Bodega de Agua Caseta Sur", 28: "Llaves Viejas Cefore",
        29: "CEPAL", 30: "Báscula", 31: "Carter Horomil", 32: "Portón Kiosko Parqueo Log.",
        33: "Cadena Parqueo Logístico", 34: "Cadena Entrada Kiosko", 35: "Cuarto Lubricación Horno", 36: "Llaves de Roldanas",
        37: "Portón Este Almacén Cepal", 38: "Puzolana", 39: "Bomba Lourdes", 40: "Bomba de Dulce Nombre",
        41: "Proveeduría", 42: "Almacén CEPAL", 43: "Dispensario", 44: "Subestación",
        45: "Logística / Kiosko", 46: "Planta Eléctrica Administrativo", 47: "Edificio Administrativo", 48: "Oficina T.I.",
        49: "Oficina Sala de Control", 50: "Cuarto Eléctrico", 51: "Bodega Torre – Geocycle", 52: "Despacho Interno",
        53: "Tool Room", 54: "Taller Lubricación", 55: "Caudalímetro", 56: "Lab. Cuarto Chiller",
        57: "Bomba de Agua Cuarto Chiller", 58: "Agujas / Control Doping", 59: "Mina / J01-411", 60: "Supervisores 111-414",
        61: "Toyota Land Cruiser 191-141", 62: "Kia 111-413", 63: "Suzuki", 64: "Minas Externas",
        65: "Almacén", 66: "Sala Servidores", 67: "Pickup Gris HYS", 68: "Montacargas Pequeño",
        69: "Compresores", 70: "Oficina Mant. Mec", 71: "Silo Clinker", 72: "Silo 10",
        73: "Montacarga Grande", 74: "Asegrupo Holcim", 75: "Taller CEPAL", 76: "Polvorín",
        77: "Sistema de agua potable", 78: "Caseta sur", 79: "Grupo Rio", 80: "Westerial",
        81: "Fabrica de bolsas", 82: "Ridara", 83: "Suzuki"
    };

    const keysArray = Object.entries(initialKeys).map(([num, name]) => ({ num: parseInt(num), name, status: 'OPERATIVA' }));

    initializeData('holcim_inventory_keys', keysArray);
    initializeData('holcim_personnel_directory', []);
    initializeData('holcim_access_logs', []);
    initializeData('holcim_extra_auths', []);
    initializeData('holcim_key_loans', []);
    initializeData('holcim_event_log', []);
    initializeData('holcim_inductions', []);
    initializeData('holcim_audit_log', []);
    initializeData('holcim_security_officers', []);
    initializeData('holcim_contact_directory', []);

    const getSession = () => JSON.parse(localStorage.getItem('holcim_session'));
    const setSession = (data) => localStorage.setItem('holcim_session', JSON.stringify(data));

    // --- GLOBAL UTILITIES ---
    window.showNotification = function (message, type = 'info') {
        const banner = document.createElement('div');
        banner.className = `alert-banner alert-${type}`;
        banner.style.position = 'fixed'; banner.style.top = '20px'; banner.style.right = '20px'; banner.style.zIndex = '100002';
        banner.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i><span>${message}</span>`;
        document.body.appendChild(banner);
        setTimeout(() => { banner.style.opacity = '0'; banner.style.transform = 'translateY(-10px)'; banner.style.transition = 'all 0.3s ease'; setTimeout(() => banner.remove(), 300); }, 3000);
    };

    window.addLogEvent = function (module, description) {
        const log = JSON.parse(localStorage.getItem('holcim_event_log') || '[]');
        const user = getSession() || { email: 'SISTEMA@holcim.com' };
        log.unshift({ timestamp: new Date().toLocaleString(), user: user.email.split('@')[0], module: module, description: description });
        localStorage.setItem('holcim_event_log', JSON.stringify(log.slice(0, 50)));
        if (document.getElementById('live-event-log')) renderLiveLog();
    };

    window.addAuditLog = function (module, recordId, field, oldValue, newValue) {
        const log = JSON.parse(localStorage.getItem('holcim_audit_log') || '[]');
        const user = (typeof getSession === 'function' ? getSession() : null) || { email: 'SISTEMA@holcim.com' };
        log.unshift({ timestamp: new Date().toLocaleString(), user: user.email, module: module, recordId: recordId, field: field, oldValue: oldValue || '-', newValue: newValue || '-' });
        localStorage.setItem('holcim_audit_log', JSON.stringify(log));
    };

    // --- TSE INTEGRATION ---
    async function lookupTSE(id) {
        const cleanedId = id.replace(/-/g, '');
        if (cleanedId.length < 9) return;
        const indicator = document.getElementById('lookup-indicator');
        if (indicator) indicator.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--primary-teal)"></i>';
        try {
            const res = await fetch(`https://api.hacienda.go.cr/fe/ae?identificacion=${cleanedId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.nombre) {
                    const nameInput = document.getElementById('fullName');
                    if (nameInput) { nameInput.value = data.nombre; showNotification('DATOS TSE SINCRONIZADOS', 'success'); }
                }
            }
        } catch (e) { console.error('TSE Lookup Fail:', e); } finally { if (indicator) indicator.innerHTML = ''; }
    }

    const idInput = document.getElementById('idNumber');
    if (idInput) {
        idInput.addEventListener('blur', function () {
            const id = this.value.trim();
            if (!id) return;
            lookupTSE(id);

            // Induction Check
            const inductions = JSON.parse(localStorage.getItem('holcim_inductions') || '[]');
            const ind = inductions.find(i => i.idNumber === id);
            const now = new Date().toISOString().split('T')[0];

            const alertBox = document.getElementById('induction-alert-box');
            if (ind) {
                const isExpired = ind.expiry < now;
                if (isExpired) {
                    showNotification(`INDUCCIÓN VENCIDA (Expiró: ${ind.expiry})`, 'danger');
                    if (alertBox) {
                        alertBox.innerHTML = `
                            <div class="pulsing-alert alert-danger-light">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-exclamation-circle"></i>
                                    <div>
                                        <strong style="display: block; font-size: 0.8rem;">INDUCCIÓN VENCIDA (${ind.expiry})</strong>
                                        <span style="font-size: 0.7rem; font-weight: 400;">Trámite obligatorio antes del ingreso.</span>
                                    </div>
                                </div>
                            </div>`;
                        alertBox.style.display = 'block';
                    }
                } else {
                    showNotification(`INDUCCIÓN VIGENTE (Vence: ${ind.expiry})`, 'success');
                    if (alertBox) {
                        alertBox.innerHTML = `
                            <div class="pulsing-alert alert-success-light">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-check-circle"></i>
                                    <div>
                                        <strong style="display: block; font-size: 0.8rem;">INDUCCIÓN VIGENTE (Vence: ${ind.expiry})</strong>
                                        <span style="font-size: 0.7rem; font-weight: 400;">Acceso permitido para ${ind.fullName}.</span>
                                    </div>
                                </div>
                            </div>`;
                        alertBox.style.display = 'block';
                    }
                }
            } else {
                showNotification('SIN REGISTRO DE INDUCCIÓN', 'warning');
                if (alertBox) {
                    alertBox.innerHTML = `
                        <div class="pulsing-alert alert-danger-light">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-user-clock"></i>
                                <div>
                                    <strong style="display: block; font-size: 0.8rem;">SIN REGISTRO DE INDUCCIÓN</strong>
                                    <span style="font-size: 0.7rem; font-weight: 400;">Debe realizar la inducción de seguridad.</span>
                                </div>
                            </div>
                        </div>`;
                    alertBox.style.display = 'block';
                }
            }

            // Auto-fill company based on last entry
            const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
            const lastEntry = logs.find(l => l.idNumber === id);
            if (lastEntry) {
                const companyInput = document.getElementById('company');
                if (companyInput && !companyInput.value) {
                    companyInput.value = lastEntry.company;
                    showNotification('EMPRESA VINCULADA AUTOMÁTICAMENTE', 'info');
                }
            }
        });
    }

    const typeSelect = document.getElementById('visitorType');
    if (typeSelect) {
        typeSelect.addEventListener('change', function () {
            const reasonSelect = document.getElementById('reason');
            if (!reasonSelect) return;

            const mapping = {
                'VISITANTE': 'REUNION',
                'PROVEEDOR': 'ENTREGA',
                'CONTRATISTA': 'TRABAJAR'
            };

            if (mapping[this.value]) {
                reasonSelect.value = mapping[this.value];
            }
        });
    }

    window.switchDbTab = function (tabId, btn) {
        // Toggle tabs
        document.querySelectorAll('.db-tab-content').forEach(tab => {
            tab.style.display = tab.id === tabId ? 'block' : 'none';
        });
        // Toggle button states
        document.querySelectorAll('.db-tab-btn').forEach(b => {
            b.classList.remove('active');
            b.style.opacity = '0.7';
            b.style.transform = 'scale(0.95)';
        });
        btn.classList.add('active');
        btn.style.opacity = '1';
        btn.style.transform = 'scale(1)';

        // Explicitly render contents for the active tab
        if (tabId === 'keys-tab') renderDbKeys();
        if (tabId === 'personnel-tab') renderDbPersonnel();
        if (tabId === 'officers-tab') renderDbOfficers();
        if (tabId === 'contact-tab') renderDbContacts();
    };

    // --- NAVIGATION ---
    window.switchView = function (viewId) {
        const navLinks = document.querySelectorAll('.nav-link');
        const views = document.querySelectorAll('.view-section');

        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('data-view') === viewId));
        views.forEach(v => v.style.display = v.id === viewId + '-view' ? 'block' : 'none');

        if (viewId === 'dashboard') renderMonitor();
        if (viewId === 'reports') renderReports();
        if (viewId === 'inductions') renderInductions();
        if (viewId === 'extra-auth') renderAuthList();
        if (viewId === 'keys') renderKeyLoans();
        if (viewId === 'database') { renderDbKeys(); renderDbPersonnel(); renderDbOfficers(); renderDbContacts(); }
        if (viewId === 'settings') renderUserList();
    };

    document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', function (e) {
        e.preventDefault();
        window.switchView(this.getAttribute('data-view'));
    }));

    // --- LOGOUT LOGIC ---
    window.logout = function () {
        localStorage.removeItem('holcim_session');
        showNotification('SESIÓN CERRADA', 'info');
        window.location.reload();
    };

    const btnLogoutHeader = document.getElementById('btn-logout-header');
    if (btnLogoutHeader) btnLogoutHeader.addEventListener('click', logout);

    const btnLogoutSettings = document.getElementById('btn-logout');
    if (btnLogoutSettings) btnLogoutSettings.addEventListener('click', logout);

    // --- AUTHENTICATION ---
    const loginOverlay = document.getElementById('login-overlay');
    function checkAuth() {
        const user = getSession();
        if (user) {
            loginOverlay.style.display = 'none';
            applyUserPermissions(user);
            switchView('dashboard');
        } else {
            loginOverlay.style.display = 'flex';
        }
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-pass').value;
            const allUsers = JSON.parse(localStorage.getItem('holcim_users'));
            const user = allUsers.find(u => u.email === email && u.pass === pass);
            if (user) {
                setSession(user);
                checkAuth();
                showNotification('BIENVENIDO', 'success');
                addLogEvent('SISTEMA', 'Ingreso exitoso');
            } else {
                showNotification('CREDENCIALES INVÁLIDAS', 'danger');
            }
        });
    }

    function applyUserPermissions(user) {
        const prof = document.querySelector('.user-profile');
        if (prof) prof.textContent = (user.email[0] || 'A').toUpperCase();

        const site = document.getElementById('header-site-name');
        if (site) site.textContent = user.site || 'CONTROL DE ACCESO';

        const navItems = document.querySelectorAll('.nav-link');
        navItems.forEach(link => {
            const v = link.getAttribute('data-view');
            // If user is admin (email matches defaultAdmin), show all or if permission exists
            const hasPerm = (user.email === defaultAdmin.email) || (user.permissions && user.permissions.includes(v));
            link.parentElement.style.display = hasPerm ? 'flex' : 'none';
        });
    }

    // --- BASE DE DATOS (CRUD LLAVES Y PERSONAL) ---
    function renderDbKeys() {
        const body = document.getElementById('db-key-list-body');
        if (!body) return;
        const keys = JSON.parse(localStorage.getItem('holcim_inventory_keys') || '[]');
        body.innerHTML = keys.sort((a, b) => a.num - b.num).map(k => `
            <div class="list-row" style="grid-template-columns: 60px 1fr 120px 80px;">
                <strong style="display:flex; align-items:center; gap:5px;">#${k.num} ${k.securityAlert ? '<i class="fas fa-exclamation-triangle" style="color:var(--red-holcim); font-size:0.7rem;" title="' + k.securityAlert + '"></i>' : ''}</strong>
                <span title="${k.name}">${k.name}</span>
                <div><span class="induction-status ${k.status === 'OPERATIVA' ? 'status-active' : 'status-missing'}" style="font-size:0.65rem">${k.status}</span></div>
                <div><button class="btn-salida-corpo" onclick="deleteDbKey(${k.num})" style="padding:2px 8px; font-size:0.7rem">BORRAR</button></div>
            </div>
        `).join('');
    }

    const dbKeyForm = document.getElementById('db-key-form');
    if (dbKeyForm) {
        dbKeyForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const num = parseInt(document.getElementById('db-key-num').value);
            const name = document.getElementById('db-key-name').value;
            const status = document.getElementById('db-key-status').value;
            const securityAlert = document.getElementById('db-key-alert').value.trim();
            let keys = JSON.parse(localStorage.getItem('holcim_inventory_keys') || '[]');
            const idx = keys.findIndex(k => k.num === num);
            const keyData = { num, name, status, securityAlert };
            if (idx > -1) keys[idx] = keyData;
            else keys.push(keyData);
            localStorage.setItem('holcim_inventory_keys', JSON.stringify(keys));
            showNotification('LLAVE ACTUALIZADA', 'success');
            dbKeyForm.reset(); renderDbKeys();
        });
    }

    window.deleteDbKey = function (num) {
        if (!confirm('¿Eliminar llave #' + num + '?')) return;
        let keys = JSON.parse(localStorage.getItem('holcim_inventory_keys') || '[]');
        keys = keys.filter(k => k.num !== num);
        localStorage.setItem('holcim_inventory_keys', JSON.stringify(keys));
        renderDbKeys();
    };

    function renderDbPersonnel() {
        const body = document.getElementById('db-person-list-body');
        if (!body) return;
        const people = JSON.parse(localStorage.getItem('holcim_personnel_directory') || '[]');
        body.innerHTML = people.map((p, idx) => `
            <div class="list-row" style="grid-template-columns: 1fr 120px 80px;">
                <span style="font-weight:700">${p.name}</span>
                <span class="badge-motivo" style="font-size:0.65rem">${p.dept}</span>
                <div><button class="btn-salida-corpo" onclick="deleteDbPerson(${idx})" style="padding:2px 8px; font-size:0.7rem">BORRAR</button></div>
            </div>
        `).join('');
    }

    const dbPersonForm = document.getElementById('db-person-form');
    if (dbPersonForm) {
        dbPersonForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const name = document.getElementById('db-person-name').value.toUpperCase();
            const dept = document.getElementById('db-person-dept').value;
            let people = JSON.parse(localStorage.getItem('holcim_personnel_directory') || '[]');
            people.push({ name, dept });
            localStorage.setItem('holcim_personnel_directory', JSON.stringify(people));
            showNotification('PERSONAL REGISTRADO', 'success');
            dbPersonForm.reset(); renderDbPersonnel();
        });
    }

    window.deleteDbPerson = function (idx) {
        let people = JSON.parse(localStorage.getItem('holcim_personnel_directory') || '[]');
        people.splice(idx, 1);
        localStorage.setItem('holcim_personnel_directory', JSON.stringify(people));
        renderDbPersonnel();
    };

    // --- AUTOMATION: DEPT -> RESPONSABLE HOLCIM ---
    const deptSelect = document.getElementById('department');
    const respInput = document.getElementById('responsible');

    function updatePersonnelDatalist() {
        if (!deptSelect || !respInput) return;
        const dept = deptSelect.value.trim(); // Trim for accuracy
        const people = JSON.parse(localStorage.getItem('holcim_personnel_directory') || '[]');

        // If dept is selected, filter STRICTLY by that department
        let filtered = [];
        if (dept) {
            filtered = people.filter(p => String(p.dept).trim().toUpperCase() === dept.toUpperCase());
        } else {
            // If no department selected, show all as a global list
            filtered = people;
        }

        let dl = document.getElementById('personnel-datalist');
        if (!dl) {
            dl = document.createElement('datalist');
            dl.id = 'personnel-datalist';
            document.body.appendChild(dl);
        }

        respInput.setAttribute('list', 'personnel-datalist');

        if (filtered.length > 0) {
            const uniqueNames = [...new Set(filtered.map(p => p.name))].sort();
            dl.innerHTML = uniqueNames.map(name => `<option value="${name}">`).join('');
        } else {
            dl.innerHTML = '';
        }
    }

    if (deptSelect) {
        deptSelect.addEventListener('change', updatePersonnelDatalist);
    }
    if (respInput) {
        respInput.addEventListener('focus', updatePersonnelDatalist);
    }

    // --- EXTRA AUTHORIZATIONS ---
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const auths = JSON.parse(localStorage.getItem('holcim_extra_auths') || '[]');
            const newAuth = {
                id: Date.now(),
                name: document.getElementById('auth-name').value.toUpperCase(),
                company: document.getElementById('auth-company').value.toUpperCase(),
                approver: document.getElementById('auth-approver').value.toUpperCase(),
                dateStart: document.getElementById('auth-date-start').value,
                dateEnd: document.getElementById('auth-date-end').value
            };
            auths.unshift(newAuth);
            localStorage.setItem('holcim_extra_auths', JSON.stringify(auths));
            showNotification('AUTORIZACIÓN GUARDADA', 'success');
            addLogEvent('AUTORIZACIÓN', 'Nueva: ' + newAuth.name);
            authForm.reset(); renderAuthList();
        });
    }

    window.openAuthEdit = function (id) {
        const auths = JSON.parse(localStorage.getItem('holcim_extra_auths') || '[]');
        const auth = auths.find(a => a.id === id);
        if (auth) {
            document.getElementById('edit-auth-id').value = auth.id;
            document.getElementById('edit-auth-name').value = auth.name;
            document.getElementById('edit-auth-company').value = auth.company;
            document.getElementById('edit-auth-approver').value = auth.approver;
            document.getElementById('edit-auth-start').value = auth.dateStart;
            document.getElementById('edit-auth-end').value = auth.dateEnd;
            document.getElementById('modal-edit-auth').style.display = 'flex';
        }
    };

    window.saveAuthEdit = function () {
        const id = parseInt(document.getElementById('edit-auth-id').value);
        const auths = JSON.parse(localStorage.getItem('holcim_extra_auths') || '[]');
        const auth = auths.find(a => a.id === id);
        if (auth) {
            const fields = {
                name: document.getElementById('edit-auth-name').value.toUpperCase(),
                company: document.getElementById('edit-auth-company').value.toUpperCase(),
                approver: document.getElementById('edit-auth-approver').value.toUpperCase(),
                dateStart: document.getElementById('edit-auth-start').value,
                dateEnd: document.getElementById('edit-auth-end').value
            };
            let changed = false;
            for (const key in fields) {
                if (auth[key] !== fields[key]) {
                    addAuditLog('AUTORIZACIÓN', auth.id, key, auth[key], fields[key]);
                    auth[key] = fields[key]; changed = true;
                }
            }
            if (changed) {
                localStorage.setItem('holcim_extra_auths', JSON.stringify(auths));
                showNotification('AUTORIZACIÓN ACTUALIZADA', 'success');
            }
            document.getElementById('modal-edit-auth').style.display = 'none';
            renderAuthList();
        }
    };

    function renderAuthList() {
        const body = document.getElementById('auth-list-body');
        if (!body) return;
        const auths = JSON.parse(localStorage.getItem('holcim_extra_auths') || '[]');
        const searchName = (document.getElementById('auth-search-name')?.value || '').toLowerCase();
        const searchCompany = (document.getElementById('auth-search-company')?.value || '').toLowerCase();
        const filterStatus = document.getElementById('auth-filter-status')?.value || 'ALL';
        const filterMonth = document.getElementById('auth-filter-date')?.value;

        const filtered = auths.filter(a => {
            const matchesName = a.name.toLowerCase().includes(searchName);
            const matchesCompany = a.company.toLowerCase().includes(searchCompany);

            const expDate = new Date(a.dateEnd);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            let status = 'VIGENTE';
            if (diffDays < 0) status = 'VENCIDA';
            else if (diffDays <= 7) status = 'POR VENCER';

            const matchesStatus = filterStatus === 'ALL' || status === filterStatus;
            const matchesMonth = !filterMonth || a.dateEnd.startsWith(filterMonth);

            return matchesName && matchesCompany && matchesStatus && matchesMonth;
        });

        body.innerHTML = filtered.map(a => {
            const expDate = new Date(a.dateEnd);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            let statusClass = 'status-active';
            let statusText = 'VIGENTE';
            if (diffDays < 0) { statusClass = 'status-missing'; statusText = 'VENCIDA'; }
            else if (diffDays <= 7) { statusClass = 'status-expired'; statusText = 'POR VENCER'; }

            return `
                <div class="list-row" style="grid-template-columns: 1fr 150px 140px 110px 110px 100px;">
                    <strong style="font-size:0.85rem; cursor:pointer; color:var(--primary-teal)" onclick="openAuthEdit(${a.id})">${a.name}</strong>
                    <span style="font-size:0.75rem">${a.company}</span>
                    <span style="font-size:0.75rem">${a.approver}</span>
                    <span style="font-size:0.75rem">${a.dateStart}</span>
                    <span style="font-size:0.75rem">${a.dateEnd}</span>
                    <div><span class="induction-status ${statusClass}" onclick="openTraceability(${a.id}, '${a.name}')" style="cursor:pointer">${statusText}</span></div>
                </div>
            `;
        }).join('');
    }

    ['auth-search-name', 'auth-search-company', 'auth-filter-status', 'auth-filter-date'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderAuthList);
    });

    window.exportMonitor = function (format) {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        const active = logs.filter(l => !l.exitTime);
        if (active.length === 0) return showNotification('NO HAY PERSONAL ACTIVO', 'danger');

        const sorted = active.sort((a, b) => a.idNumber.localeCompare(b.idNumber));

        if (format === 'xlsx') {
            let csv = "\uFEFFCEDULA,NOMBRE,EMPRESA,TIPO,DEPARTAMENTO,RESPONSABLE,MOTIVO,INGRESO\n";
            sorted.forEach(l => {
                csv += `"${l.idNumber}","${l.fullName}","${l.company}","${l.visitorType}","${l.department}","${l.responsible}","${l.reason}","${new Date(l.entryTime).toLocaleString()}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Monitoreo_Activo_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        } else { window.print(); }
    };

    window.exportInductions = function (format) {
        const inductions = JSON.parse(localStorage.getItem('holcim_inductions') || '[]');
        if (inductions.length === 0) return showNotification('NO HAY INDUCCIONES REGISTRADAS', 'danger');

        const sorted = inductions.sort((a, b) => a.id.localeCompare(b.id));

        if (format === 'xlsx') {
            let csv = "\uFEFFCEDULA,NOMBRE completo,EMPRESA,FECHA INDUCCION,EXPIRACION\n";
            sorted.forEach(i => {
                csv += `"${i.id}","${i.name}","${i.company}","${i.date}","${i.expiry}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Base_Inducciones_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        } else { window.print(); }
    };

    window.exportAuth = function (format) {
        const auths = JSON.parse(localStorage.getItem('holcim_extra_auths') || '[]');
        if (auths.length === 0) return showNotification('NO HAY DATOS', 'danger');

        // Note: Auths don't always have ID/Cédula, keeping original order or sorting by name
        if (format === 'xlsx') {
            let csv = "\uFEFFBENEFICIARIO,EMPRESA,AUTORIZA,INICIO,VENCIMIENTO\n";
            auths.forEach(a => {
                csv += `"${a.name}","${a.company}","${a.approver}","${a.dateStart}","${a.dateEnd}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `Autorizaciones_Extra_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        } else { window.print(); }
    };

    window.exportKeyLoans = function (format) {
        const loans = JSON.parse(localStorage.getItem('holcim_key_loans') || '[]');
        if (loans.length === 0) return showNotification('NO HAY DATOS', 'danger');

        const sorted = [...loans].sort((a, b) => a.num - b.num);

        if (format === 'xlsx') {
            let csv = "\uFEFFNUM LLAVE,UBICACION,SOLICITANTE,OFICIAL,PRESTAMO,DEVOLUCION,ESTADO\n";
            sorted.forEach(l => {
                csv += `"${l.num}","${l.name}","${l.requestor}","${l.officer}","${new Date(l.loanTime).toLocaleString()}","${l.returnTime ? new Date(l.returnTime).toLocaleString() : '-'}","${l.returnTime ? 'DEVUELTO' : 'ACTIVO'}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `Reporte_Llaves_${new Date().toISOString().split('T')[0]}.csv`; a.click();
        } else { window.print(); }
    };

    // --- MONITOR & ACCESS LOGS ---
    function updateCounters() {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        const active = logs.filter(l => !l.exitTime);

        const countActive = document.getElementById('count-active');
        const countContractors = document.getElementById('count-contractors');
        const countVisitors = document.getElementById('count-visitors');
        const countProviders = document.getElementById('count-providers');
        const countAlerts = document.getElementById('count-alerts');

        if (countActive) countActive.textContent = active.length;
        if (countContractors) countContractors.textContent = active.filter(l => l.visitorType === 'CONTRATISTA').length;
        if (countVisitors) countVisitors.textContent = active.filter(l => l.visitorType === 'VISITANTE').length;
        if (countProviders) countProviders.textContent = active.filter(l => l.visitorType === 'PROVEEDOR').length;

        const now = Date.now();
        const overtimed = active.filter(l => (now - new Date(l.entryTime).getTime()) > 12 * 60 * 60 * 1000);
        if (countAlerts) countAlerts.textContent = overtimed.length;
        const btnAlerts = document.getElementById('btn-show-alerts');
        if (btnAlerts) btnAlerts.classList.toggle('pulse-active', overtimed.length > 0);
    }

    // --- DASHBOARD DRILL-DOWN ---
    window.showFilteredPersonnel = function (type) {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        const active = logs.filter(l => !l.exitTime);
        const filtered = type === 'ALL' ? active : active.filter(l => l.visitorType === type);

        const titleMap = {
            'ALL': 'Personal Total en Planta',
            'CONTRATISTA': 'Contratistas en Planta',
            'VISITANTE': 'Visitas en Planta',
            'PROVEEDOR': 'Proveedores en Planta'
        };

        const titleEl = document.getElementById('personnel-detail-title');
        const bodyEl = document.getElementById('personnel-detail-body');
        const headerEl = document.getElementById('personnel-detail-header');

        if (titleEl) titleEl.textContent = titleMap[type] || 'Personal en Planta';
        if (headerEl) headerEl.style.background = 'var(--navy-black)';

        renderPersonnelDetail(filtered);
    };

    window.showOvertimeAlerts = function () {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        const active = logs.filter(l => !l.exitTime);
        const now = Date.now();
        const overtimed = active.filter(l => (now - new Date(l.entryTime).getTime()) > 12 * 60 * 60 * 1000);

        const titleEl = document.getElementById('personnel-detail-title');
        const headerEl = document.getElementById('personnel-detail-header');

        if (titleEl) titleEl.textContent = 'ALERTAS: Personal con +12h en Planta';
        if (headerEl) headerEl.style.background = 'var(--red-holcim)';

        renderPersonnelDetail(overtimed);
    };

    function renderPersonnelDetail(list) {
        const bodyEl = document.getElementById('personnel-detail-body');
        if (!bodyEl) return;

        if (list.length === 0) {
            bodyEl.innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-muted);">No hay personal activo en esta categoría.</div>';
        } else {
            bodyEl.innerHTML = list.map(l => `
                <div class="list-row" style="grid-template-columns: 120px 1fr 150px 140px 140px; font-size:0.85rem">
                    <span>${l.idNumber}</span>
                    <strong>${l.fullName}</strong>
                    <span>${l.company}</span>
                    <span style="font-size:0.75rem">${l.department}</span>
                    <span style="font-weight:700">${new Date(l.entryTime).toLocaleTimeString()}</span>
                </div>
            `).join('');
        }
        document.getElementById('modal-personnel-detail').style.display = 'flex';
    }

    window.closePersonnelDetail = function () {
        document.getElementById('modal-personnel-detail').style.display = 'none';
    };

    const accessForm = document.getElementById('access-form');
    if (accessForm) {
        accessForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const idNumber = document.getElementById('idNumber').value.trim();
            const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');

            // Duplicate Check: Check if person is already inside
            const alreadyInside = logs.find(l => l.idNumber === idNumber && !l.exitTime);
            if (alreadyInside) {
                showNotification(`ESTA PERSONA YA SE ENCUENTRA EN PLANTA (Gafete: ${alreadyInside.badgeNumber})`, 'danger');
                return;
            }

            const now = new Date();
            const newEntry = {
                id: Date.now(), idNumber: idNumber,
                fullName: document.getElementById('fullName').value.toUpperCase(),
                visitorType: document.getElementById('visitorType').value,
                company: document.getElementById('company').value.toUpperCase(),
                department: document.getElementById('department').value,
                responsible: document.getElementById('responsible').value.toUpperCase(),
                reason: document.getElementById('reason').value,
                vehiclePlate: document.getElementById('vehiclePlate').value.toUpperCase(),
                badgeNumber: document.getElementById('badgeNumber').value.toUpperCase(),
                entryTime: now.toISOString(), exitTime: null
            };

            // Induction Logic
            const inductionCheck = document.getElementById('inductionPassed');
            if (inductionCheck && inductionCheck.checked) {
                const inductions = JSON.parse(localStorage.getItem('holcim_inductions') || '[]');
                const idx = inductions.findIndex(i => i.idNumber === newEntry.idNumber);
                const indData = {
                    idNumber: newEntry.idNumber,
                    fullName: newEntry.fullName,
                    company: newEntry.company,
                    date: now.toISOString().split('T')[0],
                    expiry: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().split('T')[0]
                };
                if (idx > -1) inductions[idx] = indData;
                else inductions.unshift(indData);
                localStorage.setItem('holcim_inductions', JSON.stringify(inductions));
            }

            logs.unshift(newEntry);
            localStorage.setItem('holcim_access_logs', JSON.stringify(logs));
            showNotification('REGISTRO EXITOSO', 'success');
            addLogEvent('ACCESO', 'Entrada: ' + newEntry.fullName);
            accessForm.reset(); renderMonitor(); updateCounters();
            if (document.getElementById('inductions-view').style.display !== 'none') renderInductions();
        });
    }

    window.registerExit = function (id) {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs'));
        const entry = logs.find(l => l.id === id);
        if (entry) {
            entry.exitTime = new Date().toISOString();
            localStorage.setItem('holcim_access_logs', JSON.stringify(logs));
            showNotification('SALIDA REGISTRADA', 'info');
            addLogEvent('ACCESO', 'Salida: ' + entry.fullName);
            renderMonitor(); updateCounters(); renderReports();
        }
    };

    window.openEditEntry = function (id) {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs'));
        const entry = logs.find(l => l.id === id);
        if (entry) {
            document.getElementById('edit-entry-id').value = entry.id;
            document.getElementById('edit-fullname').value = entry.fullName;
            document.getElementById('edit-company').value = entry.company;
            document.getElementById('edit-badge').value = entry.badgeNumber;
            document.getElementById('edit-department').value = entry.department;
            document.getElementById('edit-responsible').value = entry.responsible || '';
            document.getElementById('edit-plate').value = entry.vehiclePlate || '';
            document.getElementById('edit-reason').value = entry.reason;
            document.getElementById('modal-edit-entry').style.display = 'flex';
        }
    };

    window.saveEntryEdit = function () {
        const id = parseInt(document.getElementById('edit-entry-id').value);
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs'));
        const entry = logs.find(l => l.id === id);
        if (entry) {
            const fields = {
                fullName: document.getElementById('edit-fullname').value.toUpperCase(),
                company: document.getElementById('edit-company').value.toUpperCase(),
                badgeNumber: document.getElementById('edit-badge').value.toUpperCase(),
                department: document.getElementById('edit-department').value,
                responsible: document.getElementById('edit-responsible').value.toUpperCase(),
                vehiclePlate: document.getElementById('edit-plate').value.toUpperCase(),
                reason: document.getElementById('edit-reason').value
            };
            let changed = false;
            for (const key in fields) {
                if (entry[key] !== fields[key]) {
                    addAuditLog('ACCESO', entry.id, key, entry[key], fields[key]);
                    entry[key] = fields[key]; changed = true;
                }
            }
            if (changed) {
                localStorage.setItem('holcim_access_logs', JSON.stringify(logs));
                showNotification('CAMBIOS GUARDADOS', 'success');
            }
            document.getElementById('modal-edit-entry').style.display = 'none';
            renderMonitor(); renderReports();
        }
    };

    function renderMonitor() {
        const body = document.getElementById('monitor-list-body');
        if (!body) return;
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        const active = logs.filter(l => !l.exitTime);
        const search = (document.getElementById('monitor-search')?.value || '').toLowerCase();
        const cat = document.getElementById('filter-monitor-category')?.value || 'ALL';
        const filtered = active.filter(l => (l.fullName.toLowerCase().includes(search) || l.idNumber.includes(search)) && (cat === 'ALL' || l.visitorType === cat));
        document.getElementById('empty-state').style.display = filtered.length === 0 ? 'block' : 'none';

        body.innerHTML = filtered.map(l => {
            const entryDate = new Date(l.entryTime);
            const diffMs = Date.now() - entryDate.getTime();
            const diffHrs = Math.floor(diffMs / 3600000);
            const diffMins = Math.floor((diffMs % 3600000) / 60000);
            const permanencia = `${diffHrs}h ${diffMins}m`;

            return `
                <div class="list-row ${diffHrs >= 12 ? 'row-overtime' : ''}" style="grid-template-columns: 80px 1fr 80px 130px 130px 100px 120px 100px;">
                    <span class="col-gafete" style="cursor:pointer; color:var(--primary-teal); font-weight:800" onclick="openEditEntry(${l.id})">${l.badgeNumber || 'N/A'}</span>
                    <div class="col-person" onclick="openTraceability(${l.id}, '${l.fullName}')" style="cursor:pointer"><h4>${l.fullName}</h4><p>${l.idNumber} | ${l.company}</p></div>
                    <span style="font-size:0.75rem; font-weight:700; color:var(--red-holcim)">${l.vehiclePlate || '-'}</span>
                    <span style="font-size:0.75rem">${l.department}</span>
                    <span style="font-size:0.75rem">${l.responsible}</span>
                    <div><span class="badge-motivo">${l.reason}</span></div>
                    <div class="col-permanencia" style="display:flex; flex-direction:column; justify-content:center; align-items:center;">
                        <span style="font-size:0.8rem; font-weight:700;">${entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span class="badge-motivo" style="font-size:0.6rem; background:var(--navy-black); color:white; width:auto; padding:2px 6px;">${permanencia}</span>
                    </div>
                    <div><button class="btn-salida-corpo" onclick="registerExit(${l.id})">SALIDA</button></div>
                </div>
            `;
        }).join('');
    }

    ['monitor-search', 'filter-monitor-category'].forEach(id => document.getElementById(id)?.addEventListener('input', renderMonitor));

    // --- KEY CONTROL ---
    document.getElementById('key-number')?.addEventListener('input', function () {
        const keys = JSON.parse(localStorage.getItem('holcim_inventory_keys') || '[]');
        const key = keys.find(k => k.num == this.value);
        const nameInput = document.getElementById('key-name');
        if (nameInput) {
            nameInput.value = key ? key.name : "Llave Desconocida";
            const alertBox = document.getElementById('key-security-alert');
            if (alertBox) {
                let html = '';
                if (key) {
                    if (key.securityAlert) {
                        html += `
                            <div class="pulsing-alert">
                                <i class="fas fa-exclamation-triangle fa-2x"></i>
                                <div style="font-size:1.1rem">ALERTA DE SEGURIDAD REQUERIDA</div>
                                <div style="font-size:0.9rem; font-weight:500; color:var(--navy-black)">${key.securityAlert}</div>
                            </div>`;
                    }
                    if (key.status !== 'OPERATIVA') {
                        html += `<span class="induction-status status-missing" style="width:100%; text-align:center; font-weight:bold; margin-top:5px;">AVISO: LLAVE EN ESTADO ${key.status}</span>`;
                    }
                }
                alertBox.innerHTML = html;
            }
        }
    });

    const keyForm = document.getElementById('key-loan-form');
    if (keyForm) {
        keyForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const num = document.getElementById('key-number').value;
            const keys = JSON.parse(localStorage.getItem('holcim_inventory_keys') || '[]');
            const key = keys.find(k => k.num == num);
            if (key && key.status === 'RESTRINGIDA') {
                showNotification('LLAVE CON ACCESO RESTRINGIDO', 'danger');
                return;
            }
            const loans = JSON.parse(localStorage.getItem('holcim_key_loans') || '[]');
            const newL = { id: Date.now(), num: num, name: document.getElementById('key-name').value, requestor: document.getElementById('key-requestor').value.toUpperCase(), officer: document.getElementById('key-officer').value.toUpperCase(), loanTime: new Date().toISOString(), returnTime: null };
            loans.unshift(newL); localStorage.setItem('holcim_key_loans', JSON.stringify(loans));
            showNotification('LLAVE ENTREGADA', 'success'); addLogEvent('LLAVES', 'Prestó #' + newL.num);
            keyForm.reset(); renderKeyLoans();
        });
    }

    window.returnKey = function (id) {
        const loans = JSON.parse(localStorage.getItem('holcim_key_loans'));
        const loan = loans.find(l => l.id === id);
        if (loan) { loan.returnTime = new Date().toISOString(); localStorage.setItem('holcim_key_loans', JSON.stringify(loans)); renderKeyLoans(); showNotification('LLAVE DEVUELTA', 'info'); }
    };

    window.openKeyLoanEdit = function (id) {
        const loans = JSON.parse(localStorage.getItem('holcim_key_loans') || '[]');
        const loan = loans.find(l => l.id === id);
        if (loan) {
            document.getElementById('edit-key-loan-id').value = loan.id;
            document.getElementById('edit-key-requestor').value = loan.requestor;
            document.getElementById('edit-key-officer').value = loan.officer;
            document.getElementById('edit-key-num').value = loan.num;
            document.getElementById('modal-edit-key-loan').style.display = 'flex';
        }
    };

    window.saveKeyLoanEdit = function () {
        const id = parseInt(document.getElementById('edit-key-loan-id').value);
        const loans = JSON.parse(localStorage.getItem('holcim_key_loans') || '[]');
        const loan = loans.find(l => l.id === id);
        if (loan) {
            const keys = JSON.parse(localStorage.getItem('holcim_inventory_keys') || '[]');
            const newNum = parseInt(document.getElementById('edit-key-num').value);
            const keyInfo = keys.find(k => k.num === newNum);

            const fields = {
                requestor: document.getElementById('edit-key-requestor').value.toUpperCase(),
                officer: document.getElementById('edit-key-officer').value.toUpperCase(),
                num: newNum,
                name: keyInfo ? keyInfo.name : "Llave Desconocida"
            };
            let changed = false;
            for (const key in fields) {
                if (loan[key] !== fields[key]) {
                    addAuditLog('LLAVES', loan.id, key, loan[key], fields[key]);
                    loan[key] = fields[key]; changed = true;
                }
            }
            if (changed) {
                localStorage.setItem('holcim_key_loans', JSON.stringify(loans));
                showNotification('DETALLES DE PRÉSTAMO ACTUALIZADOS', 'success');
            }
            document.getElementById('modal-edit-key-loan').style.display = 'none';
            renderKeyLoans();
        }
    };

    function renderKeyLoans() {
        const body = document.getElementById('key-list-body'); if (!body) return;
        const loans = JSON.parse(localStorage.getItem('holcim_key_loans') || '[]');
        body.innerHTML = loans.filter(l => !l.returnTime).map(l => `
            <div class="list-row" style="grid-template-columns: 80px 100px 1fr 1fr 1fr 120px;">
                <span style="font-weight:900; cursor:pointer; color:var(--primary-teal)" onclick="openKeyLoanEdit(${l.id})">#${l.num}</span><span>${new Date(l.loanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span style="font-weight:700;font-size:0.8rem">${l.name}</span><span style="font-size:0.8rem">${l.requestor}</span><span style="font-size:0.8rem">${l.officer}</span>
                <div><button class="btn-salida-corpo" onclick="returnKey(${l.id})">DEVOLVER</button></div>
            </div>
        `).join('');
        const hist = document.getElementById('key-history-body');
        if (hist) hist.innerHTML = loans.slice(0, 20).map(l => `
            <div class="list-row" style="grid-template-columns: 60px 1fr 1fr 1fr 125px 125px 90px;font-size:0.75rem">
                <strong style="cursor:pointer; color:var(--primary-teal)" onclick="openKeyLoanEdit(${l.id})">#${l.num}</strong><span>${l.name}</span><span>${l.requestor}</span><span>${l.officer}</span>
                <span>${new Date(l.loanTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span>${l.returnTime ? new Date(l.returnTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-'}</span>
                <div><span class="induction-status ${l.returnTime ? 'status-active' : 'status-missing'}" onclick="openTraceability(${l.id}, '${l.name}')" style="cursor:pointer">${l.returnTime ? 'DEVUELTO' : 'ACTIVO'}</span></div>
            </div>
        `).join('');
    }

    // --- CONSOLIDADO CONTRATISTAS ---
    window.renderMonthlyContractorConsolidated = function () {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        const contractors = logs.filter(l => l.visitorType === 'CONTRATISTA' && l.exitTime);
        const summary = {};
        contractors.forEach(l => {
            const date = new Date(l.entryTime);
            const key = `${date.getFullYear()}-${date.getMonth() + 1}_${l.company}`;
            if (!summary[key]) summary[key] = { company: l.company, month: date.toLocaleString('es-ES', { month: 'long', year: 'numeric' }), hours: 0, count: 0 };
            const h = (new Date(l.exitTime) - date) / 3600000;
            summary[key].hours += h;
            summary[key].count += 1;
        });
        const body = document.getElementById('contractor-consolidated-body');
        if (body) {
            body.innerHTML = `
                <div class="list-head" style="grid-template-columns: 1fr 150px 100px 100px;">
                    <span>Empresa</span><span>Mes</span><span>Horas Totales</span><span>Registros</span>
                </div>
            ` + Object.values(summary).map(s => `
                <div class="list-row" style="grid-template-columns: 1fr 150px 100px 100px;">
                    <span style="font-weight:700">${s.company}</span>
                    <span style="text-transform:capitalize">${s.month}</span>
                    <span style="font-weight:700; color:var(--primary-teal)">${s.hours.toFixed(1)}h</span>
                    <span>${s.count}</span>
                </div>
            `).join('');
        }
        document.getElementById('modal-contractor-hours').style.display = 'flex';
        document.getElementById('contractor-report-month').textContent = 'Acumulado Total Histórico';
    };

    // --- REPORTS & PDF ---
    window.printReport = function () {
        window.print();
    };

    window.exportData = function (format) {
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        if (logs.length === 0) return showNotification('NO HAY DATOS', 'danger');

        const sorted = [...logs].sort((a, b) => (a.idNumber || '').localeCompare(b.idNumber || ''));

        if (format === 'xlsx') {
            let csv = "\uFEFFCEDULA,NOMBRE,TIPO,EMPRESA,DEPTO,RESPONSABLE,MOTIVO,PLACA,INGRESO,SALIDA,PERMANENCIA\n";
            sorted.forEach(l => {
                const start = new Date(l.entryTime);
                const end = l.exitTime ? new Date(l.exitTime) : new Date();
                const diff = Math.floor((end - start) / 60000);
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                const dur = `${h}h ${m}m`;
                csv += `"${l.idNumber}","${l.fullName}","${l.visitorType}","${l.company}","${l.department}","${l.responsible}","${l.reason}","${l.vehiclePlate || '-'}","${start.toLocaleString()}","${l.exitTime ? end.toLocaleString() : 'En Planta'}","${dur}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `Reporte_General_Holcim_${new Date().toISOString().split('T')[0]}.csv`; a.click();
        } else { window.print(); }
    };

    function renderReports() {
        const body = document.getElementById('report-list-body'); if (!body) return;
        const logs = JSON.parse(localStorage.getItem('holcim_access_logs') || '[]');
        const search = (document.getElementById('report-search')?.value || '').toLowerCase();
        const start = document.getElementById('filter-date-start')?.value;
        const end = document.getElementById('filter-date-end')?.value;
        const type = document.getElementById('filter-visitor-type')?.value || 'ALL';

        const filtered = logs.filter(l => {
            const matchesSearch = l.fullName.toLowerCase().includes(search) || l.idNumber.includes(search) || l.company.toLowerCase().includes(search);
            const matchesType = type === 'ALL' || l.visitorType === type;
            const logDate = l.entryTime.split('T')[0];
            const matchesDate = (!start || logDate >= start) && (!end || logDate <= end);
            return matchesSearch && matchesType && matchesDate;
        });

        body.innerHTML = filtered.slice(0, 100).map(l => `
            <div class="list-row" style="grid-template-columns: 140px 1fr 140px 140px 110px 110px 130px;">
                <div style="font-size:0.75rem; cursor:pointer; color:var(--primary-teal)" onclick="openEditEntry(${l.id})"><strong>${new Date(l.entryTime).toLocaleDateString()}</strong><br/>ID: ${l.idNumber}</div>
                <div class="col-person" onclick="openTraceability(${l.id}, '${l.fullName}')" style="pointer-events: auto; cursor:pointer"><h4>${l.fullName}</h4></div>
                <span style="font-size:0.8rem">${l.company}</span><span style="font-size:0.8rem">${l.responsible}</span>
                <span style="font-size:0.8rem">${new Date(l.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span style="font-size:0.8rem">${l.exitTime ? new Date(l.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                <div><span class="induction-status ${l.exitTime ? 'status-active' : 'status-expired'}">${l.exitTime ? 'COMPLETO' : 'PLANTA'}</span></div>
            </div>
        `).join('');
    }

    ['report-search', 'filter-date-start', 'filter-date-end', 'filter-visitor-type'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderReports);
    });
    ['monitor-search', 'filter-monitor-category', 'filter-monitor-company'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderMonitor);
    });
    ['induction-search', 'ind-date-start', 'ind-date-end', 'filter-ind-status'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderInductions);
    });

    // Helper to force data reload if stuck
    window.resetSystemData = function () {
        if (confirm('¿Reiniciar configuración del sistema? (Los registros se mantendrán, solo se actualizan permisos y usuarios)')) {
            localStorage.removeItem('holcim_users');
            window.location.reload();
        }
    };

    // --- TRAZABILIDAD ---
    window.openTraceability = function (id, name) {
        const audit = JSON.parse(localStorage.getItem('holcim_audit_log') || '[]');
        const filtered = audit.filter(a => String(a.recordId) === String(id));
        document.getElementById('trace-record-id').textContent = 'ID: ' + id;
        document.getElementById('trace-record-name').textContent = 'Personal: ' + name;
        const body = document.getElementById('traceability-list-body');
        if (body) {
            if (filtered.length === 0) body.innerHTML = '<div style="padding:2rem;text-align:center;grid-column:1/-1">No hay cambios registrados en este objeto.</div>';
            else {
                body.innerHTML = filtered.map(a => `
                    <div class="list-row" style="grid-template-columns: 140px 140px 100px 1fr 1fr; border-bottom: 1px solid #eee; padding: 10px 0; font-size:0.75rem">
                        <span>${a.timestamp}</span>
                        <strong style="font-size:0.7rem">${a.user.split('@')[0]}</strong>
                        <span class="badge-motivo" style="font-size:0.6rem">${a.field}</span>
                        <span style="color:var(--red-holcim)">${a.oldValue}</span>
                        <span style="color:var(--primary-teal)">${a.newValue}</span>
                    </div>
                `).join('');
            }
        }
        document.getElementById('modal-traceability').style.display = 'flex';
    };

    window.closeTraceabilityModal = () => document.getElementById('modal-traceability').style.display = 'none';

    function updateOfficersDatalist() {
        const list = document.getElementById('officers-list');
        if (!list) return;
        const officers = JSON.parse(localStorage.getItem('holcim_security_officers') || '[]');
        list.innerHTML = officers.map(o => `<option value="${o.name}">`).join('');
    }

    // --- SECURITY OFFICERS DB ---
    window.renderDbOfficers = function () {
        updateOfficersDatalist();
        const body = document.getElementById('db-officer-list-body');
        if (!body) return;
        const officers = JSON.parse(localStorage.getItem('holcim_security_officers') || '[]');
        body.innerHTML = officers.map(o => `
            <div class="list-row" style="grid-template-columns: 1fr 1fr 80px; font-size: 0.85rem;">
                <strong>${o.name}</strong>
                <span>${o.company}</span>
                <button class="btn-salida-corpo" style="background:#ef4444; color:white; border-color:#ef4444;" onclick="deleteOfficer(${o.id})"><i class="fas fa-trash"></i></button>
            </div>
        `).join('') || '<div style="padding:1rem; text-align:center; color:var(--text-muted);">No hay oficiales registrados.</div>';
    };

    const officerForm = document.getElementById('db-officer-form');
    if (officerForm) {
        officerForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const officers = JSON.parse(localStorage.getItem('holcim_security_officers') || '[]');
            const newO = {
                id: Date.now(),
                name: document.getElementById('db-officer-name').value.trim().toUpperCase(),
                company: document.getElementById('db-officer-company').value.trim().toUpperCase()
            };
            officers.unshift(newO);
            localStorage.setItem('holcim_security_officers', JSON.stringify(officers));
            showNotification('OFICIAL REGISTRADO', 'success');
            officerForm.reset(); renderDbOfficers();
        });
    }

    window.deleteOfficer = function (id) {
        if (!confirm('¿Eliminar este oficial?')) return;
        let officers = JSON.parse(localStorage.getItem('holcim_security_officers') || '[]');
        officers = officers.filter(o => o.id !== id);
        localStorage.setItem('holcim_security_officers', JSON.stringify(officers));
        renderDbOfficers();
    };

    // --- CONTACT DIRECTORY (DB & DASHBOARD) ---
    function renderDbContacts() {
        const body = document.getElementById('db-contact-list-body');
        if (!body) return;
        const contacts = JSON.parse(localStorage.getItem('holcim_contact_directory') || '[]');
        body.innerHTML = contacts.map(c => `
            <div class="list-row" style="grid-template-columns: 1fr 120px 120px 100px 80px;">
                <strong style="color:var(--primary-teal)">${c.name}</strong>
                <span class="badge-motivo" style="font-size:0.65rem">${c.dept}</span>
                <span style="font-weight:700">${c.phone}</span>
                <span style="color:#d946ef; font-weight:800">${c.radio || '-'}</span>
                <div><button class="btn-salida-corpo" onclick="deleteDbContact(${c.id})" style="padding:2px 8px; font-size:0.7rem">BORRAR</button></div>
            </div>
        `).join('');
    }

    const dbContactForm = document.getElementById('db-contact-form');
    if (dbContactForm) {
        dbContactForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const name = document.getElementById('db-contact-name').value.toUpperCase();
            const dept = document.getElementById('db-contact-dept').value;
            const phone = document.getElementById('db-contact-phone').value;
            const radio = document.getElementById('db-contact-radio').value.toUpperCase();

            let contacts = JSON.parse(localStorage.getItem('holcim_contact_directory') || '[]');
            contacts.unshift({ id: Date.now(), name, dept, phone, radio });
            localStorage.setItem('holcim_contact_directory', JSON.stringify(contacts));
            showNotification('CONTACTO REGISTRADO', 'success');
            dbContactForm.reset(); renderDbContacts();
        });
    }

    window.deleteDbContact = function (id) {
        if (!confirm('¿Eliminar este contacto?')) return;
        let contacts = JSON.parse(localStorage.getItem('holcim_contact_directory') || '[]');
        contacts = contacts.filter(c => c.id !== id);
        localStorage.setItem('holcim_contact_directory', JSON.stringify(contacts));
        renderDbContacts();
    };

    window.openEmergencyDirectory = function () {
        document.getElementById('modal-emergency-dir').style.display = 'flex';
        renderEmergencyDirectory();
    };

    window.closeEmergencyDirectory = function () {
        document.getElementById('modal-emergency-dir').style.display = 'none';
    };

    function renderEmergencyDirectory() {
        const body = document.getElementById('emergency-dir-body');
        if (!body) return;
        const contacts = JSON.parse(localStorage.getItem('holcim_contact_directory') || '[]');
        const search = (document.getElementById('emergency-dir-search')?.value || '').toLowerCase();

        const filtered = contacts.filter(c => c.name.toLowerCase().includes(search) || c.dept.toLowerCase().includes(search));

        if (filtered.length === 0) {
            body.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--text-muted);">Sin resultados.</div>`;
            return;
        }

        body.innerHTML = filtered.map(c => `
            <div class="list-row" style="grid-template-columns: 1fr 120px 120px 100px;">
                <strong>${c.name}</strong>
                <span class="badge-motivo" style="font-size:0.65rem">${c.dept}</span>
                <span style="font-weight:700; color:var(--primary-teal)">${c.phone}</span>
                <span style="color:#d946ef; font-weight:800">${c.radio || '-'}</span>
            </div>
        `).join('');
    }

    document.getElementById('emergency-dir-search')?.addEventListener('input', renderEmergencyDirectory);

    // Modal Closers

    function renderUserList() {
        const body = document.getElementById('user-list-body'); if (!body) return;
        const users = JSON.parse(localStorage.getItem('holcim_users') || '[]');
        body.innerHTML = users.map(u => `
            <div class="list-row" style="grid-template-columns: 1fr 1fr 120px;">
                <div><strong>${u.email}</strong><p style="font-size:0.7rem">${u.site}</p></div>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                    ${u.permissions.map(p => `<span class="badge-motivo" style="font-size:0.6rem">${p}</span>`).join('')}
                </div>
                <div><button class="btn-salida-corpo" onclick="deleteUser('${u.email}')">ELIMINAR</button></div>
            </div>`).join('');
    }

    window.deleteUser = function (email) {
        if (email === defaultAdmin.email) return showNotification('NO SE PUEDE ELIMINAR EL ADMINISTRADOR MAESTRO', 'danger');
        if (!confirm('¿Eliminar cuenta de ' + email + '?')) return;
        let users = JSON.parse(localStorage.getItem('holcim_users'));
        users = users.filter(u => u.email !== email);
        localStorage.setItem('holcim_users', JSON.stringify(users));
        showNotification('USUARIO ELIMINADO', 'info');
        renderUserList();
    };

    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const email = document.getElementById('user-email').value.trim();
            const pass = document.getElementById('user-pass').value;
            const site = document.getElementById('user-site').value.trim().toUpperCase();
            const perms = Array.from(document.querySelectorAll('input[name="perm"]:checked')).map(i => i.value);

            let users = JSON.parse(localStorage.getItem('holcim_users') || '[]');
            if (users.find(u => u.email === email)) return showNotification('ESTE CORREO YA ESTÁ REGISTRADO', 'danger');

            users.push({ email, pass, site, permissions: perms });
            localStorage.setItem('holcim_users', JSON.stringify(users));
            showNotification('USUARIO CREADO EXITOSAMENTE', 'success');
            addLogEvent('SISTEMA', 'Nuevo usuario: ' + email);
            userForm.reset(); renderUserList();
        });
    }

    const profileForm = document.getElementById('my-profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const session = getSession();
            if (!session) return;

            const site = document.getElementById('my-site').value.trim().toUpperCase();
            const newPass = document.getElementById('my-new-pass').value;

            let users = JSON.parse(localStorage.getItem('holcim_users'));
            const idx = users.findIndex(u => u.email === session.email);
            if (idx > -1) {
                users[idx].site = site;
                if (newPass) users[idx].pass = newPass;
                localStorage.setItem('holcim_users', JSON.stringify(users));
                setSession(users[idx]);
                showNotification('PERFIL ACTUALIZADO', 'success');
                addLogEvent('SISTEMA', 'Perfil actualizado');
                window.location.reload();
            }
        });
    }

    function renderLiveLog() {
        const body = document.getElementById('live-event-log'); if (!body) return;
        const log = JSON.parse(localStorage.getItem('holcim_event_log') || '[]');
        const filterModule = document.getElementById('log-filter-module')?.value || 'ALL';

        const filtered = log.filter(e => filterModule === 'ALL' || e.module === filterModule);

        // Icon map for modules
        const icons = {
            'ACCESO': 'fa-door-open',
            'LLAVES': 'fa-key',
            'PAQUETERIA': 'fa-box',
            'SISTEMA': 'fa-cog',
            'AUTORIZACIÓN': 'fa-file-contract',
            'DB': 'fa-database'
        };

        const colors = {
            'ACCESO': '#0284c7', // Sky blue
            'LLAVES': '#f59e0b', // Amber
            'PAQUETERIA': '#10b981', // Emerald
            'SISTEMA': '#64748b', // Slate
            'AUTORIZACIÓN': '#ef4444', // Red
            'DB': '#8b5cf6' // Violet
        };

        if (filtered.length === 0) {
            body.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No hay eventos que coincidan.</div>`;
            return;
        }

        body.innerHTML = filtered.map(e => `
            <div class="list-row" style="grid-template-columns: 140px 100px 100px 1fr; font-size: 0.8rem; border-left: 4px solid ${colors[e.module] || '#ccc'}; margin-bottom: 2px; background: rgba(248, 250, 252, 0.5);">
                <span style="color: #64748b;">${e.timestamp}</span>
                <strong style="color: var(--navy-black);">${e.user}</strong>
                <div>
                    <span class="badge-motivo" style="display: flex; align-items: center; gap: 5px; background: ${colors[e.module] || '#ccc'}15; color: ${colors[e.module] || '#333'};">
                        <i class="fas ${icons[e.module] || 'fa-info-circle'}"></i> ${e.module}
                    </span>
                </div>
                <span style="font-weight: 500;">${e.description}</span>
            </div>
        `).join('');
    }

    document.getElementById('log-filter-module')?.addEventListener('change', renderLiveLog);

    // --- PDF PRINT STYLE ---
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            .nav-bar, .header-top, .export-actions, .filter-bar, .panel-header h3 i, .btn-submit-action, .btn-salida-corpo, #btn-logout-header { display: none !important; }
            .view-section { display: none !important; }
            .view-section[style*="display: block"] { display: block !important; opacity: 1 !important; visibility: visible !important; }
            .dashboard-grid { display: block !important; }
            .card-panel { box-shadow: none !important; border: 1px solid #eee !important; margin-bottom: 20px; padding: 0 !important; }
            .monitor-list { max-height: none !important; overflow: visible !important; width: 100% !important; }
            .list-row { break-inside: avoid; border-bottom: 1px solid #ccc !important; display: grid !important; background: transparent !important; color: black !important; }
            body { background: white !important; margin: 0 !important; padding: 0 !important; }
            .main-wrapper { padding: 0 !important; margin: 0 !important; width: 100% !important; }
            .content-area { width: 100% !important; left: 0 !important; position: relative !important; }
            body::before { content: "HOLCIM GROUP - REPORTE OFICIAL DE SEGURIDAD"; display: block; text-align: center; font-weight: 900; font-size: 20px; margin-bottom: 20px; color: #DC2626; border-bottom: 2px solid #DC2626; padding-bottom: 10px; }
            body::after { content: "Generado por: ${getSession()?.email || 'Sistema'} | Fecha: ${new Date().toLocaleString()}"; display: block; text-align: right; font-size: 9px; margin-top: 20px; color: #666; }
        }

        @keyframes pulse-red-alert {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(237, 28, 22, 0.4); }
            70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(237, 28, 22, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(237, 28, 22, 0); }
        }

        .pulsing-alert {
            border-radius: 6px;
            margin-bottom: 1rem;
            display: flex;
            flex-direction: column;
            gap: 5px;
            align-items: flex-start;
            text-align: left;
            font-weight: 600;
        }

        .alert-success-light {
            background-color: rgba(16, 185, 129, 0.05);
            border: 1px solid #10b981;
            color: #10b981;
            padding: 10px;
        }

        .alert-danger-light {
            background-color: rgba(239, 68, 68, 0.05);
            border: 1px solid #ef4444;
            color: #ef4444;
            padding: 10px;
        }
    `;
    document.head.appendChild(style);

    setInterval(() => { const c = document.getElementById('digital-clock'); if (c) c.textContent = new Date().toLocaleTimeString(); }, 1000);
    checkAuth(); updateCounters(); renderLiveLog(); updateOfficersDatalist();
});

function renderInductions() {
    const body = document.getElementById('induction-list-body');
    if (!body) return;
    const inductions = JSON.parse(localStorage.getItem('holcim_inductions') || '[]');
    const search = (document.getElementById('induction-search')?.value || '').toLowerCase();
    const filtered = inductions.filter(i => i.fullName.toLowerCase().includes(search) || i.idNumber.includes(search) || i.company.toLowerCase().includes(search));

    body.innerHTML = filtered.map(i => {
        const isExpired = new Date(i.expiry) < new Date();
        return `
                <div class="list-row" style="grid-template-columns: 120px 1fr 150px 150px 130px;">
                    <span>${i.idNumber}</span>
                    <strong>${i.fullName}</strong>
                    <span>${i.company}</span>
                    <span>${i.date}</span>
                    <div><span class="induction-status ${isExpired ? 'status-missing' : 'status-active'}">${isExpired ? 'VENCIDA' : 'VIGENTE'}</span></div>
                </div>
            `;
    }).join('');
}

// Add search listener for inductions
document.getElementById('induction-search')?.addEventListener('input', renderInductions);
// Modal Closers
window.closeEditAuthModal = () => document.getElementById('modal-edit-auth').style.display = 'none';
window.closeEditKeyModal = () => document.getElementById('modal-edit-key-loan').style.display = 'none';
window.closeEditPackageModal = () => document.getElementById('modal-edit-package').style.display = 'none';
window.closeContractorModal = () => document.getElementById('modal-contractor-hours').style.display = 'none';
window.closeAlertsModal = () => document.getElementById('modal-security-alerts').style.display = 'none';
window.closeEditModal = () => document.getElementById('modal-edit-entry').style.display = 'none';
window.closeScanner = () => document.getElementById('modal-scanner').style.display = 'none';
window.closeTraceabilityModal = () => document.getElementById('modal-traceability').style.display = 'none';
