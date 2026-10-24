// Desinstalador: lista de programas, asistente (normal y forzado) y desinstalación rápida.
B.uninst = {};

B.tools.uninstaller = (panel) => {
  const st = { progs: [], vista: 'detalles', q: '', grupo: 'Todos', col: 'nombre', dir: 1, sel: new Set(), cargando: false, colapsados: new Set(), anchos: {} };
  const buscador = h('input', { type: 'text', placeholder: 'Buscar por nombre, editor o comentario…', oninput: (e) => { st.q = e.target.value.toLowerCase(); pintar(); } });
  const selGrupo = h('select', { onchange: (e) => { st.grupo = e.target.value; pintar(); } });
  const selVista = h('select', { onchange: (e) => { st.vista = e.target.value; pintar(); } }, ['iconos|Iconos', 'lista|Lista', 'detalles|Detalles'].map((x) => h('option', { value: x.split('|')[0], selected: x.startsWith(st.vista), text: x.split('|')[1] })));
  const cuenta = h('span', { class: 'cuenta' });
  const cont = h('div', { class: 'scroll' });
  panel.classList.add('split');
  panel.append(h('div', { class: 'bar toolbar' }, h('div', { class: 'search' }, ico('search', 16), buscador), h('span', { class: 'grow' }), cuenta, h('label', { class: 'mute', text: 'Grupo' }), selGrupo, h('label', { class: 'mute', text: 'Vista' }), selVista), cont);

  const comentarioDe = (p) => B.cfg.comentarios[p.clave] || p.comentario || '';
  const esNuevo = (p) => p.fecha && (Date.now() - new Date(p.fecha).getTime()) / 864e5 <= (B.cfg.opciones.diasNuevos || 7);
  const gruposDe = (p) => Object.keys(B.cfg.grupos).filter((g) => (B.cfg.grupos[g] || []).includes(p.clave));
  function filtrados() {
    let l = st.progs.filter((p) => !st.q || [p.nombre, p.editor, comentarioDe(p)].some((s) => String(s || '').toLowerCase().includes(st.q)));
    if (st.grupo === 'Nuevos') l = l.filter(esNuevo);
    else if (st.grupo !== 'Todos') l = l.filter((p) => (B.cfg.grupos[st.grupo] || []).includes(p.clave));
    const c = st.col;
    return l.sort((a, b) => st.dir * ((c === 'tamanoKB' ? a.tamanoKB - b.tamanoKB : String(a[c] || '').localeCompare(String(b[c] || ''), 'es', { numeric: true }))));
  }
  const seleccionados = () => st.progs.filter((p) => st.sel.has(p.clave));
  function seleccionar(p, ev) {
    if (ev && (ev.ctrlKey || ev.metaKey)) { st.sel.has(p.clave) ? st.sel.delete(p.clave) : st.sel.add(p.clave); } else { st.sel = new Set([p.clave]); }
    pintar();
    const one = seleccionados();
    if (one.length === 1) mostrar(one[0]); else showDetails(null);
    refreshCmd();
  }
  function mostrar(p) {
    showDetails([['Nombre', p.nombre], ['Versión', p.version], ['Editor', p.editor], ['Tamaño', p.tamanoKB ? fmtSize(p.tamanoKB * 1024) : ''], ['Instalado', p.fecha], ['Ubicación', p.ubicacion],
      ['Desinstalación', p.desinstalar], ['Clave', p.clave], ['Web', p.web], ['Comentario', comentarioDe(p)], ['Grupos', gruposDe(p).join(', ')]], iconoProg(p, 48));
  }
  function menu(ev, p) {
    if (!st.sel.has(p.clave)) seleccionar(p);
    const it = [
      { label: 'Desinstalar', onClick: () => desinstalar() }, { label: 'Desinstalación rápida', onClick: () => rapida() }, '-',
      { label: 'Abrir ubicación de instalación', onClick: async () => { const r = await inv('prog:openLocation', p.clave); if (r.ok === false) toast(r.err); } },
      { label: 'Abrir clave del registro (regedit)', onClick: () => inv('prog:openKey', p.clave) },
      { label: 'Buscar en Google', onClick: () => inv('prog:google', p.nombre) },
      { label: 'Abrir web', onClick: async () => { const r = await inv('prog:web', p.clave); if (r.ok === false) toast(r.err); } }, '-',
      { label: 'Añadir / editar comentario', onClick: () => editarComentario(p) }
    ];
    const grupos = Object.keys(B.cfg.grupos);
    for (const g of grupos) if (!(B.cfg.grupos[g] || []).includes(p.clave)) it.push({ label: 'Añadir al grupo: ' + g, onClick: () => cambiarGrupo(p, g, true) });
    for (const g of gruposDe(p)) it.push({ label: 'Quitar del grupo: ' + g, onClick: () => cambiarGrupo(p, g, false) });
    ctxMenu(ev, it);
  }
  async function cambiarGrupo(p, g, add) {
    const grupos = structuredClone(B.cfg.grupos); const l = new Set(grupos[g] || []);
    add ? l.add(p.clave) : l.delete(p.clave); grupos[g] = [...l];
    await saveCfg({ grupos }); pintar();
  }
  function editarComentario(p) {
    const ta = h('textarea', { rows: 4, style: 'width:100%', value: comentarioDe(p) });
    modal({ titulo: 'Comentario de ' + p.nombre, chico: true, cuerpo: ta, botones: [{ label: 'Cancelar' }, { label: 'Guardar', pri: true, onClick: async () => { const c = { ...B.cfg.comentarios }; ta.value.trim() ? (c[p.clave] = ta.value.trim()) : delete c[p.clave]; await saveCfg({ comentarios: c }); pintar(); } }] });
  }
  const fila = (p) => ({ onclick: (e) => seleccionar(p, e), ondblclick: () => desinstalar(), oncontextmenu: (e) => menu(e, p) });
  function pintar() {
    selGrupo.replaceChildren(...['Todos', 'Nuevos', ...Object.keys(B.cfg.grupos)].map((g) => h('option', { value: g, selected: g === st.grupo, text: g })));
    const l = filtrados();
    cuenta.textContent = `${l.length} encontrados`;
    setStatus(st.cargando ? 'Leyendo programas…' : `${l.length === st.progs.length ? st.progs.length : l.length + ' de ' + st.progs.length} programas`, st.sel.size > 1 ? `${st.sel.size} seleccionados` : '');
    if (!l.length) { cont.replaceChildren(h('div', { class: 'vacio-msg', text: st.cargando ? 'Leyendo programas instalados…' : 'No hay programas que mostrar.' })); return; }
    if (st.vista === 'detalles') {
      const cols = [['nombre', 'Nombre', 280], ['editor', 'Editor', 180], ['version', 'Versión', 100], ['tamanoKB', 'Tamaño', 90], ['fecha', 'Instalado', 100], ['ubicacion', 'Ubicación', 320]];
      const ancho = (c) => st.anchos[c[0]] || c[2];
      const tabla = h('table', { class: 'fija', style: `width:${cols.reduce((a, c) => a + ancho(c), 0)}px` });
      const asa = (c, th) => h('i', { class: 'grip', onclick: (e) => e.stopPropagation(), onmousedown: (e) => {
        e.preventDefault(); e.stopPropagation();
        const x0 = e.clientX, w0 = th.offsetWidth;
        const mv = (ev) => { st.anchos[c[0]] = Math.max(50, w0 + ev.clientX - x0); th.style.width = st.anchos[c[0]] + 'px'; tabla.style.width = cols.reduce((a, k) => a + ancho(k), 0) + 'px'; };
        const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
        addEventListener('mousemove', mv); addEventListener('mouseup', up);
      } });
      tabla.append(h('thead', {}, h('tr', {}, cols.map((c) => { const th = h('th', { class: st.col === c[0] ? 'ord' : '', style: `width:${ancho(c)}px`, onclick: () => { st.dir = st.col === c[0] ? -st.dir : 1; st.col = c[0]; pintar(); } }, c[1], st.col === c[0] ? h('span', { class: 'arr', text: st.dir > 0 ? '▲' : '▼' }) : null); th.append(asa(c, th)); return th; }))),
        h('tbody', {}, l.map((p) => h('tr', { class: 'row' + (st.sel.has(p.clave) ? ' sel' : ''), ...fila(p) }, h('td', { title: p.nombre }, h('span', { class: 'nmc' }, iconoProg(p, 18), h('span', { text: p.nombre }))), h('td', { title: p.editor, text: p.editor }), h('td', { title: p.version, text: p.version }), h('td', { class: 'num', text: p.tamanoKB ? fmtSize(p.tamanoKB * 1024) : '' }), h('td', { text: p.fecha }), h('td', { title: p.ubicacion, text: p.ubicacion })))));
      cont.replaceChildren(tabla);
    } else if (st.vista === 'lista') {
      cont.replaceChildren(h('div', { class: 'lista' }, l.map((p) => h('div', { class: 'it' + (st.sel.has(p.clave) ? ' sel' : ''), ...fila(p) }, iconoProg(p, 24), h('span', { class: 'nm', text: p.nombre }), h('span', { class: 'mute', text: p.version })))));
    } else {
      const card = (p) => h('div', { class: 'card' + (st.sel.has(p.clave) ? ' sel' : ''), title: p.nombre, ...fila(p) }, iconoProg(p, 40), h('div', { class: 'nm', text: p.nombre }));
      const secciones = [];
      if (st.grupo === 'Todos') {
        const usados = new Set(); const toma = (fn) => l.filter((p) => !usados.has(p.clave) && fn(p) && usados.add(p.clave));
        secciones.push(['Nuevos', toma(esNuevo)]);
        for (const g of Object.keys(B.cfg.grupos)) secciones.push([g, toma((p) => (B.cfg.grupos[g] || []).includes(p.clave))]);
        secciones.push(['Otros', toma(() => true)]);
      } else secciones.push([st.grupo, l]);
      cont.replaceChildren(...secciones.filter(([, it]) => it.length).map(([g, it]) => {
        const cerrado = st.colapsados.has(g);
        return h('section', { class: 'gsec' + (cerrado ? ' cerrado' : '') },
          h('div', { class: 'gh', onclick: () => { cerrado ? st.colapsados.delete(g) : st.colapsados.add(g); pintar(); } }, h('span', { class: 'chev', text: '▾' }), h('b', { text: g }), h('span', { class: 'pill', text: it.length })),
          cerrado ? null : h('div', { class: 'grid' }, it.map(card)));
      }));
    }
  }
  async function cargar() {
    st.cargando = true; pintar();
    const r = await inv('prog:list');
    st.progs = Array.isArray(r) ? r : [];
    st.cargando = false; pintar();
    if (!st.progs.length) toast('No se pudieron leer los programas.');
    return st.progs;
  }
  const uno = () => { const s = seleccionados(); if (s.length !== 1) { toast('Selecciona un programa.'); return null; } return s[0]; };
  function desinstalar() { const p = uno(); if (p) asistente({ prog: p }); }
  function rapida() { const s = seleccionados(); if (!s.length) return toast('Selecciona uno o varios programas (Ctrl+clic).'); desinstalacionRapida(s); }
  function forzada(nombre) { asistente({ forzada: true, nombre }); }
  async function cambiar() { const p = uno(); if (!p) return; const r = await inv('prog:modify', p.clave); if (r.ok === false) toast(r.err); }
  const hunter = () => inv('hunter:open');
  B.uninst = { desinstalar, rapida, forzada, actualizar: cargar, cargar, programas: () => st.progs, desinstalarPrograma: (p) => asistente({ prog: p }), exportar: (fmt) => inv('prog:exportList', fmt, filtrados().map((p) => p.clave)).then((r) => r.ok && toast('Lista exportada: ' + r.ruta)), repintar: pintar };
  showDetails(null);
  return {
    titulo: 'Desinstalador',
    comandos: () => {
      const p = seleccionados()[0];
      return [{ label: 'Desinstalar', pri: true, atajo: 'Ctrl+U', disabled: !p, onClick: desinstalar }, { label: 'Desinstalación rápida', atajo: 'Ctrl+Q', disabled: !p, onClick: rapida }, { label: 'Desinstalación forzada', atajo: 'Ctrl+F', onClick: () => forzada() },
        ...(p && p.modificar ? [{ label: 'Cambiar / Reparar', onClick: cambiar }] : []), '-', { label: 'Actualizar', atajo: 'Ctrl+R', onClick: cargar }, { label: 'Modo cazador', onClick: hunter }];
    },
    alMostrar: () => { if (!st.progs.length && !st.cargando) cargar(); }
  };
};

// ---------- Árbol de claves de registro ----------
function construirArbol(items) {
  const raiz = { hijos: new Map() };
  for (const it of items) {
    const segs = it.key.split('\\'); if (it.valor) segs.push('› ' + it.valor);
    let n = raiz;
    for (const s of segs) { if (!n.hijos.has(s)) n.hijos.set(s, { hijos: new Map() }); n = n.hijos.get(s); }
    n.item = it;
  }
  return raiz;
}
const etiquetaItem = (it, nombre) => (it.valor ? `${it.valor} = ${it.dato}` : nombre);
function pintarArbol(raiz, filas) {
  const nodo = (nombre, n) => {
    let cb = null, lab = nombre;
    if (n.item) {
      cb = h('input', { type: 'checkbox', checked: n.item.nivel === 'fuerte', disabled: n.item.nivel === 'excluida' });
      filas.push({ item: n.item, cb });
      lab = h('span', { class: n.item.nivel === 'fuerte' ? 'fuerte' : n.item.nivel === 'excluida' ? 'excl' : 'debil', text: etiquetaItem(n.item, nombre) + (n.item.nivel === 'debil' ? '  (coincidencia débil: no se borra)' : n.item.nivel === 'excluida' ? '  (protegida)' : '') });
    }
    const ctx = n.item ? { oncontextmenu: (e) => menuReg(e, n.item) } : {};
    if (!n.hijos.size) return h('div', { class: 'leaf', ...ctx }, cb, lab);
    return h('details', { open: true }, h('summary', ctx, cb, lab), [...n.hijos].map(([k, v]) => nodo(k, v)));
  };
  return h('div', { class: 'tree' }, [...raiz.hijos].map(([k, v]) => nodo(k, v)));
}
function menuReg(ev, it) {
  ctxMenu(ev, [
    { label: 'Expandir todo', onClick: () => document.querySelectorAll('.tree details').forEach((d) => (d.open = true)) },
    { label: 'Contraer todo', onClick: () => document.querySelectorAll('.tree details').forEach((d) => (d.open = false)) }, '-',
    { label: 'Exportar a HTML', onClick: () => exportarHtml('Restos del registro', window.__restos || [it]) },
    { label: 'Añadir a lista de exclusión (protegida)', onClick: async () => { await saveCfg({ exclusionRegistro: [...new Set([...B.cfg.exclusionRegistro, it.key])] }); it.nivel = 'excluida'; toast('Clave protegida: ' + it.key); } },
    { label: 'Abrir en regedit', onClick: () => inv('prog:openKey', it.key) }
  ]);
}
function exportarHtml(titulo, items) {
  const filas = items.map((i) => (i.path ? `<tr><td>${esc(i.path)}</td><td>${fmtSize(i.tamano)}</td></tr>` : `<tr><td>${esc(i.key)}${i.valor ? ' › ' + esc(i.valor) : ''}</td><td>${esc(i.nivel)}</td></tr>`)).join('');
  return inv('export:save', 'restos.html', `<!doctype html><meta charset="utf-8"><title>${esc(titulo)}</title><h1>${esc(titulo)}</h1><table border="1" cellpadding="4">${filas}</table>`).then((r) => r.ok && toast('Exportado: ' + r.ruta));
}

// ---------- Asistente ----------
const MODOS = [['seguro', 'Seguro', 'Solo la carpeta de instalación y claves con el nombre exacto del programa. Poco riesgo.'],
  ['moderado', 'Moderado', 'Además AppData, Archivos de programa, menú Inicio y claves con el nombre en rutas habituales.'],
  ['avanzado', 'Avanzado', 'Búsqueda profunda con nombre flexible y claves con identificadores (GUID). Revisa bien el resultado.']];

function asistente({ prog, forzada, nombre }) {
  const ctx = { prog: prog || null, forzada: !!forzada, modo: 'moderado', nombre: prog ? prog.nombre : nombre || '', installDir: prog ? prog.ubicacion : '', borrados: { reg: 0, arch: 0 }, omitidas: 0, fallos: [] };
  paso1();

  function paso1() {
    const radios = MODOS.map(([v, t, d]) => h('label', { class: 'opt' }, h('input', { type: 'radio', name: 'modo', value: v, checked: v === ctx.modo, onchange: () => (ctx.modo = v) }), ' ', h('b', { text: t }), h('span', { class: 'mute', text: d })));
    const inNombre = h('input', { type: 'text', value: ctx.nombre, placeholder: 'Nombre del programa', style: 'width:100%' });
    const infoDir = h('div', { class: 'mute', text: ctx.installDir ? 'Carpeta: ' + ctx.installDir : '' });
    const forzadoUI = ctx.forzada ? [h('p', { text: 'Para programas ya borrados, a medias o que no aparecen en la lista. No se lanza ningún desinstalador: solo se buscan y borran restos.' }), inNombre,
      h('div', { class: 'bar', style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: async () => { const [f] = await inv('dlg:pick', 'folder'); if (f) { ctx.installDir = f; if (!inNombre.value) inNombre.value = f.split('\\').pop(); infoDir.textContent = 'Carpeta: ' + f; } } }, 'Elegir carpeta…'),
        h('button', { class: 'btn', onclick: async () => { const [f] = await inv('dlg:pick', 'exe'); if (f) { const d = f.replace(/\\[^\\]+$/, ''); ctx.installDir = d; if (!inNombre.value) inNombre.value = f.split('\\').pop().replace(/\.[^.]+$/, ''); infoDir.textContent = 'Carpeta: ' + d; } } }, 'Elegir ejecutable…')), infoDir] : [h('p', {}, 'Vas a desinstalar ', h('b', { text: ctx.nombre }), '. Elige a qué profundidad buscar los restos:')];
    modal({ titulo: ctx.forzada ? 'Desinstalación forzada' : 'Asistente de desinstalación', pasos: ['Modo', 'Análisis', 'Registro', 'Archivos', 'Resumen'], cuerpo: [...forzadoUI, h('h3', { text: 'Modo de análisis' }), radios, h('p', { class: 'mute', text: 'Se creará un punto de restauración (si hay permisos) y una copia del registro antes de empezar.' })],
      botones: [{ label: 'Cancelar' }, { label: 'Continuar', pri: true, cierra: false, onClick: (m) => { if (ctx.forzada) { ctx.nombre = inNombre.value.trim(); if (!ctx.nombre && !ctx.installDir) { toast('Escribe un nombre o elige una carpeta.'); return false; } } paso2(m); return false; } }] });
  }

  async function paso2(m) {
    const log = h('div', { class: 'log' });
    const add = (t) => { log.append(t + '\n'); log.scrollTop = log.scrollHeight; };
    m.paso(1);
    m.body.replaceChildren(h('p', {}, h('span', { class: 'spin' }), 'Preparando…'), h('div', { class: 'prog ind' }, h('i')), log);
    m.foot.replaceChildren();
    add('Creando punto de restauración y copia del registro…');
    const pr = await inv('uninst:prepare', { restore: true, backup: true });
    if (pr.restore && !pr.restore.ok) add('AVISO: no se creó el punto de restauración (' + pr.restore.err + '). Se continúa.');
    else if (pr.restore) add('Punto de restauración creado.');
    add(`Copias del registro guardadas: ${pr.copias}.`);
    if (!ctx.forzada) {
      const s = await inv('uninst:start', ctx.prog.clave, false);
      if (!s.ok) { add(s.cancelado ? 'Cancelado.' : 'No se pudo lanzar: ' + s.err); m.foot.append(h('button', { class: 'btn', onclick: m.cerrar }, 'Cerrar')); return; }
      add('Desinstalador lanzado. Espera a que termine (o pulsa "Escanear ahora").');
      const btn = h('button', { class: 'btn pri', onclick: () => inv('uninst:skip', s.id) }, 'Escanear ahora');
      m.foot.append(btn);
      const w = await inv('uninst:wait', s.id);
      add('Desinstalador terminado' + (w.code === 'omitido' ? ' (omitido por ti)' : ` (código ${w.code})`) + '.');
    }
    await escanear(m, add);
  }

  async function escanear(m, add) {
    m.foot.replaceChildren();
    m.paso(1);
    m.body.replaceChildren(h('p', {}, h('span', { class: 'spin' }), 'Buscando restos (puede tardar un minuto)…'), h('div', { class: 'prog ind' }, h('i')));
    const r = await inv('scan:run', { name: ctx.nombre, publisher: ctx.prog ? ctx.prog.editor : '', installDir: ctx.installDir, originalKey: ctx.prog ? ctx.prog.clave : '', uninstall: ctx.prog ? ctx.prog.desinstalar : '', mode: ctx.modo, forced: ctx.forzada });
    if (r.ok === false) { m.body.replaceChildren(h('p', { class: 'bad', text: 'Error en el escaneo: ' + r.err })); m.foot.append(h('button', { class: 'btn', onclick: m.cerrar }, 'Cerrar')); return; }
    ctx.scan = r;
    pantallaRegistro(m);
  }

  function pantallaRegistro(m) {
    const filas = []; window.__restos = ctx.scan.registro;
    m.paso(2);
    const arbol = pintarArbol(construirArbol(ctx.scan.registro), filas);
    const vacio = !ctx.scan.registro.length;
    m.titulo.textContent = `Restos del registro (${ctx.scan.registro.length})`;
    m.body.replaceChildren(...(ctx.scan.aviso ? [h('p', { class: 'warn', text: ctx.scan.aviso })] : []),
      h('p', { class: 'mute', text: 'En negrita: coincidencia fuerte (se pueden borrar). El resto se muestra pero no se borra. Antes de borrar cada clave se guarda una copia.' }),
      vacio ? h('p', { class: 'ok', text: 'No se han encontrado restos en el registro.' }) : arbol);
    m.foot.replaceChildren(
      h('button', { class: 'btn', disabled: vacio, onclick: () => { const todo = filas.some((f) => !f.cb.checked && !f.cb.disabled); filas.forEach((f) => !f.cb.disabled && (f.cb.checked = todo)); } }, 'Seleccionar todo'),
      h('button', { class: 'btn peligro', disabled: vacio, onclick: async () => {
        const marcadas = filas.filter((f) => f.cb.checked && !f.cb.disabled);
        const ok = marcadas.filter((f) => f.item.nivel === 'fuerte').map((f) => ({ key: f.item.key, valor: f.item.valor }));
        ctx.omitidas += marcadas.length - ok.length;
        if (!ok.length) return toast('No hay claves seguras marcadas.');
        const r = await inv('scan:delReg', ok);
        if (r.cancelado) return;
        ctx.borrados.reg += r.borrados || 0; ctx.fallos.push(...(r.fallos || []));
        const quitar = new Set(ok.map((o) => o.key + '|' + (o.valor || '')));
        ctx.scan.registro = ctx.scan.registro.filter((i) => !quitar.has(i.key + '|' + (i.valor || '')));
        toast(`Borradas ${r.borrados} claves.`); pantallaRegistro(m);
      } }, 'Borrar'),
      h('button', { class: 'btn pri', onclick: () => pantallaArchivos(m) }, 'Siguiente'));
  }

  function pantallaArchivos(m) {
    const cbs = [];
    m.paso(3);
    const l = ctx.scan.archivos;
    m.titulo.textContent = `Restos de archivos y carpetas (${l.length})`;
    const tabla = h('table', {}, h('thead', {}, h('tr', {}, h('th'), h('th', { text: 'Ruta' }), h('th', { text: 'Tipo' }), h('th', { text: 'Tamaño' }))),
      h('tbody', {}, l.map((f) => { const cb = h('input', { type: 'checkbox', checked: f.nivel === 'fuerte' }); cbs.push([f, cb]);
        return h('tr', { class: 'row', oncontextmenu: (e) => ctxMenu(e, [{ label: 'Abrir', onClick: () => inv('file:open', f.path) }, { label: 'Propiedades', onClick: async () => { const p = await inv('file:props', f.path); if (p.ok) aviso('Propiedades', `${p.ruta}\n${p.tipo} · ${fmtSize(p.tamano)}\nCreado: ${p.creado}\nModificado: ${p.modificado}`); } }, { label: 'Abrir carpeta contenedora', onClick: () => inv('file:parent', f.path) }, { label: 'Exportar a HTML', onClick: () => exportarHtml('Restos de archivos', l) }]) },
          h('td', {}, cb), h('td', { class: f.nivel === 'fuerte' ? 'fuerte' : 'mute', style: f.nivel === 'fuerte' ? 'font-weight:700' : '', title: f.path, text: f.path }), h('td', { text: f.esCarpeta ? 'Carpeta' : 'Archivo' }), h('td', { class: 'num', text: fmtSize(f.tamano) })); })));
    m.body.replaceChildren(h('p', { class: 'mute', text: 'Irán a la Papelera de reciclaje (salvo que lo cambies en Opciones). Revisa antes de borrar.' }), l.length ? tabla : h('p', { class: 'ok', text: 'No se han encontrado restos de archivos.' }));
    m.foot.replaceChildren(
      h('button', { class: 'btn', disabled: !l.length, onclick: () => { const t = cbs.some(([, c]) => !c.checked); cbs.forEach(([, c]) => (c.checked = t)); } }, 'Seleccionar todo'),
      h('button', { class: 'btn peligro', disabled: !l.length, onclick: async () => {
        const sel = cbs.filter(([, c]) => c.checked).map(([f]) => f.path);
        if (!sel.length) return toast('No hay nada marcado.');
        const r = await inv('scan:delFiles', sel);
        if (r.cancelado) return;
        ctx.borrados.arch += r.borrados || 0; ctx.fallos.push(...(r.fallos || []));
        if (r.fallos && r.fallos.length) aviso(`Borrados: ${r.borrados || 0}. No se pudo borrar ${r.fallos.length}`, r.fallos.slice(0, 8).join('\n') + '\n\nSi es una carpeta de Archivos de programa, cierra Barredor y ábrelo como administrador.');
        else toast(`Borrados ${r.borrados || 0} elemento(s) (a la Papelera).`);
        const bor = new Set(sel); const fall = new Set((r.fallos || []).map((x) => x.split(': ')[0]));
        ctx.scan.archivos = ctx.scan.archivos.filter((f) => !(bor.has(f.path) && !fall.has(f.path)));
        pantallaArchivos(m);
      } }, 'Borrar'),
      h('button', { class: 'btn pri', onclick: () => resumen(m) }, 'Finalizar'));
  }

  function resumen(m) {
    m.paso(4);
    m.titulo.textContent = 'Resumen';
    m.body.replaceChildren(h('h3', { text: ctx.nombre }), h('p', { class: 'ok', text: `Claves del registro borradas: ${ctx.borrados.reg}` }), h('p', { class: 'ok', text: `Archivos y carpetas borrados: ${ctx.borrados.arch}` }),
      ctx.omitidas ? h('p', { class: 'mute', text: `Coincidencias débiles que se dejaron sin tocar: ${ctx.omitidas}` }) : null,
      ...(ctx.fallos.length ? [h('p', { class: 'warn', text: `Fallos (${ctx.fallos.length}):` }), h('div', { class: 'log', text: ctx.fallos.join('\n') })] : []),
      h('p', { class: 'mute', text: 'Las copias están en el Gestor de copias, por si necesitas restaurar algo. ¿Te gusta Barredor? Mentorías gratuitas los domingos: divisualproject.academy' }));
    m.foot.replaceChildren(h('button', { class: 'btn pri', onclick: () => { m.cerrar(); B.uninst.actualizar && B.uninst.actualizar(); } }, 'Cerrar'));
  }
}

// ---------- Desinstalación rápida ----------
async function desinstalacionRapida(progs) {
  if (!(await inv('quick:confirm', progs.map((p) => p.nombre)))) return;
  const log = h('div', { class: 'log', style: 'max-height:340px' });
  const add = (t) => { log.append(t + '\n'); log.scrollTop = log.scrollHeight; };
  const barra = h('i');
  const m = modal({ titulo: 'Desinstalación rápida', cuerpo: [h('p', { text: 'Se desinstalan uno a uno. No cierres Barredor.' }), h('div', { class: 'prog' }, barra), h('div', { style: 'height:10px' }), log], botones: [] });
  let total = 0;
  try {
    add('Punto de restauración y copia del registro (una vez)…');
    const pr = await inv('uninst:prepare', { restore: true, backup: true });
    if (pr.restore && !pr.restore.ok) add('AVISO: sin punto de restauración (' + pr.restore.err + ').');
    for (const [i, p] of progs.entries()) {
      add(`\n[${i + 1}/${progs.length}] ${p.nombre}`); barra.style.width = Math.round((i / progs.length) * 100) + '%';
      const s = await inv('uninst:start', p.clave, true);
      if (!s.ok) { add('  No se pudo lanzar: ' + (s.err || 'cancelado')); continue; }
      await inv('uninst:wait', s.id);
      add('  Desinstalador terminado. Buscando restos…');
      const r = await inv('scan:run', { name: p.nombre, publisher: p.editor, installDir: p.ubicacion, originalKey: p.clave, uninstall: p.desinstalar, mode: 'moderado' });
      const regs = (r.registro || []).filter((x) => x.nivel === 'fuerte').map((x) => ({ key: x.key, valor: x.valor }));
      const files = (r.archivos || []).filter((x) => x.nivel === 'fuerte').map((x) => x.path);
      const a = regs.length ? await inv('scan:delReg', regs) : { borrados: 0 };
      const b = files.length ? await inv('scan:delFiles', files) : { borrados: 0 };
      const n = (a.borrados || 0) + (b.borrados || 0); total += n;
      add(`  Restos borrados: ${n} (${a.borrados || 0} claves, ${b.borrados || 0} archivos).`);
    }
    barra.style.width = '100%';
    add(`\nTerminado. Total de restos borrados: ${total}.`);
  } finally { await inv('quick:end'); }
  m.foot.replaceChildren(h('button', { class: 'btn pri', onclick: () => { m.cerrar(); B.uninst.actualizar(); } }, 'Cerrar'));
}
