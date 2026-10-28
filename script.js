/* =====================================================================
   SISTEMA DE SUPERVISI\u00d3N Y MONITOREO DE VIVIENDAS \u2014 script.js
   Toda la l\u00f3gica del sistema est\u00e1 en este archivo.
   ===================================================================== */

/* ---------------- CONFIGURACI\u00d3N (edita aqu\u00ed) ---------------- */
const CONFIG = {
  // PEGA AQUI la URL de la aplicacion web de Google Apps Script (termina en /exec).
  // Si se deja vac\u00eda, el sistema funciona en MODO DEMOSTRACI\u00d3N (datos solo en este navegador;
  // usuario: admin  contrase\u00f1a: admin123).
  API_URL: "https://script.google.com/macros/s/AKfycbzWVIBw-EsbmiOzlG_-qqEhpI9RyRUldb2ZJEnE0K3DVe7YB96F01j6rG9LgxBqFKWf/exec",
  TITULO: "DASHBOARD DE SUPERVISI\u00d3N Y MONITOREO DE VIVIENDAS",
  // D\u00edas que cuentan para el "avance esperado" (0=domingo \u2026 6=s\u00e1bado)
  DIAS_LABORABLES: [1, 2, 3, 4, 5, 6],
  // Plazo para que el jefe de brigada edite o elimine su registro (debe coincidir con Codigo.gs)
  HORAS_EDICION: 24,
  DIAS_HABILES: [1, 2, 3, 4, 5, 6],
  TOP_RANKING: 10
};

(function () {
"use strict";

/* ---------------- utilidades ---------------- */
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MES3 = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DOW = ["Lun","Mar","Mi\u00e9","Jue","Vie","S\u00e1b","Dom"];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, "0");
const fmt = n => Math.round(n || 0).toLocaleString("es-PE");
const pct = n => isFinite(n) ? Math.round(n * 100) + "%" : "\u2014";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normName = s => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const sinTilde = s => normName(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return isFinite(n) && n >= 0 ? n : 0; };
const hoy = new Date();
const hoyTxt = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
const mesTxt = k => `${MESES[+k.slice(5) - 1]} ${k.slice(0, 4)}`;
const fechaPe = f => f ? f.split("-").reverse().join("/") : "";
const actTxt = a => a === "MONITOREO" ? "Monitoreo" : "Supervisi\u00f3n";
function toast(t) { const e = $("#toast"); if (!e) return alert(t); e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 2800); }
// Fecha y hora l\u00edmite para editar: suma HORAS_EDICION horas saltando los d\u00edas no h\u00e1biles (hora de Lima, UTC-5)
function limiteEdicion(creado) {
  const DIA = 86400000, OFF = 5 * 3600000; let t = new Date(creado).getTime() - OFF, falta = CONFIG.HORAS_EDICION * 3600000;
  if (!isFinite(t)) return 0;
  for (let k = 0; k < 60 && falta > 0; k++) { const d = Math.floor(t / DIA), fin = (d + 1) * DIA;
    if (!CONFIG.DIAS_HABILES.includes((d + 4) % 7)) { t = fin; continue; }
    const tramo = Math.min(falta, fin - t); t += tramo; falta -= tramo; }
  return t + OFF;
}
function fechaHora(ms) { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }

/* =====================================================================
   API  (Google Apps Script o modo demostraci\u00f3n)
   ===================================================================== */
const TK = "ssm_token", US = "ssm_usuario";
async function api(action, data = {}) {
  const payload = Object.assign({ action, token: localStorage.getItem(TK) || "" }, data);
  let res;
  if (CONFIG.API_URL) {
    const r = await fetch(CONFIG.API_URL, { method: "POST", body: JSON.stringify(payload) });
    res = await r.json();
  } else {
    res = await Demo.handle(JSON.parse(JSON.stringify(payload)));
  }
  if (!res.ok && res.error === "SESION") {
    localStorage.removeItem(TK); localStorage.removeItem(US);
    if (document.body.dataset.page === "dashboard") location.href = "index.html";
  }
  return res;
}

/* ---------------- backend de demostraci\u00f3n (localStorage) ---------------- */
const Demo = (() => {
  const K = "ssm_demo_v1";
  const load = () => { try { const d = JSON.parse(localStorage.getItem(K)); if (d && d.usuarios) return d; } catch (e) {} return { usuarios: [{ usuario: "admin", nombre: "ADMINISTRADOR", dni: "", rol: "ADMIN", activo: true, clave: "admin123", creado: hoyTxt }], registros: [], metas: [], sesiones: {} }; };
  const save = d => localStorage.setItem(K, JSON.stringify(d));
  const fix = x => { const mon = num(x.monitoreadas), cer = num(x.cerradas), des = num(x.deshabitadas), ren = num(x.renuentes);
    return { actividad: sinTilde(x.actividad).startsWith("MONIT") ? "MONITOREO" : "SUPERVISI\u00d3N", localidad: normName(x.localidad), sector: String(x.sector ?? "").trim(), monitoreadas: mon, cerradas: cer, deshabitadas: des, renuentes: ren, total: x.total === "" || x.total == null ? mon + cer + des + ren : num(x.total), fecha: x.fecha, observaciones: String(x.observaciones || "").trim().slice(0, 500) }; };
  const MSJ_PLAZO = "El plazo para editar o eliminar este registro (24 horas h\u00e1biles) ya venci\u00f3. Pide al administrador que lo corrija.";
  async function handle(p) {
    await new Promise(r => setTimeout(r, 60));
    const d = load(); const a = p.action;
    const find = u => d.usuarios.find(x => x.usuario === String(u || "").trim().toLowerCase());
    if (a === "login") {
      const u = find(p.usuario); if (!u || u.clave !== String(p.clave || "")) return { ok: false, error: "Usuario o contrase\u00f1a incorrectos." };
      if (!u.activo) return { ok: false, error: "Tu usuario est\u00e1 desactivado. Comun\u00edcate con el administrador." };
      const t = "demo-" + Math.random().toString(36).slice(2); d.sesiones[t] = u.usuario; save(d);
      return { ok: true, token: t, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
    }
    const su = find(d.sesiones[p.token]); if (!su || !su.activo) return { ok: false, error: "SESION" };
    const admin = su.rol === "ADMIN";
    const dueno = (r, s) => r.usuario === s.usuario || (!r.usuario && r.jefe === s.nombre);
    switch (a) {
      case "me": return { ok: true, usuario: su.usuario, nombre: su.nombre, rol: su.rol };
      case "logout": delete d.sesiones[p.token]; save(d); return { ok: true };
      case "cambiarClave": if (su.clave !== p.actual) return { ok: false, error: "La contrase\u00f1a actual no es correcta." }; if (String(p.nueva || "").length < 6) return { ok: false, error: "La contrase\u00f1a debe tener al menos 6 caracteres." }; su.clave = p.nueva; save(d); return { ok: true };
      case "listRecords": return { ok: true, registros: d.registros.filter(r => admin || dueno(r, su)) };
      case "listMetas": return { ok: true, metas: d.metas.filter(m => admin || m.jefe === su.nombre) };
      case "saveRecord": {
        const x = p.registro || {}; let jefe = su.nombre, usuario = su.usuario;
        if (admin && x.usuario) { const u = find(x.usuario); if (u) { jefe = u.nombre; usuario = u.usuario; } }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.fecha || "")) return { ok: false, error: "Fecha de intervenci\u00f3n no v\u00e1lida." };
        if (x.total !== "" && x.total != null && num(x.total) < num(x.monitoreadas)) return { ok: false, error: "El total de viviendas no puede ser menor que las viviendas monitoreadas." };
        if (x.id) { const r = d.registros.find(z => z.id === x.id); if (!r) return { ok: false, error: "No se encontr\u00f3 el registro." };
          if (!admin && !dueno(r, su)) return { ok: false, error: "Solo puedes editar tus propios registros." };
          if (!admin && Date.now() > limiteEdicion(r.registrado)) return { ok: false, error: MSJ_PLAZO };
          if (!admin || !x.usuario) { jefe = r.jefe; usuario = r.usuario || (admin ? "" : su.usuario); }
          Object.assign(r, fix(x), { jefe, usuario }); save(d); return { ok: true, id: x.id }; }
        const id = "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        d.registros.push(Object.assign({ id }, fix(x), { jefe, usuario, registrado: new Date().toISOString() })); save(d); return { ok: true, id };
      }
      case "deleteRecord": { const i = d.registros.findIndex(z => z.id === p.id); if (i < 0) return { ok: false, error: "No se encontr\u00f3 el registro." };
        if (!admin && !dueno(d.registros[i], su)) return { ok: false, error: "Solo puedes eliminar tus propios registros." };
        if (!admin && Date.now() > limiteEdicion(d.registros[i].registrado)) return { ok: false, error: MSJ_PLAZO };
        d.registros.splice(i, 1); save(d); return { ok: true }; }
    }
    if (!admin) return { ok: false, error: "Solo el administrador puede hacer esto." };
    switch (a) {
      case "listUsers": return { ok: true, usuarios: d.usuarios.map(u => ({ usuario: u.usuario, nombre: u.nombre, dni: u.dni, rol: u.rol, activo: u.activo, creado: fechaPe(u.creado) })) };
      case "createUser": { const u = String(p.usuario || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,40}$/.test(u)) return { ok: false, error: "El usuario debe tener de 3 a 40 caracteres: letras, n\u00fameros, punto, guion." };
        if (String(p.clave || "").length < 6) return { ok: false, error: "La contrase\u00f1a debe tener al menos 6 caracteres." };
        if (!normName(p.nombre)) return { ok: false, error: "Escribe los nombres y apellidos." };
        if (find(u)) return { ok: false, error: "Ese usuario ya existe." };
        d.usuarios.push({ usuario: u, nombre: normName(p.nombre), dni: String(p.dni || "").trim(), rol: p.rol === "ADMIN" ? "ADMIN" : "JEFE", activo: true, clave: p.clave, creado: hoyTxt }); save(d); return { ok: true }; }
      case "updateUser": { const u = find(p.usuario); if (!u) return { ok: false, error: "No existe el usuario." };
        if (p.activo != null) u.activo = !!p.activo; if (p.clave) { if (String(p.clave).length < 6) return { ok: false, error: "La contrase\u00f1a debe tener al menos 6 caracteres." }; u.clave = p.clave; }
        if (p.rol) u.rol = p.rol; if (p.nombre) u.nombre = normName(p.nombre); if (p.dni != null) u.dni = p.dni; save(d); return { ok: true }; }
      case "setMetas": d.metas = d.metas.filter(m => m.mes !== p.mes).concat((p.metas || []).filter(m => m.meta !== "" && m.meta != null).map(m => ({ mes: p.mes, jefe: normName(m.jefe), meta: num(m.meta) }))); save(d); return { ok: true };
      case "importRecords": { const ids = new Set(d.registros.map(r => r.id)); const byN = {}; d.usuarios.forEach(u => byN[u.nombre] = u.usuario); let n = 0;
        (p.registros || []).forEach(x => { if (!x.id || ids.has(x.id)) return; d.registros.push(Object.assign({ id: x.id }, fix(x), { jefe: normName(x.jefe), usuario: byN[normName(x.jefe)] || "", registrado: new Date().toISOString() })); ids.add(x.id); n++; });
        save(d); return { ok: true, nuevos: n, repetidos: (p.registros || []).length - n }; }
    }
    return { ok: false, error: "Acci\u00f3n desconocida" };
  }
  return { handle };
})();

/* =====================================================================
   PORTADA (index.html)
   ===================================================================== */
function iniciarPortada() {
  $$("#anio,#anio2").forEach(e => e.textContent = hoy.getFullYear());
  if (!CONFIG.API_URL) { const s = $("#estadoSistema"); s.classList.add("off"); s.lastChild.textContent = "MODO DEMOSTRACI\u00d3N"; }
  const frm = $("#frmLogin"), btn = $("#btnIngresar");
  const abrir = () => { btn.hidden = true; $("#mods").hidden = true; frm.hidden = false; $("#lgUsuario").focus(); };
  btn.onclick = async () => {
    if (localStorage.getItem(TK)) { try { const r = await api("me"); if (r.ok) { location.href = "dashboard.html"; return; } } catch (e) {} }
    abrir();
  };
  $("#lgVolver").onclick = () => { frm.hidden = true; btn.hidden = false; $("#mods").hidden = false; };
  frm.onsubmit = async e => {
    e.preventDefault(); const msg = $("#lgMsg"), b = $("#lgBtn"); msg.className = "msg"; msg.textContent = ""; b.disabled = true;
    try {
      const r = await api("login", { usuario: $("#lgUsuario").value.trim(), clave: $("#lgClave").value });
      if (!r.ok) { msg.textContent = r.error || "No se pudo ingresar."; b.disabled = false; return; }
      localStorage.setItem(TK, r.token); localStorage.setItem(US, JSON.stringify({ usuario: r.usuario, nombre: r.nombre, rol: r.rol }));
      msg.className = "msg ok"; msg.textContent = `Bienvenido(a), ${r.nombre}`; location.href = "dashboard.html";
    } catch (err) { msg.textContent = "No hay conexi\u00f3n con el servidor. Revisa tu internet e int\u00e9ntalo de nuevo."; b.disabled = false; }
  };
}

/* =====================================================================
   DASHBOARD (dashboard.html)
   ===================================================================== */
let YO = null, REC = [], METAS = [], USERS = [];
const ST = { calMes: null, calDia: null, jcMes: hoyTxt.slice(0, 7), editId: null, tab: null };
const CH = {};

const TABS_ADMIN = [["dashboard", "\ud83d\udcca Dashboard"], ["registros", "\ud83d\udcdd Registros"], ["registrar", "\u2795 Registrar"], ["usuarios", "\ud83d\udc65 Usuarios"], ["metas", "\ud83c\udfaf Metas"], ["importar", "\ud83d\udce5 Importar Excel"]];
const TABS_JEFE = [["registrar", "\ud83d\udcdd Registrar y mis registros"]];

async function iniciarDashboard() {
  $("#tituloSistema").textContent = CONFIG.TITULO;
  if (!localStorage.getItem(TK)) { location.href = "index.html"; return; }
  let me;
  try { me = await api("me"); } catch (e) { aviso("No hay conexi\u00f3n con el servidor. Revisa tu internet y recarga la p\u00e1gina.", true); $("#cargando").textContent = ""; return; }
  if (!me.ok) { location.href = "index.html"; return; }
  YO = me;
  $("#quien").innerHTML = `${esc(YO.nombre)} <small>\u00b7 ${YO.rol === "ADMIN" ? "Administrador" : "Jefe de brigada"}</small>`;
  if (!CONFIG.API_URL) aviso("Modo demostraci\u00f3n: los datos se guardan solo en este navegador. Para usarlo con los jefes de brigada, configura API_URL en script.js.");
  const tabs = YO.rol === "ADMIN" ? TABS_ADMIN : TABS_JEFE;
  $("#tabs").innerHTML = tabs.map(([k, t]) => `<a href="#${k}" data-t="${k}">${t}</a>`).join("");
  $$("#tabs a").forEach(a => a.onclick = e => { e.preventDefault(); ir(a.dataset.t); history.replaceState(null, "", "#" + a.dataset.t); });
  $("#btnSalir").onclick = async () => { try { await api("logout"); } catch (e) {} localStorage.removeItem(TK); localStorage.removeItem(US); location.href = "index.html"; };
  $("#btnClave").onclick = dialogoClave;
  enlazarRegistro(); if (YO.rol === "ADMIN") enlazarAdmin();
  await cargarTodo();
  $("#cargando").remove();
  const h = location.hash.slice(1);
  ir(tabs.some(t => t[0] === h) ? h : tabs[0][0]);
}
function aviso(t, err) { $("#aviso").innerHTML = `<div class="banner${err ? " err" : ""}">${esc(t)}</div>`; }

async function cargarTodo() {
  try {
    const [r, m, u] = await Promise.all([api("listRecords"), api("listMetas"), YO.rol === "ADMIN" ? api("listUsers") : Promise.resolve({ ok: true, usuarios: [] })]);
    if (!r.ok || !m.ok || !u.ok) throw new Error((r.error || m.error || u.error) || "Error");
    REC = r.registros.map(x => Object.assign({}, x, { jefe: normName(x.jefe), mes: x.fecha.slice(0, 7) })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.fecha));
    METAS = m.metas.map(x => Object.assign({}, x, { jefe: normName(x.jefe) }));
    USERS = u.usuarios || [];
    const d = new Date();
    $("#ultimaAct").textContent = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    $("#ultimaHora").textContent = `Datos cargados: ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
    $("#dlLocalidades").innerHTML = [...new Set(REC.map(r => r.localidad).filter(Boolean))].sort().map(l => `<option value="${esc(l)}">`).join("");
  } catch (e) { aviso("No se pudieron cargar los datos: " + (e.message || e) + ". Recarga la p\u00e1gina.", true); }
}

function ir(t) {
  ST.tab = t;
  $$(".vista").forEach(v => v.hidden = v.id !== "v-" + t);
  $$("#tabs a").forEach(a => a.dataset.t === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  pintar();
}
function pintar() {
  ({ dashboard: pintarDashboard, registros: pintarRegistrosAdmin, registrar: pintarRegistrar, usuarios: pintarUsuarios, metas: pintarMetas, importar: () => {} }[ST.tab] || (() => {}))();
}

/* ---------------- c\u00e1lculos comunes ---------------- */
function diasLab(y, m) { const n = new Date(y, m, 0).getDate(); let tot = 0, el = 0; const h = new Date(); h.setHours(0, 0, 0, 0);
  for (let d = 1; d <= n; d++) { const dt = new Date(y, m - 1, d); if (!CONFIG.DIAS_LABORABLES.includes(dt.getDay())) continue; tot++; if (dt <= h) el++; } return { tot, el }; }
function esperado(meses) { if (meses.length !== 1) return null; const w = diasLab(+meses[0].slice(0, 4), +meses[0].slice(5)); return w.tot ? w.el / w.tot : 0; }
function estado(av, esp, hayMeta) {
  if (!hayMeta) return ["Sin meta", "t-gr", "#94a3b8"];
  const e = esp == null ? 1 : esp;
  if (av >= 1) return ["Cumpli\u00f3", "t-ok", "#16a34a"];
  if (av >= e - 0.05) return ["En ritmo", "t-ok", "#16a34a"];
  if (av >= e - 0.2) return ["Atrasado", "t-am", "#f59e0b"];
  return ["Muy atrasado", "t-ro", "#ef4444"];
}
function metaDe(jefe, meses) { return METAS.filter(m => m.jefe === jefe && meses.includes(m.mes)).reduce((a, m) => a + (m.meta || 0), 0); }
function mesesEntre(a, b) { const out = []; let y = +a.slice(0, 4), m = +a.slice(5, 7); const yb = +b.slice(0, 4), mb = +b.slice(5, 7); while (y < yb || (y === yb && m <= mb)) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 120) break; } return out; }
function sumar(recs, k) { return recs.reduce((a, r) => a + (r[k] || 0), 0); }
function agrupar(recs, key) { const o = {}; recs.forEach(r => { const k = typeof key === "function" ? key(r) : r[key]; (o[k] || (o[k] = [])).push(r); }); return o; }
function nombresJefes() { const s = new Set(); USERS.filter(u => u.rol === "JEFE" && u.activo).forEach(u => s.add(normName(u.nombre))); REC.forEach(r => s.add(r.jefe)); return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, "es")); }

/* ---------------- calendario reutilizable ---------------- */
function calendario(cont, mes, recs, onDia, sel) {
  const y = +mes.slice(0, 4), m = +mes.slice(5), n = new Date(y, m, 0).getDate(), first = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const by = {}; recs.forEach(r => { if (r.mes !== mes) return; const o = by[r.fecha] || (by[r.fecha] = { v: 0, j: new Set() }); o.v += r.monitoreadas || 0; o.j.add(r.jefe); });
  const max = Math.max(1, ...Object.values(by).map(o => o.v));
  let h = DOW.map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < first; i++) h += `<div class="dia fuera"></div>`;
  for (let d = 1; d <= n; d++) { const k = `${mes}-${pad(d)}`, o = by[k], dw = new Date(y, m - 1, d).getDay();
    const bg = o ? `background:color-mix(in srgb,#0e8a9b ${Math.round(8 + o.v / max * 40)}%,#fff)` : "";
    h += `<button type="button" class="dia${dw === 0 ? " dom" : ""}${k === hoyTxt ? " hoy" : ""}${sel === k ? " sel" : ""}" data-k="${k}" style="${bg}" ${o ? "" : "disabled"} aria-label="${d} de ${MESES[m - 1]}: ${o ? fmt(o.v) + " viviendas" : "sin registros"}"><span class="n">${d}</span><span class="v">${o ? fmt(o.v) : ""}</span><span class="j">${o ? o.j.size + (o.j.size === 1 ? " jefe" : " jefes") : ""}</span></button>`; }
  cont.innerHTML = h;
  if (onDia) cont.querySelectorAll(".dia[data-k]").forEach(b => b.onclick = () => onDia(b.dataset.k));
}
function tablaRegistros(recs, opt = {}) {
  if (!recs.length) return `<div class="vacio">${opt.vacio || "Sin registros."}</div>`;
  recs = [...recs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.jefe.localeCompare(b.jefe));
  let h = `<table><thead><tr><th>Fecha</th>${opt.jefe ? '<th class="izq">Jefe de brigada</th>' : ""}<th>Actividad</th><th class="izq">Localidad</th><th>Sector</th><th>Monitoreadas</th><th>Cerradas</th><th>Deshabitadas</th><th>Renuentes</th><th>Total</th><th class="izq">Observaciones</th>${opt.editar ? "<th></th>" : ""}</tr></thead><tbody>`;
  const admin = YO && YO.rol === "ADMIN", ahora = Date.now();
  const acciones = r => { if (admin) return `<button class="btn-mini" data-ed="${esc(r.id)}" type="button">Editar</button><button class="btn-mini rojo" data-del="${esc(r.id)}" type="button">Eliminar</button>`;
    const lim = limiteEdicion(r.registrado);
    return ahora <= lim ? `<button class="btn-mini" data-ed="${esc(r.id)}" type="button">Editar</button><button class="btn-mini rojo" data-del="${esc(r.id)}" type="button">Eliminar</button><br><small class="plazo">Hasta ${fechaHora(lim)}</small>` : `<span class="tag t-gr" title="Pasaron las 24 horas h\u00e1biles para editar">\ud83d\udd12 Cerrado</span>`; };
  recs.forEach(r => { h += `<tr><td>${fechaPe(r.fecha)}</td>${opt.jefe ? `<td class="nom">${esc(r.jefe)}</td>` : ""}<td>${actTxt(r.actividad)}</td><td class="izq">${esc(r.localidad)}</td><td>${esc(r.sector)}</td><td><b>${fmt(r.monitoreadas)}</b></td><td>${fmt(r.cerradas)}</td><td>${fmt(r.deshabitadas)}</td><td>${fmt(r.renuentes)}</td><td>${fmt(r.total)}</td><td class="obs">${esc(r.observaciones || "")}</td>${opt.editar ? `<td>${acciones(r)}</td>` : ""}</tr>`; });
  h += `</tbody><tfoot><tr><td>Total</td>${opt.jefe ? "<td></td>" : ""}<td>${recs.length} reg.</td><td></td><td></td><td>${fmt(sumar(recs, "monitoreadas"))}</td><td>${fmt(sumar(recs, "cerradas"))}</td><td>${fmt(sumar(recs, "deshabitadas"))}</td><td>${fmt(sumar(recs, "renuentes"))}</td><td>${fmt(sumar(recs, "total"))}</td><td></td>${opt.editar ? "<td></td>" : ""}</tr></tfoot></table>`;
  return h;
}
function enlazarEdicion(cont) {
  cont.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => editarRegistro(b.dataset.ed));
  cont.querySelectorAll("[data-del]").forEach(b => b.onclick = () => borrarRegistro(b.dataset.del));
}
function grafico(id, cfg) {
  if (!window.Chart) return;
  if (CH[id]) CH[id].destroy();
  const el = document.getElementById(id); if (!el) return;
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }, cfg.options || {});
  CH[id] = new Chart(el, cfg);
}

/* =====================================================================
   ADMIN \u2014 DASHBOARD
   ===================================================================== */
function enlazarAdmin() {
  ["fLocalidad", "fMes", "fJefe", "fSector", "fActividad", "fDesde", "fHasta"].forEach(id => $("#" + id).onchange = () => { if (id === "fMes") { $("#fDesde").value = ""; $("#fHasta").value = ""; } if (id === "fDesde" || id === "fHasta") $("#fMes").value = ""; ST.calMes = null; ST.calDia = null; pintarDashboard(); });
  $("#btnResetFechas").onclick = () => { $("#fDesde").value = ""; $("#fHasta").value = ""; $("#fMes").value = ""; ST.calMes = null; pintarDashboard(); };
  const buscar = () => { const q = sinTilde($("#fBuscar").value); if (!q) { $("#fJefe").value = ""; return pintarDashboard(); } const j = nombresJefes().find(n => sinTilde(n).includes(q)); if (!j) return toast("No se encontr\u00f3 ese jefe de brigada"); $("#fJefe").value = j; pintarDashboard(); };
  $("#btnBuscar").onclick = buscar; $("#fBuscar").onkeydown = e => { if (e.key === "Enter") buscar(); };
  $("#btnRecargar").onclick = async () => { await cargarTodo(); pintar(); toast("Datos actualizados"); };
  $("#calPrev").onclick = () => moverCal(-1); $("#calNext").onclick = () => moverCal(1);
  $$("[data-xls]").forEach(b => b.onclick = () => descargarExcel(b.dataset.xls));
  // registros
  $("#rMes").onchange = pintarRegistrosAdmin; $("#rJefe").onchange = pintarRegistrosAdmin;
  $("#btnNuevoAdmin").onclick = () => { limpiarForm(false); ir("registrar"); history.replaceState(null, "", "#registrar"); };
  // usuarios
  $("#frmUsuario").onsubmit = crearUsuario; $("#uBuscar").oninput = pintarUsuarios; $("#btnXlsUsuarios").onclick = () => descargarExcel("usuarios");
  // metas
  $("#mMes").onchange = pintarMetas; $("#btnGuardarMetas").onclick = guardarMetas; $("#btnCopiarMetas").onclick = copiarMetas;
  // importar
  $("#fileXls").onchange = leerExcel;
}
function opciones(sel, valores, etiqueta) { const v = sel.value; sel.innerHTML = `<option value="">Todos</option>` + valores.map(x => `<option value="${esc(x)}">${esc(etiqueta ? etiqueta(x) : x)}</option>`).join(""); if (valores.includes(v)) sel.value = v; }
function filtros() { return { loc: $("#fLocalidad").value, mes: $("#fMes").value, jefe: $("#fJefe").value, sector: $("#fSector").value, act: $("#fActividad").value, desde: $("#fDesde").value, hasta: $("#fHasta").value }; }
function filtrar(f, sinFechas) {
  return REC.filter(r => (!f.loc || r.localidad === f.loc) && (!f.jefe || r.jefe === f.jefe) && (!f.sector || String(r.sector) === f.sector) && (!f.act || r.actividad === f.act) &&
    (sinFechas || ((!f.mes || r.mes === f.mes) && (!f.desde || r.fecha >= f.desde) && (!f.hasta || r.fecha <= f.hasta))));
}
function mesesFiltro(f, recs) {
  if (f.mes) return [f.mes];
  if (f.desde || f.hasta) { const all = REC.map(r => r.fecha).sort(); return mesesEntre((f.desde || all[0] || hoyTxt).slice(0, 7), (f.hasta || all[all.length - 1] || hoyTxt).slice(0, 7)); }
  return [...new Set(recs.map(r => r.mes))].sort();
}
function moverCal(d) { let y = +ST.calMes.slice(0, 4), m = +ST.calMes.slice(5) + d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } ST.calMes = `${y}-${pad(m)}`; ST.calDia = null; pintarCalendarioAdmin(); }

function productividad(f, recs, meses) {
  const esp = esperado(meses); const by = agrupar(recs, "jefe");
  const jefes = new Set(Object.keys(by));
  if (!f.loc && !f.sector) METAS.filter(m => meses.includes(m.mes) && (!f.jefe || m.jefe === f.jefe)).forEach(m => jefes.add(m.jefe));
  return [...jefes].map(j => { const rs = by[j] || []; const v = sumar(rs, "monitoreadas"); const meta = metaDe(j, meses); const dias = new Set(rs.map(r => r.fecha)).size;
    const av = meta ? v / meta : NaN; const [lb, cls, col] = estado(av, esp, !!meta);
    return { jefe: j, meta, v, av, faltan: meta ? Math.max(0, meta - v) : null, dias, prom: dias ? v / dias : 0, sup: sumar(rs.filter(r => r.actividad !== "MONITOREO"), "monitoreadas"), mon: sumar(rs.filter(r => r.actividad === "MONITOREO"), "monitoreadas"), cer: sumar(rs, "cerradas"), des: sumar(rs, "deshabitadas"), ren: sumar(rs, "renuentes"), tot: sumar(rs, "total"), n: rs.length, lb, cls, col, esp };
  }).sort((a, b) => (isFinite(b.av) ? b.av : -1) - (isFinite(a.av) ? a.av : -1) || b.v - a.v);
}

function pintarDashboard() {
  const all = REC;
  opciones($("#fLocalidad"), [...new Set(all.map(r => r.localidad).filter(Boolean))].sort());
  opciones($("#fMes"), [...new Set(all.map(r => r.mes).concat(METAS.map(m => m.mes)))].sort().reverse(), mesTxt);
  opciones($("#fJefe"), nombresJefes());
  opciones($("#fSector"), [...new Set(all.map(r => String(r.sector)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })));
  const f = filtros(), recs = filtrar(f), meses = mesesFiltro(f, recs);
  const prod = productividad(f, recs, meses);
  const v = sumar(recs, "monitoreadas"), meta = prod.reduce((a, o) => a + o.meta, 0), jefes = new Set(recs.map(r => r.jefe)).size;
  const esp = esperado(meses);
  $("#notaFiltro").textContent = `Datos del sistema de registro (${fmt(REC.length)} registros). ${meses.length ? "Meta calculada para: " + (meses.length > 4 ? `${mesTxt(meses[0])} a ${mesTxt(meses[meses.length - 1])}` : meses.map(mesTxt).join(", ")) + "." : ""}${f.loc || f.sector ? " Con filtro de localidad o sector, la meta solo se muestra para los jefes con registros." : ""}`;

  const K = [["Viviendas inspeccionadas", v, "\ud83c\udfe0", "#0e8a9b", "Monitoreadas", "#16a34a"], ["Total de viviendas", sumar(recs, "total"), "\ud83c\udfd8\ufe0f", "#16a34a", "Visitadas", "#16a34a"], ["Jefes de brigada", jefes, "\ud83d\udc77", "#4338ca", "Con registros", "#64748b"], ["Intervenciones", recs.length, "\ud83d\udcdd", "#e11d48", "Registros", "#e11d48"], ["Avance de la meta", meta ? pct(v / meta) : "\u2014", "\ud83c\udfaf", "#f97316", meta ? `de ${fmt(meta)} programadas` : "Sin meta registrada", "#ef4444"]];
  $("#kpis").innerHTML = K.map(([t, val, ic, c, s, sc]) => `<div class="kpi"><span class="ic" style="background:${c}">${ic}</span><div><div class="t">${t}</div><div class="v">${typeof val === "number" ? fmt(val) : val}</div><div class="s" style="color:${sc}">${s}</div><div class="s2">del registro</div></div></div>`).join("");

  // avance de la meta
  const p = meta ? v / meta : 0;
  $("#metaPct").textContent = meta ? pct(p) : "\u2014";
  grafico("chMeta", { type: "doughnut", data: { labels: ["Inspeccionadas", "Faltan"], datasets: [{ data: meta ? [Math.min(v, meta), Math.max(0, meta - v)] : [0, 1], backgroundColor: ["#1597a8", "#e2e8f0"], borderWidth: 0 }] }, options: { cutout: "78%", plugins: { legend: { display: false }, tooltip: { enabled: !!meta } } } });
  $("#miniMeta").innerHTML = `<div>\ud83c\udfe0<b>${fmt(v)}</b><small>Viviendas inspeccionadas</small></div><div>\ud83c\udfaf<b>${meta ? fmt(meta) : "\u2014"}</b><small>Viviendas programadas (meta)</small></div><div>\ud83d\udcc5<b>${esp == null ? "\u2014" : pct(esp)}</b><small>Avance esperado a la fecha</small><div class="barra-p"><i style="width:${Math.min(100, p * 100)}%"></i></div></div>`;
  grafico("chCond", { type: "bar", data: { labels: ["Inspeccionadas", "Cerradas", "Renuentes", "Deshabitadas"], datasets: [{ data: [v, sumar(recs, "cerradas"), sumar(recs, "renuentes"), sumar(recs, "deshabitadas")], backgroundColor: ["#5aa9e6", "#ef4444", "#f59e0b", "#7c3aed"] }] } });
  const top = [...prod].filter(o => o.v > 0).sort((a, b) => b.v - a.v).slice(0, CONFIG.TOP_RANKING);
  const paleta = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#7c3aed", "#ec4899", "#64748b", "#0ea5e9", "#0f766e", "#84cc16"];
  grafico("chRank", { type: "bar", data: { labels: top.map(o => o.jefe.split(" ").slice(0, 2).join(" ")), datasets: [{ data: top.map(o => o.v), backgroundColor: top.map((_, i) => paleta[i % 10]), borderRadius: 4 }] }, options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => top[it[0].dataIndex].jefe } } } } });
  const porMes = agrupar(recs, "mes"); const km = Object.keys(porMes).sort();
  grafico("chMes", { type: "bar", data: { labels: km.map(k => `${MES3[+k.slice(5) - 1]} ${k.slice(2, 4)}`), datasets: [{ label: "Inspeccionadas", data: km.map(k => sumar(porMes[k], "monitoreadas")), backgroundColor: "#1597a8", borderRadius: 4 }, { label: "Meta", data: km.map(k => METAS.filter(m => m.mes === k && (!f.jefe || m.jefe === f.jefe)).reduce((a, m) => a + m.meta, 0)), backgroundColor: "#fcd34d", borderRadius: 4 }] }, options: { plugins: { legend: { display: true, position: "bottom" } } } });
  const porLoc = agrupar(recs, "localidad"); const kl = Object.keys(porLoc).sort((a, b) => sumar(porLoc[b], "monitoreadas") - sumar(porLoc[a], "monitoreadas"));
  grafico("chLoc", { type: "bar", data: { labels: kl, datasets: [{ data: kl.map(k => sumar(porLoc[k], "monitoreadas")), backgroundColor: "#22c55e", borderRadius: 4 }] } });
  const porDia = agrupar(recs, "fecha"); const kd = Object.keys(porDia).sort();
  grafico("chDia", { type: "line", data: { labels: kd.map(fechaPe), datasets: [{ data: kd.map(k => sumar(porDia[k], "monitoreadas")), borderColor: "#0e8a9b", backgroundColor: "rgba(14,138,155,.15)", fill: true, tension: .25, pointRadius: 2 }] } });

  // productividad
  $("#subProd").textContent = esp == null ? "Toca un jefe para ver su detalle." : `Toca un jefe para ver su detalle. La marca caf\u00e9 indica el avance esperado a la fecha (${pct(esp)}).`;
  $("#tProd").innerHTML = prod.length ? `<table><thead><tr><th class="izq">Jefe de brigada</th><th>Meta</th><th>Inspeccionadas</th><th>Avance</th><th>Faltan</th><th>Estado</th><th>D\u00edas</th><th>Prom./d\u00eda</th><th>Supervisi\u00f3n</th><th>Monitoreo</th></tr></thead><tbody>${prod.map(o => `<tr class="clic" tabindex="0" data-j="${esc(o.jefe)}"><td class="nom">${esc(o.jefe)}</td><td>${o.meta ? fmt(o.meta) : "\u2014"}</td><td><b>${fmt(o.v)}</b></td><td><div class="av"><span class="barra-p"><i style="width:${o.meta ? Math.min(100, o.av * 100) : 0}%;background:${o.col}"></i>${o.esp != null && o.esp > 0 && o.esp < 1 && o.meta ? `<em style="left:${o.esp * 100}%"></em>` : ""}</span><b>${o.meta ? pct(o.av) : "\u2014"}</b></div></td><td>${o.faltan == null ? "\u2014" : fmt(o.faltan)}</td><td><span class="tag ${o.cls}">${o.lb}</span></td><td>${o.dias}</td><td>${o.dias ? fmt(o.prom) : "\u2014"}</td><td>${fmt(o.sup)}</td><td>${fmt(o.mon)}</td></tr>`).join("")}</tbody><tfoot><tr><td class="izq">Total</td><td>${fmt(meta)}</td><td>${fmt(v)}</td><td>${meta ? pct(v / meta) : "\u2014"}</td><td>${meta ? fmt(Math.max(0, meta - v)) : "\u2014"}</td><td></td><td>${new Set(recs.map(r => r.fecha)).size}</td><td></td><td>${fmt(prod.reduce((a, o) => a + o.sup, 0))}</td><td>${fmt(prod.reduce((a, o) => a + o.mon, 0))}</td></tr></tfoot></table>` : `<div class="vacio">No hay registros con estos filtros.</div>`;
  $$("#tProd tr.clic").forEach(tr => { tr.onclick = () => detalleJefe(tr.dataset.j); tr.onkeydown = e => { if (e.key === "Enter") detalleJefe(tr.dataset.j); }; });

  // localidad
  $("#tLoc").innerHTML = kl.length ? `<table><thead><tr><th class="izq">Localidad</th><th>Intervenciones</th><th>Inspeccionadas</th><th>Cerradas</th><th>Renuentes</th><th>Deshabitadas</th><th>Total viviendas</th><th>Jefes de brigada</th></tr></thead><tbody>${kl.map(k => { const rs = porLoc[k]; return `<tr><td class="izq"><b>${esc(k || "(sin localidad)")}</b></td><td>${rs.length}</td><td><b>${fmt(sumar(rs, "monitoreadas"))}</b></td><td>${fmt(sumar(rs, "cerradas"))}</td><td>${fmt(sumar(rs, "renuentes"))}</td><td>${fmt(sumar(rs, "deshabitadas"))}</td><td>${fmt(sumar(rs, "total"))}</td><td>${new Set(rs.map(r => r.jefe)).size}</td></tr>`; }).join("")}</tbody></table>` : `<div class="vacio">Sin datos.</div>`;

  if (!ST.calMes) { const ks = recs.map(r => r.mes).sort(); ST.calMes = f.mes || (f.hasta ? f.hasta.slice(0, 7) : (ks[ks.length - 1] || hoyTxt.slice(0, 7))); }
  pintarCalendarioAdmin();
}
function pintarCalendarioAdmin() {
  const f = filtros(); const base = filtrar(f, true).filter(r => r.mes === ST.calMes && (!f.desde || r.fecha >= f.desde) && (!f.hasta || r.fecha <= f.hasta));
  $("#calTitulo").textContent = mesTxt(ST.calMes);
  calendario($("#cal"), ST.calMes, base, k => { ST.calDia = ST.calDia === k ? null : k; pintarCalendarioAdmin(); }, ST.calDia);
  $("#calDetalle").innerHTML = ST.calDia ? `<p class="sub"><b>${fechaPe(ST.calDia)}</b> \u2014 intervenciones del d\u00eda</p><div class="tabla">${tablaRegistros(base.filter(r => r.fecha === ST.calDia), { jefe: true })}</div>` : "";
  // producci\u00f3n diaria
  const y = +ST.calMes.slice(0, 4), m = +ST.calMes.slice(5), n = new Date(y, m, 0).getDate();
  const by = {}; base.forEach(r => { (by[r.jefe] || (by[r.jefe] = Array(n + 1).fill(0)))[+r.fecha.slice(8)] += r.monitoreadas || 0; });
  const js = Object.keys(by).sort((a, b) => a.localeCompare(b, "es"));
  if (!js.length) { $("#tDiaria").innerHTML = `<div class="vacio">Sin registros en ${mesTxt(ST.calMes)}.</div>`; return; }
  const max = Math.max(1, ...js.flatMap(j => by[j].slice(1)));
  const col = Array(n + 1).fill(0);
  let h = `<table><thead><tr><th class="izq">Jefe de brigada</th>${Array.from({ length: n }, (_, i) => `<th class="hm" style="${new Date(y, m - 1, i + 1).getDay() === 0 ? "color:#ef4444" : ""}">${i + 1}</th>`).join("")}<th>Total</th><th>Meta</th><th>Avance</th></tr></thead><tbody>`;
  js.forEach(j => { let t = 0; h += `<tr><td class="nom">${esc(j)}</td>`; for (let d = 1; d <= n; d++) { const v = by[j][d]; t += v; col[d] += v; h += `<td class="hm" style="${v ? `background:color-mix(in srgb,#0e8a9b ${Math.round(10 + v / max * 55)}%,#fff)` : ""}">${v ? fmt(v) : ""}</td>`; }
    const me = metaDe(j, [ST.calMes]); h += `<td><b>${fmt(t)}</b></td><td>${me ? fmt(me) : "\u2014"}</td><td>${me ? pct(t / me) : "\u2014"}</td></tr>`; });
  h += `</tbody><tfoot><tr><td class="izq">Total</td>${col.slice(1).map(v => `<td class="hm">${v ? fmt(v) : ""}</td>`).join("")}<td>${fmt(col.reduce((a, b) => a + b, 0))}</td><td></td><td></td></tr></tfoot></table>`;
  $("#tDiaria").innerHTML = h;
}
function detalleJefe(j) {
  const f = filtros(); const recs = filtrar(f).filter(r => r.jefe === j); const meses = mesesFiltro(f, filtrar(f)); const meta = metaDe(j, meses); const v = sumar(recs, "monitoreadas");
  const mes = (recs.map(r => r.mes).sort().pop()) || ST.calMes;
  $("#dlgT").textContent = j;
  $("#dlgB").innerHTML = `<p class="sub">${fmt(v)} viviendas inspeccionadas${meta ? ` de ${fmt(meta)} programadas (${pct(v / meta)})` : " \u00b7 sin meta registrada"} \u00b7 ${new Set(recs.map(r => r.fecha)).size} d\u00edas con intervenci\u00f3n</p><p class="sub"><b>${mesTxt(mes)}</b></p><div class="cal" id="dlgCal"></div><div class="tabla">${tablaRegistros(recs)}</div>`;
  calendario($("#dlgCal"), mes, recs, null, null);
  $("#dlg").showModal();
}

/* ---------------- descargas Excel ---------------- */
function libro(hojas, nombre) {
  if (!window.XLSX) return toast("No carg\u00f3 el componente de Excel; revisa tu internet");
  const wb = XLSX.utils.book_new();
  hojas.forEach(([n, aoa]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = (aoa[0] || []).map((_, i) => ({ wch: Math.min(45, Math.max(10, ...aoa.map(r => String(r[i] ?? "").length + 2))) })); XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31)); });
  XLSX.writeFile(wb, nombre);
}
const CAB_REG = ["ACTIVIDAD", "LOCALIDAD", "SECTOR", "VIVIENDAS MONITOREADAS", "CERRADAS", "DESHABITADAS", "RENUENTES", "TOTAL DE VIVIENDAS", "FECHA DE INTERVENCION", "JEFE DE BRIGADA", "OBSERVACIONES"];
const filaReg = r => [r.actividad, r.localidad, r.sector, r.monitoreadas, r.cerradas, r.deshabitadas, r.renuentes, r.total, fechaPe(r.fecha), r.jefe, r.observaciones || ""];
function descargarExcel(tipo) {
  const f = filtros(), recs = filtrar(f), meses = mesesFiltro(f, recs), sello = hoyTxt.replace(/-/g, "");
  const titulo = [`Supervisi\u00f3n y monitoreo de viviendas \u2014 ${f.mes ? mesTxt(f.mes) : f.desde || f.hasta ? `del ${fechaPe(f.desde) || "inicio"} al ${fechaPe(f.hasta) || "\u00faltimo registro"}` : "todos los registros"}`];
  if (tipo === "jefes") { const p = productividad(f, recs, meses);
    libro([["Productividad", [titulo, [], ["JEFE DE BRIGADA", "META", "INSPECCIONADAS", "AVANCE %", "FALTAN", "ESTADO", "D\u00cdAS", "PROMEDIO/D\u00cdA", "SUPERVISI\u00d3N", "MONITOREO", "CERRADAS", "DESHABITADAS", "RENUENTES", "TOTAL VIVIENDAS"], ...p.map(o => [o.jefe, o.meta || "", o.v, o.meta ? Math.round(o.av * 1000) / 10 : "", o.faltan ?? "", o.lb, o.dias, Math.round(o.prom * 10) / 10, o.sup, o.mon, o.cer, o.des, o.ren, o.tot])]]], `Productividad_jefes_${sello}.xlsx`); }
  else if (tipo === "localidad") { const g = agrupar(recs, "localidad");
    libro([["Localidad", [titulo, [], ["LOCALIDAD", "INTERVENCIONES", "INSPECCIONADAS", "CERRADAS", "RENUENTES", "DESHABITADAS", "TOTAL VIVIENDAS", "JEFES DE BRIGADA"], ...Object.keys(g).sort().map(k => [k, g[k].length, sumar(g[k], "monitoreadas"), sumar(g[k], "cerradas"), sumar(g[k], "renuentes"), sumar(g[k], "deshabitadas"), sumar(g[k], "total"), new Set(g[k].map(r => r.jefe)).size])]]], `Detalle_localidad_${sello}.xlsx`); }
  else if (tipo === "diaria") { const y = +ST.calMes.slice(0, 4), m = +ST.calMes.slice(5), n = new Date(y, m, 0).getDate(); const rs = filtrar(f, true).filter(r => r.mes === ST.calMes); const by = {};
    rs.forEach(r => { (by[r.jefe] || (by[r.jefe] = Array(n + 1).fill(0)))[+r.fecha.slice(8)] += r.monitoreadas; });
    libro([["Producci\u00f3n diaria", [[`Producci\u00f3n diaria \u2014 ${mesTxt(ST.calMes)}`], [], ["JEFE DE BRIGADA", ...Array.from({ length: n }, (_, i) => i + 1), "TOTAL", "META", "AVANCE %"], ...Object.keys(by).sort().map(j => { const t = by[j].slice(1).reduce((a, b) => a + b, 0), me = metaDe(j, [ST.calMes]); return [j, ...by[j].slice(1).map(v => v || ""), t, me || "", me ? Math.round(t / me * 1000) / 10 : ""]; })]]], `Produccion_diaria_${ST.calMes}.xlsx`); }
  else if (tipo === "mensual") { const ks = [...new Set(filtrar(f, true).map(r => r.mes))].sort(); const rs = filtrar(f, true); const by = agrupar(rs, "jefe");
    libro([["Consolidado mensual", [["Consolidado mensual de viviendas inspeccionadas (y % de la meta)"], [], ["JEFE DE BRIGADA", ...ks.flatMap(k => [mesTxt(k), "% meta"]), "TOTAL"], ...Object.keys(by).sort().map(j => { let t = 0; const c = ks.flatMap(k => { const v = sumar(by[j].filter(r => r.mes === k), "monitoreadas"), me = metaDe(j, [k]); t += v; return [v, me ? Math.round(v / me * 1000) / 10 : ""]; }); return [j, ...c, t]; })]]], `Consolidado_mensual_${sello}.xlsx`); }
  else if (tipo === "registros") libro([["Registros", [CAB_REG, ...[...recs].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(filaReg)]]], `Registros_${sello}.xlsx`);
  else if (tipo === "usuarios") libro([["Usuarios", [["USUARIO", "NOMBRES Y APELLIDOS", "DNI", "ROL", "ESTADO", "CREADO"], ...USERS.map(u => [u.usuario, u.nombre, u.dni, u.rol === "ADMIN" ? "Administrador" : "Jefe de brigada", u.activo ? "Activo" : "Desactivado", u.creado])]]], `Usuarios_${sello}.xlsx`);
}

/* =====================================================================
   ADMIN \u2014 REGISTROS
   ===================================================================== */
function pintarRegistrosAdmin() {
  const meses = [...new Set(REC.map(r => r.mes))].sort().reverse();
  const sm = $("#rMes"), prev = sm.value; sm.innerHTML = `<option value="">Todos</option>` + meses.map(k => `<option value="${k}">${mesTxt(k)}</option>`).join(""); sm.value = meses.includes(prev) ? prev : (prev === "" && sm.dataset.ok ? "" : (meses[0] || "")); sm.dataset.ok = 1;
  opciones($("#rJefe"), [...new Set(REC.map(r => r.jefe))].sort((a, b) => a.localeCompare(b, "es")));
  const recs = REC.filter(r => (!sm.value || r.mes === sm.value) && (!$("#rJefe").value || r.jefe === $("#rJefe").value));
  $("#rCuenta").textContent = `${recs.length} registros \u00b7 ${fmt(sumar(recs, "monitoreadas"))} viviendas monitoreadas`;
  $("#tRegAdmin").innerHTML = tablaRegistros(recs, { jefe: true, editar: true });
  enlazarEdicion($("#tRegAdmin"));
}

/* =====================================================================
   REGISTRAR (jefe de brigada y administrador)
   ===================================================================== */
const F = {};
let totalManual = false;
function enlazarRegistro() {
  ["Usuario", "Actividad", "Fecha", "Localidad", "Sector", "Mon", "Tot", "Obs"].forEach(k => F[k] = $("#rg" + k));
  F.Fecha.value = hoyTxt; F.Fecha.max = hoyTxt;
  F.Tot.oninput = () => totalManual = F.Tot.value !== "";
  F.Mon.oninput = () => { if (!totalManual) F.Tot.value = F.Mon.value; };
  $("#frmReg").onsubmit = guardarRegistro;
  $("#rgCancelar").onclick = () => limpiarForm(false);
  $("#jcPrev").onclick = () => { let y = +ST.jcMes.slice(0, 4), m = +ST.jcMes.slice(5) - 1; if (m < 1) { m = 12; y--; } ST.jcMes = `${y}-${pad(m)}`; pintarRegistrar(); };
  $("#jcNext").onclick = () => { let y = +ST.jcMes.slice(0, 4), m = +ST.jcMes.slice(5) + 1; if (m > 12) { m = 1; y++; } ST.jcMes = `${y}-${pad(m)}`; pintarRegistrar(); };
  F.Usuario.onchange = pintarRegistrar;
}
function jefeActual() {
  if (YO.rol !== "ADMIN") return normName(YO.nombre);
  const u = USERS.find(x => x.usuario === F.Usuario.value); return u ? normName(u.nombre) : "";
}
function pintarRegistrar() {
  const admin = YO.rol === "ADMIN";
  $("#lblJefeAdmin").hidden = !admin;
  if (admin) { const v = F.Usuario.value; const js = USERS.filter(u => u.rol === "JEFE" && u.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    F.Usuario.innerHTML = `<option value="">\u2014 Elige un jefe de brigada \u2014</option>` + js.map(u => `<option value="${esc(u.usuario)}">${esc(u.nombre)}</option>`).join(""); if (js.some(u => u.usuario === v)) F.Usuario.value = v; }
  const jefe = jefeActual();
  const mios = REC.filter(r => admin ? (jefe && r.jefe === jefe) : true);
  const recMes = mios.filter(r => r.mes === ST.jcMes);
  const v = sumar(recMes, "monitoreadas"), meta = jefe ? metaDe(jefe, [ST.jcMes]) : 0, esp = esperado([ST.jcMes]);
  const [lb, , col] = estado(meta ? v / meta : NaN, esp, !!meta);
  $("#kpisJefe").innerHTML = (!admin || jefe) ? [["Meta del mes", meta ? fmt(meta) : "\u2014", "\ud83c\udfaf", "#f97316", mesTxt(ST.jcMes)], ["Viviendas inspeccionadas", fmt(v), "\ud83c\udfe0", "#0e8a9b", "Monitoreadas"], ["Avance", meta ? pct(v / meta) : "\u2014", "\ud83d\udcc8", col, lb], ["Faltan", meta ? fmt(Math.max(0, meta - v)) : "\u2014", "\u23f3", "#ef4444", "Para cumplir la meta"], ["D\u00edas con intervenci\u00f3n", new Set(recMes.map(r => r.fecha)).size, "\ud83d\udcc5", "#4338ca", "En el mes"], ["Cerradas", fmt(sumar(recMes, "cerradas")), "\ud83d\udd12", "#ef4444", "En el mes"], ["Renuentes", fmt(sumar(recMes, "renuentes")), "\ud83d\udeab", "#f59e0b", "En el mes"], ["Deshabitadas", fmt(sumar(recMes, "deshabitadas")), "\ud83c\udfda\ufe0f", "#7c3aed", "En el mes"]]
    .map(([t, val, ic, c, s]) => `<div class="kpi"><span class="ic" style="background:${c}">${ic}</span><div><div class="t">${t}</div><div class="v">${val}</div><div class="s" style="color:${c}">${s}</div></div></div>`).join("") : "";
  $("#jcTitulo").textContent = mesTxt(ST.jcMes);
  calendario($("#jCal"), ST.jcMes, mios, null, null);
  $("#tMisReg").innerHTML = tablaRegistros(recMes, { editar: true, vacio: admin && !jefe ? "Elige un jefe de brigada para ver sus registros." : `A\u00fan no hay registros en ${mesTxt(ST.jcMes)}.` });
  enlazarEdicion($("#tMisReg"));
}
function limpiarForm(conservar) {
  ST.editId = null; totalManual = false;
  $("#frmTitulo").textContent = "\ud83d\udcdd Registrar intervenci\u00f3n"; $("#rgBtn").textContent = "Guardar registro"; $("#rgCancelar").hidden = true;
  F.Mon.value = ""; F.Tot.value = ""; F.Obs.value = "";
  if (!conservar) { F.Localidad.value = ""; F.Sector.value = ""; F.Fecha.value = hoyTxt; F.Actividad.value = "SUPERVISI\u00d3N"; }
}
async function guardarRegistro(e) {
  e.preventDefault(); const msg = $("#rgMsg"); msg.className = "msg"; msg.textContent = "";
  if (YO.rol === "ADMIN" && !F.Usuario.value && !ST.editId) { msg.textContent = "Elige el jefe de brigada."; return F.Usuario.focus(); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(F.Fecha.value)) { msg.textContent = "Elige la fecha de intervenci\u00f3n."; return F.Fecha.focus(); }
  if (F.Fecha.value > hoyTxt) { msg.textContent = "La fecha no puede ser posterior a hoy."; return F.Fecha.focus(); }
  if (F.Mon.value === "") { msg.textContent = "Escribe las viviendas monitoreadas."; return F.Mon.focus(); }
  if (F.Tot.value !== "" && num(F.Tot.value) < num(F.Mon.value)) { msg.textContent = "El total de viviendas no puede ser menor que las viviendas monitoreadas."; return F.Tot.focus(); }
  const reg = { id: ST.editId || "", usuario: YO.rol === "ADMIN" ? F.Usuario.value : "", actividad: F.Actividad.value, fecha: F.Fecha.value, localidad: normName(F.Localidad.value), sector: F.Sector.value.trim(),
    monitoreadas: num(F.Mon.value), cerradas: 0, deshabitadas: 0, renuentes: 0, total: F.Tot.value === "" ? "" : num(F.Tot.value), observaciones: F.Obs.value.trim() };
  if (ST.editId) { const o = REC.find(x => x.id === ST.editId); if (o) Object.assign(reg, { cerradas: o.cerradas, deshabitadas: o.deshabitadas, renuentes: o.renuentes }); }
  const b = $("#rgBtn"); b.disabled = true;
  try { const r = await api("saveRecord", { registro: reg }); if (!r.ok) { msg.textContent = r.error; b.disabled = false; return; }
    const era = !!ST.editId; await cargarTodo(); ST.jcMes = reg.fecha.slice(0, 7); limpiarForm(true); pintarRegistrar();
    msg.className = "msg ok"; msg.textContent = era ? "Registro actualizado." : "Registro guardado."; toast(era ? "Registro actualizado" : "Registro guardado"); F.Mon.focus();
  } catch (err) { msg.textContent = "No hay conexi\u00f3n con el servidor. El registro no se guard\u00f3; int\u00e9ntalo de nuevo."; }
  b.disabled = false;
}
function editarRegistro(id) {
  const r = REC.find(x => x.id === id); if (!r) return;
  if (YO.rol !== "ADMIN" && Date.now() > limiteEdicion(r.registrado)) return toast("Ya pasaron las 24 horas h\u00e1biles para editar este registro");
  if (ST.tab !== "registrar") { ir("registrar"); history.replaceState(null, "", "#registrar"); }
  ST.editId = id; totalManual = true;
  if (YO.rol === "ADMIN") { const u = USERS.find(x => normName(x.nombre) === r.jefe); F.Usuario.value = u ? u.usuario : ""; }
  F.Actividad.value = r.actividad === "MONITOREO" ? "MONITOREO" : "SUPERVISI\u00d3N"; F.Fecha.value = r.fecha; F.Localidad.value = r.localidad; F.Sector.value = r.sector;
  F.Mon.value = r.monitoreadas; F.Tot.value = r.total; F.Obs.value = r.observaciones || "";
  $("#frmTitulo").textContent = `\u270f\ufe0f Editar registro del ${fechaPe(r.fecha)}${YO.rol === "ADMIN" ? " \u2014 " + r.jefe : ""}`; $("#rgBtn").textContent = "Guardar cambios"; $("#rgCancelar").hidden = false;
  ST.jcMes = r.mes; pintarRegistrar(); window.scrollTo({ top: 0, behavior: "smooth" }); F.Mon.focus();
}
async function borrarRegistro(id) {
  const r = REC.find(x => x.id === id); if (!r) return;
  if (YO.rol !== "ADMIN" && Date.now() > limiteEdicion(r.registrado)) return toast("Ya pasaron las 24 horas h\u00e1biles para eliminar este registro");
  if (!confirm(`\u00bfEliminar el registro del ${fechaPe(r.fecha)} de ${r.jefe} (${r.monitoreadas} viviendas en ${r.localidad})?`)) return;
  try { const x = await api("deleteRecord", { id }); if (!x.ok) return toast(x.error); await cargarTodo(); pintar(); toast("Registro eliminado"); }
  catch (e) { toast("No hay conexi\u00f3n con el servidor"); }
}

/* =====================================================================
   ADMIN \u2014 USUARIOS
   ===================================================================== */
function pintarUsuarios() {
  const q = sinTilde($("#uBuscar").value);
  const us = USERS.filter(u => !q || sinTilde(u.nombre + " " + u.usuario + " " + u.dni).includes(q)).sort((a, b) => (a.rol === b.rol ? 0 : a.rol === "ADMIN" ? -1 : 1) || a.nombre.localeCompare(b.nombre, "es"));
  $("#tUsuarios").innerHTML = us.length ? `<table><thead><tr><th class="izq">Usuario</th><th class="izq">Nombres y apellidos</th><th>DNI</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead><tbody>${us.map(u => `<tr><td class="izq"><b>${esc(u.usuario)}</b></td><td class="nom">${esc(u.nombre)}</td><td>${esc(u.dni)}</td><td>${u.rol === "ADMIN" ? "Administrador" : "Jefe de brigada"}</td><td><span class="tag ${u.activo ? "t-ok" : "t-ro"}">${u.activo ? "Activo" : "Desactivado"}</span></td><td>${esc(u.creado)}</td><td><button class="btn-mini" type="button" data-clave="${esc(u.usuario)}">Nueva contrase\u00f1a</button>${u.usuario !== YO.usuario ? `<button class="btn-mini ${u.activo ? "rojo" : ""}" type="button" data-act="${esc(u.usuario)}">${u.activo ? "Desactivar" : "Activar"}</button>` : ""}</td></tr>`).join("")}</tbody></table>` : `<div class="vacio">Sin resultados de b\u00fasqueda.</div>`;
  $$("#tUsuarios [data-clave]").forEach(b => b.onclick = async () => { const c = prompt(`Nueva contrase\u00f1a para ${b.dataset.clave} (m\u00ednimo 6 caracteres):`); if (!c) return;
    try { const r = await api("updateUser", { usuario: b.dataset.clave, clave: c }); toast(r.ok ? "Contrase\u00f1a cambiada" : r.error); } catch (e) { toast("No hay conexi\u00f3n con el servidor"); } });
  $$("#tUsuarios [data-act]").forEach(b => b.onclick = async () => { const u = USERS.find(x => x.usuario === b.dataset.act); if (u.activo && !confirm(`\u00bfDesactivar a ${u.nombre}? Ya no podr\u00e1 ingresar al sistema.`)) return;
    try { const r = await api("updateUser", { usuario: u.usuario, activo: !u.activo }); if (!r.ok) return toast(r.error); await cargarTodo(); pintarUsuarios(); toast(u.activo ? "Usuario desactivado" : "Usuario activado"); } catch (e) { toast("No hay conexi\u00f3n con el servidor"); } });
}
async function crearUsuario(e) {
  e.preventDefault(); const msg = $("#uMsg"); msg.className = "msg"; msg.textContent = ""; const b = $("#uBtn"); b.disabled = true;
  try { const r = await api("createUser", { rol: $("#uRol").value, usuario: $("#uUsuario").value.trim().toLowerCase(), clave: $("#uClave").value, dni: $("#uDni").value.trim(), nombre: $("#uNombre").value });
    if (!r.ok) msg.textContent = r.error; else { msg.className = "msg ok"; msg.textContent = `Cuenta creada. Entrega al jefe de brigada su usuario \u00ab${$("#uUsuario").value.trim().toLowerCase()}\u00bb y su contrase\u00f1a.`; $("#frmUsuario").reset(); await cargarTodo(); pintarUsuarios(); }
  } catch (err) { msg.textContent = "No hay conexi\u00f3n con el servidor."; }
  b.disabled = false;
}

/* =====================================================================
   ADMIN \u2014 METAS
   ===================================================================== */
function pintarMetas() {
  if (!$("#mMes").value) { const ks = REC.map(r => r.mes).sort(); $("#mMes").value = hoyTxt.slice(0, 7) > (ks[ks.length - 1] || "") && METAS.some(m => m.mes === hoyTxt.slice(0, 7)) ? hoyTxt.slice(0, 7) : (ks[ks.length - 1] || hoyTxt.slice(0, 7)); }
  const mes = $("#mMes").value; const js = new Set(nombresJefes()); METAS.filter(m => m.mes === mes).forEach(m => js.add(m.jefe));
  const lista = [...js].sort((a, b) => a.localeCompare(b, "es"));
  const hecho = agrupar(REC.filter(r => r.mes === mes), "jefe");
  $("#tMetas").innerHTML = lista.length ? `<table><thead><tr><th class="izq">Jefe de brigada</th><th>Viviendas programadas (meta)</th><th>Inspeccionadas en ${esc(mesTxt(mes))}</th><th>Avance</th></tr></thead><tbody>${lista.map(j => { const m = METAS.find(x => x.mes === mes && x.jefe === j); const v = sumar(hecho[j] || [], "monitoreadas");
    return `<tr><td class="nom">${esc(j)}</td><td><input class="meta" type="number" min="0" data-j="${esc(j)}" value="${m ? m.meta : ""}" aria-label="Meta de ${esc(j)}"></td><td>${fmt(v)}</td><td>${m && m.meta ? pct(v / m.meta) : "\u2014"}</td></tr>`; }).join("")}</tbody></table>` : `<div class="vacio">Primero crea los usuarios de los jefes de brigada.</div>`;
  const tot = METAS.filter(m => m.mes === mes).reduce((a, m) => a + m.meta, 0); $("#mTotal").textContent = tot ? `Meta total del mes: ${fmt(tot)} viviendas` : "Este mes a\u00fan no tiene metas guardadas.";
}
async function guardarMetas() {
  const mes = $("#mMes").value, msg = $("#mMsg"); if (!mes) return;
  const metas = $$("#tMetas input.meta").filter(i => i.value !== "").map(i => ({ jefe: i.dataset.j, meta: num(i.value) }));
  const b = $("#btnGuardarMetas"); b.disabled = true; msg.className = "msg"; msg.textContent = "";
  try { const r = await api("setMetas", { mes, metas }); if (!r.ok) msg.textContent = r.error; else { await cargarTodo(); pintarMetas(); msg.className = "msg ok"; msg.textContent = `Metas de ${mesTxt(mes)} guardadas.`; } }
  catch (e) { msg.textContent = "No hay conexi\u00f3n con el servidor."; }
  b.disabled = false;
}
function copiarMetas() {
  const mes = $("#mMes").value; let y = +mes.slice(0, 4), m = +mes.slice(5) - 1; if (m < 1) { m = 12; y--; } const ant = `${y}-${pad(m)}`;
  const prev = METAS.filter(x => x.mes === ant); if (!prev.length) return toast(`No hay metas en ${mesTxt(ant)}`);
  let n = 0; $$("#tMetas input.meta").forEach(i => { const p = prev.find(x => x.jefe === i.dataset.j); if (p && i.value === "") { i.value = p.meta; n++; } });
  toast(n ? `${n} metas copiadas. Revisa y pulsa \u00abGuardar metas\u00bb.` : "No hab\u00eda metas vac\u00edas que completar");
}

/* =====================================================================
   ADMIN \u2014 IMPORTAR EXCEL
   ===================================================================== */
let PEND = [];
function parseFecha(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && window.XLSX) { const d = XLSX.SSF.parse_date_code(v); return d && d.y > 1990 && d.y < 2100 ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null; }
  const s = String(v).trim(); let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null;
}
function filasARegistros(rows) {
  const out = [], visto = {}; let omitidas = 0, hi = -1, c = {};
  for (let i = 0; i < Math.min(15, rows.length); i++) { const hd = (rows[i] || []).map(sinTilde); const b = k => hd.findIndex(x => k.some(t => x.includes(t)));
    if (b(["JEFE", "INSPECTOR"]) >= 0 && b(["FECHA"]) >= 0) { hi = i; c = { act: b(["ACTIVIDAD"]), loc: b(["LOCALIDAD"]), sec: b(["SECTOR"]), mon: b(["MONITOREADAS", "INSPECCIONADAS"]), cer: b(["CERRADAS"]), des: b(["DESHABITADAS"]), ren: b(["RENUENTES"]), tot: b(["TOTAL"]), obs: b(["OBSERVACION"]), fec: b(["FECHA"]), jef: b(["JEFE", "INSPECTOR"]) }; break; } }
  if (hi < 0) return { out, omitidas };
  for (let i = hi + 1; i < rows.length; i++) { const r = rows[i] || []; const jefe = normName(r[c.jef]), fecha = parseFecha(r[c.fec]); if (jefe && !fecha) omitidas++; if (!jefe || !fecha) continue;
    const g = k => c[k] >= 0 ? num(r[c[k]]) : 0; const mon = g("mon"), cer = g("cer"), des = g("des"), ren = g("ren"); const tr = c.tot >= 0 ? r[c.tot] : null;
    const x = { actividad: sinTilde(c.act >= 0 ? r[c.act] : "").startsWith("MONIT") ? "MONITOREO" : "SUPERVISI\u00d3N", localidad: c.loc >= 0 ? normName(r[c.loc]) : "", sector: c.sec >= 0 && r[c.sec] != null ? String(r[c.sec]).trim() : "", monitoreadas: mon, cerradas: cer, deshabitadas: des, renuentes: ren, total: tr == null || tr === "" ? mon + cer + des + ren : num(tr), fecha, jefe, observaciones: c.obs >= 0 && r[c.obs] != null ? String(r[c.obs]).trim().slice(0, 500) : "" };
    const key = [x.fecha, x.jefe, x.actividad, x.localidad, x.sector, mon, cer, des, ren, x.total].join("|"); visto[key] = (visto[key] || 0) + 1; x.id = `x-${hash(key)}-${visto[key]}`; out.push(x); }
  return { out, omitidas };
}
async function leerExcel(e) {
  const f = e.target.files[0]; if (!f) return; if (!window.XLSX) return toast("No carg\u00f3 el lector de Excel; revisa tu internet");
  try { const wb = XLSX.read(await f.arrayBuffer(), { type: "array" }); let out = [], om = 0;
    wb.SheetNames.forEach(n => { const res = filasARegistros(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null })); out = out.concat(res.out); om += res.omitidas; });
    PEND = out;
    if (!out.length) { $("#impPrev").innerHTML = `<div class="vacio">No encontr\u00e9 filas v\u00e1lidas. Revisa que la hoja tenga las columnas FECHA DE INTERVENCION y JEFE DE BRIGADA con datos.</div>`; return; }
    const bym = agrupar(out, r => r.fecha.slice(0, 7)); const nombres = new Set(USERS.map(u => normName(u.nombre))); const sinU = [...new Set(out.map(r => r.jefe))].filter(j => !nombres.has(j));
    $("#impPrev").innerHTML = `<div class="tabla"><table><thead><tr><th class="izq">Mes</th><th>Registros</th><th>Viviendas monitoreadas</th><th>Jefes de brigada</th></tr></thead><tbody>${Object.keys(bym).sort().map(k => `<tr><td class="izq">${mesTxt(k)}</td><td>${bym[k].length}</td><td>${fmt(sumar(bym[k], "monitoreadas"))}</td><td>${new Set(bym[k].map(r => r.jefe)).size}</td></tr>`).join("")}</tbody></table></div>
      ${om ? `<p class="sub"><span class="tag t-am">Atenci\u00f3n</span> ${om} filas tienen jefe de brigada pero no tienen una fecha v\u00e1lida; no se importar\u00e1n.</p>` : ""}
      ${sinU.length ? `<p class="sub"><span class="tag t-gr">Nota</span> ${sinU.length} jefes del Excel a\u00fan no tienen usuario: ${sinU.map(esc).join(", ")}. Sus registros se importan igual; crea su usuario con el mismo nombre para que los vean al ingresar.</p>` : ""}
      <div class="f-linea"><button class="btn-teal" id="btnImportar" type="button">Importar ${out.length} registros</button><span class="msg" id="impMsg"></span></div>`;
    $("#btnImportar").onclick = importar;
  } catch (err) { $("#impPrev").innerHTML = `<div class="vacio">No se pudo leer el archivo: ${esc(err.message || err)}</div>`; }
}
async function importar() {
  const b = $("#btnImportar"), msg = $("#impMsg"); b.disabled = true; let nuevos = 0, rep = 0;
  try { for (let i = 0; i < PEND.length; i += 300) { msg.className = "msg ok"; msg.textContent = `Importando ${Math.min(i + 300, PEND.length)} de ${PEND.length}\u2026`;
      const r = await api("importRecords", { registros: PEND.slice(i, i + 300) }); if (!r.ok) throw new Error(r.error); nuevos += r.nuevos; rep += r.repetidos || 0; }
    await cargarTodo(); msg.className = "msg ok"; msg.textContent = `Listo: ${nuevos} registros nuevos${rep ? `, ${rep} ya exist\u00edan` : ""}.`; toast("Importaci\u00f3n terminada"); PEND = [];
  } catch (e) { msg.className = "msg"; msg.textContent = "La importaci\u00f3n se detuvo: " + (e.message || e); b.disabled = false; }
}

/* =====================================================================
   CAMBIAR CONTRASE\u00d1A
   ===================================================================== */
function dialogoClave() {
  $("#dlgT").textContent = "Cambiar mi contrase\u00f1a";
  $("#dlgB").innerHTML = `<form id="frmClave" class="form-u" style="padding:16px;max-width:380px"><label>Contrase\u00f1a actual<input type="password" id="cActual" required autocomplete="current-password"></label><label>Nueva contrase\u00f1a<input type="password" id="cNueva" required minlength="6" autocomplete="new-password"></label><label>Repite la nueva contrase\u00f1a<input type="password" id="cRep" required minlength="6" autocomplete="new-password"></label><p class="msg" id="cMsg"></p><button class="btn-azul" type="submit">Cambiar contrase\u00f1a</button></form>`;
  $("#frmClave").onsubmit = async e => { e.preventDefault(); const m = $("#cMsg"); m.className = "msg";
    if ($("#cNueva").value !== $("#cRep").value) { m.textContent = "Las contrase\u00f1as nuevas no coinciden."; return; }
    try { const r = await api("cambiarClave", { actual: $("#cActual").value, nueva: $("#cNueva").value }); if (!r.ok) { m.textContent = r.error; return; } m.className = "msg ok"; m.textContent = "Contrase\u00f1a cambiada."; setTimeout(() => $("#dlg").close(), 900); }
    catch (err) { m.textContent = "No hay conexi\u00f3n con el servidor."; } };
  $("#dlg").showModal();
}

/* ---------------- arranque ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  const x = $("#dlgX"); if (x) x.onclick = () => $("#dlg").close();
  if (document.body.dataset.page === "portada") iniciarPortada();
  else if (document.body.dataset.page === "dashboard") iniciarDashboard();
});
})();
