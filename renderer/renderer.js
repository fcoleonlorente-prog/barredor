// Arranque de la interfaz: atajos, menú, CLI, avisos iniciales.
const ATAJOS = { u: 'uninstaller', a: 'startup', j: 'junk', r: 'browsers', m: 'office', w: 'windows', e: 'evidence', d: 'shred', b: 'backups', t: 'wintools', o: 'options' };

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.altKey && !e.ctrlKey && ATAJOS[k]) { e.preventDefault(); openTool(ATAJOS[k]); return; }
  if (e.ctrlKey && !e.altKey && B.activo === 'uninstaller') {
    const f = { u: B.uninst.desinstalar, q: B.uninst.rapida, f: () => B.uninst.forzada(), r: B.uninst.actualizar }[k];
    if (f) { e.preventDefault(); f(); }
  }
});

function toggleOpt(k) { return saveCfg({ opciones: { [k]: !B.cfg.opciones[k] } }).then(applyView); }
api.on('menu', async (id) => {
  if (id.startsWith('tool:')) return openTool(id.slice(5));
  if (id === 'export-html' || id === 'export-txt') { openTool('uninstaller'); return B.uninst.exportar(id === 'export-html' ? 'html' : 'txt'); }
  if (id === 'refresh') { openTool('uninstaller'); return B.uninst.actualizar(); }
  if (id === 'toggle-status') return toggleOpt('barraEstado');
  if (id === 'toggle-details') return toggleOpt('panelDetalles');
  if (id === 'toggle-theme') { await saveCfg({ opciones: { tema: B.cfg.opciones.tema === 'claro' ? 'oscuro' : 'claro' } }); applyView(); }
});
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
    await new Promise((res) => modal({ titulo: 'Antes de empezar', chico: true, cuerpo: h('p', { text: 'Haz copia de seguridad; borrar archivos y claves puede dañar programas. Barredor guarda copias de lo que borra, pero revisa siempre antes de confirmar.' }), botones: [{ label: 'Lo entiendo', pri: true, onClick: async () => { await saveCfg({ avisoVisto: true }); res(); } }] }));
  }
  if (!B.info.admin) {
    modal({ titulo: 'No eres administrador', chico: true, cuerpo: h('p', { text: 'Algunas acciones (claves de HKLM, Windows\\Temp, sfc) pueden fallar sin permisos de administrador. ¿Quieres reabrir Barredor como administrador?' }),
      botones: [{ label: 'Seguir así' }, { label: 'Reabrir como administrador', pri: true, onClick: async () => { const r = await inv('app:elevate'); if (!r.ok) toast('No se pudo elevar: ' + r.err); } }] });
  }
})();
