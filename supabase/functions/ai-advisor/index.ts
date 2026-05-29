import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { messages, context } = await req.json();
    const GROQ_KEY = Deno.env.get('GROQ_KEY');
    if (!GROQ_KEY) return new Response('Config error', { status: 500, headers: CORS });

    const systemPrompt = buildSystemPrompt(context);

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return new Response(JSON.stringify({ error: err }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content ?? '';
    return new Response(JSON.stringify({ reply }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});

function buildSystemPrompt(ctx: Record<string, unknown>): string {
  const moneda = (ctx.moneda as string) || 'ARS';
  const mes = (ctx.mes as string) || '';
  const ingresos = Number(ctx.ingresos ?? 0);
  const gastos = Number(ctx.gastos ?? 0);
  const saldo = ingresos - gastos;
  const ahorro = ingresos > 0 ? Math.round((saldo / ingresos) * 100) : 0;

  const cats = ctx.categorias as Record<string, number> | undefined;
  const catLines = cats
    ? Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `  - ${k}: ${moneda} ${v.toLocaleString('es-AR')}`)
        .join('\n')
    : '  (sin datos)';

  const grupo = ctx.grupo as Record<string, unknown> | undefined;
  const grupoSection = grupo
    ? `\nModo grupo de gastos:
  - Total del grupo: ${moneda} ${Number(grupo.total ?? 0).toLocaleString('es-AR')}
  - Participantes: ${grupo.participantes}
  - Te deben: ${moneda} ${Number(grupo.leDeben ?? 0).toLocaleString('es-AR')}
  - Debés: ${moneda} ${Number(grupo.debes ?? 0).toLocaleString('es-AR')}`
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
