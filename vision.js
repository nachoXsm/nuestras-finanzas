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

async function callVision(path, body) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY || '';
  if (!apiKey) throw new Error('Falta configurar GOOGLE_VISION_API_KEY en Vercel.');

  const response = await fetch(`https://vision.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && (data.error && data.error.message || data.message);
    throw new Error(message || 'Google Vision API error.');
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
