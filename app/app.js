/* LithoBlast3D móvil — interfaz. El cálculo lo hace el motor Python (motor.js, Pyodide). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const f2 = (v, d = 2) => (v == null || !isFinite(v)) ? "—" : Number(v).toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------------------------------------------ motor (Web Worker) */
const motor = (() => {
  let w = null, n = 0;
  const pend = new Map();
  function arrancar() {
    w = new Worker(window.B3D_MOTOR || "motor.js");
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.tipo === "progreso") { $("#carga-txt").textContent = m.texto; return; }
      const p = pend.get(m.id); if (!p) return;
      pend.delete(m.id);
      try {
        const r = JSON.parse(m.resultado);
        r.ok ? p.ok(r.datos) : p.mal(new Error(r.error || "Error"));
      } catch (e) { p.mal(e); }
    };
    w.onerror = (e) => { for (const p of pend.values()) p.mal(new Error(e.message || "Error del motor")); pend.clear(); };
  }
  return {
    llamar(fn, arg, texto = "Calculando…") {
      if (!w) arrancar();
      cargando(true, texto);
      const id = ++n;
      return new Promise((ok, mal) => {
        pend.set(id, { ok, mal });
        w.postMessage({ id, fn, arg: arg == null ? null : JSON.stringify(arg) });
      }).finally(() => { if (!pend.size) cargando(false); });
    },
  };
})();

function cargando(on, texto) {
  $("#carga").classList.toggle("on", on);
  if (texto) $("#carga-txt").textContent = texto;
}
let tTost = 0;
function tostada(t, ms = 2600) {
  const e = $("#tostada"); e.textContent = t; e.classList.add("on");
  clearTimeout(tTost); tTost = setTimeout(() => e.classList.remove("on"), ms);
}
function msg(caja, texto, tipo = "error") { $(caja).innerHTML = texto ? `<div class="${tipo}">${tipo === "error" ? "✖" : "⚠"} ${esc(texto)}</div>` : ""; }

async function compartirArchivo(blob, nombre) {
  const file = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nombre }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  tostada(`Guardado: ${nombre}`);
}
async function svgAPng(svg, nombre) {
  const r = svg.getBoundingClientRect();
  const k = 2.5, W = Math.round(r.width * k), H = Math.round(r.height * k);
  const copia = svg.cloneNode(true);
  copia.setAttribute("width", W); copia.setAttribute("height", H);
  copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = url; });
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"); g.fillStyle = "#101317"; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(url);
  c.toBlob((b) => compartirArchivo(b, nombre), "image/png");
}

/* ------------------------------------------------------------------ formularios */
function leerForm(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") d[el.name] = el.checked;
    else if (el.type === "number") d[el.name] = el.value === "" ? null : Number(el.value);
    else d[el.name] = el.value;
  }
  return d;
}
function guardarForm(form, clave) {
  try { localStorage.setItem("b3d_" + clave, JSON.stringify(leerForm(form))); } catch (e) { /* sin almacenamiento */ }
}
function restaurarForm(form, clave) {
  let d = null;
  try { d = JSON.parse(localStorage.getItem("b3d_" + clave) || "null"); } catch (e) { d = null; }
  if (!d) return;
  for (const el of form.elements) {
    if (!el.name || !(el.name in d) || d[el.name] == null) continue;
    if (el.type === "checkbox") el.checked = !!d[el.name]; else el.value = d[el.name];
  }
}
function llenarListas(raiz) {
  for (const s of $$("select[data-lista]", raiz)) {
    const lista = INFO[s.dataset.lista] || [];
    const actual = s.value;
    const ops = Array.isArray(lista) ? lista : Object.entries(lista);
    s.innerHTML = (s.dataset.vacio ? `<option value="">${esc(s.dataset.vacio)}</option>` : "") +
      ops.map((x, i) => s.dataset.lista === "explosivos" ? `<option value="${i}">${esc(x.nombre)}${x.ficha ? " · ficha FAMESA" : ""}</option>`
        : Array.isArray(x) ? `<option value="${esc(x[0])}">${esc(x[1])}</option>`
        : (x && typeof x === "object") ? `<option value="${esc(x.clave)}">${esc(x.nombre)}</option>`
        : `<option>${esc(x)}</option>`).join("") +
      (s.dataset.lista === "labores" && s.closest("#f-malla") ? `<option value="tajo_abierto">Tajo abierto (banco sobre la topografía) →</option>` : "");
    if (actual !== "" && [...s.options].some((o) => o.value === actual)) s.value = actual;
  }
}
/* constructor de formularios de las herramientas */
function campos(lista) {
  return `<div class="campos">${lista.map((c) => {
    if (c.t === "sel") return `<label class="c ${c.ancho ? "ancho" : ""}">${c.l}<select name="${c.n}">${c.op.map((o) =>
      `<option ${o === c.v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    if (c.t === "chk") return `<label class="chk ancho"><input type="checkbox" name="${c.n}" ${c.v ? "checked" : ""}> ${c.l}</label>`;
    if (c.t === "txt") return `<label class="c ancho">${c.l}<textarea name="${c.n}" rows="${c.filas || 5}">${esc(c.v || "")}</textarea></label>`;
    return `<label class="c ${c.ancho ? "ancho" : ""}">${c.l}<input name="${c.n}" type="number" step="${c.paso ?? "any"}" value="${c.v}" inputmode="decimal"></label>`;
  }).join("")}</div>`;
}
const kpis = (l) => `<div class="kpis">${l.map(([t, v, n]) => `<div class="kpi"><small>${t}</small><b>${v}</b>${n ? `<i>${n}</i>` : ""}</div>`).join("")}</div>`;
const tabla = (cab, filas) => `<div class="tabla"><table><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr>${filas.map((f) =>
  `<tr>${f.map((v) => `<td>${typeof v === "number" ? f2(v, Math.abs(v) >= 100 ? 1 : 2) : esc(v)}</td>`).join("")}</tr>`).join("")}</table></div>`;

/* ------------------------------------------------------------------ hoja de detalle */
function abrirHoja(titulo, html) {
  $("#hoja-tit").textContent = titulo;
  $("#hoja-cuerpo").innerHTML = html;
  $("#hoja-cuerpo").scrollTop = 0;
  $("#hoja").classList.add("on");
  history.pushState({ hoja: 1 }, "");
  return $("#hoja-cuerpo");
}
function cerrarHoja() { if (visor3d) { visor3d.cerrar(); visor3d = null; } $("#hoja").classList.remove("on"); }
$("#hoja-x").onclick = () => history.back();
window.addEventListener("popstate", () => { if ($("#hoja").classList.contains("on")) cerrarHoja(); });

/* ------------------------------------------------------------------ gráficos (canvas) */
function grafico(canvas, cfg) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); g.scale(dpr, dpr);
  g.fillStyle = "#1b1f24"; g.fillRect(0, 0, W, H);
  const m = { l: 52, r: 12, t: cfg.titulo ? 26 : 12, b: 38 };
  const todos = cfg.series.flatMap((s) => s.x.map((x, i) => [x, s.y[i]])).filter(([x, y]) => isFinite(x) && isFinite(y) && (!cfg.logx || x > 0));
  if (!todos.length) return;
  let x0 = cfg.xmin ?? Math.min(...todos.map((p) => p[0])), x1 = cfg.xmax ?? Math.max(...todos.map((p) => p[0]));
  let y0 = cfg.ymin ?? Math.min(...todos.map((p) => p[1])), y1 = cfg.ymax ?? Math.max(...todos.map((p) => p[1]));
  if (cfg.cero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 === y0) { y1 += 1; y0 -= 1; }
  if (!cfg.ymax && !cfg.ymin && !cfg.igual) { const d = (y1 - y0) * 0.06; y0 -= cfg.cero && y0 === 0 ? 0 : d; y1 += d; }
  const lx = (v) => cfg.logx ? Math.log10(v) : v;
  let X0 = lx(x0), X1 = lx(x1);
  if (cfg.igual) { // misma escala en x e y
    const ax = (W - m.l - m.r) / (X1 - X0), ay = (H - m.t - m.b) / (y1 - y0), k = Math.min(ax, ay);
    const cx = (X0 + X1) / 2, cy = (y0 + y1) / 2;
    X0 = cx - (W - m.l - m.r) / k / 2; X1 = cx + (W - m.l - m.r) / k / 2;
    y0 = cy - (H - m.t - m.b) / k / 2; y1 = cy + (H - m.t - m.b) / k / 2;
  }
  const px = (v) => m.l + (lx(v) - X0) / (X1 - X0) * (W - m.l - m.r);
  const py = (v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  g.font = "11px system-ui"; g.strokeStyle = "#2a3038"; g.fillStyle = "#8f99a5"; g.lineWidth = 1;
  // marcas
  const marcas = (a, b, n) => { const p = Math.pow(10, Math.floor(Math.log10((b - a) / n))); const st = [1, 2, 5, 10].map((k) => k * p).find((s) => (b - a) / s <= n) || p * 10; const r = []; for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) r.push(+v.toFixed(10)); return r; };
  const mx = cfg.logx ? (() => { const r = []; for (let e = Math.floor(X0); e <= Math.ceil(X1); e++) for (const k of [1, 2, 5]) { const v = k * 10 ** e; if (Math.log10(v) >= X0 - 1e-9 && Math.log10(v) <= X1 + 1e-9) r.push(v); } return r; })() : marcas(X0, X1, Math.max(3, W / 80));
  g.textAlign = "center";
  for (const v of mx) { const x = px(v); g.beginPath(); g.moveTo(x, m.t); g.lineTo(x, H - m.b); g.stroke(); g.fillText(fmt(v), x, H - m.b + 14); }
  g.textAlign = "right";
  for (const v of marcas(y0, y1, Math.max(3, H / 55))) { const y = py(v); g.beginPath(); g.moveTo(m.l, y); g.lineTo(W - m.r, y); g.stroke(); g.fillText(fmt(v), m.l - 5, y + 4); }
  g.textAlign = "center"; if (cfg.xlab) g.fillText(cfg.xlab, (m.l + W - m.r) / 2, H - 6);
  if (cfg.ylab) { g.save(); g.translate(12, (m.t + H - m.b) / 2); g.rotate(-Math.PI / 2); g.fillText(cfg.ylab, 0, 0); g.restore(); }
  if (cfg.titulo) { g.fillStyle = "#e8ebef"; g.font = "600 12.5px system-ui"; g.fillText(cfg.titulo, W / 2, 16); }
  g.save(); g.beginPath(); g.rect(m.l, m.t, W - m.l - m.r, H - m.t - m.b); g.clip();
  for (const v of cfg.vlineas || []) { g.strokeStyle = v.color || "#e6b84a"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(px(v.x), m.t); g.lineTo(px(v.x), H - m.b); g.stroke(); g.setLineDash([]); if (v.texto) { g.fillStyle = v.color || "#e6b84a"; g.textAlign = "left"; g.font = "11px system-ui"; g.fillText(v.texto, px(v.x) + 4, m.t + 12); } }
  for (const v of cfg.hlineas || []) { g.strokeStyle = v.color || "#e6b84a"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(m.l, py(v.y)); g.lineTo(W - m.r, py(v.y)); g.stroke(); g.setLineDash([]); }
  for (const s of cfg.series) {
    g.strokeStyle = s.color || "#2ec4b6"; g.fillStyle = s.color || "#2ec4b6"; g.lineWidth = s.ancho || 2;
    if (s.puntos) { s.x.forEach((x, i) => { g.beginPath(); g.arc(px(x), py(s.y[i]), 3.5, 0, 7); g.fill(); }); continue; }
    g.setLineDash(s.trazo || []); g.beginPath();
    let primero = true;
    s.x.forEach((x, i) => { const y = s.y[i]; if (!isFinite(y) || (cfg.logx && x <= 0)) { primero = true; return; } primero ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y)); primero = false; });
    g.stroke(); g.setLineDash([]);
    if (s.relleno) { g.globalAlpha = .18; g.lineTo(px(s.x[s.x.length - 1]), py(Math.max(y0, 0))); g.lineTo(px(s.x[0]), py(Math.max(y0, 0))); g.fill(); g.globalAlpha = 1; }
  }
  g.restore();
  const etq = cfg.series.filter((s) => s.nombre);
  if (etq.length) { g.font = "11px system-ui"; g.textAlign = "left"; let y = m.t + 6; for (const s of etq) { g.fillStyle = s.color || "#2ec4b6"; g.fillRect(m.l + 8, y, 12, 3); g.fillStyle = "#e8ebef"; g.fillText(s.nombre, m.l + 25, y + 5); y += 15; } }
}
function fmt(v) { const a = Math.abs(v); return a >= 10000 ? (v / 1000).toFixed(0) + "k" : a >= 100 ? v.toFixed(0) : a >= 1 ? +v.toFixed(2) + "" : a === 0 ? "0" : +v.toPrecision(2) + ""; }
function barrasH(canvas, etiquetas, valores, ref) {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#1b1f24"; g.fillRect(0, 0, W, H);
  const l = 120, r = 46, alto = (H - 20) / valores.length, mx = Math.max(...valores) * 1.05;
  g.font = "11.5px system-ui";
  valores.forEach((v, i) => {
    const y = 10 + i * alto; const w = (W - l - r) * v / mx;
    g.fillStyle = "#e8ebef"; g.textAlign = "right"; g.fillText(etiquetas[i], l - 8, y + alto / 2 + 4);
    g.fillStyle = ref && Math.abs(v - ref) <= .2 * ref ? "#2ec4b6" : "#3d8fe0"; g.fillRect(l, y + alto * .18, w, alto * .64);
    g.fillStyle = "#e8ebef"; g.textAlign = "left"; g.fillText(f2(v), l + w + 5, y + alto / 2 + 4);
  });
  if (ref) { const x = l + (W - l - r) * ref / mx; g.strokeStyle = "#e6b84a"; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, 4); g.lineTo(x, H - 6); g.stroke(); g.setLineDash([]); }
}

/* ------------------------------------------------------------------ colores de las funciones */
const COLOR_FUN = [["alivio", "#ffffff"], ["arranque", "#e5534b"], ["ayuda", "#e6b84a"], ["cuadrador", "#f08bb0"],
  ["hastial", "#3d8fe0"], ["contorno", "#3d8fe0"], ["corona", "#b07cf0"], ["arrastre", "#7fd47a"], ["cuneta", "#9aa4af"]];
const colorFun = (f) => (COLOR_FUN.find(([k]) => (f || "").toLowerCase().includes(k)) || [0, "#2ec4b6"])[1];
function rampa(t) { // morado → naranja → amarillo (tiempo de salida)
  const c = [[64, 30, 140], [180, 50, 140], [240, 110, 70], [250, 210, 60]];
  t = Math.max(0, Math.min(1, t)) * (c.length - 1); const i = Math.min(Math.floor(t), c.length - 2), k = t - i;
  return `rgb(${c[i].map((v, j) => Math.round(v + (c[i + 1][j] - v) * k)).join(",")})`;
}

/* ------------------------------------------------------------------ esquema de carguío por tipo de taladro */
const HEX = (n) => "#" + Number(n).toString(16).padStart(6, "0");
let COLOR_EXP = () => 0xe07a3a;
import("./simlabor.js").then((m) => { COLOR_EXP = m.COLOR_EXP; }).catch(() => {});
function svgCarguio(op, lc) {
  const grupos = new Map();
  for (const t of op.taladros) if (t.tipo === "cargado" && !grupos.has(t.funcion)) grupos.set(t.funcion, t);
  const filas = [...grupos.values()];
  const Lm = Math.max(...op.taladros.map((t) => t.longitud || 0), 0.1);
  const X0 = 112, AN = 228, H = 34;
  let s = `<svg class="carguio" viewBox="0 0 360 ${filas.length * H + 30}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui">`;
  filas.forEach((t, k) => {
    const y = 8 + k * H, L = t.longitud || Lm, w = AN * L / Lm;
    const lcar = Math.min(Math.max((t.cartuchos || 0) * lc, 0.3 * L), L - 0.25), taco = Math.min(0.3, L - lcar);
    const wc = AN * lcar / Lm, wt = AN * taco / Lm;
    s += `<text x="4" y="${y + 12}" font-size="11" fill="${colorFun(t.funcion)}">${esc(t.funcion)}</text>`;
    s += `<text x="4" y="${y + 25}" font-size="9" fill="#8b96a3">${t.cartuchos} cart. · ${f2(t.kg, 2)} kg</text>`;
    s += `<rect x="${X0}" y="${y + 4}" width="${w}" height="14" rx="3" fill="#1c2026" stroke="#46505b" stroke-width=".8"/>`;
    s += `<rect x="${X0 + w - wc}" y="${y + 6}" width="${wc}" height="10" fill="${HEX(COLOR_EXP(t.explosivo))}"/>`;
    for (let c = 1; c < (t.cartuchos || 0); c++) { const xx = X0 + w - wc + wc * c / t.cartuchos; s += `<line x1="${xx}" y1="${y + 6}" x2="${xx}" y2="${y + 16}" stroke="#0b0e11" stroke-width=".5"/>`; }
    s += `<rect x="${X0 + w - wc - wt}" y="${y + 6}" width="${wt}" height="10" fill="#9c8156"/>`;
    s += `<circle cx="${X0 + w - 4}" cy="${y + 11}" r="3" fill="#fff2a0"/>`;
    s += `<text x="${X0}" y="${y + 29}" font-size="8.5" fill="#8b96a3">${esc(t.explosivo)} · carga ${f2(lcar)} m · taco ${f2(taco)} m · L ${f2(L)} m</text>`;
  });
  const y = filas.length * H + 14;
  s += `<rect x="${X0}" y="${y}" width="9" height="8" fill="#9c8156"/><text x="${X0 + 12}" y="${y + 7.5}" font-size="9" fill="#8b96a3">taco</text>`;
  s += `<circle cx="${X0 + 52}" cy="${y + 4}" r="3" fill="#fff2a0"/><text x="${X0 + 58}" y="${y + 7.5}" font-size="9" fill="#8b96a3">cebo (fondo)</text>`;
  s += `<text x="${X0 + 128}" y="${y + 7.5}" font-size="9" fill="#8b96a3">collar ← → fondo</text>`;
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ SVG con zoom y desplazamiento */
function svgMalla(op, { mini = false, etiqueta = "retardo" } = {}) {
  const pts = op.contorno.concat(op.taladros.map((t) => [t.x, t.y]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const xa = Math.min(...xs), xb = Math.max(...xs), ya = Math.min(...ys), yb = Math.max(...ys);
  const m = Math.max(xb - xa, yb - ya) * 0.08 + 0.1;
  const vb = [xa - m, -(yb + m), xb - xa + 2 * m, yb - ya + 2 * m];
  const esc_ = Math.max(vb[2], vb[3]);
  const r = esc_ * (mini ? 0.022 : 0.012);
  let s = `<svg viewBox="${vb.join(" ")}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`;
  s += `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#101317"/>`;
  if (!mini) { // cuadrícula de 0.5 m
    s += `<g stroke="#20262d" stroke-width="${esc_ * 0.0012}">`;
    for (let x = Math.ceil(vb[0] * 2) / 2; x < vb[0] + vb[2]; x += 0.5) s += `<line x1="${x}" y1="${vb[1]}" x2="${x}" y2="${vb[1] + vb[3]}"/>`;
    for (let y = Math.ceil(vb[1] * 2) / 2; y < vb[1] + vb[3]; y += 0.5) s += `<line x1="${vb[0]}" y1="${y}" x2="${vb[0] + vb[2]}" y2="${y}"/>`;
    s += `</g>`;
  }
  s += `<polygon points="${op.contorno.map(([x, y]) => `${x},${-y}`).join(" ")}" fill="#1a2a2c" stroke="#e8ebef" stroke-width="${esc_ * (mini ? .008 : .004)}"/>`;
  if (!mini) { // cotas de ancho y alto
    const w = esc_ * 0.0025, fs = esc_ * 0.03, yc = -(ya - m * 0.55), xc = xa - m * 0.55;
    s += `<g stroke="#8b96a3" stroke-width="${w}" fill="#8b96a3" font-family="system-ui" font-size="${fs}">`;
    s += `<line x1="${xa}" y1="${yc}" x2="${xb}" y2="${yc}"/><line x1="${xa}" y1="${yc - fs * .4}" x2="${xa}" y2="${yc + fs * .4}"/><line x1="${xb}" y1="${yc - fs * .4}" x2="${xb}" y2="${yc + fs * .4}"/>`;
    s += `<text x="${(xa + xb) / 2}" y="${yc - fs * .35}" text-anchor="middle" stroke="none">${f2(xb - xa)} m</text>`;
    s += `<line x1="${xc}" y1="${-ya}" x2="${xc}" y2="${-yb}"/><line x1="${xc - fs * .4}" y1="${-ya}" x2="${xc + fs * .4}" y2="${-ya}"/><line x1="${xc - fs * .4}" y1="${-yb}" x2="${xc + fs * .4}" y2="${-yb}"/>`;
    s += `<text x="${xc - fs * .35}" y="${-(ya + yb) / 2}" text-anchor="middle" stroke="none" transform="rotate(-90 ${xc - fs * .35} ${-(ya + yb) / 2})">${f2(yb - ya)} m</text></g>`;
  }
  op.taladros.forEach((t, i) => {
    const alivio = t.tipo === "alivio";
    const ra = alivio ? Math.max(t.diametro / 2000, r * 1.1) : r;
    if (t.azimut_rel && !mini) { // taladro inclinado del corte en V: dirección en planta
      const a = t.azimut_rel * Math.PI / 180, L = r * 4;
      s += `<line x1="${t.x}" y1="${-t.y}" x2="${t.x + Math.sin(a) * L}" y2="${-t.y}" stroke="${colorFun(t.funcion)}" stroke-width="${r * .35}"/>`;
    }
    s += `<circle data-i="${i}" cx="${t.x}" cy="${-t.y}" r="${ra}" fill="${alivio ? "none" : colorFun(t.funcion)}" stroke="${alivio ? "#ffffff" : "#0b0e11"}" stroke-width="${r * (alivio ? .35 : .25)}"/>`;
    if (!mini && etiqueta !== "nada" && !alivio) {
      const txt = etiqueta === "kg" ? f2(t.kg, 2) : etiqueta === "cart" ? t.cartuchos : (t.retardo ?? "");
      s += `<text x="${t.x + r * 1.2}" y="${-t.y - r * 1.1}" font-size="${r * 1.9}" fill="#e8ebef" font-family="system-ui">${txt}</text>`;
    }
  });
  return s + `</svg>`;
}
function zoomable(caja, alTocar) {
  const svg = $("svg", caja);
  const vb0 = svg.getAttribute("viewBox").split(" ").map(Number);
  let vb = vb0.slice();
  const poner = () => svg.setAttribute("viewBox", vb.join(" "));
  const escala = () => vb[2] / svg.clientWidth * Math.max(1, (svg.clientWidth / svg.clientHeight) / (vb[2] / vb[3]));
  const zoom = (f, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) => {
    const w = Math.min(Math.max(vb[2] * f, vb0[2] / 40), vb0[2] * 3), k = w / vb[2];
    vb = [cx - (cx - vb[0]) * k, cy - (cy - vb[1]) * k, w, vb[3] * k]; poner();
  };
  const ptrs = new Map(); let dist0 = 0, mov = 0;
  svg.addEventListener("pointerdown", (e) => { svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); mov = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; dist0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  svg.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    ptrs.set(e.pointerId, [e.clientX, e.clientY]); mov += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { const k = escala(); vb[0] -= dx * k; vb[1] -= dy * k; poner(); }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dist0) zoom(dist0 / d); dist0 = d; }
  });
  const fin = (e) => {
    ptrs.delete(e.pointerId); dist0 = 0;
    if (mov < 8 && alTocar && e.target.dataset && e.target.dataset.i != null) alTocar(Number(e.target.dataset.i));
  };
  svg.addEventListener("pointerup", fin); svg.addEventListener("pointercancel", fin);
  svg.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  caja.insertAdjacentHTML("beforeend", `<div class="ctl"><button data-z="in">＋</button><button data-z="out">－</button><button data-z="fit">⤢</button></div>`);
  $$(".ctl button", caja).forEach((b) => b.onclick = () => b.dataset.z === "fit" ? (vb = vb0.slice(), poner()) : zoom(b.dataset.z === "in" ? 0.75 : 1.33));
}

/* ------------------------------------------------------------------ visor 3D (three.js) */
let visor3d = null;
async function abrir3D(caja, escena) {
  caja.innerHTML = `<div class="sub" style="padding:12px">Cargando 3D…</div>`;
  let THREE, OrbitControls, sim;
  try {
    THREE = await import("three");
    ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
    sim = await import("./simulacion.js");
  } catch (e) { caja.innerHTML = `<div class="error">✖ No se pudo cargar el visor 3D (la primera vez necesita internet).</div>`; return; }
  if (visor3d) visor3d.cerrar();
  visor3d = sim.crearSimulacion(caja, escena, THREE, OrbitControls);
  window.B3D_SIM = visor3d;
}

/* ================================================================== INICIO */
let INFO = { formas: [], rocas: [], explosivos: [] };
let OPCIONES = [], OP_ACTUAL = null, DATOS_MALLA = null;

function explosivosUsuario() { try { return JSON.parse(localStorage.getItem("b3d_explosivos") || "[]"); } catch (e) { return []; } }
function refrescarExplosivos() {
  INFO.explosivos = INFO.base_explosivos.concat(explosivosUsuario().map((e) => ({ ...e, personalizado: true })),
    (INFO.explosivos_ficha || []).map((e) => ({ ...e, ficha: true })));
  llenarListas(document);
  const banco = $("#f-banco [name=explosivo]"); if (banco && !banco.dataset.puesto) { banco.value = "0"; banco.dataset.puesto = 1; }
  $("#lista-exp").innerHTML = explosivosUsuario().map((e, i) => `<div class="chip" style="display:flex;justify-content:space-between;margin:6px 0;padding:8px 10px;border-radius:10px">
     <span>${esc(e.nombre)} · ${e.densidad} g/cm³</span><a href="#" data-borrar="${i}">Quitar</a></div>`).join("") || `<p class="sub">Aún no agregaste explosivos propios.</p>`;
  $$("[data-borrar]").forEach((a) => a.onclick = (ev) => { ev.preventDefault(); const l = explosivosUsuario(); l.splice(+a.dataset.borrar, 1); localStorage.setItem("b3d_explosivos", JSON.stringify(l)); refrescarExplosivos(); });
}

async function iniciar() {
  try {
    const d = await motor.llamar("info", null, "Preparando el motor de cálculo…");
    INFO = { ...d, base_explosivos: d.explosivos };
    $("#ver").textContent = "v" + d.version;
    refrescarExplosivos();
    llenarListas(document);
    restaurarForm($("#f-malla"), "malla");
    const sel = $("#f-malla [name=explosivo]"); if (!localStorage.getItem("b3d_malla")) sel.value = "2";
    restaurarForm($("#f-banco"), "banco");
    montarHerramientas();
    await cargarEquipos();
    marcarLabor();
  } catch (e) {
    cargando(false);
    msg("#malla-msg", "No se pudo cargar el motor de cálculo. Revisa tu conexión la primera vez y vuelve a abrir la app. (" + e.message + ")");
  }
}

/* ------------------------------------------------------------------ navegación */
$$("nav.abajo button").forEach((b) => b.onclick = () => {
  $$("nav.abajo button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".vista").forEach((v) => v.classList.toggle("on", v.id === b.dataset.v));
  window.scrollTo(0, 0);
});

/* ================================================================== FRENTE */
function datosMalla() {
  const d = leerForm($("#f-malla"));
  const ex = INFO.explosivos;
  return {
    ancho: d.ancho, alto: d.alto, forma: d.forma, flecha: d.flecha, roca: d.roca,
    rmr: d.usar_rmr ? d.rmr : null, rqd: d.usar_rmr ? d.rqd : null, densidad_roca: d.densidad_roca,
    diametro: d.diametro, diametro_alivio: d.diametro_alivio, n_alivios: d.n_alivios, pies: d.pies,
    explosivo: ex[+d.explosivo] || ex[2], explosivo_contorno: d.explosivo_contorno === "" ? null : ex[+d.explosivo_contorno],
    largo_cartucho_pulg: d.largo_cartucho_pulg, angulo_v: d.angulo_v, cuneta: d.cuneta, cuneta_lado: d.cuneta_lado,
    cuneta_ancho: d.cuneta_ancho, cuneta_prof: d.cuneta_prof,
    labor: d.labor || "frente", equipo: d.equipo || null, sistema: d.sistema || "carmex",
    burden_tajeo: d.burden_tajeo, espaciamiento_tajeo: d.espaciamiento_tajeo,
  };
}
function marcarLabor() {
  const f = $("#f-malla"), l = f.labor.value;
  if (l === "tajo_abierto") { f.labor.value = "frente"; irVista("v-banco"); tostada("Tajo abierto: carga tu DXF con curvas de nivel y diseña el banco sobre el terreno"); return marcarLabor(); }
  const rect = l === "chimenea" || l === "tajeo";
  for (const n of ["forma", "flecha", "cuneta"]) if (f[n]) { f[n].disabled = rect; f[n].closest("label").style.opacity = rect ? 0.45 : 1; }
  if (rect && f.cuneta) f.cuneta.checked = false;
  f.classList.toggle("tajeo", l === "tajeo");
  $("#ayuda-labor").textContent = l === "chimenea" ? "Chimenea: sección RECTANGULAR (ancho × largo del techo, sin arco ni cuneta); la malla se dibuja en el techo y los taladros van hacia arriba; se perfora con stoper desde una plataforma."
    : l === "tajeo" ? "Tajeo (sección rectangular): si no hay cara libre se abre un SLOT (central si el tajeo es ancho, lateral si es angosto) y el resto sale en columnas hacia él; con cara libre inferior, breasting en filas. Burden y espaciamiento abajo; se perfora con jackleg."
    : "El equipo se elige por las medidas de la sección y las del catálogo (editable en «Más»). Una sección pequeña se perfora con jackleg.";
}
$("#f-malla").labor.addEventListener("change", marcarLabor);
$("#f-malla").onsubmit = async (ev) => {
  ev.preventDefault();
  guardarForm($("#f-malla"), "malla");
  msg("#malla-msg", "");
  DATOS_MALLA = datosMalla();
  try {
    OPCIONES = await motor.llamar("opciones", DATOS_MALLA, "Generando las mallas…");
    pintarOpciones();
    $("#opciones").scrollIntoView({ behavior: "smooth" });
  } catch (e) { msg("#malla-msg", e.message); }
};
function pintarOpciones() {
  $("#opciones").innerHTML = `<h2 style="margin-top:14px">Elige una malla</h2>` + OPCIONES.map((o, i) => {
    const r = o.resumen || {};
    return `<div class="tarjeta opcion" data-op="${i}">
      ${o.taladros ? svgMalla(o, { mini: true }) : `<svg viewBox="0 0 1 1"></svg>`}
      <div><div class="fam">${esc(o.familia)}</div><h3>${esc(o.nombre)}</h3>
      ${o.error ? `<p class="err">✖ ${esc(o.error)}</p>` : `<div class="chips">
        <span class="chip">${r.taladros} taladros</span><span class="chip">${r.alivios} alivios</span>
        <span class="chip">${f2(r.kg, 1)} kg</span><span class="chip">FC ${f2(r.factor_carga, 2)}</span>
        <span class="chip">avance ${f2(r.avance, 2)} m</span>${o.equipo ? `<span class="chip">🛠 ${esc(o.equipo.equipo.nombre)}</span>` : ""}</div>
        ${o.avisos.length ? `<p style="color:var(--aviso);margin-top:6px">⚠ ${o.avisos.length} aviso(s)</p>` : ""}`}
      </div></div>`;
  }).join("");
  $$("[data-op]").forEach((c) => c.onclick = () => { const o = OPCIONES[+c.dataset.op]; if (!o.error) detalleMalla(o); });
}
function detalleMalla(op) {
  OP_ACTUAL = op; OP_SIM = null;
  if (simLabor) { simLabor.cerrar(); simLabor = null; }
  const r = op.resumen;
  const funciones = [...new Set(op.taladros.map((t) => t.funcion))];
  const cuerpo = abrirHoja(op.nombre, `
    ${kpis([["Taladros", r.taladros, `${r.cargados} cargados · ${r.alivios} alivios`], ["Explosivo", f2(r.kg, 1) + " kg", `${f2(r.kg_por_m, 1)} kg/m`],
            ["Factor de carga", f2(r.factor_carga, 2), "kg/m³"], ["Perforación", f2(r.metros, 1) + " m", `avance ${f2(r.avance, 2)} m`],
            ["Área", f2(r.area, 2) + " m²", esc(op.familia)]])}
    ${op.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}
    ${op.equipo ? `<div class="tarjeta" style="padding:10px 12px;margin:8px 0"><b>🛠 ${esc(op.equipo.equipo.nombre)}</b>
      <span class="sub"> · ${esc((op.equipo.equipo.descripcion || "").replace(op.equipo.equipo.nombre + " — ", ""))}</span><br><span class="sub">Por qué: ${esc(op.equipo.motivo)}</span>
      ${op.equipo.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}</div>` : ""}
    <div class="fila-btn"><button class="btn prim" id="b-simular">🎬 Simular la labor</button></div>
    <div class="seg" id="seg-et"><button data-e="retardo" class="on">Retardo</button><button data-e="kg">kg</button><button data-e="cart">Cartuchos</button><button data-e="nada">Sin texto</button></div>
    <div class="lienzo" id="lz"></div>
    <div class="leyenda">${funciones.map((f) => `<span><i style="background:${f === "Alivio" ? "transparent" : colorFun(f)};border:1px solid ${colorFun(f)}"></i>${esc(f)}</span>`).join("")}</div>
    <div class="fila-btn"><button class="btn prim" id="b-3d">▶ Simulación 3D</button><button class="btn" id="b-png">🖼 Imagen</button></div>
    <div class="fila-btn"><button class="btn" id="b-dxf">⬇ DXF del frente</button><button class="btn" id="b-dxf3">⬇ DXF 3D</button><button class="btn" id="b-danio">💥 Zona de daño</button></div>
    <div id="caja3d"></div>
    <p class="sub">${esc(op.descripcion)}</p>
    <h3 style="margin-top:12px">Carguío por tipo de taladro</h3>
    ${svgCarguio(op, (DATOS_MALLA.largo_cartucho_pulg || 8) * 0.0254)}
    ${op.accesorios && op.accesorios.length ? `<h3 style="margin-top:12px">Accesorios de iniciación</h3>
      ${tabla(["Accesorio", "Cantidad", "Unidad", "Nota"], op.accesorios.map((a) => [a.item, a.cantidad, a.unidad, a.nota]))}
      <p class="ayuda">Cantidades geométricas de esta malla (recorrido entre taladros en orden de salida). Verifica con tu proveedor.</p>` : ""}
    ${op.comparacion && op.comparacion.length ? `<h3 style="margin-top:12px">Comparación con referencias de minas</h3>
      ${op.comparacion.map((c) => `<div class="chip" style="border-radius:10px;padding:8px 10px;margin:6px 0;display:block">${esc(c)}</div>`).join("")}
      <p class="ayuda">Diseños de minas concretas (Volcan, Retamas): sirven para comparar, no son reglas generales.</p>` : ""}
    ${tabla(["N.º", "X m", "Y m", "Función", "Ret.", "Cart.", "kg", "L m"], op.taladros.map((t, i) => [i + 1, t.x, t.y, t.funcion, t.retardo || "", t.cartuchos || "", t.kg, t.longitud]))}`);
  let et = "retardo";
  const pintar = () => {
    $("#lz").innerHTML = svgMalla(op, { etiqueta: et }) + `<div class="info" id="lz-info"></div>`;
    zoomable($("#lz"), (i) => {
      const t = op.taladros[i], box = $("#lz-info");
      box.style.display = "block";
      box.innerHTML = `<b>Taladro ${i + 1}</b> · ${esc(t.funcion)}<br>X ${f2(t.x)} m · Y ${f2(t.y)} m · Ø ${t.diametro} mm · L ${f2(t.longitud)} m<br>` +
        (t.tipo === "alivio" ? "Alivio (sin carga)" : `Retardo ${t.retardo} · ${t.cartuchos} cartuchos · ${f2(t.kg, 3)} kg ${esc(t.explosivo)}`);
    });
  };
  pintar();
  $$("#seg-et button").forEach((b) => b.onclick = () => { $$("#seg-et button").forEach((x) => x.classList.toggle("on", x === b)); et = b.dataset.e; pintar(); });
  $("#b-png").onclick = () => svgAPng($("#lz svg"), `malla_${op.clave}.png`);
  const dxf = async (vista) => { try { const d = await motor.llamar("dxf_frente", { clave: op.clave, vista }, "Creando el DXF…"); compartirArchivo(new Blob([d.texto], { type: "application/dxf" }), vista === "frente" ? d.nombre : d.nombre.replace(".dxf", "_3d.dxf")); } catch (e) { tostada("✖ " + e.message, 5000); } };
  $("#b-dxf").onclick = () => dxf("frente");
  $("#b-dxf3").onclick = () => dxf("3d");
  $("#b-danio").onclick = () => herramienta("danio");
  $("#b-simular").onclick = () => { history.back(); setTimeout(() => irSimular(op), 60); };
  $("#b-3d").onclick = () => {
    if (op.labor === "chimenea") { history.back(); setTimeout(() => irSimular(op), 60); return; }
    const caja = $("#caja3d"); caja.innerHTML = `<div id="vista3d"></div>`;
    const L = (DATOS_MALLA.pies || 6) * 0.3048;
    const taladros = op.taladros.map((t, i) => {
      const a = (t.azimut_rel || 0) * Math.PI / 180, l = t.longitud || L;
      const alivio = t.tipo === "alivio";
      return { a: [t.x, t.y, 0], b: [t.x + Math.sin(a) * l, t.y, -Math.cos(a) * l], r: Math.max(t.diametro / 2000, .015),
               color: alivio ? 0xdddddd : colorFun(t.funcion), carga: alivio ? null : [0.3, 1], t: alivio ? null : (t.retardo || 0), orden: i };
    });
    const c = op.contorno.concat([op.contorno[0]]);
    const lineas = [{ p: c.map(([x, y]) => [x, y, 0]), color: 0xe8ebef }];
    for (const d of [2, 4]) lineas.push({ p: c.map(([x, y]) => [x, y, d]), color: 0x3a424c });
    for (const [x, y] of op.contorno.filter((_, i) => i % 3 === 0)) lineas.push({ p: [[x, y, 0], [x, y, 4]], color: 0x2f363e });
    lineas.push({ p: c.map(([x, y]) => [x, y, -L]), color: 0x2f363e });
    const ys = op.contorno.map((p) => p[1]);
    abrir3D($("#vista3d"), { taladros, lineas, vista: [0.55, 0.35, 1], roca: { tipo: "frente", contorno: op.contorno, prof: (op.avance || 0.9 * L) },
                             piso: Math.min(...ys), radio: 0.9, paso_s: 0.35 });
    $("#vista3d").scrollIntoView({ behavior: "smooth" });
  };
}

/* ================================================================== SIMULAR LA LABOR */
let simLabor = null, OP_SIM = null;
function irSimular(op) {
  OP_SIM = op;
  $$("nav.abajo button").forEach((x) => x.classList.toggle("on", x.dataset.v === "v-sim"));
  $$(".vista").forEach((v) => v.classList.toggle("on", v.id === "v-sim"));
  window.scrollTo(0, 0);
  montarSimulacion();
}
const SIM_CFG = { metodo: null, sistema: null };
const PASOS_SIM = {
  perforacion: ["Perforación", "Se perforan los taladros en el orden de trabajo. Con jumbo cada brazo perfora su lado del frente; con jackleg el perforista cambia el barreno (0.6 → 1.2 → 1.8 m) a medida que avanza. Los taladros de alivio quedan vacíos: son la cara libre del arranque."],
  carguio: ["Carguío", "Se introduce el cebo al fondo y luego los cartuchos con el atacador de madera; al final se coloca el taco. El color de la columna es el explosivo de cada taladro."],
  amarre: ["Amarre", "Carmex: el extremo de cada Carmex se une con su conector a la mecha rápida, tendida en el orden de salida (primero el arranque). No eléctrico: cada Fanel se amarra al cordón detonante troncal; el retardo lo da su número."],
  voladura: ["Encendido y voladura", "Se chispea la mecha rápida y el personal se retira. La llama recorre la mecha rápida (≈ 35 s/m) y, al llegar a cada conector, enciende ese Carmex, que arde su largo (≈ 150–200 s/m) antes de detonar. Por eso la secuencia sigue el orden del amarre."],
  humo: ["Ventilación", "Después del disparo se ventila la labor hasta que los gases bajan a niveles seguros; recién entonces se ingresa."],
  limpieza: ["Limpieza", "El scoop entra, carga el material roto con el balde, sale y descarga. Se repite hasta dejar la labor limpia para el siguiente ciclo."],
  resultado: ["Resultado", "Nuevo frente con el avance logrado y los culos de taladro que quedaron sin romper."],
};
async function montarSimulacion() {
  const op = OP_SIM || OP_ACTUAL;
  if (simLabor) { simLabor.cerrar(); simLabor = null; }
  if (!op) {
    $("#sim-cab").innerHTML = `<div class="tarjeta" style="padding:14px"><p class="sub" style="margin:0 0 10px">Primero genera las mallas en «Frente» y toca una para elegirla.</p>
      <button class="btn prim ancho" id="b-ir-frente">Ir a Frente</button></div>`;
    $("#b-ir-frente").onclick = () => $('nav.abajo [data-v="v-malla"]').click();
    $("#sim-caja").innerHTML = ""; $("#sim-pie").innerHTML = "";
    return;
  }
  const r = op.resumen || {};
  const LAB = { frente: "Frente de avance", chimenea: "Chimenea", tajeo: "Tajeo (breasting)" };
  const exps = [...new Set(op.taladros.filter((t) => t.tipo === "cargado").map((t) => t.explosivo))];
  // método: mecanizado (jumbo + scoop) o convencional (jackleg + scoop pequeño si entra)
  const jumbo = op.equipo && op.equipo.equipo.tipo === "jumbo" ? op.equipo.equipo : null;
  const manualCat = (INFO.equipos || []).find((e) => e.tipo === (op.labor === "chimenea" ? "stoper" : "jackleg"));
  if (!SIM_CFG.metodo) SIM_CFG.metodo = jumbo ? "mecanizado" : "convencional";
  const metodo = op.labor === "chimenea" ? "convencional" : SIM_CFG.metodo;
  const eq = metodo === "mecanizado" && jumbo ? jumbo : (op.equipo && op.equipo.equipo.tipo !== "jumbo" ? op.equipo.equipo : manualCat || (op.equipo && op.equipo.equipo));
  const sistema = SIM_CFG.sistema || (metodo === "convencional" ? "carmex" : (op.sistema || "carmex"));
  let scoop = op.scoop, notaScoop = op.scoop_motivo || "";
  if (scoop && metodo === "convencional") {               // convencional: el scoop más pequeño que entre
    const ch = (INFO.scoops || []).filter((x) => x.seccion_minima[0] <= DATOS_MALLA.ancho + 1e-9 && x.seccion_minima[1] <= DATOS_MALLA.alto + 1e-9)
      .sort((a, b) => a.balde_m3 - b.balde_m3)[0];
    if (ch) { scoop = ch; notaScoop = `${ch.nombre} (convencional: equipo de limpieza pequeño).`; }
  }
  const avisoMetodo = metodo === "mecanizado" && !jumbo ? `<div class="aviso">⚠ Ningún jumbo del catálogo entra en ${f2(DATOS_MALLA.ancho)} × ${f2(DATOS_MALLA.alto)} m: se perfora con jackleg.</div>` : "";
  const seg = (nombre, val, ops) => `<div class="seg" data-cfg="${nombre}">${ops.map(([v, t]) => `<button data-v="${v}" class="${v === val ? "on" : ""}">${t}</button>`).join("")}</div>`;
  $("#sim-cab").innerHTML = `<div class="tarjeta sim-tarjeta"><div class="fam">${esc(LAB[op.labor] || op.labor)} · ${esc(op.familia)}</div>
    <h3>${esc(op.nombre)}</h3>
    <div class="chips"><span class="chip">${r.taladros} taladros</span><span class="chip">${r.cargados} cargados</span><span class="chip">${r.alivios} alivios</span>
    <span class="chip">${f2(r.kg, 1)} kg</span><span class="chip">avance ${f2(r.avance, 2)} m</span></div>
    ${op.labor !== "chimenea" ? `<div class="sub" style="margin:10px 0 4px">Método de trabajo</div>${seg("metodo", metodo, [["mecanizado", "⚙ Mecanizado (jumbo + scoop)"], ["convencional", "⛏ Convencional (jackleg)"]])}` : ""}
    <div class="sub" style="margin:10px 0 4px">Iniciación (amarre)</div>${seg("sistema", sistema, [["carmex", "Carmex + mecha rápida"], ["no_electrico", "Fanel + cordón detonante"]])}
    ${avisoMetodo}
    <div class="sim-equipos"><div><b>🛠 Perforación</b><span>${esc(eq ? eq.nombre : "—")}</span></div>
      <div><b>🚜 Limpieza</b><span>${esc(scoop ? scoop.nombre : (op.labor === "chimenea" ? "por gravedad" : "sin scoop"))}</span></div></div>
    <p class="sub" style="margin:6px 0 0">${esc(notaScoop)}${scoop && scoop.estimado ? ` (${esc(scoop.estimado)})` : ""}</p></div>`;
  $$("#sim-cab [data-cfg] button").forEach((b) => b.onclick = () => { SIM_CFG[b.parentNode.dataset.cfg] = b.dataset.v; montarSimulacion(); });
  $("#sim-pie").innerHTML = `<div class="sim-pasos" id="sim-pasos">${Object.entries(PASOS_SIM).filter(([k]) => k !== "humo" && (k !== "limpieza" || scoop))
      .map(([k, [t]], i) => `<div data-p="${k}"><i>${i + 1}</i>${t}</div>`).join("")}</div>
    <div class="tarjeta sim-explica" id="sim-explica"><b>Diseño cargado</b><p>Toca ▶ para ver el ciclo completo o elige una fase.</p></div>
    <div class="leyenda">${exps.map((e) => `<span><i style="background:${HEX(COLOR_EXP(e))}"></i>${esc(e)}</span>`).join("")}
      <span><i style="background:#9c8156"></i>Taco</span><span><i style="background:#fff2a0"></i>Cebo</span>
      <span><i style="background:transparent;border:1px solid #fff"></i>Alivio / rimado (vacío)</span>
      ${sistema === "carmex" ? `<span><i style="background:#34383d"></i>Carmex</span><span><i style="background:#2f9e44"></i>Mecha rápida</span>`
                             : `<span><i style="background:#f07a22"></i>Fanel</span><span><i style="background:#f1e6c8"></i>Cordón detonante</span>`}</div>
    <p class="ayuda">◐ cambia la roca entre transparente (ver las cargas dentro) y sólida. Equipos a escala con las medidas del catálogo.
      Tiempos de combustión: valores de fábrica (se miden en mina). Los fragmentos, su recorrido y la pila son ILUSTRATIVOS.</p>`;
  const caja = $("#sim-caja");
  caja.innerHTML = `<div class="sub" style="padding:12px">Cargando 3D…</div>`;
  let THREE, OrbitControls, mod;
  try {
    THREE = await import("three");
    ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
    mod = await import("./simlabor.js");
  } catch (e) { caja.innerHTML = `<div class="error">✖ No se pudo cargar el visor 3D (la primera vez necesita internet).</div>`; return; }
  const L = (DATOS_MALLA.pies || 6) * 0.3048;
  const taladros = op.taladros.map((t) => ({ ...t, color: colorFun(t.funcion), longitud: t.longitud || L }));
  const alFase = (f) => {
    const [t, x] = PASOS_SIM[f] || ["Diseño cargado", "Toca ▶ para ver el ciclo completo o elige una fase."];
    $("#sim-explica").innerHTML = `<b>${t}</b><p>${x}</p>`;
    const clave = f === "humo" ? "voladura" : f;
    $$("#sim-pasos [data-p]").forEach((d) => d.classList.toggle("on", d.dataset.p === clave));
  };
  simLabor = mod.crearLabor(caja, { labor: op.labor, contorno: op.contorno, taladros, L, avance: op.avance, equipo: eq,
                                    lc: (DATOS_MALLA.largo_cartucho_pulg || 8) * 0.0254, sistema, scoop: op.labor === "chimenea" ? null : scoop, alFase }, THREE, OrbitControls);
  window.B3D_LABOR = simLabor;
}
$('nav.abajo [data-v="v-sim"]').addEventListener("click", () => { if (!simLabor) montarSimulacion(); });
$$('nav.abajo button:not([data-v="v-sim"])').forEach((b) => b.addEventListener("click", () => { if (simLabor) { simLabor.cerrar(); simLabor = null; } }));

/* ================================================================== INICIO */
function irVista(v) { const b = $(`nav.abajo [data-v="${v}"]`); if (b) b.click(); window.scrollTo(0, 0); }
function mostrarProductos() {
  const E = INFO.emulnor; if (!E) return tostada("Sin datos de productos");
  const tipos = Object.keys(E.productos);
  const filas = [["Densidad (g/cm³)", "densidad"], ["VOD confinado (m/s)", "vod_conf"], ["VOD sin confinar (m/s)", "vod_libre"], ["Presión de detonación (kbar)", "presion_kbar"],
                 ["Energía (kcal/kg)", "energia_kcal"], ["Volumen de gases (L/kg)", "gases_l"], ["Potencia relativa en peso (%)", "rws"], ["Potencia relativa en volumen (%)", "rbs"]];
  const cuerpo = abrirHoja("Emulnor — ficha técnica", `
    <p class="sub">${esc(E.fuente)}. Emulsión encartuchada; los 4 tipos y todas sus presentaciones están disponibles en la malla automática («· ficha FAMESA»).</p>
    ${tabla(["Propiedad", ...tipos.map((t) => t.replace("EMULNOR ", ""))], filas.map(([n, k]) => [n, ...tipos.map((t) => String(E.productos[t][k]))]).concat([["Uso", ...tipos.map((t) => E.productos[t].uso)]]))}
    <h3 style="margin-top:14px">Presentaciones</h3>
    <div class="prod-tabs seg">${tipos.map((t, i) => `<button data-t="${esc(t)}" class="${i ? "" : "on"}">${esc(t.replace("EMULNOR ", "Emulnor "))}</button>`).join("")}</div>
    <div id="prod-pres"></div>
    <h3 style="margin-top:14px">Accesorios de iniciación</h3>
    ${tabla(["Accesorio", "Descripción"], Object.entries(E.accesorios).map(([k, v]) => [k, v.descripcion]))}
    <p class="ayuda">(T) = cartucho tubular. kg/cartucho = peso neto de la caja ÷ piezas (dato de la ficha). Tiempos de combustión: rangos de fábrica, se miden en la mina.</p>`);
  const ver = (t) => {
    const tipo = t.split(" ").pop();
    $("#prod-pres").innerHTML = tabla(["Ø × largo", "Tipo", "Pzas/caja", "kg/caja", "kg/cart."],
      E.presentaciones.filter((p) => p.tipo === tipo).map((p) => [`${p.diametro_texto} × ${p.largo_pulg}"`, p.tubular ? "Tubular (T)" : "Cartucho", String(p.piezas_caja), String(p.kg_caja), String(p.kg_cartucho)]));
    $$(".prod-tabs button", cuerpo).forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  };
  $$(".prod-tabs button", cuerpo).forEach((b) => b.onclick = () => ver(b.dataset.t));
  ver(tipos[0]);
}
$$("#v-inicio [data-ir]").forEach((b) => b.onclick = () => {
  const ir = b.dataset.ir, f = $("#f-malla");
  if (["frente", "chimenea", "tajeo"].includes(ir)) {
    f.labor.value = ir; f.labor.dispatchEvent(new Event("change"));
    if (ir === "chimenea") { f.ancho.value = "1.5"; f.alto.value = "1.5"; }
    if (ir === "tajeo") { f.ancho.value = "1.8"; f.alto.value = "1.0"; }
    irVista("v-malla");
  } else if (ir === "banco") irVista("v-banco");
  else if (ir === "simular") irVista("v-sim");
  else if (ir === "analisis") irVista("v-analisis");
  else if (ir === "productos") mostrarProductos();
  else if (ir === "referencias") $("#b-referencias").click();
  else if (ir === "ciclo") $("#ciclo").scrollIntoView({ behavior: "smooth" });
});
$("header.top").style.cursor = "pointer";
$("header.top").onclick = () => irVista("v-inicio");

/* ================================================================== EQUIPOS Y REFERENCIAS */
const CAMPOS_EQ = [["ancho", "Ancho (m)"], ["alto", "Alto (m)"], ["largo", "Largo (m)"], ["brazos", "Brazos"],
  ["seccion_min_ancho", "Sección mín. ancho (m)"], ["seccion_min_alto", "Sección mín. alto (m)"],
  ["cobertura_m2", "Cobertura (m²)"], ["long_perforacion_max", "Perforación máx. (m)"], ["diametro_min_mm", "Ø mín (mm)"], ["diametro_max_mm", "Ø máx (mm)"]];
function pintarEquipos() {
  $("#lista-equipos").innerHTML = (INFO.equipos || []).map((e, i) => `<div class="eq-fila" data-eq="${i}"><h4>${esc(e.nombre)}</h4>
    <div class="sub" style="margin-bottom:6px">${esc(e.descripcion || "")} · ${esc(e.fuente || "")}</div>
    <div class="campos">${CAMPOS_EQ.map(([k, l]) => `<label class="c">${l}<input name="${k}" type="number" step="any" value="${e[k] ?? ""}" inputmode="decimal"></label>`).join("")}</div></div>`).join("");
  llenarListas($("#f-eq-probar"));
}
async function cargarEquipos() {
  let cambios = null;
  try { cambios = JSON.parse(localStorage.getItem("b3d_equipos") || "null"); } catch (e) { cambios = null; }
  if (cambios && Object.keys(cambios).length) {
    try { const d = await motor.llamar("equipos", { cambios }, "Aplicando tus equipos…"); INFO.equipos = d.catalogo; } catch (e) { /* catálogo de fábrica */ }
  }
  llenarListas(document);
  restaurarForm($("#f-malla"), "malla");
  pintarEquipos();
}
$("#b-eq-guardar").onclick = async () => {
  const lista = (INFO.equipos || []).map((e, i) => {
    const c = { ...e }; delete c.descripcion; delete c.seccion_minima;
    for (const el of $$(`[data-eq="${i}"] input`)) c[el.name] = el.value === "" ? null : Number(el.value);
    c.brazos = Math.max(1, Math.round(c.brazos || 1));
    return c;
  });
  try {
    const d = await motor.llamar("equipos", { lista }, "Guardando…");
    INFO.equipos = d.catalogo; localStorage.setItem("b3d_equipos", JSON.stringify(d.cambios));
    pintarEquipos(); llenarListas(document); tostada("Equipos guardados");
  } catch (e) { tostada("✖ " + e.message, 5000); }
};
$("#b-eq-restaurar").onclick = async () => {
  try {
    const d = await motor.llamar("equipos", { restaurar: true }, "Restaurando…");
    INFO.equipos = d.catalogo; localStorage.removeItem("b3d_equipos"); pintarEquipos(); llenarListas(document); tostada("Catálogo de fábrica restaurado");
  } catch (e) { tostada("✖ " + e.message, 5000); }
};
$("#b-eq-probar").onclick = async () => {
  const d = {}; for (const el of $$("#f-eq-probar input, #f-eq-probar select")) d[el.name] = el.type === "number" ? Number(el.value) : el.value;
  try {
    const r = await motor.llamar("equipos", { probar: d }, "Evaluando…");
    const sel = r.seleccion;
    $("#eq-probar-res").innerHTML = `<b>${esc(sel.equipo.nombre)}</b> — ${esc(sel.motivo)}` +
      sel.evaluados.map((e) => `<br>${e.ok ? "✔" : "✖"} ${esc(e.nombre)}${e.motivo ? ": " + esc(e.motivo) : ""}`).join("");
  } catch (e) { tostada("✖ " + e.message, 5000); }
};
$("#b-referencias").onclick = async () => {
  let R;
  try { R = await motor.llamar("referencias", {}, "Cargando referencias…"); } catch (e) { return tostada("✖ " + e.message, 5000); }
  const cuerpo = abrirHoja("Referencias de minas", `
    <p class="sub">${esc(R.aviso)}</p>
    <h3>Avances — Volcan SC-CR</h3><div class="ref-lista">${R.volcan.map((v) => `<button class="btn" data-ref="${v.i}">${esc(v.codigo || "Malla")} · ${v.ancho}×${v.alto} m · roca ${esc(v.clase)} (RMR ${v.rmr[0]}–${v.rmr[1]}) · ${v.tabla.cargados} cargados</button>`).join("")}</div>
    <div id="ref-det"></div>
    <h3 style="margin-top:14px">Chimeneas — Retamas</h3>
    ${tabla(["Sección", "RMR", "Barra m", "Carg.", "Rim.", "Aliv.", "kg", "FC kg/m³"], R.chimeneas.map((c) => [c.seccion, `${c.rmr[0]}–${c.rmr[1]}`, c.longitud, c.cargados, c.rimados, c.alivios, c.kg ?? "—", c.fc ?? "—"]))}
    <p class="ayuda">${esc(R.fuente_chimeneas)}</p>
    <h3 style="margin-top:14px">Tajeos — Retamas</h3>
    ${tabla(["RMR", "Corte m", "Barra", "Filas", "kg", "FC kg/m³"], R.tajeos.map((t) => [`${t.rmr[0]}–${t.rmr[1]}`, `${t.ancho}×${t.alto}`, `${t.pies}'`, Object.entries(t.filas).map(([k, v]) => `${k}: ${v[0]}×${v[1]}`).join(", "), t.kg, t.fc]))}
    <p class="ayuda">${esc(R.fuente_tajeos)}</p>`);
  $$("[data-ref]", cuerpo).forEach((b) => b.onclick = async () => {
    const d = await motor.llamar("referencias", { i: +b.dataset.ref }, "Dibujando…");
    const v = d.volcan[+b.dataset.ref], tb = v.tabla;
    const op = { contorno: d.diseno.contorno, taladros: d.diseno.taladros.map((t) => ({ ...t, diametro: t.tipo === "cargado" ? 45 : 102,
      tipo: t.tipo === "cargado" ? "cargado" : "alivio", funcion: t.tipo === "cargado" ? "" : "Alivio" })) };
    $("#ref-det").innerHTML = `<div class="lienzo" id="lz-ref"></div>
      <div class="leyenda">${[...new Set(d.diseno.taladros.map((t) => t.explosivo).filter(Boolean))].map((e) => `<span><i style="background:${HEX(COLOR_EXP(e))}"></i>${esc(e)}</span>`).join("")}<span><i style="border:1px solid #fff"></i>Rimado / alivio</span></div>
      ${kpis([["Taladros", tb.cargados, `${tb.rimados} rimados · ${tb.alivios} alivios`], ["Explosivo", f2(tb.kg, 1) + " kg", `FC ${tb.fc} kg/m³`], ["Avance", f2(tb.avance) + " m", `L ${f2(tb.L)} m`], ["Accesorios", `${tb.fanel} Fanel`, `${tb.cordon} m cordón · ${tb.carmex} Carmex`]])}
      <p class="ayuda">${esc(R.fuente)}, pág. ${v.pagina}. Dibujo digitalizado; números = retardos.</p>`;
    $("#lz-ref").innerHTML = svgMalla(op, { etiqueta: "retardo" });
    $$("#lz-ref circle[data-i]").forEach((c) => { const t = op.taladros[+c.dataset.i]; if (t.tipo === "cargado") c.setAttribute("fill", HEX(COLOR_EXP(t.explosivo))); });
    zoomable($("#lz-ref"));
    $("#ref-det").scrollIntoView({ behavior: "smooth" });
  });
};

/* ================================================================== BANCO */
let TOPO = null, BANCO = null;
$("#archivo-dxf").onchange = async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  msg("#banco-msg", "");
  try {
    const texto = await f.text();
    const d = await motor.llamar("cargar_dxf", { texto, nombre: f.name }, "Leyendo el DXF…");
    $("#dxf-info").innerHTML = `<b>${esc(f.name)}</b> — marca las capas de curvas de nivel o puntos con cota:`;
    $("#dxf-capas").innerHTML = d.capas.map((c) => `<label class="chk"><input type="checkbox" value="${esc(c.capa)}" ${c.con_cota ? "checked" : ""}>
       ${esc(c.capa)} <span class="sub" style="margin:0 0 0 auto">${c.polilineas} líneas · ${c.puntos} ptos${c.con_cota ? "" : " · sin cota"}</span></label>`).join("");
    $("#b-tin").style.display = "flex";
    if (d.avisos.length) msg("#banco-msg", d.avisos.join(" "), "aviso");
  } catch (e) { msg("#banco-msg", e.message); }
};
$("#b-tin").onclick = async () => {
  const capas = $$("#dxf-capas input:checked").map((i) => i.value);
  if (!capas.length) return tostada("Marca al menos una capa");
  try {
    TOPO = await motor.llamar("crear_tin", { capas }, "Creando la superficie del terreno…");
    $("#dxf-info").innerHTML += `<br>✔ Superficie: ${TOPO.triangulos.toLocaleString()} triángulos · cotas ${f2(TOPO.z[0], 1)} a ${f2(TOPO.z[1], 1)} m`;
    const fb = $("#f-banco"); fb.style.display = "block";
    fb.cx.value = ((TOPO.x[0] + TOPO.x[1]) / 2).toFixed(1); fb.cy.value = ((TOPO.y[0] + TOPO.y[1]) / 2).toFixed(1);
    fb.cota_piso.value = TOPO.z[0].toFixed(1);
    $("#sel-area").innerHTML = `<option value="rect">Rectángulo</option>` + TOPO.areas.map((a, i) => `<option value="${i}">Polilínea cerrada · ${esc(a.capa)} · ${f2(a.area, 0)} m²</option>`).join("");
    if (TOPO.areas.length) $("#sel-area").value = "0";
    fb.scrollIntoView({ behavior: "smooth" });
  } catch (e) { msg("#banco-msg", e.message); }
};
function datosBanco() {
  const d = leerForm($("#f-banco"));
  d.explosivo = INFO.explosivos[+d.explosivo] || INFO.explosivos[0];
  if (d.area !== "rect" && TOPO) d.poligono = TOPO.areas[+d.area].vertices;
  return d;
}
$("#b-detectar").onclick = async () => {
  try { const r = await motor.llamar("azimut_salida", datosBanco(), "Buscando la cara libre…");
    if (r.azimut == null) tostada("Terreno plano: indica el azimut a mano"); else { $("#f-banco").azimut.value = r.azimut; tostada(`Salida hacia ${r.azimut}°`); }
  } catch (e) { tostada("✖ " + e.message, 5000); }
};
$("#f-banco").onsubmit = async (ev) => {
  ev.preventDefault(); guardarForm($("#f-banco"), "banco"); msg("#banco-msg", "");
  try {
    BANCO = await motor.llamar("malla_topo", datosBanco(), "Calculando la malla sobre el terreno…");
    pintarBanco();
  } catch (e) { msg("#banco-msg", e.message); }
};
function svgBanco(b) {
  const pol = b.poligono, xs = pol.map((p) => p[0]), ys = pol.map((p) => p[1]);
  const sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys), m = Math.max(sx, sy) * 0.25 + 5;
  const xa = Math.min(...xs) - m, xb = Math.max(...xs) + m, ya = Math.min(...ys) - m, yb = Math.max(...ys) + m;
  const vb = [xa, -yb, xb - xa, yb - ya], E = Math.max(vb[2], vb[3]), r = E * 0.008;
  const zs = TOPO.curvas.flatMap((c) => c.map((p) => p[2])); const z0 = Math.min(...zs), z1 = Math.max(...zs);
  let s = `<svg viewBox="${vb.join(" ")}" xmlns="http://www.w3.org/2000/svg"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#101317"/>`;
  for (const c of TOPO.curvas) {
    if (!c.some(([x, y]) => x > xa && x < xb && y > ya && y < yb)) continue;
    const t = (c[0][2] - z0) / ((z1 - z0) || 1);
    s += `<polyline points="${c.map(([x, y]) => `${x},${-y}`).join(" ")}" fill="none" stroke="hsl(${200 - 160 * t},45%,${38 + 22 * t}%)" stroke-width="${E * .0018}"/>`;
  }
  s += `<polygon points="${pol.map(([x, y]) => `${x},${-y}`).join(" ")}" fill="rgba(46,196,182,.08)" stroke="#2ec4b6" stroke-width="${E * .003}"/>`;
  const msMax = Math.max(1, ...b.taladros.map((t) => t.ms || 0));
  b.taladros.forEach((t, i) => {
    s += `<circle data-i="${i}" cx="${t.x}" cy="${-t.y}" r="${r}" fill="${rampa((t.ms || 0) / msMax)}" stroke="#fff" stroke-width="${r * .25}"/>`;
    if (b.taladros.length < 250 && t.retardo) s += `<text x="${t.x + r * 1.2}" y="${-t.y - r}" font-size="${r * 1.7}" fill="#e8ebef" font-family="system-ui">${t.retardo}</text>`;
  });
  const a = (+$("#f-banco").azimut.value || 0) * Math.PI / 180, cx = xs.reduce((p, v) => p + v, 0) / xs.length, cy = ys.reduce((p, v) => p + v, 0) / ys.length, L = Math.max(sx, sy) * .35;
  s += `<line x1="${cx}" y1="${-cy}" x2="${cx + Math.sin(a) * L}" y2="${-(cy + Math.cos(a) * L)}" stroke="#e6b84a" stroke-width="${E * .004}" marker-end="url(#fl)"/>`;
  s += `<defs><marker id="fl" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10z" fill="#e6b84a"/></marker></defs>`;
  return s + `</svg>`;
}
function pintarBanco() {
  const b = BANCO;
  $("#banco-res").innerHTML = `
    ${kpis([["Taladros", b.taladros.length, `${b.filas} filas`], ["Perforación", f2(b.metros, 0) + " m"], ["Explosivo", f2(b.kg, 0) + " kg"],
            ["Volumen", f2(b.volumen, 0) + " m³", `área ${f2(b.area, 0)} m²`], ["Factor de carga", f2(b.factor_carga, 3), "kg/m³"]])}
    ${b.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}
    <div class="lienzo" id="lzb"></div>
    <p class="sub" style="margin-top:6px">Color = tiempo de salida · número = retardo · flecha = salida.</p>
    <div class="fila-btn"><button class="btn prim" id="bb-3d">▶ Simulación 3D</button><button class="btn" id="bb-png">🖼 Imagen</button><button class="btn prim" id="bb-dxf">⬇ DXF</button></div>
    <div id="caja3db"></div>
    ${tabla(["Fila", "N.º", "Este", "Norte", "Cota", "H m", "L m", "kg", "Ret.", "ms"], b.taladros.map((t) => [t.fila, t.orden, t.x, t.y, t.z, t.altura, t.longitud, t.kg, t.retardo, t.ms ?? ""]))}`;
  $("#lzb").innerHTML = svgBanco(b) + `<div class="info" id="lzb-info"></div>`;
  zoomable($("#lzb"), (i) => { const t = b.taladros[i], box = $("#lzb-info"); box.style.display = "block";
    box.innerHTML = `<b>Fila ${t.fila} · n.º ${t.orden}</b><br>E ${f2(t.x)} · N ${f2(t.y)} · cota ${f2(t.z)}<br>H ${f2(t.altura)} m · L ${f2(t.longitud)} m · ${f2(t.kg, 1)} kg · retardo ${t.retardo} (${t.ms ?? "—"} ms)`; });
  $("#bb-png").onclick = () => svgAPng($("#lzb svg"), "malla_banco.png");
  $("#bb-dxf").onclick = async () => { try { const d = await motor.llamar("dxf_topo", { topografia: true }, "Creando el DXF…"); compartirArchivo(new Blob([d.texto], { type: "application/dxf" }), d.nombre); } catch (e) { tostada("✖ " + e.message, 5000); } };
  $("#bb-3d").onclick = () => {
    $("#caja3db").innerHTML = `<div id="vista3d"></div>`;
    const fb = leerForm($("#f-banco"));
    const cx = b.taladros.reduce((p, t) => p + t.x, 0) / b.taladros.length, cy = b.taladros.reduce((p, t) => p + t.y, 0) / b.taladros.length;
    const zc = b.taladros.reduce((p, t) => p + t.z, 0) / b.taladros.length;
    const P = (x, y, z) => [x - cx, z - zc, -(y - cy)];
    const inc = (fb.inclinacion || 90) * Math.PI / 180, az = (fb.azimut || 0) * Math.PI / 180, msMax = Math.max(1, ...b.taladros.map((t) => t.ms || 0));
    const taladros = b.taladros.map((t, i) => { const h = Math.cos(inc) * t.longitud;
      return { a: P(t.x, t.y, t.z), b: P(t.x + Math.sin(az) * h, t.y + Math.cos(az) * h, t.z - Math.sin(inc) * t.longitud),
               r: Math.max((fb.diametro || 165) / 2000, .05), color: rampa((t.ms || 0) / msMax), carga: [(fb.taco || 0) / t.longitud, 1],
               t: t.ms ?? t.retardo ?? 0, orden: i, altura: t.altura }; });
    const R = Math.max(...b.poligono.map(([x, y]) => Math.hypot(x - cx, y - cy))) * 1.8;
    const zs = TOPO.curvas.flatMap((c) => c.map((p) => p[2])); const z0 = Math.min(...zs), z1 = Math.max(...zs);
    const lineas = TOPO.curvas.filter((c) => c.some(([x, y]) => Math.hypot(x - cx, y - cy) < R)).map((c) => {
      const t = (c[0][2] - z0) / ((z1 - z0) || 1); return { p: c.filter(([x, y]) => Math.hypot(x - cx, y - cy) < R * 1.2).map(([x, y, z]) => P(x, y, z)), color: `hsl(${200 - 160 * t},45%,55%)` }; })
      .filter((l) => l.p.length > 1);
    // borde del área apoyado en el terreno (no a una cota media)
    const borde = b.borde3d && b.borde3d.length ? b.borde3d : b.poligono.map(([x, y]) => [x, y, zc]);
    lineas.push({ p: borde.concat([borde[0]]).map(([x, y, z]) => P(x, y, z + 0.15)), color: 0x2ec4b6 });
    const g = b.terreno;
    const terreno = g ? { X0: g.x0 - cx, Z0: -(g.y0 - cy), dx: g.dx, dy: g.dy, nx: g.nx, ny: g.ny,
                          h: g.z.map((z) => z == null ? null : z - zc), z0: TOPO.z[0] - zc, z1: TOPO.z[1] - zc } : null;
    const pisoY = Math.min(...b.taladros.map((t) => t.z - t.altura)) - zc;
    const conMs = b.taladros.some((t) => t.ms != null);
    abrir3D($("#vista3d"), { taladros, lineas, vista: [0.8, 0.7, 1], piso: pisoY, salida: [Math.sin(az), -Math.cos(az)],
      roca: { tipo: "banco", poligono: b.poligono.map(([x, y]) => [x - cx, -(y - cy)]), altura: Math.max(...b.taladros.map((t) => t.altura)) },
      ms: conMs, paso_s: conMs ? 0.008 : 0.3, radio: Math.max(+fb.burden || 4, +fb.espaciamiento || 4), terreno });
    $("#vista3d").scrollIntoView({ behavior: "smooth" });
  };
  $("#banco-res").scrollIntoView({ behavior: "smooth" });
}

/* ================================================================== ANÁLISIS */
const HERR = {
  fragmentacion: { i: "◔", t: "Fragmentación", d: "Kuz-Ram, Swebrec y ajuste a datos medidos" },
  danio: { i: "💥", t: "Zona de daño", d: "Kirsch sobre la malla elegida" },
  burden: { i: "↔", t: "Burden", d: "Nueve fórmulas: Ash, Pearse, Langefors, Konya…" },
  macizo: { i: "⛰", t: "Macizo rocoso", d: "RMR, Q, GSI, Hoek-Brown, pernos" },
  cimbra: { i: "⌒", t: "Cimbra", d: "Arco metálico con carga de Unal" },
  dinamica: { i: "〰", t: "Respuesta dinámica", d: "Newmark y espectro" },
  costos: { i: "$", t: "Costos del ciclo", d: "Por disparo, metro, m³ y t" },
};
function montarHerramientas() {
  $("#herramientas").innerHTML = Object.entries(HERR).map(([k, h]) => `<div class="tarjeta" data-h="${k}"><b>${h.i}</b><h3>${h.t}</h3><p>${h.d}</p></div>`).join("");
  $$("[data-h]").forEach((c) => c.onclick = () => herramienta(c.dataset.h));
}
function herramienta(k) {
  const h = HERR[k];
  const cuerpo = abrirHoja(h.t, `<form id="fh">${FORM[k]()}</form><div class="fila-btn"><button class="btn prim ancho" id="bh">▶ Calcular</button></div><div id="hmsg"></div><div id="hres"></div>`);
  const form = $("#fh");
  restaurarForm(form, "h_" + k);
  const correr = async () => {
    guardarForm(form, "h_" + k); msg("#hmsg", "");
    try { await CALC[k](leerForm(form)); } catch (e) { msg("#hmsg", e.message); }
  };
  $("#bh").onclick = correr;
  form.onsubmit = (e) => { e.preventDefault(); correr(); };
  if (EXTRA[k]) EXTRA[k](form, correr);
}
const n = (nm, l, v, paso) => ({ n: nm, l, v, paso });
const FORM = {
  fragmentacion: () => campos([
    { n: "rmd", l: "Macizo (RMD)", t: "sel", op: INFO.frag.rmd, v: "Diaclasada verticalmente", ancho: 1 },
    { n: "jps", l: "Espaciado de juntas", t: "sel", op: INFO.frag.jps, v: "0.1 m a tamaño de malla", ancho: 1 },
    { n: "jpa", l: "Orientación de juntas", t: "sel", op: INFO.frag.jpa, v: "Rumbo perpendicular al frente", ancho: 1 },
    n("densidad", "Densidad (t/m³)", 2.7), n("ucs", "UCS (MPa)", 100), n("e", "Módulo E (GPa)", 40),
    { n: "a_manual", l: "Ingresar A a mano", t: "chk" }, n("a", "A", 7),
    n("k", "Factor de carga (kg/m³)", 0.6), n("q", "Carga por taladro (kg)", 100), n("rws", "RWS (ANFO=100)", 100),
    n("b", "Burden (m)", 3), n("s", "Espaciamiento (m)", 3.5), n("d", "Ø (mm)", 102), n("w", "Desviación W (m)", 0.2),
    n("long_carga", "Long. de carga (m)", 8), n("bcl", "Carga de fondo (m)", 0), n("h", "Altura H (m)", 10),
    n("xmax", "xmax mm (0 = auto)", 0), n("parrilla", "Parrilla (mm)", 300),
    { n: "medidos", l: "Granulometría medida (opcional): una fila por tamiz «abertura mm, % pasante»", t: "txt", filas: 4, v: "" }]),
  danio: () => OP_ACTUAL ? `<p class="sub">Malla: <b>${esc(OP_ACTUAL.nombre)}</b></p>` + campos([
    n("ucs", "UCS (MPa)", 120), n("fd", "Factor dinámico", 1), n("t", "Tracción (MPa)", 8), n("vod", "VOD si falta (m/s)", 4500),
    { n: "modo", l: "Combinación", t: "sel", op: ["max", "suma"], v: "max" }]) : `<div class="aviso">⚠ Primero genera las mallas en «Frente» y abre una.</div>`,
  burden: () => campos([n("d", "Ø (mm)", 102), n("h", "Altura de banco (m)", 10), n("rho_e", "Densidad explosivo", 0.85),
    n("vod", "VOD (m/s)", 4000), n("rho_r", "Densidad roca", 2.7), n("vc", "Vel. sísmica (m/s)", 3500), n("kb", "Kb de Ash", 30),
    { n: "c", l: "Constante c", t: "sel", op: ["0.3", "0.4", "0.5"], v: "0.4" },
    { n: "explosivo", l: "Explosivo (Olofsson)", t: "sel", op: INFO.burden.explosivo, v: "ANFO" },
    { n: "inclinacion", l: "Inclinación", t: "sel", op: INFO.burden.inclinacion, v: "Vertical" }]),
  macizo: () => campos([n("ucs", "UCS (MPa)", 80), n("rqd", "RQD (%)", 65), n("esp", "Espaciado juntas (m)", 0.4),
    { n: "condicion", l: "Condición de juntas", t: "sel", op: INFO.macizo.condicion, v: INFO.macizo.condicion[1], ancho: 1 },
    { n: "agua", l: "Agua", t: "sel", op: INFO.macizo.agua, v: "Húmedo" },
    { n: "orientacion", l: "Orientación", t: "sel", op: INFO.macizo.orientacion, v: "Favorable" },
    n("jn", "Jn", 9), n("jr", "Jr", 1.5), n("ja", "Ja", 2), n("jw", "Jw", 1), n("srf", "SRF", 1),
    n("ei", "Ei (GPa)", 40), n("mi", "mi", 15), n("D", "D (voladura)", 0.5), n("ancho", "Luz B (m)", 4), n("gamma", "γ (kN/m³)", 27),
    { n: "esr", l: "Tipo de labor (ESR)", t: "sel", op: INFO.macizo.esr, v: "Labores permanentes", ancho: 1 }]),
  cimbra: () => campos([n("ancho", "Ancho (m)", 4), n("alto", "Alto (m)", 4),
    { n: "perfil", l: "Perfil", t: "sel", op: INFO.perfiles, v: "W6x20" }, n("esp", "Espaciamiento (m)", 1),
    n("fy", "fy (MPa)", 250), n("rmr", "RMR", 45), n("gamma", "γ (kN/m³)", 27), n("k", "Empuje lateral k", 0),
    { n: "apoyos", l: "Apoyos", t: "sel", op: ["empotrados", "articulados"], v: "empotrados" }, n("q_manual", "q manual kN/m (0 = Unal)", 0)]),
  dinamica: () => campos([{ n: "fuente", l: "Registro", t: "sel", op: ["Ejemplo sintético", "Archivo CSV (t s, a g)"], v: "Ejemplo sintético", ancho: 1 },
    n("ppv", "PPV ejemplo (mm/s)", 20), n("frec", "Frecuencia (Hz)", 30), n("nret", "N.º retardos", 8), n("interv", "Intervalo (ms)", 25),
    n("dur", "Duración (s)", 1), n("T", "Periodo T (s)", 0.1), n("xi", "Amortiguamiento (%)", 5),
    n("tmin", "T mín (s)", 0.01), n("tmax", "T máx (s)", 2), n("npt", "Puntos del espectro", 60)]) +
    `<div style="padding:0 14px 10px"><input type="file" id="reg" accept=".csv,.txt,.dat"></div>`,
  costos: () => campos([n("avance", "Avance (m)", 1.7), n("volumen", "Volumen (m³)", 20), n("toneladas", "Toneladas", 54),
    n("kg", "kg de explosivo", 30), n("detonadores", "Detonadores", 40), n("metros", "Metros perforados", 70)]) +
    `<div style="padding:0 14px"><button class="btn ancho" type="button" id="b-ej">Cargar el ejemplo con estas cantidades</button></div>
     <div id="cst"></div>`,
};
const EXTRA = {
  dinamica: (form) => { $("#reg").onchange = async (e) => { const f = e.target.files[0]; if (f) { form.dataset.reg = await f.text(); form.dataset.nreg = f.name; form.fuente.selectedIndex = 1; tostada("Registro cargado: " + f.name); } }; },
  costos: (form, correr) => {
    const pintar = (d) => { form.dataset.datos = JSON.stringify(d); $("#cst").innerHTML = editorCostos(d); };
    let d = null; try { d = JSON.parse(localStorage.getItem("b3d_costos") || "null"); } catch (e) { d = null; }
    const ej = async () => { const f = leerForm(form); pintar(await motor.llamar("costos_ejemplo", { kg: f.kg, detonadores: f.detonadores, metros: f.metros })); };
    $("#b-ej").onclick = ej;
    d ? pintar(d) : ej();
  },
};
function editorCostos(d) {
  const eq = d.equipos.map((e, i) => `<div class="tarjeta" style="padding:10px;margin:8px 0"><b>${esc(e.nombre)}</b><div class="campos" style="padding:8px 0 0">
     ${[["precio", "Precio"], ["vida_util_h", "Vida útil h"], ["anios", "Años"], ["horas_anio", "h/año"], ["neumaticos", "Neumáticos"], ["consumo_h", "Consumo/h"], ["precio_energia", "Precio energía"], ["factor_reparacion", "F. reparación"]]
       .map(([k, l]) => `<label class="c">${l}<input data-eq="${i}" data-k="${k}" type="number" step="any" value="${e[k]}" inputmode="decimal"></label>`).join("")}</div></div>`).join("");
  const ta = d.tareas.map((t, i) => `<div class="tarjeta" style="padding:10px;margin:8px 0"><b>${esc(t.nombre)}</b><div class="campos" style="padding:8px 0 0">
     ${[["horas", "Horas"], ["trabajadores", "Trabajadores"], ["salario_h", "Salario/h"]].map(([k, l]) => `<label class="c">${l}<input data-ta="${i}" data-k="${k}" type="number" step="any" value="${t[k]}" inputmode="decimal"></label>`).join("")}
     <label class="c ancho">Equipos (nombre: horas, uno por línea)<textarea data-ta="${i}" data-k="equipos" rows="2">${esc(t.equipos.map(([a, b]) => `${a}: ${b}`).join("\n"))}</textarea></label>
     <label class="c ancho">Materiales (nombre: cantidad: precio)<textarea data-ta="${i}" data-k="materiales" rows="2">${esc(t.materiales.map(([a, b, c]) => `${a}: ${b}: ${c}`).join("\n"))}</textarea></label>
     </div></div>`).join("");
  return `<details class="grupo" style="margin-top:10px"><summary>Equipos (${d.equipos.length})</summary><div style="padding:0 10px 6px">${eq}</div></details>
          <details class="grupo"><summary>Tareas del ciclo (${d.tareas.length})</summary><div style="padding:0 10px 6px">${ta}</div></details>`;
}
function leerCostos(form) {
  const d = JSON.parse(form.dataset.datos);
  $$("[data-eq]").forEach((el) => d.equipos[+el.dataset.eq][el.dataset.k] = Number(el.value));
  $$("[data-ta]").forEach((el) => {
    const t = d.tareas[+el.dataset.ta], k = el.dataset.k;
    if (k === "equipos") t.equipos = el.value.split("\n").map((l) => l.split(":").map((s) => s.trim())).filter((p) => p[0]).map(([a, b]) => [a, Number(b || 0)]);
    else if (k === "materiales") t.materiales = el.value.split("\n").map((l) => l.split(":").map((s) => s.trim())).filter((p) => p[0]).map(([a, b, c]) => [a, Number(b || 0), Number(c || 0)]);
    else t[k] = Number(el.value);
  });
  form.dataset.datos = JSON.stringify(d);
  try { localStorage.setItem("b3d_costos", JSON.stringify(d)); } catch (e) { /* */ }
  return d;
}
const lienzos = (ids) => ids.map((id) => `<canvas class="grafico" id="${id}"></canvas>`).join("");
const CALC = {
  async fragmentacion(f) {
    f.medidos = (f.medidos || "").split("\n").map((l) => l.split(/[,;\t ]+/).filter(Boolean).map(Number)).filter((p) => p.length >= 2 && p.every(isFinite));
    const r = await motor.llamar("fragmentacion", f);
    $("#hres").innerHTML = kpis([["x50", f2(r.x50 / 10, 1) + " cm", `${f2(r.x50, 0)} mm`], ["x80 Swebrec", f2(r.x80_sw / 10, 1) + " cm", `R-R ${f2(r.x80_rr / 10, 1)} cm`],
      ["n", f2(r.n, 2), "uniformidad"], ["b", f2(r.b, 2), `xmax ${f2(r.xmax / 10, 0)} cm`], ["Bajo parrilla", f2(r.bajo_parrilla, 0) + " %"], ["A", f2(r.a, 2), "factor de roca"]]) +
      lienzos(["g1"]) + (r.ajuste ? lienzos(["g2"]) + kpis([["x50 medido", f2(r.ajuste.x50, 1) + " mm", `R² ${f2(r.ajuste.r2, 4)}`], ["b ajustado", f2(r.ajuste.b, 3), `xmax ${f2(r.ajuste.xmax, 0)} mm`], ["A calibrado", f2(r.ajuste.a_calibrado, 2), "x50 ∝ A"]]) : "") +
      tabla(["Paso", "Resultado"], r.pasos);
    grafico($("#g1"), { logx: true, ymin: 0, ymax: 100, xlab: "Tamaño (mm)", ylab: "% pasante", titulo: "Curva predicha",
      series: [{ x: r.x, y: r.swebrec, nombre: "Swebrec" }, { x: r.x, y: r.rosin, color: "#3d8fe0", trazo: [6, 4], nombre: "Rosin-Rammler" }],
      vlineas: [{ x: +f.parrilla, texto: "parrilla" }] });
    if (r.ajuste) { const a = r.ajuste; grafico($("#g2"), { logx: true, ymin: 0, ymax: 100, xlab: "Tamaño (mm)", ylab: "% pasante", titulo: "Ajuste a lo medido",
      series: [{ x: a.medidos.map((m) => m[0]), y: a.medidos.map((m) => m[1]), puntos: true, color: "#fff", nombre: "Medido" }, { x: a.x, y: a.swebrec, nombre: `Swebrec R² ${f2(a.r2, 3)}` }, { x: a.x, y: a.rosin, color: "#3d8fe0", trazo: [6, 4], nombre: `R-R R² ${f2(a.r2_rr, 3)}` }] }); }
  },
  async danio(f) {
    if (!OP_ACTUAL) throw new Error("Primero abre una malla en «Frente»");
    const r = await motor.llamar("danio", { ...f, clave: OP_ACTUAL.clave }, "Calculando esfuerzos…");
    $("#hres").innerHTML = kpis([["Cobertura", f2(r.cobertura, 0) + " %", "sección con σ ≥ tracción"], ...r.radios.map((x) => [x[0].slice(0, 22), f2(x[3], 1) + " cm", `triturado · fracturado ${f2(x[4], 2)} m`])]) +
      `<canvas class="grafico" id="gd" style="height:360px"></canvas><p class="sub">Color: esfuerzo radial (escala log). Blanco: zona donde σ ≥ resistencia a tracción.</p>` +
      tabla(["Explosivo", "Ø mm", "Pb MPa", "r triturado cm", "r fracturado m"], r.radios);
    mapaCalor($("#gd"), r, OP_ACTUAL);
  },
  async burden(f) {
    const r = await motor.llamar("burden", f);
    $("#hres").innerHTML = kpis([["Mediana", f2(r.mediana) + " m", `S ≈ ${f2(1.15 * r.mediana)} m`], ["q", f2(r.q) + " kg/m"]]) +
      `<canvas class="grafico" id="gb" style="height:300px"></canvas>` + tabla(["Fórmula", "B m", "Expresión"], r.filas);
    barrasH($("#gb"), r.filas.map((x) => x[0]), r.filas.map((x) => x[1]), r.mediana);
  },
  async macizo(f) {
    const r = await motor.llamar("macizo", f);
    $("#hres").innerHTML = kpis([["RMR89", r.rmr, r.clase], ["Q", f2(r.q, 3), `RMR desde Q ${f2(r.rmr_desde_q, 0)}`], ["GSI", r.gsi],
      ["Em Hoek-Diederichs", f2(r.em["Hoek-Diederichs"], 1) + " GPa"], ["Perno", f2(r.perno) + " m", `ESR ${r.esr}`], ["Carga de roca", f2(r.hp) + " m", `${f2(r.presion, 0)} kPa`]]) +
      lienzos(["gm1", "gm2"]) +
      tabla(["Parámetro", "Valor"], [...r.puntajes, ["Q", r.q], ["mb", r.hb.mb], ["s", r.hb.s], ["a", r.hb.a], ["σcm (MPa)", r.scm],
        ...Object.entries(r.em).map(([k, v]) => ["Em " + k + " (GPa)", v ?? "—"]), ["Luz sin soporte (m)", r.luz]]);
    grafico($("#gm1"), { titulo: "Módulo de deformación", xlab: "RMR", ylab: "Em (GPa)", series: [
      { x: r.curva_em.rmr, y: r.curva_em.serafim, nombre: "Serafim-Pereira" }, { x: r.curva_em.rmr, y: r.curva_em.hoek, color: "#e6b84a", nombre: "Hoek-Diederichs" },
      { x: r.curva_em.rmr, y: r.curva_em.nicholson, color: "#3d8fe0", nombre: "Nicholson-Bieniawski" }], vlineas: [{ x: r.rmr, color: "#9aa4af" }] });
    grafico($("#gm2"), { titulo: "Hoek-Brown", xlab: "σ3 (MPa)", ylab: "σ1 (MPa)", series: [{ x: r.curva_hb.s3, y: r.curva_hb.s1, nombre: `Macizo GSI ${r.gsi}` }] });
  },
  async cimbra(f) {
    const r = await motor.llamar("cimbra", f);
    $("#hres").innerHTML = kpis([["Carga q", f2(r.q, 1) + " kN/m", `hp ${f2(r.hp)} m`], ["N máx", f2(r.n_max, 1) + " kN"], ["M máx", f2(r.m_max) + " kN·m"],
      ["σ máx", f2(r.sigma, 0) + " MPa"], ["Utilización", f2(r.util, 0) + " %", r.util <= 100 ? "✔ cumple" : "✖ no cumple"]]) +
      (r.util > 100 ? `<div class="aviso">⚠ El perfil no resiste: usa uno mayor o reduce el espaciamiento.</div>` : "") +
      `<canvas class="grafico" id="gc1" style="height:300px"></canvas>` + lienzos(["gc2", "gc3"]) + tabla(["Perfil", "kg/m", "σ MPa", "Util. %"], r.perfiles);
    const um = Math.max(...r.desp.map((d) => Math.hypot(d[0], d[1]))) || 1e-9, k = 0.12 * Math.max(+f.ancho, +f.alto) / um;
    grafico($("#gc1"), { igual: true, titulo: `Deformada ×${k.toFixed(0)} (máx ${f2(um * 1000, 2)} mm)`, series: [
      { x: r.nudos.map((p) => p[0]), y: r.nudos.map((p) => p[1]), color: "#9aa4af", ancho: 4, nombre: "Geometría" },
      { x: r.nudos.map((p, i) => p[0] + k * r.desp[i][0]), y: r.nudos.map((p, i) => p[1] + k * r.desp[i][1]), nombre: "Deformada" }] });
    grafico($("#gc2"), { titulo: "Fuerza axial N (kN)", xlab: "Desarrollo (m)", cero: true, series: [{ x: r.N.map((p) => p[0]), y: r.N.map((p) => p[1]), color: "#3d8fe0", relleno: true }] });
    grafico($("#gc3"), { titulo: "Momento M (kN·m)", xlab: "Desarrollo (m)", cero: true, series: [{ x: r.M.map((p) => p[0]), y: r.M.map((p) => p[1]), color: "#e6b84a", relleno: true }] });
  },
  async dinamica(f) {
    const form = $("#fh");
    if (f.fuente.startsWith("Archivo")) { if (!form.dataset.reg) throw new Error("Elige el archivo del registro (columnas: tiempo s, aceleración g)"); f.registro = form.dataset.reg; f.nombre_registro = form.dataset.nreg; }
    const r = await motor.llamar("dinamica", f, "Calculando respuesta y espectro…");
    $("#hres").innerHTML = kpis([["PGA", f2(r.pga, 3) + " g", esc(r.nombre)], ["u máx", f2(r.umax, 3) + " mm"], ["ü abs máx", f2(r.amax, 3) + " g"],
      ["Sa máx", f2(Math.max(...r.sa), 3) + " g"]]) + lienzos(["gt1", "gt2", "gt3", "gt4"]);
    grafico($("#gt1"), { titulo: "Aceleración del terreno (g)", xlab: "t (s)", series: [{ x: r.t, y: r.ag, ancho: 1 }] });
    grafico($("#gt2"), { titulo: "Desplazamiento relativo (mm)", xlab: "t (s)", series: [{ x: r.t, y: r.u, ancho: 1.2, color: "#3d8fe0" }] });
    grafico($("#gt3"), { titulo: "Aceleración absoluta (g)", xlab: "t (s)", series: [{ x: r.t, y: r.a, ancho: 1, color: "#e6b84a" }] });
    grafico($("#gt4"), { titulo: "Espectro de respuesta Sa (g)", logx: true, xlab: "Periodo T (s)", series: [{ x: r.T, y: r.sa, color: "#e6b84a" }], vlineas: [{ x: +f.T, color: "#9aa4af" }] });
  },
  async costos(f) {
    const form = $("#fh");
    if (!form.dataset.datos) throw new Error("Carga primero el ejemplo");
    const d = leerCostos(form);
    const r = await motor.llamar("costos", { ...d, avance: f.avance, volumen: f.volumen, toneladas: f.toneladas });
    $("#hres").innerHTML = kpis([["Por disparo", "$ " + f2(r.total, 0)], ["Por metro", r.por_m == null ? "—" : "$ " + f2(r.por_m)], ["Por m³", r.por_m3 == null ? "—" : "$ " + f2(r.por_m3)], ["Por tonelada", r.por_t == null ? "—" : "$ " + f2(r.por_t)]]) +
      `<canvas class="grafico" id="gco" style="height:260px"></canvas>` +
      tabla(["Tarea", "Personal", "Equipos", "Materiales", "Total"], r.filas.map(([n_, c]) => [n_, c.Personal, c.Equipos, c.Materiales, c.Total])) +
      tabla(["Equipo", "Amort.", "Int.+seg.", "Repar.", "Energía", "$/h"], Object.entries(r.horario).map(([n_, c]) => [n_, c["Amortización"], c["Interés y seguros"], c["Reparaciones"], c["Energía/combustible"], c.Total])) +
      `<p class="sub">Precios del ejemplo referenciales: reemplázalos por tus cotizaciones y salarios.</p>`;
    barrasH($("#gco"), r.filas.map((x) => x[0]), r.filas.map((x) => x[1].Total));
  },
};
function mapaCalor(canvas, r, op) {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#101317"; g.fillRect(0, 0, W, H);
  const anchoM = r.nx * r.paso, altoM = r.ny * r.paso, k = Math.min((W - 20) / anchoM, (H - 20) / altoM);
  const ox = (W - anchoM * k) / 2, oy = (H - altoM * k) / 2;
  const X = (x) => ox + (x - r.x0) * k, Y = (y) => H - oy - (y - r.y0) * k;
  const lmin = Math.log10(r.st / 4), lmax = Math.max(...r.log_s);
  const turbo = (t) => `hsl(${(1 - t) * 250},85%,${30 + 25 * t}%)`;
  for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) {
    const idx = j * r.nx + i; if (!r.dentro[idx]) continue;
    const t = Math.max(0, Math.min(1, (r.log_s[idx] - lmin) / (lmax - lmin)));
    g.fillStyle = r.log_s[idx] >= Math.log10(r.st) ? turbo(t) : "#1d2228";
    g.fillRect(X(r.x0 + i * r.paso) - k * r.paso / 2, Y(r.y0 + j * r.paso) - k * r.paso / 2, k * r.paso + .6, k * r.paso + .6);
  }
  g.strokeStyle = "#e8ebef"; g.lineWidth = 1.5; g.beginPath();
  op.contorno.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.closePath(); g.stroke();
  g.fillStyle = "#fff"; for (const [x, y] of r.taladros) { g.beginPath(); g.arc(X(x), Y(y), 2.2, 0, 7); g.fill(); }
}

/* ================================================================== MÁS: explosivos e instalación */
$("#b-add-exp").onclick = () => {
  const c = $("#f-exp"); const e = {};
  for (const el of $$("input,select", c)) e[el.name] = el.type === "number" ? Number(el.value) : el.value.trim();
  if (!e.nombre) return tostada("Escribe el nombre del explosivo");
  e.id = "EXP-U" + Date.now();
  const l = explosivosUsuario(); l.push(e); localStorage.setItem("b3d_explosivos", JSON.stringify(l));
  refrescarExplosivos(); tostada("Explosivo agregado");
};
let pedidoInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; });
$("#b-instalar").onclick = async () => {
  if (pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $("#instalar-ayuda").innerHTML = ios ? "En iPhone: abre esta página en <b>Safari</b> → botón <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>."
    : "En Android: menú <b>⋮</b> de Chrome → <b>Instalar aplicación</b> (o «Agregar a pantalla principal»).";
};
if (matchMedia("(display-mode: standalone)").matches) $("#instalar-caja").style.display = "none";

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !window.B3D_MOTOR)
  navigator.serviceWorker.register("sw.js").catch(() => {});

iniciar();
