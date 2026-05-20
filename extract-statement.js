const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MAX_TEXT_CHARS = 120000;
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
    throw new Error('Gemini no devolvio JSON valido.');
  }
}

function buildPrompt(payload) {
  const rawText = String(payload.rawText || '').slice(0, MAX_TEXT_CHARS);
  const visionLines = Array.isArray(payload.visionLines) ? payload.visionLines.slice(0, 700) : [];
  const hasFile = Boolean(payload.file && payload.file.data && payload.file.mimeType);

  return `Sos un extractor de resumenes de tarjeta de credito para una app financiera argentina.

Devolve SOLO JSON valido, sin markdown, sin explicaciones.

Formato exacto:
[
  {
    "fecha": "YYYY-MM-DD",
    "descripcion": "comercio o consumo",
    "cuotas": "09/18 o null",
    "monto": 61111.05,
    "moneda": "ARS o USD",
    "tipo": "credito",
    "linea_original": "texto completo de la fila visual original de donde salio el consumo"
  }
]

Reglas obligatorias:
- ${hasFile ? 'Usa el archivo visual/PDF adjunto como fuente principal. El OCR reconstruido es solo apoyo para validar texto.' : 'Usa el OCR reconstruido como fuente principal.'}
- Extrae solo consumos/compras. No incluyas pagos, saldo anterior, saldo actual, limites, tasas, totales ni vencimientos.
- La fecha de TODOS los consumos debe ser VENCIMIENTO ACTUAL. Si no existe, usa PROXIMO VENCIMIENTO.
- No uses la fecha de compra como fecha final del gasto.
- El monto debe salir de la columna Pesos o Dolares, nunca de NRO. CUPON.
- Devuelve "linea_original" con la fila visual completa del consumo, incluyendo fecha de compra, descripcion, cuotas si existen, cupon y monto.
- "cuotas" solo puede salir de "linea_original". Si la cuota no aparece en esa fila exacta, usa null.
- Si hay cuota, debe estar en la misma linea visual o misma descripcion del consumo. En algunos bancos se ve dentro de descripcion, en otros como columna; en ambos casos debe pertenecer a esa misma fila.
- No arrastres cuotas desde la fila anterior ni desde la siguiente.
- Si la descripcion trae "C.09/18", la cuota de esa misma fila es "09/18".
- Si la descripcion trae "C.05/06", la cuota de esa misma fila es "05/06".
- Si la descripcion trae "C.10/12", la cuota de esa misma fila es "10/12".
- Si una fila no tiene cuota propia dentro de su descripcion, "cuotas" debe ser null.
- Conserva cada consumo como un item separado.
- Usa punto decimal en "monto". Ejemplo: 61.111,05 debe ser 61111.05.

Lineas reconstruidas por OCR/layout:
${visionLines.map(l => typeof l === 'string' ? l : (l.line || '')).filter(Boolean).join('\n')}

Texto OCR completo:
${rawText}`;
}

function buildGeminiRequest(payload) {
  const parts = [];
  if (payload.file && payload.file.data && payload.file.mimeType) {
    parts.push({
      inline_data: {
        mime_type: String(payload.file.mimeType),
        data: String(payload.file.data)
      }
    });
  }
  parts.push({ text: buildPrompt(payload) });

  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json'
    }
  };
}

async function callGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('Falta configurar GEMINI_API_KEY en Vercel.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGeminiRequest(payload))
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && (data.error && data.error.message || data.message);
    throw new Error(message || 'Gemini API error.');
  }

  const text = data
    && data.candidates
    && data.candidates[0]
    && data.candidates[0].content
    && data.candidates[0].content.parts
    && data.candidates[0].content.parts.map(p => p.text || '').join('');

  return extractJsonArray(text);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const gastos = await callGemini(getBody(req));
    sendJson(res, 200, gastos);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Error extrayendo resumen.' });
  }
}

module.exports = handler;
module.exports.config = config;
