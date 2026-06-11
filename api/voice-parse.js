const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data && (data.error && data.error.message || data.message);
      return sendJson(res, 500, { error: message || 'Groq API error.' });
    }

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
