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

// Google devuelve errores tecnicos en ingles, con URLs internas y el numero de
// proyecto. Eso llegaba tal cual a la pantalla del usuario y se leia como "la app
// esta rota". Traducimos los casos conocidos a un mensaje que explique que hacer;
// el detalle real queda en los logs del servidor para poder diagnosticar.
function mensajeVisionParaUsuario(message) {
  const raw = String(message || '');
  if (/billing|facturaci/i.test(raw)) {
    return 'La lectura por foto está temporalmente en mantenimiento. Cargá el gasto a mano o por voz — funciona igual.';
  }
  if (/api key|api_key|invalid key|permission|forbidden|not authorized|disabled/i.test(raw)) {
    return 'La lectura por foto no está disponible en este momento. Cargá el gasto a mano o por voz — funciona igual.';
  }
  if (/quota|rate limit|too many requests|resource exhausted/i.test(raw)) {
    return 'Se alcanzó el límite de lecturas por hoy. Cargá el gasto a mano o por voz, y volvé a probar mañana.';
  }
  return 'No pudimos leer la imagen en este momento. Cargá el gasto a mano o por voz — funciona igual.';
}

async function callVision(path, body) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY || '';
  if (!apiKey) throw new Error(mensajeVisionParaUsuario('api key'));

  const response = await fetch(`https://vision.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data && (data.error && data.error.message || data.message)) || 'Google Vision API error.';
    console.error('[vision] Google devolvio error:', response.status, message);
    throw new Error(mensajeVisionParaUsuario(message));
  }
  return data;
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const payload = getBody(req);
    const content = payload.content;
    const mimeType = payload.mimeType;

    if (!content) throw new Error('Archivo vacio para Vision.');

    if (payload.kind === 'file') {
      const data = await callVision('files:annotate', {
        requests: [{
          inputConfig: { content, mimeType },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          pages: payload.pages || [1, 2, 3, 4, 5]
        }]
      });
      return sendJson(res, 200, data);
    }

    const data = await callVision('images:annotate', {
      requests: [{
        image: { content },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }]
      }]
    });
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Error leyendo archivo con Vision.' });
  }
}

module.exports = handler;
module.exports.config = config;
