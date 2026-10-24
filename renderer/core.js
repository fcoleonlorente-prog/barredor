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
const chip = (nombre) => h('div', { class: 'chip', style: `background:hsl(${hue(nombre)} 45% 38%)` }, (nombre.trim()[0] || '?').toUpperCase());
const saveCfg = async (patch) => { B.cfg = await inv('cfg:set', patch); return B.cfg; };

function toast(msg) {
  const t = h('div', { class: 'toast', text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}
function setStatus(txt, right) { $('#status-text').textContent = txt; if (right != null) $('#status-right').textContent = right; }

// ---------- Modales ----------
function modal({ titulo, cuerpo, botones = [], chico = false }) {
  const ov = $('#overlay');
  const cerrar = () => { ov.classList.remove('on'); ov.replaceChildren(); };
  const foot = h('footer', {}, botones.map((b) => h('button', { class: 'btn ' + (b.pri ? 'pri' : '') + (b.peligro ? ' peligro' : ''), id: b.id, onclick: async () => { const r = b.onClick ? await b.onClick(api2) : undefined; if (r !== false && b.cierra !== false) cerrar(); } }, b.label)));
  const body = h('div', { class: 'cuerpo' }, cuerpo);
  const api2 = { cerrar, body, foot, titulo: h('header', {}, titulo) };
  ov.replaceChildren(h('div', { class: 'modal' + (chico ? ' chico' : '') }, api2.titulo, body, foot));
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
function showDetails(pairs) {
  const d = $('#details');
  if (!pairs) { d.className = 'vacio'; d.textContent = 'Selecciona un elemento para ver sus propiedades.'; return; }
  d.className = '';
  d.replaceChildren(...pairs.filter((p) => p[1]).map(([k, v]) => h('div', {}, h('span', { class: 'k', text: k + ': ' }), String(v))));
}

// ---------- Herramientas y pestañas ----------
const TOOL_LIST = [
  ['uninstaller', '🧹', 'Desinstalador'], ['startup', '🚀', 'Inicio'], ['junk', '🗑️', 'Basura'], ['browsers', '🌐', 'Navegadores'], ['office', '📄', 'Office'],
  ['windows', '🪟', 'Windows'], ['shred', '🔥', 'Borrado seguro'], ['evidence', '🕵️', 'Evidencias'], ['backups', '💾', 'Copias'], ['wintools', '🛠️', 'Herram. Windows'], ['options', '⚙️', 'Opciones']
];
function renderSide() {
  $('#side').replaceChildren(...TOOL_LIST.map(([id, ic, nombre]) => h('button', { class: 'tool' + (B.activo === id ? ' act' : ''), title: nombre, onclick: () => openTool(id) }, h('span', { class: 'ic', text: ic }), B.cfg.opciones.textoIconos ? nombre : null)));
}
function renderTabs() {
  $('#tabs').replaceChildren(...[...B.tabs.values()].map((t) => h('div', { class: 'tab' + (B.activo === t.id ? ' act' : ''), onclick: () => openTool(t.id) }, t.def.titulo, h('span', { class: 'x', title: 'Cerrar', onclick: (e) => { e.stopPropagation(); closeTool(t.id); } }, '✕'))));
}
function renderCmd() {
  const t = B.tabs.get(B.activo);
  const cmds = t && t.def.comandos ? t.def.comandos() : [];
  $('#cmdbar').replaceChildren(...cmds.map((c) => h('button', { class: 'btn' + (c.pri ? ' pri' : '') + (c.peligro ? ' peligro' : ''), title: c.atajo || '', disabled: c.disabled, onclick: c.onClick }, c.label)));
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
}
