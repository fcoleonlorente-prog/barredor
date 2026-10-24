// Lectura de programas instalados, lanzamiento de desinstaladores y escaneo de restos.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const U = require('./util');

const PS_LIST = `
$roots=@(
 @('HKLM','HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'),
 @('HKLM','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'),
 @('HKCU','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'));
$res=foreach($r in $roots){
 foreach($c in (Get-ChildItem -LiteralPath $r[1] -ErrorAction SilentlyContinue)){
  $n=[string]$c.GetValue('DisplayName'); if(-not $n){continue}
  $k=$c.Name -replace '^HKEY_LOCAL_MACHINE','HKLM' -replace '^HKEY_CURRENT_USER','HKCU'
  [pscustomobject]@{
   nombre=$n; version=[string]$c.GetValue('DisplayVersion'); editor=[string]$c.GetValue('Publisher');
   tamanoKB=[int64]($c.GetValue('EstimatedSize')); fecha=[string]$c.GetValue('InstallDate');
   ubicacion=[string]$c.GetValue('InstallLocation'); desinstalar=[string]$c.GetValue('UninstallString');
   silencioso=[string]$c.GetValue('QuietUninstallString'); modificar=[string]$c.GetValue('ModifyPath');
   clave=$k; web=[string]$c.GetValue('URLInfoAbout'); comentario=[string]$c.GetValue('Comments');
   icono=[string]$c.GetValue('DisplayIcon');
   sistema=([int]$c.GetValue('SystemComponent') -eq 1); actualizacion=([string]$c.GetValue('ParentKeyName') -ne '') -or ($n -match '^(Update for|Security Update|Hotfix|Actualizaci)') -or ($c.PSChildName -match '^KB\\d+');
   msi=([int]$c.GetValue('WindowsInstaller') -eq 1)
  }
 }
}
@($res) | ConvertTo-Json -Compress -Depth 3`;

let cache = [];
async function listPrograms(opts = {}) {
  const raw = await U.psJson(PS_LIST, {}, { timeout: 90000 });
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    if (!p.nombre || seen.has(p.clave)) continue;
    seen.add(p.clave);
    p.tamanoKB = Number(p.tamanoKB) || 0;
    let f = '';
    if (/^\d{8}$/.test(p.fecha)) f = `${p.fecha.slice(0, 4)}-${p.fecha.slice(4, 6)}-${p.fecha.slice(6, 8)}`;
    p.fecha = f;
    out.push(p);
  }
  cache = out;
  const showSys = !!opts.mostrarSistema, showUpd = !!opts.mostrarActualizaciones;
  return out.filter((p) => (showSys || !p.sistema) && (showUpd || !p.actualizacion)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
async function getProgram(key) {
  if (!cache.length) await listPrograms({ mostrarSistema: true, mostrarActualizaciones: true });
  return cache.find((p) => p.clave === key);
}

// ---------- Lanzar desinstalador ----------
const procs = new Map();
let seq = 0;
function buildCommand(p, quiet) {
  const s = (p.desinstalar || '').trim();
  const msi = s.match(/msiexec(?:\.exe)?"?\s+\/[IX]\s*(\{[0-9A-Fa-f-]{36}\})/i);
  if (msi) return { file: 'msiexec.exe', args: quiet ? ['/X', msi[1], '/qn', '/norestart'] : ['/X', msi[1]] };
  const cmd = quiet && p.silencioso ? p.silencioso.trim() : s;
  if (!cmd) return null;
  // La cadena viene del registro (no del usuario); cmd la interpreta tal cual la usaría Windows.
  return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${cmd}"`], verbatim: true };
}
function startUninstall(p, quiet) {
  const c = buildCommand(p, quiet);
  if (!c) return { ok: false, err: 'Este programa no tiene desinstalador registrado.' };
  const id = ++seq;
  const child = spawn(c.file, c.args, { windowsHide: false, windowsVerbatimArguments: !!c.verbatim, stdio: 'ignore' });
  const rec = { child, waiters: [], done: false, code: null };
  const finish = (code) => { if (rec.done) return; rec.done = true; rec.code = code; rec.waiters.forEach((f) => f(code)); };
  child.on('exit', finish);
  child.on('error', (e) => { rec.error = e.message; finish(-1); });
  procs.set(id, rec);
  return { ok: true, id };
}
function waitUninstall(id) {
  const rec = procs.get(id);
  if (!rec || rec.done) return Promise.resolve(rec ? rec.code : null);
  return new Promise((res) => rec.waiters.push(res));
}
function skipWait(id) { const r = procs.get(id); if (r && !r.done) { r.done = true; r.waiters.forEach((f) => f('omitido')); } return true; }
async function startModify(p) {
  const s = (p.modificar || '').trim();
  if (!s) return { ok: false, err: 'No hay opción de cambiar/reparar.' };
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `"${s}"`], { windowsVerbatimArguments: true, stdio: 'ignore', detached: true });
  child.unref();
  return { ok: true };
}

// ---------- Escaneo de restos ----------
const STOP = new Set(['microsoft', 'windows', 'update', 'software', 'visual', 'studio', 'program', 'programs', 'files', 'common', 'system', 'driver', 'drivers', 'setup', 'installer', 'application', 'desktop', 'service', 'runtime', 'redistributable', 'google', 'adobe', 'intel', 'nvidia', 'amd']);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, '');
function baseName(name) {
  return String(name || '').replace(/\s*[(\[].*?[)\]]/g, '').replace(/\s+v?\d+(\.\d+)*\s*(x64|x86)?\s*$/i, '').trim();
}
function buildMatcher(o) {
  const base = baseName(o.name);
  const baseLow = base.toLowerCase();
  const baseN = norm(base);
  const pub = String(o.publisher || '').trim().toLowerCase();
  const first = base.split(/[\s\-_.]+/).map(norm).find((w) => w.length >= 4 && !STOP.has(w));
  const guids = (o.guids || []).map((g) => g.toLowerCase());
  const valid = baseN.length >= 4;
  return (candidate) => {
    const c = String(candidate).toLowerCase();
    const cn = norm(c);
    for (const g of guids) if (c.includes(g)) return 'fuerte';
    if (c.length < 4) return null;
    if (valid && c === baseLow) return 'fuerte';
    if (pub.length >= 4 && c === pub) return 'debil';
    if (o.mode === 'seguro') return null;
    if (valid && cn === baseN) return 'fuerte';
    if (valid && baseN.length >= 6 && cn.includes(baseN)) return 'fuerte';
    if (valid && baseN.length >= 6 && cn.length >= 6 && baseN.includes(cn)) return 'debil';
    if (o.mode === 'avanzado' && first && (cn === first || cn.startsWith(first) || cn.includes(first))) return 'debil';
    return null;
  };
}

const PS_WALK = `
$cfg=ConvertFrom-Json $env:BARREDOR_ROOTS; $out=New-Object System.Collections.ArrayList
function Walk($p,$d,$max,$skip){
 foreach($c in (Get-ChildItem -LiteralPath $p -ErrorAction SilentlyContinue)){
  [void]$out.Add($c.Name)
  if($d -lt $max -and -not ($d -eq 1 -and ($skip -contains $c.PSChildName.ToLower()))){ Walk $c.PSPath ($d+1) $max $skip }
 }
}
foreach($r in $cfg){ Walk $r.p 1 $r.depth @($r.skip) }
@($out) | ConvertTo-Json -Compress`;
const PS_VALUES = `
$o=foreach($k in (ConvertFrom-Json $env:BARREDOR_ROOTS)){
 if(-not (Test-Path -LiteralPath $k)){continue}
 $it=Get-Item -LiteralPath $k
 foreach($n in $it.GetValueNames()){ if($n){ [pscustomobject]@{key=($it.Name -replace '^HKEY_LOCAL_MACHINE','HKLM' -replace '^HKEY_CURRENT_USER','HKCU'); name=$n; data=[string]$it.GetValue($n)} } }
}
@($o) | ConvertTo-Json -Compress`;

function regRoots(mode) {
  const skip = ['microsoft', 'classes', 'wow6432node', 'policies', 'clients', 'registeredapplications', 'odbc'];
  const r = [
    { p: 'HKCU:\\SOFTWARE', depth: mode === 'seguro' ? 1 : 2, skip },
    { p: 'HKLM:\\SOFTWARE', depth: mode === 'seguro' ? 1 : 2, skip },
    { p: 'HKLM:\\SOFTWARE\\WOW6432Node', depth: mode === 'seguro' ? 1 : 2, skip }
  ];
  if (mode !== 'seguro') {
    r.push({ p: 'HKCU:\\SOFTWARE\\Classes', depth: 1, skip: [] }, { p: 'HKLM:\\SOFTWARE\\Classes', depth: 1, skip: [] });
    if (mode === 'avanzado') r.push({ p: 'HKLM:\\SOFTWARE\\Classes\\CLSID', depth: 1, skip: [] }, { p: 'HKLM:\\SOFTWARE\\Classes\\AppID', depth: 1, skip: [] }, { p: 'HKLM:\\SOFTWARE\\Classes\\TypeLib', depth: 1, skip: [] });
  }
  return r;
}
const toShort = (k) => U.normKey(k);

function dedupe(items, keyOf) {
  const sorted = [...items].sort((a, b) => keyOf(a).length - keyOf(b).length);
  const kept = [];
  for (const it of sorted) {
    const k = keyOf(it).toLowerCase() + '\\';
    if (!kept.some((x) => k.startsWith(keyOf(x).toLowerCase() + '\\') && x.nivel === 'fuerte')) kept.push(it);
  }
  return kept;
}

async function scanRegistry(o, match, cfg) {
  const items = [];
  const names = await U.psJson(PS_WALK, { BARREDOR_ROOTS: JSON.stringify(regRoots(o.mode)) }, { timeout: 240000 });
  for (const full of names) {
    const key = toShort(String(full));
    const leaf = key.split('\\').pop();
    const nivel = match(leaf);
    if (!nivel) continue;
    if (!U.regKeyIsSafe(key)) continue;
    items.push({ tipo: 'clave', key, nivel: U.excludedKey(key, cfg) ? 'excluida' : nivel });
  }
  if (o.mode !== 'seguro') {
    // Entradas Run con el nombre o apuntando a la carpeta de instalación
    const runKeys = ['HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'];
    const vals = await U.psJson(PS_VALUES, { BARREDOR_ROOTS: JSON.stringify(runKeys) });
    const loc = (o.installDir || '').toLowerCase();
    for (const v of vals) {
      let nivel = match(v.name);
      if (!nivel && loc.length > 6 && String(v.data).toLowerCase().includes(loc)) nivel = 'fuerte';
      if (nivel) items.push({ tipo: 'valor', key: v.key, valor: v.name, dato: v.data, nivel });
    }
    // Claves Uninstall huérfanas (el desinstalador no las limpió)
    const progs = await listPrograms({ mostrarSistema: true, mostrarActualizaciones: true });
    for (const p of progs) {
      if (o.originalKey) { if (p.clave === o.originalKey) items.push({ tipo: 'clave', key: p.clave, nivel: 'fuerte' }); }
      else if (o.forced && match(p.nombre) === 'fuerte') items.push({ tipo: 'clave', key: p.clave, nivel: 'fuerte' });
    }
  }
  const uniq = new Map();
  for (const it of items) uniq.set(`${it.key}|${it.valor || ''}`.toLowerCase(), it);
  return dedupe([...uniq.values()], (x) => x.key);
}
async function keyExists(k) {
  const r = await U.run('reg.exe', ['query', k]);
  return r.ok;
}

function scanFiles(o, match, cfg) {
  const env = (k) => process.env[k] || '';
  const items = [];
  const seen = new Set();
  const excl = (cfg.exclusionBasura || []).map((x) => x.toLowerCase());
  const add = (p, nivel) => {
    const k = p.toLowerCase();
    if (seen.has(k) || !U.pathIsSafe(p) || excl.some((x) => k.startsWith(x))) return;
    seen.add(k);
    let isDir = false, size = 0;
    try { isDir = fs.statSync(p).isDirectory(); size = isDir ? U.dirSize(p) : fs.statSync(p).size; } catch { return; }
    items.push({ path: p, nivel, esCarpeta: isDir, tamano: size });
  };
  if (o.installDir && fs.existsSync(o.installDir)) add(o.installDir, 'fuerte');
  if (o.mode === 'seguro') return items;
  const skipDesc = new Set(['microsoft', 'windows', 'common files', 'windowsapps', 'packages', 'temp', 'windows nt', 'internet explorer', 'windows defender', 'modifiablewindowsapps', 'reference assemblies', 'dotnet', 'microsoft.net', 'installer', 'package cache']);
  const roots = [env('APPDATA'), env('LOCALAPPDATA'), path.join(env('LOCALAPPDATA'), 'Programs'), env('ProgramData'), env('ProgramFiles'), env('ProgramFiles(x86)'),
    path.join(env('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(env('ProgramData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  if (o.mode === 'avanzado') roots.push(path.join(env('USERPROFILE'), 'Desktop'), path.join(env('PUBLIC') || 'C:\\Users\\Public', 'Desktop'));
  const visit = (dir, depth) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      const stem = e.isFile() ? e.name.replace(/\.(lnk|url)$/i, '') : e.name;
      const nivel = match(stem);
      if (nivel) { add(full, nivel); continue; }
      if (depth < 2 && e.isDirectory() && !e.isSymbolicLink() && !skipDesc.has(e.name.toLowerCase())) visit(full, depth + 1);
    }
  };
  for (const r of new Set(roots.filter(Boolean))) if (fs.existsSync(r)) visit(r, 1);
  return items;
}

async function scan(o) {
  const cfg = U.loadConfig();
  const mode = ['seguro', 'moderado', 'avanzado'].includes(o.mode) ? o.mode : 'seguro';
  const name = String(o.name || '').slice(0, 200);
  const guids = new Set();
  for (const g of [o.originalKey, o.uninstall].filter(Boolean)) for (const m of String(g).matchAll(/\{[0-9A-Fa-f-]{36}\}/g)) guids.add(m[0].toLowerCase());
  const so = { name, publisher: o.publisher, mode, installDir: o.installDir && U.pathIsSafe(o.installDir) ? o.installDir : '', originalKey: o.originalKey, guids: mode === 'avanzado' ? [...guids] : [], forced: !!o.forced };
  const match = buildMatcher(so);
  const searchable = baseName(name).length >= 4 || so.installDir;
  const registro = searchable ? await scanRegistry(so, match, cfg) : [];
  const archivos = searchable ? scanFiles(so, match, cfg) : [];
  const aviso = baseName(name).length < 4 ? 'El nombre tiene menos de 4 caracteres: solo se busca la carpeta de instalación.' : '';
  return { registro, archivos, aviso };
}

module.exports = { listPrograms, getProgram, startUninstall, waitUninstall, skipWait, startModify, scan, buildMatcher, baseName, buildCommand };
