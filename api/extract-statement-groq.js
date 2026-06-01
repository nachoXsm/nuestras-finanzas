const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_TEXT_CHARS = 28000;

const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb'
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

function extractJsonArray(text) {
  const raw = String(text || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.items || parsed.gastos || parsed.consumos || []);
  } catch (_) {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('Groq no devolvió JSON válido.');
  }
}

function buildPrompt(payload) {
  const rawText = String(payload.rawText || '').slice(0, MAX_TEXT_CHARS);
  const visionLines = Array.isArray(payload.visionLines) ? payload.visionLines.slice(0, 500) : [];
  const preferredDueDate = payload.preferredDueDate || null;

  return `You are a credit card statement parser. Extract all purchases/expenses from the statement text below.

Return ONLY a valid JSON object with an "items" array, no markdown, no explanation.

Required format:
{
  "items": [
    {
      "fecha": "${preferredDueDate || 'YYYY-MM-DD'}",
      "descripcion": "merchant name (max 50 chars)",
      "cuotas": "09/18 or null",
      "monto": 61111.05,
      "moneda": "ARS or USD",
      "tipo": "credito"
    }
  ]
}

Rules:
- Extract ONLY purchases/charges. Skip: payments, balances, limits, taxes, totals, interest.
- fecha: use the due date (vencimiento/fecha de vencimiento) for ALL rows. If not found, use the statement closing date.${preferredDueDate ? ' Use ' + preferredDueDate + ' as the due date.' : ''}
- monto: positive decimal number with dot separator. Example: 61.111,05 → 61111.05 / 1,234.56 → 1234.56
- moneda: "USD" if the line contains USD/US$/U$S or an explicit dollar amount, otherwise "ARS"
- cuotas: installment info like "06/12" if present in the same line, otherwise null
- Dates in the source may appear as DD/MM/YY, DD.MM.YY, MM/DD/YYYY or DD Mon YY — ignore them for fecha, always use the due date
- Keep each purchase as a separate item
- descripcion: clean merchant name, remove coupon numbers and date fragments

Statement text (OCR):
${visionLines.length ? visionLines.join('\n') + '\n\n' : ''}${rawText}`;
}

async function callGroq(payload) {
  const apiKey = process.env.GROQ_KEY || '';
  if (!apiKey) throw new Error('Falta configurar GROQ_KEY en Vercel.');

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: buildPrompt(payload) }],
      max_tokens: 8000,
      temperature: 0,
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && (data.error && data.error.message || data.message);
    throw new Error(message || 'Groq API error.');
  }

  const text = data
    && data.choices
    && data.choices[0]
    && data.choices[0].message
    && data.choices[0].message.content;

  return extractJsonArray(text);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const gastos = await callGroq(getBody(req));
    sendJson(res, 200, gastos);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Error extrayendo resumen con Groq.' });
  }
}

module.exports = handler;
module.exports.config = config;
