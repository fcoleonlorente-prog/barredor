// Modo cazador: elegir un ejecutable o acceso directo y actuar sobre su programa.
const api = window.barredor;
const inv = (c, ...a) => api.invoke(c, ...a);
const res = document.getElementById('res');
const zona = document.getElementById('zona');

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  e.append(...kids.filter((x) => x != null));
  return e;
}
async function resolver(file) {
  res.replaceChildren(el('p', { class: 'mute' }, 'Buscando…'));
  const r = await inv('hunter:resolve', file);
  if (!r || r.ok === false || !r.exe) { res.replaceChildren(el('p', { class: 'bad' }, 'No se pudo leer ese archivo.')); return; }
  const btn = (t, f, cls = '') => el('button', { class: 'btn ' + cls, style: 'margin:3px', onclick: f }, t);
  res.replaceChildren(
    el('p', {}, el('b', {}, r.programa ? r.programa.nombre : 'Programa no registrado'), el('br'), el('span', { class: 'mute' }, r.exe)),
    el('p', { class: r.enEjecucion ? 'warn' : 'mute' }, r.enEjecucion ? 'En ejecución' : 'No está en ejecución'),
    r.programa ? btn('Desinstalar', () => inv('hunter:uninstall', r.programa.clave), 'pri') : el('p', { class: 'mute' }, 'No se encontró en la lista de programas: usa la desinstalación forzada.'),
    r.enEjecucion ? btn('Detener proceso', async () => { const k = await inv('hunter:kill', r.exe); if (k.ok) resolver(file); }, 'peligro') : null,
    r.inicio.length ? btn('Quitar del inicio automático', async () => { const k = await inv('hunter:unstart', r.inicio.map((i) => i.id)); if (k.ok) resolver(file); }) : null,
    btn('Abrir carpeta', () => inv('hunter:folder', r.exe)));
}
zona.addEventListener('click', async () => { const [f] = await inv('dlg:pick', 'exe'); if (f) resolver(f); });
zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('over'); });
zona.addEventListener('dragleave', () => zona.classList.remove('over'));
zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) resolver(api.rutaDe(f)); });
document.getElementById('procs').addEventListener('click', async () => {
  const l = await inv('hunter:procs');
  res.replaceChildren(el('p', { class: 'mute' }, 'Procesos con ventana:'), ...(Array.isArray(l) ? l : []).map((p) => el('div', { class: 'leaf' }, el('button', { class: 'btn', onclick: () => resolver(p.ruta) }, 'Elegir'), ` ${p.nombre} — ${p.titulo}`)));
});
