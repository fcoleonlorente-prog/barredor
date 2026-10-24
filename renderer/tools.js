// Resto de herramientas: inicio, limpiadores, borrado seguro, evidencias, copias, herramientas de Windows y opciones.
const resumenTxt = (r) => (r.cancelado ? 'Cancelado.' : r.ok === false ? 'Error: ' + r.err : `Hecho. Liberado: ${fmtSize(r.liberado || 0)}${r.fallos ? ` · omitidos/en uso: ${typeof r.fallos === 'number' ? r.fallos : r.fallos.length}` : ''}`);
const checkRow = (label, extra, checked = true) => { const cb = h('input', { type: 'checkbox', checked }); return { cb, el: h('label', { class: 'opt' }, cb, ' ', label, extra ? h('span', { class: 'mute', text: '  ' + extra }) : null) }; };

// ---------- Gestor de inicio ----------
B.tools.startup = (panel) => {
  let lista = [], sel = null;
  const cont = h('div'); panel.append(cont);
  const run = async (ch, ok) => { if (!sel) return toast('Selecciona una entrada.'); const r = await inv(ch, sel.id); if (r.cancelado) return; r.ok === false ? toast(r.err || 'No se pudo.') : toast(ok); await cargar(); };
  async function cargar() {
    lista = await inv('start:list'); sel = null; pintar(); refreshCmd();
  }
  function pintar() {
    setStatus(`${lista.length} entradas de inicio`);
    cont.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, ['Nombre', 'Comando', 'Ubicación', 'Estado'].map((t) => h('th', { text: t })))),
      h('tbody', {}, lista.map((e) => h('tr', { class: 'row' + (sel && sel.id === e.id ? ' sel' : ''), onclick: () => { sel = e; pintar(); showDetails([['Nombre', e.nombre], ['Comando', e.comando], ['Ubicación', e.ubicacion], ['Estado', e.estado]]); refreshCmd(); } },
        h('td', { text: e.nombre }), h('td', { title: e.comando, text: e.comando }), h('td', { text: e.ubicacion }), h('td', { class: e.estado === 'Activo' ? 'ok' : 'warn', text: e.estado }))))));
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
  let cats = [];
  const cont = h('div', {}, h('p', { class: 'mute', text: 'Pulsa Escanear para buscar archivos basura. Los archivos en uso se ignoran. Las exclusiones se editan en Opciones.' }));
  panel.append(cont);
  async function escanear() {
    cont.replaceChildren(h('p', {}, h('span', { class: 'spin' }), 'Escaneando…')); setStatus('Escaneando basura…');
    cats = await inv('junk:scan'); pintar(); refreshCmd();
  }
  let cbs = [];
  function pintar() {
    cbs = [];
    const tot = cats.reduce((s, c) => s + c.total, 0);
    setStatus(`${cats.reduce((s, c) => s + c.cantidad, 0)} archivos · ${fmtSize(tot)}`);
    cont.replaceChildren(...cats.map((c) => {
      const hijos = c.archivos.slice(0, 300).map((f) => { const cb = h('input', { type: 'checkbox', checked: true }); cbs.push([f.path, cb]); return h('div', { class: 'leaf' }, cb, h('span', { class: 'mute', title: f.path, text: `${f.path}  (${fmtSize(f.size)})` })); });
      const cab = h('input', { type: 'checkbox', checked: true, onchange: (e) => { hijos.forEach((d) => (d.firstChild.checked = e.target.checked)); }, onclick: (e) => e.stopPropagation() });
      return h('details', { class: 'tree' }, h('summary', {}, cab, ` ${c.nombre} — ${c.cantidad} archivos, ${fmtSize(c.total)}`), hijos, c.archivos.length > 300 ? h('div', { class: 'mute', text: `…y ${c.archivos.length - 300} más (se incluyen si la categoría está marcada)` }) : null,
        (() => { c.__cab = cab; return null; })());
    }));
  }
  async function borrar() {
    const paths = [];
    for (const c of cats) { const marcado = c.__cab && c.__cab.checked; const vistos = new Set(); for (const [p, cb] of cbs) if (c.archivos.some((f) => f.path === p)) { vistos.add(p); if (cb.checked) paths.push(p); } if (marcado) for (const f of c.archivos) if (!vistos.has(f.path)) paths.push(f.path); }
    if (!paths.length) return toast('No hay nada marcado.');
    const r = await inv('junk:clean', paths); if (r.cancelado) return;
    toast(resumenTxt({ ...r, fallos: r.fallos })); escanear();
  }
  return { titulo: 'Limpiador de archivos basura', comandos: () => [{ label: 'Escanear', pri: true, onClick: escanear }, { label: 'Borrar', peligro: true, disabled: !cats.length, onClick: borrar }] };
};

// ---------- Limpiador de navegadores ----------
B.tools.browsers = (panel) => {
  let data = [], cbs = {};
  const cont = h('div'); panel.append(cont);
  const TIPOS = [['cache', 'Caché'], ['cookies', 'Cookies'], ['historial', 'Historial'], ['descargas', 'Historial de descargas']];
  async function cargar() {
    cont.replaceChildren(h('p', {}, h('span', { class: 'spin' }), 'Buscando navegadores…'));
    data = await inv('brow:scan'); cbs = {};
    cont.replaceChildren(h('p', { class: 'mute', text: 'El historial de descargas comparte archivo con el historial: se borran juntos. De Firefox solo se limpian caché y cookies (su historial va unido a los marcadores).' }),
      ...(data.length ? data.map((b) => h('div', { class: 'opt' }, h('b', { text: b.nombre }), b.abierto ? h('div', { class: 'warn', text: 'Está abierto: ciérralo antes de limpiar o algunos datos no se borrarán.' }) : null,
        h('div', { class: 'bar' }, TIPOS.map(([t, n]) => { const info = b.tipos[t]; const cb = h('input', { type: 'checkbox', disabled: !info || (!info.disponible && t !== 'descargas'), checked: false });
          if (t === 'descargas') { cb.disabled = !b.tipos.historial || !b.tipos.historial.disponible; }
          (cbs[b.id] = cbs[b.id] || {})[t] = cb;
          cb.addEventListener('change', () => { if (t === 'historial' || t === 'descargas') { const o = cbs[b.id][t === 'historial' ? 'descargas' : 'historial']; if (!o.disabled) o.checked = cb.checked; } });
          return h('label', {}, cb, ` ${n} `, h('span', { class: 'mute', text: t === 'descargas' ? '' : info && info.disponible ? '(' + fmtSize(info.tamano) + ')' : '' })); })))) : [h('p', { text: 'No se ha encontrado ningún navegador compatible.' })]));
    setStatus(`${data.length} navegadores`);
  }
  async function limpiar() {
    const sel = {}; for (const [id, o] of Object.entries(cbs)) { const t = Object.entries(o).filter(([, c]) => c.checked).map(([k]) => k); if (t.length) sel[id] = t; }
    if (!Object.keys(sel).length) return toast('Marca qué limpiar.');
    const r = await inv('brow:clean', sel); if (r.cancelado) return;
    toast(resumenTxt(r)); cargar();
  }
  return { titulo: 'Limpiador de navegadores', alMostrar: cargar, comandos: () => [{ label: 'Limpiar', pri: true, onClick: limpiar }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Limpiador de Office ----------
B.tools.office = (panel) => {
  let rows = [];
  const cont = h('div'); panel.append(cont);
  async function cargar() {
    const d = await inv('off:scan'); rows = d.map((x) => ({ id: x.id, ...checkRow(x.nombre, `${x.elementos} elementos`, x.elementos > 0) }));
    cont.replaceChildren(h('p', { class: 'mute', text: 'Borra las listas de documentos recientes (File MRU y Place MRU) y los accesos de la carpeta Recent de Office. Se guarda copia del registro.' }), ...rows.map((r) => r.el));
    setStatus('Limpiador de Office');
  }
  async function limpiar() {
    const apps = rows.filter((r) => r.cb.checked).map((r) => r.id); if (!apps.length) return toast('Marca alguna aplicación.');
    const r = await inv('off:clean', apps); if (r.cancelado) return; toast(`Elementos borrados: ${r.borrados || 0}`); cargar();
  }
  return { titulo: 'Limpiador de Office', alMostrar: cargar, comandos: () => [{ label: 'Limpiar', pri: true, onClick: limpiar }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Limpiador de Windows ----------
B.tools.windows = (panel) => {
  let rows = [];
  const cont = h('div'); panel.append(cont);
  async function cargar() {
    const d = await inv('win:scan'); rows = d.map((x) => ({ id: x.id, ...checkRow(x.nombre, x.tamano != null ? fmtSize(x.tamano) : '', true) }));
    cont.replaceChildren(h('p', { class: 'mute', text: 'Marca lo que quieras limpiar. Al terminar verás lo liberado.' }), ...rows.map((r) => r.el)); setStatus('Limpiador de Windows');
  }
  async function limpiar() {
    const ids = rows.filter((r) => r.cb.checked).map((r) => r.id); if (!ids.length) return toast('No hay nada marcado.');
    const r = await inv('win:clean', ids); if (r.cancelado) return;
    aviso('Limpieza terminada', `Elementos limpiados: ${(r.hechos || []).length}\nEspacio liberado: ${fmtSize(r.liberado || 0)}${r.fallos ? `\nOmitidos o en uso: ${r.fallos}` : ''}`); cargar();
  }
  return { titulo: 'Limpiador de Windows', alMostrar: cargar, comandos: () => [{ label: 'Limpiar', pri: true, onClick: limpiar }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Borrado seguro ----------
B.tools.shred = (panel) => {
  let paths = []; let metodo = 3;
  const lista = h('div'); const prog = h('div', { class: 'mute' });
  const zona = h('div', { class: 'zona', text: 'Arrastra aquí archivos o carpetas' });
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('over'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('over'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('over'); for (const f of e.dataTransfer.files) { const p = api.rutaDe(f); if (p) paths.push(p); } paths = [...new Set(paths)]; pintar(); refreshCmd(); });
  const sel = h('select', { onchange: (e) => (metodo = Number(e.target.value)) }, [[1, '1 pasada de ceros'], [3, '3 pasadas (aleatorio, ceros, unos)'], [7, '7 pasadas']].map(([v, t]) => h('option', { value: v, selected: v === 3, text: t })));
  panel.append(h('p', { class: 'mute', text: 'Sobrescribe el contenido, renombra y elimina. No va a la Papelera y no se puede recuperar.' }), zona, h('div', { class: 'bar', style: 'margin-top:10px' }, h('span', { text: 'Método:' }), sel), lista, prog);
  api.on('shred:progreso', (d) => { prog.textContent = `Borrados: ${d.hechos} — ${d.actual}`; });
  function pintar() { lista.replaceChildren(...paths.map((p, i) => h('div', { class: 'leaf' }, h('button', { class: 'btn', onclick: () => { paths.splice(i, 1); pintar(); refreshCmd(); } }, '✕'), p))); setStatus(`${paths.length} elementos`); }
  async function anadir(tipo) { const r = await inv('dlg:pick', tipo); paths = [...new Set([...paths, ...r])]; pintar(); refreshCmd(); }
  async function ejecutar() {
    const r = await inv('shred:run', paths, metodo); if (r.cancelado) return;
    if (r.ok === false) return toast(r.err);
    aviso('Borrado seguro', `Archivos destruidos: ${r.hechos}` + (r.fallos.length ? `\nFallos:\n${r.fallos.map((f) => f.path + ': ' + f.err).join('\n')}` : '')); paths = []; pintar(); refreshCmd(); prog.textContent = '';
  }
  return { titulo: 'Borrado seguro', comandos: () => [{ label: 'Añadir archivos', onClick: () => anadir('files') }, { label: 'Añadir carpeta', onClick: () => anadir('foldersMulti') }, { label: 'Borrar para siempre', peligro: true, disabled: !paths.length, onClick: ejecutar }] };
};

// ---------- Eliminador de evidencias ----------
B.tools.evidence = (panel) => {
  const selU = h('select'), selM = h('select', {}, [[1, '1 pasada'], [3, '3 pasadas'], [7, '7 pasadas']].map(([v, t]) => h('option', { value: v, text: t })));
  const barra = h('i'), txt = h('div', { class: 'mute' });
  let corriendo = false;
  panel.append(h('p', { class: 'mute', text: 'Escribe sobre el espacio libre para que lo ya borrado no se pueda recuperar. Crea un archivo temporal grande y lo elimina. Deja siempre 200 MB libres y puedes cancelar.' }),
    h('div', { class: 'bar' }, h('span', { text: 'Unidad:' }), selU, h('span', { text: 'Método:' }), selM), h('div', { class: 'prog' }, barra), txt);
  api.on('evid:progreso', (d) => { barra.style.width = d.pct + '%'; txt.textContent = `Pasada ${d.pasada} de ${d.de} — ${d.pct}%`; });
  async function cargar() { const d = await inv('evid:drives'); selU.replaceChildren(...d.map((x) => h('option', { value: x.unidad, text: `${x.unidad} (${fmtSize(x.libre)} libres)` }))); }
  async function empezar() {
    corriendo = true; refreshCmd(); txt.textContent = 'Trabajando…';
    const r = await inv('evid:start', selU.value, Number(selM.value));
    corriendo = false; refreshCmd(); barra.style.width = '0';
    txt.textContent = r.cancelado && !r.ok ? 'No iniciado.' : r.ok ? (r.cancelado ? 'Cancelado. Archivo temporal eliminado.' : 'Terminado. Archivo temporal eliminado.') : 'Error: ' + r.err; cargar();
  }
  return { titulo: 'Eliminador de evidencias', alMostrar: cargar, comandos: () => [{ label: 'Empezar', pri: true, disabled: corriendo, onClick: empezar }, { label: 'Cancelar', disabled: !corriendo, onClick: () => inv('evid:cancel') }] };
};

// ---------- Gestor de copias ----------
B.tools.backups = (panel) => {
  let lista = [], sel = null;
  const cont = h('div'); panel.append(cont);
  async function cargar() { lista = await inv('bk:list'); sel = null; pintar(); refreshCmd(); }
  function pintar() {
    setStatus(`${lista.length} copias`);
    cont.replaceChildren(lista.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Fecha', 'Tipo', 'Nombre', 'Tamaño'].map((t) => h('th', { text: t })))),
      h('tbody', {}, lista.map((b) => h('tr', { class: 'row' + (sel && sel.id === b.id ? ' sel' : ''), onclick: () => { sel = b; pintar(); showDetails([['Archivo', b.id], ['Tipo', b.tipo], ['Fecha', b.fecha]]); refreshCmd(); } }, h('td', { text: b.fecha }), h('td', { text: b.tipo }), h('td', { text: b.nombre }), h('td', { class: 'num', text: fmtSize(b.tamano) }))))) : h('p', { class: 'mute', text: 'Todavía no hay copias.' }));
  }
  const act = async (ch, ok) => { const r = await inv(ch, sel.id); if (r.cancelado) return; toast(r.ok === false ? 'Error: ' + (r.err || '') : ok); cargar(); };
  return { titulo: 'Gestor de copias', alMostrar: cargar,
    comandos: () => [{ label: 'Restaurar', pri: true, disabled: !sel, onClick: () => act('bk:restore', 'Copia restaurada.') }, { label: 'Eliminar copia', disabled: !sel, onClick: () => act('bk:delete', 'Copia eliminada.') },
      { label: 'Eliminar todas', peligro: true, disabled: !lista.length, onClick: async () => { const r = await inv('bk:deleteAll'); if (!r.cancelado) { toast('Copias eliminadas.'); cargar(); } } }, { label: 'Crear copia ahora', onClick: async () => { toast('Creando copia…'); await inv('bk:create'); cargar(); } },
      { label: 'Abrir carpeta', onClick: () => inv('bk:open') }, { label: 'Actualizar', onClick: cargar }] };
};

// ---------- Herramientas de Windows ----------
B.tools.wintools = (panel) => {
  const cont = h('div'); panel.append(cont);
  async function cargar() {
    const l = await inv('wt:list');
    cont.replaceChildren(h('table', {}, h('tbody', {}, l.map((t) => h('tr', { class: 'row' }, h('td', { text: t.nombre }), h('td', { class: 'mute', text: t.desc }), h('td', {}, h('button', { class: 'btn', onclick: async () => { const r = await inv('wt:run', t.id); r.ok ? toast('Abierto: ' + t.nombre) : toast('No disponible: ' + (r.err || '')); } }, 'Ejecutar')))))));
    setStatus(`${l.length} herramientas`);
  }
  return { titulo: 'Herramientas de Windows', alMostrar: cargar, comandos: () => [] };
};

// ---------- Opciones ----------
B.tools.options = (panel) => {
  const cuerpo = h('div'); let pestana = 'General';
  const nombres = ['General', 'Desinstalador', 'Exclusión de registro', 'Exclusión de basura', 'Grupos', 'Vista'];
  panel.append(h('div', { class: 'tabs-int', id: 'opt-tabs' }), cuerpo);
  const o = () => B.cfg.opciones;
  const setO = async (k, v) => { await saveCfg({ opciones: { [k]: v } }); applyView(); };
  const chk = (k, txt, extra) => h('label', {}, h('input', { type: 'checkbox', checked: o()[k], onchange: (e) => setO(k, e.target.checked).then(extra) }), ' ' + txt);
  const listaEdit = (clave, ph, pick) => {
    const l = h('div'); const inp = h('input', { type: 'text', placeholder: ph, style: 'flex:1' });
    const pintar = () => l.replaceChildren(...B.cfg[clave].map((x, i) => h('div', { class: 'leaf' }, h('button', { class: 'btn', onclick: async () => { const n = [...B.cfg[clave]]; n.splice(i, 1); await saveCfg({ [clave]: n }); pintar(); } }, '✕'), x)));
    const add = async (v) => { v = v.trim(); if (v) { await saveCfg({ [clave]: [...new Set([...B.cfg[clave], v])] }); inp.value = ''; pintar(); } };
    pintar();
    return h('div', {}, h('div', { class: 'bar' }, inp, h('button', { class: 'btn', onclick: () => add(inp.value) }, 'Añadir'), pick ? h('button', { class: 'btn', onclick: async () => { const [f] = await inv('dlg:pick', 'folder'); if (f) add(f); } }, 'Elegir carpeta…') : null), l);
  };
  function grupos() {
    const l = h('div'); const inp = h('input', { type: 'text', placeholder: 'Nombre del grupo nuevo' });
    const pintar = () => l.replaceChildren(...Object.keys(B.cfg.grupos).map((g) => h('div', { class: 'leaf' }, h('b', { text: g }), h('span', { class: 'mute', text: `(${B.cfg.grupos[g].length} programas)` }),
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
