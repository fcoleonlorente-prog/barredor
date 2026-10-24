// Herramientas: inicio, limpiadores, borrado seguro, evidencias, copias y herramientas de Windows.
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { shell } = require('electron');
const U = require('./util');

const E = (k) => process.env[k] || '';
const SYS = E('SystemRoot') || 'C:\\Windows';
let emit = () => {};
const setEmitter = (f) => { emit = f; };

// ---------- Copias de registro ----------
async function createRestorePoint() {
  const r = await U.ps('Checkpoint-Computer -Description "Barredor" -RestorePointType MODIFY_SETTINGS; Write-Output ok', {}, { timeout: 180000 });
  return { ok: r.ok, err: r.ok ? '' : (r.err.trim().split('\n')[0] || 'No se pudo crear el punto de restauración') };
}
const BACKUP_KEYS = [
  ['HKCU\\Software', 'HKCU_Software'],
  ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM_Uninstall'],
  ['HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM_Uninstall32']
];
async function backupRegistry(tag) {
  const res = await Promise.all(BACKUP_KEYS.map(([k, l]) => U.regExport(k, `${tag}_${l}`)));
  return res.filter(Boolean).length;
}
async function dailyBackup() {
  const cfg = U.loadConfig();
  const hoy = new Date().toISOString().slice(0, 10);
  if (!cfg.opciones.copiaDiaria || cfg.ultimaCopiaDiaria === hoy) return { hecho: false };
  const n = await backupRegistry('diaria');
  cfg.ultimaCopiaDiaria = hoy;
  U.saveConfig(cfg);
  return { hecho: true, archivos: n };
}

// ---------- Inicio automático ----------
const RUN_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\RunOnce'
];
const isRunKey = (k) => RUN_KEYS.some((r) => r.toLowerCase() === String(k).toLowerCase());
const STARTUP_DIRS = () => [
  { dir: path.join(E('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), ambito: 'Carpeta Inicio (usuario)' },
  { dir: path.join(E('ProgramData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'), ambito: 'Carpeta Inicio (común)' }
];
const PS_RUNVALS = `
$o=foreach($k in (ConvertFrom-Json $env:BARREDOR_KEYS)){
 $pk=$k -replace '^HKCU','HKCU:' -replace '^HKLM','HKLM:'
 if(-not (Test-Path -LiteralPath $pk)){continue}
 $it=Get-Item -LiteralPath $pk
 foreach($n in $it.GetValueNames()){ if($n){ [pscustomobject]@{key=$k;name=$n;data=[string]$it.GetValue($n);kind=[string]$it.GetValueKind($n)} } }
}
@($o) | ConvertTo-Json -Compress`;
const exeOf = (cmd) => { const m = String(cmd).match(/^\s*"([^"]+)"|^\s*([^\s"]+?\.(?:exe|bat|cmd|lnk))/i); return m ? (m[1] || m[2]) : ''; };

async function startupList() {
  const cfg = U.loadConfig();
  const out = [];
  const vals = await U.psJson(PS_RUNVALS, { BARREDOR_KEYS: JSON.stringify(RUN_KEYS) });
  for (const v of vals) out.push({ id: `reg::${v.key}::${v.name}`, tipo: 'reg', nombre: v.name, comando: v.data, ubicacion: v.key, tipoValor: v.kind, estado: 'Activo' });
  for (const { dir, ambito } of STARTUP_DIRS()) {
    let ents = [];
    try { ents = fs.readdirSync(dir); } catch { /* no existe */ }
    for (const f of ents) if (f.toLowerCase() !== 'desktop.ini') out.push({ id: `dir::${path.join(dir, f)}`, tipo: 'dir', nombre: f, comando: path.join(dir, f), ubicacion: ambito, estado: 'Activo' });
  }
  for (const [id, d] of Object.entries(cfg.inicioDesactivado || {})) out.push({ id: `off::${id}`, tipo: d.tipo, nombre: d.nombre, comando: d.comando, ubicacion: d.ubicacion || d.key || d.ruta, estado: 'Desactivado' });
  return out;
}
async function findStartup(id) { return (await startupList()).find((e) => e.id === id); }
async function startupRun(id) {
  const e = await findStartup(id);
  if (!e) return { ok: false, err: 'La entrada ya no existe.' };
  if (e.tipo === 'dir') { const r = await shell.openPath(e.comando); return { ok: !r, err: r }; }
  const c = spawn('cmd.exe', ['/d', '/s', '/c', `"${e.comando}"`], { windowsVerbatimArguments: true, stdio: 'ignore', detached: true });
  c.on('error', () => {}); c.unref();
  return { ok: true };
}
async function startupKill(id) {
  const e = await findStartup(id);
  if (!e) return { ok: false, err: 'La entrada ya no existe.' };
  const exe = path.basename(exeOf(e.comando) || '');
  if (!/^[\w .()\-]+\.exe$/i.test(exe)) return { ok: false, err: 'No se pudo determinar el proceso.' };
  const r = await U.run('taskkill.exe', ['/IM', exe, '/F']);
  return { ok: r.ok, err: r.ok ? '' : 'El proceso no está en ejecución o no se pudo finalizar.' };
}
async function regAdd(key, name, data, kind) {
  const k = ['REG_SZ', 'REG_EXPAND_SZ'].includes(kind) ? kind : 'REG_SZ';
  return U.run('reg.exe', ['add', key, '/v', name, '/t', k, '/d', data, '/f']);
}
async function startupAdd(name, file) {
  name = String(name || '').trim();
  if (!name || /[\\"]/.test(name) || name.length > 100) return { ok: false, err: 'Nombre no válido.' };
  if (!path.isAbsolute(file || '') || !fs.existsSync(file)) return { ok: false, err: 'La ruta no existe.' };
  const r = await regAdd(RUN_KEYS[0], name, `"${file}"`, 'REG_SZ');
  return { ok: r.ok, err: r.err.trim() };
}
function saveEntryBackup(e) {
  const f = path.join(U.BACKUPS, `inicio_${U.stamp()}_${U.safeName(e.nombre)}.json`);
  fs.writeFileSync(f, JSON.stringify({ tipo: e.tipo, key: e.ubicacion, nombre: e.nombre, comando: e.comando, tipoValor: e.tipoValor }, null, 2));
  return f;
}
async function startupRemove(id) {
  const e = await findStartup(id);
  if (!e || e.estado !== 'Activo') return { ok: false, err: 'La entrada ya no existe o está desactivada.' };
  if (e.tipo === 'reg') {
    if (!isRunKey(e.ubicacion)) return { ok: false, err: 'Clave no permitida.' };
    saveEntryBackup(e);
    const r = await U.run('reg.exe', ['delete', e.ubicacion, '/v', e.nombre, '/f']);
    return { ok: r.ok, err: r.err.trim() };
  }
  const dir = path.join(U.BACKUPS, `archivos_${U.stamp()}_${U.safeName(e.nombre)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ original: e.comando }));
  try { fs.renameSync(e.comando, path.join(dir, path.basename(e.comando))); return { ok: true }; } catch (x) { return { ok: false, err: x.message }; }
}
async function startupToggle(id) {
  const cfg = U.loadConfig();
  if (id.startsWith('off::')) {
    const real = id.slice(5), d = cfg.inicioDesactivado[real];
    if (!d) return { ok: false, err: 'No encontrada.' };
    if (d.tipo === 'reg') {
      if (!isRunKey(d.key)) return { ok: false, err: 'Clave no permitida.' };
      const r = await regAdd(d.key, d.nombre, d.comando, d.tipoValor);
      if (!r.ok) return { ok: false, err: r.err.trim() };
    } else {
      try { fs.renameSync(d.guardado, d.ruta); } catch (x) { return { ok: false, err: x.message }; }
    }
    delete cfg.inicioDesactivado[real]; U.saveConfig(cfg);
    return { ok: true };
  }
  const e = await findStartup(id);
  if (!e) return { ok: false, err: 'La entrada ya no existe.' };
  const rec = { tipo: e.tipo, nombre: e.nombre, comando: e.comando, ubicacion: e.ubicacion };
  if (e.tipo === 'reg') {
    if (!isRunKey(e.ubicacion)) return { ok: false, err: 'Clave no permitida.' };
    Object.assign(rec, { key: e.ubicacion, tipoValor: e.tipoValor });
    const r = await U.run('reg.exe', ['delete', e.ubicacion, '/v', e.nombre, '/f']);
    if (!r.ok) return { ok: false, err: r.err.trim() };
  } else {
    const dir = path.join(U.DATA, 'inicio_desactivado'); fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${Date.now()}_${path.basename(e.comando)}`);
    try { fs.renameSync(e.comando, dest); } catch (x) { return { ok: false, err: x.message }; }
    Object.assign(rec, { ruta: e.comando, guardado: dest });
  }
  cfg.inicioDesactivado[`${Date.now()}_${Math.random().toString(36).slice(2, 6)}`] = rec;
  U.saveConfig(cfg);
  return { ok: true };
}

// ---------- Recorrido de archivos ----------
async function walk(dir, { maxDepth = 8, filter = null, cap = 3000, skip = [] } = {}) {
  const files = []; let total = 0, count = 0;
  const skipL = skip.map((s) => s.toLowerCase());
  async function rec(d, depth) {
    let ents;
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (skipL.some((s) => full.toLowerCase().startsWith(s))) continue;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (depth < maxDepth) await rec(full, depth + 1); continue; }
      if (filter && !filter(e.name, full)) continue;
      let size = 0; try { size = (await fsp.stat(full)).size; } catch { continue; }
      total += size; count++;
      if (files.length < cap) files.push({ path: full, size });
    }
  }
  await rec(dir, 1);
  return { files, total, count };
}
const excluded = (p, cfg) => (cfg.exclusionBasura || []).some((x) => p.toLowerCase().startsWith(String(x).toLowerCase()));

// ---------- Limpiador de basura ----------
let lastJunk = new Set();
async function junkScan() {
  const cfg = U.loadConfig();
  const tmp = os.tmpdir();
  const L = E('LOCALAPPDATA'), A = E('APPDATA'), PD = E('ProgramData');
  const skipAll = [tmp, U.DATA, path.join(L, 'Packages'), path.join(L, 'Microsoft', 'Windows', 'WER')];
  const defs = [
    { id: 'tempUsuario', nombre: 'Temporales del usuario', dirs: [tmp] },
    { id: 'tempWindows', nombre: 'Temporales de Windows', dirs: [path.join(SYS, 'Temp')] },
    { id: 'miniaturas', nombre: 'Caché de miniaturas', dirs: [path.join(L, 'Microsoft', 'Windows', 'Explorer')], depth: 1, filter: (n) => /^thumbcache_.*\.db$/i.test(n) },
    { id: 'informes', nombre: 'Informes de errores', dirs: [path.join(L, 'Microsoft', 'Windows', 'WER'), path.join(PD, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), path.join(PD, 'Microsoft', 'Windows', 'WER', 'ReportQueue')] },
    { id: 'registros', nombre: 'Registros y restos (*.log, *.tmp, *.chk, *.old, ~*.*)', dirs: [L, A], depth: 3, skip: skipAll, filter: (n) => /\.(log|tmp|chk|old)$/i.test(n) || n.startsWith('~') },
    { id: 'volcados', nombre: 'Volcados de memoria', dirs: [path.join(SYS, 'Minidump'), path.join(L, 'CrashDumps')] }
  ];
  const cats = [];
  lastJunk = new Set();
  for (const d of defs) {
    const cat = { id: d.id, nombre: d.nombre, archivos: [], total: 0, cantidad: 0 };
    for (const dir of d.dirs) {
      if (!fs.existsSync(dir)) continue;
      const w = await walk(dir, { maxDepth: d.depth || 8, filter: d.filter, skip: d.skip || [] });
      for (const f of w.files) if (!excluded(f.path, cfg) && U.pathIsSafe(f.path)) { cat.archivos.push(f); lastJunk.add(f.path.toLowerCase()); }
      cat.total += w.total; cat.cantidad += w.count;
    }
    if (d.id === 'volcados') {
      const m = path.join(SYS, 'MEMORY.DMP');
      try { const st = fs.statSync(m); cat.archivos.push({ path: m, size: st.size }); lastJunk.add(m.toLowerCase()); cat.total += st.size; cat.cantidad++; } catch { /* no existe */ }
    }
    cats.push(cat);
  }
  return cats;
}
async function deleteFiles(list) {
  let borrados = 0, liberado = 0, fallos = 0;
  for (const p of list) {
    let size = 0;
    try { size = fs.statSync(p).size; await fsp.unlink(p); borrados++; liberado += size; } catch { fallos++; } // en uso o sin permiso: se ignora
  }
  return { borrados, liberado, fallos };
}
async function junkClean(paths) {
  const cfg = U.loadConfig();
  const ok = (paths || []).filter((p) => typeof p === 'string' && lastJunk.has(p.toLowerCase()) && U.pathIsSafe(p) && !excluded(p, cfg));
  return deleteFiles(ok);
}

// ---------- Limpiador de navegadores ----------
const CHROMIUM = [
  { id: 'chrome', nombre: 'Google Chrome', exe: 'chrome.exe', base: () => path.join(E('LOCALAPPDATA'), 'Google', 'Chrome', 'User Data') },
  { id: 'edge', nombre: 'Microsoft Edge', exe: 'msedge.exe', base: () => path.join(E('LOCALAPPDATA'), 'Microsoft', 'Edge', 'User Data') },
  { id: 'brave', nombre: 'Brave', exe: 'brave.exe', base: () => path.join(E('LOCALAPPDATA'), 'BraveSoftware', 'Brave-Browser', 'User Data') }
];
function browserPaths(b) {
  const t = { cache: [], cookies: [], historial: [], descargas: [] };
  if (b.id === 'firefox') {
    const profs = (base) => { try { return fs.readdirSync(base).map((d) => path.join(base, d)); } catch { return []; } };
    for (const p of profs(path.join(E('LOCALAPPDATA'), 'Mozilla', 'Firefox', 'Profiles'))) t.cache.push(path.join(p, 'cache2'));
    for (const p of profs(path.join(E('APPDATA'), 'Mozilla', 'Firefox', 'Profiles'))) for (const f of ['cookies.sqlite', 'cookies.sqlite-wal', 'cookies.sqlite-shm']) t.cookies.push(path.join(p, f));
    return t; // el historial de Firefox comparte base con los marcadores: no se toca
  }
  let profiles = [];
  try { profiles = fs.readdirSync(b.base()).filter((d) => /^(Default|Profile \d+)$/.test(d)).map((d) => path.join(b.base(), d)); } catch { /* sin instalar */ }
  for (const p of profiles) {
    for (const r of ['Cache', 'Code Cache', 'GPUCache', path.join('Service Worker', 'CacheStorage')]) t.cache.push(path.join(p, r));
    for (const r of [path.join('Network', 'Cookies'), path.join('Network', 'Cookies-journal'), 'Cookies', 'Cookies-journal']) t.cookies.push(path.join(p, r));
    for (const r of ['History', 'History-journal', 'Visited Links', 'Archived History']) t.historial.push(path.join(p, r)); // las descargas viven en History
  }
  t.descargas = [];
  return t;
}
const ALL_BROWSERS = [...CHROMIUM, { id: 'firefox', nombre: 'Mozilla Firefox', exe: 'firefox.exe' }];
async function browsersRunning() {
  const r = await U.run('tasklist.exe', ['/FO', 'CSV', '/NH']);
  return r.out.toLowerCase();
}
async function browsersScan() {
  const run = await browsersRunning();
  return ALL_BROWSERS.map((b) => {
    const t = browserPaths(b);
    const tipos = {};
    for (const k of Object.keys(t)) {
      const ex = t[k].filter((p) => fs.existsSync(p));
      tipos[k] = { disponible: ex.length > 0, tamano: ex.reduce((s, p) => s + U.dirSize(p), 0) };
    }
    const instalado = Object.values(tipos).some((x) => x.disponible);
    return { id: b.id, nombre: b.nombre, instalado, abierto: run.includes(`"${b.exe}"`), tipos };
  }).filter((b) => b.instalado);
}
async function browsersClean(sel) {
  let borrados = 0, liberado = 0, fallos = 0;
  for (const b of ALL_BROWSERS) {
    const tipos = (sel && sel[b.id]) || [];
    if (!tipos.length) continue;
    const t = browserPaths(b);
    const want = new Set(tipos.map((x) => (x === 'descargas' ? 'historial' : x)));
    for (const k of want) for (const p of t[k] || []) {
      if (!fs.existsSync(p) || !U.pathIsSafe(p)) continue;
      const size = U.dirSize(p);
      try { fs.rmSync(p, { recursive: true, force: true }); if (fs.existsSync(p)) fallos++; else { borrados++; liberado += size; } } catch { fallos++; }
    }
  }
  return { borrados, liberado, fallos };
}

// ---------- Limpiador de Office ----------
const OFFICE_APPS = ['Word', 'Excel', 'PowerPoint', 'Access'];
const PS_OFFICE = `
$o=foreach($app in (ConvertFrom-Json $env:BARREDOR_APPS)){
 foreach($v in (Get-ChildItem -LiteralPath 'HKCU:\\SOFTWARE\\Microsoft\\Office' -ErrorAction SilentlyContinue)){
  $base="HKCU:\\SOFTWARE\\Microsoft\\Office\\$($v.PSChildName)\\$app"
  if(-not (Test-Path -LiteralPath $base)){continue}
  foreach($k in (Get-ChildItem -LiteralPath $base -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -in 'File MRU','Place MRU' })){
   [pscustomobject]@{app=$app;key=($k.Name -replace '^HKEY_CURRENT_USER','HKCU');n=$k.GetValueNames().Count}
  }
 }
}
@($o) | ConvertTo-Json -Compress`;
const officeRecent = () => path.join(E('APPDATA'), 'Microsoft', 'Office', 'Recent');
async function officeScan() {
  const keys = await U.psJson(PS_OFFICE, { BARREDOR_APPS: JSON.stringify(OFFICE_APPS) });
  const res = OFFICE_APPS.map((a) => ({ id: a, nombre: a, elementos: keys.filter((k) => k.app === a).reduce((s, k) => s + Number(k.n || 0), 0), claves: keys.filter((k) => k.app === a).length }));
  let n = 0; try { n = fs.readdirSync(officeRecent()).length; } catch { /* sin carpeta */ }
  res.push({ id: 'Recent', nombre: 'Accesos recientes (carpeta Recent)', elementos: n, claves: 0 });
  return res;
}
async function officeClean(apps) {
  let borrados = 0, fallos = 0;
  const keys = await U.psJson(PS_OFFICE, { BARREDOR_APPS: JSON.stringify(OFFICE_APPS) });
  for (const k of keys) {
    if (!(apps || []).includes(k.app) || !U.regKeyIsSafe(k.key)) continue;
    await U.regExport(k.key, `office_${k.app}`);
    const r = await U.run('reg.exe', ['delete', k.key, '/va', '/f']);
    if (r.ok) borrados += Number(k.n || 0); else fallos++;
  }
  if ((apps || []).includes('Recent')) {
    const dir = officeRecent();
    try { for (const f of fs.readdirSync(dir)) { try { fs.rmSync(path.join(dir, f), { recursive: true, force: true }); borrados++; } catch { fallos++; } } } catch { /* sin carpeta */ }
  }
  return { borrados, fallos, liberado: 0 };
}

// ---------- Limpiador de Windows ----------
const EXPL = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer';
const winFiles = {
  recientes: () => fs.readdirSync(path.join(E('APPDATA'), 'Microsoft', 'Windows', 'Recent'), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(E('APPDATA'), 'Microsoft', 'Windows', 'Recent', e.name)),
  saltos: () => ['AutomaticDestinations', 'CustomDestinations'].flatMap((d) => { const p = path.join(E('APPDATA'), 'Microsoft', 'Windows', 'Recent', d); try { return fs.readdirSync(p).map((f) => path.join(p, f)); } catch { return []; } }),
  iconos: () => { const p = path.join(E('LOCALAPPDATA'), 'Microsoft', 'Windows', 'Explorer'); const l = [path.join(E('LOCALAPPDATA'), 'IconCache.db')]; try { for (const f of fs.readdirSync(p)) if (/^iconcache_.*\.db$/i.test(f)) l.push(path.join(p, f)); } catch { /* sin carpeta */ } return l.filter((x) => fs.existsSync(x)); }
};
const WIN_ITEMS = [
  ['recientes', 'Documentos recientes (carpeta Recent)'], ['saltos', 'Listas de salto'], ['runmru', 'Historial de Ejecutar'], ['iconos', 'Caché de iconos'],
  ['temporales', 'Archivos temporales del usuario'], ['papelera', 'Papelera de reciclaje'], ['portapapeles', 'Portapapeles'], ['dns', 'Caché DNS'], ['busqueda', 'Historial de búsqueda del Explorador']
];
const size = (l) => l.reduce((s, p) => { try { return s + fs.statSync(p).size; } catch { return s; } }, 0);
async function winScan() {
  const out = [];
  for (const [id, nombre] of WIN_ITEMS) {
    let tam = null;
    try {
      if (winFiles[id]) tam = size(winFiles[id]());
      else if (id === 'temporales') tam = (await walk(os.tmpdir(), { cap: 0 })).total;
    } catch { tam = 0; }
    out.push({ id, nombre, tamano: tam });
  }
  return out;
}
async function winClean(ids) {
  let liberado = 0, fallos = 0; const hechos = [];
  for (const id of ids || []) {
    if (!WIN_ITEMS.some((x) => x[0] === id)) continue;
    try {
      if (winFiles[id]) { const l = winFiles[id](); liberado += size(l); const r = await deleteFiles(l); fallos += r.fallos; }
      else if (id === 'temporales') { const w = await walk(os.tmpdir(), { cap: 1e6, skip: [U.DATA] }); const r = await deleteFiles(w.files.map((f) => f.path)); liberado += r.liberado; fallos += r.fallos; }
      else if (id === 'runmru') { await U.regExport(EXPL + '\\RunMRU', 'RunMRU'); await U.run('reg.exe', ['delete', EXPL + '\\RunMRU', '/va', '/f']); }
      else if (id === 'busqueda') { for (const k of ['WordWheelQuery', 'TypedPaths']) { await U.regExport(`${EXPL}\\${k}`, k); await U.run('reg.exe', ['delete', `${EXPL}\\${k}`, '/va', '/f']); } }
      else if (id === 'papelera') await U.ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Output ok');
      else if (id === 'portapapeles') await U.ps('Set-Clipboard -Value $null; Write-Output ok');
      else if (id === 'dns') await U.run('ipconfig.exe', ['/flushdns']);
      hechos.push(id);
    } catch { fallos++; }
  }
  return { hechos, liberado, fallos };
}

// ---------- Borrado seguro ----------
const CHUNK = 1024 * 1024;
const PATTERNS = { 1: ['0'], 3: ['r', '0', 'F'], 7: ['r', '0', 'F', 'r', '0', 'F', 'r'] };
async function overwrite(file, passes) {
  const st = await fsp.stat(file);
  if (st.size > 0) {
    const fh = await fsp.open(file, 'r+');
    try {
      for (const p of PATTERNS[passes]) {
        let left = st.size, pos = 0;
        while (left > 0) {
          const n = Math.min(CHUNK, left);
          const buf = p === 'r' ? crypto.randomBytes(n) : Buffer.alloc(n, p === '0' ? 0 : 0xff);
          await fh.write(buf, 0, n, pos);
          pos += n; left -= n;
        }
        await fh.sync();
      }
      await fh.truncate(0);
    } finally { await fh.close(); }
  }
  const renamed = path.join(path.dirname(file), crypto.randomBytes(8).toString('hex'));
  await fsp.rename(file, renamed);
  await fsp.unlink(renamed);
}
async function shredPaths(paths, passes) {
  passes = [1, 3, 7].includes(Number(passes)) ? Number(passes) : 1;
  const failed = []; let hechos = 0;
  const dirs = [];
  async function doFile(f) {
    try { const l = await fsp.lstat(f); if (l.isSymbolicLink()) await fsp.unlink(f); else await overwrite(f, passes); hechos++; emit('shred:progreso', { hechos, actual: f }); }
    catch (e) { failed.push({ path: f, err: e.message }); }
  }
  async function visit(p) {
    const l = await fsp.lstat(p);
    if (l.isDirectory() && !l.isSymbolicLink()) { dirs.push(p); for (const e of await fsp.readdir(p)) await visit(path.join(p, e)); }
    else await doFile(p);
  }
  for (const p of paths || []) {
    if (!U.pathIsSafe(p) || !fs.existsSync(p)) { failed.push({ path: p, err: 'Ruta no válida o bloqueada' }); continue; }
    try { await visit(p); } catch (e) { failed.push({ path: p, err: e.message }); }
  }
  for (const d of dirs.reverse()) { try { const r = path.join(path.dirname(d), crypto.randomBytes(8).toString('hex')); await fsp.rename(d, r); await fsp.rmdir(r); } catch (e) { failed.push({ path: d, err: e.message }); } }
  return { hechos, fallos: failed };
}

// ---------- Eliminador de evidencias (espacio libre) ----------
let evidCancel = false;
function drives() {
  const l = [];
  for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':'; try { const s = fs.statfsSync(d + '\\'); l.push({ unidad: d, libre: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) }); } catch { /* no existe */ } }
  return l;
}
async function evidStart(drive, passes) {
  if (!/^[A-Za-z]:$/.test(drive || '') || !drives().some((d) => d.unidad.toUpperCase() === drive.toUpperCase())) return { ok: false, err: 'Unidad no válida.' };
  passes = [1, 3, 7].includes(Number(passes)) ? Number(passes) : 1;
  evidCancel = false;
  const dir = path.join(drive.toUpperCase() + '\\', 'Barredor_espacio_libre');
  const reserve = 200 * 1024 * 1024; // se deja un margen libre para no ahogar el sistema
  const free = () => { const s = fs.statfsSync(drive + '\\'); return Number(s.bavail) * Number(s.bsize); };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const start = free(), goal = Math.max(1, start - reserve);
    const seq = PATTERNS[passes];
    for (let i = 0; i < seq.length && !evidCancel; i++) {
      const file = path.join(dir, `relleno_${i}.tmp`);
      const fh = await fsp.open(file, 'w');
      let written = 0;
      try {
        while (!evidCancel && free() > reserve) {
          const p = seq[i];
          await fh.write(p === 'r' ? crypto.randomBytes(CHUNK) : Buffer.alloc(CHUNK, p === '0' ? 0 : 0xff));
          written += CHUNK;
          if (written % (32 * CHUNK) === 0) emit('evid:progreso', { pasada: i + 1, de: seq.length, pct: Math.min(100, Math.round((written / goal) * 100)) });
        }
      } catch (e) { if (e.code !== 'ENOSPC') throw e; } finally { await fh.close(); }
      await fsp.unlink(file).catch(() => {});
    }
    return { ok: true, cancelado: evidCancel };
  } catch (e) { return { ok: false, err: e.message }; }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ya borrado */ } }
}
const evidCancelNow = () => { evidCancel = true; return true; };

// ---------- Gestor de copias ----------
function inBackups(id) { return typeof id === 'string' && id === path.basename(id) && !id.includes('..') && fs.existsSync(path.join(U.BACKUPS, id)); }
function bkList() {
  const out = [];
  for (const f of fs.readdirSync(U.BACKUPS)) {
    const p = path.join(U.BACKUPS, f); let st; try { st = fs.statSync(p); } catch { continue; }
    const tipo = f.endsWith('.reg') ? 'Registro' : f.endsWith('.json') ? 'Entrada de inicio' : st.isDirectory() ? 'Archivos' : 'Otro';
    out.push({ id: f, nombre: f.replace(/^(reg|inicio|archivos)_\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d_?/, '').replace(/\.(reg|json)$/, '') || f, tipo, fecha: st.mtime.toISOString().replace('T', ' ').slice(0, 19), tamano: st.isDirectory() ? U.dirSize(p) : st.size });
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
async function bkRestore(id) {
  if (!inBackups(id)) return { ok: false, err: 'Copia no encontrada.' };
  const p = path.join(U.BACKUPS, id);
  if (id.endsWith('.reg')) { const r = await U.run('reg.exe', ['import', p]); return { ok: r.ok, err: r.err.trim() }; }
  if (id.endsWith('.json')) {
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (d.tipo !== 'reg' || !isRunKey(d.key)) return { ok: false, err: 'Copia no restaurable.' };
      const r = await regAdd(d.key, d.nombre, d.comando, d.tipoValor);
      return { ok: r.ok, err: r.err.trim() };
    } catch (e) { return { ok: false, err: e.message }; }
  }
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(p, 'meta.json'), 'utf8'));
    const orig = meta.original;
    if (!STARTUP_DIRS().some((s) => path.dirname(orig).toLowerCase() === s.dir.toLowerCase())) return { ok: false, err: 'Destino no permitido.' };
    fs.mkdirSync(path.dirname(orig), { recursive: true });
    fs.renameSync(path.join(p, path.basename(orig)), orig);
    return { ok: true };
  } catch (e) { return { ok: false, err: e.message }; }
}
function bkDelete(id) { if (!inBackups(id)) return { ok: false, err: 'Copia no encontrada.' }; fs.rmSync(path.join(U.BACKUPS, id), { recursive: true, force: true }); return { ok: true }; }
function bkDeleteAll() { let n = 0; for (const f of fs.readdirSync(U.BACKUPS)) { fs.rmSync(path.join(U.BACKUPS, f), { recursive: true, force: true }); n++; } return { ok: true, n }; }
const bkOpen = () => shell.openPath(U.BACKUPS);

// ---------- Herramientas de Windows ----------
const sysexe = (n) => path.join(SYS, 'System32', n);
const WIN_TOOLS = [
  { id: 'restaurar', nombre: 'Restaurar sistema', desc: 'Volver a un punto de restauración anterior.', cmd: [sysexe('rstrui.exe')] },
  { id: 'diagred', nombre: 'Diagnóstico de red', desc: 'Solucionador de problemas de red.', cmd: ['explorer.exe', 'ms-settings:network-status'] },
  { id: 'inforred', nombre: 'Información de red', desc: 'Muestra la configuración de red (ipconfig /all).', cmd: ['cmd.exe', '/c', 'start', 'Información de red', 'cmd.exe', '/k', 'ipconfig /all'] },
  { id: 'seguridad', nombre: 'Centro de seguridad', desc: 'Seguridad de Windows.', cmd: ['explorer.exe', 'windowsdefender:'] },
  { id: 'sistema', nombre: 'Propiedades del sistema', desc: 'Ventana clásica de propiedades.', cmd: [sysexe('control.exe'), 'sysdm.cpl'] },
  { id: 'msinfo', nombre: 'Información del sistema', desc: 'Resumen de hardware y software.', cmd: [sysexe('msinfo32.exe')] },
  { id: 'netstat', nombre: 'Netstat', desc: 'Conexiones de red activas.', cmd: ['cmd.exe', '/c', 'start', 'Netstat', 'cmd.exe', '/k', 'netstat -ano'] },
  { id: 'osk', nombre: 'Teclado en pantalla', desc: 'Abre el teclado virtual.', cmd: [sysexe('osk.exe')] },
  { id: 'defrag', nombre: 'Desfragmentador', desc: 'Optimizar unidades.', cmd: [sysexe('dfrgui.exe')] },
  { id: 'servicios', nombre: 'Servicios', desc: 'Administrar los servicios.', cmd: [sysexe('mmc.exe'), 'services.msc'] },
  { id: 'compartidas', nombre: 'Carpetas compartidas', desc: 'Recursos compartidos del equipo.', cmd: [sysexe('mmc.exe'), 'fsmgmt.msc'] },
  { id: 'gpedit', nombre: 'Directiva de grupo', desc: 'No existe en Windows Home.', cmd: [sysexe('mmc.exe'), 'gpedit.msc'] },
  { id: 'caracteristicas', nombre: 'Características de Windows', desc: 'Activar o desactivar características.', cmd: [sysexe('optionalfeatures.exe')] },
  { id: 'mrt', nombre: 'Herramienta de eliminación de software malintencionado', desc: 'Análisis de Microsoft.', cmd: [sysexe('mrt.exe')] },
  { id: 'copia', nombre: 'Copia de seguridad', desc: 'Copias de seguridad y restauración.', cmd: [sysexe('control.exe'), '/name', 'Microsoft.BackupAndRestoreCenter'] },
  { id: 'tareas', nombre: 'Programador de tareas', desc: 'Tareas programadas.', cmd: [sysexe('mmc.exe'), 'taskschd.msc'] },
  { id: 'chkdsk', nombre: 'Comprobar disco (solo lectura)', desc: 'chkdsk sin reparar nada.', cmd: ['cmd.exe', '/c', 'start', 'Comprobar disco', 'cmd.exe', '/k', 'chkdsk'] },
  { id: 'sfc', nombre: 'Comprobador de archivos (sfc /scannow)', desc: 'Pide permisos de administrador.', admin: true }
];
const winToolsList = () => WIN_TOOLS.map(({ id, nombre, desc, admin }) => ({ id, nombre, desc, admin: !!admin }));
function winToolRun(id) {
  const t = WIN_TOOLS.find((x) => x.id === id);
  if (!t) return Promise.resolve({ ok: false, err: 'Herramienta desconocida.' });
  const cmd = t.admin
    ? ['powershell.exe', '-NoProfile', '-Command', "Start-Process cmd.exe -Verb RunAs -ArgumentList '/k sfc /scannow'"]
    : t.cmd;
  return new Promise((res) => {
    const c = spawn(cmd[0], cmd.slice(1), { stdio: 'ignore', detached: true, windowsHide: !!t.admin });
    c.on('error', (e) => res({ ok: false, err: e.message }));
    c.on('spawn', () => { c.unref(); res({ ok: true }); });
  });
}

module.exports = {
  setEmitter, createRestorePoint, backupRegistry, dailyBackup, startupList, startupRun, startupKill, startupAdd, startupRemove, startupToggle,
  junkScan, junkClean, browsersScan, browsersClean, officeScan, officeClean, winScan, winClean, shredPaths, drives, evidStart, evidCancelNow,
  bkList, bkRestore, bkDelete, bkDeleteAll, bkOpen, winToolsList, winToolRun, walk, deleteFiles
};
