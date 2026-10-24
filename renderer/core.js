// Núcleo de la interfaz: ayudas de DOM, ventanas modales, menú contextual, pestañas y panel de detalles.
const api = window.barredor;
const inv = (ch, ...a) => api.invoke(ch, ...a);
const $ = (s, r = document) => r.querySelector(s);
const B = { cfg: null, tools: {}, tabs: new Map(), activo: null, info: {} };

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const fmtSize = (n) => (n == null ? '—' : n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hue = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const chip = (nombre) => h('div', { class: 'chip', style: `background:hsl(${hue(nombre)} 45% 42%)` }, (nombre.trim()[0] || '?').toUpperCase());

// ---------- Iconos SVG propios (trazo, 24x24) ----------
const ICONS = {
  uninstaller: 'M4 4h16v5H4zM6 9v11h12V9M9.5 13l5 5M14.5 13l-5 5', startup: 'M12 3a9 9 0 100 18 9 9 0 000-18zM10 8.5l6 3.5-6 3.5z', junk: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  browsers: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', office: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6', windows: 'M4 5l7-1v7H4zM13 4l7-1v8h-7zM4 13h7v7l-7-1zM13 13h7v8l-7-1z',
  shred: 'M12 3c1 4 5 6 5 11a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z', evidence: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L21 21M8 10.5h5', backups: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7',
  wintools: 'M15 5a4 4 0 00-4 5L4 17a2 2 0 003 3l7-7a4 4 0 005-4l-3 3-3-1-1-3z', options: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6',
  refresh: 'M20 5v5h-5M4 19v-5h5M5.5 9A7 7 0 0118 7l2 3M18.5 15A7 7 0 016 17l-2-3', bolt: 'M13 3L5 14h6l-1 7 8-11h-6z', force: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM9.5 9.5l5 5M14.5 9.5l-5 5',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.5v1', plus: 'M12 5v14M5 12h14', folder: 'M3 6h6l2 2h10v11H3z', x: 'M6 6l12 12M18 6L6 18', stop: 'M6 6h12v12H6z',
  restore: 'M4 12a8 8 0 108-8M4 4v5h5M12 8v5l3 2', check: 'M5 12l5 5 9-10', repair: 'M15 5a4 4 0 00-4 5L4 17a2 2 0 003 3l7-7a4 4 0 005-4l-3 3-3-1-1-3z', app: 'M4 5h16v14H4zM4 9h16', search: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L21 21'
};
const ico = (n, size = 24) => { const s = h('span', { class: 'ico' }); s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[n] || ICONS.app}"/></svg>`; return s; };
// Icono de un comando de la barra según su texto
const iconoCmd = (l) => /Desinstalaci.n r/i.test(l) ? 'bolt' : /forzada/i.test(l) ? 'force' : /Desinstalar/i.test(l) ? 'uninstaller' : /Cambiar|Reparar/i.test(l) ? 'repair' : /Actualizar/i.test(l) ? 'refresh' : /cazador/i.test(l) ? 'target' : /Ejecutar|Empezar/i.test(l) ? 'startup' : /Finalizar|Cancelar/i.test(l) ? 'stop' : /Abrir carpeta/i.test(l) ? 'folder' : /A.adir|Crear/i.test(l) ? 'plus' : /Escanear/i.test(l) ? 'search' : /Restaurar/i.test(l) ? 'restore' : /Borrar|Eliminar|Quitar|Limpiar/i.test(l) ? 'junk' : /Guardar/i.test(l) ? 'backups' : 'check';

// Icono real del programa (lo da el proceso principal con app.getFileIcon); si no hay, cuadrado con inicial.
B.iconos = new Map(); B.iconP = new Map(); const _icCola = []; let _icAct = 0;
function _icSig() {
  while (_icAct < 4 && _icCola.length) {
    _icAct++; const [k, res] = _icCola.shift();
    inv('prog:icon', k).then((u) => B.iconos.set(k, typeof u === 'string' ? u : null), () => B.iconos.set(k, null)).then(() => { _icAct--; res(B.iconos.get(k)); _icSig(); });
  }
}
const cargarIcono = (k) => { if (!B.iconP.has(k)) B.iconP.set(k, new Promise((res) => { _icCola.push([k, res]); _icSig(); })); return B.iconP.get(k); };
function iconoProg(p, size = 40) {
  const caja = h('div', { class: 'pico', style: `width:${size}px;height:${size}px` });
  const pon = (u) => { if (u) caja.replaceChildren(h('img', { src: u, width: size, height: size, alt: '' })); else { const c = chip(p.nombre); c.style.fontSize = Math.round(size * 0.5) + 'px'; caja.replaceChildren(c); } };
  if (B.iconos.has(p.clave)) pon(B.iconos.get(p.clave)); else { pon(null); cargarIcono(p.clave).then(pon); }
  return caja;
}
const saveCfg = async (patch) => { B.cfg = await inv('cfg:set', patch); return B.cfg; };

function toast(msg) {
  const t = h('div', { class: 'toast', text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}
function setStatus(txt, right) { $('#status-text').textContent = txt; if (right != null) $('#status-right').textContent = right; }

// ---------- Modales ----------
function modal({ titulo, cuerpo, botones = [], chico = false, pasos = null }) {
  const ov = $('#overlay');
  const cerrar = () => { ov.classList.remove('on'); ov.replaceChildren(); };
  const foot = h('footer', {}, botones.map((b) => h('button', { class: 'btn ' + (b.pri ? 'pri' : '') + (b.peligro ? ' peligro' : ''), id: b.id, onclick: async () => { const r = b.onClick ? await b.onClick(api2) : undefined; if (r !== false && b.cierra !== false) cerrar(); } }, b.label)));
  const body = h('div', { class: 'cuerpo' }, cuerpo);
  const barra = pasos ? h('div', { class: 'steps' }) : null;
  const paso = (i) => { if (barra) barra.replaceChildren(...pasos.map((t, j) => h('span', { class: 'step' + (j < i ? ' hecho' : j === i ? ' act' : '') }, h('i', { text: j < i ? '✓' : String(j + 1) }), t))); };
  const api2 = { cerrar, body, foot, titulo: h('header', {}, titulo), paso };
  paso(0);
  ov.replaceChildren(h('div', { class: 'modal' + (chico ? ' chico' : '') }, api2.titulo, barra, body, foot));
  ov.classList.add('on');
  return api2;
}
const aviso = (titulo, texto) => new Promise((res) => modal({ titulo, chico: true, cuerpo: h('p', { text: texto }), botones: [{ label: 'Entendido', pri: true, onClick: () => res() }] }));

// ---------- Menú contextual ----------
function ctxMenu(ev, items) {
  ev.preventDefault();
  const m = $('#ctx');
  m.replaceChildren(...items.map((i) => (i === '-' ? h('hr') : h('div', { onclick: () => { m.classList.add('hidden'); i.onClick(); } }, i.label))));
  m.classList.remove('hidden');
  m.style.left = Math.min(ev.clientX, innerWidth - 230) + 'px';
  m.style.top = Math.min(ev.clientY, innerHeight - items.length * 30 - 10) + 'px';
}
document.addEventListener('click', () => $('#ctx').classList.add('hidden'));

// ---------- Panel de detalles ----------
function showDetails(pairs, icon) {
  const d = $('#details');
  d.classList.toggle('vacio', !pairs);
  if (!pairs) { d.textContent = 'Selecciona un elemento para ver sus propiedades.'; return; }
  d.replaceChildren(icon ? h('div', { class: 'dicon' }, icon) : null, h('div', { class: 'dgrid' }, pairs.filter((p) => p[1]).map(([k, v]) => h('div', {}, h('span', { class: 'k', text: k }), h('span', { class: 'v', title: String(v), text: String(v) })))));
}

// ---------- Herramientas y pestañas ----------
const TOOL_LIST = [
  ['uninstaller', 'uninstaller', 'Desinstalador'], ['startup', 'startup', 'Inicio'], ['junk', 'junk', 'Basura'], ['browsers', 'browsers', 'Navegadores'], ['office', 'office', 'Office'],
  ['windows', 'windows', 'Windows'], ['shred', 'shred', 'Borrado seguro'], ['evidence', 'evidence', 'Evidencias'], ['backups', 'backups', 'Copias'], ['wintools', 'wintools', 'Herram. Windows'], ['options', 'options', 'Opciones']
];
function renderSide() {
  $('#side').replaceChildren(...TOOL_LIST.map(([id, ic, nombre]) => h('button', { class: 'tool' + (B.activo === id ? ' act' : ''), title: nombre, onclick: () => openTool(id) }, h('span', { class: 'ic' }, ico(ic, 32)), B.cfg.opciones.textoIconos ? h('span', { class: 'lb', text: nombre }) : null)));
}
function renderTabs() {
  $('#tabs').replaceChildren(...[...B.tabs.values()].map((t) => h('div', { class: 'tab' + (B.activo === t.id ? ' act' : ''), onclick: () => openTool(t.id) }, ico(t.id, 16), t.def.titulo, h('span', { class: 'x', title: 'Cerrar', onclick: (e) => { e.stopPropagation(); closeTool(t.id); } }, '✕'))));
}
function renderCmd() {
  const t = B.tabs.get(B.activo);
  const cmds = t && t.def.comandos ? t.def.comandos() : [];
  $('#cmdbar').replaceChildren(...cmds.map((c) => (c === '-' ? h('span', { class: 'sep' }) : h('button', { class: 'cmd' + (c.pri ? ' pri' : '') + (c.peligro ? ' peligro' : ''), title: c.label + (c.atajo ? ' (' + c.atajo + ')' : ''), disabled: c.disabled, onclick: c.onClick }, ico(c.icono || iconoCmd(c.label), 28), h('span', { class: 'lb', text: c.label })))));
}
function openTool(id) {
  if (!B.tools[id]) return;
  if (!B.tabs.has(id)) {
    const panel = h('div', { class: 'panel' });
    $('#content').append(panel);
    const def = B.tools[id](panel);
    B.tabs.set(id, { id, panel, def });
  }
  B.activo = id;
  for (const t of B.tabs.values()) t.panel.classList.toggle('hidden', t.id !== id);
  renderSide(); renderTabs(); renderCmd();
  const t = B.tabs.get(id);
  showDetails(null);
  setStatus(t.def.titulo, '');
  if (t.def.alMostrar) t.def.alMostrar();
}
function closeTool(id) {
  const t = B.tabs.get(id); if (!t) return;
  t.panel.remove(); B.tabs.delete(id);
  if (B.activo === id) { const first = [...B.tabs.keys()][0]; B.activo = null; if (first) openTool(first); else { renderSide(); renderTabs(); renderCmd(); } } else renderTabs();
}
const refreshCmd = () => renderCmd();

function applyView() {
  const o = B.cfg.opciones;
  document.documentElement.dataset.tema = o.tema === 'claro' ? 'claro' : 'oscuro';
  $('#status').classList.toggle('hidden', !o.barraEstado);
  $('#details').classList.toggle('hidden', !o.panelDetalles);
  renderSide();
  $('#titlebar').classList.toggle('sin-menu', o.barraMenu === false);
  if (typeof menuPintar === 'function') menuPintar();
}
