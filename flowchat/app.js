'use strict';
const KEY = 'flowchat.v1';
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- Estado ----------
let db;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
if (!db || !db.flows || !db.flows.length) db = { current: null, flows: [sampleFlow()] };
if (!db.flows.find(f => f.id === db.current)) db.current = db.flows[0].id;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
const flow = () => db.flows.find(f => f.id === db.current);
const node = id => flow().nodes.find(n => n.id === id);

function mk(type, x, y) {
  const data = {
    trigger: { keywords: 'hola, empezar' },
    message: { text: 'Hola {{nombre}} 👋' },
    buttons: { text: '¿Qué necesitas?', buttons: ['Precios', 'Soporte'] },
    question: { text: '¿Cómo te llamas?', variable: 'nombre' },
    condition: { variable: 'nombre', op: 'contains', value: '' },
    end: {}
  }[type];
  return { id: uid(), type, x, y, data: JSON.parse(JSON.stringify(data)), next: {} };
}
function sampleFlow() {
  const t = mk('trigger', 40, 40), q = mk('question', 40, 190), m = mk('message', 330, 190), b = mk('buttons', 330, 350);
  const p = mk('message', 620, 330), s = mk('message', 620, 480);
  p.data.text = 'Nuestros planes empiezan en 0 €. Gracias, {{nombre}}.';
  s.data.text = 'Un agente te escribirá pronto, {{nombre}}.';
  t.next.out = q.id; q.next.out = m.id; m.next.out = b.id; b.next[0] = p.id; b.next[1] = s.id;
  return { id: uid(), name: 'Bienvenida', nodes: [t, q, m, b, p, s] };
}

// ---------- Render ----------
const nodesEl = $('#nodes'), wires = $('#wires'), board = $('#board');
let selected = null;
const TITLES = { trigger: '⚡ Disparador', message: '✉️ Mensaje', buttons: '🔘 Botones', question: '❓ Pregunta', condition: '🔀 Condición', end: '⏹ Fin' };

function outs(n) {
  if (n.type === 'buttons') return n.data.buttons.map((b, i) => i);
  if (n.type === 'condition') return ['true', 'false'];
  if (n.type === 'end') return [];
  return ['out'];
}
function el(tag, props = {}, kids = []) {
  const e = Object.assign(document.createElement(tag), props);
  kids.forEach(k => e.append(k));
  return e;
}
function field(n, key, tag = 'input', ph = '') {
  const e = el(tag, { value: n.data[key], placeholder: ph });
  e.addEventListener('input', () => { n.data[key] = e.value; save(); });
  return e;
}
function render() {
  nodesEl.innerHTML = '';
  const f = flow();
  $('#flowSelect').innerHTML = '';
  db.flows.forEach(x => $('#flowSelect').append(el('option', { value: x.id, textContent: x.name, selected: x.id === f.id })));
  f.nodes.forEach(n => nodesEl.append(renderNode(n)));
  drawWires();
}
function renderNode(n) {
  const d = el('div', { className: 'node' + (selected === n.id ? ' sel' : '') });
  d.style.left = n.x + 'px'; d.style.top = n.y + 'px'; d.dataset.id = n.id;
  const hd = el('div', { className: 'hd', textContent: TITLES[n.type] });
  hd.addEventListener('pointerdown', e => dragNode(e, n, d));
  const bd = el('div', { className: 'bd' });
  if (n.type !== 'trigger') d.append(el('div', { className: 'in' }));
  if (n.type === 'trigger') bd.append(el('span', { className: 'lbl', textContent: 'Palabras clave (coma). Vacío = cualquier mensaje' }), field(n, 'keywords'));
  if (n.type === 'message') bd.append(field(n, 'text', 'textarea'));
  if (n.type === 'question') bd.append(field(n, 'text', 'textarea'), el('span', { className: 'lbl', textContent: 'Guardar respuesta en variable' }), field(n, 'variable'));
  if (n.type === 'condition') {
    const op = el('select', {}, [['contains', 'contiene'], ['equals', 'es igual a'], ['empty', 'está vacía']].map(([v, t]) => el('option', { value: v, textContent: t, selected: n.data.op === v })));
    op.addEventListener('change', () => { n.data.op = op.value; save(); });
    bd.append(el('span', { className: 'lbl', textContent: 'Si la variable…' }), field(n, 'variable'), op, field(n, 'value', 'input', 'valor'));
  }
  if (n.type === 'buttons') {
    bd.append(field(n, 'text', 'textarea'));
    n.data.buttons.forEach((label, i) => {
      const inp = el('input', { value: label });
      inp.addEventListener('input', () => { n.data.buttons[i] = inp.value; save(); });
      const rm = el('button', { textContent: '×', title: 'Quitar' });
      rm.onclick = () => { n.data.buttons.splice(i, 1); reindexButtons(n, i); save(); render(); };
      bd.append(el('div', { className: 'row' }, [inp, rm, port(n, i)]));
    });
    const add = el('button', { textContent: '+ Botón' });
    add.onclick = () => { if (n.data.buttons.length < 6) { n.data.buttons.push('Opción'); save(); render(); } };
    bd.append(add);
  }
  if (n.type === 'condition') ['true', 'false'].forEach(k => bd.append(el('div', { className: 'row' }, [el('span', { className: 'lbl', textContent: k === 'true' ? 'Sí →' : 'No →' }), port(n, k)])));
  d.append(hd, bd);
  if (n.type === 'trigger' || n.type === 'message' || n.type === 'question') d.append(port(n, 'out', true));
  d.addEventListener('pointerdown', () => { if (selected !== n.id) { selected = n.id; document.querySelectorAll('.node.sel').forEach(x => x.classList.remove('sel')); d.classList.add('sel'); } });
  return d;
}
function reindexButtons(n, removed) {
  const nx = {};
  Object.entries(n.next).forEach(([k, v]) => { const i = +k; if (i < removed) nx[i] = v; else if (i > removed) nx[i - 1] = v; });
  n.next = nx;
}
function port(n, key, header) {
  const p = el('div', { className: 'out' + (header ? ' hd-out' : '') });
  p.dataset.port = key;
  p.addEventListener('pointerdown', e => startWire(e, n, key));
  return p;
}

// ---------- Conexiones ----------
function portPos(nid, key) {
  const d = nodesEl.querySelector(`[data-id="${nid}"]`);
  const p = d && [...d.querySelectorAll('.out')].find(o => o.dataset.port === String(key));
  if (!p) return null;
  const w = $('#world').getBoundingClientRect(), r = p.getBoundingClientRect();
  return { x: r.left - w.left + 6, y: r.top - w.top + 6 };
}
const curve = (a, b) => `M${a.x},${a.y} C${a.x + 80},${a.y} ${b.x - 80},${b.y} ${b.x},${b.y}`;
function drawWires() {
  wires.innerHTML = '';
  flow().nodes.forEach(n => Object.entries(n.next).forEach(([k, tid]) => {
    const a = portPos(n.id, k), t = nodesEl.querySelector(`[data-id="${tid}"]`);
    if (!a || !t) return;
    const b = { x: t.offsetLeft - 1, y: t.offsetTop + 20 };
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', curve(a, b));
    p.addEventListener('dblclick', () => { delete n.next[k]; save(); drawWires(); });
    wires.append(p);
  }));
}
function startWire(e, n, key) {
  e.preventDefault(); e.stopPropagation();
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tmp.setAttribute('class', 'tmp'); wires.append(tmp);
  const a = portPos(n.id, key), w = $('#world').getBoundingClientRect();
  const move = ev => tmp.setAttribute('d', curve(a, { x: ev.clientX - w.left, y: ev.clientY - w.top }));
  const up = ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.node');
    if (target && target.dataset.id !== n.id && node(target.dataset.id).type !== 'trigger') n.next[key] = target.dataset.id;
    save(); drawWires();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}
function dragNode(e, n, d) {
  e.preventDefault();
  const sx = e.clientX - n.x, sy = e.clientY - n.y;
  const move = ev => { n.x = Math.max(0, ev.clientX - sx); n.y = Math.max(0, ev.clientY - sy); d.style.left = n.x + 'px'; d.style.top = n.y + 'px'; drawWires(); };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); save(); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

// ---------- Barra superior / paleta ----------
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
  const n = mk(b.dataset.add, board.scrollLeft + 60 + Math.random() * 80, board.scrollTop + 60 + Math.random() * 80);
  flow().nodes.push(n); selected = n.id; save(); render();
});
addEventListener('keydown', e => {
  if (e.key !== 'Delete' || !selected || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const n = node(selected); if (!n || n.type === 'trigger') return;
  flow().nodes = flow().nodes.filter(x => x !== n);
  flow().nodes.forEach(x => Object.keys(x.next).forEach(k => { if (x.next[k] === n.id) delete x.next[k]; }));
  selected = null; save(); render();
});
$('#flowSelect').onchange = e => { db.current = e.target.value; selected = null; save(); render(); resetChat(); };
$('#newFlow').onclick = () => {
  const name = prompt('Nombre de la automatización', 'Nueva automatización'); if (!name) return;
  const t = mk('trigger', 40, 40);
  db.flows.push({ id: uid(), name, nodes: [t] }); db.current = db.flows.at(-1).id; save(); render(); resetChat();
};
$('#renameFlow').onclick = () => { const n = prompt('Nuevo nombre', flow().name); if (n) { flow().name = n; save(); render(); } };
$('#delFlow').onclick = () => {
  if (!confirm(`¿Eliminar "${flow().name}"?`)) return;
  db.flows = db.flows.filter(f => f !== flow());
  if (!db.flows.length) db.flows.push(sampleFlow());
  db.current = db.flows[0].id; save(); render(); resetChat();
};
$('#exportBtn').onclick = () => {
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })), download: 'flowchat.json' });
  a.click(); URL.revokeObjectURL(a.href);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(j.flows) || !j.flows.every(f => f.id && Array.isArray(f.nodes))) throw 0;
    db = j; if (!db.flows.find(f => f.id === db.current)) db.current = db.flows[0].id;
    save(); render(); resetChat();
  } catch { alert('Archivo no válido'); }
  e.target.value = '';
};

// ---------- Simulador ----------
let vars, active, waiting; // waiting: {node} cuando espera respuesta
const log = $('#log'), quick = $('#quick');
const interp = s => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
function say(text, who) { log.append(el('div', { className: 'b ' + who, textContent: text })); log.scrollTop = log.scrollHeight; }
function showVars() { const e = Object.entries(vars); $('#vars').textContent = e.length ? 'Variables: ' + e.map(([k, v]) => `${k}=${v}`).join(' · ') : 'Sin variables aún'; }
function resetChat() { vars = {}; active = false; waiting = null; log.innerHTML = ''; quick.innerHTML = ''; showVars(); say('Escribe un mensaje para activar la automatización (p. ej. "hola").', 'bot'); }
function triggered(text) {
  const t = flow().nodes.find(n => n.type === 'trigger'); if (!t) return null;
  const kws = t.data.keywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !kws.length || kws.some(k => text.toLowerCase().includes(k)) ? t : null;
}
function run(from, key) {
  let id = from.next[key], steps = 0;
  quick.innerHTML = '';
  while (id && steps++ < 50) {
    const n = node(id); if (!n) break;
    if (n.type === 'message') { say(interp(n.data.text), 'bot'); id = n.next.out; }
    else if (n.type === 'question') { say(interp(n.data.text), 'bot'); waiting = n; return; }
    else if (n.type === 'buttons') {
      say(interp(n.data.text), 'bot'); waiting = n;
      n.data.buttons.forEach((b, i) => quick.append(el('button', { textContent: b, onclick: () => choose(n, i) })));
      return;
    }
    else if (n.type === 'condition') {
      const v = String(vars[n.data.variable] ?? ''), c = n.data.value;
      const ok = n.data.op === 'empty' ? !v : n.data.op === 'equals' ? v.toLowerCase() === c.toLowerCase() : v.toLowerCase().includes(c.toLowerCase());
      id = n.next[ok ? 'true' : 'false'];
    } else break;
  }
  active = false; waiting = null;
}
function choose(n, i) { say(n.data.buttons[i], 'me'); waiting = null; run(n, i); }
$('#chatForm').onsubmit = e => {
  e.preventDefault();
  const inp = $('#chatInput'), text = inp.value.trim(); if (!text) return; inp.value = '';
  if (waiting?.type === 'buttons') {
    const i = waiting.data.buttons.findIndex(b => b.toLowerCase() === text.toLowerCase());
    if (i >= 0) return choose(waiting, i);
    say(text, 'me'); say('Elige una de las opciones.', 'bot'); return;
  }
  say(text, 'me');
  if (waiting?.type === 'question') {
    const q = waiting; waiting = null; vars[q.data.variable || 'respuesta'] = text; showVars(); run(q, 'out'); showVars(); return;
  }
  const t = triggered(text);
  if (t) { active = true; run(t, 'out'); showVars(); }
  else say('No hay ninguna automatización para ese mensaje.', 'bot');
};
$('#resetChat').onclick = resetChat;

addEventListener('resize', drawWires);
render(); resetChat();
