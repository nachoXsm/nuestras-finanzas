// OCR con Google Gemini: recibe una imagen (o PDF) en base64 y devuelve el TEXTO
// plano del comprobante. Es un reemplazo directo de /api/vision: devuelve texto,
// no JSON estructurado, para que todos los parsers que ya existen en el cliente
// (parseTicketText, los parsers de resumen y el chequeo doble del monto) sigan
// funcionando exactamente igual. El unico cambio es quien produce el texto.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Google retira modelos seguido: gemini-2.0-flash se dio de baja el 1-jun-2026 y
// la familia 2.5 se apaga el 16-oct-2026. Probamos en orden y usamos el primero
// que responda, asi una baja futura no rompe la app. Se puede pisar la lista con
// la variable de entorno GEMINI_OCR_MODELS (separada por comas) sin tocar codigo.
// Para ver que modelos estan vivos con tu key: GET a este mismo endpoint.
const DEFAULT_MODELS = [
  'gemini-3.5-flash-lite',  // rapido y con el cupo gratuito mas alto
  'gemini-3.5-flash',       // respaldo
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash-lite',  // ultimo recurso; se apaga el 16-oct-2026
];

// Vercel corta el body de las serverless functions cerca de 4.5 MB. El base64
// infla ~33%, asi que avisamos antes con un mensaje claro en vez de dejar que la
// plataforma devuelva un 413 en HTML que el cliente no sabe interpretar.
const MAX_BASE64_CHARS = 4 * 1024 * 1024;

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

function getModels() {
  const fromEnv = String(process.env.GEMINI_OCR_MODELS || '').trim();
  if (!fromEnv) return DEFAULT_MODELS;
  const list = fromEnv.split(',').map(function(m) { return m.trim(); }).filter(Boolean);
  return list.length ? list : DEFAULT_MODELS;
}

// Los errores de Google vienen en ingles y con detalles internos. Al usuario le
// mostramos que hacer; el detalle real queda en los logs del servidor.
function mensajeParaUsuario(message) {
  const raw = String(message || '');
  if (/quota|rate limit|too many requests|resource exhausted/i.test(raw)) {
    return 'Se alcanzó el límite de lecturas por ahora. Cargá el gasto a mano o por voz, y volvé a probar en un rato.';
  }
  if (/api.?key|permission|forbidden|unregistered|unauthenticated/i.test(raw)) {
    return 'La lectura por foto no está disponible en este momento. Cargá el gasto a mano o por voz — funciona igual.';
  }
  return 'No pudimos leer la imagen en este momento. Cargá el gasto a mano o por voz — funciona igual.';
}

// Solo tiene sentido probar el siguiente modelo si el problema es DEL MODELO
// (no existe, se retiro, se agoto su cuota) o del servidor. Si la API key es
// invalida o falta, todos los modelos van a fallar igual: cortamos en el primero
// para no gastar tres viajes de ida y vuelta con una imagen adjunta.
function esErrorDeModelo(status, message) {
  if (status === 404 || status === 429 || status >= 500) return true;
  return /not found|no longer available|not supported|deprecated|decommissioned|quota|rate limit|overloaded|unavailable/i.test(String(message || ''));
}

// El prompt es la parte mas delicada de todo el cambio. Los parsers del cliente
// esperan el texto "una linea por renglon visual del comprobante". Si el modelo
// agrega un preambulo ("Aqui esta el texto:"), viñetas o markdown, los parsers
// dejan de reconocer las filas y fallan EN SILENCIO. Por eso se le prohibe
// explicitamente y despues se limpia la respuesta por las dudas.
const PROMPT_OCR =
  'Transcribí TODO el texto visible de esta imagen de un comprobante, ticket o factura.\n\n' +
  'Reglas estrictas:\n' +
  '- Devolvé ÚNICAMENTE el texto transcripto. Sin introducción, sin comentarios, sin conclusiones.\n' +
  '- NO uses markdown: nada de ```, ni **, ni #, ni viñetas, ni tablas con |.\n' +
  '- Respetá la disposición visual: una línea de texto por cada renglón del comprobante, en el mismo orden en que aparecen de arriba hacia abajo.\n' +
  '- Mantené los números EXACTAMENTE como están impresos, con sus puntos y comas originales. No los reformatees ni los redondees.\n' +
  '- Mantené los símbolos de moneda, fechas y códigos tal cual aparecen.\n' +
  '- Si una parte está borrosa o ilegible, transcribí lo que se llegue a distinguir y seguí. No agregues aclaraciones.\n' +
  '- No inventes ni completes datos que no estén en la imagen.';

// Los modelos 3.x razonan antes de responder: entre las partes de la respuesta
// pueden venir bloques de pensamiento marcados con thought:true que NO son el
// texto del comprobante y hay que descartar.
function textoDeRespuesta(data) {
  const candidates = (data && data.candidates) || [];
  if (!candidates.length) return '';
  const parts = (candidates[0].content && candidates[0].content.parts) || [];
  return parts
    .filter(function(p) { return p && !p.thought && typeof p.text === 'string'; })
    .map(function(p) { return p.text; })
    .join('')
    .trim();
}

// Red de seguridad por si el modelo ignora el prompt: sacamos el cerco de
// markdown y cualquier linea inicial que sea claramente un preambulo.
function limpiarTexto(text) {
  let out = String(text || '').trim();
  out = out.replace(/^```(?:[a-z]*)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const lineas = out.split('\n');
  if (lineas.length > 1 && /^(aqu[ií]|este es|el texto|transcripci[óo]n|claro|por supuesto)\b.*:\s*$/i.test(lineas[0].trim())) {
    lineas.shift();
    out = lineas.join('\n').trim();
  }
  return out;
}

async function llamarGemini(apiKey, model, content, mimeType, sinThinking) {
  const generationConfig = {
    temperature: 0,
    maxOutputTokens: 8192
  };
  // Los modelos 3.x razonan antes de responder. Para transcribir un ticket eso no
  // aporta nada y agrega varios segundos de espera, asi que lo apagamos. El campo
  // no lo aceptan todos los modelos: si devuelve 400 se reintenta sin el (ver mas
  // abajo), en vez de dar el modelo por perdido.
  if (!sinThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const response = await fetch(`${GEMINI_URL}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // La key va por header y no en la URL: las URLs quedan escritas en los logs
      // de Vercel y de cualquier proxy intermedio.
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: content } },
          { text: PROMPT_OCR }
        ]
      }],
      generationConfig: generationConfig
    })
  });

  const data = await response.json().catch(function() { return null; });

  if (!response.ok) {
    const message = (data && data.error && data.error.message) || `HTTP ${response.status}`;
    return { ok: false, status: response.status, message: message };
  }

  const text = limpiarTexto(textoDeRespuesta(data));
  if (!text) {
    // Sin texto util. Suele pasar cuando el razonamiento se comio el presupuesto
    // de tokens (finishReason MAX_TOKENS) o cuando el prompt fue bloqueado.
    const razon = (data && data.candidates && data.candidates[0] && data.candidates[0].finishReason) ||
      (data && data.promptFeedback && data.promptFeedback.blockReason) || 'sin texto';
    return { ok: false, status: 200, message: `Respuesta vacía (${razon})` };
  }

  return { ok: true, text: text, model: model };
}

async function ocrConGemini(content, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    console.error('[ocr-gemini] Falta GEMINI_API_KEY en las variables de entorno.');
    throw new Error(mensajeParaUsuario('api key'));
  }

  const models = getModels();
  let ultimoError = 'Gemini API error.';

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    let res;
    try {
      res = await llamarGemini(apiKey, model, content, mimeType, false);
      // Si el modelo no conoce thinkingConfig, se reintenta igual pero sin ese
      // campo: es un problema del payload, no del modelo.
      if (!res.ok && res.status === 400 && /thinking|unknown name|invalid json payload/i.test(res.message)) {
        console.warn('[ocr-gemini]', model, 'no acepta thinkingConfig, se reintenta sin el');
        res = await llamarGemini(apiKey, model, content, mimeType, true);
      }
    } catch (e) {
      // Error de red: probamos con el siguiente modelo.
      ultimoError = (e && e.message) || 'Network error';
      console.error('[ocr-gemini] fallo de red con', model, ultimoError);
      continue;
    }

    if (res.ok) {
      console.log('[ocr-gemini] leido con', res.model, '-', res.text.length, 'caracteres');
      return res.text;
    }

    ultimoError = res.message;
    console.error('[ocr-gemini]', model, 'devolvio', res.status, res.message);

    if (!esErrorDeModelo(res.status, res.message)) break;
  }

  throw new Error(mensajeParaUsuario(ultimoError));
}

// GET: lista los modelos que la key tiene disponibles hoy. Es la unica fuente
// confiable de nombres vigentes (las listas publicadas quedan viejas enseguida).
// Sirve para verificar la configuracion sin tener que sacar una foto.
async function listarModelos(res) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return sendJson(res, 500, { error: 'Falta configurar GEMINI_API_KEY en Vercel.' });

  const response = await fetch(`${GEMINI_URL}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey }
  });
  const data = await response.json().catch(function() { return null; });

  if (!response.ok) {
    const message = (data && data.error && data.error.message) || `HTTP ${response.status}`;
    return sendJson(res, response.status, { error: message });
  }

  const disponibles = ((data && data.models) || [])
    .filter(function(m) {
      return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
    })
    .map(function(m) { return String(m.name || '').replace(/^models\//, ''); });

  const configurados = getModels();
  return sendJson(res, 200, {
    disponibles: disponibles,
    configurados: configurados,
    vivos: configurados.filter(function(m) { return disponibles.indexOf(m) >= 0; })
  });
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method === 'GET') return await listarModelos(res);
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const payload = getBody(req);
    const content = payload.content;
    const mimeType = payload.mimeType || 'image/jpeg';

    if (!content) return sendJson(res, 400, { error: 'No llegó la imagen para leer.' });

    if (String(content).length > MAX_BASE64_CHARS) {
      console.error('[ocr-gemini] imagen demasiado grande:', String(content).length, 'caracteres base64');
      return sendJson(res, 413, { error: 'La imagen es demasiado grande. Sacá la foto con menos resolución o recortala.' });
    }

    const text = await ocrConGemini(content, mimeType);
    sendJson(res, 200, { text: text });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'No pudimos leer la imagen en este momento.' });
  }
}

module.exports = handler;
module.exports.config = config;
