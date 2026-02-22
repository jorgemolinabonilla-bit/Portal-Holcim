// Main Logic Module - Holcim Portal de Seguridad
// Author: Holcim Security Team / Reconstructed by Antigravity
// Version: 3.1 - Database, Logout Fix & Auto-Permissions

document.addEventListener('DOMContentLoaded', function () {
    // --- INITIALIZATION ---
    const getSession = () => JSON.parse(localStorage.getItem('holcim_session'));
    const setSession = (data) => localStorage.setItem('holcim_session', JSON.stringify(data));

    // --- SITE SEGREGATION UTILITY ---
    window.getSiteKey = (key) => {
        if (key === 'holcim_users' || key === 'holcim_session') return key;
        const user = JSON.parse(localStorage.getItem('holcim_session'));
        if (user && user.site) {
            return `${key}_${user.site.trim().replace(/\s+/g, '_').toUpperCase()}`;
        }
        return key;
    };

    const initializeData = (key, defaultVal) => {
        if (!localStorage.getItem(window.getSiteKey(key))) {
            localStorage.setItem(window.getSiteKey(key), JSON.stringify(defaultVal));
        }
    };

    // --- DEFAULT ADMIN INITIALIZATION ---
    const MASTER_ADMIN_EMAIL = 'admin@holcim.com';
    if (!localStorage.getItem('holcim_users')) {
        localStorage.setItem('holcim_users', JSON.stringify([{
            email: MASTER_ADMIN_EMAIL,
            pass: 'admin123', // Default temporary pass
            site: 'PLANTA CENTRAL',
            permissions: ['dashboard', 'reports', 'inductions', 'extra-auth', 'keys', 'database', 'settings']
        }]));
    }

    initializeData('holcim_calendar_events', {});

    // --- MULTI-LANGUAGE (i18n) ---
    const TRANSLATIONS = {
        es: {
            login_title: "CENTRO DE TRABAJO SEGURIDAD PATRIMONIAL",
            login_subtitle: "Inicie sesión para continuar",
            login_btn: "ACCEDER",
            logout: "CERRAR SESIÓN",
            settings_nav_profile: "Mi Perfil",
            settings_nav_users: "Gestión de Usuarios",
            settings_nav_storage: "Almacenamiento",
            settings_nav_logs: "Bitácora en Vivo",
            settings_profile_title: "Configuración de Perfil",
            settings_profile_site: "Mi Perfil de Sitio",
            settings_profile_pass: "Nueva Contraseña",
            settings_profile_btn: "ACTUALIZAR DATOS",
            settings_users_title: "Gestión de Cuentas",
            settings_storage_title: "Almacenamiento Local (Backup)",
            settings_storage_subtitle: "Configure una carpeta local para guardar copias automáticas de sus registros en formato JSON.",
            settings_storage_select_btn: "SELECCIONAR CARPETA",
            settings_storage_backup_btn: "RESPALDAR TODO AHORA",
            settings_storage_test_btn: "PROBAR CONEXIÓN",
            settings_logs_title: "Bitácora de Actividad",
            notification_scanned: "CÓDIGO ESCANEADO",
            notification_welcome: "BIENVENIDO",
            notification_invalid: "CREDENCIALES INVÁLIDAS",
            nav_dashboard: "Control de Acceso",
            nav_inductions: "Inducciones",
            nav_extra_auth: "Autorizaciones Extraordinarias",
            nav_keys: "Control de Llaves",
            nav_packages: "Gestión de Paquetería",
            nav_forms: "Formularios de Reportes",
            nav_database: "Base de Datos",
            nav_settings: "Configuración"
        },
        en: {
            login_title: "CENTRO DE TRABAJO SEGURIDAD PATRIMONIAL",
            login_subtitle: "Sign in to continue",
            login_btn: "SIGN IN",
            logout: "LOGOUT",
            settings_nav_profile: "My Profile",
            settings_nav_users: "User Management",
            settings_nav_storage: "Storage",
            settings_nav_logs: "Live Logs",
            settings_profile_title: "Profile Settings",
            settings_profile_site: "My Site Profile",
            settings_profile_pass: "New Password",
            settings_profile_btn: "UPDATE DATA",
            settings_users_title: "Account Management",
            settings_storage_title: "Local Storage (Backup)",
            settings_storage_subtitle: "Configure a local folder to automatically save JSON backups of all your records.",
            settings_storage_select_btn: "SELECT FOLDER",
            settings_storage_backup_btn: "BACKUP ALL NOW",
            settings_storage_test_btn: "TEST CONNECTION",
            settings_logs_title: "Activity Log",
            notification_scanned: "CODE SCANNED",
            notification_welcome: "WELCOME",
            notification_invalid: "INVALID CREDENTIALS",
            nav_dashboard: "Access Control",
            nav_inductions: "Inductions",
            nav_extra_auth: "Extraordinary Auth",
            nav_keys: "Key Control",
            nav_packages: "Package Management",
            nav_forms: "Report Forms",
            nav_database: "Database",
            nav_settings: "Settings"
        }
    };

    window.setLanguage = function (lang) {
        localStorage.setItem('holcim_lang', lang);
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });
        applyTranslations(lang);
    };

    function applyTranslations(lang) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) {
                el.textContent = TRANSLATIONS[lang][key];
            }
        });
    }

    // Initialize Language
    const currentLang = localStorage.getItem('holcim_lang') || 'es';
    setLanguage(currentLang);

    // --- ADMIN CROSS-SITE AGGREGATION ---
    // For the master admin, merges data from ALL sites.
    // For regular users, only returns their site's data.
    window.getSiteData = (key) => {
        const user = JSON.parse(localStorage.getItem('holcim_session'));
        if (user && user.email === MASTER_ADMIN_EMAIL) {
            const prefix = key + '_';
            const result = [];
            for (let i = 0; i < localStorage.length; i++) {
                const lsKey = localStorage.key(i);
                if (lsKey === key || lsKey.startsWith(prefix)) {
                    try {
                        const data = JSON.parse(localStorage.getItem(lsKey) || '[]');
                        if (Array.isArray(data)) result.push(...data);
                    } catch (e) { }
                }
            }
            return result;
        }
        return JSON.parse(localStorage.getItem(window.getSiteKey(key)) || '[]');
    };

    // --- STORAGE MANAGER (Local Backups) ---
    const DB_NAME = 'HolcimStorageDB';
    const STORE_NAME = 'handles';

    window.StorageManager = {
        directoryHandle: null,

        async init() {
            try {
                this.directoryHandle = await this.getHandle();
                if (this.directoryHandle) {
                    const permission = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
                    if (permission !== 'granted') this.directoryHandle = null;
                }
                updateStorageUI();
            } catch (e) { console.warn('Storage Init Fail:', e); }
        },

        async getHandle() {
            return new Promise((resolve) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const req = tx.objectStore(STORE_NAME).get('backup_dir');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                };
            });
        },

        async saveHandle(handle) {
            const request = indexedDB.open(DB_NAME, 1);
            request.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(handle, 'backup_dir');
            };
        },

        async selectFolder() {
            try {
                const handle = await window.showDirectoryPicker();
                this.directoryHandle = handle;
                await this.saveHandle(handle);
                updateStorageUI();
                showNotification('CARPETA SELECCIONADA', 'success');
            } catch (e) { console.error('Folder Selection Error:', e); }
        },

        async writeFile(filename, content) {
            if (!this.directoryHandle) return;
            try {
                const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
            } catch (e) { console.error(`Error writing ${filename}:`, e); }
        }
    };

    window.StorageManager.init();

    window.updateStorageUI = function () {
        const btn = document.getElementById('btn-select-folder');
        const pathDisplay = document.getElementById('selected-folder-path');
        const driveTip = document.getElementById('storage-drive-tip');

        if (window.StorageManager.directoryHandle) {
            if (btn) btn.classList.add('selected');
            if (pathDisplay) {
                pathDisplay.textContent = `Sincronizando con: ${window.StorageManager.directoryHandle.name}`;
                pathDisplay.style.display = 'block';
            }
            if (driveTip) driveTip.style.display = 'block';
        } else {
            if (btn) btn.classList.remove('selected');
            if (pathDisplay) pathDisplay.style.display = 'none';
            if (driveTip) driveTip.style.display = 'none';
        }
    };

    window.triggerManualBackup = async function () {
        if (!window.StorageManager.directoryHandle) {
            return showNotification('SELECCIONE UNA CARPETA PRIMERO', 'warning');
        }
        showNotification('INICIANDO RESPALDO...', 'info');
        await performBackup();
        showNotification('RESPALDO COMPLETADO', 'success');
    };

    window.triggerAutoBackup = function () {
        if (window.StorageManager.directoryHandle) {
            performBackup();
        }
    };

    async function performBackup() {
        const collections = [
            'holcim_access_logs', 'holcim_extra_auths', 'holcim_inductions',
            'holcim_inventory_keys', 'holcim_key_loans', 'holcim_event_log',
            'holcim_personnel_directory', 'holcim_security_officers',
            'holcim_badge_inventory', 'holcim_cctv_inventory',
            'holcim_cctv_reviews', 'holcim_virtual_rounds', 'holcim_contact_directory',
            'holcim_calendar_events', 'holcim_access_points'
        ];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const folderName = `backup_${timestamp}`;

        try {
            // Create a subfolder for this backup
            const subfolder = await window.StorageManager.directoryHandle.getDirectoryHandle(folderName, { create: true });
            for (const col of collections) {
                const data = localStorage.getItem(window.getSiteKey(col)) || '[]';
                const fileHandle = await subfolder.getFileHandle(`${col}.json`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(data);
                await writable.close();
            }
        } catch (e) { console.error('Backup Process Error:', e); }
    }

    window.testFolderAccess = async function () {
        if (!window.StorageManager.directoryHandle) return showNotification('NO HAY CARPETA', 'danger');
        try {
            const permission = await window.StorageManager.directoryHandle.requestPermission({ mode: 'readwrite' });
            if (permission === 'granted') showNotification('CONEXIÓN EXITOSA', 'success');
            else showNotification('PERMISO DENEGADO', 'danger');
        } catch (e) { showNotification('FALTA INTERACCIÓN DE USUARIO', 'warning'); }
    };

    // Bind UI
    const btnSelectFolder = document.getElementById('btn-select-folder');
    if (btnSelectFolder) btnSelectFolder.addEventListener('click', () => window.StorageManager.selectFolder());


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
        const log = JSON.parse(localStorage.getItem(getSiteKey('holcim_event_log')) || '[]');
        const user = getSession() || { email: 'SISTEMA@holcim.com' };
        log.unshift({ timestamp: new Date().toLocaleString(), user: user.email.split('@')[0], module: module, description: description });
        localStorage.setItem(getSiteKey('holcim_event_log'), JSON.stringify(log.slice(0, 50)));
        if (document.getElementById('live-event-log')) renderLiveLog();
        // Auto-backup on major events
        if (module !== 'SISTEMA') triggerAutoBackup();
    };

    window.addAuditLog = function (module, recordId, field, oldValue, newValue) {
        const log = JSON.parse(localStorage.getItem(getSiteKey('holcim_audit_log')) || '[]');
        const user = (typeof getSession === 'function' ? getSession() : null) || { email: 'SISTEMA@holcim.com' };
        log.unshift({ timestamp: new Date().toLocaleString(), user: user.email, module: module, recordId: recordId, field: field, oldValue: oldValue || '-', newValue: newValue || '-' });
        localStorage.setItem(getSiteKey('holcim_audit_log'), JSON.stringify(log));
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
            const inductions = window.getSiteData('holcim_inductions');
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
            const logs = window.getSiteData('holcim_access_logs');
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
        if (tabId === 'badges-tab') renderDbBadges();
        if (tabId === 'cctv-tab') renderDbCCTV();
        if (tabId === 'access-points-tab') renderDbAccessPoints();
    };

    // --- THEME MANAGEMENT ---
    const themeToggle = document.getElementById('theme-toggle');
    const updateThemeUI = (isDark) => {
        const icon = themeToggle.querySelector('i');
        const text = themeToggle.querySelector('span');
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            icon.className = 'fas fa-sun';
            text.textContent = 'MODO DÍA';
        } else {
            document.documentElement.removeAttribute('data-theme');
            icon.className = 'fas fa-moon';
            text.textContent = 'MODO NOCHE';
        }
    };

    const currentTheme = localStorage.getItem('holcim_theme');
    if (currentTheme === 'dark') updateThemeUI(true);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const nextDark = !isDark;
            updateThemeUI(nextDark);
            localStorage.setItem('holcim_theme', nextDark ? 'dark' : 'light');
        });
    }

    // --- NAVIGATION ---
    window.switchView = function (viewId) {
        const navLinks = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('.view-section');

        // Hide login if authenticated
        if (getSession() && document.getElementById('login-overlay')) {
            document.getElementById('login-overlay').style.display = 'none';
        }

        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('data-view') === viewId));

        // Animation transition
        sections.forEach(v => {
            if (v.id === viewId + '-view') {
                v.style.display = 'block';
                // Immediate visibility for reliability, then add animation class
                v.classList.add('active-view');
            } else {
                v.classList.remove('active-view');
                v.style.display = 'none';
            }
        });

        if (viewId === 'dashboard') renderMonitor();
        if (viewId === 'reports') renderReports();
        if (viewId === 'cctv-monitoring') renderCctvMonitoring();
        if (viewId === 'calendar') renderCalendar();
        if (viewId === 'inductions') renderInductions();
        if (viewId === 'extra-auth') renderAuthList();
        if (viewId === 'keys') renderKeyLoans();
        if (viewId === 'database') { renderDbKeys(); renderDbPersonnel(); renderDbOfficers(); renderDbContacts(); renderDbBadges(); renderDbCCTV(); renderDbAccessPoints(); }
        if (viewId === 'settings') {
            renderUserList();
            showSettingsSection('profile');
        }
    };

    // --- NAVIGATION EVENT BINDING ---
    document.addEventListener('click', e => {
        const link = e.target.closest('.nav-link');
        if (link) {
            e.preventDefault();
            const viewId = link.getAttribute('data-view');
            if (viewId) window.switchView(viewId);
        }
    });

    window.showSettingsSection = function (sectionId) {
        // Toggle nav items
        document.querySelectorAll('.settings-nav-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
        });
        // Toggle sections
        document.querySelectorAll('.settings-section').forEach(sec => {
            sec.classList.toggle('active', sec.id === 'settings-' + sectionId);
        });
        if (sectionId === 'logs') renderLiveLog();
        if (sectionId === 'storage') updateStorageUI();
    };

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
            if (document.querySelector('.header-top')) document.querySelector('.header-top').style.display = 'flex';
            if (document.querySelector('.nav-bar')) document.querySelector('.nav-bar').style.display = 'flex';

            applyUserPermissions(user);

            // POST-LOGIN INITIALIZATION (For Site-Specific Data)
            // ... (rest of initialKeys and initializeData)
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
            initializeData('holcim_badge_inventory', []);
            initializeData('holcim_cctv_inventory', []);
            initializeData('holcim_cctv_reviews', []);
            initializeData('holcim_virtual_rounds', []);

            updateBadgeDropdown();
            switchView('dashboard');

            // Start Calendar Alert System
            setInterval(checkCalendarAlerts, 60000); // Check every minute
            checkCalendarAlerts(); // Run once on load
        } else {
            loginOverlay.style.display = 'flex';
            if (document.querySelector('.header-top')) document.querySelector('.header-top').style.display = 'none';
            if (document.querySelector('.nav-bar')) document.querySelector('.nav-bar').style.display = 'none';
            document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
        }
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-pass').value;
            const allUsers = JSON.parse(localStorage.getItem('holcim_users') || '[]');
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
            // Safely check permissions
            const permissions = user.permissions || [];
            const hasPerm = (user.email === MASTER_ADMIN_EMAIL) || permissions.includes(v);
            link.parentElement.style.display = hasPerm ? 'flex' : 'none';
        });
    }

    // --- BASE DE DATOS (CRUD LLAVES Y PERSONAL) ---
    function renderDbKeys() {
        const body = document.getElementById('db-key-list-body');
        if (!body) return;
        const keys = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_inventory_keys')) || '[]');
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
            let keys = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_inventory_keys')) || '[]');
            const idx = keys.findIndex(k => k.num === num);
            const keyData = { num, name, status, securityAlert };
            if (idx > -1) keys[idx] = keyData;
            else keys.push(keyData);
            localStorage.setItem(window.getSiteKey('holcim_inventory_keys'), JSON.stringify(keys));
            showNotification('LLAVE ACTUALIZADA', 'success');
            dbKeyForm.reset(); renderDbKeys();
        });
    }

    window.deleteDbKey = function (num) {
        if (!confirm('¿Eliminar llave #' + num + '?')) return;
        const keysKey = window.getSiteKey('holcim_inventory_keys');
        let keys = JSON.parse(localStorage.getItem(keysKey) || '[]');
        keys = keys.filter(k => k.num !== num);
        localStorage.setItem(keysKey, JSON.stringify(keys));
        renderDbKeys();
    };

    function renderDbPersonnel() {
        const body = document.getElementById('db-person-list-body');
        if (!body) return;
        const people = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_personnel_directory')) || '[]');
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
            const pk = window.getSiteKey('holcim_personnel_directory');
            let people = JSON.parse(localStorage.getItem(pk) || '[]');
            people.push({ name, dept });
            localStorage.setItem(pk, JSON.stringify(people));
            showNotification('PERSONAL REGISTRADO', 'success');
            dbPersonForm.reset(); renderDbPersonnel();
        });
    }

    window.deleteDbPerson = function (idx) {
        const pk = window.getSiteKey('holcim_personnel_directory');
        let people = JSON.parse(localStorage.getItem(pk) || '[]');
        people.splice(idx, 1);
        localStorage.setItem(pk, JSON.stringify(people));
        renderDbPersonnel();
    };

    // --- AUTOMATION: DEPT -> RESPONSABLE HOLCIM ---
    const deptSelect = document.getElementById('department');
    const respInput = document.getElementById('responsible');

    function updatePersonnelDatalist() {
        if (!deptSelect || !respInput) return;
        const dept = deptSelect.value.trim(); // Trim for accuracy
        const people = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_personnel_directory')) || '[]');

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
            const ak = window.getSiteKey('holcim_extra_auths');
            const auths = JSON.parse(localStorage.getItem(ak) || '[]');
            const newAuth = {
                id: Date.now(),
                name: document.getElementById('auth-name').value.toUpperCase(),
                company: document.getElementById('auth-company').value.toUpperCase(),
                approver: document.getElementById('auth-approver').value.toUpperCase(),
                dateStart: document.getElementById('auth-date-start').value,
                dateEnd: document.getElementById('auth-date-end').value
            };
            auths.unshift(newAuth);
            localStorage.setItem(ak, JSON.stringify(auths));
            showNotification('AUTORIZACIÓN GUARDADA', 'success');
            addLogEvent('AUTORIZACIÓN', 'Nueva: ' + newAuth.name);
            authForm.reset(); renderAuthList();
        });
    }

    window.openAuthEdit = function (id) {
        const auths = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_extra_auths')) || '[]');
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
        const ak = window.getSiteKey('holcim_extra_auths');
        const auths = JSON.parse(localStorage.getItem(ak) || '[]');
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
                localStorage.setItem(ak, JSON.stringify(auths));
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
        const logs = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_logs')) || '[]');
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
        const inductions = window.getSiteData('holcim_inductions');
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
        const auths = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_extra_auths')) || '[]');
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
        const loans = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_key_loans')) || '[]');
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
        const logs = window.getSiteData('holcim_access_logs');
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
        const logs = window.getSiteData('holcim_access_logs');
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
        const logs = window.getSiteData('holcim_access_logs');
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
            const logsKey = window.getSiteKey('holcim_access_logs');
            const logs = JSON.parse(localStorage.getItem(logsKey) || '[]');

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
                const indKey = window.getSiteKey('holcim_inductions');
                const inductions = JSON.parse(localStorage.getItem(indKey) || '[]');
                const idx = inductions.findIndex(i => i.idNumber === newEntry.idNumber);
                const indData = {
                    idNumber: newEntry.idNumber,
                    fullName: newEntry.fullName,
                    company: newEntry.company,
                    department: newEntry.department,
                    responsible: newEntry.responsible,
                    date: now.toISOString().split('T')[0],
                    expiry: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().split('T')[0]
                };
                if (idx > -1) inductions[idx] = indData;
                else inductions.unshift(indData);
                localStorage.setItem(indKey, JSON.stringify(inductions));
            }

            logs.unshift(newEntry);
            localStorage.setItem(logsKey, JSON.stringify(logs));
            showNotification('REGISTRO EXITOSO', 'success');
            addLogEvent('ACCESO', 'Entrada: ' + newEntry.fullName);
            accessForm.reset(); renderMonitor(); updateCounters();
            if (document.getElementById('inductions-view').style.display !== 'none') renderInductions();
        });
    }

    window.registerExit = function (id) {
        const logsKey = window.getSiteKey('holcim_access_logs');
        const logs = JSON.parse(localStorage.getItem(logsKey));
        const entry = logs.find(l => l.id === id);
        if (entry) {
            entry.exitTime = new Date().toISOString();
            localStorage.setItem(logsKey, JSON.stringify(logs));
            showNotification('SALIDA REGISTRADA', 'info');
            addLogEvent('ACCESO', 'Salida: ' + entry.fullName);
            renderMonitor(); updateCounters(); renderReports();
        }
    };

    window.openEditEntry = function (id) {
        const logs = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_logs')));
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
        const logKey = window.getSiteKey('holcim_access_logs');
        const logs = JSON.parse(localStorage.getItem(logKey));
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
                localStorage.setItem(logKey, JSON.stringify(logs));
                showNotification('CAMBIOS GUARDADOS', 'success');
            }
            document.getElementById('modal-edit-entry').style.display = 'none';
            renderMonitor(); renderReports();
        }
    };

    function renderMonitor() {
        const body = document.getElementById('monitor-list-body');
        if (!body) return;
        const logs = window.getSiteData('holcim_access_logs');
        const active = logs.filter(l => !l.exitTime);
        const search = (document.getElementById('monitor-search')?.value || '').toLowerCase();
        const cat = document.getElementById('filter-monitor-category')?.value || 'ALL';
        const filtered = active.filter(l => {
            const name = (l.fullName || '').toLowerCase();
            const id = (l.idNumber || '');
            const matchesSearch = name.includes(search) || id.includes(search);
            const matchesCat = (cat === 'ALL' || l.visitorType === cat);
            return matchesSearch && matchesCat;
        });
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
        const keys = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_inventory_keys')) || '[]');
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
            const keys = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_inventory_keys')) || '[]');
            const key = keys.find(k => k.num == num);
            if (key && key.status === 'RESTRINGIDA') {
                showNotification('LLAVE CON ACCESO RESTRINGIDO', 'danger');
                return;
            }
            const loansKey = window.getSiteKey('holcim_key_loans');
            const loans = JSON.parse(localStorage.getItem(loansKey) || '[]');
            const newL = { id: Date.now(), num: num, name: document.getElementById('key-name').value, requestor: document.getElementById('key-requestor').value.toUpperCase(), officer: document.getElementById('key-officer').value.toUpperCase(), loanTime: new Date().toISOString(), returnTime: null };
            loans.unshift(newL); localStorage.setItem(loansKey, JSON.stringify(loans));
            showNotification('LLAVE ENTREGADA', 'success'); addLogEvent('LLAVES', 'Prestó #' + newL.num);
            keyForm.reset(); renderKeyLoans();
        });
    }

    window.returnKey = function (id) {
        const klKey = window.getSiteKey('holcim_key_loans');
        const loans = JSON.parse(localStorage.getItem(klKey));
        const loan = loans.find(l => l.id === id);
        if (loan) { loan.returnTime = new Date().toISOString(); localStorage.setItem(klKey, JSON.stringify(loans)); renderKeyLoans(); showNotification('LLAVE DEVUELTA', 'info'); }
    };

    window.openKeyLoanEdit = function (id) {
        const loans = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_key_loans')) || '[]');
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
        const klk = window.getSiteKey('holcim_key_loans');
        const loans = JSON.parse(localStorage.getItem(klk) || '[]');
        const loan = loans.find(l => l.id === id);
        if (loan) {
            const keys = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_inventory_keys')) || '[]');
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
                localStorage.setItem(klk, JSON.stringify(loans));
                showNotification('DETALLES DE PRÉSTAMO ACTUALIZADOS', 'success');
            }
            document.getElementById('modal-edit-key-loan').style.display = 'none';
            renderKeyLoans();
        }
    };

    function renderKeyLoans() {
        const body = document.getElementById('key-list-body'); if (!body) return;
        const loans = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_key_loans')) || '[]');
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
        const logs = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_logs')) || '[]');
        const contractors = logs.filter(l => l.visitorType === 'CONTRATISTA' && l.exitTime);
        const summary = {};
        contractors.forEach(l => {
            const date = new Date(l.entryTime);
            const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
            if (!summary[key]) summary[key] = { month: date.toLocaleString('es-ES', { month: 'long', year: 'numeric' }), hours: 0, count: 0 };
            const h = (new Date(l.exitTime) - date) / 3600000;
            summary[key].hours += h;
            summary[key].count += 1;
        });
        const body = document.getElementById('contractor-consolidated-body');
        if (body) {
            body.innerHTML = `
                <div class="list-head" style="grid-template-columns: 1fr 150px 100px;">
                    <span>Mes</span><span>Horas Totales</span><span>Registros</span>
                </div>
            ` + Object.values(summary).map(s => `
                <div class="list-row" style="grid-template-columns: 1fr 150px 100px;">
                    <span style="text-transform:capitalize; font-weight:700">${s.month}</span>
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
        const logs = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_logs')) || '[]');
        if (logs.length === 0) return showNotification('NO HAY DATOS PARA EXPORTAR', 'danger');

        const sorted = [...logs].sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
        const siteName = getSession()?.site || 'HOLCIM';

        if (format === 'xlsx') {
            const title = `REPORTE DE ACCESO - ${siteName}`;
            const date = new Date().toLocaleString();

            let html = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head><meta charset="utf-8"/><style>
                    .title { font-size: 18pt; font-weight: bold; color: #DC2626; text-align: center; }
                    .header { background-color: #1e293b; color: white; font-weight: bold; border: 1px solid #000; }
                    .cell { border: 1px solid #ccc; }
                    .row-even { background-color: #f8fafc; }
                </style></head>
                <body>
                    <table>
                        <tr><td colspan="11" class="title">${title}</td></tr>
                        <tr><td colspan="11" style="text-align:right">Generado: ${date}</td></tr>
                        <tr><td></td></tr>
                        <tr class="header">
                            <th>CEDULA</th><th>NOMBRE</th><th>TIPO</th><th>EMPRESA</th><th>DEPTO</th>
                            <th>RESPONSABLE</th><th>MOTIVO</th><th>PLACA</th><th>INGRESO</th><th>SALIDA</th><th>PERMANENCIA</th>
                        </tr>
            `;

            sorted.forEach((l, i) => {
                const start = new Date(l.entryTime);
                const end = l.exitTime ? new Date(l.exitTime) : new Date();
                const diff = Math.floor((end - start) / 60000);
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                const dur = `${h}h ${m}m`;

                html += `
                    <tr class="${i % 2 === 0 ? 'row-even' : ''}">
                        <td class="cell">${l.idNumber}</td>
                        <td class="cell">${l.fullName}</td>
                        <td class="cell">${l.visitorType}</td>
                        <td class="cell">${l.company}</td>
                        <td class="cell">${l.department}</td>
                        <td class="cell">${l.responsible}</td>
                        <td class="cell">${l.reason}</td>
                        <td class="cell">${l.vehiclePlate || '-'}</td>
                        <td class="cell">${start.toLocaleString()}</td>
                        <td class="cell">${l.exitTime ? end.toLocaleString() : 'En Planta'}</td>
                        <td class="cell">${dur}</td>
                    </tr>
                `;
            });

            html += `</table></body></html>`;

            const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `Reporte_Acceso_${siteName}_${new Date().toISOString().split('T')[0]}.xls`;
            a.click();
        } else { window.print(); }
    };

    function renderReports() {
        const body = document.getElementById('report-list-body'); if (!body) return;
        const logs = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_logs')) || '[]');
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
        const audit = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_audit_log')) || '[]');
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
        const officers = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_security_officers')) || '[]');
        list.innerHTML = officers.map(o => `<option value="${o.name}">`).join('');
    }

    // --- SECURITY OFFICERS DB ---
    window.renderDbOfficers = function () {
        updateOfficersDatalist();
        const body = document.getElementById('db-officer-list-body');
        if (!body) return;
        const officers = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_security_officers')) || '[]');
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
            const offKey = window.getSiteKey('holcim_security_officers');
            const officers = JSON.parse(localStorage.getItem(offKey) || '[]');
            const newO = {
                id: Date.now(),
                name: document.getElementById('db-officer-name').value.trim().toUpperCase(),
                company: document.getElementById('db-officer-company').value.trim().toUpperCase()
            };
            officers.unshift(newO);
            localStorage.setItem(offKey, JSON.stringify(officers));
            showNotification('OFICIAL REGISTRADO', 'success');
            officerForm.reset(); renderDbOfficers();
        });
    }

    window.deleteOfficer = function (id) {
        if (!confirm('¿Eliminar este oficial?')) return;
        const offKey2 = window.getSiteKey('holcim_security_officers');
        let officers = JSON.parse(localStorage.getItem(offKey2) || '[]');
        officers = officers.filter(o => o.id !== id);
        localStorage.setItem(offKey2, JSON.stringify(officers));
        renderDbOfficers();
    };

    // --- CONTACT DIRECTORY (DB & DASHBOARD) ---
    function renderDbContacts() {
        const body = document.getElementById('db-contact-list-body');
        if (!body) return;
        const contacts = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_contact_directory')) || '[]');
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

            const ck = window.getSiteKey('holcim_contact_directory');
            let contacts = JSON.parse(localStorage.getItem(ck) || '[]');
            contacts.unshift({ id: Date.now(), name, dept, phone, radio });
            localStorage.setItem(ck, JSON.stringify(contacts));
            showNotification('CONTACTO REGISTRADO', 'success');
            dbContactForm.reset(); renderDbContacts();
        });
    }

    window.deleteDbContact = function (id) {
        if (!confirm('¿Eliminar este contacto?')) return;
        const ck2 = window.getSiteKey('holcim_contact_directory');
        let contacts = JSON.parse(localStorage.getItem(ck2) || '[]');
        contacts = contacts.filter(c => c.id !== id);
        localStorage.setItem(ck2, JSON.stringify(contacts));
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
        const contacts = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_contact_directory')) || '[]');
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
        if (email === MASTER_ADMIN_EMAIL) return showNotification('NO SE PUEDE ELIMINAR EL ADMINISTRADOR MAESTRO', 'danger');
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
        const log = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_event_log')) || '[]');
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

    function renderDbBadges() {
        const body = document.getElementById('db-badge-list-body');
        if (!body) return;
        const badges = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_badge_inventory')) || '[]');
        body.innerHTML = badges.sort((a, b) => a.num.localeCompare(b.num)).map(b => `
            <div class="list-row" style="grid-template-columns: 100px 120px 1fr 80px;">
                <strong>#${b.num}</strong>
                <span>${b.code}</span>
                <span style="font-size:0.8rem; color:var(--text-muted)">${b.alert || '-'}</span>
                <div><button class="btn-salida-corpo" onclick="deleteDbBadge('${b.num}')">ELIMINAR</button></div>
            </div>
        `).join('');
    }

    const badgeForm = document.getElementById('db-badge-form');
    if (badgeForm) {
        badgeForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const num = document.getElementById('db-badge-num').value.trim().toUpperCase();
            const code = document.getElementById('db-badge-code').value.trim().toUpperCase();
            const alert = document.getElementById('db-badge-alert').value.trim();

            const key = window.getSiteKey('holcim_badge_inventory');
            const badges = JSON.parse(localStorage.getItem(key) || '[]');
            if (badges.find(b => b.num === num)) return showNotification('ESTE NÚMERO DE CARNET YA EXISTE', 'danger');

            badges.push({ num, code, alert });
            localStorage.setItem(key, JSON.stringify(badges));
            showNotification('CARNET REGISTRADO', 'success');
            badgeForm.reset(); renderDbBadges(); updateBadgeDropdown();
        });
    }

    window.deleteDbBadge = function (num) {
        if (!confirm('¿Eliminar carnet #' + num + '?')) return;
        const key = window.getSiteKey('holcim_badge_inventory');
        let badges = JSON.parse(localStorage.getItem(key));
        badges = badges.filter(b => b.num !== num);
        localStorage.setItem(key, JSON.stringify(badges));
        showNotification('CARNET ELIMINADO', 'info');
        renderDbBadges(); updateBadgeDropdown();
    };

    window.updateBadgeDropdown = function () {
        const selects = [document.getElementById('badgeNumber'), document.getElementById('edit-badge')];
        const badges = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_badge_inventory')) || '[]');

        selects.forEach(sel => {
            if (!sel) return;
            const currentVal = sel.value;
            sel.innerHTML = '<option value="">Seleccione Gafete...</option>' +
                badges.map(b => `<option value="${b.num}">${b.num} ${b.alert ? '⚠️' : ''}</option>`).join('');
            if (currentVal && badges.find(b => b.num === currentVal)) sel.value = currentVal;
        });
    }

    window.renderDbCCTV = function () {
        const body = document.getElementById('db-cctv-list-body');
        if (!body) return;
        const items = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_cctv_inventory')) || '[]');
        body.innerHTML = items.map(item => `
            <div class="list-row" style="grid-template-columns: 100px 100px 90px 1fr 100px 140px 100px 60px 80px;">
                <span style="font-weight:700; font-size:0.75rem;">${item.type}</span>
                <span style="font-weight:700; color:var(--navy-black);">${item.brand || '-'}</span>
                <span style="font-family:monospace; color:var(--primary-teal);">${item.ip}</span>
                <span>${item.location}</span>
                <span class="badge-motivo" style="color:white; background:${item.status === 'OPERATIVO' ? '#059669' : item.status === 'FALLA' ? 'var(--red-holcim)' : '#64748b'}">${item.status}</span>
                <div style="font-size:0.65rem; line-height:1.2;">
                    <strong>${Array.isArray(item.analyticsType) ? item.analyticsType.join(', ') : (item.analyticsType || '-')}</strong><br/>
                    <span style="color:var(--text-muted)">${item.analyticsSchedule || '-'}</span>
                </div>
                <span style="font-size:0.75rem; color:var(--text-muted)">${item.observation || '-'}</span>
                <div>${item.photo ? `<button class="btn-salida-corpo" style="padding: 2px 6px; font-size: 0.6rem;" onclick="viewCctvPhoto('${item.photo}')">VER</button>` : '-'}</div>
                <div><button class="btn-salida-corpo" onclick="deleteDbCCTV('${item.id}')">ELIMINAR</button></div>
            </div>
        `).join('');
    };

    const cctvForm = document.getElementById('db-cctv-form');
    if (cctvForm) {
        cctvForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const photoInput = document.getElementById('db-cctv-photo');
            let photoBase64 = null;
            if (photoInput.files && photoInput.files[0]) {
                photoBase64 = await toBase64(photoInput.files[0]);
            }

            const perms = Array.from(document.querySelectorAll('input[name="cctv-analytics"]:checked')).map(i => i.value);

            const newItem = {
                id: Date.now().toString(),
                type: document.getElementById('db-cctv-type').value,
                brand: document.getElementById('db-cctv-brand').value.trim().toUpperCase(),
                ip: document.getElementById('db-cctv-ip').value.trim(),
                location: document.getElementById('db-cctv-location').value.trim().toUpperCase(),
                status: document.getElementById('db-cctv-status').value,
                observation: document.getElementById('db-cctv-obs').value.trim(),
                lat: document.getElementById('db-cctv-lat').value ? parseFloat(document.getElementById('db-cctv-lat').value) : null,
                lng: document.getElementById('db-cctv-lng').value ? parseFloat(document.getElementById('db-cctv-lng').value) : null,
                analyticsType: perms,
                analyticsSchedule: document.getElementById('db-cctv-analytics-schedule').value.trim(),
                photo: photoBase64
            };

            const key = window.getSiteKey('holcim_cctv_inventory');
            const items = JSON.parse(localStorage.getItem(key) || '[]');
            items.push(newItem);
            localStorage.setItem(key, JSON.stringify(items));
            showNotification('SISTEMA CCTV REGISTRADO', 'success');
            cctvForm.reset(); renderDbCCTV();
        });
    }

    window.deleteDbCCTV = function (id) {
        if (!confirm('¿Eliminar este registro de CCTV?')) return;
        const key = window.getSiteKey('holcim_cctv_inventory');
        let items = JSON.parse(localStorage.getItem(key));
        items = items.filter(i => i.id !== id);
        localStorage.setItem(key, JSON.stringify(items));
        showNotification('REGISTRO ELIMINADO', 'info');
        renderDbCCTV();
    };

    // --- CCTV MONITORING LOGIC ---
    window.renderCctvMonitoring = function () {
        // By default show daily review and ensure it's rendered
        renderDailyCctvChecklist();
        renderVirtualRoundsList();
        renderCctvHistory();
    };

    window.switchCctvMonTab = function (tabId, btn) {
        document.querySelectorAll('.mon-tab-content').forEach(t => t.style.display = 'none');
        const targetTab = document.getElementById(tabId + '-tab');
        if (targetTab) targetTab.style.display = 'block';

        document.querySelectorAll('.security-hub-tab-btn, .db-tab-btn').forEach(b => {
            if (b.onclick && b.onclick.toString().includes('switchCctvMonTab')) {
                b.classList.remove('active');
                b.style.background = '#64748b';
            }
        });

        btn.classList.add('active');
        btn.style.background = 'var(--primary-teal)';

        if (tabId === 'mon-daily') renderDailyCctvChecklist();
        if (tabId === 'mon-rounds') renderVirtualRoundsList();
        if (tabId === 'mon-history') renderCctvHistory();
    };

    window.switchSecurityTab = function (tabId, btn) {
        document.querySelectorAll('.security-hub-content').forEach(t => t.style.display = 'none');
        const targetTab = document.getElementById(tabId + '-tab');
        if (targetTab) targetTab.style.display = 'block';

        document.querySelectorAll('.security-hub-tab').forEach(b => {
            b.classList.remove('active');
            b.style.background = '#64748b';
        });

        btn.classList.add('active');
        btn.style.background = 'var(--navy-black)';

        if (tabId === 'sec-cctv') renderCctvMonitoring();
        if (tabId === 'sec-portones') renderAccessPointsChecklist();
    };

    window.renderAccessPointsChecklist = function () {
        const container = document.getElementById('portones-checklist-container');
        if (!container) return;
        const items = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_points')) || '[]');

        if (items.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i class="fas fa-door-open" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 1rem;"></i>
                    <p>No hay puntos de acceso registrados en la base de datos.</p>
                    <p style="font-size: 0.8rem;">Agrega puntos de acceso en la sección <strong>Base de Datos -> Puntos de Acceso</strong>.</p>
                </div>`;
            return;
        }

        container.innerHTML = items.map(ap => `
            <div class="card-panel checklist-item" data-ap-id="${ap.id}" style="margin-bottom: 1rem; border: 1px solid #e2e8f0; padding: 1rem;">
                <div style="display: grid; grid-template-columns: 1fr 200px 200px; gap: 20px; align-items: center;">
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <strong style="display:block; font-size:1rem; color:var(--navy-black);">${ap.name}</strong>
                            ${ap.lat && ap.lng ? `<button class="btn-salida-corpo" onclick="panToAP(${ap.lat}, ${ap.lng})" style="padding:2px 8px; font-size:0.6rem; background:var(--primary-teal); color:white; border:none;"><i class="fas fa-location-dot"></i> MAPA</button>` : ''}
                        </div>
                        <span style="font-size:0.8rem; color:var(--text-muted);">${ap.location}</span>
                        ${ap.lat && ap.lng ? `<div style="font-size:0.6rem; color:var(--primary-teal); font-family:monospace; margin-top:2px;">Coord: ${ap.lat.toFixed(4)}, ${ap.lng.toFixed(4)}</div>` : ''}
                    </div>
                    <div class="check-group">
                        <label class="form-label" style="font-size:0.6rem;">Estado Operativo</label>
                        <select class="check-status" onchange="updateAccessPointsStats()">
                            <option value="OPERATIVO">OPERATIVO</option>
                            <option value="FALLA">FALLA</option>
                            <option value="MANTENIMIENTO">MANTENIMIENTO</option>
                        </select>
                    </div>
                    <div class="check-group">
                        <label class="form-label" style="font-size:0.6rem;">Observación</label>
                        <input type="text" class="check-obs" placeholder="Nota..." style="width:100%; font-size:0.8rem;">
                    </div>
                </div>
            </div>
        `).join('');

        updateAccessPointsStats();
        renderAccessPointsHistory();
    };

    window.updateAccessPointsStats = function () {
        const items = document.querySelectorAll('#portones-checklist-container .checklist-item');
        let ok = 0, fail = 0, maint = 0;

        items.forEach(item => {
            const status = item.querySelector('.check-status').value;
            if (status === 'OPERATIVO') ok++;
            else if (status === 'FALLA') fail++;
            else if (status === 'MANTENIMIENTO') maint++;
        });

        const elOk = document.getElementById('portones-stat-ok');
        const elFail = document.getElementById('portones-stat-fail');
        const elMaint = document.getElementById('portones-stat-maint');
        const elTotal = document.getElementById('portones-stat-total');

        if (elOk) elOk.textContent = ok;
        if (elFail) elFail.textContent = fail;
        if (elMaint) elMaint.textContent = maint;
        if (elTotal) elTotal.textContent = items.length;
    };

    window.saveAccessPointReview = async function () {
        const items = document.querySelectorAll('#portones-checklist-container .checklist-item');
        const user = getSession();
        const reviewData = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            user: user.email,
            officer: document.getElementById('portones-officer').value.trim() || user.username || 'Sistema',
            generalObs: document.getElementById('portones-obs').value.trim(),
            reviews: []
        };

        if (items.length === 0) return showNotification('NO HAY PUNTOS PARA EVALUAR', 'warning');

        items.forEach(item => {
            const apId = item.getAttribute('data-ap-id');
            reviewData.reviews.push({
                apId: apId,
                status: item.querySelector('.check-status').value,
                obs: item.querySelector('.check-obs').value.trim()
            });
        });

        const key = window.getSiteKey('holcim_access_points_reviews');
        const reviews = JSON.parse(localStorage.getItem(key) || '[]');
        reviews.unshift(reviewData);
        localStorage.setItem(key, JSON.stringify(reviews.slice(0, 100))); // Keep last 100

        showNotification('REVISIÓN DE PUNTOS DE ACCESO GUARDADA', 'success');
        addLogEvent('SISTEMA', 'Revisión de puntos de acceso completada');

        // Reset form
        document.getElementById('portones-obs').value = '';
        renderAccessPointsChecklist();
    };

    // Alias for the old button name in HTML
    window.savePortonesReview = window.saveAccessPointReview;

    window.renderAccessPointsHistory = function () {
        const container = document.getElementById('portones-history-container');
        if (!container) return;
        const key = window.getSiteKey('holcim_access_points_reviews');
        const reviews = JSON.parse(localStorage.getItem(key) || '[]');

        if (reviews.length === 0) {
            container.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted);">Sin historial de revisiones.</div>';
            return;
        }

        container.innerHTML = reviews.map(r => `
            <div class="card-panel" style="margin-bottom:0.8rem; padding:1rem; border:1px solid #cbd5e1; font-size:0.85rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                    <strong>REVISIÓN: ${new Date(r.date).toLocaleString()}</strong>
                    <span style="color:var(--primary-teal); font-weight:700;">POR: ${r.officer}</span>
                </div>
                ${r.generalObs ? `<div style="margin-bottom:0.5rem; color:#64748b;"><em>Obs: ${r.generalObs}</em></div>` : ''}
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:5px;">
                    ${r.reviews.map(rev => `
                        <div style="padding:4px; border-radius:4px; background:rgba(0,0,0,0.03); display:flex; justify-content:space-between;">
                            <span>#${rev.apId.slice(-4)}</span>
                            <span style="color:${rev.status === 'OPERATIVO' ? '#059669' : '#ef4444'}; font-weight:700;">${rev.status}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    };

    window.exportPortonesLogs = function (format) {
        const key = window.getSiteKey('holcim_access_points_reviews');
        const reviews = JSON.parse(localStorage.getItem(key) || '[]');
        if (reviews.length === 0) return showNotification('NO HAY DATOS PARA EXPORTAR', 'warning');

        if (format === 'pdf') {
            window.print();
        } else {
            // CSV Export
            let csv = "\uFEFFFECHA,OFICIAL,PUNTO,ESTADO,OBSERVACION\n";
            reviews.forEach(r => {
                r.reviews.forEach(rev => {
                    csv += `"${new Date(r.date).toLocaleString()}","${r.officer}","${rev.apId}","${rev.status}","${rev.obs}"\n`;
                });
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Revisiones_Puntos_Acceso_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        }
    };

    window.renderCctvMonitoring = function () {
        renderDailyCctvChecklist();
        renderVirtualRoundsList();
    };

    window.renderDailyCctvChecklist = function () {
        const container = document.getElementById('cctv-daily-checklist-container');
        if (!container) return;
        const cameras = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_cctv_inventory')) || '[]');

        if (cameras.length === 0) {
            container.innerHTML = '<div class="alert-info-light">No hay cámaras registradas en el inventario. Genere el inventario primero.</div>';
            return;
        }

        container.innerHTML = cameras.map(cam => `
            <div class="card-panel checklist-item" data-cam-id="${cam.id}" style="margin-bottom: 1rem; border: 1px solid #e2e8f0;">
                <div style="display: grid; grid-template-columns: 200px 1fr; gap: 20px; align-items: start; padding: 1rem;">
                    <div>
                        <strong style="display:block; font-size:1rem; color:var(--navy-black);"># ${cam.type}</strong>
                        <span style="font-size:0.8rem; color:var(--primary-teal); font-family:monospace;">${cam.ip}</span><br>
                        <span style="font-size:0.8rem; font-weight:700;">${cam.location}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
                        <div class="check-group">
                            <label class="form-label" style="font-size:0.6rem;">Visual Video</label>
                            <select class="check-visual"><option value="OK">OK</option><option value="FALLA">FALLA</option></select>
                        </div>
                        <div class="check-group">
                            <label class="form-label" style="font-size:0.6rem;">Audio 2 Vías</label>
                            <select class="check-audio"><option value="OK">OK</option><option value="FALLA">FALLA</option><option value="N/A">N/A</option></select>
                        </div>
                        <div class="check-group">
                            <label class="form-label" style="font-size:0.6rem;">Analíticas</label>
                            <select class="check-analytics"><option value="OK">OK</option><option value="FALLA">FALLA</option></select>
                        </div>
                        <div class="check-group">
                            <label class="form-label" style="font-size:0.6rem;">Alertas Sec.</label>
                            <select class="check-alerts"><option value="OK">OK</option><option value="FALLA">FALLA</option></select>
                        </div>
                        <div class="check-group">
                            <label class="form-label" style="font-size:0.6rem;">Equip. Monit.</label>
                            <select class="check-hardware"><option value="OK">OK</option><option value="FALLA">FALLA</option></select>
                        </div>
                    </div>
                </div>
                <div style="padding: 0 1rem 1rem 1rem; display: grid; grid-template-columns: 1fr 200px; gap: 1rem;">
                    <textarea class="check-obs" placeholder="Observaciones y seguimiento..." style="width:100%; height:40px; font-size:0.8rem;"></textarea>
                    <div>
                         <label class="form-label" style="font-size:0.6rem;">Adjuntar Evidencia</label>
                         <input type="file" class="check-photo" accept="image/*" style="font-size:0.7rem;">
                    </div>
                </div>
            </div>
        `).join('');
    };

    window.saveCctvDailyReview = async function () {
        const items = document.querySelectorAll('.checklist-item');
        const user = getSession();
        const reviewData = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            user: user.email,
            type: 'DAILY',
            reviews: []
        };

        for (const item of items) {
            const camId = item.getAttribute('data-cam-id');
            const photoInput = item.querySelector('.check-photo');
            let photoBase64 = null;

            if (photoInput.files && photoInput.files[0]) {
                photoBase64 = await toBase64(photoInput.files[0]);
            }

            reviewData.reviews.push({
                camId: camId,
                visual: item.querySelector('.check-visual').value,
                audio: item.querySelector('.check-audio').value,
                analytics: item.querySelector('.check-analytics').value,
                alerts: item.querySelector('.check-alerts').value,
                hardware: item.querySelector('.check-hardware').value,
                observation: item.querySelector('.check-obs').value,
                photo: photoBase64
            });
        }

        const key = window.getSiteKey('holcim_cctv_reviews');
        const reviews = JSON.parse(localStorage.getItem(key) || '[]');
        reviews.push(reviewData);
        localStorage.setItem(key, JSON.stringify(reviews));

        showNotification('REVISIÓN DIARIA GUARDADA', 'success');
        addLogEvent('CCTV', 'Revisión técnica diaria completada');
        switchCctvMonTab('mon-history', document.querySelector('[onclick*="mon-history"]'));
    };

    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    // --- VIRTUAL ROUNDS PATROL ---
    const roundForm = document.getElementById('cctv-round-form');
    if (roundForm) {
        roundForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const photoInput = document.getElementById('round-photo');
            let photoBase64 = null;
            if (photoInput.files && photoInput.files[0]) photoBase64 = await toBase64(photoInput.files[0]);

            const round = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                user: getSession().email,
                type: 'ROUND',
                sector: document.getElementById('round-sector').value,
                points: document.getElementById('round-points').value,
                status: document.getElementById('round-status').value,
                detail: document.getElementById('round-detail').value,
                photo: photoBase64
            };

            const key = window.getSiteKey('holcim_virtual_rounds');
            const rounds = JSON.parse(localStorage.getItem(key) || '[]');
            rounds.push(round);
            localStorage.setItem(key, JSON.stringify(rounds));

            showNotification('RONDA VIRTUAL REGISTRADA', 'success');
            roundForm.reset();
            renderVirtualRoundsList();
        });
    }

    window.renderVirtualRoundsList = function () {
        const body = document.getElementById('cctv-rounds-list-body');
        if (!body) return;
        const rounds = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_virtual_rounds')) || '[]');

        body.innerHTML = rounds.slice().reverse().map(r => `
            <div class="list-row" style="grid-template-columns: 100px 150px 1fr 120px 80px 80px;">
                <span>${new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span style="font-weight:700;">${r.sector}</span>
                <span style="font-size:0.8rem;">${r.detail || '-'}</span>
                <span class="badge-motivo" style="color:white; background:${r.status === 'SIN NOVEDAD' ? '#059669' : '#DC2626'}">${r.status}</span>
                <div>${r.photo ? `<button class="btn-salida-corpo" onclick="viewCctvPhoto('${r.photo}')">VER</button>` : '-'}</div>
                <div><button class="btn-salida-corpo" style="background:#64748b" onclick="deleteCctvItem('ROUND', '${r.id}')">BORRAR</button></div>
            </div>
        `).join('');
    };

    window.viewCctvPhoto = function (base64) {
        const win = window.open();
        win.document.write('<html><body style="margin:0; background:#000; display:flex; justify-content:center; align-items:center;"><img src="' + base64 + '" style="max-width:100%; max-height:100%;"></body></html>');
    };

    window.deleteCctvItem = function (type, id) {
        if (!confirm('¿Eliminar registro?')) return;
        const key = type === 'ROUND' ? window.getSiteKey('holcim_virtual_rounds') : window.getSiteKey('holcim_cctv_reviews');
        let items = JSON.parse(localStorage.getItem(key));
        items = items.filter(i => i.id !== id);
        localStorage.setItem(key, JSON.stringify(items));
        if (type === 'ROUND') renderVirtualRoundsList(); else renderCctvHistory();
    };

    window.renderCctvHistory = function () {
        const container = document.getElementById('cctv-history-container');
        if (!container) return;

        const reviews = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_cctv_reviews')) || '[]');
        const rounds = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_virtual_rounds')) || '[]');

        let all = [...reviews.map(r => ({ ...r, type: 'DAILY_REVIEW' })), ...rounds.map(r => ({ ...r, type: 'ROUND' }))];
        all.sort((a, b) => new Date(b.date) - new Date(a.date));

        container.innerHTML = all.map(item => `
            <div class="card-panel" style="margin-bottom:1rem; border-left: 5px solid ${item.type === 'ROUND' ? '#3b82f6' : '#10b981'}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${item.type === 'ROUND' ? 'RONDA VIRTUAL' : 'REVISIÓN DIARIA'}</strong>
                        <span style="margin-left:10px; color:var(--text-muted);">${new Date(item.date).toLocaleString()}</span>
                    </div>
                    <div>
                        <button class="btn-salida-corpo" onclick="deleteCctvItem('${item.type === 'ROUND' ? 'ROUND' : 'REVIEW'}', '${item.id}')">ELIMINAR</button>
                    </div>
                </div>
                <p style="margin:10px 0; font-size:0.9rem;">${item.detail || item.sector || (item.reviews ? 'Revision de ' + item.reviews.length + ' puntos de inventario' : '')}</p>
            </div>
        `).join('');
    };

    window.exportCctvLogs = function (format) {
        const rounds = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_virtual_rounds')) || '[]');
        const html = `
            <h2>Reporte de Monitoreo CCTV - Holcim</h2>
            <table border="1">
                <tr><th>Fecha/Hora</th><th>Tipo</th><th>Usuario</th><th>Detalle/Sector</th><th>Estado</th></tr>
                ${rounds.map(r => `<tr><td>${new Date(r.date).toLocaleString()}</td><td>Ronda</td><td>${r.user}</td><td>${r.sector}</td><td>${r.status}</td></tr>`).join('')}
            </table>
        `;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_CCTV_${new Date().toLocaleDateString()}.xls`;
        a.click();
    };

    // --- PDF PRINT STYLE ---
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            .nav-bar, .header-top, .export-actions, .filter-bar, .panel-header h3 i, .btn-submit-action, .btn-salida-corpo, #btn-logout-header, .login-overlay { display: none !important; }
            .view-section { display: none !important; }
            .view-section[style*="display: block"], .view-section.active-view { display: block !important; opacity: 1 !important; visibility: visible !important; }
            .card-panel { box-shadow: none !important; border: 1px solid #e2e8f0 !important; margin-bottom: 25px; padding: 15px !important; break-inside: avoid; }
            .monitor-list { max-height: none !important; overflow: visible !important; width: 100% !important; }
            .list-head { background: #1e293b !important; color: white !important; border: 1px solid #000 !important; font-weight: bold !important; -webkit-print-color-adjust: exact; }
            .list-row { break-inside: avoid; border-bottom: 1px solid #cbd5e1 !important; display: grid !important; background: transparent !important; color: #1e293b !important; }
            .list-row:nth-child(even) { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
            body { background: white !important; margin: 0 !important; padding: 15mm !important; font-size: 10pt; }
            #executive-print-report, #executive-print-report * { visibility: visible !important; display: block !important; }
            .main-wrapper { padding: 0 !important; margin: 0 !important; width: 100% !important; }
            h3 { color: #1e293b; border-left: 5px solid #009cbd; padding-left: 10px; margin-bottom: 15px; }
            .badge-motivo, .induction-status { border: 1px solid #cbd5e1 !important; background: transparent !important; color: black !important; -webkit-print-color-adjust: exact; }
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

    // STARTUP SEQUENCE
    try {
        checkAuth();
        updateCounters();
        renderLiveLog();
        updateOfficersDatalist();
    } catch (e) {
        console.error("Startup Sequence Error:", e);
    }

    // --- QR/BARCODE SCANNER ---
    window.html5QrCode = null;

    window.openScanner = function () {
        const modal = document.getElementById('modal-scanner');
        if (modal) modal.style.display = 'flex';

        if (!window.html5QrCode) {
            window.html5QrCode = new Html5Qrcode("reader");
        }

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        window.html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                // Success: Assuming decodedText is the ID number
                const idInput = document.getElementById('idNumber');
                if (idInput) {
                    idInput.value = decodedText;
                    // Trigger lookup
                    idInput.dispatchEvent(new Event('blur'));
                }
                window.closeScanner();
                showNotification('CÓDIGO ESCANEADO', 'success');
            },
            (errorMessage) => {
                // parse error, ignore
            }
        ).catch((err) => {
            console.error("Error starting scanner:", err);
            showNotification('ERROR AL INICIAR CÁMARA', 'danger');
        });
    };

    // Event Listeners for Scanner

    const btnScanId = document.getElementById('btn-scan-id');
    if (btnScanId) {
        btnScanId.addEventListener('click', window.openScanner);
    }

    // --- VOICE RECOGNITION ---
    const btnVoiceId = document.getElementById('btn-voice-id');
    if (btnVoiceId) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = 'es-ES';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onstart = function () {
                btnVoiceId.classList.add('pulse-active');
                showNotification('DICTE LA CÉDULA...', 'info');
            };

            recognition.onresult = function (event) {
                const speechResult = event.results[0][0].transcript;
                console.log('Voice Result:', speechResult);

                // Relaxed cleaning: keep numbers and dashes, handles "guión" or "raya" verbally
                let cleaned = speechResult.toLowerCase()
                    .replace(/guion|guión|raya/g, '-')
                    .replace(/[^\d-]/g, '');

                const idInput = document.getElementById('idNumber');
                if (idInput && cleaned) {
                    idInput.value = cleaned;
                    idInput.dispatchEvent(new Event('input'));
                    idInput.dispatchEvent(new Event('blur'));
                    showNotification('CÉDULA RECONOCIDA: ' + cleaned, 'success');
                } else {
                    showNotification('NO SE RECONOCIÓ UN NÚMERO VÁLIDO', 'warning');
                }
                btnVoiceId.classList.remove('pulse-active');
            };

            recognition.onerror = function (event) {
                btnVoiceId.classList.remove('pulse-active');
                const errorMessages = {
                    'network': 'ERROR DE RED',
                    'not-allowed': 'MICRÓFONO BLOQUEADO',
                    'no-speech': 'NO SE DETECTÓ VOZ',
                    'aborted': 'RECONOCIMIENTO CANCELADO'
                };
                showNotification(errorMessages[event.error] || 'ERROR DE VOZ: ' + event.error, 'danger');
            };

            recognition.onend = function () {
                btnVoiceId.classList.remove('pulse-active');
            };

            btnVoiceId.addEventListener('click', function () {
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Recognition start error:", e);
                    // Silently ignore if already started
                }
            });
        } else {
            btnVoiceId.style.display = 'none'; // Hide if not supported
            console.warn("Speech Recognition not supported in this browser.");
        }
    }
});

function renderInductions() {
    const body = document.getElementById('induction-list-body');
    if (!body) return;
    const inductions = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_inductions')) || '[]');
    const search = (document.getElementById('induction-search')?.value || '').toLowerCase();
    const start = document.getElementById('ind-date-start')?.value;
    const end = document.getElementById('ind-date-end')?.value;
    const status = document.getElementById('filter-ind-status')?.value || 'ALL';

    const filtered = inductions.filter(i => {
        const matchesSearch = i.fullName.toLowerCase().includes(search) || (i.idNumber || '').includes(search) || i.company.toLowerCase().includes(search);
        const indDate = i.date;
        const matchesDate = (!start || indDate >= start) && (!end || indDate <= end);
        const isExpired = new Date(i.expiry) < new Date();
        const matchesStatus = status === 'ALL' || (status === 'valid' && !isExpired) || (status === 'expired' && isExpired);
        return matchesSearch && matchesDate && matchesStatus;
    });

    body.innerHTML = filtered.map(i => {
        const isExpired = new Date(i.expiry) < new Date();
        return `
                <div class="list-row" style="grid-template-columns: 120px 1fr 140px 140px 120px 100px;">
                    <span>${i.idNumber}</span>
                    <strong style="font-size: 0.9rem;">${i.fullName}</strong>
                    <span style="font-size: 0.8rem;">${i.company}</span>
                    <span style="font-size: 0.8rem;">${i.department || '-'}</span>
                    <span style="font-size: 0.8rem;">${i.date}</span>
                    <div><span class="induction-status ${isExpired ? 'status-missing' : 'status-active'}">${isExpired ? 'VENCIDA' : 'VIGENTE'}</span></div>
                </div>
            `;
    }).join('');
}

window.exportInductions = function (format) {
    const inductions = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_inductions')) || '[]');
    if (inductions.length === 0) return showNotification('NO HAY DATOS PARA EXPORTAR', 'danger');

    const siteName = getSession()?.site || 'HOLCIM';

    if (format === 'xlsx') {
        const title = `BASE DE DATOS DE INDUCCIONES - ${siteName}`;
        const date = new Date().toLocaleString();

        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"/><style>
                .title { font-size: 16pt; font-weight: bold; color: #DC2626; text-align: center; }
                .header { background-color: #1e293b; color: white; font-weight: bold; border: 1px solid #000; }
                .cell { border: 1px solid #ccc; font-size: 10pt; }
                .status-valid { color: #10b981; font-weight: bold; }
                .status-expired { color: #ef4444; font-weight: bold; }
            </style></head>
            <body>
                <table>
                    <tr><td colspan="7" class="title">${title}</td></tr>
                    <tr><td colspan="7" style="text-align:right">Fecha: ${date}</td></tr>
                    <tr class="header">
                        <th>CEDULA</th><th>NOMBRE</th><th>EMPRESA</th><th>DEPARTAMENTO</th>
                        <th>RESPONSABLE</th><th>FECHA INDUCCION</th><th>VENCIMIENTO</th><th>ESTADO</th>
                    </tr>
        `;

        inductions.forEach(i => {
            const isExpired = new Date(i.expiry) < new Date();
            html += `
                <tr>
                    <td class="cell">${i.idNumber}</td>
                    <td class="cell">${i.fullName}</td>
                    <td class="cell">${i.company}</td>
                    <td class="cell">${i.department || '-'}</td>
                    <td class="cell">${i.responsible || '-'}</td>
                    <td class="cell">${i.date}</td>
                    <td class="cell">${i.expiry}</td>
                    <td class="cell ${isExpired ? 'status-expired' : 'status-valid'}">${isExpired ? 'VENCIDA' : 'VIGENTE'}</td>
                </tr>
            `;
        });

        html += `</table></body></html>`;

        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Inducciones_${siteName}_${new Date().toISOString().split('T')[0]}.xls`;
        a.click();
    } else { window.print(); }
};

// Add search listener for inductions
document.getElementById('induction-search')?.addEventListener('input', renderInductions);
// Modal Closers
window.closeEditAuthModal = () => document.getElementById('modal-edit-auth').style.display = 'none';
window.closeEditKeyModal = () => document.getElementById('modal-edit-key-loan').style.display = 'none';
window.closeEditPackageModal = () => document.getElementById('modal-edit-package').style.display = 'none';
window.closeContractorModal = () => document.getElementById('modal-contractor-hours').style.display = 'none';
window.closeAlertsModal = () => document.getElementById('modal-security-alerts').style.display = 'none';
window.closeEditModal = () => document.getElementById('modal-edit-entry').style.display = 'none';
window.closeScanner = function () {
    const modal = document.getElementById('modal-scanner');
    if (modal) modal.style.display = 'none';
    // The stop logic is handled inside the DOMContentLoaded listener if we use the singleton approach,
    // but since we want to be able to close it from anywhere, we ensure it's accessible.
    // If html5QrCode is defined in the outer scope or window, we can stop it here.
};
window.closeTraceabilityModal = () => document.getElementById('modal-traceability').style.display = 'none';

// --- ACCESS POINTS LOGIC ---
window.renderDbAccessPoints = function () {
    const body = document.getElementById('db-access-points-list-body');
    if (!body) return;
    const items = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_points')) || '[]');
    if (items.length === 0) {
        body.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);grid-column:1/-1">No hay puntos de acceso registrados.</div>';
        return;
    }

    const statusColor = { 'OPERATIVO': '#22c55e', 'FALLA': '#ef4444', 'MANTENIMIENTO': '#f59e0b', 'FUERA DE SERVICIO': '#64748b' };
    body.innerHTML = items.map((ap, idx) => `
        <div class="list-row" style="grid-template-columns: 1fr 1fr 110px 130px 60px 70px; align-items: center;">
            <div>
                <strong style="color:var(--primary-teal)">${ap.name}</strong>
                ${ap.lat && ap.lng ? ` <button class="btn-salida-corpo" onclick="panToAP(${ap.lat}, ${ap.lng})" style="padding:0 4px; font-size:0.55rem; background:#64748b; color:white; border:none; border-radius:3px;"><i class="fas fa-location-dot"></i></button>` : ''}
                ${ap.obs ? `<p style="font-size:0.7rem;color:var(--text-muted);margin:0">${ap.obs}</p>` : ''}
            </div>
            <span style="font-size:0.85rem">${ap.location}</span>
            <span class="badge-motivo" style="font-size:0.65rem">${ap.type}</span>
            <div><span class="induction-status" style="background:${statusColor[ap.status] || '#888'}20;color:${statusColor[ap.status] || '#888'};border:1px solid ${statusColor[ap.status] || '#888'}40;font-size:0.65rem">${ap.status}</span></div>
            <div>
                ${ap.photo ? `<img src="${ap.photo}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid var(--border-gray)" onclick="showApPhoto('${idx}')" title="Ver foto">` : '<span style="color:var(--text-muted);font-size:0.75rem">-</span>'}
            </div>
            <div><button class="btn-salida-corpo" onclick="deleteAccessPoint(${idx})" style="padding:3px 10px;font-size:0.7rem;background:#ef4444;color:white;border-color:#ef4444"><i class="fas fa-trash"></i></button></div>
        </div>
    `).join('');
};

window.showApPhoto = function (idx) {
    const items = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_points')) || '[]');
    const ap = items[idx];
    if (!ap || !ap.photo) return;
    const win = window.open('', '_blank', 'width=600,height=500');
    win.document.write(`<html><body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh"><img src="${ap.photo}" style="max-width:100%;max-height:100%;object-fit:contain"><\/body><\/html>`);
};

window.deleteAccessPoint = function (idx) {
    if (!confirm('¿Eliminar este punto de acceso?')) return;
    const key = window.getSiteKey('holcim_access_points');
    let items = JSON.parse(localStorage.getItem(key) || '[]');
    items.splice(idx, 1);
    localStorage.setItem(key, JSON.stringify(items));
    window.renderDbAccessPoints();
    showNotification('PUNTO DE ACCESO ELIMINADO', 'info');
};

// --- MAP LOGIC ---
window.apMap = null;
window.apMarkers = [];

window.toggleAPMap = function () {
    const wrapper = document.getElementById('ap-map-wrapper');
    const btn = document.getElementById('btn-toggle-map');
    if (!wrapper || !btn) return;

    if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i> OCULTAR MAPA';
        btn.style.background = '#64748b';
        if (!window.apMap) {
            initAPMap();
        } else {
            // Invalidate size to fix container issues with Leaflet
            setTimeout(() => window.apMap.invalidateSize(), 100);
        }
    } else {
        wrapper.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-map-location-dot"></i> VER MAPA INTERACTIVO';
        btn.style.background = 'var(--primary-teal)';
    }
};

window.initAPMap = function () {
    // Default center (can be refined based on site)
    const lat = 9.9281, lng = -84.0907;
    window.apMap = L.map('ap-map').setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(window.apMap);

    updateMapMarkers();
};

window.updateMapMarkers = function () {
    if (!window.apMap) return;

    // Clear old markers
    window.apMarkers.forEach(m => window.apMap.removeLayer(m));
    window.apMarkers = [];

    const items = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_access_points')) || '[]');

    items.forEach(ap => {
        if (ap.lat && ap.lng) {
            const marker = L.marker([ap.lat, ap.lng]).addTo(window.apMap);
            marker.bindPopup(`
                <div style="font-family:Inter; padding:5px;">
                    <strong style="color:var(--navy-black)">${ap.name}</strong><br>
                    <span style="font-size:0.75rem">${ap.location}</span><br>
                    <button class="btn-crear" style="font-size:0.6rem; padding:4px 8px; margin-top:5px;" onclick="focusAPChecklist('${ap.id}')">REVISAR AHORA</button>
                </div>
            `);
            window.apMarkers.push(marker);
        }
    });
};

window.focusAPChecklist = function (apId) {
    const item = document.querySelector(`[data-ap-id="${apId}"]`);
    if (item) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.style.boxShadow = '0 0 15px var(--primary-teal)';
        setTimeout(() => item.style.boxShadow = 'none', 2000);
    }
};

window.panToAP = function (lat, lng) {
    if (!window.apMap) {
        toggleAPMap();
        setTimeout(() => window.apMap.panTo([lat, lng]), 500);
    } else {
        if (document.getElementById('ap-map-wrapper').style.display === 'none') toggleAPMap();
        window.apMap.panTo([lat, lng]);
    }
};

const apForm = document.getElementById('db-access-point-form');
if (apForm) {
    apForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const name = document.getElementById('db-ap-name').value.trim().toUpperCase();
        const location = document.getElementById('db-ap-location').value.trim().toUpperCase();
        const type = document.getElementById('db-ap-type').value;
        const status = document.getElementById('db-ap-status').value;
        const obs = document.getElementById('db-ap-obs').value.trim();
        const lat = document.getElementById('db-ap-lat').value;
        const lng = document.getElementById('db-ap-lng').value;
        const photoInput = document.getElementById('db-ap-photo');

        const saveRecord = (photoData) => {
            const key = window.getSiteKey('holcim_access_points');
            const items = JSON.parse(localStorage.getItem(key) || '[]');
            items.unshift({
                id: Date.now(),
                name,
                location,
                type,
                status,
                obs,
                lat: lat ? parseFloat(lat) : null,
                lng: lng ? parseFloat(lng) : null,
                photo: photoData || null
            });
            localStorage.setItem(key, JSON.stringify(items));
            showNotification('PUNTO DE ACCESO REGISTRADO', 'success');
            addLogEvent('DB', 'Nuevo punto de acceso: ' + name);
            apForm.reset();
            document.getElementById('db-ap-obs').value = '';
            window.renderDbAccessPoints();
            if (window.updateMapMarkers) window.updateMapMarkers();
            triggerAutoBackup();
        };

        if (photoInput && photoInput.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => saveRecord(ev.target.result);
            reader.readAsDataURL(photoInput.files[0]);
        } else {
            saveRecord(null);
        }
    });
}

// --- CCTV MAP LOGIC ---
window.cctvMap = null;
window.cctvMarkers = [];

window.toggleCctvMap = function () {
    const wrapper = document.getElementById('cctv-map-wrapper');
    if (!wrapper) {
        showNotification('Error: No se encontró el contenedor del mapa', 'error');
        return;
    }

    if (wrapper.style.display === 'none' || !wrapper.style.display) {
        wrapper.style.display = 'block';
        showNotification('Cargando Mapa...', 'info');
        if (!window.cctvMap) {
            window.initCctvMap();
        } else {
            setTimeout(() => {
                window.cctvMap.invalidateSize();
                window.updateCctvMapMarkers();
            }, 100);
        }
    } else {
        wrapper.style.display = 'none';
    }
};

window.initCctvMap = function () {
    const mapDiv = document.getElementById('cctv-map');
    if (!mapDiv) {
        console.error('CCTV Map div not found');
        return;
    }

    // Default coordinates if none provided
    const lat = 9.9281, lng = -84.0907;

    try {
        window.cctvMap = L.map('cctv-map').setView([lat, lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(window.cctvMap);

        setTimeout(() => {
            window.cctvMap.invalidateSize();
            window.updateCctvMapMarkers();
        }, 300);
    } catch (e) {
        console.error('Error initializing CCTV Map:', e);
    }
};

window.updateCctvMapMarkers = function () {
    if (!window.cctvMap) return;

    // Clear old markers
    if (window.cctvMarkers) {
        window.cctvMarkers.forEach(m => window.cctvMap.removeLayer(m));
    }
    window.cctvMarkers = [];

    // Get filter values
    const searchInput = document.getElementById('cctv-map-search');
    const typeSelect = document.getElementById('cctv-map-filter-type');
    const statusSelect = document.getElementById('cctv-map-filter-status');

    const searchTerm = (searchInput?.value || '').toLowerCase();
    const filterType = typeSelect?.value || 'ALL';
    const filterStatus = statusSelect?.value || 'ALL';

    const items = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_cctv_inventory')) || '[]');

    const filteredItems = items.filter(cam => {
        const matchesSearch = !searchTerm ||
            (cam.location || '').toLowerCase().includes(searchTerm) ||
            (cam.type || '').toLowerCase().includes(searchTerm) ||
            (cam.ip || '').toLowerCase().includes(searchTerm);

        const matchesType = filterType === 'ALL' || cam.type === filterType;
        const matchesStatus = filterStatus === 'ALL' || cam.status === filterStatus;

        return matchesSearch && matchesType && matchesStatus;
    });

    filteredItems.forEach(cam => {
        if (cam.lat != null && cam.lng != null) {
            let color = '#0284c7'; // Default Blue
            if (cam.status === 'FALLA') color = '#ef4444';
            if (cam.status === 'MANTENIMIENTO') color = '#f59e0b';

            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3); color: white;"><i class="fas fa-video" style="font-size: 14px;"></i></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            const marker = L.marker([cam.lat, cam.lng], { icon }).addTo(window.cctvMap);
            marker.bindPopup(`
                <div style="font-family:Inter; padding:5px; min-width:150px;">
                    <strong style="color:var(--navy-black); border-bottom:1px solid #eee; display:block; padding-bottom:3px; margin-bottom:5px;">${cam.type}</strong>
                    <div style="font-size:0.75rem; margin-bottom:3px;"><i class="fas fa-location-dot" style="width:15px;"></i> ${cam.location}</div>
                    <div style="font-size:0.75rem; color:var(--primary-teal); font-family:monospace; margin-bottom:3px;"><i class="fas fa-network-wired" style="width:15px;"></i> ${cam.ip}</div>
                    <div style="font-size:0.75rem;"><i class="fas fa-circle" style="width:15px; color:${color}"></i> ${cam.status}</div>
                </div>
            `);
            window.cctvMarkers.push(marker);
        }
    });

    // Auto-center map to markers if there are any
    if (filteredItems.length > 0 && window.cctvMap) {
        const coords = filteredItems.filter(cam => cam.lat != null && cam.lng != null).map(cam => [cam.lat, cam.lng]);
        if (coords.length > 0) {
            window.cctvMap.fitBounds(coords, { padding: [50, 50], maxZoom: 17 });
        }
    }
};
window.pickerMap = null;
window.pickerMarker = null;
window.activeLatId = null;
window.activeLngId = null;

window.openMapPicker = function (latId, lngId) {
    window.activeLatId = latId;
    window.activeLngId = lngId;
    const modal = document.getElementById('modal-map-picker');
    if (modal) modal.style.display = 'flex';

    if (!window.pickerMap) {
        window.pickerMap = L.map('picker-map').setView([9.9281, -84.0907], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.pickerMap);

        window.pickerMap.on('click', function (e) {
            const { lat, lng } = e.latlng;
            if (window.pickerMarker) window.pickerMap.removeLayer(window.pickerMarker);
            window.pickerMarker = L.marker([lat, lng]).addTo(window.pickerMap);
            document.getElementById('picker-coords-display').textContent = `[ ${lat.toFixed(6)} , ${lng.toFixed(6)} ]`;
            window.tempCoords = { lat, lng };
        });
    } else {
        setTimeout(() => window.pickerMap.invalidateSize(), 100);
    }

    // Reset picker state
    if (window.pickerMarker) window.pickerMap.removeLayer(window.pickerMarker);
    window.pickerMarker = null;
    document.getElementById('picker-coords-display').textContent = '[ - , - ]';
    window.tempCoords = null;
};

window.closeMapPicker = function () {
    const modal = document.getElementById('modal-map-picker');
    if (modal) modal.style.display = 'none';
};

window.confirmMapPickerSelection = function () {
    if (window.tempCoords && window.activeLatId && window.activeLngId) {
        document.getElementById(window.activeLatId).value = window.tempCoords.lat.toFixed(6);
        document.getElementById(window.activeLngId).value = window.tempCoords.lng.toFixed(6);
        window.closeMapPicker();
        showNotification('UBICACIÓN SELECCIONADA', 'success');
    } else {
        showNotification('POR FAVOR MARQUE UN PUNTO EN EL MAPA', 'warning');
    }
};

// --- CALENDAR LOGIC ---
window.calendarDate = new Date();

window.renderCalendar = function () {
    const grid = document.getElementById('calendar-grid');
    const monthHeader = document.getElementById('calendar-month-year');
    if (!grid || !monthHeader) return;

    grid.innerHTML = '';
    const year = window.calendarDate.getFullYear();
    const month = window.calendarDate.getMonth();

    monthHeader.textContent = window.calendarDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();

    const firstDay = new Date(year, month, 1).getDay(); // 0(Sun) - 6(Sat)
    // Adjust to Monday start: 0->6, 1->0, 2->1, 3->2, 4->3, 5->4, 6->5
    const firstDayMonday = firstDay === 0 ? 6 : firstDay - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    // Previous month days
    for (let i = firstDayMonday; i > 0; i--) {
        const day = prevMonthLastDay - i + 1;
        const cell = createDayCell(day, true, month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
        grid.appendChild(cell);
    }

    // Current month days
    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const isToday = i === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const cell = createDayCell(i, false, year, month, isToday);
        grid.appendChild(cell);
    }

    // Fill remaining cells (Next month)
    const totalCells = grid.children.length;
    const remaining = 42 - totalCells; // 6 rows of 7 days
    for (let i = 1; i <= remaining; i++) {
        const cell = createDayCell(i, true, month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);
        grid.appendChild(cell);
    }
};

function createDayCell(day, isOtherMonth, year, month, isToday = false) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const div = document.createElement('div');
    div.className = `calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;
    div.onclick = () => window.openEventModal(dateStr);

    div.innerHTML = `<span class="day-number">${day}</span>`;

    const events = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_calendar_events')) || '{}');
    const dayEvents = events[dateStr] || [];

    dayEvents.forEach((ev) => {
        const evDiv = document.createElement('div');
        evDiv.className = 'calendar-event';
        evDiv.style.background = ev.color || 'var(--primary-teal)';
        evDiv.textContent = ev.title;
        evDiv.title = ev.description || ev.title;
        div.appendChild(evDiv);
    });

    return div;
}

window.changeMonth = function (offset) {
    window.calendarDate.setMonth(window.calendarDate.getMonth() + offset);
    renderCalendar();
};

window.openEventModal = function (dateStr) {
    const modal = document.getElementById('modal-calendar-event');
    const dateDisplay = document.getElementById('event-date-display');
    const dateInput = document.getElementById('event-date');
    const titleInput = document.getElementById('event-title');
    const descInput = document.getElementById('event-desc');
    const btnDelete = document.getElementById('btn-delete-event');

    if (!modal) return;

    const parts = dateStr.split('-');
    const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    dateDisplay.textContent = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    dateInput.value = dateStr;

    const events = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_calendar_events')) || '{}');
    const event = events[dateStr] ? events[dateStr][0] : null;

    const timeInput = document.getElementById('event-time');
    if (event) {
        titleInput.value = event.title;
        descInput.value = event.description || '';
        if (timeInput) timeInput.value = event.time || '09:00';
        const radio = document.querySelector(`input[name = "event-color"][value = "${event.color}"]`);
        if (radio) radio.checked = true;
        btnDelete.style.display = 'block';
    } else {
        titleInput.value = '';
        descInput.value = '';
        if (timeInput) timeInput.value = '09:00';
        const defaultRadio = document.querySelector('input[name="event-color"][value="var(--primary-teal)"]');
        if (defaultRadio) defaultRadio.checked = true;
        btnDelete.style.display = 'none';
    }

    modal.style.display = 'flex';
};

window.closeEventModal = () => {
    const modal = document.getElementById('modal-calendar-event');
    if (modal) modal.style.display = 'none';
};

document.getElementById('event-form')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const dateStr = document.getElementById('event-date').value;
    const title = document.getElementById('event-title').value.trim().toUpperCase();
    const desc = document.getElementById('event-desc').value.trim();
    const time = document.getElementById('event-time')?.value || '09:00';
    const color = document.querySelector('input[name="event-color"]:checked').value;

    const events = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_calendar_events')) || '{}');
    events[dateStr] = [{ title, description: desc, time, color, notified: false }];

    localStorage.setItem(window.getSiteKey('holcim_calendar_events'), JSON.stringify(events));
    renderCalendar();
    closeEventModal();
    showNotification('EVENTO GUARDADO', 'success');
    triggerAutoBackup();
});

window.deleteEvent = function () {
    const dateStr = document.getElementById('event-date').value;
    const events = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_calendar_events')) || '{}');
    delete events[dateStr];
    localStorage.setItem(window.getSiteKey('holcim_calendar_events'), JSON.stringify(events));
    renderCalendar();
    closeEventModal();
    showNotification('EVENTO ELIMINADO', 'warning');
    triggerAutoBackup();
};

// --- ALERT SYSTEM ---
window.checkCalendarAlerts = function () {
    const events = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_calendar_events')) || '{}');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5); // HH:MM

    const dayEvents = events[dateStr] || [];
    let alerted = false;

    dayEvents.forEach(ev => {
        // If event has time and it matches current time, and hasn't been notified yet
        if (ev.time === timeStr && !ev.notified) {
            triggerAlert(ev);
            ev.notified = true;
            alerted = true;
        }
    });

    if (alerted) {
        localStorage.setItem(window.getSiteKey('holcim_calendar_events'), JSON.stringify(events));
    }
};

window.triggerAlert = function (event) {
    // Visual Alert
    showNotification(`ALERTA: ${event.title}`, 'warning');

    // Audible Alert
    const audio = document.getElementById('notification_sound') || new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(e => console.warn('Audio play failed:', e));

    // Browser Notification (if permission granted)
    if (Notification.permission === 'granted') {
        new Notification('HOLCIM SEGURIDAD', {
            body: `EVENTO: ${event.title}\n${event.description || ''}`,
            icon: 'favicon.ico'
        });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
};

// --- SAFETY REPORT SYSTEM ---
window.openSafetyReportModal = function () {
    const modal = document.getElementById('modal-safety-report');
    if (!modal) return;

    // Set default values
    const now = new Date();
    document.getElementById('sr-date').value = now.toISOString().split('T')[0];
    document.getElementById('sr-time').value = now.toTimeString().slice(0, 5);

    const session = JSON.parse(localStorage.getItem('holcim_session'));
    if (session && session.email) {
        document.getElementById('sr-officer').value = session.email.split('@')[0].toUpperCase();
    }

    modal.style.display = 'flex';
};

window.closeSafetyReportModal = function () {
    const modal = document.getElementById('modal-safety-report');
    if (modal) modal.style.display = 'none';
    document.getElementById('safety-report-form').reset();
    document.getElementById('sr-photo-preview').style.display = 'none';
};

window.previewSafetyImage = function (event) {
    const input = event.target;
    const preview = document.getElementById('sr-photo-preview');
    const img = document.getElementById('sr-preview-img');

    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            img.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.downloadSafetyReportPDF = function () {
    const date = document.getElementById('sr-date').value;
    const time = document.getElementById('sr-time').value;
    const officer = document.getElementById('sr-officer').value;
    const type = document.getElementById('sr-type').value;
    const area = document.getElementById('sr-area').value;
    const people = document.getElementById('sr-people').value;
    const detail = document.getElementById('sr-detail').value;
    const actions = document.getElementById('sr-actions').value;
    const imgData = document.getElementById('sr-preview-img').src;

    if (!date || !officer || !area || !detail || !type) {
        showNotification('Por favor complete los campos obligatorios (*)', 'error');
        return;
    }

    // Create a temporary container for the executive report
    const printContainer = document.createElement('div');
    printContainer.id = 'executive-print-report';
    printContainer.style.position = 'absolute';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    printContainer.style.width = '210mm';
    printContainer.style.background = 'white';
    printContainer.style.color = '#1e293b';
    printContainer.style.padding = '20mm';
    printContainer.style.fontFamily = "'Inter', sans-serif";
    printContainer.style.zIndex = '9999999';
    printContainer.style.visibility = 'visible';

    printContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 5px solid #009cbd; padding-bottom: 25px; margin-bottom: 35px;">
            <div>
                <h1 style="color: #009cbd; margin: 0; font-size: 36pt; font-weight: 900; letter-spacing: -1.5px;">HOLCIM</h1>
                <p style="margin: 3px 0 0 0; font-size: 11pt; font-weight: 800; color: #64748b; letter-spacing: 4px; text-transform: uppercase;">Seguridad Patrimonial</p>
            </div>
            <div style="text-align: right;">
                <h2 style="margin: 0; font-size: 18pt; color: #1e293b; font-weight: 900; text-transform: uppercase;">Reporte de Incidente</h2>
                <div style="margin-top: 8px; font-size: 12pt; color: #009cbd; font-weight: 800; background: #f0f9ff; padding: 5px 12px; border-radius: 6px; display: inline-block; border: 1px solid #bae6fd;">N° ${Date.now().toString().slice(-8)}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 35px; background: #f0f9ff; padding: 30px; border-radius: 15px; border: 1px solid #bae6fd; box-shadow: inset 0 0 20px rgba(0, 156, 189, 0.05);">
            <div style="grid-column: span 1;">
                <p style="margin: 0 0 8px 0; font-size: 9pt; color: #0369a1; text-transform: uppercase; font-weight: 900; letter-spacing: 0.5px;">Fecha y Hora</p>
                <p style="margin: 0; font-size: 12pt; font-weight: 700; color: #0c4a6e;">${date} | ${time}</p>
            </div>
            <div style="grid-column: span 2;">
                <p style="margin: 0 0 8px 0; font-size: 9pt; color: #0369a1; text-transform: uppercase; font-weight: 900; letter-spacing: 0.5px;">Ubicación / Sector</p>
                <p style="margin: 0; font-size: 12pt; font-weight: 700; color: #0c4a6e;">${area}</p>
            </div>
            <div style="grid-column: span 1;">
                <p style="margin: 0 0 8px 0; font-size: 9pt; color: #0369a1; text-transform: uppercase; font-weight: 900; letter-spacing: 0.5px;">Tipo de Evento</p>
                <p style="margin: 0; font-size: 12pt; font-weight: 700; color: #0c4a6e; text-transform: uppercase;">${type}</p>
            </div>
            <div style="grid-column: span 2;">
                <p style="margin: 0 0 8px 0; font-size: 9pt; color: #0369a1; text-transform: uppercase; font-weight: 900; letter-spacing: 0.5px;">Oficial Reportante</p>
                <p style="margin: 0; font-size: 12pt; font-weight: 700; color: #0c4a6e;">${officer}</p>
            </div>
        </div>

        ${people ? `
        <div style="margin-bottom: 30px; break-inside: avoid;">
            <h3 style="border-left: 8px solid #009cbd; padding-left: 18px; font-size: 14pt; margin-bottom: 15px; color: #0891b2; font-weight: 900; text-transform: uppercase;">Personas Involucradas</h3>
            <div style="font-size: 11pt; color: #334155; border: 1px solid #e2e8f0; padding: 20px; border-radius: 10px; background: #fff;">${people}</div>
        </div>
        ` : ''}

        <div style="margin-bottom: 30px; break-inside: avoid;">
            <h3 style="border-left: 8px solid #009cbd; padding-left: 18px; font-size: 14pt; margin-bottom: 15px; color: #0891b2; font-weight: 900; text-transform: uppercase;">Descripción de los Hechos</h3>
            <div style="font-size: 11pt; line-height: 1.8; color: #334155; white-space: pre-wrap; text-align: justify; border: 1px solid #e2e8f0; padding: 25px; border-radius: 10px; min-height: 120px; background: #fff;">${detail}</div>
        </div>

        ${actions ? `
        <div style="margin-bottom: 30px; break-inside: avoid;">
            <h3 style="border-left: 8px solid #009cbd; padding-left: 18px; font-size: 14pt; margin-bottom: 15px; color: #0891b2; font-weight: 900; text-transform: uppercase;">Acciones Tomadas</h3>
            <div style="font-size: 11pt; line-height: 1.8; color: #334155; white-space: pre-wrap; border: 1px solid #e2e8f0; padding: 20px; border-radius: 10px; background: #fdfdfd;">${actions}</div>
        </div>
        ` : ''}

        ${imgData && imgData.startsWith('data:image') ? `
        <div style="margin-bottom: 40px; break-inside: avoid;">
            <h3 style="border-left: 8px solid #009cbd; padding-left: 18px; font-size: 14pt; margin-bottom: 15px; color: #0891b2; font-weight: 900; text-transform: uppercase;">Evidencia Fotográfica</h3>
            <div style="text-align: center; border: 2px dashed #009cbd; padding: 20px; border-radius: 15px; background: #fafafa;">
                <img src="${imgData}" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.12);">
            </div>
        </div>
        ` : ''}

        <div style="margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; break-inside: avoid;">
            <div style="text-align: center;">
                <div style="border-top: 2.5px solid #009cbd; width: 85%; margin: 0 auto 12px auto;"></div>
                <p style="margin: 0; font-size: 11pt; font-weight: 900; color: #1e293b;">${officer}</p>
                <p style="margin: 0; font-size: 9pt; color: #64748b; font-weight: 700; letter-spacing: 1px;">FIRMA DE OFICIAL</p>
            </div>
            <div style="text-align: center;">
                <div style="border-top: 2.5px solid #cbd5e1; width: 85%; margin: 0 auto 12px auto;"></div>
                <p style="margin: 0; font-size: 11pt; font-weight: 900; color: #1e293b;">&nbsp;</p>
                <p style="margin: 0; font-size: 9pt; color: #64748b; font-weight: 700; letter-spacing: 1px;">SUPERVISIÓN / RECIBIDO</p>
            </div>
        </div>

        <div style="position: fixed; bottom: 12mm; left: 20mm; right: 20mm; text-align: center; border-top: 1px solid #bae6fd; padding-top: 15px;">
            <span style="color: #64748b; font-size: 10pt; font-weight: 600;">Generado por Sistema de Monitoreo el ${new Date().toLocaleString()}</span>
        </div>
    `;

    document.body.appendChild(printContainer);

    // Filter to hide non-print elements
    const elementsToHide = document.querySelectorAll('body > *:not(#executive-print-report)');
    const originalStyles = [];
    elementsToHide.forEach(el => {
        originalStyles.push({ el, display: el.style.display });
        el.style.display = 'none';
    });

    printContainer.style.position = 'static';
    printContainer.style.left = '0';

    setTimeout(() => {
        window.print();

        // Restore
        elementsToHide.forEach((item, index) => {
            item.el.style.display = originalStyles[index].display;
        });
        document.body.removeChild(printContainer);

        showNotification('Reporte generado en formato ejecutivo', 'success');
        addLogEvent('FORMS', 'Reporte ejecutivo generado: ' + type);
    }, 500);
};
