// Verificacion de premium para los endpoints que cuestan plata.
//
// POR QUE EXISTE: hasta ahora el premium vivia solo en el navegador, asi que
// cualquiera se lo activaba desde la consola. Peor: estos endpoints no miraban
// nada, asi que cualquiera con curl los usaba sin tener la app siquiera. Este
// modulo es el unico lugar donde eso se corta de verdad.
//
// COMO SE PRENDE, EN ETAPAS:
//   NF_PREMIUM_EXIGIR      sin definir -> SOLO OBSERVA. Registra en el log quien
//                          llama y si tendria premium, pero NO corta a nadie.
//                          Con valor -> lista separada por comas de las funciones
//                          a exigir. Ej: "ocr"  /  "ocr,ia"  /  "ocr,ia,voice".
//   NF_PREMIUM_SIN_CABECERA  'rechazar' -> corta a los clientes viejos que todavia
//                          no mandan la cabecera. Por defecto los DEJA PASAR,
//                          porque durante unos dias hay celulares con la version
//                          anterior y cortarlos seria romperles la app.
//
// OJO: cambiar una variable de entorno en Vercel NO afecta al deploy que esta
// corriendo. Hay que hacer Redeploy. No es un interruptor instantaneo.
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REST = SB_URL + '/rest/v1';

const MAX_CODIGOS = 25;

// Mismo saneado que api/db.js y que el cliente: mayusculas, solo letras y
// numeros. Si los tres no coinciden, un codigo con guion no autoriza nada.
function normCodigo(c) {
  return String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function leerCodigos(req) {
  const raw = (req && req.headers && req.headers['x-nf-codigos']) || '';
  const vistos = Object.create(null);
  const out = [];
  String(raw).split(',').forEach(function (c) {
    const v = normCodigo(c);
    if (!/^[A-Z0-9]{6,16}$/.test(v)) return;
    if (vistos[v]) return;
    vistos[v] = true;
    if (out.length < MAX_CODIGOS) out.push(v);
  });
  return out;
}

function funcionesExigidas() {
  const raw = String(process.env.NF_PREMIUM_EXIGIR || '').trim();
  if (!raw) return [];
  return raw.split(',').map(function (f) { return f.trim().toLowerCase(); }).filter(Boolean);
}

// Un dispositivo puede presentar varios hogares (el propio mas los grupos de
// gastos a los que entro). Alcanza con que UNO tenga premium: no hay forma de
// ser mas fino porque estos endpoints no reciben a que grupo pertenece el
// pedido (vision solo recibe una imagen). No es un agujero nuevo: tener el
// codigo de un hogar premium ya significa poder entrar a ese hogar.
async function hayPremium(codigos) {
  if (!codigos.length) return false;
  const q = 'codigo_norm=in.(' + codigos.map(encodeURIComponent).join(',') +
    ')&select=premium_hasta';
  const r = await fetch(REST + '/grupos?' + q, {
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': 'Bearer ' + SB_SERVICE_KEY
    }
  });
  if (!r.ok) {
    // Ante un fallo de la base NO se corta a nadie: un problema nuestro no
    // puede dejar sin servicio a quien pago.
    console.error('[premium] no se pudo consultar la base:', r.status);
    return true;
  }
  const filas = await r.json();
  const ahora = Date.now();
  return (filas || []).some(function (f) {
    return f && f.premium_hasta && new Date(f.premium_hasta).getTime() > ahora;
  });
}

// Devuelve { permitido, estado, mensaje }.
// 'mensaje' va en el campo 'error' de la respuesta, porque es lo que el cliente
// muestra como toast (postJsonWithFallback hace data.error || data.message).
// NUNCA puede contener 'column', 'schema' ni 'PGRST': isUnknownColumnError en el
// cliente reintentaria la operacion borrando campos.
async function verificarPremium(req, funcion) {
  const exigidas = funcionesExigidas();
  const seExige = exigidas.indexOf(String(funcion).toLowerCase()) !== -1;

  if (!SB_URL || !SB_SERVICE_KEY) {
    console.error('[premium] faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return { permitido: true, estado: 'sin-configurar' };
  }

  const codigos = leerCodigos(req);

  if (!codigos.length) {
    const cortar = String(process.env.NF_PREMIUM_SIN_CABECERA || '').toLowerCase() === 'rechazar';
    console.log('[premium]', funcion, cortar ? 'rechazado sin cabecera' : 'pasa sin cabecera');
    if (cortar && seExige) {
      return {
        permitido: false,
        estado: 'sin-cabecera',
        mensaje: 'Actualizá la app para seguir usando esta función: cerrala por completo y volvé a abrirla.'
      };
    }
    return { permitido: true, estado: 'sin-cabecera' };
  }

  let premium;
  try {
    premium = await hayPremium(codigos);
  } catch (e) {
    console.error('[premium] error al verificar:', (e && e.message) || e);
    return { permitido: true, estado: 'error-verificando' };
  }

  if (!seExige) {
    // Etapa de observacion: se registra para poder medir cuanta gente quedaria
    // afuera antes de cortarle a nadie.
    console.log('[premium]', funcion, 'observado', premium ? 'con-premium' : 'SIN-premium');
    return { permitido: true, estado: premium ? 'observado-con' : 'observado-sin' };
  }

  if (premium) return { permitido: true, estado: 'con-premium' };

  console.log('[premium]', funcion, 'rechazado sin premium');
  return {
    permitido: false,
    estado: 'sin-premium',
    mensaje: 'Esta función es parte de Premium. Activalo desde la app para usarla.'
  };
}

module.exports = { verificarPremium };
