// OCR con OCR.space: recibe una imagen en base64 y devuelve el TEXTO plano del
// comprobante, igual que /api/vision y /api/ocr-gemini. Los tres son
// intercambiables a proposito: el cliente los encadena y todo lo que viene
// despues (el regex, los parsers de resumen, el chequeo doble del monto) no se
// entera de cual respondio.
//
// Por que existe: el plan gratuito da 25.000 lecturas por mes SIN tarjeta, que
// es lo que Vision exige. El limite real a tener en cuenta no es el mensual sino
// 500 pedidos por dia POR IP: como las llamadas salen del servidor de Vercel y no
// del celular de cada usuario, ese cupo se comparte entre todos.
const OCRSPACE_URL = 'https://api.ocr.space/parse/image';

// El plan gratuito acepta archivos de hasta 1 MB. El base64 ocupa ~33% mas que el
// archivo, asi que se compara contra el tamano ya decodificado.
const MAX_FILE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 25000;

const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  }
};

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function mensajeParaUsuario(message) {
  const raw = String(message || '');
  if (/limit|quota|exceed|too many|rate/i.test(raw)) {
    return 'Se alcanzó el límite de lecturas por ahora. Cargá el gasto a mano o por voz, y volvé a probar en un rato.';
  }
  if (/timeout|tardó|abort/i.test(raw)) {
    return 'La lectura tardó demasiado. Probá de nuevo con mejor señal, o cargá el gasto a mano o por voz.';
  }
  if (/api.?key|invalid key|unauthorized/i.test(raw)) {
    return 'La lectura por foto no está disponible en este momento. Cargá el gasto a mano o por voz — funciona igual.';
  }
  return 'No pudimos leer la imagen en este momento. Cargá el gasto a mano o por voz — funciona igual.';
}

// El motor 2 suele leer mejor los tickets, pero no soporta todos los idiomas ni
// todos los formatos. Si falla, se reintenta con el 1, que acepta 'spa'.
// El motor 2 detecta el idioma solo, asi que ahi no se manda 'language'.
function armarForm(apiKey, dataUri, engine) {
  const form = new URLSearchParams();
  form.set('apikey', apiKey);
  form.set('base64Image', dataUri);
  form.set('OCREngine', String(engine));
  form.set('isOverlayRequired', 'false');
  form.set('detectOrientation', 'true');  // la foto de un ticket suele salir torcida
  form.set('scale', 'true');              // mejora la lectura de imagenes chicas
  if (engine === 1) form.set('language', 'spa');
  return form;
}

async function llamarOcrSpace(apiKey, dataUri, engine) {
  const desde = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, TIMEOUT_MS);

  let response;
  try {
    response = await fetch(OCRSPACE_URL, {
      signal: ctrl.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: armarForm(apiKey, dataUri, engine).toString()
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      return { ok: false, message: `el motor ${engine} tardó más de ${TIMEOUT_MS / 1000} s`, reintentar: true };
    }
    return { ok: false, message: (e && e.message) || 'Network error', reintentar: true };
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(function() { return null; });

  if (!response.ok || !data) {
    return { ok: false, message: `HTTP ${response.status}`, reintentar: response.status >= 500 };
  }

  // OCR.space devuelve 200 aunque haya fallado: el error viene en el cuerpo.
  if (data.IsErroredOnProcessing) {
    const msg = [].concat(data.ErrorMessage || [], data.ErrorDetails || []).join(' ') || 'error de procesamiento';
    return { ok: false, message: msg, reintentar: true };
  }

  const texto = ((data.ParsedResults || [])
    .map(function(r) { return (r && r.ParsedText) || ''; })
    .join('\n')).trim();

  if (!texto) return { ok: false, message: 'no se encontró texto', reintentar: true };

  return { ok: true, text: texto, engine: engine, ms: Date.now() - desde };
}

async function ocrConOcrSpace(content, mimeType) {
  const apiKey = process.env.OCRSPACE_API_KEY || '';
  if (!apiKey) {
    console.error('[ocr-space] Falta OCRSPACE_API_KEY en las variables de entorno.');
    throw new Error(mensajeParaUsuario('api key'));
  }

  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${content}`;
  let ultimoError = 'OCR.space error.';

  for (const engine of [2, 1]) {
    const res = await llamarOcrSpace(apiKey, dataUri, engine);
    if (res.ok) {
      console.log('[ocr-space] leido con motor', res.engine, '-', res.text.length, 'caracteres en', res.ms, 'ms');
      return res.text;
    }
    ultimoError = res.message;
    console.error('[ocr-space] motor', engine, 'fallo:', res.message);
    if (!res.reintentar) break;
  }

  throw new Error(mensajeParaUsuario(ultimoError));
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  // GET sirve para verificar la configuracion sin tener que sacar una foto.
  if (req.method === 'GET') {
    return sendJson(res, 200, { configurado: !!process.env.OCRSPACE_API_KEY });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const payload = getBody(req);
    const content = payload.content;
    const mimeType = payload.mimeType || 'image/jpeg';

    if (!content) return sendJson(res, 400, { error: 'No llegó la imagen para leer.' });

    const bytes = Math.floor(String(content).length * 3 / 4);
    if (bytes > MAX_FILE_BYTES) {
      console.error('[ocr-space] imagen demasiado grande:', bytes, 'bytes');
      return sendJson(res, 413, { error: 'La imagen es demasiado grande. Sacá la foto con menos resolución o recortala.' });
    }

    const text = await ocrConOcrSpace(content, mimeType);
    sendJson(res, 200, { text: text });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'No pudimos leer la imagen en este momento.' });
  }
}

module.exports = handler;
module.exports.config = config;
