/**
 * SISTEMA DE SUPERVISI\u00d3N Y MONITOREO DE VIVIENDAS \u2014 Backend (Google Apps Script)
 * Guarda usuarios, registros y metas en esta hoja de c\u00e1lculo de Google.
 *
 * Instalaci\u00f3n (una sola vez):
 *  1. Crea una hoja de c\u00e1lculo nueva en Google Sheets.
 *  2. Extensiones > Apps Script. Borra lo que haya y pega todo este archivo.
 *  3. Cambia ADMIN_CLAVE_INICIAL abajo y ejecuta la funci\u00f3n "instalar" (bot\u00f3n \u25b6).
 *  4. Implementar > Nueva implementaci\u00f3n > Tipo: Aplicaci\u00f3n web.
 *     Ejecutar como: Yo.  Qui\u00e9n tiene acceso: Cualquier usuario.
 *  5. Copia la URL que termina en /exec y p\u00e9gala en script.js (API_URL).
 */

const ADMIN_USUARIO_INICIAL = 'admin';
const ADMIN_CLAVE_INICIAL   = 'Ungetsm';   // solo se usa si el usuario admin no existe
const HORAS_SESION = 12;
// Plazo para que el jefe de brigada edite o elimine un registro: 24 horas h\u00e1biles
// contadas desde que lo registr\u00f3. D\u00edas h\u00e1biles: 1=lunes \u2026 6=s\u00e1bado, 0=domingo.
const HORAS_EDICION = 24;
const DIAS_HABILES = [1, 2, 3, 4, 5, 6];

const H = {
  USUARIOS: ['USUARIO','NOMBRES Y APELLIDOS','DNI','ROL','ACTIVO','SAL','HASH','CREADO'],
  REGISTROS:['ID','ACTIVIDAD','LOCALIDAD','SECTOR','VIVIENDAS MONITOREADAS','CERRADAS','DESHABITADAS','RENUENTES','TOTAL DE VIVIENDAS','FECHA DE INTERVENCION','JEFE DE BRIGADA','USUARIO','REGISTRADO','OBSERVACIONES','HORA INICIO','HORA TERMINO'],
  METAS:    ['MES','JEFE DE BRIGADA','META'],
  SESIONES: ['TOKEN','USUARIO','EXPIRA']
};

function instalar() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('America/Lima');
  Object.keys(H).forEach(n => {
    let sh = ss.getSheetByName(n);
    if (!sh) sh = ss.insertSheet(n);
    if (sh.getLastRow() === 0) { sh.appendRow(H[n]); sh.setFrozenRows(1); sh.getRange(1,1,1,H[n].length).setFontWeight('bold'); }
  });
  const sh = ss.getSheetByName('REGISTROS');
  sh.getRange('J:J').setNumberFormat('dd/mm/yyyy');
  sh.getRange('O:P').setNumberFormat('@');
  // agrega columnas nuevas si la hoja se cre\u00f3 con una versi\u00f3n anterior
  Object.keys(H).forEach(n => { const h = ss.getSheetByName(n); const ac = h.getRange(1,1,1,H[n].length).getValues()[0];
    H[n].forEach((t, i) => { if (!ac[i]) h.getRange(1, i+1).setValue(t).setFontWeight('bold'); }); });
  if (!buscarUsuario_(ADMIN_USUARIO_INICIAL)) crearUsuario_({usuario: ADMIN_USUARIO_INICIAL, nombre: 'ADMINISTRADOR', dni: '', rol: 'ADMIN', clave: ADMIN_CLAVE_INICIAL});
  const hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && hoja1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);
}

/* ===================== Entrada web ===================== */
function doGet() { return json_({ok: true, sistema: 'supervision-monitoreo'}); }

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ok:false, error:'Solicitud no v\u00e1lida'}); }
  try {
    const a = p.action;
    if (a === 'login') return json_(login_(p));
    const s = sesion_(p.token);
    if (!s) return json_({ok:false, error:'SESION', mensaje:'Tu sesi\u00f3n termin\u00f3. Vuelve a ingresar.'});
    const esAdmin = s.rol === 'ADMIN';
    switch (a) {
      case 'me':           return json_({ok:true, usuario:s.usuario, nombre:s.nombre, rol:s.rol});
      case 'logout':       cerrarSesion_(p.token); return json_({ok:true});
      case 'cambiarClave': return json_(cambiarClave_(s, p));
      case 'listRecords':  return json_({ok:true, registros: listarRegistros_(esAdmin ? null : s)});
      case 'saveRecord':   return json_(conLock_(() => guardarRegistro_(s, p.registro)));
      case 'deleteRecord': return json_(conLock_(() => borrarRegistro_(s, p.id)));
      case 'listMetas':    return json_({ok:true, metas: listarMetas_(esAdmin ? null : s.nombre)});
    }
    if (!esAdmin) return json_({ok:false, error:'Solo el administrador puede hacer esto.'});
    switch (a) {
      case 'listUsers':    return json_({ok:true, usuarios: listarUsuarios_()});
      case 'createUser':   return json_(conLock_(() => crearUsuario_(p)));
      case 'updateUser':   return json_(conLock_(() => actualizarUsuario_(p)));
      case 'setMetas':     return json_(conLock_(() => guardarMetas_(p.mes, p.metas)));
      case 'importRecords':return json_(conLock_(() => importar_(s, p.registros)));
    }
    return json_({ok:false, error:'Acci\u00f3n desconocida'});
  } catch (err) {
    return json_({ok:false, error: String(err.message || err)});
  }
}

/* ===================== Utilidades ===================== */
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function hoja_(n){ return SpreadsheetApp.getActive().getSheetByName(n); }
function filas_(n){ const sh = hoja_(n); const lr = sh.getLastRow(); if (lr < 2) return []; return sh.getRange(2,1,lr-1,H[n].length).getValues(); }
function conLock_(fn){ const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function norm_(s){ return String(s == null ? '' : s).replace(/\s+/g,' ').trim().toUpperCase(); }
function hash_(sal, clave){ return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + clave, Utilities.Charset.UTF_8)); }
function num_(v){ const n = Number(String(v == null ? '' : v).replace(',','.')); return isFinite(n) && n >= 0 ? n : 0; }
function fechaTxt_(v){
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const s = String(v || ''); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2);
  return '';
}
function fechaDate_(t){ const p = t.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }

/* ===================== Usuarios y sesiones ===================== */
function buscarUsuario_(u){
  u = String(u || '').trim().toLowerCase();
  const f = filas_('USUARIOS'); for (let i = 0; i < f.length; i++) if (String(f[i][0]).toLowerCase() === u) return {fila: i+2, d: f[i]};
  return null;
}
function login_(p){
  const r = buscarUsuario_(p.usuario);
  if (!r || hash_(r.d[5], String(p.clave || '')) !== r.d[6]) return {ok:false, error:'Usuario o contrase\u00f1a incorrectos.'};
  if (String(r.d[4]).toUpperCase() !== 'SI') return {ok:false, error:'Tu usuario est\u00e1 desactivado. Comun\u00edcate con el administrador.'};
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0,8);
  const exp = new Date(Date.now() + HORAS_SESION*3600*1000);
  conLock_(() => {
    const sh = hoja_('SESIONES'); const f = filas_('SESIONES'); const now = new Date();
    for (let i = f.length - 1; i >= 0; i--) if (new Date(f[i][2]) < now) sh.deleteRow(i+2);
    sh.appendRow([token, r.d[0], exp]);
  });
  return {ok:true, token, usuario:r.d[0], nombre:r.d[1], rol:r.d[3]};
}
function sesion_(token){
  if (!token) return null;
  const f = filas_('SESIONES');
  for (let i = 0; i < f.length; i++) if (f[i][0] === token) {
    if (new Date(f[i][2]) < new Date()) return null;
    const u = buscarUsuario_(f[i][1]); if (!u || String(u.d[4]).toUpperCase() !== 'SI') return null;
    return {usuario:u.d[0], nombre:u.d[1], rol:u.d[3]};
  }
  return null;
}
function cerrarSesion_(token){ conLock_(() => { const f = filas_('SESIONES'); for (let i = f.length-1; i >= 0; i--) if (f[i][0] === token) hoja_('SESIONES').deleteRow(i+2); }); }
function listarUsuarios_(){ return filas_('USUARIOS').map(r => ({usuario:r[0], nombre:r[1], dni:String(r[2]||''), rol:r[3], activo:String(r[4]).toUpperCase()==='SI', creado:r[7] ? Utilities.formatDate(new Date(r[7]), 'America/Lima', 'dd/MM/yyyy') : ''})); }
function crearUsuario_(p){
  const u = String(p.usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(u)) return {ok:false, error:'El usuario debe tener de 3 a 40 caracteres: letras, n\u00fameros, punto, guion.'};
  if (String(p.clave || '').length < 6) return {ok:false, error:'La contrase\u00f1a debe tener al menos 6 caracteres.'};
  if (!norm_(p.nombre)) return {ok:false, error:'Escribe los nombres y apellidos.'};
  if (buscarUsuario_(u)) return {ok:false, error:'Ese usuario ya existe.'};
  const sal = Utilities.getUuid();
  hoja_('USUARIOS').appendRow([u, norm_(p.nombre), String(p.dni||'').trim(), p.rol === 'ADMIN' ? 'ADMIN' : 'JEFE', 'SI', sal, hash_(sal, String(p.clave)), new Date()]);
  return {ok:true};
}
function actualizarUsuario_(p){
  const r = buscarUsuario_(p.usuario); if (!r) return {ok:false, error:'No existe el usuario.'};
  const sh = hoja_('USUARIOS');
  if (p.nombre != null && norm_(p.nombre)) sh.getRange(r.fila, 2).setValue(norm_(p.nombre));
  if (p.dni != null) sh.getRange(r.fila, 3).setValue(String(p.dni).trim());
  if (p.rol) sh.getRange(r.fila, 4).setValue(p.rol === 'ADMIN' ? 'ADMIN' : 'JEFE');
  if (p.activo != null) sh.getRange(r.fila, 5).setValue(p.activo ? 'SI' : 'NO');
  if (p.clave) { if (String(p.clave).length < 6) return {ok:false, error:'La contrase\u00f1a debe tener al menos 6 caracteres.'};
    const sal = Utilities.getUuid(); sh.getRange(r.fila, 6, 1, 2).setValues([[sal, hash_(sal, String(p.clave))]]); }
  return {ok:true};
}
function cambiarClave_(s, p){
  const r = buscarUsuario_(s.usuario);
  if (hash_(r.d[5], String(p.actual || '')) !== r.d[6]) return {ok:false, error:'La contrase\u00f1a actual no es correcta.'};
  return conLock_(() => actualizarUsuario_({usuario:s.usuario, clave:p.nueva}));
}

/* ===================== Registros ===================== */
function horaTxt_(v){
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'HH:mm');
  if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
  const m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})/); if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}
function aObj_(r){ return {id:String(r[0]), actividad:r[1], localidad:r[2], sector:String(r[3]), monitoreadas:num_(r[4]), cerradas:num_(r[5]), deshabitadas:num_(r[6]), renuentes:num_(r[7]), total:num_(r[8]), fecha:fechaTxt_(r[9]), jefe:r[10], usuario:r[11], registrado: r[12] instanceof Date ? r[12].toISOString() : '', observaciones: String(r[13] == null ? '' : r[13]), horaInicio: horaTxt_(r[14]), horaFin: horaTxt_(r[15])}; }
// Fecha y hora l\u00edmite para editar: suma HORAS_EDICION horas saltando los d\u00edas no h\u00e1biles (hora de Lima, UTC-5)
function limiteEdicion_(creado){
  const DIA = 86400000, OFF = 5 * 3600000; let t = new Date(creado).getTime() - OFF, falta = HORAS_EDICION * 3600000;
  if (!isFinite(t)) return 0;
  for (let k = 0; k < 60 && falta > 0; k++) { const d = Math.floor(t / DIA), fin = (d + 1) * DIA;
    if (DIAS_HABILES.indexOf((d + 4) % 7) < 0) { t = fin; continue; }
    const tramo = Math.min(falta, fin - t); t += tramo; falta -= tramo; }
  return t + OFF;
}
function plazoVencido_(fila){ const c = fila[12]; if (!(c instanceof Date)) return true; return Date.now() > limiteEdicion_(c); }
const MSJ_PLAZO = 'El plazo para editar o eliminar este registro (24 horas h\u00e1biles) ya venci\u00f3. Pide al administrador que lo corrija.';
function esDueno_(r, s){ return String(r[11]).toLowerCase() === String(s.usuario).toLowerCase() || (!r[11] && norm_(r[10]) === norm_(s.nombre)); }
function listarRegistros_(s){
  return filas_('REGISTROS').filter(r => r[0] && (!s || esDueno_(r, s))).map(aObj_).filter(o => o.fecha);
}
function limpiar_(x){
  const fecha = fechaTxt_(x.fecha); if (!fecha) throw new Error('Fecha de intervenci\u00f3n no v\u00e1lida.');
  const mon = num_(x.monitoreadas), cer = num_(x.cerradas), des = num_(x.deshabitadas), ren = num_(x.renuentes);
  const act = norm_(x.actividad).indexOf('MONIT') === 0 ? 'MONITOREO' : 'SUPERVISI\u00d3N';
  const tot = x.total === '' || x.total == null ? mon+cer+des+ren : num_(x.total);
  if (tot < mon) throw new Error('El total de viviendas no puede ser menor que las viviendas monitoreadas.');
  return [act, norm_(x.localidad), String(x.sector == null ? '' : x.sector).trim(), mon, cer, des, ren, tot, fechaDate_(fecha)];
}
function guardarRegistro_(s, x){
  if (!x) return {ok:false, error:'Faltan datos.'};
  const esAdmin = s.rol === 'ADMIN'; const sh = hoja_('REGISTROS'); const f = filas_('REGISTROS');
  let jefe = s.nombre, usuario = s.usuario;
  if (esAdmin && x.usuario) { const u = buscarUsuario_(x.usuario); if (u) { jefe = u.d[1]; usuario = u.d[0]; } }
  const vals = limpiar_(x);
  const obs = String(x.observaciones == null ? '' : x.observaciones).trim().slice(0, 500);
  const hi = horaTxt_(x.horaInicio), hf = horaTxt_(x.horaFin);
  if (!x.id && (!hi || !hf)) return {ok:false, error:'Escribe la hora de inicio y la hora de t\u00e9rmino.'};
  if ((hi || hf) && (!hi || !hf)) return {ok:false, error:'Escribe la hora de inicio y la hora de t\u00e9rmino.'};
  if (hi && hf <= hi) return {ok:false, error:'La hora de t\u00e9rmino debe ser posterior a la hora de inicio.'};
  if (x.id) {
    for (let i = 0; i < f.length; i++) if (String(f[i][0]) === String(x.id)) {
      if (!esAdmin && !esDueno_(f[i], s)) return {ok:false, error:'Solo puedes editar tus propios registros.'};
      if (!esAdmin && plazoVencido_(f[i])) return {ok:false, error: MSJ_PLAZO};
      if (!esAdmin) { jefe = f[i][10]; usuario = f[i][11] || s.usuario; } else if (!x.usuario) { jefe = f[i][10]; usuario = f[i][11]; }
      const creado = f[i][12] instanceof Date ? f[i][12] : new Date();
      sh.getRange(i+2, 1, 1, 16).setValues([[x.id, ...vals, jefe, usuario, creado, obs, hi, hf]]);
      return {ok:true, id:x.id};
    }
    return {ok:false, error:'No se encontr\u00f3 el registro.'};
  }
  const id = 'r-' + Utilities.getUuid().slice(0, 13);
  sh.appendRow([id, ...vals, jefe, usuario, new Date(), obs, hi, hf]);
  return {ok:true, id};
}
function borrarRegistro_(s, id){
  const f = filas_('REGISTROS');
  for (let i = 0; i < f.length; i++) if (String(f[i][0]) === String(id)) {
    if (s.rol !== 'ADMIN' && !esDueno_(f[i], s)) return {ok:false, error:'Solo puedes eliminar tus propios registros.'};
    if (s.rol !== 'ADMIN' && plazoVencido_(f[i])) return {ok:false, error: MSJ_PLAZO};
    hoja_('REGISTROS').deleteRow(i+2); return {ok:true};
  }
  return {ok:false, error:'No se encontr\u00f3 el registro.'};
}
function importar_(s, lista){
  if (!lista || !lista.length) return {ok:true, nuevos:0};
  const ids = {}; filas_('REGISTROS').forEach(r => ids[String(r[0])] = 1);
  const porNombre = {}; filas_('USUARIOS').forEach(r => porNombre[norm_(r[1])] = r[0]);
  const out = []; const now = new Date();
  lista.forEach(x => { if (!x.id || ids[x.id]) return; try { const v = limpiar_(x); const j = norm_(x.jefe); out.push([x.id, ...v, j, porNombre[j] || '', now, String(x.observaciones || '').slice(0, 500), horaTxt_(x.horaInicio), horaTxt_(x.horaFin)]); ids[x.id] = 1; } catch (e) {} });
  if (out.length) { const sh = hoja_('REGISTROS'); sh.getRange(sh.getLastRow()+1, 1, out.length, 16).setValues(out); }
  return {ok:true, nuevos: out.length, repetidos: lista.length - out.length};
}

/* ===================== Metas ===================== */
function listarMetas_(nombre){
  return filas_('METAS').map(r => ({mes: r[0] instanceof Date ? Utilities.formatDate(r[0], 'America/Lima', 'yyyy-MM') : String(r[0]), jefe: norm_(r[1]), meta: num_(r[2])}))
    .filter(m => m.mes && m.jefe && (!nombre || m.jefe === norm_(nombre)));
}
function guardarMetas_(mes, metas){
  if (!/^\d{4}-\d{2}$/.test(String(mes))) return {ok:false, error:'Mes no v\u00e1lido.'};
  const sh = hoja_('METAS'); const f = filas_('METAS');
  for (let i = f.length - 1; i >= 0; i--) { const m = f[i][0] instanceof Date ? Utilities.formatDate(f[i][0], 'America/Lima', 'yyyy-MM') : String(f[i][0]); if (m === mes) sh.deleteRow(i+2); }
  const out = (metas || []).filter(m => norm_(m.jefe) && m.meta !== '' && m.meta != null).map(m => ["'" + mes, norm_(m.jefe), num_(m.meta)]);
  if (out.length) sh.getRange(sh.getLastRow()+1, 1, out.length, 3).setValues(out);
  return {ok:true, guardadas: out.length};
}
