// Proxy unico entre el cliente y la base. El navegador ya no habla con Supabase:
// manda la operacion aca, este endpoint comprueba que alguno de los codigos de
// hogar que presenta el dispositivo corresponda al grupo pedido, y recien
// entonces consulta PostgREST con la clave secreta, que vive solo en el servidor.
//
// REGLA QUE NO SE PUEDE ROMPER: ante un ERROR, la respuesta de PostgREST vuelve
// al cliente TAL CUAL (mismo status, mismo texto, sin envolver).
// isUnknownColumnError() en el cliente decide si reintenta una escritura sin las
// columnas nuevas leyendo ese texto crudo (PGRST204, "column ... does not
// exist"). Si lo traducimos o lo envolvemos, ese respaldo deja de dispararse y
// los gastos se guardan sin moneda, sin cuotas y sin tarjeta, en silencio.
//
// Por eso los errores propios del proxy son codigos cortos 'nf_*': no contienen
// 'column', ni 'schema', ni 'PGRST', ni ningun nombre de columna, asi que no
// pueden confundirse con un error de la base.
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REST = SB_URL + '/rest/v1';

const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
};

// Tablas aceptadas, con las columnas por las que se puede filtrar y su tipo.
// Todo lo que no este aca se rechaza: el cliente no puede inventar filtros
// nuevos sin tocar el servidor, que es lo que evita que 'grupo_id=eq.X' se
// transforme en cualquier otra consulta.
const TABLAS = {
  gastos: {
    columnaGrupo: 'grupo_id',
    filtros: { grupo_id: 'id', id: 'id', mes: 'int', anio: 'int' }
  },
  ingresos: {
    columnaGrupo: 'grupo_id',
    filtros: { grupo_id: 'id', id: 'id', mes: 'int', anio: 'int' }
  },
  tarjetas: {
    columnaGrupo: 'grupo_id',
    filtros: { grupo_id: 'id', id: 'id' }
  },
  grupos: {
    // En 'grupos' el grupo ES la fila, asi que la columna de pertenencia es su
    // propio id.
    columnaGrupo: 'id',
    filtros: { id: 'id', codigo: 'codigo' },
    // En las tablas de datos el cuerpo pasa tal cual (hace falta para que el
    // error de columna desconocida llegue al cliente). Aca NO: 'grupos' guarda
    // la credencial, asi que solo estas columnas se pueden escribir, y 'codigo'
    // nunca se puede cambiar una vez creado el grupo.
    columnasUpdate: ['nombre', 'notificaciones', 'personas', 'persona1', 'persona2'],
    columnasInsert: ['codigo', 'nombre', 'persona1', 'persona2', 'personas', 'tipo']
  }
};

const PATRONES = {
  id: /^[0-9a-fA-F][0-9a-fA-F-]{0,63}$/,
  int: /^-?[0-9]{1,9}$/,
  // Se valida sobre el codigo YA normalizado (sin guiones, en mayuscula).
  codigo: /^[A-Z0-9]{6,16}$/
};

const MAX_VALORES_IN = 60;
const MAX_CODIGOS = 25;

// Limite de ingresos fallidos por IP. Se cuentan los FALLOS, no los intentos:
// en Argentina decenas de usuarios legitimos comparten IP en la red movil, y
// contar los ingresos exitosos los bloquearia a todos.
const MAX_FALLOS = 20;
const VENTANA_MS = 10 * 60 * 1000;

// El cliente acepta el codigo con guiones o en minuscula y lo normaliza antes de
// buscar. El servidor tiene que normalizar IGUAL y consultar la columna
// generada 'codigo_norm', que es la que tiene el indice unico.
function normCodigo(c) {
  return String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

// Error propio del proxy: codigo de maquina + texto en castellano para el toast.
// Ninguno de los dos puede contener las palabras que mira isUnknownColumnError.
function sendError(res, status, codigo, mensaje) {
  return sendJson(res, status, { error: codigo, mensaje: mensaje });
}

// Reenvia la respuesta de PostgREST sin tocarla. Ver la regla de arriba.
function sendCrudo(res, status, contentType, texto) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType || 'application/json; charset=utf-8');
  if (!texto) return res.end();
  res.end(texto);
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function cabecerasServicio(prefer) {
  const h = {
    'Content-Type': 'application/json',
    'apikey': SB_SERVICE_KEY,
    'Authorization': 'Bearer ' + SB_SERVICE_KEY
  };
  if (prefer) h['Prefer'] = prefer;
  return h;
}

function ipDe(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return String(fwd).split(',')[0].trim() || 'sin-ip';
}

// ---------------------------------------------------------------------------
// FILTROS
// ---------------------------------------------------------------------------
// El cliente sigue mandando el mismo string que antes ('grupo_id=eq.X&mes=eq.3').
// NO se reenvia: se parsea, se valida columna por columna contra la lista blanca
// y se vuelve a armar desde los pedazos ya validados. Un string que no encaje
// exacto se rechaza entero.
function parsearFiltros(tabla, q) {
  const cfg = TABLAS[tabla];
  const partes = String(q == null ? '' : q).split('&');
  const out = [];
  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];
    if (parte === '') continue;
    // El orden y la seleccion de columnas los decide el servidor, no el cliente.
    if (/^order=/.test(parte) || /^select=/.test(parte)) return null;
    const m = /^([a-z_]{1,32})=(eq|in)\.(.*)$/.exec(parte);
    if (!m) return null;
    const columna = m[1];
    const operador = m[2];
    const valor = m[3];
    const tipo = cfg.filtros[columna];
    if (!tipo) return null;

    // El codigo se normaliza y se consulta por la columna generada.
    const columnaReal = (tipo === 'codigo') ? 'codigo_norm' : columna;
    const normalizar = (tipo === 'codigo') ? normCodigo : function (v) { return v; };

    if (operador === 'eq') {
      const v = normalizar(valor);
      if (!PATRONES[tipo].test(v)) return null;
      out.push({ columna: columnaReal, operador: 'eq', valores: [v] });
    } else {
      const envuelto = /^\((.*)\)$/.exec(valor);
      if (!envuelto) return null;
      const valores = envuelto[1].split(',').map(normalizar);
      if (!valores.length || valores.length > MAX_VALORES_IN) return null;
      for (let j = 0; j < valores.length; j++) {
        if (!PATRONES[tipo].test(valores[j])) return null;
      }
      out.push({ columna: columnaReal, operador: 'in', valores: valores });
    }
  }
  return out;
}

function serializarFiltros(filtros) {
  return filtros.map(function (f) {
    if (f.operador === 'eq') {
      return encodeURIComponent(f.columna) + '=eq.' + encodeURIComponent(f.valores[0]);
    }
    return encodeURIComponent(f.columna) + '=in.(' +
      f.valores.map(encodeURIComponent).join(',') + ')';
  }).join('&');
}

function buscarFiltroEq(filtros, columna) {
  for (let i = 0; i < filtros.length; i++) {
    if (filtros[i].columna === columna && filtros[i].operador === 'eq') {
      return filtros[i].valores[0];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CREDENCIALES
// ---------------------------------------------------------------------------
function leerCodigos(req) {
  const raw = req.headers['x-nf-codigos'] || '';
  const vistos = Object.create(null);
  const out = [];
  String(raw).split(',').forEach(function (c) {
    const v = normCodigo(c);
    if (!PATRONES.codigo.test(v)) return;
    if (vistos[v]) return;
    vistos[v] = true;
    if (out.length < MAX_CODIGOS) out.push(v);
  });
  return out;
}

// Traduce los codigos presentados a los ids de grupo que este dispositivo puede
// tocar. Es la unica autorizacion del sistema: el codigo ES la credencial.
async function idsAutorizados(codigos) {
  if (!codigos.length) return [];
  const q = 'codigo_norm=in.(' + codigos.map(encodeURIComponent).join(',') + ')&select=id';
  const r = await fetch(REST + '/grupos?' + q, { headers: cabecerasServicio() });
  if (!r.ok) {
    console.error('[db] fallo la busqueda de credenciales:', r.status);
    return [];
  }
  const filas = await r.json();
  return (filas || []).map(function (f) { return String(f.id); });
}

// A que grupo pertenece una fila. Se consulta antes de modificar o borrar,
// porque esas operaciones llegan solo con el id de la fila y sin grupo_id.
async function grupoDeFila(tabla, id) {
  const url = REST + '/' + tabla + '?id=eq.' + encodeURIComponent(id) + '&select=grupo_id';
  const r = await fetch(url, { headers: cabecerasServicio() });
  if (!r.ok) {
    return { fallo: { status: r.status, texto: await r.text(), tipo: r.headers.get('content-type') } };
  }
  const filas = await r.json();
  if (!filas || !filas.length) return { ausente: true };
  return { grupoId: String(filas[0].grupo_id) };
}

// ---------------------------------------------------------------------------
// LIMITE DE INGRESOS FALLIDOS
// ---------------------------------------------------------------------------
// Es un freno, no un muro: la cuenta se lee y se escribe en dos pasos, asi que
// bajo concurrencia puede quedar corta por uno o dos. Alcanza, porque el espacio
// de codigos (36^6 = 2.176 millones) ya hace inviable barrerlo. Lo que evita es
// que alguien pruebe codigos a mano o queme la cuota de la funcion.
// Ante cualquier fallo del contador se DEJA PASAR: nunca se bloquea un ingreso
// legitimo por un problema del limitador.
async function loginBloqueado(ip) {
  try {
    const r = await fetch(
      REST + '/login_intentos?ip=eq.' + encodeURIComponent(ip) + '&select=fallos,ventana',
      { headers: cabecerasServicio() }
    );
    if (!r.ok) return false;
    const filas = await r.json();
    if (!filas || !filas.length) return false;
    const fila = filas[0];
    if (Date.now() - new Date(fila.ventana).getTime() > VENTANA_MS) return false;
    return Number(fila.fallos || 0) >= MAX_FALLOS;
  } catch (e) {
    return false;
  }
}

async function registrarFallo(ip) {
  try {
    const r = await fetch(
      REST + '/login_intentos?ip=eq.' + encodeURIComponent(ip) + '&select=fallos,ventana',
      { headers: cabecerasServicio() }
    );
    let fallos = 1;
    let reiniciar = true;
    if (r.ok) {
      const filas = await r.json();
      if (filas && filas.length) {
        const vieja = Date.now() - new Date(filas[0].ventana).getTime() > VENTANA_MS;
        reiniciar = vieja;
        fallos = vieja ? 1 : Number(filas[0].fallos || 0) + 1;
      }
    }
    const fila = { ip: ip, fallos: fallos };
    if (reiniciar) fila.ventana = new Date().toISOString();
    await fetch(REST + '/login_intentos?on_conflict=ip', {
      method: 'POST',
      headers: cabecerasServicio('resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify(fila)
    });
  } catch (e) {
    console.error('[db] no se pudo registrar el intento fallido:', e && e.message);
  }
}

// ---------------------------------------------------------------------------
// OPERACIONES
// ---------------------------------------------------------------------------
async function reenviar(res, metodo, ruta, prefer, cuerpo) {
  const opciones = { method: metodo, headers: cabecerasServicio(prefer) };
  if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);
  const r = await fetch(REST + ruta, opciones);
  const texto = await r.text();
  return sendCrudo(res, r.status, r.headers.get('content-type'), texto);
}

// Entrar con codigo / unirse por codigo. Es la unica lectura que no exige una
// credencial previa, porque el codigo que tipea el usuario ES la credencial.
// Un codigo inexistente devuelve [] con 200, igual que antes, para que la
// pantalla muestre "Codigo no encontrado" y no un error de conexion.
//
// Se pide la fila completa y se quita 'notificaciones' aca: es el texto que se
// escriben entre los integrantes del hogar, y no se le entrega a cualquiera que
// acierte un codigo. No se recorta por nombre de columna en la consulta porque
// el cliente lee campos que podrian no existir en la tabla (por ejemplo
// 'moneda', que nunca se escribe): pedirlos por nombre romperia el ingreso.
async function opEntrarConCodigo(req, res, codigoNorm) {
  const ip = ipDe(req);
  if (await loginBloqueado(ip)) {
    return sendError(res, 429, 'nf_demasiados_intentos',
      'Demasiados intentos. Esperá unos minutos y volvé a probar.');
  }

  const url = REST + '/grupos?codigo_norm=eq.' + encodeURIComponent(codigoNorm) +
    '&order=created_at.asc';
  const r = await fetch(url, { headers: cabecerasServicio() });
  const texto = await r.text();

  if (!r.ok) return sendCrudo(res, r.status, r.headers.get('content-type'), texto);

  let filas;
  try { filas = JSON.parse(texto); } catch (e) { filas = null; }
  if (!Array.isArray(filas)) return sendCrudo(res, r.status, r.headers.get('content-type'), texto);

  if (!filas.length) await registrarFallo(ip);

  filas.forEach(function (fila) { if (fila) delete fila.notificaciones; });
  return sendCrudo(res, 200, 'application/json; charset=utf-8', JSON.stringify(filas));
}

// Crear hogar / crear grupo de gastos. Tampoco exige credencial: el grupo
// todavia no existe. El codigo lo elige el cliente y la pantalla de exito lo
// muestra, asi que se respeta; lo que el servidor garantiza es que no se repita.
// El indice unico sobre codigo_norm es la defensa real; esto da el mensaje.
async function opCrearGrupo(req, res, cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return sendError(res, 400, 'nf_cuerpo_invalido', 'No pudimos crear el grupo. Intentá de nuevo.');
  }
  const permitidas = TABLAS.grupos.columnasInsert;
  const limpio = {};
  const claves = Object.keys(cuerpo);
  for (let i = 0; i < claves.length; i++) {
    if (permitidas.indexOf(claves[i]) === -1) {
      return sendError(res, 400, 'nf_campo_no_aceptado', 'No pudimos crear el grupo. Intentá de nuevo.');
    }
    limpio[claves[i]] = cuerpo[claves[i]];
  }
  const codigo = normCodigo(limpio.codigo);
  if (!PATRONES.codigo.test(codigo)) {
    return sendError(res, 400, 'nf_codigo_invalido', 'No pudimos crear el grupo. Intentá de nuevo.');
  }
  limpio.codigo = codigo;

  const yaExiste = await fetch(
    REST + '/grupos?codigo_norm=eq.' + encodeURIComponent(codigo) + '&select=id',
    { headers: cabecerasServicio() }
  );
  if (yaExiste.ok) {
    const filas = await yaExiste.json();
    if (filas && filas.length) {
      return sendError(res, 409, 'nf_codigo_ocupado', 'Ese código ya está en uso. Probá de nuevo.');
    }
  }
  return reenviar(res, 'POST', '/grupos', 'return=representation', limpio);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  // Solo POST: un GET quedaria cacheado por el service worker del cliente
  // ("if (e.request.method !== 'GET') return" en sw.js) y serviria datos viejos.
  if (req.method !== 'POST') {
    return sendError(res, 405, 'nf_metodo_no_aceptado', 'Operación no permitida.');
  }
  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[db] faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return sendError(res, 500, 'nf_servidor_sin_configurar', 'Servicio no disponible por un momento.');
  }

  let payload;
  try {
    payload = getBody(req);
  } catch (e) {
    return sendError(res, 400, 'nf_cuerpo_invalido', 'No pudimos procesar el pedido.');
  }

  const op = payload.op;
  const tabla = payload.table;
  if (['select', 'insert', 'update', 'delete'].indexOf(op) === -1) {
    return sendError(res, 400, 'nf_operacion_no_aceptada', 'Operación no permitida.');
  }
  if (!Object.prototype.hasOwnProperty.call(TABLAS, tabla)) {
    return sendError(res, 400, 'nf_tabla_no_aceptada', 'Operación no permitida.');
  }
  const cfg = TABLAS[tabla];

  try {
    // --- casos sin credencial previa ---------------------------------------
    if (tabla === 'grupos' && op === 'select') {
      const filtros = parsearFiltros('grupos', payload.q);
      // Un codigo con formato invalido nunca existe: se responde vacio, no
      // error, para que la pantalla diga "Codigo no encontrado".
      if (!filtros && /(?:^|&)codigo=eq\./.test(String(payload.q == null ? '' : payload.q))) {
        return sendCrudo(res, 200, 'application/json; charset=utf-8', '[]');
      }
      if (!filtros) {
        return sendError(res, 400, 'nf_filtro_no_aceptado', 'Operación no permitida.');
      }
      const porCodigo = buscarFiltroEq(filtros, 'codigo_norm');
      if (porCodigo && filtros.length === 1) {
        return opEntrarConCodigo(req, res, porCodigo);
      }
    }
    if (tabla === 'grupos' && op === 'insert') {
      return opCrearGrupo(req, res, payload.body);
    }

    // --- todo lo demas exige credencial ------------------------------------
    const codigos = leerCodigos(req);
    if (!codigos.length) {
      return sendError(res, 401, 'nf_sin_credencial', 'Volvé a entrar con tu código de hogar.');
    }
    const autorizados = await idsAutorizados(codigos);
    if (!autorizados.length) {
      return sendError(res, 403, 'nf_credencial_no_vale', 'Volvé a entrar con tu código de hogar.');
    }

    if (op === 'select') {
      const filtros = parsearFiltros(tabla, payload.q);
      if (!filtros) return sendError(res, 400, 'nf_filtro_no_aceptado', 'Operación no permitida.');
      const pedido = buscarFiltroEq(filtros, cfg.columnaGrupo);
      if (!pedido) return sendError(res, 400, 'nf_falta_grupo', 'Operación no permitida.');
      if (autorizados.indexOf(String(pedido)) === -1) {
        return sendError(res, 403, 'nf_grupo_ajeno', 'No tenés acceso a esos datos.');
      }
      return reenviar(res, 'GET', '/' + tabla + '?' + serializarFiltros(filtros) +
        '&order=created_at.asc');
    }

    if (op === 'insert') {
      // Solo tablas de datos: 'grupos' ya salio por opCrearGrupo.
      const cuerpo = payload.body;
      const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      if (!filas.length) return sendError(res, 400, 'nf_cuerpo_invalido', 'No pudimos guardar.');
      for (let i = 0; i < filas.length; i++) {
        const fila = filas[i];
        if (!fila || typeof fila !== 'object') {
          return sendError(res, 400, 'nf_cuerpo_invalido', 'No pudimos guardar.');
        }
        const gid = String(fila[cfg.columnaGrupo] || '');
        if (!gid) return sendError(res, 400, 'nf_falta_grupo', 'No pudimos guardar.');
        if (autorizados.indexOf(gid) === -1) {
          return sendError(res, 403, 'nf_grupo_ajeno', 'No tenés acceso a esos datos.');
        }
      }
      // El cuerpo va TAL CUAL: si trae una columna que la base no tiene, el
      // error de PostgREST tiene que llegar al cliente para que el respaldo de
      // dbPostMoney se dispare.
      return reenviar(res, 'POST', '/' + tabla, 'return=representation', cuerpo);
    }

    // --- update y delete: llegan con el id de la fila -----------------------
    const id = String(payload.id == null ? '' : payload.id);
    if (!PATRONES.id.test(id)) return sendError(res, 400, 'nf_id_invalido', 'Operación no permitida.');

    if (tabla === 'grupos') {
      if (autorizados.indexOf(id) === -1) {
        return sendError(res, 403, 'nf_grupo_ajeno', 'No tenés acceso a esos datos.');
      }
      // Borrar un grupo desde el cliente nunca estuvo implementado y no se abre.
      if (op === 'delete') {
        return sendError(res, 403, 'nf_operacion_no_aceptada', 'Operación no permitida.');
      }
      const cuerpo = payload.body;
      if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
        return sendError(res, 400, 'nf_cuerpo_invalido', 'No pudimos guardar.');
      }
      const claves = Object.keys(cuerpo);
      if (!claves.length) return sendError(res, 400, 'nf_cuerpo_invalido', 'No pudimos guardar.');
      for (let i = 0; i < claves.length; i++) {
        if (cfg.columnasUpdate.indexOf(claves[i]) === -1) {
          return sendError(res, 400, 'nf_campo_no_aceptado', 'No pudimos guardar.');
        }
      }
      return reenviar(res, 'PATCH', '/grupos?id=eq.' + encodeURIComponent(id),
        'return=representation', cuerpo);
    }

    // En tablas de datos llega solo el id: hay que ver de quien es la fila
    // antes de tocarla.
    const duenio = await grupoDeFila(tabla, id);
    if (duenio.fallo) {
      return sendCrudo(res, duenio.fallo.status, duenio.fallo.tipo, duenio.fallo.texto);
    }
    if (!duenio.ausente && autorizados.indexOf(duenio.grupoId) === -1) {
      return sendError(res, 403, 'nf_grupo_ajeno', 'No tenés acceso a esos datos.');
    }
    // Si la fila ya no existe se deja pasar: PostgREST responde lo mismo que
    // hoy (array vacio o 204) y tocar Eliminar dos veces no cambia nada.

    if (op === 'delete') {
      return reenviar(res, 'DELETE', '/' + tabla + '?id=eq.' + encodeURIComponent(id),
        'return=minimal');
    }

    const cuerpo = payload.body;
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      return sendError(res, 400, 'nf_cuerpo_invalido', 'No pudimos guardar.');
    }
    // El id y la fecha de creacion nunca se reescriben; el resto del cuerpo pasa
    // tal cual, por lo mismo que en insert.
    const limpio = Object.assign({}, cuerpo);
    delete limpio.id;
    delete limpio.created_at;
    if (Object.prototype.hasOwnProperty.call(limpio, cfg.columnaGrupo)) {
      const gid = String(limpio[cfg.columnaGrupo] || '');
      if (gid && autorizados.indexOf(gid) === -1) {
        return sendError(res, 403, 'nf_grupo_ajeno', 'No tenés acceso a esos datos.');
      }
    }
    return reenviar(res, 'PATCH', '/' + tabla + '?id=eq.' + encodeURIComponent(id),
      'return=representation', limpio);
  } catch (err) {
    console.error('[db] error inesperado:', err && err.message);
    return sendError(res, 502, 'nf_proxy_fallo', 'No pudimos conectar. Probá de nuevo.');
  }
}

module.exports = handler;
module.exports.config = config;
