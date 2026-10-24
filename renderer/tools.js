// Resto de herramientas: inicio, limpiadores, borrado seguro, evidencias, copias, herramientas de Windows y opciones.
const resumenTxt = (r) => (r.cancelado ? 'Cancelado.' : r.ok === false ? 'Error: ' + r.err : `Hecho. Liberado: ${fmtSize(r.liberado || 0)}${r.fallos ? ` · omitidos/en uso: ${typeof r.fallos === 'number' ? r.fallos : r.fallos.length}` : ''}`);

// Estructura común: cabecera con icono y descripción, zona de resumen y cuerpo con desplazamiento.
function shell(panel, ic, titulo, desc) {
  panel.classList.add('split');
  const stats = h('div', { class: 'th-stats' }), body = h('div', { class: 'scroll', style: 'padding-top:14px' });
  panel.append(h('div', { class: 'th' }, h('div', { class: 'th-ic' }, ico(ic, 26)), h('div', { class: 'th-tx' }, h('h2', { text: titulo }), h('p', { text: desc })), stats), body);
  return { body, stats };
}
const stat = (label, valor, cls) => h('div', { class: 'stat ' + (cls || '') }, h('b', { text: String(valor) }), h('span', { text: label }));
const vacio = (ic, t, d) => h('div', { class: 'vacio-est' }, ico(ic, 40), h('b', { text: t }), d ? h('p', { text: d }) : null);
const cargando = (t) => h('div', { class: 'vacio-est' }, h('div', { class: 'prog ind' }, h('i')), h('p', { text: t }));
const thead = (cols) => h('thead', {}, h('tr', {}, cols.map((t) => h('th', { text: t }))));
// Fila con casilla, nombre y valor (tamaño) en columna alineada
function filaCheck(label, valor, checked, onchange) {
  const cb = h('input', { type: 'checkbox', checked, onchange });
  return { cb, el: h('label', { class: 'lrow' }, cb, h('span', { class: 'nm', title: label, text: label }), h('span', { class: 'sz', text: valor })) };
}

// ---------- Gestor de inicio ----------
B.tools.startup = (panel) => {
  let lista = [], sel = null;
  const { body, stats } = shell(panel, 'startup', 'Gestor de inicio', 'Programas que arrancan con Windows. Desactiva los que no necesites para iniciar más rápido.');
  const run = async (ch, ok) => { if (!sel) return toast('Selecciona una entrada.'); const r = await inv(ch, sel.id); if (r.cancelado) return; r.ok === false ? toast(r.err || 'No se pudo.') : toast(ok); await cargar(); };
  async function cargar() {
    body.replaceChildren(cargando('Leyendo entradas de inicio…'));
    lista = await inv('start:list'); sel = null; pintar(); refreshCmd();
  }
  function pintar() {
    setStatus(`${lista.length} entradas de inicio`);
    const act = lista.filter((e) => e.estado === 'Activo').length;
    stats.replaceChildren(stat('Entradas', lista.length), stat('Activas', act, 'ok'), stat('Desactivadas', lista.length - act));
    if (!lista.length) return body.replaceChildren(vacio('startup', 'No hay programas de inicio', 'Windows no arranca ningún programa extra con tu sesión.'));
    body.replaceChildren(h('table', { class: 'fija' }, thead(['Nombre', 'Comando', 'Ubicación', 'Estado']),
      h('tbody', {}, lista.map((e) => h('tr', { class: 'row' + (sel && sel.id === e.id ? ' sel' : ''), onclick: () => { sel = e; pintar(); showDetails([['Nombre', e.nombre], ['Comando', e.comando], ['Ubicación', e.ubicacion], ['Estado', e.estado]]); refreshCmd(); } },
        h('td', { text: e.nombre }), h('td', { class: 'mono', title: e.comando, text: e.comando }), h('td', { text: e.ubicacion }), h('td', {}, h('span', { class: 'badge ' + (e.estado === 'Activo' ? 'ok' : ''), text: e.estado })))))));
  }
  function anadir() {
    const n = h('input', { type: 'text', placeholder: 'Nombre', style: 'width:100%' }), r = h('input', { type: 'text', placeholder: 'C:\\ruta\\programa.exe', style: 'width:100%' });
    modal({ titulo: 'Añadir al inicio (usuario actual)', chico: true, cuerpo: [n, h('div', { style: 'height:8px' }), r, h('button', { class: 'btn', style: 'margin-top:8px', onclick: async () => { const [f] = await inv('dlg:pick', 'exe'); if (f) r.value = f; } }, 'Examinar…')],
      botones: [{ label: 'Cancelar' }, { label: 'Añadir', pri: true, onClick: async () => { const x = await inv('start:add', n.value, r.value); if (x.ok === false) { toast(x.err); return false; } toast('Entrada añadida.'); cargar(); } }] });
  }
  return { titulo: 'Gestor de inicio', alMostrar: cargar,
    comandos: () => [{ label: 'Ejecutar', disabled: !sel, onClick: () => run('start:run', 'Ejecutada.') }, { label: 'Finalizar proceso', disabled: !sel, onClick: () => run('start:kill', 'Proceso finalizado.') }, { label: 'Añadir', onClick: anadir },
      { label: 'Quitar', peligro: true, disabled: !sel || sel.estado !== 'Activo', onClick: () => run('start:remove', 'Entrada quitada (copia guardada).') }, { label: sel && sel.estado === 'Desactivado' ? 'Activar' : 'Desactivar', disabled: !sel, onClick: () => run('start:toggle', 'Hecho.') },
      { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Limpiador de basura ----------
B.tools.junk = (panel) => {
  const { body, stats } = shell(panel, 'junk', 'Limpiador de archivos basura', 'Busca temporales, cachés y restos inútiles. Los archivos en uso se ignoran; las exclusiones se editan en Opciones.');
  let cats = [], ents = [], liberado = null;
  const MAX = 300;
  const seleccionado = () => { let s = 0; for (const e of ents) if (e.cb.checked) s += e.size; for (const c of cats) if (c.__cab.checked) s += c.total - c.__vis; return s; };
  function resumen() {
    const tot = cats.reduce((s, c) => s + c.total, 0), n = cats.reduce((s, c) => s + c.cantidad, 0);
    stats.replaceChildren(stat('Encontrado', fmtSize(tot)), stat('Seleccionado', fmtSize(seleccionado()), 'acc'), liberado != null ? stat('Liberado', fmtSize(liberado), 'ok') : null);
    setStatus(`${n} archivos · ${fmtSize(tot)}`);
  }
  body.replaceChildren(vacio('junk', 'Listo para escanear', 'Pulsa Escanear para buscar archivos basura en tu equipo.'));
  async function escanear() {
    body.replaceChildren(cargando('Escaneando archivos basura…')); setStatus('Escaneando basura…');
    cats = await inv('junk:scan'); pintar(); refreshCmd();
  }
  function pintar() {
    ents = [];
    const tot = cats.reduce((s, c) => s + c.total, 0);
    if (!cats.length || !tot) { resumen(); return body.replaceChildren(vacio('check', '¡Todo limpio!', 'No se ha encontrado basura que borrar.')); }
    body.replaceChildren(...cats.map((c) => {
      const vis = c.archivos.slice(0, MAX); c.__vis = vis.reduce((s, f) => s + f.size, 0);
      const hijos = vis.map((f) => { const cb = h('input', { type: 'checkbox', checked: true, onchange: resumen }); ents.push({ cb, p: f.path, size: f.size, cat: c }); return h('label', { class: 'lrow' }, cb, h('span', { class: 'nm', title: f.path, text: f.path }), h('span', { class: 'sz', text: fmtSize(f.size) })); });
      const cab = h('input', { type: 'checkbox', checked: true, onchange: (e) => { hijos.forEach((d) => (d.firstChild.checked = e.target.checked)); resumen(); }, onclick: (e) => e.stopPropagation() });
      c.__cab = cab;
      return h('details', { class: 'cat' }, h('summary', {}, cab, h('span', { class: 'cn' }, h('b', { text: c.nombre }), h('span', { text: `${c.cantidad} archivos` })),
        h('div', { class: 'mini', title: Math.round(tot ? (c.total / tot) * 100 : 0) + '% del total' }, h('i', { style: `width:${tot ? Math.max(2, Math.round((c.total / tot) * 100)) : 0}%` })), h('span', { class: 'sz', text: fmtSize(c.total) })),
        hijos, c.archivos.length > MAX ? h('div', { class: 'mas', text: `…y ${c.archivos.length - MAX} más (se incluyen si la categoría está marcada)` }) : null);
    }));
    resumen();
  }
  async function borrar() {
    const paths = ents.filter((e) => e.cb.checked).map((e) => e.p);
    for (const c of cats) if (c.__cab && c.__cab.checked) for (const f of c.archivos.slice(MAX)) paths.push(f.path);
    if (!paths.length) return toast('No hay nada marcado.');
    const r = await inv('junk:clean', paths); if (r.cancelado) return;
    liberado = r.liberado || 0;
    toast(resumenTxt({ ...r, fallos: r.fallos })); escanear();
  }
  return { titulo: 'Limpiador de archivos basura', comandos: () => [{ label: 'Escanear', pri: true, onClick: escanear }, { label: 'Borrar', peligro: true, disabled: !cats.length, onClick: borrar }] };
};

// ---------- Limpiador de navegadores ----------
B.tools.browsers = (panel) => {
  const { body, stats } = shell(panel, 'browsers', 'Limpiador de navegadores', 'Borra caché, cookies e historial. El historial de descargas va unido al historial. De Firefox solo se limpian caché y cookies.');
  let data = [], cbs = {}, liberado = null;
  const TIPOS = [['cache', 'Caché'], ['cookies', 'Cookies'], ['historial', 'Historial'], ['descargas', 'Historial de descargas']];
  const seleccionado = () => { let s = 0; for (const b of data) for (const [t, c] of Object.entries(cbs[b.id] || {})) if (c.checked && t !== 'descargas' && b.tipos[t] && b.tipos[t].disponible) s += b.tipos[t].tamano || 0; return s; };
  function resumen() { stats.replaceChildren(stat('Navegadores', data.length), stat('Seleccionado', fmtSize(seleccionado()), 'acc'), liberado != null ? stat('Liberado', fmtSize(liberado), 'ok') : null); }
  async function cargar() {
    body.replaceChildren(cargando('Buscando navegadores…'));
    data = await inv('brow:scan'); cbs = {};
    if (!data.length) { resumen(); body.replaceChildren(vacio('browsers', 'No hay navegadores compatibles', 'No se ha encontrado ningún navegador compatible.')); return setStatus('0 navegadores'); }
    body.replaceChildren(h('div', { class: 'cards' }, data.map((b) => h('div', { class: 'ncard' },
      h('div', { class: 'nhead' }, chip(b.nombre), h('b', { text: b.nombre }), h('span', { class: 'badge ' + (b.abierto ? 'warn' : 'ok'), text: b.abierto ? 'Abierto' : 'Cerrado' })),
      b.abierto ? h('div', { class: 'aviso-ab', text: 'Está abierto: ciérralo antes de limpiar o algunos datos no se borrarán.' }) : null,
      TIPOS.map(([t, n]) => {
        const info = b.tipos[t]; const cb = h('input', { type: 'checkbox', disabled: !info || (!info.disponible && t !== 'descargas'), checked: false });
        if (t === 'descargas') cb.disabled = !b.tipos.historial || !b.tipos.historial.disponible;
        (cbs[b.id] = cbs[b.id] || {})[t] = cb;
        cb.addEventListener('change', () => { if (t === 'historial' || t === 'descargas') { const o = cbs[b.id][t === 'historial' ? 'descargas' : 'historial']; if (!o.disabled) o.checked = cb.checked; } resumen(); });
        return h('label', { class: 'lrow' }, cb, h('span', { class: 'nm', text: n }), h('span', { class: 'sz', text: t === 'descargas' ? '' : info && info.disponible ? fmtSize(info.tamano) : '—' }));
      })))));
    resumen(); setStatus(`${data.length} navegadores`);
  }
  async function limpiar() {
    const sel = {}; for (const [id, o] of Object.entries(cbs)) { const t = Object.entries(o).filter(([, c]) => c.checked).map(([k]) => k); if (t.length) sel[id] = t; }
    if (!Object.keys(sel).length) return toast('Marca qué limpiar.');
    const antes = seleccionado();
    const r = await inv('brow:clean', sel); if (r.cancelado) return;
    liberado = r.liberado != null ? r.liberado : antes;
    toast(resumenTxt(r)); cargar();
  }
  return { titulo: 'Limpiador de navegadores', alMostrar: cargar, comandos: () => [{ label: 'Limpiar', pri: true, onClick: limpiar }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Limpiador de Office ----------
B.tools.office = (panel) => {
  const { body, stats } = shell(panel, 'office', 'Limpiador de Office', 'Borra las listas de documentos recientes (File MRU y Place MRU) y los accesos de la carpeta Recent de Office. Se guarda copia del registro.');
  let rows = [];
  const resumen = () => stats.replaceChildren(stat('Aplicaciones', rows.length), stat('Elementos a borrar', rows.filter((r) => r.cb.checked).reduce((s, r) => s + r.n, 0), 'acc'));
  async function cargar() {
    body.replaceChildren(cargando('Buscando aplicaciones de Office…'));
    const d = await inv('off:scan'); rows = d.map((x) => ({ id: x.id, n: x.elementos || 0, ...filaCheck(x.nombre, `${x.elementos} elementos`, x.elementos > 0, () => resumen()) }));
    resumen(); setStatus('Limpiador de Office');
    body.replaceChildren(rows.length ? h('div', {}, rows.map((r) => r.el)) : vacio('office', 'No se encontró Office', 'No hay listas de documentos recientes que limpiar.'));
  }
  async function limpiar() {
    const apps = rows.filter((r) => r.cb.checked).map((r) => r.id); if (!apps.length) return toast('Marca alguna aplicación.');
    const r = await inv('off:clean', apps); if (r.cancelado) return; toast(`Elementos borrados: ${r.borrados || 0}`); cargar();
  }
  return { titulo: 'Limpiador de Office', alMostrar: cargar, comandos: () => [{ label: 'Limpiar', pri: true, onClick: limpiar }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Limpiador de Windows ----------
B.tools.windows = (panel) => {
  const { body, stats } = shell(panel, 'windows', 'Limpiador de Windows', 'Marca lo que quieras limpiar (temporales, papelera, registros…). Al terminar verás el espacio liberado.');
  let rows = [], liberado = null;
  const resumen = () => stats.replaceChildren(stat('Elementos', rows.length), stat('Seleccionado', fmtSize(rows.filter((r) => r.cb.checked).reduce((s, r) => s + (r.t || 0), 0)), 'acc'), liberado != null ? stat('Liberado', fmtSize(liberado), 'ok') : null);
  async function cargar() {
    body.replaceChildren(cargando('Calculando tamaños…'));
    const d = await inv('win:scan'); rows = d.map((x) => ({ id: x.id, t: x.tamano, ...filaCheck(x.nombre, x.tamano != null ? fmtSize(x.tamano) : '', true, () => resumen()) }));
    resumen(); setStatus('Limpiador de Windows');
    body.replaceChildren(rows.length ? h('div', {}, rows.map((r) => r.el)) : vacio('windows', 'Nada que limpiar', 'No hay elementos de Windows disponibles.'));
  }
  async function limpiar() {
    const ids = rows.filter((r) => r.cb.checked).map((r) => r.id); if (!ids.length) return toast('No hay nada marcado.');
    const r = await inv('win:clean', ids); if (r.cancelado) return;
    liberado = r.liberado || 0;
    await aviso('Limpieza terminada', `Elementos limpiados: ${(r.hechos || []).length}\nEspacio liberado: ${fmtSize(r.liberado || 0)}${r.fallos ? `\nOmitidos o en uso: ${r.fallos}` : ''}`); cargar();
  }
  return { titulo: 'Limpiador de Windows', alMostrar: cargar, comandos: () => [{ label: 'Limpiar', pri: true, onClick: limpiar }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Borrado seguro ----------
B.tools.shred = (panel) => {
  const { body, stats } = shell(panel, 'shred', 'Borrado seguro', 'Sobrescribe el contenido, renombra y elimina. No va a la Papelera y no se puede recuperar.');
  let paths = []; let metodo = 3;
  const lista = h('div'); const txt = h('div', { class: 'mute' }); const barra = h('div', { class: 'prog ind hidden' }, h('i'));
  const zona = h('div', { class: 'zona' }, ico('shred', 30), h('div', { text: 'Arrastra aquí archivos o carpetas' }));
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('over'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('over'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('over'); for (const f of e.dataTransfer.files) { const p = api.rutaDe(f); if (p) paths.push(p); } paths = [...new Set(paths)]; pintar(); refreshCmd(); });
  const sel = h('select', { onchange: (e) => (metodo = Number(e.target.value)) }, [[1, '1 pasada de ceros'], [3, '3 pasadas (aleatorio, ceros, unos)'], [7, '7 pasadas']].map(([v, t]) => h('option', { value: v, selected: v === 3, text: t })));
  body.append(zona, h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { text: 'Método:' }), sel), lista, barra, txt);
  api.on('shred:progreso', (d) => { barra.classList.remove('hidden'); txt.textContent = `Borrados: ${d.hechos} — ${d.actual}`; });
  function pintar() {
    stats.replaceChildren(stat('En la lista', paths.length, paths.length ? 'acc' : ''));
    lista.replaceChildren(paths.length ? h('div', {}, paths.map((p, i) => h('div', { class: 'lrow x' }, h('button', { class: 'btn', title: 'Quitar de la lista', style: 'padding:1px 7px', onclick: () => { paths.splice(i, 1); pintar(); refreshCmd(); } }, '✕'), h('span', { class: 'nm', title: p, text: p }), h('span', { class: 'sz', text: '' })))) : vacio('shred', 'Nada en la lista', 'Añade archivos o carpetas para destruirlos de forma permanente.'));
    setStatus(`${paths.length} elementos`);
  }
  async function anadir(tipo) { const r = await inv('dlg:pick', tipo); paths = [...new Set([...paths, ...r])]; pintar(); refreshCmd(); }
  async function ejecutar() {
    const r = await inv('shred:run', paths, metodo); barra.classList.add('hidden'); if (r.cancelado) return;
    if (r.ok === false) return toast(r.err);
    aviso('Borrado seguro', `Archivos destruidos: ${r.hechos}` + (r.fallos.length ? `\nFallos:\n${r.fallos.map((f) => f.path + ': ' + f.err).join('\n')}` : '')); paths = []; pintar(); refreshCmd(); txt.textContent = '';
  }
  pintar();
  return { titulo: 'Borrado seguro', comandos: () => [{ label: 'Añadir archivos', onClick: () => anadir('files') }, { label: 'Añadir carpeta', onClick: () => anadir('foldersMulti') }, { label: 'Borrar para siempre', peligro: true, disabled: !paths.length, onClick: ejecutar }] };
};

// ---------- Eliminador de evidencias ----------
B.tools.evidence = (panel) => {
  const { body, stats } = shell(panel, 'evidence', 'Eliminador de evidencias', 'Escribe sobre el espacio libre para que lo ya borrado no se pueda recuperar. Deja siempre 200 MB libres y puedes cancelar.');
  const selU = h('select'), selM = h('select', {}, [[1, '1 pasada'], [3, '3 pasadas'], [7, '7 pasadas']].map(([v, t]) => h('option', { value: v, text: t })));
  const barra = h('i'), txt = h('span', { class: 'mute', text: 'En espera' }), pct = h('span', { class: 'mute', text: '0%' });
  let corriendo = false, drives = [];
  const resumen = () => { const d = drives.find((x) => x.unidad === selU.value); stats.replaceChildren(stat('Unidad', selU.value || '—'), stat('Espacio libre', d ? fmtSize(d.libre) : '—', 'acc'), stat('Estado', corriendo ? 'Trabajando' : 'En espera')); };
  selU.addEventListener('change', resumen);
  body.append(h('div', { class: 'panelc' }, h('div', { class: 'bar' }, h('span', { text: 'Unidad:' }), selU, h('span', { text: 'Método:' }), selM), h('div', { class: 'prog' }, barra), h('div', { class: 'pct' }, txt, pct)),
    vacio('evidence', 'Operación lenta y segura', 'Crea un archivo temporal grande, lo llena y lo elimina. Puede tardar y ralentizar el equipo.'));
  api.on('evid:progreso', (d) => { barra.style.width = d.pct + '%'; pct.textContent = d.pct + '%'; txt.textContent = `Pasada ${d.pasada} de ${d.de}`; });
  async function cargar() { drives = await inv('evid:drives'); selU.replaceChildren(...drives.map((x) => h('option', { value: x.unidad, text: `${x.unidad} (${fmtSize(x.libre)} libres)` }))); resumen(); }
  async function empezar() {
    corriendo = true; refreshCmd(); resumen(); txt.textContent = 'Trabajando…';
    const r = await inv('evid:start', selU.value, Number(selM.value));
    corriendo = false; refreshCmd(); barra.style.width = '0'; pct.textContent = '0%';
    txt.textContent = r.cancelado && !r.ok ? 'No iniciado.' : r.ok ? (r.cancelado ? 'Cancelado. Archivo temporal eliminado.' : 'Terminado. Archivo temporal eliminado.') : 'Error: ' + r.err; cargar();
  }
  return { titulo: 'Eliminador de evidencias', alMostrar: cargar, comandos: () => [{ label: 'Empezar', pri: true, disabled: corriendo, onClick: empezar }, { label: 'Cancelar', disabled: !corriendo, onClick: () => inv('evid:cancel') }] };
};

// ---------- Gestor de copias ----------
B.tools.backups = (panel) => {
  const { body, stats } = shell(panel, 'backups', 'Gestor de copias', 'Copias de seguridad del registro y de lo que has borrado. Desde aquí puedes restaurarlas o eliminarlas.');
  let lista = [], sel = null;
  async function cargar() { body.replaceChildren(cargando('Leyendo copias…')); lista = await inv('bk:list'); sel = null; pintar(); refreshCmd(); }
  function pintar() {
    setStatus(`${lista.length} copias`);
    stats.replaceChildren(stat('Copias', lista.length), stat('Espacio usado', fmtSize(lista.reduce((s, b) => s + (b.tamano || 0), 0)), 'acc'));
    if (!lista.length) return body.replaceChildren(vacio('backups', 'Todavía no hay copias', 'Pulsa «Crear copia ahora» para guardar una copia del registro.'));
    body.replaceChildren(h('table', { class: 'fija' }, thead(['Fecha', 'Tipo', 'Nombre', 'Tamaño']),
      h('tbody', {}, lista.map((b) => h('tr', { class: 'row' + (sel && sel.id === b.id ? ' sel' : ''), onclick: () => { sel = b; pintar(); showDetails([['Archivo', b.id], ['Tipo', b.tipo], ['Fecha', b.fecha]]); refreshCmd(); } }, h('td', { text: b.fecha }), h('td', {}, h('span', { class: 'badge', text: b.tipo })), h('td', { text: b.nombre }), h('td', { class: 'num', text: fmtSize(b.tamano) }))))));
  }
  const act = async (ch, ok) => { const r = await inv(ch, sel.id); if (r.cancelado) return; toast(r.ok === false ? 'Error: ' + (r.err || '') : ok); cargar(); };
  return { titulo: 'Gestor de copias', alMostrar: cargar,
    comandos: () => [{ label: 'Restaurar', pri: true, disabled: !sel, onClick: () => act('bk:restore', 'Copia restaurada.') }, { label: 'Eliminar copia', disabled: !sel, onClick: () => act('bk:delete', 'Copia eliminada.') },
      { label: 'Eliminar todas', peligro: true, disabled: !lista.length, onClick: async () => { const r = await inv('bk:deleteAll'); if (!r.cancelado) { toast('Copias eliminadas.'); cargar(); } } }, { label: 'Crear copia ahora', onClick: async () => { toast('Creando copia…'); await inv('bk:create'); cargar(); } },
      { label: 'Abrir carpeta', onClick: () => inv('bk:open') }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Herramientas de Windows ----------
B.tools.wintools = (panel) => {
  const { body, stats } = shell(panel, 'wintools', 'Herramientas de Windows', 'Accesos directos a utilidades del sistema para mantener y reparar tu equipo.');
  async function cargar() {
    const l = await inv('wt:list');
    stats.replaceChildren(stat('Herramientas', l.length));
    body.replaceChildren(l.length ? h('div', { class: 'cards' }, l.map((t) => h('div', { class: 'ncard' }, h('div', { class: 'nhead' }, h('div', { class: 'th-ic', style: 'width:38px;height:38px;border-radius:10px' }, ico('wintools', 20)), h('b', { text: t.nombre })), h('p', { text: t.desc }),
      h('button', { class: 'btn', onclick: async () => { const r = await inv('wt:run', t.id); r.ok ? toast('Abierto: ' + t.nombre) : toast('No disponible: ' + (r.err || '')); } }, 'Ejecutar')))) : vacio('wintools', 'Sin herramientas disponibles'));
    setStatus(`${l.length} herramientas`);
  }
  return { titulo: 'Herramientas de Windows', alMostrar: cargar, comandos: () => [] };
};

// ---------- Debloat de Windows ----------
B.tools.debloat = (panel) => {
  const { body, stats } = shell(panel, 'debloat', 'Debloat de Windows', 'Quita las aplicaciones de relleno y desactiva características que no usas. Todo se puede deshacer y se crea un punto de restauración.');
  let pestana = 'apps', apps = [], feats = [], marcadas = new Set(), perfilBase = false, admin = true, ocupado = false;
  const tabs = h('div', { class: 'tabs-int' }), cuerpo = h('div');
  body.append(tabs, cuerpo);
  const pintaTabs = () => tabs.replaceChildren(...[['apps', 'Aplicaciones preinstaladas'], ['feats', 'Características de Windows']].map(([id, n]) => h('button', { class: pestana === id ? 'act' : '', text: n, onclick: () => { pestana = id; marcadas = new Set(); cargar(); } })));
  const sinAdmin = () => h('div', { class: 'vacio-est' }, ico('debloat', 40), h('b', { text: 'Se necesitan permisos de administrador' }), h('p', { class: 'warn', text: 'Sin ellos Windows no deja listar ni cambiar esto por completo. Reabre Barredor como administrador.' }),
    h('button', { class: 'btn pri', onclick: async () => { const r = await inv('app:elevate'); if (!r.ok) toast('No se pudo elevar: ' + r.err); } }, 'Reabrir como administrador'));
  async function cargar() {
    pintaTabs(); refreshCmd(); showDetails(null);
    if (pestana === 'apps') {
      cuerpo.replaceChildren(cargando('Leyendo las aplicaciones y calculando tamaños… puede tardar hasta un minuto.'));
      const r = await inv('deb:apps'); if (pestana !== 'apps') return;
      if (r.ok === false) { cuerpo.replaceChildren(vacio('debloat', 'No se pudo leer la lista', r.err)); return; }
      apps = r.items; admin = r.admin; pintaApps();
    } else {
      cuerpo.replaceChildren(cargando('Consultando las características de Windows… puede tardar un par de minutos.'));
      const r = await inv('deb:feats'); if (pestana !== 'feats') return;
      admin = r.admin !== false; feats = r.items || [];
      if (r.ok === false) cuerpo.replaceChildren(vacio('debloat', 'No se pudo leer la lista', r.err)); else pintaFeats();
    }
    refreshCmd();
  }
  function pintaApps() {
    const rec = apps.filter((a) => a.recomendada).length;
    stats.replaceChildren(stat('Aplicaciones', apps.length), stat('Recomendadas', rec, 'acc'), stat('Marcadas', marcadas.size, 'ok'));
    setStatus(`${apps.length} aplicaciones preinstaladas`);
    const aviso0 = admin ? null : h('p', { class: 'warn', text: 'No eres administrador: puedes ver la lista, pero para quitar aplicaciones hay que reabrir Barredor como administrador.' });
    const cb2 = h('input', { type: 'checkbox', checked: perfilBase, onchange: (e) => { perfilBase = e.target.checked; } });
    cuerpo.replaceChildren(aviso0, h('label', { style: 'display:block;margin:0 0 8px' }, cb2, ' Quitar también del perfil base para que no vuelvan en usuarios nuevos'),
      apps.length ? h('table', { class: 'fija' }, thead(['', 'Aplicación', 'Editor', 'Versión', 'Tamaño', 'Etiqueta']),
        h('tbody', {}, apps.map((a) => h('tr', { class: 'row', onclick: () => showDetails([['Aplicación', a.nombre], ['Paquete', a.full], ['Editor', a.editor], ['Versión', a.version], ['Aviso', a.aviso]]) },
          h('td', {}, h('input', { type: 'checkbox', checked: marcadas.has(a.full), onclick: (e) => e.stopPropagation(), onchange: (e) => { e.target.checked ? marcadas.add(a.full) : marcadas.delete(a.full); stats.replaceChildren(stat('Aplicaciones', apps.length), stat('Recomendadas', rec, 'acc'), stat('Marcadas', marcadas.size, 'ok')); refreshCmd(); } })),
          h('td', { title: a.name, text: a.nombre }), h('td', { title: a.editor, text: a.editor }), h('td', { text: a.version }), h('td', { text: a.tamano ? fmtSize(a.tamano) : '—' }),
          h('td', {}, a.recomendada ? h('span', { class: 'badge ok', text: 'Recomendado quitar' }) : a.aviso ? h('span', { class: 'badge warn', title: a.aviso, text: 'Muy usada' }) : null))))) : vacio('debloat', 'No hay aplicaciones que mostrar'));
  }
  function marcarRecomendadas() { marcadas = new Set(apps.filter((a) => a.recomendada).map((a) => a.full)); pintaApps(); refreshCmd(); }
  async function resumen(titulo, r) {
    if (r.cancelado) return;
    if (r.ok === false) return aviso(titulo, 'Error: ' + r.err);
    const txt = [`Hecho: ${r.quitados.length}`, ...r.quitados.map((n) => '  • ' + n)];
    if (r.fallos.length) txt.push(`Fallos: ${r.fallos.length}`, ...r.fallos.map((f) => `  • ${f.nombre}: ${f.motivo}`));
    txt.push(...(r.notas || []).filter(Boolean).map((n) => 'Nota: ' + n), r.reinicio ? 'REINICIO NECESARIO para terminar los cambios.' : 'No hace falta reiniciar.');
    await aviso(titulo, txt.join('\n'));
  }
  async function quitar() {
    if (ocupado) return;
    if (!marcadas.size) return toast('No hay nada marcado.');
    ocupado = true; cuerpo.replaceChildren(cargando('Quitando aplicaciones… no cierres Barredor.'));
    const r = await inv('deb:appsRemove', [...marcadas], perfilBase); ocupado = false;
    marcadas = new Set(); await resumen('Resumen: aplicaciones', r); cargar();
  }
  function pintaFeats() {
    stats.replaceChildren(stat('Elementos', feats.length), stat('Activadas', feats.filter((f) => f.activa).length, 'ok'));
    setStatus(`${feats.length} características`);
    if (!admin) return cuerpo.replaceChildren(sinAdmin());
    cuerpo.replaceChildren(feats.length ? h('div', { class: 'cards' }, feats.map((f) => h('div', { class: 'ncard' },
      h('div', { class: 'nhead' }, h('b', { text: f.nombre }), h('span', { class: 'badge ' + (f.activa ? 'ok' : ''), text: f.activa ? 'Activada' : 'Desactivada' }), f.reinicio ? h('span', { class: 'badge warn', text: 'Requiere reinicio' }) : null),
      h('p', { text: f.desc }), h('p', { class: 'mute', text: 'Si la desactivas: ' + f.perdida }), f.aviso ? h('p', { class: 'warn', text: f.aviso }) : null,
      h('button', { class: 'btn' + (f.activa ? ' peligro' : ''), disabled: ocupado, onclick: () => cambiar(f) }, f.activa ? 'Desactivar' : 'Activar')))) : vacio('debloat', 'Nada que mostrar', 'Esta edición de Windows no incluye ninguna de las características de la lista.'));
  }
  async function cambiar(f) {
    if (ocupado) return;
    ocupado = true; cuerpo.replaceChildren(cargando(`${f.activa ? 'Desactivando' : 'Activando'} ${f.nombre}… puede tardar varios minutos.`));
    const r = await inv('deb:featsSet', [f.id], f.activa ? 'desactivar' : 'activar'); ocupado = false;
    await resumen('Resumen: características', r); cargar();
  }
  return { titulo: 'Debloat de Windows', alMostrar: cargar,
    comandos: () => pestana === 'apps' ? [{ label: 'Marcar recomendadas', disabled: !apps.length, onClick: marcarRecomendadas }, { label: 'Quitar', peligro: true, disabled: !marcadas.size || !admin, onClick: quitar }, { label: 'Actualizar', onClick: cargar }] : [{ label: 'Actualizar', onClick: cargar }] };
};

// ---------- Opciones ----------
B.tools.options = (panel) => {
  const { body } = shell(panel, 'options', 'Opciones', 'Ajusta el comportamiento del desinstalador, las exclusiones y la apariencia.');
  const cuerpo = h('div'); let pestana = 'General';
  const nombres = ['General', 'Desinstalador', 'Exclusión de registro', 'Exclusión de basura', 'Grupos', 'Vista'];
  body.append(h('div', { class: 'tabs-int', id: 'opt-tabs' }), cuerpo);
  const o = () => B.cfg.opciones;
  const setO = async (k, v) => { await saveCfg({ opciones: { [k]: v } }); applyView(); };
  const chk = (k, txt, extra) => h('label', {}, h('input', { type: 'checkbox', checked: o()[k], onchange: (e) => setO(k, e.target.checked).then(extra) }), ' ' + txt);
  const listaEdit = (clave, ph, pick) => {
    const l = h('div'); const inp = h('input', { type: 'text', placeholder: ph, style: 'flex:1' });
    const pintar = () => l.replaceChildren(...(B.cfg[clave].length ? B.cfg[clave].map((x, i) => h('div', { class: 'lrow x' }, h('button', { class: 'btn', style: 'padding:1px 7px', onclick: async () => { const n = [...B.cfg[clave]]; n.splice(i, 1); await saveCfg({ [clave]: n }); pintar(); } }, '✕'), h('span', { class: 'nm', title: x, text: x }), h('span', {}))) : [vacio('check', 'Lista vacía', 'No hay ninguna exclusión definida.')]));
    const add = async (v) => { v = v.trim(); if (v) { await saveCfg({ [clave]: [...new Set([...B.cfg[clave], v])] }); inp.value = ''; pintar(); } };
    pintar();
    return h('div', {}, h('div', { class: 'bar' }, inp, h('button', { class: 'btn', onclick: () => add(inp.value) }, 'Añadir'), pick ? h('button', { class: 'btn', onclick: async () => { const [f] = await inv('dlg:pick', 'folder'); if (f) add(f); } }, 'Elegir carpeta…') : null), l);
  };
  function grupos() {
    const l = h('div'); const inp = h('input', { type: 'text', placeholder: 'Nombre del grupo nuevo' });
    const pintar = () => l.replaceChildren(...Object.keys(B.cfg.grupos).map((g) => h('div', { class: 'lrow', style: 'grid-template-columns:minmax(0,1fr) auto auto auto' }, h('span', {}, h('b', { text: g }), h('span', { class: 'mute', text: `  (${B.cfg.grupos[g].length} programas)` })), h('span', {}),
      h('button', { class: 'btn', onclick: () => { const t = h('input', { type: 'text', value: g, style: 'width:100%' }); modal({ titulo: 'Renombrar grupo', chico: true, cuerpo: t, botones: [{ label: 'Cancelar' }, { label: 'Guardar', pri: true, onClick: async () => { const n = t.value.trim(); if (n && n !== g) { const gr = {}; for (const k of Object.keys(B.cfg.grupos)) gr[k === g ? n : k] = B.cfg.grupos[k]; await saveCfg({ grupos: gr }); pintar(); } } }] }); } }, 'Renombrar'),
      h('button', { class: 'btn peligro', onclick: async () => { const gr = { ...B.cfg.grupos }; delete gr[g]; await saveCfg({ grupos: gr }); pintar(); } }, 'Borrar'))));
    pintar();
    return h('div', {}, h('div', { class: 'bar' }, inp, h('button', { class: 'btn', onclick: async () => { const n = inp.value.trim(); if (n && !B.cfg.grupos[n]) { await saveCfg({ grupos: { ...B.cfg.grupos, [n]: [] } }); inp.value = ''; pintar(); } } }, 'Crear grupo')), l);
  }
  function pintar() {
    $('#opt-tabs', panel).replaceChildren(...nombres.map((n) => h('button', { class: n === pestana ? 'act' : '', onclick: () => { pestana = n; pintar(); } }, n)));
    const cont = {
      'General': h('div', { class: 'form' }, h('label', {}, 'Idioma: Español (fijo)'), chk('textoIconos', 'Mostrar texto bajo los iconos de herramientas'), h('label', {}, 'Tamaño de iconos: ', h('input', { type: 'number', min: 24, max: 96, value: o().tamanoIconos, onchange: (e) => setO('tamanoIconos', Number(e.target.value)) }))),
      'Desinstalador': h('div', { class: 'form' }, chk('puntoRestauracion', 'Crear punto de restauración antes de desinstalar'), chk('copiaRegistro', 'Hacer copia completa del registro antes de desinstalar'), chk('copiaDiaria', 'Copia diaria automática del registro'),
        chk('papelera', 'Enviar archivos borrados a la Papelera (si no, borrado directo)'), chk('mostrarActualizaciones', 'Mostrar actualizaciones de Windows', () => B.uninst.cargar && B.uninst.cargar()), chk('mostrarSistema', 'Mostrar componentes del sistema', () => B.uninst.cargar && B.uninst.cargar()),
        h('label', {}, 'Días para considerar un programa "Nuevo": ', h('input', { type: 'number', min: 1, max: 365, value: o().diasNuevos, onchange: (e) => setO('diasNuevos', Number(e.target.value)) }))),
      'Exclusión de registro': h('div', {}, h('p', { class: 'mute', text: 'Claves protegidas, p. ej. HKCU\\Software\\MiPrograma. Nunca se borrarán.' }), listaEdit('exclusionRegistro', 'HKCU\\Software\\…')),
      'Exclusión de basura': h('div', {}, h('p', { class: 'mute', text: 'Rutas que el limpiador de basura no tocará (se ignora todo lo que empiece por ellas).' }), listaEdit('exclusionBasura', 'C:\\carpeta', true)),
      'Grupos': grupos(),
      'Vista': h('div', { class: 'form' }, h('label', {}, 'Tema: ', h('select', { onchange: (e) => setO('tema', e.target.value) }, ['oscuro', 'claro'].map((t) => h('option', { value: t, selected: o().tema === t, text: t })))), chk('barraMenu', 'Mostrar barra de menú'), chk('barraEstado', 'Mostrar barra de estado'), chk('panelDetalles', 'Mostrar panel de detalles'))
    }[pestana];
    cuerpo.replaceChildren(cont);
  }
  pintar();
  return { titulo: 'Opciones', comandos: () => [], alMostrar: () => setStatus('Opciones') };
};
