// Utilidades comunes: ejecución segura de procesos, rutas de datos, validaciones y lista de bloqueo.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Barredor');
const BACKUPS = path.join(DATA, 'copias');
const CONFIG_FILE = path.join(DATA, 'config.json');
fs.mkdirSync(BACKUPS, { recursive: true });

function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 256 * 1024 * 1024, timeout: opts.timeout || 120000, encoding: 'utf8' },
      (err, stdout, stderr) => resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: stdout || '', err: stderr || (err ? err.message : '') }));
  });
}

// PowerShell: el script es fijo; los datos variables viajan por variables de entorno (nunca concatenados).
function ps(script, env = {}, opts = {}) {
  const prefix = '$ErrorActionPreference="Stop";[Console]::OutputEncoding=[Text.Encoding]::UTF8;';
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', prefix + script],
      { windowsHide: true, maxBuffer: 256 * 1024 * 1024, timeout: opts.timeout || 120000, encoding: 'utf8', env: { ...process.env, ...env } },
      (err, stdout, stderr) => resolve({ ok: !err, out: stdout || '', err: stderr || (err ? err.message : '') }));
  });
}
async function psJson(script, env, opts) {
  const r = await ps(script, env, opts);
  if (!r.ok || !r.out.trim()) return [];
  try { const v = JSON.parse(r.out); return Array.isArray(v) ? v : [v]; } catch { return []; }
}

function defaultConfig() {
  return {
    comentarios: {}, grupos: { Internet: [], Juegos: [], Multimedia: [], Utilidades: [] }, inicioDesactivado: {},
    exclusionRegistro: [], exclusionBasura: [], ultimaCopiaDiaria: '', avisoVisto: false,
    opciones: {
      puntoRestauracion: true, copiaRegistro: true, copiaDiaria: true, papelera: true, diasNuevos: 7,
      mostrarActualizaciones: false, mostrarSistema: false, tema: 'claro', barraMenu: true, barraEstado: true,
      panelDetalles: true, textoIconos: true, tamanoIconos: 48
    }
  };
}
function loadConfig() {
  const def = defaultConfig();
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...def, ...c, opciones: { ...def.opciones, ...(c.opciones || {}) } };
  } catch { return def; }
}
function saveConfig(c) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); return true; }

// ---------- Lista de bloqueo (se aplica en el proceso principal) ----------
const trimSep = (s) => String(s || '').replace(/[\\/]+$/, '');
const norm = (p) => trimSep(path.resolve(String(p))).toLowerCase();
const env = (k) => trimSep(process.env[k]);
function blockedPaths() {
  const drive = (process.env.SystemDrive || 'C:').toLowerCase();
  const up = env('USERPROFILE');
  return new Set([drive, drive + '\\windows', env('SystemRoot'), path.join(env('SystemRoot'), 'System32'), path.join(env('SystemRoot'), 'SysWOW64'),
    env('ProgramFiles'), env('ProgramFiles(x86)'), env('ProgramW6432'), env('ProgramData'), path.dirname(up), up,
    env('APPDATA'), env('LOCALAPPDATA'), path.join(up, 'Desktop'), path.join(up, 'Documents'), path.join(up, 'Downloads'), DATA, BACKUPS]
    .filter(Boolean).map(norm));
}
const SHARED_NAMES = new Set(['microsoft', 'microsoft shared', 'msbuild', 'windows', 'windows nt', 'windowsapps', 'common files', 'windows kits', 'reference assemblies', 'dotnet', 'microsoft.net', 'packages', 'installer', 'package cache', 'programs', 'users', 'program files', 'program files (x86)', 'programdata', 'appdata', 'roaming', 'local', 'locallow', 'google', 'adobe', 'intel', 'nvidia', 'amd', 'apple', 'oracle', 'java']);
function pathIsSafe(p) {
  if (!p || typeof p !== 'string' || p.includes('\0') || !path.isAbsolute(p)) return false;
  const n = norm(p);
  if (/^[a-z]:$/.test(n)) return false;
  if (blockedPaths().has(n)) return false;
  if (SHARED_NAMES.has(path.basename(n))) return false; // carpetas compartidas de fabricante/sistema
  const sys = norm(env('SystemRoot'));
  if (sys && (n === sys || n.startsWith(sys + '\\'))) return n.startsWith(sys + '\\temp\\') || n.startsWith(sys + '\\minidump\\') || n === sys + '\\memory.dmp'; // solo Temp y volcados
  const bk = norm(DATA);
  if (n === bk || n.startsWith(bk + '\\')) return false; // las copias se gestionan solo desde el Gestor de copias
  return true;
}
function regKeyIsSafe(k) {
  if (typeof k !== 'string' || k.includes('\0') || /[\r\n"]/.test(k)) return false;
  const m = k.replace(/^HKEY_CURRENT_USER/i, 'HKCU').replace(/^HKEY_LOCAL_MACHINE/i, 'HKLM').match(/^(HKCU|HKLM)\\(.+)$/i);
  if (!m) return false;
  const parts = m[2].replace(/\\+$/, '').split('\\').map((s) => s.toLowerCase());
  if (parts[0] !== 'software') return false; // nunca SYSTEM ni otras ramas
  let r = parts.slice(1);
  if (r[0] === 'wow6432node') r = r.slice(1);
  if (r[0] === 'classes') { r = r.slice(1); if (r[0] === 'clsid' && r.length < 2) return false; }
  if (r.length < 1) return false;
  if (r[0] === 'microsoft') {
    if (r.length < 2) return false;
    if (['windows', 'windows nt', 'cryptography', 'internet explorer', 'office'].includes(r[1]) && r.length < 5) return false;
  }
  return true;
}
function normKey(k) { return k.replace(/^HKEY_CURRENT_USER/i, 'HKCU').replace(/^HKEY_LOCAL_MACHINE/i, 'HKLM'); }
function excludedKey(k, cfg) {
  const kk = normKey(k).toLowerCase();
  return (cfg.exclusionRegistro || []).some((x) => kk === normKey(x).toLowerCase() || kk.startsWith(normKey(x).toLowerCase() + '\\'));
}

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const safeName = (s) => String(s).replace(/[^\w\-. ]+/g, '_').slice(0, 60);

// ---------- Registro ----------
async function regExport(key, label) {
  const dest = path.join(BACKUPS, `reg_${stamp()}_${safeName(label || key.split('\\').pop())}_${Math.random().toString(36).slice(2, 6)}.reg`);
  const r = await run('reg.exe', ['export', key, dest, '/y']);
  return r.ok ? dest : null;
}
async function regDelete(key, value) {
  if (!regKeyIsSafe(key)) return { ok: false, err: 'Clave bloqueada por seguridad' };
  const args = value ? ['delete', key, '/v', String(value), '/f'] : ['delete', key, '/f'];
  const r = await run('reg.exe', args);
  return { ok: r.ok, err: r.err.trim() };
}

// ---------- Papelera / borrado ----------
const PS_TRASH = `Add-Type -AssemblyName Microsoft.VisualBasic;
$p=$env:BARREDOR_PATH;
if(Test-Path -LiteralPath $p -PathType Container){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')}
elseif(Test-Path -LiteralPath $p){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin')}
Write-Output ok`;
async function removePath(p, toTrash = true) {
  if (!pathIsSafe(p)) return { ok: false, err: 'Ruta bloqueada por seguridad' };
  if (!fs.existsSync(p)) return { ok: true };
  if (toTrash) {
    try { await require('electron').shell.trashItem(p); return { ok: !fs.existsSync(p) }; } catch (e) { return { ok: false, err: e.message }; }
  }
  try { fs.rmSync(p, { recursive: true, force: true }); return { ok: !fs.existsSync(p) }; } catch (e) { return { ok: false, err: e.message }; }
}

function dirSize(p, depth = 0) {
  let t = 0;
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) return 0;
    if (!st.isDirectory()) return st.size;
    if (depth > 12) return 0;
    for (const e of fs.readdirSync(p)) t += dirSize(path.join(p, e), depth + 1);
  } catch { /* sin acceso */ }
  return t;
}
function isElevated() {
  try { require('child_process').execFileSync('net.exe', ['session'], { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; }
}

module.exports = { DATA, BACKUPS, run, ps, psJson, loadConfig, saveConfig, defaultConfig, pathIsSafe, regKeyIsSafe, normKey, excludedKey, stamp, safeName, regExport, regDelete, removePath, dirSize, isElevated };
