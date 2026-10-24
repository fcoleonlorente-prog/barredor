// Barredor: proceso principal. Toda acción de sistema y toda validación de seguridad viven aquí.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const U = require('./lib/util');
const P = require('./lib/programs');
const T = require('./lib/tools');
const D = require('./lib/debloat');

const argv = process.argv.slice(1);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null; };
const SELFTEST = argv.includes('--selftest');
const CLI = flag('--uninstall') ? { modo: 'uninstall', nombre: String(flag('--uninstall')) } : flag('--forced') ? { modo: 'forced', nombre: String(flag('--forced')) } : null;

let win = null, hunterWin = null;
const sendWin = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
T.setEmitter(sendWin);

// Lo que el último escaneo marcó como seguro: solo eso se puede borrar (el renderer no decide).
const strongKeys = new Set();
const weakKeys = new Set(); // dudosas: solo se borran si el usuario las marca y confirma
const weakFiles = new Set();
const scannedFiles = new Set();
const strongFiles = new Set(); // solo estos se pueden borrar (como en el registro)
let quickAuthorized = false;
const keyId = (k, v) => `${U.normKey(k)}|${v || ''}`.toLowerCase();

async function confirm(msg, detail, label = 'Borrar') {
  if (SELFTEST || quickAuthorized) return true;
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Cancelar', label], defaultId: 0, cancelId: 0, title: 'Barredor', message: msg, detail: detail || '' });
  return r.response === 1;
}
const fmtSize = (n) => (n > 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 780, minWidth: 980, minHeight: 600, show: !SELFTEST, backgroundColor: '#eef2f4', title: 'Barredor', autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: overlayFor(U.loadConfig().opciones.tema),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  applyView();
}
// Barra de título integrada: los botones de ventana siguen el tema. El menú lo dibuja el renderer (HTML).
const overlayFor = (tema) => (tema === 'oscuro' ? { color: '#161d21', symbolColor: '#e6eef0', height: 36 } : { color: '#f6f9fa', symbolColor: '#1b2a30', height: 36 });
function applyView() {
  const o = U.loadConfig().opciones;
  if (win && !win.isDestroyed()) { try { win.setTitleBarOverlay(overlayFor(o.tema)); } catch { /* sin overlay */ } }
}
Menu.setApplicationMenu(null);

// ---------- Modo cazador ----------
function openHunter() {
  if (hunterWin && !hunterWin.isDestroyed()) { hunterWin.focus(); return; }
  hunterWin = new BrowserWindow({
    width: 360, height: 420, alwaysOnTop: true, resizable: false, minimizable: true, title: 'Modo cazador', autoHideMenuBar: true, backgroundColor: '#f6f9fa',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  hunterWin.setMenu(null);
  hunterWin.loadFile(path.join(__dirname, 'renderer', 'hunter.html'));
}

// ---------- Utilidades de resolución ----------
const lower = (s) => String(s || '').toLowerCase();
async function resolveExe(file) {
  if (!file || !path.isAbsolute(file) || !fs.existsSync(file)) return null;
  let exe = file;
  if (/\.lnk$/i.test(file)) { try { exe = shell.readShortcutLink(file).target || file; } catch { return null; } }
  const progs = await P.listPrograms({ mostrarSistema: true, mostrarActualizaciones: true });
  const e = lower(exe);
  let best = null, bl = 0;
  for (const p of progs) {
    const loc = lower((p.ubicacion || '').replace(/[\\/]+$/, ''));
    if (loc.length > 6 && e.startsWith(loc + '\\') && loc.length > bl) { best = p; bl = loc.length; }
    const ex = lower(P.buildCommand ? ((p.desinstalar || '').match(/^\s*"?([^"]+?\.exe)/i) || [])[1] : '');
    if (!best && ex && path.dirname(ex) === path.dirname(e) && path.dirname(e).length > 10) { best = p; bl = 1; }
  }
  const inicio = (await T.startupList()).filter((s) => s.estado === 'Activo' && lower(s.comando).includes(e));
  const running = lower((await U.run('tasklist.exe', ['/FO', 'CSV', '/NH', '/FI', `IMAGENAME eq ${path.basename(exe)}`])).out).includes(lower(path.basename(exe)));
  return { exe, programa: best, enEjecucion: running, inicio: inicio.map((s) => ({ id: s.id, nombre: s.nombre })) };
}

// ---------- IPC ----------
const H = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (err) { return { ok: false, err: String(err && err.message || err) }; } });

H('sys:info', async () => ({ admin: U.isElevated(), cli: CLI, version: app.getVersion(), datos: U.DATA, equipo: os.hostname() }));
H('cfg:get', () => U.loadConfig());
H('cfg:set', (patch) => {
  const cfg = U.loadConfig();
  for (const k of ['comentarios', 'grupos', 'exclusionRegistro', 'exclusionBasura', 'avisoVisto']) if (patch && k in patch) cfg[k] = patch[k];
  if (patch && patch.opciones) cfg.opciones = { ...cfg.opciones, ...patch.opciones };
  U.saveConfig(cfg); applyView();
  return cfg;
});
H('app:elevate', async () => {
  const exe = process.execPath, args = app.isPackaged ? '--elevado' : `"${app.getAppPath()}"`; // ArgumentList no admite cadena vacía
  const r = await U.ps('Start-Process -FilePath $env:BARREDOR_EXE -ArgumentList $env:BARREDOR_ARGS -Verb RunAs', { BARREDOR_EXE: exe, BARREDOR_ARGS: args });
  if (r.ok) setTimeout(() => app.quit(), 500);
  return { ok: r.ok, err: r.err.trim() };
});

// Programas
H('prog:list', async () => P.listPrograms(U.loadConfig().opciones));
// Icono real del programa (DisplayIcon o primer .exe de su carpeta), en caché y como data URL.
const iconCache = new Map();
function iconPathOf(p) {
  const ic = String(p.icono || '').trim().replace(/^"([^"]*)".*$/, '$1').replace(/,\s*-?\d+$/, '').replace(/%([^%]+)%/g, (m, v) => process.env[v] || m);
  if (ic && fs.existsSync(ic)) return ic;
  try {
    if (p.ubicacion && fs.existsSync(p.ubicacion)) {
      const e = fs.readdirSync(p.ubicacion).find((f) => /\.exe$/i.test(f) && !/^(unins|uninst|setup|update)/i.test(f));
      if (e) return path.join(p.ubicacion, e);
    }
  } catch { /* sin permisos */ }
  return '';
}
H('prog:icon', async (key) => {
  if (iconCache.has(key)) return iconCache.get(key);
  const p = await P.getProgram(key); let url = null;
  const f = p ? iconPathOf(p) : '';
  if (f) { try { const img = await app.getFileIcon(f, { size: 'large' }); if (!img.isEmpty()) url = img.toDataURL(); } catch { /* sin icono */ } }
  iconCache.set(key, url); return url;
});
H('prog:openLocation', async (key) => { const p = await P.getProgram(key); if (!p || !p.ubicacion || !fs.existsSync(p.ubicacion)) return { ok: false, err: 'No hay ubicación de instalación conocida.' }; const r = await shell.openPath(p.ubicacion); return { ok: !r, err: r }; });
H('prog:openKey', async (key) => {
  if (typeof key !== 'string' || !/^(HKCU|HKLM|HKEY_CURRENT_USER|HKEY_LOCAL_MACHINE)\\[^"\r\n]+$/i.test(key)) return { ok: false, err: 'Clave no válida.' };
  const full = U.normKey(key).replace(/^HKCU/i, 'HKEY_CURRENT_USER').replace(/^HKLM/i, 'HKEY_LOCAL_MACHINE');
  await U.run('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit', '/v', 'LastKey', '/t', 'REG_SZ', '/d', 'Equipo\\' + full, '/f']);
  const c = spawn('regedit.exe', [], { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref();
  return { ok: true };
});
H('prog:google', async (name) => { await shell.openExternal('https://www.google.com/search?q=' + encodeURIComponent(String(name).slice(0, 200))); return { ok: true }; });
H('prog:web', async (key) => { const p = await P.getProgram(key); if (!p || !/^https?:\/\//i.test(p.web || '')) return { ok: false, err: 'El programa no indica una web.' }; await shell.openExternal(p.web); return { ok: true }; });
H('prog:modify', async (key) => { const p = await P.getProgram(key); return p ? P.startModify(p) : { ok: false, err: 'Programa no encontrado.' }; });
H('prog:exportList', async (fmt, keys) => {
  const set = new Set(keys || []);
  const list = (await P.listPrograms(U.loadConfig().opciones)).filter((p) => !keys || set.has(p.clave));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let content;
  if (fmt === 'html') {
    content = `<!doctype html><meta charset="utf-8"><title>Programas instalados</title><style>body{font-family:Segoe UI,sans-serif}td,th{border:1px solid #ccc;padding:4px 8px}table{border-collapse:collapse}</style><h1>Programas instalados (${list.length})</h1><table><tr><th>Nombre</th><th>Versión</th><th>Editor</th><th>Tamaño</th><th>Fecha</th><th>Ubicación</th></tr>` +
      list.map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.version)}</td><td>${esc(p.editor)}</td><td>${p.tamanoKB ? fmtSize(p.tamanoKB * 1024) : ''}</td><td>${esc(p.fecha)}</td><td>${esc(p.ubicacion)}</td></tr>`).join('') + '</table>';
  } else content = list.map((p) => [p.nombre, p.version, p.editor, p.tamanoKB ? fmtSize(p.tamanoKB * 1024) : '', p.fecha].join('\t')).join('\r\n');
  const r = await dialog.showSaveDialog(win, { defaultPath: `programas.${fmt === 'html' ? 'html' : 'txt'}`, filters: [{ name: fmt === 'html' ? 'HTML' : 'Texto', extensions: [fmt === 'html' ? 'html' : 'txt'] }] });
  if (r.canceled) return { ok: false, cancelado: true };
  fs.writeFileSync(r.filePath, content, 'utf8');
  return { ok: true, ruta: r.filePath };
});
H('export:save', async (nombre, content) => {
  if (typeof content !== 'string') return { ok: false };
  const r = await dialog.showSaveDialog(win, { defaultPath: String(nombre || 'informe.html'), filters: [{ name: 'HTML', extensions: ['html'] }] });
  if (r.canceled) return { ok: false, cancelado: true };
  fs.writeFileSync(r.filePath, content, 'utf8');
  return { ok: true, ruta: r.filePath };
});

// Asistente de desinstalación
H('uninst:prepare', async (o) => {
  const cfg = U.loadConfig().opciones, res = { restore: null, copias: 0 };
  if (o && o.restore && cfg.puntoRestauracion) res.restore = await T.createRestorePoint();
  if (o && o.backup && cfg.copiaRegistro) res.copias = await T.backupRegistry('previa');
  return res;
});
H('uninst:start', async (key, quiet) => {
  const p = await P.getProgram(key);
  if (!p) return { ok: false, err: 'Programa no encontrado.' };
  if (!(await confirm(`Se lanzará el desinstalador de "${p.nombre}".`, 'Después podrás revisar y borrar los restos.', 'Continuar'))) return { ok: false, cancelado: true };
  return P.startUninstall(p, !!quiet);
});
H('uninst:wait', (id) => P.waitUninstall(id).then((code) => ({ ok: true, code })));
H('uninst:skip', (id) => P.skipWait(id));
H('scan:run', async (o) => {
  const r = await P.scan(o || {});
  for (const it of r.registro) { if (it.nivel === 'fuerte') strongKeys.add(keyId(it.key, it.valor)); else if (it.nivel === 'debil') weakKeys.add(keyId(it.key, it.valor)); }
  for (const f of r.archivos) { scannedFiles.add(lower(f.path)); if (f.nivel === 'fuerte') strongFiles.add(lower(f.path)); else if (f.nivel === 'debil') weakFiles.add(lower(f.path)); }
  return r;
});
H('scan:delReg', async (items, dudosos) => {
  const cfg = U.loadConfig();
  const sel = (items || []).filter((i) => i && (strongKeys.has(keyId(i.key, i.valor)) || (dudosos === true && weakKeys.has(keyId(i.key, i.valor)))) && U.regKeyIsSafe(i.key) && !U.excludedKey(i.key, cfg));
  if (!sel.length) return { ok: true, borrados: 0, fallos: [] };
  if (!(await confirm(`¿Borrar ${sel.length} elemento(s) del registro?`, 'Antes de borrar cada clave se guarda una copia en el Gestor de copias.'))) return { ok: false, cancelado: true };
  let borrados = 0; const fallos = [];
  for (const i of sel) {
    const bk = await U.regExport(i.key, 'borrado');
    if (!bk) { fallos.push(`${i.key}: no se pudo crear la copia, no se borra`); continue; }
    const r = await U.regDelete(i.key, i.valor);
    if (r.ok) borrados++; else fallos.push(`${i.key}: ${r.err}`);
  }
  return { ok: true, borrados, fallos };
});
H('scan:delFiles', async (paths, dudosos) => {
  const cfg = U.loadConfig();
  const sel = (paths || []).filter((p) => typeof p === 'string' && (strongFiles.has(lower(p)) || (dudosos === true && weakFiles.has(lower(p)))) && U.pathIsSafe(p) && !(cfg.exclusionBasura || []).some((x) => lower(p).startsWith(lower(x))));
  if (!sel.length) return { ok: true, borrados: 0, fallos: [`Ninguna ruta válida: ${(paths || []).length} marcada(s), ninguna es un resto del último escaneo, o está en una carpeta protegida del sistema. Vuelve a escanear.`] };
  const papelera = cfg.opciones.papelera !== false;
  if (!(await confirm(`¿Borrar ${sel.length} archivo(s) o carpeta(s)?`, (papelera ? 'Irán a la Papelera de reciclaje.' : 'Se borrarán directamente (sin Papelera).') + (dudosos === true ? '\n\nIncluye coincidencias DUDOSAS que tú has marcado: revisa que pertenezcan al programa.' : '')))) return { ok: false, cancelado: true };
  let borrados = 0; const fallos = [];
  for (const p of sel) { const r = await U.removePath(p, papelera); if (r.ok) borrados++; else fallos.push(`${p}: ${r.err || 'no se pudo borrar'}`); }
  return { ok: true, borrados, fallos };
});
H('quick:confirm', async (names) => {
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Cancelar', 'Desinstalar'], defaultId: 0, cancelId: 0, title: 'Desinstalación rápida', message: `Se desinstalarán ${names.length} programa(s) y se borrarán automáticamente los restos seguros.`, detail: names.slice(0, 15).join('\n') + (names.length > 15 ? '\n…' : '') + '\n\nSe creará una copia del registro y los archivos irán a la Papelera.' });
  quickAuthorized = r.response === 1;
  return quickAuthorized;
});
H('quick:end', () => { quickAuthorized = false; return true; });

// Archivos
const knownFile = (p) => typeof p === 'string' && scannedFiles.has(lower(p));
H('file:open', async (p) => { if (!knownFile(p)) return { ok: false }; const r = await shell.openPath(p); return { ok: !r, err: r }; });
H('file:parent', (p) => { if (!knownFile(p)) return { ok: false }; shell.showItemInFolder(p); return { ok: true }; });
H('file:props', (p) => { if (!knownFile(p)) return { ok: false }; const s = fs.statSync(p); return { ok: true, ruta: p, tipo: s.isDirectory() ? 'Carpeta' : 'Archivo', tamano: s.isDirectory() ? U.dirSize(p) : s.size, creado: s.birthtime.toLocaleString('es-ES'), modificado: s.mtime.toLocaleString('es-ES') }; });
H('dlg:pick', async (kind) => {
  const props = kind === 'folder' ? ['openDirectory'] : kind === 'files' ? ['openFile', 'multiSelections'] : kind === 'foldersMulti' ? ['openDirectory', 'multiSelections'] : ['openFile'];
  const filters = kind === 'exe' ? [{ name: 'Ejecutables y accesos directos', extensions: ['exe', 'lnk'] }] : [];
  const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || win, { properties: props, filters });
  return r.canceled ? [] : r.filePaths;
});

// Inicio
H('start:list', () => T.startupList());
H('start:run', (id) => T.startupRun(id));
H('start:kill', async (id) => (await confirm('¿Finalizar el proceso de esta entrada?', 'Se cerrará sin guardar datos.', 'Finalizar')) ? T.startupKill(id) : { ok: false, cancelado: true });
H('start:add', (n, f) => T.startupAdd(n, f));
H('start:remove', async (id) => (await confirm('¿Quitar esta entrada del inicio?', 'Se guarda una copia en el Gestor de copias.', 'Quitar')) ? T.startupRemove(id) : { ok: false, cancelado: true });
H('start:toggle', (id) => T.startupToggle(id));

// Limpiadores
H('junk:scan', () => T.junkScan());
H('junk:clean', async (paths) => (await confirm(`¿Borrar ${(paths || []).length} archivo(s) basura?`, 'Se borran directamente. Los archivos en uso se omiten.')) ? { ok: true, ...(await T.junkClean(paths)) } : { ok: false, cancelado: true });
H('brow:scan', () => T.browsersScan());
H('brow:clean', async (sel) => (await confirm('¿Limpiar los datos de navegador seleccionados?', 'Cierra los navegadores antes de limpiar. Esta acción no se puede deshacer.', 'Limpiar')) ? { ok: true, ...(await T.browsersClean(sel)) } : { ok: false, cancelado: true });
H('off:scan', () => T.officeScan());
H('off:clean', async (apps) => (await confirm('¿Borrar las listas de documentos recientes de Office seleccionadas?', 'Se guarda una copia del registro.', 'Borrar')) ? { ok: true, ...(await T.officeClean(apps)) } : { ok: false, cancelado: true });
H('win:scan', () => T.winScan());
H('win:clean', async (ids) => (await confirm('¿Limpiar los elementos de Windows seleccionados?', 'Esta acción no se puede deshacer.', 'Limpiar')) ? { ok: true, ...(await T.winClean(ids)) } : { ok: false, cancelado: true });

// Borrado seguro y evidencias
H('shred:run', async (paths, passes) => {
  const ok = (paths || []).filter((p) => U.pathIsSafe(p));
  if (!ok.length) return { ok: false, err: 'No hay rutas válidas.' };
  if (!(await confirm(`BORRADO IRRECUPERABLE de ${ok.length} elemento(s).`, 'Se sobrescribirán y eliminarán sin Papelera. No hay vuelta atrás.\n\n' + ok.slice(0, 8).join('\n'), 'Borrar para siempre'))) return { ok: false, cancelado: true };
  const r = await T.shredPaths(ok, passes);
  return { ok: true, ...r };
});
H('evid:drives', () => T.drives());
H('evid:start', async (drive, passes) => (await confirm(`Se escribirá sobre el espacio libre de ${drive}`, 'Puede tardar mucho y ralentizar el equipo. Se deja un margen libre de 200 MB y puedes cancelar.', 'Empezar')) ? T.evidStart(drive, passes) : { ok: false, cancelado: true });
H('evid:cancel', () => T.evidCancelNow());

// Copias y herramientas de Windows
H('bk:list', () => T.bkList());
H('bk:restore', async (id) => (await confirm('¿Restaurar esta copia?', 'Se importará al registro o se devolverán los archivos a su sitio.', 'Restaurar')) ? T.bkRestore(id) : { ok: false, cancelado: true });
H('bk:delete', async (id) => (await confirm('¿Eliminar esta copia?')) ? T.bkDelete(id) : { ok: false, cancelado: true });
H('bk:deleteAll', async () => (await confirm('¿Eliminar TODAS las copias?', 'Perderás la posibilidad de restaurar borrados anteriores.')) ? T.bkDeleteAll() : { ok: false, cancelado: true });
H('bk:open', () => T.bkOpen());
H('bk:create', async () => ({ ok: true, archivos: await T.backupRegistry('manual') }));
H('wt:list', () => T.winToolsList());
H('wt:run', (id) => T.winToolRun(id));

// Debloat de Windows: el proceso principal valida todo (lista de protección, solo lo del último listado, solo la lista blanca de características).
async function puntoRestauracion() {
  if (!U.loadConfig().opciones.puntoRestauracion) return { seguir: true, nota: 'Sin punto de restauración (desactivado en Opciones).' };
  const r = await T.createRestorePoint();
  if (r.ok) return { seguir: true, nota: 'Punto de restauración solicitado (si ya había uno de las últimas 24 h, Windows conserva ese).' };
  if (/1440|24 h|24 hours|frecuen/i.test(r.err)) return { seguir: true, nota: 'Windows solo permite un punto de restauración cada 24 h; se continúa con el anterior.' };
  if (!(await confirm('No se pudo crear el punto de restauración.', `${r.err}\n\n¿Quieres continuar sin él?`, 'Continuar sin punto'))) return { seguir: false };
  return { seguir: true, nota: 'Sin punto de restauración: ' + r.err };
}
const REVERTIR = 'Las apps de la Tienda se pueden reinstalar desde Microsoft Store y las características desde esta misma pantalla (botón Activar).';
H('deb:apps', async () => {
  const items = await D.appList();
  return { ok: true, admin: U.isElevated(), items };
});
H('deb:appsRemove', async (fulls, perfilBase) => {
  if (!U.isElevated()) return { ok: false, err: 'Quitar aplicaciones requiere permisos de administrador. Reabre Barredor como administrador.' };
  const ids = [...new Set(Array.isArray(fulls) ? fulls.filter((x) => typeof x === 'string') : [])];
  const sel = ids.filter((f) => { const a = D.appInfo(f); return a && !D.appBloqueada({ Name: a.name }); });
  if (!sel.length) return { ok: false, err: 'Ninguna aplicación válida: actualiza la lista y vuelve a marcar.' };
  const nombres = sel.map((f) => { const a = D.appInfo(f); return `• ${a.nombre}${a.aviso ? '  (¡aviso! ' + a.aviso + ')' : ''}`; });
  if (!(await confirm(`¿Quitar ${sel.length} aplicación(es) de Windows?`, nombres.join('\n') + (perfilBase ? '\n\nTambién se quitarán del perfil base (no volverán en usuarios nuevos).' : '') + '\n\n' + REVERTIR, 'Quitar'))) return { ok: false, cancelado: true };
  const pr = await puntoRestauracion(); if (!pr.seguir) return { ok: false, cancelado: true };
  const quitados = [], fallos = [], notas = [pr.nota];
  for (const f of sel) {
    const a = D.appInfo(f), r = await D.appRemove(f, !!perfilBase);
    if (r.ok) { quitados.push(a.nombre); if (r.nota) notas.push(`${a.nombre}: ${r.nota}`); } else fallos.push({ nombre: a.nombre, motivo: r.err });
  }
  return { ok: true, quitados, fallos, notas, reinicio: false };
});
H('deb:feats', async () => {
  if (!U.isElevated()) return { ok: true, admin: false, items: [] };
  return { ok: true, admin: true, items: await D.featList() };
});
H('deb:featsSet', async (ids, accion) => {
  if (!U.isElevated()) return { ok: false, err: 'Cambiar características requiere permisos de administrador. Reabre Barredor como administrador.' };
  if (accion !== 'activar' && accion !== 'desactivar') return { ok: false, err: 'Acción no válida.' };
  const sel = [...new Set(Array.isArray(ids) ? ids : [])].map((i) => D.featDe(i)).filter(Boolean);
  if (!sel.length) return { ok: false, err: 'Ninguna entrada válida.' };
  const off = accion === 'desactivar', verbo = off ? 'Desactivar' : 'Activar';
  const det = sel.map((f) => `• ${f.nombre}${off ? ' — ' + f.perdida : ''}${f.aviso ? '\n   ¡Aviso! ' + f.aviso : ''}`).join('\n');
  if (!(await confirm(`¿${verbo} ${sel.length} característica(s) de Windows?`, det + '\n\n' + (off ? REVERTIR : 'Activar puede necesitar internet (Windows Update) para descargar el componente.'), verbo))) return { ok: false, cancelado: true };
  const notas = [];
  if (off) { const pr = await puntoRestauracion(); if (!pr.seguir) return { ok: false, cancelado: true }; notas.push(pr.nota); }
  const hechos = [], fallos = []; let reinicio = false;
  for (const f of sel) { const r = await D.featSet(f.id, accion); if (r.ok) { hechos.push(f.nombre); reinicio = reinicio || r.reinicio; } else fallos.push({ nombre: f.nombre, motivo: r.err }); }
  return { ok: true, quitados: hechos, fallos, notas, reinicio };
});

// Cazador
H('hunter:open', () => { openHunter(); return true; });
H('hunter:resolve', (f) => resolveExe(f));
H('hunter:procs', async () => U.psJson('Get-Process | Where-Object { $_.MainWindowTitle -and $_.Path } | Select-Object @{n="id";e={$_.Id}},@{n="nombre";e={$_.ProcessName}},@{n="titulo";e={$_.MainWindowTitle}},@{n="ruta";e={$_.Path}} | ConvertTo-Json -Compress'));
H('hunter:kill', async (exe) => {
  const n = path.basename(String(exe || ''));
  if (!/^[\w .()\-]+\.exe$/i.test(n)) return { ok: false, err: 'Proceso no válido.' };
  if (!(await confirm(`¿Detener "${n}"?`, 'Se cerrará sin guardar datos.', 'Detener'))) return { ok: false, cancelado: true };
  const r = await U.run('taskkill.exe', ['/IM', n, '/F']);
  return { ok: r.ok, err: r.ok ? '' : 'No se pudo detener (¿ya estaba cerrado?).' };
});
H('hunter:folder', (f) => { if (f && fs.existsSync(f)) shell.showItemInFolder(f); return true; });
H('hunter:unstart', async (ids) => { let n = 0; if (!(await confirm('¿Quitar del inicio automático?', 'Se guarda una copia.', 'Quitar'))) return { ok: false, cancelado: true }; for (const id of ids || []) if ((await T.startupRemove(id)).ok) n++; return { ok: true, n }; });
H('hunter:uninstall', (key) => { if (win && !win.isDestroyed()) { win.show(); win.focus(); sendWin('open-wizard', key); } return true; });

// ---------- Arranque ----------
async function selfTest() {
  const out = { pruebas: {} };
  const t = (n, v) => { out.pruebas[n] = v; console.log('[selftest]', n, JSON.stringify(v)); };
  try {
    const errs = []; win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 3) errs.push(msg); });
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    t('ventana', await win.webContents.executeJavaScript('({titulo:document.title, hayApp:!!document.getElementById("app"), puente:typeof window.barredor})'));
    await new Promise((r) => setTimeout(r, 12000));
    t('interfaz', await win.webContents.executeJavaScript('({herramientas:document.querySelectorAll(".tool").length, filas:document.querySelectorAll("tr.row").length})'));
    for (const id of ['startup', 'junk', 'browsers', 'office', 'windows', 'shred', 'evidence', 'backups', 'wintools', 'debloat', 'options']) await win.webContents.executeJavaScript('openTool("' + id + '")');
    await new Promise((r) => setTimeout(r, 4000)); t('errores_consola', errs);
    const lista = await win.webContents.executeJavaScript('window.barredor.invoke("prog:list")');
    t('programas_via_preload', { total: lista.length, ejemplos: lista.slice(0, 5).map((p) => `${p.nombre} ${p.version}`) });
    const todos = await P.listPrograms({ mostrarSistema: true, mostrarActualizaciones: true });
    t('programas_totales', todos.length);
    const ini = await T.startupList(); t('inicio', ini.length);
    const nav = await T.browsersScan(); t('navegadores', nav.map((b) => b.nombre));
    t('office', (await T.officeScan()).map((o) => `${o.id}:${o.elementos}`));
    const sc = await P.scan({ name: 'ZzProgramaInexistenteBarredor', mode: 'seguro' }); t('escaneo_inexistente', { reg: sc.registro.length, arch: sc.archivos.length });
    const real = todos.find((p) => p.nombre.length >= 6) || todos[0];
    const sm = await P.scan({ name: real.nombre, publisher: real.editor, mode: 'moderado', originalKey: real.clave }); t('escaneo_moderado_lectura', { programa: real.nombre, reg: sm.registro.length, arch: sm.archivos.length });
    t('bloqueos', { windows: U.pathIsSafe('C:\\Windows'), raiz: U.pathIsSafe('C:\\'), system: U.regKeyIsSafe('HKLM\\SYSTEM\\Foo'), clsid: U.regKeyIsSafe('HKLM\\SOFTWARE\\Classes\\CLSID'), microsoft: U.regKeyIsSafe('HKLM\\SOFTWARE\\Microsoft') });
    // Borrado seguro SOLO en una carpeta de prueba propia
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barredor-selftest-'));
    fs.mkdirSync(path.join(dir, 'sub')); fs.writeFileSync(path.join(dir, 'a.txt'), 'secreto'.repeat(1000)); fs.writeFileSync(path.join(dir, 'sub', 'b.bin'), Buffer.alloc(300000, 7));
    const sh = await T.shredPaths([dir], 3); t('borrado_seguro', { hechos: sh.hechos, fallos: sh.fallos.length, existe: fs.existsSync(dir) });
    // Papelera con una carpeta de prueba propia
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'barredor-selftest2-')); fs.writeFileSync(path.join(d2, 'x.txt'), 'x');
    const rp = await U.removePath(d2, true); t('papelera', { ok: rp.ok, existe: fs.existsSync(d2) });
    // Debloat: SOLO lectura. Nada se quita ni se desactiva.
    const apps = await D.appList(); t('debloat_apps', { total: apps.length, recomendadas: apps.filter((a) => a.recomendada).length, ejemplos: apps.slice(0, 4).map((a) => `${a.nombre} ${a.version}`) });
    const bloq = { tienda: D.appBloqueada({ Name: 'Microsoft.WindowsStore' }), compra: D.appBloqueada({ Name: 'Microsoft.StorePurchaseApp' }), shell: D.appBloqueada({ Name: 'Microsoft.Windows.ShellExperienceHost' }), vclibs: D.appBloqueada({ Name: 'Microsoft.VCLibs.140.00' }), framework: D.appBloqueada({ Name: 'Contoso.Cosa', IsFramework: true }), noQuitable: D.appBloqueada({ Name: 'Contoso.Cosa', NonRemovable: true }), winget: D.appBloqueada({ Name: 'Microsoft.DesktopAppInstaller' }), noticias: D.appBloqueada({ Name: 'Microsoft.BingNews' }), calculadora: D.appBloqueada({ Name: 'Microsoft.WindowsCalculator' }) };
    t('debloat_proteccion', bloq);
    const sinProtegidas = apps.every((a) => !D.appBloqueada({ Name: a.name }));
    const rechazo = await D.appRemove('Microsoft.WindowsStore_0.0.0.0_x64__8wekyb3d8bbwe', false); t('debloat_rechazo_no_listado', rechazo);
    const feats = U.isElevated() ? await D.featList() : []; t('debloat_caracteristicas', { admin: U.isElevated(), total: feats.length, ejemplos: feats.slice(0, 4).map((f) => `${f.nombre}:${f.activa ? 'Activada' : 'Desactivada'}`) });
    const rechazoFeat = await D.featSet('Cualquier-Otra-Cosa', 'desactivar'); t('debloat_lista_blanca', rechazoFeat);
    const debOk = !!(bloq.tienda && bloq.compra && bloq.shell && bloq.vclibs && bloq.framework && bloq.noQuitable && bloq.winget && !bloq.noticias && !bloq.calculadora && sinProtegidas && rechazo.ok === false && rechazoFeat.ok === false);
    out.ok = !!(debOk && lista.length > 0 && out.pruebas.ventana.hayApp && out.pruebas.ventana.puente === 'object' && !fs.existsSync(dir) && !fs.existsSync(d2));
  } catch (e) { out.ok = false; out.error = String(e && e.stack || e); console.log('[selftest] ERROR', out.error); }
  try { fs.writeFileSync(path.join(U.DATA, 'selftest.json'), JSON.stringify(out, null, 2)); } catch { /* ignorar */ }
  console.log('[selftest] RESULTADO', out.ok ? 'OK' : 'FALLO');
  app.exit(out.ok ? 0 : 1);
}

app.whenReady().then(async () => {
  // Un desinstalador necesita administrador (HKLM, Archivos de programa): se reabre elevado; si se rechaza el aviso de Windows, sigue en modo limitado.
  if (app.isPackaged && !SELFTEST && !U.isElevated()) {
    const args = argv.slice(1).map((a) => `"${String(a).replace(/"/g, '')}"`).join(' ');
    const r = await U.ps('Start-Process -FilePath $env:BARREDOR_EXE -ArgumentList $env:BARREDOR_ARGS -Verb RunAs', { BARREDOR_EXE: process.execPath, BARREDOR_ARGS: args || '--elevado' });
    if (r.ok) { app.quit(); return; }
  }
  createWindow();
  if (SELFTEST) { selfTest(); return; }
  win.webContents.on('did-finish-load', () => {
    if (CLI) sendWin('cli', CLI);
    T.dailyBackup().then((r) => { if (r.hecho) sendWin('toast', 'Copia diaria del registro creada.'); });
  });
});
app.on('window-all-closed', () => app.quit());
