'use strict';
// Tela de captura: mostra a foto congelada do monitor, deixa selecionar uma área e anotar por cima.
// Coordenadas das anotações ficam em pixels da janela; R converte para os pixels reais da imagem.

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const bar = document.getElementById('bar');
const sizeLbl = document.getElementById('size');
const hint = document.getElementById('hint');
const textInput = document.getElementById('textInput');

const COLORS = ['#ff3b5c', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#111111'];
const SIZES = [2, 4, 8];
const KEYS = { v: 'move', r: 'rect', e: 'ellipse', a: 'arrow', l: 'line', p: 'pen', h: 'marker', t: 'text', n: 'step', b: 'blur' };
const FONT = '"Segoe UI", sans-serif';

let img = null, W = 0, H = 0, DPR = 1, R = 1;
let sel = null;          // área selecionada {x, y, w, h}
let phase = 'idle';      // idle → selecting → edit
let tool = 'rect', color = COLORS[0], size = 4;
let shapes = [], draft = null, drag = null, textPos = null, busy = false, raf = 0;

// ---------- início ----------
api.onInit(async data => {
  if (Object.values(KEYS).includes(data.tool)) tool = data.tool;
  if (COLORS.includes(data.color)) color = data.color;
  if (SIZES.includes(data.size)) size = data.size;
  buildBar();
  img = await createImageBitmap(new Blob([data.image], { type: data.mime }));
  fit();
  render();
  hint.classList.remove('hidden');
  api.ready();
});

function fit() {
  W = window.innerWidth; H = window.innerHeight; DPR = window.devicePixelRatio || 1;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  if (img) R = img.width / W;
}
window.addEventListener('resize', () => { fit(); schedule(); placeBar(); });

// ---------- utilidades ----------
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const norm = r => ({ x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) });
const box = s => ({ x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) });
const inside = (s, p) => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h;
const fontSize = s => 14 + s.size * 3;
function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

function handles(s) {
  const mx = s.x + s.w / 2, my = s.y + s.h / 2, r = s.x + s.w, b = s.y + s.h;
  return [{ id: 'nw', x: s.x, y: s.y }, { id: 'n', x: mx, y: s.y }, { id: 'ne', x: r, y: s.y }, { id: 'e', x: r, y: my },
    { id: 'se', x: r, y: b }, { id: 's', x: mx, y: b }, { id: 'sw', x: s.x, y: b }, { id: 'w', x: s.x, y: my }];
}
const hitHandle = (s, p) => handles(s).find(h => Math.abs(h.x - p.x) <= 7 && Math.abs(h.y - p.y) <= 7);
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

// ---------- desenho ----------
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!img) return;
  ctx.drawImage(img, 0, 0, W, H);
  ctx.fillStyle = 'rgba(14, 6, 8, 0.55)';
  const s = sel && norm(sel);
  if (!s || s.w < 1 || s.h < 1) { ctx.fillRect(0, 0, W, H); sizeLbl.classList.add('hidden'); return; }
  ctx.fillRect(0, 0, W, s.y);
  ctx.fillRect(0, s.y + s.h, W, H - s.y - s.h);
  ctx.fillRect(0, s.y, s.x, s.h);
  ctx.fillRect(s.x + s.w, s.y, W - s.x - s.w, s.h);

  ctx.save();
  ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip();
  for (const sh of shapes) drawShape(ctx, sh);
  if (draft) drawShape(ctx, draft);
  ctx.restore();

  ctx.lineWidth = 1.5; ctx.strokeStyle = '#f43f5e';
  ctx.strokeRect(s.x - 0.75, s.y - 0.75, s.w + 1.5, s.h + 1.5);
  if (phase === 'edit' && tool === 'move') {
    for (const h of handles(s)) {
      ctx.beginPath(); ctx.rect(h.x - 4, h.y - 4, 8, 8);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#f43f5e'; ctx.stroke();
    }
  }
  showSize(s);
}

function showSize(s) {
  sizeLbl.textContent = `${Math.round(s.w * R)} × ${Math.round(s.h * R)}`;
  sizeLbl.classList.remove('hidden');
  const y = s.y >= 30 ? s.y - 28 : s.y + 6;
  sizeLbl.style.left = clamp(s.x, 4, W - sizeLbl.offsetWidth - 4) + 'px';
  sizeLbl.style.top = y + 'px';
}

function drawShape(c, s) {
  c.save();
  c.strokeStyle = c.fillStyle = s.color;
  c.lineWidth = s.size; c.lineCap = 'round'; c.lineJoin = 'round';
  switch (s.type) {
    case 'rect': { const b = box(s); c.strokeRect(b.x, b.y, b.w, b.h); break; }
    case 'ellipse': {
      const b = box(s);
      c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); c.stroke(); break;
    }
    case 'line': c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke(); break;
    case 'arrow': drawArrow(c, s); break;
    case 'pen': case 'marker': {
      if (s.type === 'marker') { c.globalAlpha = 0.38; c.lineWidth = s.size * 4 + 6; }
      c.beginPath();
      s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.01, s.pts[0][1]);
      c.stroke(); break;
    }
    case 'blur': drawBlur(c, s); break;
    case 'text': {
      const fs = fontSize(s);
      c.font = `600 ${fs}px ${FONT}`; c.textBaseline = 'top';
      s.text.split('\n').forEach((line, i) => c.fillText(line, s.x, s.y + i * fs * 1.25));
      break;
    }
    case 'step': {
      const r = 11 + s.size * 1.5;
      c.beginPath(); c.arc(s.x, s.y, r, 0, Math.PI * 2); c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke();
      c.fillStyle = isLight(s.color) ? '#111' : '#fff';
      c.font = `700 ${Math.round(r * 1.1)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(s.n), s.x, s.y + 1);
      break;
    }
  }
  c.restore();
}

function drawArrow(c, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const head = Math.min(len * 0.6, 10 + s.size * 3.2), ang = Math.atan2(dy, dx), spread = Math.PI / 7;
  c.beginPath(); c.moveTo(s.x1, s.y1);
  c.lineTo(s.x2 - Math.cos(ang) * head * 0.8, s.y2 - Math.sin(ang) * head * 0.8); c.stroke();
  c.beginPath(); c.moveTo(s.x2, s.y2);
  c.lineTo(s.x2 - head * Math.cos(ang - spread), s.y2 - head * Math.sin(ang - spread));
  c.lineTo(s.x2 - head * Math.cos(ang + spread), s.y2 - head * Math.sin(ang + spread));
  c.closePath(); c.fill();
}

// Desfoque em blocos: reduz a área da foto original e amplia sem suavizar.
function drawBlur(c, s) {
  const b = box(s);
  if (b.w < 1 || b.h < 1) return;
  let pix = s.pix;
  if (!pix) {
    const block = 8 + s.size * 1.5;
    pix = document.createElement('canvas');
    pix.width = Math.max(1, Math.round(b.w / block)); pix.height = Math.max(1, Math.round(b.h / block));
    pix.getContext('2d').drawImage(img, b.x * R, b.y * R, b.w * R, b.h * R, 0, 0, pix.width, pix.height);
    if (s !== draft) s.pix = pix;
  }
  c.imageSmoothingEnabled = false;
  c.drawImage(pix, b.x, b.y, b.w, b.h);
}

// ---------- mouse ----------
const pt = e => ({ x: e.clientX, y: e.clientY });

cv.addEventListener('mousedown', e => {
  if (e.button !== 0 || !img || busy) return;
  const p = pt(e);
  if (textPos) { commitText(); return; }
  hint.classList.add('hidden');
  if (phase !== 'edit') return startSelecting(p);

  const s = norm(sel);
  if (tool === 'move') {
    const h = hitHandle(s, p);
    if (h) drag = { kind: 'resize', h: h.id, o: s, p };
    else if (inside(s, p)) drag = { kind: 'move', o: s, p };
    else if (!shapes.length) startSelecting(p); // com anotações, não descarta a seleção sem querer
    return;
  }
  if (!inside(s, p)) return;
  if (tool === 'text') return openText(p);
  if (tool === 'step') {
    shapes.push({ type: 'step', x: p.x, y: p.y, color, size, n: shapes.filter(x => x.type === 'step').length + 1 });
    return schedule();
  }
  draft = tool === 'pen' || tool === 'marker'
    ? { type: tool, color, size, pts: [[p.x, p.y]] }
    : { type: tool, color, size, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
});

cv.addEventListener('dblclick', e => {
  if (phase === 'edit' && tool === 'move' && inside(norm(sel), pt(e))) finish('copy');
});

function startSelecting(p) {
  phase = 'selecting';
  sel = { x: p.x, y: p.y, w: 0, h: 0 };
  drag = { kind: 'new', p };
  bar.classList.add('hidden');
  schedule();
}

window.addEventListener('mousemove', e => {
  const p = pt(e);
  if (drag && drag.kind === 'new') {
    sel.w = clamp(p.x, 0, W) - sel.x; sel.h = clamp(p.y, 0, H) - sel.y;
    return schedule();
  }
  if (drag && drag.kind === 'move') {
    const o = drag.o;
    sel = { x: clamp(o.x + p.x - drag.p.x, 0, W - o.w), y: clamp(o.y + p.y - drag.p.y, 0, H - o.h), w: o.w, h: o.h };
    placeBar(); return schedule();
  }
  if (drag && drag.kind === 'resize') {
    sel = resized(drag.o, drag.h, p.x - drag.p.x, p.y - drag.p.y);
    placeBar(); return schedule();
  }
  if (draft) {
    const s = norm(sel), q = { x: clamp(p.x, s.x, s.x + s.w), y: clamp(p.y, s.y, s.y + s.h) };
    if (draft.pts) draft.pts.push([q.x, q.y]);
    else { draft.x2 = q.x; draft.y2 = q.y; if (e.shiftKey) constrain(draft); }
    return schedule();
  }
  updateCursor(p);
});

window.addEventListener('mouseup', e => {
  if (e.button !== 0) return;
  if (drag && drag.kind === 'new') {
    let s = norm(sel);
    if (s.w < 4 && s.h < 4) s = { x: 0, y: 0, w: W, h: H }; // clique simples = tela inteira
    sel = s; drag = null; phase = 'edit';
    showBar(); return schedule();
  }
  if (drag) { sel = norm(sel); drag = null; return schedule(); }
  if (draft) {
    const keep = draft.pts || Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 3;
    if (keep) shapes.push(draft);
    draft = null; schedule();
  }
});

function resized(o, h, dx, dy) {
  let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
  if (h.includes('w')) x1 = clamp(x1 + dx, 0, W);
  if (h.includes('e')) x2 = clamp(x2 + dx, 0, W);
  if (h.includes('n')) y1 = clamp(y1 + dy, 0, H);
  if (h.includes('s')) y2 = clamp(y2 + dy, 0, H);
  return norm({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
}

// Shift: quadrado/círculo perfeito, ou linha/seta em ângulos de 45°.
function constrain(d) {
  const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
  if (d.type === 'line' || d.type === 'arrow') {
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
    d.x2 = d.x1 + Math.cos(ang) * len; d.y2 = d.y1 + Math.sin(ang) * len;
  } else {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    d.x2 = d.x1 + Math.sign(dx || 1) * m; d.y2 = d.y1 + Math.sign(dy || 1) * m;
  }
}

function updateCursor(p) {
  let c = 'crosshair';
  if (phase === 'edit') {
    const s = norm(sel);
    if (tool === 'move') {
      const h = hitHandle(s, p);
      c = h ? HANDLE_CURSOR[h.id] : inside(s, p) ? 'move' : shapes.length ? 'default' : 'crosshair';
    } else if (!inside(s, p)) c = 'default';
    else if (tool === 'text') c = 'text';
  }
  cv.style.cursor = c;
}

// ---------- texto ----------
function openText(p) {
  textPos = p;
  const fs = fontSize({ size });
  Object.assign(textInput.style, { left: p.x + 'px', top: p.y + 'px', color, fontSize: fs + 'px' });
  textInput.value = '';
  textInput.classList.remove('hidden');
  autoSize();
  setTimeout(() => textInput.focus(), 0);
}

function autoSize() {
  textInput.style.width = '0'; textInput.style.height = '0';
  textInput.style.width = Math.max(40, textInput.scrollWidth + 6) + 'px';
  textInput.style.height = textInput.scrollHeight + 'px';
}

function commitText() {
  if (!textPos) return;
  const p = textPos, t = textInput.value.replace(/\s+$/, '');
  closeText();
  if (t) shapes.push({ type: 'text', x: p.x, y: p.y, text: t, color, size });
  schedule();
}

function closeText() {
  textPos = null;
  textInput.classList.add('hidden');
  textInput.blur();
}

textInput.addEventListener('input', autoSize);
textInput.addEventListener('blur', () => commitText());
textInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') { closeText(); schedule(); }
  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
});

// ---------- barra de ferramentas ----------
function buildBar() {
  const colors = document.getElementById('colors');
  colors.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.dataset.color = c; b.title = c;
    b.onclick = () => { color = c; refreshBar(); };
    colors.appendChild(b);
  }
  const sizes = document.getElementById('sizes');
  sizes.innerHTML = '';
  SIZES.forEach((sz, i) => {
    const b = document.createElement('button');
    b.dataset.size = sz; b.title = ['Fino', 'Médio', 'Grosso'][i];
    b.innerHTML = `<span class="dot" style="width:${4 + i * 4}px;height:${4 + i * 4}px"></span>`;
    b.onclick = () => { size = sz; refreshBar(); };
    sizes.appendChild(b);
  });
  bar.querySelectorAll('[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
  document.getElementById('btnUndo').onclick = undo;
  document.getElementById('btnCancel').onclick = () => api.cancel();
  document.getElementById('btnSave').onclick = () => finish('save');
  document.getElementById('btnCopy').onclick = () => finish('copy');
  refreshBar();
}

function refreshBar() {
  bar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
  bar.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === color));
  bar.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('on', Number(b.dataset.size) === size));
}

function setTool(t) {
  commitText();
  tool = t; refreshBar(); schedule();
}

function showBar() { bar.classList.remove('hidden'); placeBar(); }

function placeBar() {
  if (phase !== 'edit') return;
  const s = norm(sel), bw = bar.offsetWidth, bh = bar.offsetHeight, m = 10;
  let y = s.y + s.h + m;
  if (y + bh > H - m) y = s.y - bh - m;
  if (y < m) y = s.y + s.h - bh - m;
  bar.style.left = clamp(s.x + s.w - bw, m, W - bw - m) + 'px';
  bar.style.top = clamp(y, m, H - bh - m) + 'px';
}

// ---------- ações ----------
function undo() {
  if (textPos) return closeText();
  if (shapes.length) { shapes.pop(); return schedule(); }
  // Sem anotações: volta para escolher outra área.
  sel = null; phase = 'idle';
  bar.classList.add('hidden');
  schedule();
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (draft || drag) {
      draft = null;
      if (drag && drag.kind === 'new') { sel = null; phase = 'idle'; }
      drag = null; return schedule();
    }
    return api.cancel();
  }
  if (phase !== 'edit') return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === 'z') { e.preventDefault(); return undo(); }
  if ((e.ctrlKey && k === 'c') || k === 'enter') { e.preventDefault(); return finish('copy'); }
  if (e.ctrlKey && k === 's') { e.preventDefault(); return finish('save'); }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && KEYS[k]) setTool(KEYS[k]);
});

async function exportPng() {
  const s = norm(sel);
  const ow = Math.max(1, Math.round(s.w * R)), oh = Math.max(1, Math.round(s.h * R));
  const out = new OffscreenCanvas(ow, oh), c = out.getContext('2d');
  c.drawImage(img, s.x * R, s.y * R, s.w * R, s.h * R, 0, 0, ow, oh);
  c.setTransform(R, 0, 0, R, -s.x * R, -s.y * R);
  for (const sh of shapes) drawShape(c, sh);
  const blob = await out.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

async function finish(action) {
  if (busy || phase !== 'edit') return;
  commitText();
  busy = true;
  try {
    await api.done(action, await exportPng(), { tool, color, size });
  } catch (err) {
    busy = false;
    console.error(err);
  }
}
