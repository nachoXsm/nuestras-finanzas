// Asesor financiero IA — versión Vercel.
// Port de supabase/functions/ai-advisor/index.ts para poder desplegarlo con un
// simple `git push` (la Edge Function de Supabase requiere el CLI desde la PC).
// Mantiene exactamente el mismo contrato: recibe { messages, context } y
// devuelve { reply }.

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

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  res.end(JSON.stringify(data));
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

// Prueba los modelos en orden; solo pasa al siguiente si el modelo no existe.
// Ante otros errores (rate limit, auth) devuelve el error real.
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

function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function buildSystemPrompt(ctx) {
  ctx = ctx || {};
  const moneda = ctx.moneda || 'ARS';
  const mes = ctx.mes || '';
  const ingresos = num(ctx.ingresos);
  const gastos = num(ctx.gastos);
  const saldo = ingresos - gastos;
  const ahorro = ingresos > 0 ? Math.round((saldo / ingresos) * 100) : 0;

  const cats = ctx.categorias;
  const catLines = (cats && typeof cats === 'object')
    ? Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `  - ${k}: ${moneda} ${num(v).toLocaleString('es-AR')}`)
        .join('\n')
    : '  (sin datos)';

  const grupo = ctx.grupo;
  const grupoSection = grupo
    ? `\nModo grupo de gastos:
  - Total del grupo: ${moneda} ${num(grupo.total).toLocaleString('es-AR')}
  - Participantes: ${grupo.participantes}
  - Te deben: ${moneda} ${num(grupo.leDeben).toLocaleString('es-AR')}
  - Debés: ${moneda} ${num(grupo.debes).toLocaleString('es-AR')}`
    : '';

  return `Sos un asesor financiero personal amigable y directo, especializado en finanzas personales en Argentina.
Respondés siempre en español rioplatense, de forma clara y concreta. Máximo 3-4 párrafos por respuesta.
No usás lenguaje técnico innecesario. Sos objetivo: si hay un problema en los números, lo decís sin rodeos.
Nunca inventás datos — solo usás los que se te proveen.

SITUACIÓN FINANCIERA ACTUAL DEL USUARIO (${mes}):
- Ingresos: ${moneda} ${ingresos.toLocaleString('es-AR')}
- Gastos: ${moneda} ${gastos.toLocaleString('es-AR')}
- Saldo: ${moneda} ${saldo.toLocaleString('es-AR')} (${saldo >= 0 ? '+' : ''}${ahorro}% de ahorro)

Gastos por categoría:
${catLines}${grupoSection}

Basate siempre en estos datos para dar consejos personalizados y concretos.`;
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const apiKey = process.env.GROQ_KEY || '';
  if (!apiKey) return sendJson(res, 500, { error: 'Falta configurar GROQ_KEY en Vercel.' });

  try {
    const body = getBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return sendJson(res, 400, { error: 'Faltan los mensajes.' });

    const systemPrompt = buildSystemPrompt(body.context);

    const result = await groqChat(apiKey, {
      messages: [{ role: 'system', content: systemPrompt }].concat(messages),
      max_tokens: 800,
      temperature: 0.7,
    });

    if (!result.ok) return sendJson(res, 502, { error: result.error });

    const data = result.data;
    const reply = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    sendJson(res, 200, { reply: reply });
  } catch (err) {
    sendJson(res, 500, { error: (err && err.message) || 'Error consultando al asesor.' });
  }
}

module.exports = handler;
module.exports.default = handler;
