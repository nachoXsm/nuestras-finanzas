const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Resumen de tarjeta: puede tener decenas de consumos, asi que arranca por el
// modelo grande para no perder filas, y baja si no esta disponible.
// Solo modelos de PRODUCCION (los "preview" pueden discontinuarse sin aviso).
const GROQ_MODELS = [
  'openai/gpt-oss-120b',   // mejor precision con muchas filas
  'openai/gpt-oss-20b',    // respaldo
  'llama-3.1-8b-instant',  // ultimo recurso
];
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

function extractJsonResult(text) {
  const raw = String(text || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(raw);
    // Return full object with due_date + items if available
    if (!Array.isArray(parsed) && parsed && (parsed.items || parsed.gastos || parsed.consumos)) {
      return {
        due_date: parsed.due_date || parsed.fecha_vencimiento || null,
        items: parsed.items || parsed.gastos || parsed.consumos || []
      };
    }
    // Bare array — no due_date info
    const items = Array.isArray(parsed) ? parsed : [];
    return { due_date: null, items };
  } catch (_) {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start >= 0 && end > start) return { due_date: null, items: JSON.parse(raw.slice(start, end + 1)) };
    throw new Error('Groq no devolvió JSON válido.');
  }
}

function buildPrompt(payload) {
  const rawText = String(payload.rawText || '').slice(0, MAX_TEXT_CHARS);
  const visionLines = Array.isArray(payload.visionLines) ? payload.visionLines.slice(0, 500) : [];
  const preferredDueDate = payload.preferredDueDate || null;

  const dueDateInstruction = preferredDueDate
    ? `The payment due date is ${preferredDueDate}. Use this date for ALL items.`
    : 'Find the payment due date (vencimiento/due date/data de vencimento) in the statement and use it for ALL items. It is always AFTER the closing/cierre date by 7-30 days.';

  return `You are a credit card statement parser that works with ANY bank worldwide.

Return ONLY a valid JSON object with this exact structure, no markdown, no explanation:
{
  "due_date": "YYYY-MM-DD",
  "items": [
    {
      "fecha": "YYYY-MM-DD",
      "descripcion": "merchant name (max 50 chars)",
      "cuotas": "09/18 or null",
      "monto": 61111.05,
      "moneda": "ISO 4217 code e.g. ARS, USD, BRL, EUR, GBP, MXN, CLP, COP, UYU, CAD, AUD, JPY, CHF",
      "tipo": "credito"
    }
  ]
}

Rules:
- ${dueDateInstruction}
- due_date: the payment due date found in the statement header. Set "fecha" of EVERY item to this same due_date.
- Extract purchases/charges AND refunds/credits (reintegros, bonificaciones, cashbacks, reversals).
- Skip ONLY: payments made (pagos), previous balances, credit limits, interest charges, taxes, subtotals.
- Refunds/credits: use NEGATIVE monto (e.g. a 287,18- or -287,18 line → monto: -287.18). Negative amounts reduce the total.
- monto: positive number, dot as decimal separator. Examples: 61.111,05 → 61111.05 | 1,234.56 → 1234.56 | $805.18 → 805.18
- moneda: ISO 4217 code for each charge. Detect from the line and statement header: USD (USD/US$/U$S/dollar), BRL (R$/real/reais), EUR (€/EUR/euro), GBP (£/GBP), MXN, CLP, COP, UYU, ARS ($/pesos argentinos). Default to the statement's main currency if not explicit on the line.
- cuotas: installment ratio like "06/12" only if explicitly on the same line, otherwise null
- descripcion: clean merchant name only, no dates, no coupon/reference numbers
- Keep each charge as a separate item, do not merge or group

Statement text:
${visionLines.length ? visionLines.join('\n') + '\n\n' : ''}${rawText}`;
}

async function callGroq(payload) {
  const apiKey = process.env.GROQ_KEY || '';
  if (!apiKey) throw new Error('Falta configurar GROQ_KEY en Vercel.');

  // Prueba los modelos en orden; solo pasa al siguiente si el modelo no existe.
  let data = null;
  let ultimoError = null;
  for (const model of GROQ_MODELS) {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: buildPrompt(payload) }],
        max_tokens: 8000,
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });
    const parsed = await response.json().catch(() => null);
    if (response.ok) { data = parsed; break; }
    const message = (parsed && (parsed.error && parsed.error.message || parsed.message)) || 'Groq API error.';
    ultimoError = message;
    // Se pasa al siguiente modelo si no existe O si se agoto su cuota (en Groq
    // los limites son por modelo). Ante otros errores se corta.
    const recuperable = response.status === 429 ||
      /model_not_found|does not exist|decommissioned|not supported|rate limit|too many requests|quota|capacity|over capacity|service unavailable/i.test(message);
    if (!recuperable) throw new Error(message);
  }
  if (!data) throw new Error(ultimoError || 'Groq API error.');

  const text = data
    && data.choices
    && data.choices[0]
    && data.choices[0].message
    && data.choices[0].message.content;

  return extractJsonResult(text);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const result = await callGroq(getBody(req));
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Error extrayendo resumen con Groq.' });
  }
}

module.exports = handler;
module.exports.config = config;
