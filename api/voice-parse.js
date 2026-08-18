const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Extraccion estructurada (JSON) de un dictado corto: prioriza VELOCIDAD y
// costo, que para esta tarea rinde igual que un modelo grande.
// Solo modelos de PRODUCCION (los "preview" pueden discontinuarse sin aviso).
const GROQ_MODELS = [
  'openai/gpt-oss-20b',    // el mas rapido de produccion (1000 t/s)
  'openai/gpt-oss-120b',   // respaldo
  'llama-3.1-8b-instant',  // ultimo recurso
];

// Prueba los modelos en orden y usa el primero que responda.
// Pasa al siguiente si el modelo no existe O si se agoto su cuota: en Groq los
// limites son POR MODELO, asi que si uno se queda sin cupo el otro sigue
// disponible y la carga por voz no se corta.
function esErrorRecuperable(status, message) {
  if (status === 429) return true;
  return /model_not_found|does not exist|decommissioned|not supported|rate limit|too many requests|quota|capacity|over capacity|service unavailable/i.test(message);
}
async function groqChat(apiKey, payload) {
  let ultimoError = null;
  for (const model of GROQ_MODELS) {
    let response, data;
    try {
      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(Object.assign({}, payload, { model }))
      });
      data = await response.json().catch(() => null);
    } catch (e) {
      ultimoError = (e && e.message) || 'Network error';
      continue;
    }
    if (response.ok) return { ok: true, data: data };
    const message = (data && (data.error && data.error.message || data.message)) || 'Groq API error.';
    ultimoError = message;
    if (!esErrorRecuperable(response.status, message)) {
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
