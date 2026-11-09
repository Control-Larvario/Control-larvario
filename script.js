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
  TOP_RANKING: 10,
  // Sigla que va despu\u00e9s del correlativo del informe: INFORME N\u00b0 015-2026-UNGET
  INF_SIGLA: "UNGET"
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
const MSJ_PLAZO_INF = "El plazo para editar o eliminar este informe (24 horas h\u00e1biles) ya venci\u00f3. Pide al administrador que lo corrija.";
function horaOk(v) { const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})/); if (m && +m[1] < 24 && +m[2] < 60) return `${pad(+m[1])}:${m[2]}`;
  if (typeof v === "number" && v >= 0 && v < 1) { const t = Math.round(v * 1440); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; } return ""; }
function duracion(hi, hf) { if (!hi || !hf) return ""; const a = hi.split(":"), b = hf.split(":"); const m = (+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1]); if (m <= 0) return ""; return (m >= 60 ? Math.floor(m / 60) + " h " : "") + (m % 60 ? (m % 60) + " min" : "").trim(); }
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
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const to = ctl ? setTimeout(() => ctl.abort(), action === "me" ? 15000 : 30000) : 0;
    try { const r = await fetch(CONFIG.API_URL, { method: "POST", body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined }); res = await r.json(); }
    finally { clearTimeout(to); }
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
    return { actividad: sinTilde(x.actividad).startsWith("MONIT") ? "MONITOREO" : "SUPERVISI\u00d3N", localidad: normName(x.localidad), sector: String(x.sector ?? "").trim(), monitoreadas: mon, cerradas: cer, deshabitadas: des, renuentes: ren, total: x.total === "" || x.total == null ? mon + cer + des + ren : num(x.total), fecha: x.fecha, observaciones: String(x.observaciones || "").trim().slice(0, 500), horaInicio: horaOk(x.horaInicio), horaFin: horaOk(x.horaFin) }; };
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
        const hi = horaOk(x.horaInicio), hf = horaOk(x.horaFin);
        if ((!x.id && (!hi || !hf)) || ((hi || hf) && (!hi || !hf))) return { ok: false, error: "Escribe la hora de inicio y la hora de t\u00e9rmino." };
        if (hi && hf <= hi) return { ok: false, error: "La hora de t\u00e9rmino debe ser posterior a la hora de inicio." };
        if (x.total !== "" && x.total != null && num(x.total) < num(x.monitoreadas)) return { ok: false, error: "El total de viviendas no puede ser menor que las viviendas monitoreadas." };
        if (x.id) { const r = d.registros.find(z => z.id === x.id); if (!r) return { ok: false, error: "No se encontr\u00f3 el registro." };
          if (!admin && !dueno(r, su)) return { ok: false, error: "Solo puedes editar tus propios registros." };
          if (!admin && Date.now() > limiteEdicion(r.registrado)) return { ok: false, error: MSJ_PLAZO };
          if (!admin || !x.usuario) { jefe = r.jefe; usuario = r.usuario || (admin ? "" : su.usuario); }
          Object.assign(r, fix(x), { jefe, usuario }); save(d); return { ok: true, id: x.id }; }
        if (x.cid && d.registros.some(z => z.id === x.cid)) return { ok: true, id: x.cid, repetido: true };
        const id = x.cid || "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        d.registros.push(Object.assign({ id }, fix(x), { jefe, usuario, registrado: new Date().toISOString() })); save(d); return { ok: true, id };
      }
      case "deleteRecord": { const i = d.registros.findIndex(z => z.id === p.id); if (i < 0) return { ok: false, error: "No se encontr\u00f3 el registro." };
        if (!admin && !dueno(d.registros[i], su)) return { ok: false, error: "Solo puedes eliminar tus propios registros." };
        if (!admin && Date.now() > limiteEdicion(d.registros[i].registrado)) return { ok: false, error: MSJ_PLAZO };
        d.registros.splice(i, 1); save(d); return { ok: true }; }
      case "listInformes": return { ok: true, informes: (d.informes || []).filter(r => admin || r.usuario === su.usuario) };
      case "saveInforme": { d.informes = d.informes || []; const x = p.informe || {}; const c = limpiarInforme(x); if (!c.ok) return { ok: false, error: c.error };
        let jefe = su.nombre, usuario = su.usuario; if (admin && x.usuario) { const u = find(x.usuario); if (u) { jefe = u.nombre; usuario = u.usuario; } }
        if (x.id) { const r = d.informes.find(z => z.id === x.id); if (!r) return { ok: false, error: "No se encontr\u00f3 el informe." };
          if (!admin && r.usuario !== su.usuario) return { ok: false, error: "Solo puedes editar tus propios informes." };
          if (!admin && Date.now() > limiteEdicion(r.registrado)) return { ok: false, error: MSJ_PLAZO_INF };
          if (!admin || !x.usuario) { jefe = r.jefe; usuario = r.usuario; }
          Object.assign(r, c.o, { jefe, usuario }); save(d); return { ok: true, id: x.id }; }
        if (x.cid && d.informes.some(z => z.id === x.cid)) return { ok: true, id: x.cid, repetido: true };
        const id = x.cid || "i-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const an = c.o.fecha.slice(0, 4), mx = Math.max(0, ...d.informes.map(z => { const m = String(z.numero || "").match(/^(\d+)-(\d{4})$/); return m && m[2] === an ? +m[1] : 0; }));
        const numero = String(mx + 1).padStart(3, "0") + "-" + an;
        d.informes.push(Object.assign({ id }, c.o, { jefe, usuario, numero, registrado: new Date().toISOString() })); save(d); return { ok: true, id, numero }; }
      case "deleteInforme": { d.informes = d.informes || []; const i = d.informes.findIndex(z => z.id === p.id); if (i < 0) return { ok: false, error: "No se encontr\u00f3 el informe." };
        if (!admin && d.informes[i].usuario !== su.usuario) return { ok: false, error: "Solo puedes eliminar tus propios informes." };
        if (!admin && Date.now() > limiteEdicion(d.informes[i].registrado)) return { ok: false, error: MSJ_PLAZO_INF };
        d.informes.splice(i, 1); save(d); return { ok: true }; }
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
    if (localStorage.getItem(TK)) { try { const r = await api("me"); if (r.ok) { location.href = "dashboard.html"; return; } } catch (e) { if (localStorage.getItem(US)) { location.href = "dashboard.html"; return; } } }
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

const TABS_ADMIN = [["dashboard", "\ud83d\udcca Dashboard"], ["registros", "\ud83d\udcdd Registros"], ["informes", "\ud83d\udcc4 Informes"], ["registrar", "\u2795 Registrar"], ["usuarios", "\ud83d\udc65 Usuarios"], ["metas", "\ud83c\udfaf Metas"], ["importar", "\ud83d\udce5 Importar Excel"]];
const TABS_JEFE = [["registrar", "\ud83d\udcdd Registrar y mis registros"], ["informes", "\ud83d\udcc4 Informes de inspectores"]];

async function iniciarDashboard() {
  $("#tituloSistema").textContent = CONFIG.TITULO;
  if (!localStorage.getItem(TK)) { location.href = "index.html"; return; }
  let me;
  try { me = await api("me"); } catch (e) {
    let u = null; try { u = JSON.parse(localStorage.getItem(US) || "null"); } catch (x) {}
    if (!u || !u.usuario) { aviso("No hay conexi\u00f3n con el servidor. Revisa tu internet y recarga la p\u00e1gina.", true); $("#cargando").textContent = ""; return; }
    me = Object.assign({ ok: true, sinSenal: true }, u);
  }
  if (!me.ok) { location.href = "index.html"; return; }
  YO = me;
  const libs = YO.rol === "ADMIN" ? cargarLib("chart") : null;
  if (YO.rol === "ADMIN") cargarLib("xlsx");
  { const c = document.createElement("div"); c.id = "colaAviso"; $("#aviso").after(c); }
  $("#quien").innerHTML = `${esc(YO.nombre)} <small>\u00b7 ${YO.rol === "ADMIN" ? "Administrador" : "Jefe de brigada"}</small>`;
  if (!CONFIG.API_URL) aviso("Modo demostraci\u00f3n: los datos se guardan solo en este navegador. Para usarlo con los jefes de brigada, configura API_URL en script.js.");
  const tabs = YO.rol === "ADMIN" ? TABS_ADMIN : TABS_JEFE;
  $("#tabs").innerHTML = tabs.map(([k, t]) => `<a href="#${k}" data-t="${k}">${t}</a>`).join("");
  $$("#tabs a").forEach(a => a.onclick = e => { e.preventDefault(); ir(a.dataset.t); history.replaceState(null, "", "#" + a.dataset.t); });
  $("#btnSalir").onclick = async () => { const n = COLA.get().length; if (n && !confirm(`Tienes ${n} pendiente(s) sin enviar en este celular. Se enviar\u00e1n cuando vuelvas a ingresar con tu usuario. \u00bfCerrar sesi\u00f3n de todos modos?`)) return; try { await api("logout"); } catch (e) {} localStorage.removeItem(TK); localStorage.removeItem(US); location.href = "index.html"; };
  $("#btnClave").onclick = dialogoClave;
  montarInformes(); enlazarRegistro(); if (YO.rol === "ADMIN") enlazarAdmin();
  await cargarTodo();
  if (libs) await libs;
  $("#cargando").remove();
  const h = location.hash.slice(1);
  ir(tabs.some(t => t[0] === h) ? h : tabs[0][0]);
  window.addEventListener("online", () => sincronizar());
  setInterval(() => { if (COLA.get().length && navigator.onLine !== false) sincronizar(); }, 60000);
  sincronizar();
}
function aviso(t, err) { $("#aviso").innerHTML = `<div class="banner${err ? " err" : ""}">${esc(t)}</div>`; }

async function cargarTodo() {
  const jefe = YO.rol !== "ADMIN", kc = "ssm_datos_" + YO.usuario, eraSin = ST.sinSenal;
  let datos = null, desde = 0;
  try {
    const [r, m, u] = await Promise.all([api("listRecords"), api("listMetas"), jefe ? Promise.resolve({ ok: true, usuarios: [] }) : api("listUsers")]);
    if (!r.ok || !m.ok || !u.ok) throw new Error((r.error || m.error || u.error) || "Error");
    datos = { r: r.registros, m: m.metas, u: u.usuarios || [] }; ST.sinSenal = false;
    if (jefe) { try { localStorage.setItem(kc, JSON.stringify({ r: datos.r, m: datos.m, t: Date.now() })); } catch (x) {} }
    if (eraSin) $("#aviso").innerHTML = "";
  } catch (e) {
    let c = null; if (jefe) { try { c = JSON.parse(localStorage.getItem(kc) || "null"); } catch (x) {} }
    if (c) { datos = { r: c.r || [], m: c.m || [], u: [] }; desde = c.t; ST.sinSenal = true;
      aviso(`\ud83d\udcf6 Sin conexi\u00f3n: se muestran tus datos guardados el ${fechaHora(c.t)}. Puedes seguir registrando; lo nuevo se enviar\u00e1 solo cuando haya se\u00f1al.`); }
    else aviso("No se pudieron cargar los datos: " + (e.message || e) + ". Recarga la p\u00e1gina.", true);
  }
  if (datos) {
    REC = datos.r.map(x => Object.assign({}, x, { jefe: normName(x.jefe), mes: x.fecha.slice(0, 7) })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.fecha));
    METAS = datos.m.map(x => Object.assign({}, x, { jefe: normName(x.jefe) }));
    if (!jefe) USERS = datos.u;
    const d = desde ? new Date(desde) : new Date();
    $("#ultimaAct").textContent = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    $("#ultimaHora").textContent = `${desde ? "Datos guardados" : "Datos cargados"}: ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
    $("#dlLocalidades").innerHTML = [...new Set(REC.map(r => r.localidad).filter(Boolean))].sort().map(l => `<option value="${esc(l)}">`).join("");
  }
  await cargarInformes();
  mezclarPendientes();
}

function ir(t) {
  ST.tab = t;
  $$(".vista").forEach(v => v.hidden = v.id !== "v-" + t);
  $$("#tabs a").forEach(a => a.dataset.t === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  pintar();
}
function pintar() {
  ({ dashboard: pintarDashboard, registros: pintarRegistrosAdmin, registrar: pintarRegistrar, usuarios: pintarUsuarios, metas: pintarMetas, informes: pintarInformes, importar: () => {} }[ST.tab] || (() => {}))();
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
  let h = `<table><thead><tr><th>Fecha</th>${opt.jefe ? '<th class="izq">Jefe de brigada</th>' : ""}<th>Actividad</th><th class="izq">Localidad</th><th>Sector</th><th>Monitoreadas</th><th>Cerradas</th><th>Deshabitadas</th><th>Renuentes</th><th>Total</th><th>Horario</th><th class="izq">Observaciones</th>${opt.editar ? "<th></th>" : ""}</tr></thead><tbody>`;
  const admin = YO && YO.rol === "ADMIN", ahora = Date.now();
  const acciones = r => { if (r.pend) return `<span class="tag ${r.err ? "t-ro" : "t-am"}" title="${esc(r.err || "Se enviar\u00e1 cuando haya se\u00f1al")}">${r.err ? "\u274c No se pudo enviar" : "\u23f3 Por enviar"}</span>`; if (admin) return `<button class="btn-mini" data-ed="${esc(r.id)}" type="button">Editar</button><button class="btn-mini rojo" data-del="${esc(r.id)}" type="button">Eliminar</button>`;
    const lim = limiteEdicion(r.registrado);
    return ahora <= lim ? `<button class="btn-mini" data-ed="${esc(r.id)}" type="button">Editar</button><button class="btn-mini rojo" data-del="${esc(r.id)}" type="button">Eliminar</button><br><small class="plazo">Hasta ${fechaHora(lim)}</small>` : `<span class="tag t-gr" title="Pasaron las 24 horas h\u00e1biles para editar">\ud83d\udd12 Cerrado</span>`; };
  recs.forEach(r => { h += `<tr><td>${fechaPe(r.fecha)}</td>${opt.jefe ? `<td class="nom">${esc(r.jefe)}</td>` : ""}<td>${actTxt(r.actividad)}</td><td class="izq">${esc(r.localidad)}</td><td>${esc(r.sector)}</td><td><b>${fmt(r.monitoreadas)}</b></td><td>${fmt(r.cerradas)}</td><td>${fmt(r.deshabitadas)}</td><td>${fmt(r.renuentes)}</td><td>${fmt(r.total)}</td><td>${r.horaInicio && r.horaFin ? `${r.horaInicio} \u2013 ${r.horaFin}<br><small class="plazo">${duracion(r.horaInicio, r.horaFin)}</small>` : "\u2014"}</td><td class="obs">${esc(r.observaciones || "")}</td>${opt.editar ? `<td>${acciones(r)}</td>` : ""}</tr>`; });
  h += `</tbody><tfoot><tr><td>Total</td>${opt.jefe ? "<td></td>" : ""}<td>${recs.length} reg.</td><td></td><td></td><td>${fmt(sumar(recs, "monitoreadas"))}</td><td>${fmt(sumar(recs, "cerradas"))}</td><td>${fmt(sumar(recs, "deshabitadas"))}</td><td>${fmt(sumar(recs, "renuentes"))}</td><td>${fmt(sumar(recs, "total"))}</td><td></td><td></td>${opt.editar ? "<td></td>" : ""}</tr></tfoot></table>`;
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
  if (!window.XLSX) { toast("Cargando el componente de Excel\u2026"); return cargarLib("xlsx").then(() => window.XLSX ? libro(hojas, nombre) : toast("No carg\u00f3 el componente de Excel; revisa tu internet")); }
  const wb = XLSX.utils.book_new();
  hojas.forEach(([n, aoa]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = (aoa[0] || []).map((_, i) => ({ wch: Math.min(45, Math.max(10, ...aoa.map(r => String(r[i] ?? "").length + 2))) })); XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31)); });
  XLSX.writeFile(wb, nombre);
}
const CAB_REG = ["ACTIVIDAD", "LOCALIDAD", "SECTOR", "VIVIENDAS MONITOREADAS", "CERRADAS", "DESHABITADAS", "RENUENTES", "TOTAL DE VIVIENDAS", "FECHA DE INTERVENCION", "JEFE DE BRIGADA", "HORA INICIO", "HORA TERMINO", "OBSERVACIONES"];
const filaReg = r => [r.actividad, r.localidad, r.sector, r.monitoreadas, r.cerradas, r.deshabitadas, r.renuentes, r.total, fechaPe(r.fecha), r.jefe, r.horaInicio || "", r.horaFin || "", r.observaciones || ""];
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
  ["Usuario", "Actividad", "Fecha", "Hi", "Hf", "Localidad", "Sector", "Mon", "Tot", "Obs"].forEach(k => F[k] = $("#rg" + k));
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
  F.Mon.value = ""; F.Tot.value = ""; F.Obs.value = ""; F.Hi.value = ""; F.Hf.value = "";
  if (!conservar) { F.Localidad.value = ""; F.Sector.value = ""; F.Fecha.value = hoyTxt; F.Actividad.value = "SUPERVISI\u00d3N"; }
}
async function guardarRegistro(e) {
  e.preventDefault(); const msg = $("#rgMsg"); msg.className = "msg"; msg.textContent = "";
  if (YO.rol === "ADMIN" && !F.Usuario.value && !ST.editId) { msg.textContent = "Elige el jefe de brigada."; return F.Usuario.focus(); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(F.Fecha.value)) { msg.textContent = "Elige la fecha de intervenci\u00f3n."; return F.Fecha.focus(); }
  if (F.Fecha.value > hoyTxt) { msg.textContent = "La fecha no puede ser posterior a hoy."; return F.Fecha.focus(); }
  if (!F.Hi.value) { msg.textContent = "Escribe la hora de inicio."; return F.Hi.focus(); }
  if (!F.Hf.value) { msg.textContent = "Escribe la hora de t\u00e9rmino."; return F.Hf.focus(); }
  if (F.Hf.value <= F.Hi.value) { msg.textContent = "La hora de t\u00e9rmino debe ser posterior a la hora de inicio."; return F.Hf.focus(); }
  { const n = new Date(); const ahora = `${pad(n.getHours())}:${pad(n.getMinutes())}`; if (F.Fecha.value === hoyTxt && F.Hf.value > ahora) { msg.textContent = "La hora de t\u00e9rmino no puede ser posterior a la hora actual."; return F.Hf.focus(); } }
  if (F.Mon.value === "") { msg.textContent = "Escribe las viviendas monitoreadas."; return F.Mon.focus(); }
  if (F.Tot.value !== "" && num(F.Tot.value) < num(F.Mon.value)) { msg.textContent = "El total de viviendas no puede ser menor que las viviendas monitoreadas."; return F.Tot.focus(); }
  const reg = { id: ST.editId || "", usuario: YO.rol === "ADMIN" ? F.Usuario.value : "", actividad: F.Actividad.value, fecha: F.Fecha.value, localidad: normName(F.Localidad.value), sector: F.Sector.value.trim(),
    monitoreadas: num(F.Mon.value), cerradas: 0, deshabitadas: 0, renuentes: 0, total: F.Tot.value === "" ? "" : num(F.Tot.value), observaciones: F.Obs.value.trim(), horaInicio: F.Hi.value, horaFin: F.Hf.value };
  if (ST.editId) { const o = REC.find(x => x.id === ST.editId); if (o) Object.assign(reg, { cerradas: o.cerradas, deshabitadas: o.deshabitadas, renuentes: o.renuentes }); }
  const nuevo = !ST.editId; if (nuevo) reg.cid = nuevoCid("r");
  const enCola = () => { encolar("saveRecord", { registro: reg }, Object.assign({}, reg, { id: reg.cid, jefe: YO.rol === "ADMIN" ? jefeActual() : normName(YO.nombre), usuario: reg.usuario || YO.usuario, total: reg.total === "" ? reg.monitoreadas : reg.total }), `Registro del ${fechaPe(reg.fecha)} \u2013 ${reg.localidad || "sin localidad"} (${reg.monitoreadas} viv.)`);
    ST.jcMes = reg.fecha.slice(0, 7); limpiarForm(true); pintarRegistrar(); msg.className = "msg ok"; msg.textContent = "\ud83d\udcf6 Sin se\u00f1al: el registro qued\u00f3 guardado en este celular y se enviar\u00e1 solo cuando haya conexi\u00f3n."; toast("Guardado en el celular (pendiente de env\u00edo)"); };
  if (nuevo && navigator.onLine === false) return enCola();
  if (!nuevo && navigator.onLine === false) { msg.textContent = "Para editar un registro necesitas conexi\u00f3n a internet."; return; }
  const b = $("#rgBtn"); b.disabled = true;
  try { const r = await api("saveRecord", { registro: reg }); if (!r.ok) { msg.textContent = r.error; b.disabled = false; return; }
    const era = !!ST.editId; await cargarTodo(); ST.jcMes = reg.fecha.slice(0, 7); limpiarForm(true); pintarRegistrar();
    msg.className = "msg ok"; msg.textContent = era ? "Registro actualizado." : "Registro guardado."; toast(era ? "Registro actualizado" : "Registro guardado"); F.Mon.focus();
  } catch (err) { if (nuevo) enCola(); else msg.textContent = "No hay conexi\u00f3n con el servidor. Los cambios no se guardaron; int\u00e9ntalo de nuevo."; }
  b.disabled = false;
}
function editarRegistro(id) {
  const r = REC.find(x => x.id === id); if (!r) return;
  if (YO.rol !== "ADMIN" && Date.now() > limiteEdicion(r.registrado)) return toast("Ya pasaron las 24 horas h\u00e1biles para editar este registro");
  if (ST.tab !== "registrar") { ir("registrar"); history.replaceState(null, "", "#registrar"); }
  ST.editId = id; totalManual = true;
  if (YO.rol === "ADMIN") { const u = USERS.find(x => normName(x.nombre) === r.jefe); F.Usuario.value = u ? u.usuario : ""; }
  F.Actividad.value = r.actividad === "MONITOREO" ? "MONITOREO" : "SUPERVISI\u00d3N"; F.Fecha.value = r.fecha; F.Localidad.value = r.localidad; F.Sector.value = r.sector;
  F.Mon.value = r.monitoreadas; F.Tot.value = r.total; F.Obs.value = r.observaciones || ""; F.Hi.value = r.horaInicio || ""; F.Hf.value = r.horaFin || "";
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
    if (b(["JEFE", "INSPECTOR"]) >= 0 && b(["FECHA"]) >= 0) { hi = i; c = { act: b(["ACTIVIDAD"]), loc: b(["LOCALIDAD"]), sec: b(["SECTOR"]), mon: b(["MONITOREADAS", "INSPECCIONADAS"]), cer: b(["CERRADAS"]), des: b(["DESHABITADAS"]), ren: b(["RENUENTES"]), tot: b(["TOTAL"]), obs: b(["OBSERVACION"]), hi: b(["HORA INICIO", "HORA DE INICIO"]), hf: b(["HORA TERMINO", "HORA DE TERMINO", "HORA FIN"]), fec: b(["FECHA"]), jef: b(["JEFE", "INSPECTOR"]) }; break; } }
  if (hi < 0) return { out, omitidas };
  for (let i = hi + 1; i < rows.length; i++) { const r = rows[i] || []; const jefe = normName(r[c.jef]), fecha = parseFecha(r[c.fec]); if (jefe && !fecha) omitidas++; if (!jefe || !fecha) continue;
    const g = k => c[k] >= 0 ? num(r[c[k]]) : 0; const mon = g("mon"), cer = g("cer"), des = g("des"), ren = g("ren"); const tr = c.tot >= 0 ? r[c.tot] : null;
    const x = { actividad: sinTilde(c.act >= 0 ? r[c.act] : "").startsWith("MONIT") ? "MONITOREO" : "SUPERVISI\u00d3N", localidad: c.loc >= 0 ? normName(r[c.loc]) : "", sector: c.sec >= 0 && r[c.sec] != null ? String(r[c.sec]).trim() : "", monitoreadas: mon, cerradas: cer, deshabitadas: des, renuentes: ren, total: tr == null || tr === "" ? mon + cer + des + ren : num(tr), fecha, jefe, observaciones: c.obs >= 0 && r[c.obs] != null ? String(r[c.obs]).trim().slice(0, 500) : "", horaInicio: c.hi >= 0 ? horaOk(r[c.hi]) : "", horaFin: c.hf >= 0 ? horaOk(r[c.hf]) : "" };
    const key = [x.fecha, x.jefe, x.actividad, x.localidad, x.sector, mon, cer, des, ren, x.total].join("|"); visto[key] = (visto[key] || 0) + 1; x.id = `x-${hash(key)}-${visto[key]}`; out.push(x); }
  return { out, omitidas };
}
async function leerExcel(e) {
  const f = e.target.files[0]; if (!f) return; if (!window.XLSX) await cargarLib("xlsx"); if (!window.XLSX) return toast("No carg\u00f3 el lector de Excel; revisa tu internet");
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
   INFORMES DE ACTIVIDADES DE VIGILANCIA Y CONTROL VECTORIAL - ARBOVIROSIS
   El jefe de brigada registra el informe sobre la vivienda inspeccionada
   por un inspector (igual que el formato f\u00edsico). El administrador ve el
   \u00abReporte de informes\u00bb y puede imprimir cada informe con el formato f\u00edsico.
   ===================================================================== */
let INF = [];
const SI = { editId: null, nuevo: false, error: "", lista: [] };
const FI = {};
const CAMPOS_INF = [["A", "a"], ["De", "de"], ["Asunto", "asunto"], ["Fecha", "fecha"], ["FechaInsp", "fechaInsp"], ["Hora", "hora"], ["Direccion", "direccion"], ["Sector", "sector"], ["Mza", "mza"], ["Ov", "ov"], ["Eess", "establecimiento"], ["Distrito", "distrito"], ["Prop", "propietario"], ["Insp", "inspector"]];
const numInf = i => i && i.numero ? `${i.numero}-${CONFIG.INF_SIGLA}` : "S/N";
const fechaLarga = f => f ? [String(+f.slice(8)), MESES[+f.slice(5, 7) - 1].toLowerCase(), f.slice(0, 4)] : ["", "", ""];

// Limpia y valida un informe (lo usan el formulario y el modo demostraci\u00f3n)
function limpiarInforme(x) {
  const t = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n || 200);
  const o = { a: normName(x.a), de: normName(x.de), asunto: t(x.asunto), fecha: x.fecha || "", fechaInsp: x.fechaInsp || "", hora: horaOk(x.hora), direccion: t(x.direccion), sector: t(x.sector, 30), mza: t(x.mza, 30), ov: t(x.ov, 30),
    establecimiento: normName(x.establecimiento), distrito: normName(x.distrito), propietario: normName(x.propietario), inspector: normName(x.inspector),
    observaciones: (Array.isArray(x.observaciones) ? x.observaciones : String(x.observaciones || "").split("\n")).map(s => t(s, 500)).filter(Boolean).slice(0, 30) };
  const dt = /^\d{4}-\d{2}-\d{2}$/;
  if (!dt.test(o.fecha)) return { error: "Fecha del informe no v\u00e1lida." };
  if (!dt.test(o.fechaInsp)) return { error: "Fecha de la inspecci\u00f3n no v\u00e1lida." };
  if (o.fechaInsp > o.fecha) return { error: "La fecha de la inspecci\u00f3n no puede ser posterior a la fecha del informe." };
  if (!o.hora) return { error: "Escribe la hora de la inspecci\u00f3n." };
  for (const [k, n] of [["a", "A (dirigido a)"], ["de", "DE (remitente)"], ["asunto", "Asunto (situaci\u00f3n encontrada en)"], ["direccion", "Jr./Av./Psje."], ["establecimiento", "Establecimiento de salud"], ["distrito", "Distrito"], ["inspector", "Inspector"]])
    if (!o[k]) return { error: `Falta completar: ${n}.` };
  if (!o.observaciones.length) return { error: "Escribe al menos una observaci\u00f3n." };
  return { ok: true, o };
}

/* ---------- estilos del m\u00f3dulo y de la hoja del informe ---------- */
const IH_CSS = `
.ih{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:13.5px}
.ih-logo{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:700;color:#333;margin-bottom:16px;line-height:1.3}
.ih-logo img{height:44px}
.ih-logo small{font-weight:400;font-size:9px}
.ih h1{font-size:15px;text-align:center;text-decoration:underline;margin:6px 0 8px;letter-spacing:.01em}
.ih-num{text-align:right;font-weight:700;font-size:13px;margin:0 0 20px}
.ih-num span{color:#1e3a8a;border-bottom:1px dotted #444;padding:0 6px}
.ih-cab{border-collapse:collapse;width:100%;margin-bottom:20px}
.ih-cab th{text-align:left;width:120px;padding:8px 0 8px 34px;font-weight:700;vertical-align:bottom}
.ih-cab td{padding:8px 0;vertical-align:bottom}
.ih-cab td.p{width:16px;font-weight:700}
.ih-v{color:#1e3a8a;font-weight:600;border-bottom:1px dotted #444;padding:0 4px;line-height:1.5}
.ih-v.c{display:inline-block;min-width:46px;text-align:center}
.ih-cab .ih-v.l{display:inline-block;min-width:75%}
.ih-cab .ih-v.m{display:inline-block;min-width:55%}
.ih-p{line-height:2.4;text-align:justify;text-justify:inter-word;margin:0}
.ih-p .nw{white-space:nowrap}
.ih-so{font-weight:700;margin:14px 0 2px}
.ih-obs{margin:0;padding-left:24px;line-height:2.2}
.ih-obs li{border-bottom:1px dotted #444;color:#1e3a8a;font-weight:600;text-align:justify;text-justify:inter-word}
.ih-obs li::marker{color:#111;font-weight:700}
.ih-obs li.vac{list-style:none}
.ih-firma{margin:80px auto 0;width:340px;text-align:center}
.ih-firma div{display:flex;align-items:flex-end;gap:8px;font-weight:700;font-size:15px}
.ih-firma i{flex:1;border-bottom:1px dotted #111;height:1px}
.ih-firma b{display:block;margin:6px 0 0 66px;font-size:12px}
.ih-firma small{display:block;margin-left:66px;color:#555;font-size:11px}`;
const INF_CSS = `
#v-informes [hidden]{display:none!important}
.inf-card{background:#fff;border-radius:14px;box-shadow:0 2px 10px rgba(15,23,42,.08);padding:18px 20px;margin:0 0 18px;color:#0f172a}
.inf-card h2{margin:0 0 4px;font-size:1.08rem;color:#0f3d3e}
.inf-card .sub{margin:2px 0 8px}
.inf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px 14px;margin:8px 0 4px}
.inf-form label,.inf-fil label{display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:600;color:#334155}
.inf-form input,.inf-form select,.inf-form textarea,.inf-fil input,.inf-fil select{font:inherit;font-size:.9rem;font-weight:400;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;width:100%;box-sizing:border-box}
.inf-form input:focus,.inf-form textarea:focus,.inf-form select:focus{outline:2px solid #0e8a9b;outline-offset:0;border-color:#0e8a9b}
.inf-form .w2{grid-column:span 2}
.inf-form .w3{grid-column:1/-1}
.inf-g3{grid-template-columns:2fr 2fr 1fr}
@media(max-width:760px){.inf-g3{grid-template-columns:1fr}}
@media(max-width:640px){.inf-form .w2{grid-column:auto}}
.inf-sec{margin:18px 0 4px;font-size:.74rem;font-weight:800;letter-spacing:.07em;color:#0e8a9b;text-transform:uppercase;border-bottom:2px solid #dff1f3;padding-bottom:5px}
.inf-pre{display:flex;align-items:center;gap:8px}
.inf-pre span{white-space:nowrap;color:#475569;font-weight:600;font-size:.85rem}
.inf-obs{margin:8px 0 10px;padding-left:24px}
.inf-obs li{margin:8px 0}
.inf-obs li>div{display:flex;gap:8px;align-items:flex-start}
.inf-obs textarea{resize:vertical;min-height:44px}
.inf-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.inf-fil{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 12px;margin-top:10px}
.inf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px}
.inf-acc{white-space:nowrap}
.inf-acc button{margin:2px}
.inf-papel{background:#fff;padding:26px 30px;max-width:780px;margin:0 auto;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.inf-dlgbar{display:flex;gap:8px;justify-content:flex-end;padding:10px 4px}
#tInformes td.obs{max-width:280px;text-align:left}
${IH_CSS}`;

/* ---------- monta la vista dentro de dashboard.html (no hay que editar el HTML) ---------- */
function montarInformes() {
  if ($("#v-informes")) return;
  const st = document.createElement("style"); st.id = "infCss"; st.textContent = INF_CSS; document.head.append(st);
  const sec = document.createElement("section"); sec.className = "vista"; sec.id = "v-informes"; sec.hidden = true;
  sec.innerHTML = `
  <div id="iAviso"></div>
  <div class="inf-card" id="infAdminBar" hidden>
    <h2>\ud83d\udcc4 Reporte de informes</h2>
    <p class="sub">Informes de actividades de vigilancia y control vectorial \u2013 arbovirosis, registrados por los jefes de brigada sobre la labor de los inspectores.</p>
    <div class="inf-fil">
      <label>Mes del informe<select id="iMes"></select></label>
      <label>Desde<input type="date" id="iDesde"></label>
      <label>Hasta<input type="date" id="iHasta"></label>
      <label>Jefe de brigada<select id="iJefe"></select></label>
      <label>Inspector<select id="iInsp"></select></label>
      <label>Establecimiento<select id="iFEess"></select></label>
      <label>Buscar<input id="iBuscar" placeholder="Nombre, direcci\u00f3n, observaci\u00f3n\u2026"></label>
    </div>
    <div class="inf-bar">
      <button class="btn-teal" type="button" id="iNuevo">\u2795 Nuevo informe</button>
      <button class="btn-azul" type="button" id="iPrintAll">\ud83d\udda8\ufe0f Imprimir los filtrados</button>
      <button class="btn-mini" type="button" id="iXls">\ud83d\udce5 Descargar Excel</button>
      <button class="btn-mini" type="button" id="iLimpiarFil">Quitar filtros</button>
      <button class="btn-mini" type="button" id="iRecargar">\ud83d\udd04 Actualizar</button>
    </div>
    <div class="inf-kpis" id="iKpis"></div>
  </div>

  <div class="inf-card" id="infFormCard">
    <h2 id="iTitulo">\ud83d\udcdd Registrar informe</h2>
    <p class="sub">Llena los datos en el mismo orden del formato f\u00edsico \u00abInforme de actividades de vigilancia y control vectorial \u2013 arbovirosis\u00bb.</p>
    <form id="frmInf" class="inf-form" autocomplete="off">
      <div class="inf-grid" id="iLblJefe" hidden><label class="w2">Jefe de brigada que informa<select id="iUsuario"></select></label></div>
      <div class="inf-sec">Datos del informe</div>
      <div class="inf-grid inf-g3">
        <label>A<input id="iA" list="dlInfA" placeholder="Nombre y cargo del destinatario" required></label>
        <label>DE<input id="iDe" placeholder="Jefe de brigada que informa" required></label>
        <label>Fecha del informe<input type="date" id="iFecha" required></label>
        <label class="w3">Asunto<span class="inf-pre"><span>Situaci\u00f3n encontrada en</span><input id="iAsunto" placeholder="vivienda / lote, localidad\u2026" required></span></label>
      </div>
      <div class="inf-sec">Datos de la inspecci\u00f3n</div>
      <div class="inf-grid">
        <label>Siendo el d\u00eda<input type="date" id="iFechaInsp" required></label>
        <label>A horas<input type="time" id="iHora" required></label>
        <label class="w2">Jr. / Av. / Psje.<input id="iDireccion" placeholder="Ej.: Jr. Los Pinos 345" required></label>
        <label>Sector<input id="iSector"></label>
        <label>Mza<input id="iMza"></label>
        <label>Ov<input id="iOv"></label>
        <label class="w2">Establecimiento de salud (jurisdicci\u00f3n)<input id="iEess" list="dlInfEess" required></label>
        <label>Distrito<input id="iDistrito" list="dlInfDist" required></label>
        <label class="w2">De propiedad del Sr(a)<input id="iProp" placeholder="Propietario de la vivienda"></label>
        <label class="w2">Inspeccionada por el Inspector Sr(a)<input id="iInsp2" list="dlInfInsp" required></label>
      </div>
      <div class="inf-sec">Se observa</div>
      <ol class="inf-obs" id="iObs"></ol>
      <button type="button" class="btn-mini" id="iAddObs">\u2795 Agregar observaci\u00f3n</button>
      <p class="msg" id="iMsg" role="alert"></p>
      <div class="inf-bar">
        <button class="btn-teal" type="submit" id="iBtn">Guardar informe</button>
        <button class="btn-mini" type="button" id="iVista">\ud83d\udc41\ufe0f Vista previa</button>
        <button class="btn-mini rojo" type="button" id="iCancelar" hidden>Cancelar</button>
      </div>
    </form>
    <datalist id="dlInfA"></datalist><datalist id="dlInfEess"></datalist><datalist id="dlInfDist"></datalist><datalist id="dlInfInsp"></datalist>
  </div>

  <div class="inf-card" id="infResumen" hidden>
    <h2>\ud83d\udc77 Informes por inspector</h2>
    <p class="sub">Seg\u00fan los filtros del reporte.</p>
    <div class="tabla" id="tInfInsp"></div>
    <h2 style="margin:18px 0 4px">\ud83d\udda8\ufe0f Imprimir por jefe de brigada y fecha</h2>
    <p class="sub">Cada fila junta los informes de un jefe de brigada en una fecha; se imprimen 2 por hoja A4 (dos A5 horizontales). \u2705 = ya descargado o impreso en esta PC.</p>
    <div class="tabla" id="tInfJF"></div>
  </div>

  <div class="inf-card">
    <div class="inf-bar" style="margin:0 0 6px;justify-content:space-between"><h2 id="iListaTit">Mis informes</h2><div id="iFilJefe" class="inf-bar" style="margin:0;align-items:flex-end"><label style="display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:600;color:#334155">Mes<select id="iMesJ" style="font:inherit;font-weight:400;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px"></select></label><label style="display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:600;color:#334155">D\u00eda del informe<input type="date" id="iDiaJ" style="font:inherit;font-weight:400;padding:6px 9px;border:1px solid #cbd5e1;border-radius:8px"></label><button class="btn-azul" type="button" id="iPrintJ" title="Imprime los informes de la lista, 2 por hoja A4">\ud83d\udda8\ufe0f Imprimir la lista (2 por hoja)</button></div></div>
    <p class="sub" id="iCuenta"></p>
    <div class="tabla" id="tInformes"></div>
  </div>`;
  const vs = $$(".vista"); const ref = vs[vs.length - 1];
  if (ref) ref.after(sec); else ($("main") || document.body).append(sec);

  CAMPOS_INF.forEach(([k]) => FI[k] = $("#i" + (k === "Insp" ? "Insp2" : k)));
  FI.Usuario = $("#iUsuario");
  $("#frmInf").onsubmit = guardarInforme;
  $("#iAddObs").onclick = () => { const li = obsItem(""); $("#iObs").append(li); li.querySelector("textarea").focus(); };
  $("#iVista").onclick = () => verInforme(Object.assign(leerFormInf(), { jefe: FI.De.value }), true);
  $("#iCancelar").onclick = () => { SI.nuevo = false; limpiarFormInf(false); pintarInformes(); };
  FI.Usuario.onchange = () => { const u = USERS.find(x => x.usuario === FI.Usuario.value); if (u) FI.De.value = normName(u.nombre); };
  ["iMes", "iDesde", "iHasta", "iJefe", "iInsp", "iFEess", "iMesJ", "iDiaJ"].forEach(id => $("#" + id).onchange = () => {
    if (id === "iMes") { $("#iDesde").value = ""; $("#iHasta").value = ""; } if (id === "iDesde" || id === "iHasta") $("#iMes").value = ""; if (id === "iMesJ") $("#iDiaJ").value = ""; if (id === "iDiaJ") $("#iMesJ").value = ""; pintarInformes(); });
  $("#iBuscar").oninput = pintarInformes;
  $("#iLimpiarFil").onclick = () => { ["iMes", "iDesde", "iHasta", "iJefe", "iInsp", "iFEess", "iBuscar"].forEach(id => $("#" + id).value = ""); pintarInformes(); };
  $("#iNuevo").onclick = () => { SI.nuevo = true; limpiarFormInf(false); pintarInformes(); $("#infFormCard").scrollIntoView({ behavior: "smooth" }); };
  $("#iPrintAll").onclick = () => SI.lista.length ? imprimirInformes(ordenInf(SI.lista)) : toast("No hay informes con estos filtros");
  $("#iPrintJ").onclick = () => SI.lista.length ? imprimirInformes(ordenInf(SI.lista)) : toast("No hay informes en la lista");
  $("#iXls").onclick = excelInformes;
  $("#iRecargar").onclick = async () => { await cargarInformes(); pintarInformes(); toast("Informes actualizados"); };
  limpiarFormInf(false);
}

const prepInf = l => (l || []).map(x => Object.assign({}, x, { jefe: normName(x.jefe), mes: String(x.fecha || "").slice(0, 7),
  observaciones: Array.isArray(x.observaciones) ? x.observaciones : String(x.observaciones || "").split("\n").filter(Boolean) }));
async function cargarInformes() {
  try {
    const r = await api("listInformes");
    SI.error = r.ok ? "" : (r.error || "Error");
    if (r.ok && YO.rol !== "ADMIN") { try { localStorage.setItem("ssm_inf_" + YO.usuario, JSON.stringify(r.informes || [])); } catch (x) {} }
    INF = r.ok ? prepInf(r.informes) : [];
  } catch (e) {
    let c = null; if (YO.rol !== "ADMIN") { try { c = JSON.parse(localStorage.getItem("ssm_inf_" + YO.usuario) || "null"); } catch (x) {} }
    INF = c ? prepInf(c) : []; SI.error = c ? "" : "No hay conexi\u00f3n con el servidor";
  }
}

/* ---------- formulario ---------- */
function obsItem(v) {
  const li = document.createElement("li");
  li.innerHTML = `<div><textarea rows="2" maxlength="500" placeholder="Describe lo observado\u2026">${esc(v || "")}</textarea><button type="button" class="btn-mini rojo" title="Quitar esta observaci\u00f3n">\u2715</button></div>`;
  li.querySelector("button").onclick = () => { li.remove(); if (!$("#iObs").children.length) $("#iObs").append(obsItem("")); };
  return li;
}
function leerFormInf() {
  const o = {}; CAMPOS_INF.forEach(([k, c]) => o[c] = FI[k].value);
  o.observaciones = $$("#iObs textarea").map(t => t.value.trim()).filter(Boolean);
  return o;
}
function ultimoA() {
  const m = INF.filter(i => i.usuario === YO.usuario && i.a).sort((a, b) => String(b.registrado).localeCompare(String(a.registrado)));
  return m.length ? m[0].a : "";
}
function limpiarFormInf(conservar) {
  const admin = YO.rol === "ADMIN";
  SI.editId = null;
  $("#iTitulo").textContent = "\ud83d\udcdd Registrar informe"; $("#iBtn").textContent = "Guardar informe"; $("#iCancelar").hidden = !admin;
  ["Asunto", "Hora", "Direccion", "Sector", "Mza", "Ov", "Prop", "Insp"].forEach(k => FI[k].value = "");
  FI.FechaInsp.value = hoyTxt; FI.FechaInsp.max = hoyTxt; FI.Fecha.max = hoyTxt;
  if (!conservar) { FI.Fecha.value = hoyTxt; FI.A.value = admin ? "" : ultimoA(); FI.Eess.value = ""; FI.Distrito.value = "";
    if (admin) { const u = USERS.find(x => x.usuario === FI.Usuario.value); FI.De.value = u ? normName(u.nombre) : ""; } else FI.De.value = normName(YO.nombre); }
  $("#iObs").innerHTML = ""; $("#iObs").append(obsItem(""));
  const m = $("#iMsg"); if (!conservar) { m.className = "msg"; m.textContent = ""; }
}
async function guardarInforme(e) {
  e.preventDefault(); const msg = $("#iMsg"); msg.className = "msg"; msg.textContent = "";
  const admin = YO.rol === "ADMIN";
  if (admin && !SI.editId && !FI.Usuario.value) { msg.textContent = "Elige el jefe de brigada que informa."; return FI.Usuario.focus(); }
  const x = leerFormInf();
  if (x.fecha > hoyTxt || x.fechaInsp > hoyTxt) { msg.textContent = "Las fechas no pueden ser posteriores a hoy."; return; }
  const c = limpiarInforme(x); if (!c.ok) { msg.textContent = c.error; return; }
  const nuevo = !SI.editId;
  const inf = Object.assign({ id: SI.editId || "", usuario: admin ? FI.Usuario.value : "" }, c.o); if (nuevo) inf.cid = nuevoCid("i");
  const enCola = () => { const u = admin ? USERS.find(z => z.usuario === FI.Usuario.value) : null;
    encolar("saveInforme", { informe: inf }, Object.assign({}, c.o, { id: inf.cid, jefe: u ? normName(u.nombre) : normName(YO.nombre), usuario: inf.usuario || YO.usuario }), `Informe del ${fechaPe(c.o.fecha)} \u2013 inspector ${c.o.inspector}`);
    if (admin) { SI.nuevo = false; limpiarFormInf(false); } else limpiarFormInf(true); pintarInformes();
    msg.className = "msg ok"; msg.textContent = "\ud83d\udcf6 Sin se\u00f1al: el informe qued\u00f3 guardado en este celular y se enviar\u00e1 solo cuando haya conexi\u00f3n."; toast("Guardado en el celular (pendiente de env\u00edo)"); };
  if (nuevo && navigator.onLine === false) return enCola();
  if (!nuevo && navigator.onLine === false) { msg.textContent = "Para editar un informe necesitas conexi\u00f3n a internet."; return; }
  const b = $("#iBtn"); b.disabled = true;
  try {
    const r = await api("saveInforme", { informe: inf });
    if (!r.ok) { msg.textContent = r.error; b.disabled = false; return; }
    const era = !!SI.editId; await cargarInformes();
    if (admin) { SI.nuevo = false; limpiarFormInf(false); } else limpiarFormInf(true);
    pintarInformes();
    const nn = r.numero ? ` N\u00b0 ${r.numero}-${CONFIG.INF_SIGLA}` : ""; msg.className = "msg ok"; msg.textContent = era ? `Informe${nn} actualizado.` : `Informe${nn} guardado.`; toast(era ? `Informe${nn} actualizado` : `Informe${nn} guardado`);
  } catch (err) { if (nuevo) enCola(); else msg.textContent = "No hay conexi\u00f3n con el servidor. Los cambios no se guardaron; int\u00e9ntalo de nuevo."; }
  b.disabled = false;
}
function editarInforme(id) {
  const i = INF.find(x => x.id === id); if (!i) return;
  if (YO.rol !== "ADMIN" && Date.now() > limiteEdicion(i.registrado)) return toast("Ya pasaron las 24 horas h\u00e1biles para editar este informe");
  SI.editId = id; SI.nuevo = false;
  if (YO.rol === "ADMIN") { pintarInformes(); FI.Usuario.value = i.usuario || ""; }
  CAMPOS_INF.forEach(([k, c]) => FI[k].value = i[c] || "");
  $("#iObs").innerHTML = ""; (i.observaciones.length ? i.observaciones : [""]).forEach(o => $("#iObs").append(obsItem(o)));
  $("#iTitulo").textContent = `\u270f\ufe0f Editar informe del ${fechaPe(i.fecha)} \u2014 inspector ${i.inspector}`; $("#iBtn").textContent = "Guardar cambios"; $("#iCancelar").hidden = false;
  $("#iMsg").textContent = "";
  pintarInformes(); $("#infFormCard").scrollIntoView({ behavior: "smooth" }); FI.A.focus();
}
async function borrarInforme(id) {
  const i = INF.find(x => x.id === id); if (!i) return;
  if (YO.rol !== "ADMIN" && Date.now() > limiteEdicion(i.registrado)) return toast("Ya pasaron las 24 horas h\u00e1biles para eliminar este informe");
  if (!confirm(`\u00bfEliminar el informe del ${fechaPe(i.fecha)} sobre el inspector ${i.inspector} (${i.direccion})?`)) return;
  try { const r = await api("deleteInforme", { id }); if (!r.ok) return toast(r.error); if (SI.editId === id) limpiarFormInf(false); await cargarInformes(); pintarInformes(); toast("Informe eliminado"); }
  catch (e) { toast("No hay conexi\u00f3n con el servidor"); }
}

/* ---------- vista ---------- */
/* ---------- control de informes ya descargados / impresos (en esta PC) ---------- */
const IMP_KEY = "inf_impresos_v1";
function impresos() { try { return new Set(JSON.parse(localStorage.getItem(IMP_KEY)) || []); } catch (e) { return new Set(); } }
function marcarImpresos(ids, quitar) { const st = impresos(); ids.forEach(id => id && (quitar ? st.delete(id) : st.add(id))); try { localStorage.setItem(IMP_KEY, JSON.stringify([...st])); } catch (e) {} }
const diaInf = i => String(i.fecha || "").slice(0, 10);
function gruposJF(l) { const g = {}, orden = []; ordenInf(l).forEach(i => { const k = diaInf(i) + "|" + (i.jefe || ""); if (!g[k]) { g[k] = []; orden.push(k); } g[k].push(i); });
  return orden.map(k => ({ fecha: k.split("|")[0], jefe: k.split("|").slice(1).join("|"), items: g[k].slice().reverse() })).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.jefe.localeCompare(b.jefe, "es")); }
const ordenInf = l => [...l].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.registrado).localeCompare(String(a.registrado)));
function pintarInformes() {
  if (!$("#v-informes") || !YO) return;
  const admin = YO.rol === "ADMIN";
  $("#iAviso").innerHTML = SI.error ? `<div class="banner err">${SI.error === "Acci\u00f3n desconocida" ? "El servidor todav\u00eda no tiene el m\u00f3dulo de informes. Pega el nuevo Codigo.gs en Apps Script, ejecuta \u00abinstalar\u00bb y publica una nueva versi\u00f3n." : "No se pudieron cargar los informes: " + esc(SI.error)}</div>` : "";
  $("#infAdminBar").hidden = !admin; $("#infResumen").hidden = !admin; $("#iFilJefe").style.display = admin ? "none" : "";
  $("#infFormCard").hidden = admin && !SI.nuevo && !SI.editId;
  $("#iLblJefe").hidden = !admin;
  if (admin) { const v = FI.Usuario.value; const js = USERS.filter(u => u.rol === "JEFE" && u.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    FI.Usuario.innerHTML = `<option value="">\u2014 Elige un jefe de brigada \u2014</option>` + js.map(u => `<option value="${esc(u.usuario)}">${esc(u.nombre)}</option>`).join(""); if (js.some(u => u.usuario === v)) FI.Usuario.value = v; }
  const uniq = k => [...new Set(INF.map(i => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  [["dlInfA", "a"], ["dlInfInsp", "inspector"], ["dlInfEess", "establecimiento"], ["dlInfDist", "distrito"]].forEach(([id, k]) => $("#" + id).innerHTML = uniq(k).map(x => `<option value="${esc(x)}">`).join(""));
  if (!admin && !SI.editId && !FI.A.value) FI.A.value = ultimoA();
  const meses = [...new Set(INF.map(i => i.mes).filter(Boolean))].sort().reverse();
  let lista;
  if (admin) {
    opciones($("#iMes"), meses, mesTxt); opciones($("#iJefe"), uniq("jefe")); opciones($("#iInsp"), uniq("inspector")); opciones($("#iFEess"), uniq("establecimiento"));
    const f = { mes: $("#iMes").value, desde: $("#iDesde").value, hasta: $("#iHasta").value, jefe: $("#iJefe").value, insp: $("#iInsp").value, eess: $("#iFEess").value, q: sinTilde($("#iBuscar").value) };
    lista = INF.filter(i => (!f.mes || i.mes === f.mes) && (!f.desde || i.fecha >= f.desde) && (!f.hasta || i.fecha <= f.hasta) && (!f.jefe || i.jefe === f.jefe) && (!f.insp || i.inspector === f.insp) && (!f.eess || i.establecimiento === f.eess) &&
      (!f.q || sinTilde([numInf(i), i.a, i.de, i.asunto, i.direccion, i.propietario, i.inspector, i.establecimiento, i.distrito, i.jefe, ...i.observaciones].join(" ")).includes(f.q)));
    const nObs = lista.reduce((a, i) => a + i.observaciones.length, 0);
    $("#iKpis").innerHTML = [["Informes", fmt(lista.length), "\ud83d\udcc4", "#0e8a9b", "Registrados"], ["Inspectores", fmt(new Set(lista.map(i => i.inspector)).size), "\ud83e\uddd1\u200d\ud83d\udd27", "#e11d48", "Con informe"], ["Jefes de brigada", fmt(new Set(lista.map(i => i.jefe)).size), "\ud83d\udc77", "#4338ca", "Que informaron"], ["Observaciones", fmt(nObs), "\ud83d\udd0e", "#f97316", "En total"]]
      .map(([t, v, ic, c, s]) => `<div class="kpi"><span class="ic" style="background:${c}">${ic}</span><div><div class="t">${t}</div><div class="v">${v}</div><div class="s" style="color:${c}">${s}</div></div></div>`).join("");
    const g = agrupar(lista, "inspector"); const ki = Object.keys(g).sort((a, b) => g[b].length - g[a].length || a.localeCompare(b, "es"));
    $("#tInfInsp").innerHTML = ki.length ? `<table><thead><tr><th class="izq">Inspector</th><th>Informes</th><th>Observaciones</th><th class="izq">Jefes de brigada que informaron</th><th>\u00daltimo informe</th><th></th></tr></thead><tbody>${ki.map(k => { const rs = g[k];
      return `<tr><td class="nom">${esc(k)}</td><td><b>${rs.length}</b></td><td>${rs.reduce((a, i) => a + i.observaciones.length, 0)}</td><td class="izq">${[...new Set(rs.map(i => i.jefe))].map(esc).join(", ")}</td><td>${fechaPe(rs.map(i => i.fecha).sort().pop())}</td><td><button class="btn-mini" type="button" data-finsp="${esc(k)}">Ver sus informes</button></td></tr>`; }).join("")}</tbody></table>` : `<div class="vacio">Sin informes con estos filtros.</div>`;
    $$("#tInfInsp [data-finsp]").forEach(b => b.onclick = () => { $("#iInsp").value = b.dataset.finsp; pintarInformes(); $("#tInformes").scrollIntoView({ behavior: "smooth" }); });
    const stI = impresos(); SI.grupos = gruposJF(lista.filter(i => !i.pend));
    $("#tInfJF").innerHTML = SI.grupos.length ? `<table><thead><tr><th>Fecha del informe</th><th class="izq">Jefe de brigada</th><th>Informes</th><th>N\u00b0 de informes</th><th>Hojas A4</th><th>Estado</th><th></th></tr></thead><tbody>${SI.grupos.map((gr, n) => { const hechos = gr.items.filter(i => stI.has(i.id)).length, todos = hechos === gr.items.length;
      const est = todos ? '<span class="tag" style="background:#dcfce7;color:#166534">\u2705 Descargado</span>' : hechos ? `<span class="tag t-am">${hechos} de ${gr.items.length}</span>` : '<span class="tag t-gr">Pendiente</span>';
      return `<tr${todos ? ' style="background:#f0fdf4"' : ""}><td>${fechaPe(gr.fecha)}</td><td class="nom">${esc(gr.jefe)}</td><td><b>${gr.items.length}</b></td><td><small class="plazo">${gr.items.map(i => esc(numInf(i))).join("<br>")}</small></td><td>${Math.ceil(gr.items.length / 2)}</td><td>${est}</td><td><button class="btn-mini" type="button" data-jfprt="${n}">\ud83d\udda8\ufe0f Imprimir</button>${hechos ? `<br><button class="btn-mini" type="button" data-jfdes="${n}" title="Quitar la marca de descargado">Desmarcar</button>` : ""}</td></tr>`; }).join("")}</tbody></table>` : `<div class="vacio">Sin informes con estos filtros.</div>`;
    $$("#tInfJF [data-jfprt]").forEach(b => b.onclick = () => imprimirInformes(SI.grupos[+b.dataset.jfprt].items));
    $$("#tInfJF [data-jfdes]").forEach(b => b.onclick = () => { marcarImpresos(SI.grupos[+b.dataset.jfdes].items.map(i => i.id), true); pintarInformes(); });
  } else {
    opciones($("#iMesJ"), meses, mesTxt);
    const diaJ = $("#iDiaJ").value;
    lista = INF.filter(i => (!$("#iMesJ").value || i.mes === $("#iMesJ").value) && (!diaJ || String(i.fecha || "").slice(0, 10) === diaJ));
  }
  SI.lista = lista;
  $("#iListaTit").textContent = admin ? "Informes registrados" : "Mis informes";
  $("#iCuenta").textContent = `${lista.length} informe${lista.length === 1 ? "" : "s"} \u00b7 ${new Set(lista.map(i => i.inspector)).size} inspector(es)`;
  $("#tInformes").innerHTML = tablaInformes(lista, admin);
  $$("#tInformes [data-iver]").forEach(b => b.onclick = () => verInforme(INF.find(i => i.id === b.dataset.iver)));
  $$("#tInformes [data-iprt]").forEach(b => b.onclick = () => imprimirInformes([INF.find(i => i.id === b.dataset.iprt)]));
  $$("#tInformes [data-ied]").forEach(b => b.onclick = () => editarInforme(b.dataset.ied));
  $$("#tInformes [data-idel]").forEach(b => b.onclick = () => borrarInforme(b.dataset.idel));
}
function tablaInformes(l, admin) {
  if (!l.length) return `<div class="vacio">${admin ? "No hay informes con estos filtros." : "A\u00fan no registras informes. Llena el formulario de arriba."}</div>`;
  const ahora = Date.now();
  const acc = i => { if (i.pend) return `<span class="tag ${i.err ? "t-ro" : "t-am"}" title="${esc(i.err || "Se enviar\u00e1 cuando haya se\u00f1al")}">${i.err ? "\u274c No se pudo enviar" : "\u23f3 Por enviar"}</span>`; let h = `<button class="btn-mini" type="button" data-iver="${esc(i.id)}">\ud83d\udc41\ufe0f Ver</button><button class="btn-mini" type="button" data-iprt="${esc(i.id)}">\ud83d\udda8\ufe0f Imprimir</button>`;
    if (admin) return h + `<br><button class="btn-mini" type="button" data-ied="${esc(i.id)}">Editar</button><button class="btn-mini rojo" type="button" data-idel="${esc(i.id)}">Eliminar</button>`;
    const lim = limiteEdicion(i.registrado);
    return h + (ahora <= lim ? `<br><button class="btn-mini" type="button" data-ied="${esc(i.id)}">Editar</button><button class="btn-mini rojo" type="button" data-idel="${esc(i.id)}">Eliminar</button><br><small class="plazo">Hasta ${fechaHora(lim)}</small>` : `<br><span class="tag t-gr" title="Pasaron las 24 horas h\u00e1biles para editar">\ud83d\udd12 Cerrado</span>`); };
  const impSet = impresos();
  const ubic = i => [i.sector && `Sector ${i.sector}`, i.mza && `Mza ${i.mza}`, i.ov && `Ov ${i.ov}`].filter(Boolean).join(" \u00b7 ");
  return `<table><thead><tr><th>N\u00b0</th><th>Fecha informe</th>${admin ? '<th class="izq">Jefe de brigada</th>' : ""}<th class="izq">Inspector</th><th>Inspecci\u00f3n</th><th class="izq">Vivienda / lote</th><th class="izq">Establecimiento \u00b7 distrito</th><th class="izq">Propietario</th><th class="izq">Se observa</th><th></th></tr></thead><tbody>${ordenInf(l).map((i, n) =>
    `<tr${impSet.has(i.id) ? ' style="background:#f0fdf4"' : ""}><td class="nom" style="white-space:nowrap">${i.pend ? '<small class="plazo">S/N</small>' : esc(numInf(i))}${!i.pend && impSet.has(i.id) ? '<br><span class="tag" style="background:#dcfce7;color:#166534" title="Ya descargado o impreso en esta PC">\u2705 Descargado</span>' : ""}</td><td>${fechaPe(i.fecha)}</td>${admin ? `<td class="nom">${esc(i.jefe)}</td>` : ""}<td class="nom">${esc(i.inspector)}</td><td>${fechaPe(i.fechaInsp)}<br><small class="plazo">${esc(i.hora)}</small></td><td class="izq">${esc(i.direccion)}${ubic(i) ? `<br><small class="plazo">${esc(ubic(i))}</small>` : ""}</td><td class="izq">${esc(i.establecimiento)}<br><small class="plazo">${esc(i.distrito)}</small></td><td class="izq">${esc(i.propietario || "\u2014")}</td><td class="obs"><b>${i.observaciones.length}</b> \u00b7 ${esc((i.observaciones[0] || "").slice(0, 90))}${(i.observaciones[0] || "").length > 90 ? "\u2026" : ""}</td><td class="inf-acc">${acc(i)}</td></tr>`).join("")}</tbody></table>`;
}

/* ---------- hoja del informe (igual al formato f\u00edsico) ---------- */
function hojaInforme(i) {
  const v = (x, cls) => `<span class="ih-v${cls ? " " + cls : ""}">${x ? esc(x) : "&nbsp;"}</span>`;
  const dm = i.fechaInsp ? `${i.fechaInsp.slice(8)}/${i.fechaInsp.slice(5, 7)}` : "";
  const [fd, fm, fa] = fechaLarga(i.fecha);
  const obs = (i.observaciones || []).map(o => `<li>${esc(o)}</li>`); while (obs.length < 3) obs.push(`<li class="vac">&nbsp;</li>`);
  const logo = new URL("logo.png", location.href).href;
  return `<div class="ih">
    <div class="ih-logo"><img src="${logo}" alt="" onerror="this.remove()"><span>DIRECCI\u00d3N REGIONAL DE SALUD SAN MART\u00cdN<br><small>UNIDAD DE GESTI\u00d3N DE ENFERMEDADES TRANSMISIBLES</small></span></div>
    <h1>INFORME DE ACTIVIDADES DE VIGILANCIA Y CONTROL VECTORIAL - ARBOVIROSIS</h1>
    <div class="ih-num">INFORME N\u00b0 <span>${esc(numInf(i))}</span></div>
    <table class="ih-cab">
      <tr><th>A</th><td class="p">:</td><td>${v(i.a, "l")}</td></tr>
      <tr><th>DE</th><td class="p">:</td><td>${v(i.de, "l")}</td></tr>
      <tr><th>ASUNTO</th><td class="p">:</td><td>Situaci\u00f3n Encontrada en ${v(i.asunto, "m")}</td></tr>
      <tr><th>FECHA</th><td class="p">:</td><td>${v(fd, "c")} de ${v(fm, "c")} del ${v(fa, "c")}</td></tr>
    </table>
    <p class="ih-p"><span class="nw">Siendo el d\u00eda ${v(dm, "c")},</span> <span class="nw">a horas ${v(i.hora, "c")}</span> en la vivienda o lote, ubicado en el Jr./Av./Psje. ${v(i.direccion)}, <span class="nw">Sector ${v(i.sector, "c")},</span> <span class="nw">Mza ${v(i.mza, "c")},</span> <span class="nw">Ov ${v(i.ov, "c")}</span> jurisdicci\u00f3n del establecimiento de Salud ${v(i.establecimiento)}, del distrito de ${v(i.distrito)}, <span class="nw">de propiedad del Sr(a) ${v(i.propietario)},</span> inspeccionada por el Inspector Sr(a) ${v(i.inspector)},</p>
    <p class="ih-so">Se observa:</p>
    <ol class="ih-obs">${obs.join("")}</ol>
    <div class="ih-firma"><div><span>FIRMA:</span><i></i></div><b>${esc(i.de || "")}</b><small>Jefe de brigada</small></div>
  </div>`;
}
function verInforme(i, previa) {
  if (!i) return;
  $("#dlgT").textContent = previa ? "Vista previa del informe" : `Informe N\u00b0 ${numInf(i)} \u2014 ${i.inspector}`;
  $("#dlgB").innerHTML = `<div class="inf-dlgbar"><button class="btn-azul" type="button" id="iDlgPrint">\ud83d\udda8\ufe0f Imprimir / guardar PDF</button></div><div class="inf-papel">${hojaInforme(i)}</div>`;
  $("#iDlgPrint").onclick = () => imprimirInformes([i]);
  $("#dlg").showModal();
}
function imprimirInformes(lista) {
  lista = (lista || []).filter(Boolean); if (!lista.length) return;
  const w = window.open("", "_blank"); if (!w) return toast("Permite las ventanas emergentes para imprimir");
  const dos = lista.length > 1; const pares = []; gruposJF(lista).forEach(gr => { for (let k = 0; k < gr.items.length; k += 2) pares.push(gr.items.slice(k, k + 2)); });
  const tit = lista.length === 1 ? `Informe_${numInf(lista[0]).replace(/[^A-Za-z0-9-]+/g, "_")}_${(lista[0].inspector || "").replace(/\s+/g, "_")}` : (new Set(lista.map(i => i.jefe)).size === 1 && new Set(lista.map(diaInf)).size === 1 ? `Informes_${(lista[0].jefe || "").replace(/\s+/g, "_")}_${diaInf(lista[0])}` : `Informes_${hoyTxt}`);
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(tit)}</title><style>${IH_CSS}
    body{margin:0;background:#e5e7eb}
    .hoja{background:#fff;width:210mm;height:148mm;margin:10mm auto;padding:7mm 13mm;box-sizing:border-box;box-shadow:0 2px 12px rgba(0,0,0,.15);overflow:hidden}
    .hoja .ih{font-size:11.5px}
    .hoja .ih-logo{font-size:8px;gap:8px;margin-bottom:6px}
    .hoja .ih-logo img{height:34px}
    .hoja .ih-logo small{font-size:6.5px}
    .hoja .ih h1{font-size:12.5px;margin:2px 0 3px}
    .hoja .ih-num{font-size:11px;margin:0 0 6px}
    .hoja .ih-cab{margin-bottom:4px}
    .hoja .ih-cab th{width:90px;padding:3px 0 3px 26px}
    .hoja .ih-cab td{padding:3px 0}
    .hoja .ih-cab td.p{width:12px}
    .hoja .ih-v{padding:0 3px;line-height:1.4}
    .hoja .ih-v.c{min-width:34px}
    .hoja .ih-p{line-height:2.1}
    .hoja .ih-so{margin:6px 0 0}
    .hoja .ih-obs{padding-left:22px;line-height:1.9}
    .hoja .ih-firma{margin:30px auto 0;width:280px}
    .hoja .ih-firma div{font-size:12.5px}
    .hoja .ih-firma b{margin:3px 0 0 58px;font-size:10.5px}
    .hoja .ih-firma small{margin-left:58px;font-size:9px}
    .pliego{background:#fff;width:210mm;height:296mm;margin:10mm auto;box-shadow:0 2px 12px rgba(0,0,0,.15);overflow:hidden}
    .pliego .hoja{margin:0;height:148mm;box-shadow:none}
    .pliego .hoja+.hoja{border-top:1px dashed #9ca3af}
    @page{size:${dos ? "A4 portrait" : "A5 landscape"};margin:0}
    @media print{body{background:#fff}.hoja{margin:0;box-shadow:none;break-after:page}.hoja:last-child{break-after:auto}.pliego{margin:0;box-shadow:none;break-after:page}.pliego:last-child{break-after:auto}.pliego .hoja{break-after:auto}}
  </style></head><body>${dos ? pares.map(par => `<div class="pliego">${par.map(i => `<div class="hoja">${hojaInforme(i)}</div>`).join("")}</div>`).join("") : lista.map(i => `<div class="hoja">${hojaInforme(i)}</div>`).join("")}<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
  w.document.close();
  marcarImpresos(lista.filter(i => !i.pend).map(i => i.id)); if (typeof pintarInformes === "function") setTimeout(pintarInformes, 300);
}
function excelInformes() {
  const l = ordenInf(SI.lista); if (!l.length) return toast("No hay informes con estos filtros");
  libro([["Informes", [["N\u00b0 INFORME", "FECHA INFORME", "A", "DE", "ASUNTO (SITUACI\u00d3N ENCONTRADA EN)", "FECHA INSPECCI\u00d3N", "HORA", "JR./AV./PSJE.", "SECTOR", "MZA", "OV", "ESTABLECIMIENTO DE SALUD", "DISTRITO", "PROPIETARIO", "INSPECTOR", "N\u00b0 OBSERVACIONES", "SE OBSERVA", "JEFE DE BRIGADA"],
    ...l.map(i => [numInf(i), fechaPe(i.fecha), i.a, i.de, i.asunto, fechaPe(i.fechaInsp), i.hora, i.direccion, i.sector, i.mza, i.ov, i.establecimiento, i.distrito, i.propietario, i.inspector, i.observaciones.length, i.observaciones.map((o, n) => `${n + 1}. ${o}`).join("  "), i.jefe])]]], `Informes_inspectores_${hoyTxt.replace(/-/g, "")}.xlsx`);
}


/* =====================================================================
   TRABAJO SIN SE\u00d1AL: cola de env\u00edos guardada en el celular
   - Lo nuevo (registros e informes) se guarda aqu\u00ed si no hay conexi\u00f3n
     y se env\u00eda solo cuando vuelve la se\u00f1al.
   - Cada env\u00edo lleva un identificador propio (cid), as\u00ed el servidor
     no lo duplica aunque llegue dos veces.
   ===================================================================== */
const COLA = {
  k: () => "ssm_cola_" + (YO ? YO.usuario : ""),
  get() { try { return JSON.parse(localStorage.getItem(this.k()) || "[]"); } catch (e) { return []; } },
  set(l) { try { localStorage.setItem(this.k(), JSON.stringify(l)); } catch (e) { toast("El celular no tiene espacio para guardar el pendiente"); } },
  quitar(cid) { this.set(this.get().filter(x => x.cid !== cid)); },
  marcar(cid, err) { this.set(this.get().map(x => x.cid === cid ? Object.assign(x, { error: err }) : x)); }
};
let SYNC = false;
function nuevoCid(p) { return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }
function encolar(action, data, vista, desc) {
  const l = COLA.get(); l.push({ cid: vista.id, action, data, vista: Object.assign(vista, { registrado: new Date().toISOString(), mes: String(vista.fecha || "").slice(0, 7) }), desc, creado: Date.now() });
  COLA.set(l); mezclarPendientes(); pintarCola();
}
function mezclarPendientes() {
  const ids = new Set(REC.filter(r => !r.pend).map(r => r.id)), idsI = new Set(INF.filter(i => !i.pend).map(i => i.id));
  REC = REC.filter(r => !r.pend); INF = INF.filter(i => !i.pend);
  COLA.get().forEach(it => {
    const ya = it.action === "saveRecord" ? ids.has(it.cid) : idsI.has(it.cid);
    if (ya) { COLA.quitar(it.cid); return; }   // el servidor ya lo tiene
    const v = Object.assign({}, it.vista, { pend: true, err: it.error || "" });
    if (it.action === "saveRecord") REC.push(v); else INF.push(v);
  });
  pintarCola();
}
async function sincronizar(manual) {
  if (SYNC || !YO) return;
  const l = COLA.get().filter(x => manual || !x.error); if (!l.length) return pintarCola();
  SYNC = true; pintarCola(); let env = 0, sinRed = false;
  for (const it of l) {
    try { const r = await api(it.action, it.data);
      if (r.ok) { COLA.quitar(it.cid); env++; } else if (r.error === "SESION") break; else COLA.marcar(it.cid, r.error || "Error"); }
    catch (e) { sinRed = true; break; }
  }
  SYNC = false;
  if (env) { await cargarTodo(); pintar(); toast(`\u2705 Se enviaron ${env} pendiente(s)`); }
  else if (manual && sinRed) toast("Todav\u00eda no hay conexi\u00f3n. Se enviar\u00e1 solo cuando vuelva la se\u00f1al.");
  pintarCola();
}
function pintarCola() {
  const e = $("#colaAviso"); if (!e) return; const l = COLA.get();
  if (!l.length) { e.innerHTML = ""; return; }
  const nr = l.filter(i => i.action === "saveRecord").length, ni = l.length - nr;
  const que = [nr && `${nr} registro${nr > 1 ? "s" : ""}`, ni && `${ni} informe${ni > 1 ? "s" : ""}`].filter(Boolean).join(" y ");
  const errs = l.filter(i => i.error);
  e.innerHTML = `<div class="banner" style="background:#fff7ed;border:1px solid #fdba74;color:#7c2d12;margin:8px 16px;border-radius:10px;padding:10px 14px">\u26a0\ufe0f Tienes <b>${que}</b> guardado${l.length > 1 ? "s" : ""} en este celular <b>sin enviar</b>. Se enviar\u00e1${l.length > 1 ? "n" : ""} solo${l.length > 1 ? "s" : ""} cuando haya se\u00f1al. <b>No borres los datos del navegador.</b>
    <button class="btn-mini" id="colaEnviar" type="button" ${SYNC ? "disabled" : ""} style="margin-left:6px">${SYNC ? "Enviando\u2026" : "\ud83d\udce4 Enviar ahora"}</button>
    ${errs.map(i => `<div style="margin-top:6px">\u274c <b>${esc(i.desc || "Pendiente")}</b>: ${esc(i.error)} <button class="btn-mini rojo" type="button" data-descartar="${esc(i.cid)}">Descartar</button></div>`).join("")}</div>`;
  const b = $("#colaEnviar"); if (b) b.onclick = () => sincronizar(true);
  e.querySelectorAll("[data-descartar]").forEach(x => x.onclick = () => { if (!confirm("\u00bfDescartar este pendiente? Se perder\u00e1 y tendr\u00e1s que registrarlo de nuevo.")) return; COLA.quitar(x.dataset.descartar); mezclarPendientes(); pintar(); });
}

/* ---------- librer\u00edas pesadas: solo se descargan cuando se usan ---------- */
const LIBS = { chart: "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js", xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" };
const LIBS_P = {};
function cargarLib(k) {
  if ((k === "chart" && window.Chart) || (k === "xlsx" && window.XLSX)) return Promise.resolve();
  return LIBS_P[k] || (LIBS_P[k] = new Promise(res => { const sc = document.createElement("script"); sc.src = LIBS[k]; sc.async = true;
    sc.onload = () => res(); sc.onerror = () => { delete LIBS_P[k]; res(); }; document.head.append(sc); }));
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
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  if (document.body.dataset.page === "portada") iniciarPortada();
  else if (document.body.dataset.page === "dashboard") iniciarDashboard();
});
})();
