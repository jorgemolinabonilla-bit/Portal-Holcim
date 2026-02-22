// Package Management Module - Holcim Control de Acceso
// Handles: package registration, pending list, delivery confirmation, and history

document.addEventListener('DOMContentLoaded', function () {

    var packageForm = document.getElementById('package-form');

    window.renderPackages = function () {
        var listBody = document.getElementById('package-list-body');
        var historyBody = document.getElementById('package-history-body');
        if (!listBody || !historyBody) return;

        var pkgData = window.getSiteData('holcim_packages');
        var search = (document.getElementById('pkg-search')?.value || '').toLowerCase();
        var start = document.getElementById('pkg-filter-start')?.value;
        var end = document.getElementById('pkg-filter-end')?.value;
        var status = document.getElementById('pkg-filter-status')?.value || 'ALL';

        var filtered = pkgData.filter(function (p) {
            var matchSearch = p.courier.toLowerCase().includes(search) || p.recipient.toLowerCase().includes(search);
            var pkgDate = new Date(p.receivedAt).toISOString().split('T')[0];
            var matchStart = !start || pkgDate >= start;
            var matchEnd = !end || pkgDate <= end;
            var matchStatus = status === 'ALL' || (status === 'ENTREGADO' ? !!p.deliveredAt : !p.deliveredAt);

            return matchSearch && matchStart && matchEnd && matchStatus;
        });

        var pending = filtered.filter(function (p) { return !p.deliveredAt; });
        var delivered = filtered.filter(function (p) { return !!p.deliveredAt; });

        if (pending.length === 0) {
            listBody.innerHTML = '<div style="padding:3rem;text-align:center;color:var(--text-muted)"><i class="fas fa-box-open fa-2x" style="opacity:0.3;margin-bottom:1rem;display:block;"></i>Sin paquetes pendientes.</div>';
        } else {
            listBody.innerHTML = pending.map(function (p) {
                return '<div class="list-row" style="grid-template-columns: 1fr 1fr 150px 150px 100px;">' +
                    '<div><strong style="color:var(--primary-teal); cursor:pointer" onclick="openPackageEdit(' + p.id + ')">' + p.courier + '</strong></div>' +
                    '<div>' + p.recipient + '</div>' +
                    '<div style="font-size:0.75rem; font-weight:700">' + (p.receivedByOfficer || '-') + '</div>' +
                    '<div style="font-size:0.75rem">' + new Date(p.receivedAt).toLocaleString() + '</div>' +
                    '<div><button class="btn-salida-corpo" style="background:var(--primary-teal);color:#fff;border-color:var(--primary-teal);" onclick="deliverPackage(' + p.id + ')"><i class="fas fa-check"></i> ENTREGA</button></div>' +
                    '</div>';
            }).join('');
        }

        if (delivered.length === 0) {
            historyBody.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Sin entregas registradas que coincidan.</div>';
        } else {
            historyBody.innerHTML = delivered.map(function (p) {
                return '<div class="list-row" style="grid-template-columns: 1fr 1fr 150px 150px 150px 150px 80px;">' +
                    '<div><strong style="cursor:pointer; color:var(--primary-teal)" onclick="openPackageEdit(' + p.id + ')">' + p.courier + '</strong></div>' +
                    '<div>' + p.recipient + '</div>' +
                    '<div style="font-size:0.7rem; font-weight:700">' + (p.receivedByOfficer || '-') + '</div>' +
                    '<div style="font-size:0.7rem">' + new Date(p.receivedAt).toLocaleString() + '</div>' +
                    '<div style="font-size:0.7rem; color:var(--primary-teal);font-weight:700">' + (p.receivedBy || '-') + '</div>' +
                    '<div style="font-size:0.7rem">' + new Date(p.deliveredAt).toLocaleString() + '</div>' +
                    '<div><span class="induction-status status-active" style="font-size:0.65rem;padding:3px 6px; cursor:pointer" onclick="openTraceability(' + p.id + ', \'' + p.recipient + '\')">ENTREGADO</span></div>' +
                    '</div>';
            }).join('');
        }
    };

    window.exportPackages = function (format) {
        var pkgData = window.getSiteData('holcim_packages');
        if (pkgData.length === 0) {
            if (typeof showNotification === 'function') showNotification('NO HAY PAQUETES PARA EXPORTAR', 'danger');
            return;
        }

        if (format === 'xlsx') {
            var csv = "\uFEFFMENSAJERIA,DESTINATARIO,OFICIAL RECEPTOR,FECHA RECIBIDO,ENTREGADO A,FECHA ENTREGA,ESTADO\n";
            pkgData.forEach(function (p) {
                csv += '"' + p.courier + '","' + p.recipient + '","' + (p.receivedByOfficer || '-') + '","' + new Date(p.receivedAt).toLocaleString() + '","' + (p.receivedBy || '-') + '","' + (p.deliveredAt ? new Date(p.deliveredAt).toLocaleString() : '-') + '","' + (p.deliveredAt ? 'ENTREGADO' : 'PENDIENTE') + '"\n';
            });
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'Reporte_Paqueteria_Holcim_' + new Date().toISOString().split('T')[0] + '.csv';
            a.click();
        } else {
            window.print();
        }
    };

    ['pkg-search', 'pkg-filter-start', 'pkg-filter-end', 'pkg-filter-status'].forEach(function (id) {
        document.getElementById(id)?.addEventListener('input', window.renderPackages);
    });

    window.openPackageEdit = function (id) {
        var pkgData = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_packages')) || '[]');
        var pkg = pkgData.find(function (p) { return p.id === id; });
        if (pkg) {
            document.getElementById('edit-package-id').value = pkg.id;
            document.getElementById('edit-pkg-courier').value = pkg.courier;
            document.getElementById('edit-pkg-recipient').value = pkg.recipient;
            document.getElementById('modal-edit-package').style.display = 'flex';
        }
    };

    window.savePackageEdit = function () {
        var id = parseInt(document.getElementById('edit-package-id').value);
        var pkgData = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_packages')) || '[]');
        var pkg = pkgData.find(function (p) { return p.id === id; });
        if (pkg) {
            var fields = {
                courier: document.getElementById('edit-pkg-courier').value.trim().toUpperCase(),
                recipient: document.getElementById('edit-pkg-recipient').value.trim().toUpperCase()
            };
            var changed = false;
            for (var key in fields) {
                if (pkg[key] !== fields[key]) {
                    if (typeof window.addAuditLog === 'function') {
                        window.addAuditLog('PAQUETERIA', pkg.id, key, pkg[key], fields[key]);
                    }
                    pkg[key] = fields[key]; changed = true;
                }
            }
            if (changed) {
                localStorage.setItem(window.getSiteKey('holcim_packages'), JSON.stringify(pkgData));
                if (typeof showNotification === 'function') showNotification('PAQUETE ACTUALIZADO', 'success');
            }
            document.getElementById('modal-edit-package').style.display = 'none';
            window.renderPackages();
        }
    };

    window.deliverPackage = function (id) {
        var pkgData = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_packages')) || '[]');
        var pkg = null;
        for (var i = 0; i < pkgData.length; i++) {
            if (pkgData[i].id === id) { pkg = pkgData[i]; break; }
        }
        if (!pkg) return;

        var receiver = prompt(
            'ENTREGA DE PAQUETE\n' +
            '-----------------------------\n' +
            'Empresa/Mensajería: ' + pkg.courier + '\n' +
            'Destinatario: ' + pkg.recipient + '\n' +
            'Recibido por Oficial: ' + (pkg.receivedByOfficer || '-') + '\n' +
            '-----------------------------\n' +
            'Nombre completo de la persona que recibe finalmente:'
        );
        if (!receiver || !receiver.trim()) return;

        pkg.deliveredAt = Date.now();
        pkg.receivedBy = receiver.trim().toUpperCase();
        localStorage.setItem(window.getSiteKey('holcim_packages'), JSON.stringify(pkgData));

        if (typeof addLogEvent === 'function') {
            addLogEvent('PAQUETERIA', 'Entregado a ' + pkg.receivedBy + ' | Para: ' + pkg.recipient + ' | De: ' + pkg.courier);
        }
        if (typeof showNotification === 'function') {
            showNotification('PAQUETE ENTREGADO EXITOSAMENTE', 'success');
        }
        window.renderPackages();
    };

    if (packageForm) {
        packageForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var courierEl = document.getElementById('pkg-courier');
            var recipientEl = document.getElementById('pkg-recipient');
            var officerEl = document.getElementById('pkg-officer');

            if (!courierEl || !recipientEl || !officerEl) return;

            var newPkg = {
                id: Date.now(),
                courier: courierEl.value.trim().toUpperCase(),
                recipient: recipientEl.value.trim().toUpperCase(),
                receivedByOfficer: officerEl.value.trim().toUpperCase(),
                receivedAt: Date.now(),
                deliveredAt: null,
                receivedBy: null
            };

            var pkgData = JSON.parse(localStorage.getItem(window.getSiteKey('holcim_packages')) || '[]');
            pkgData.unshift(newPkg);
            localStorage.setItem(window.getSiteKey('holcim_packages'), JSON.stringify(pkgData));

            if (typeof addLogEvent === 'function') {
                addLogEvent('PAQUETERIA', 'Nuevo paquete (Seg: ' + newPkg.receivedByOfficer + ') de ' + newPkg.courier + ' para ' + newPkg.recipient);
            }
            if (typeof showNotification === 'function') {
                showNotification('PAQUETE REGISTRADO', 'success');
            }
            window.renderPackages();
            packageForm.reset();
        });
    }

    // Initial render on load
    window.renderPackages();

    // Re-render when navigating to the packages view
    document.addEventListener('click', function (e) {
        var link = e.target.closest('.nav-link[data-view="packages"]');
        if (link) {
            setTimeout(window.renderPackages, 200);
        }
    });

});
