// Arranque de la interfaz: atajos, menú, CLI, avisos iniciales.
const ATAJOS = { u: 'uninstaller', a: 'startup', j: 'junk', r: 'browsers', m: 'office', w: 'windows', e: 'evidence', d: 'shred', b: 'backups', t: 'wintools', o: 'options' };

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'F5') { e.preventDefault(); return accionMenu('refresh'); }
  if (e.key === 'F10') { e.preventDefault(); return menuAbrir(0); }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && k === 'q') { e.preventDefault(); return accionMenu('quit'); }
  if (e.altKey && !e.ctrlKey && MENU_ALT[k] != null) { e.preventDefault(); return menuAbrir(MENU_ALT[k]); }
  if (e.altKey && !e.ctrlKey && ATAJOS[k]) { e.preventDefault(); openTool(ATAJOS[k]); return; }
  if (e.ctrlKey && !e.altKey && B.activo === 'uninstaller') {
    const f = { u: B.uninst.desinstalar, q: B.uninst.rapida, f: () => B.uninst.forzada(), r: B.uninst.actualizar }[k];
    if (f) { e.preventDefault(); f(); }
  }
});

function toggleOpt(k) { return saveCfg({ opciones: { [k]: !B.cfg.opciones[k] } }).then(applyView); }
async function accionMenu(id) {
  if (id.startsWith('tool:')) return openTool(id.slice(5));
  if (id === 'export-html' || id === 'export-txt') { openTool('uninstaller'); return B.uninst.exportar(id === 'export-html' ? 'html' : 'txt'); }
  if (id === 'refresh') { openTool('uninstaller'); return B.uninst.actualizar(); }
  if (id === 'toggle-status') return toggleOpt('barraEstado');
  if (id === 'toggle-details') return toggleOpt('panelDetalles');
  if (id === 'toggle-theme') { await saveCfg({ opciones: { tema: B.cfg.opciones.tema === 'claro' ? 'oscuro' : 'claro' } }); applyView(); return; }
  if (id === 'hunter') return inv('hunter:open');
  if (id === 'about') return aviso('Acerca de Barredor', 'Barredor 1.0\nDesinstalador de programas con limpieza de restos.\nSin telemetría ni conexiones a internet.\nHaz siempre copia de seguridad antes de borrar.');
  if (id === 'quit') window.close();
}
api.on('menu', accionMenu);
api.on('toast', toast);
api.on('open-wizard', async (key) => {
  openTool('uninstaller');
  let progs = B.uninst.programas(); if (!progs.length) progs = await B.uninst.cargar();
  const p = progs.find((x) => x.clave === key); if (p) B.uninst.desinstalarPrograma(p);
});
api.on('cli', async (c) => {
  openTool('uninstaller');
  if (c.modo === 'forced') return B.uninst.forzada(c.nombre);
  let progs = B.uninst.programas(); if (!progs.length) progs = await B.uninst.cargar();
  const n = c.nombre.toLowerCase();
  const p = progs.find((x) => x.nombre.toLowerCase() === n) || progs.find((x) => x.nombre.toLowerCase().includes(n));
  if (p) B.uninst.desinstalarPrograma(p); else aviso('Programa no encontrado', `No hay ningún programa instalado que se llame "${c.nombre}". Prueba la desinstalación forzada.`);
});

(async function init() {
  B.cfg = await inv('cfg:get');
  B.info = await inv('sys:info');
  applyView();
  openTool('uninstaller');
  if (!B.cfg.avisoVisto) {
    await new Promise((res) => modal({ titulo: 'Antes de empezar', chico: true, cuerpo: h('div', {}, h('p', { text: 'Haz copia de seguridad; borrar archivos y claves puede dañar programas. Barredor guarda copias de lo que borra, pero revisa siempre antes de confirmar.' }), h('p', { class: 'warn', text: 'Barredor necesita permisos de administrador para funcionar completamente (registro de la máquina y Archivos de programa). Si rechazas el aviso de Windows, algunos restos no se podrán borrar.' })), botones: [{ label: 'Lo entiendo', pri: true, onClick: async () => { await saveCfg({ avisoVisto: true }); res(); } }] }));
  }
  if (!B.info.admin) {
    modal({ titulo: 'No eres administrador', chico: true, cuerpo: h('p', { text: 'Algunas acciones (claves de HKLM, Windows\\Temp, sfc) pueden fallar sin permisos de administrador. ¿Quieres reabrir Barredor como administrador?' }),
      botones: [{ label: 'Seguir así' }, { label: 'Reabrir como administrador', pri: true, onClick: async () => { const r = await inv('app:elevate'); if (!r.ok) toast('No se pudo elevar: ' + r.err); } }] });
  }
})();

// ---------- Barra de menú dibujada en HTML (Archivo, Ver, Herramientas, Ayuda) ----------
const MENU_ALT = { f: 0, v: 1, h: 3 };
const NOMBRES_HERR = { uninstaller: 'Desinstalador', startup: 'Gestor de inicio', junk: 'Limpiador de archivos basura', browsers: 'Limpiador de navegadores', office: 'Limpiador de Office', windows: 'Limpiador de Windows', shred: 'Borrado seguro', evidence: 'Eliminador de evidencias', backups: 'Gestor de copias', wintools: 'Herramientas de Windows', options: 'Opciones' };
const atajoDe = (id) => { const k = Object.keys(ATAJOS).find((x) => ATAJOS[x] === id); return k ? 'Alt+' + k.toUpperCase() : ''; };
const MENUS = () => [
  ['Archivo', [['Exportar lista a HTML', 'export-html'], ['Exportar lista a TXT', 'export-txt'], ['Reconstruir caché', 'refresh', 'F5'], '-', ['Salir', 'quit', 'Ctrl+Q']]],
  ['Ver', [['Barra de estado', 'toggle-status', '', B.cfg.opciones.barraEstado], ['Panel de detalles', 'toggle-details', '', B.cfg.opciones.panelDetalles], ['Cambiar tema claro/oscuro', 'toggle-theme']]],
  ['Herramientas', [...Object.keys(NOMBRES_HERR).map((id) => [NOMBRES_HERR[id], 'tool:' + id, atajoDe(id)]), '-', ['Modo cazador', 'hunter'], '-', ['Monitor de instalación (Próximamente)', null], ['Base de datos online de logs (Próximamente)', null], ['Activación y licencias (Próximamente)', null]]],
  ['Ayuda', [['Acerca de Barredor', 'about']]]
];
function menuCerrar() { document.querySelectorAll('.mn.on').forEach((m) => { m.classList.remove('on'); m.firstChild.setAttribute('aria-expanded', 'false'); }); }
function menuAbrir(i, foco = true) {
  menuCerrar();
  const mn = document.querySelectorAll('.mn')[i]; if (!mn) return;
  mn.classList.add('on'); mn.firstChild.setAttribute('aria-expanded', 'true');
  if (foco) (mn.querySelector('.mi:not(:disabled)') || mn.firstChild).focus();
}
function menuPintar() {
  $('#menubar').replaceChildren(...MENUS().map(([nombre, items], i) => h('div', { class: 'mn' },
    h('button', { 'aria-haspopup': 'menu', 'aria-expanded': 'false', text: nombre, onclick: (e) => { e.stopPropagation(); e.currentTarget.parentNode.classList.contains('on') ? menuCerrar() : menuAbrir(i, false); },
      onmouseenter: () => { if (document.querySelector('.mn.on')) menuAbrir(i, false); },
      onkeydown: (e) => { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menuAbrir(i); } } }),
    h('div', { class: 'mdrop', role: 'menu', 'aria-label': nombre }, items.map((it) => (it === '-' ? h('div', { class: 'msep', role: 'separator' }) :
      h('button', { class: 'mi', role: it[3] != null ? 'menuitemcheckbox' : 'menuitem', 'aria-checked': it[3] != null ? String(!!it[3]) : null, disabled: !it[1], tabindex: '-1', onclick: (e) => { e.stopPropagation(); menuCerrar(); accionMenu(it[1]); } },
        h('span', { class: 'chk', text: it[3] ? '✓' : '' }), h('span', { class: 'lbl', text: it[0] }), it[2] ? h('kbd', { text: it[2] }) : null)))))));
}
document.addEventListener('click', menuCerrar);
$('#menubar').addEventListener('keydown', (e) => {
  const mn = e.target.closest('.mn'); if (!mn) return;
  const ms = [...document.querySelectorAll('.mn')], i = ms.indexOf(mn);
  const items = [...mn.querySelectorAll('.mi:not(:disabled)')], j = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); menuCerrar(); mn.firstChild.focus(); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = (i + (e.key === 'ArrowRight' ? 1 : ms.length - 1)) % ms.length; menuAbrir(n); }
  else if (e.key === 'ArrowDown' && j >= 0) { e.preventDefault(); items[(j + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp' && j >= 0) { e.preventDefault(); items[(j + items.length - 1) % items.length].focus(); }
  else if (e.key === 'Home' && j >= 0) { e.preventDefault(); items[0].focus(); }
  else if (e.key === 'End' && j >= 0) { e.preventDefault(); items[items.length - 1].focus(); }
});
