const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq da de baja modelos cada tanto (paso con llama-3.3-70b-versatile, que
// empezo a devolver "model_not_found"). Se prueban en orden y se usa el primero
// disponible. Lista vigente: console.groq.com -> Models.
const GROQ_MODELS = [
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
];

// Prueba los modelos en orden; solo pasa al siguiente si el modelo no existe.
async function groqChat(apiKey, payload) {
  let ultimoError = null;
  for (const model of GROQ_MODELS) {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(Object.assign({}, payload, { model }))
    });
    const data = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: data };
    const message = (data && (data.error && data.error.message || data.message)) || 'Groq API error.';
    ultimoError = message;
    if (!/model_not_found|does not exist|decommissioned|not supported/i.test(message)) {
      return { ok: false, error: message };
    }
  }
  return { ok: false, error: ultimoError || 'Groq API error.' };
}

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

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const apiKey = process.env.GROQ_KEY || '';
  if (!apiKey) return sendJson(res, 500, { error: 'Falta configurar GROQ_KEY en Vercel.' });

  try {
    const body = getBody(req);
    const prompt = String(body.prompt || '').slice(0, 6000);
    if (!prompt) return sendJson(res, 400, { error: 'Falta el prompt.' });

    const result = await groqChat(apiKey, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    if (!result.ok) return sendJson(res, 500, { error: result.error });
    const data = result.data;

    const reply = data
      && data.choices
      && data.choices[0]
      && data.choices[0].message
      && data.choices[0].message.content;

    sendJson(res, 200, { reply: reply || '' });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Error interpretando el dictado.' });
  }
}

module.exports = handler;
