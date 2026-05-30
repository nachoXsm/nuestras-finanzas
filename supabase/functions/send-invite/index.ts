import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { email, codigo, grupoNombre, remitente } = await req.json();

    if (!email || !codigo) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: 'Servicio de email no configurado' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const FROM = Deno.env.get('INVITE_FROM_EMAIL') || 'NuestrasFinanzas <hola@nuestrasfinanzas.app>';
    const grupo = grupoNombre || 'el grupo';
    const de = remitente || 'Un amigo';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: `${de} te invita a NuestrasFinanzas 💰`,
        html: buildInviteEmail(codigo, grupo, de),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

function buildInviteEmail(codigo: string, grupo: string, de: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Invitación a NuestrasFinanzas</title>
</head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0a0f1e">
    <tr>
      <td align="center" style="padding:40px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="background:#12c7b7;border-radius:18px;width:60px;height:60px;font-size:30px;text-align:center;vertical-align:middle">
                    <div style="line-height:60px;font-size:30px">💰</div>
                  </td>
                </tr>
              </table>
              <div style="color:#12c7b7;font-size:21px;font-weight:800;margin-top:10px;letter-spacing:-0.5px">NuestrasFinanzas</div>
              <div style="color:rgba(255,255,255,.35);font-size:11px;margin-top:3px;letter-spacing:2px;text-transform:uppercase">Finanzas del hogar</div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#101828;border-radius:22px;border:1px solid rgba(255,255,255,.07)">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <!-- Top accent bar -->
                <tr>
                  <td style="background:#12c7b7;height:4px;border-radius:22px 22px 0 0;font-size:0;line-height:0">&nbsp;</td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:32px 28px 36px">
                    <p style="margin:0 0 6px;color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700">Invitación recibida</p>
                    <h1 style="margin:0 0 20px;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25"><span style="color:#12c7b7">${de}</span> te invita a gestionar finanzas juntos</h1>
                    <p style="margin:0 0 28px;color:rgba(255,255,255,.6);font-size:14px;line-height:1.7">Te sumaron al grupo <strong style="color:#fff">"${grupo}"</strong> en NuestrasFinanzas. Usá el código de abajo para unirte en segundos.</p>

                    <!-- Code box -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
                      <tr>
                        <td style="background:rgba(18,199,183,.08);border:1.5px solid rgba(18,199,183,.25);border-radius:16px;padding:22px 20px;text-align:center">
                          <div style="color:rgba(255,255,255,.45);font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin-bottom:10px">Código de acceso</div>
                          <div style="color:#12c7b7;font-size:36px;font-weight:900;letter-spacing:10px;font-family:'Courier New',Courier,monospace">${codigo}</div>
                          <div style="color:rgba(255,255,255,.35);font-size:11px;margin-top:8px">Ingresá este código en la app para unirte</div>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center">
                          <a href="https://nuestrasfinanzas.app" style="display:inline-block;background:#12c7b7;color:#0a0f1e;text-decoration:none;font-weight:800;font-size:15px;padding:15px 36px;border-radius:13px;letter-spacing:-0.2px">Abrir NuestrasFinanzas &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Steps -->
          <tr>
            <td style="padding-top:20px">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#101828;border-radius:18px;border:1px solid rgba(255,255,255,.05);padding:22px 24px">
                    <div style="color:rgba(255,255,255,.35);font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:14px">Cómo unirte</div>

                    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:10px">
                      <tr>
                        <td style="width:26px;height:26px;background:rgba(18,199,183,.15);border-radius:50%;text-align:center;vertical-align:middle;color:#12c7b7;font-size:11px;font-weight:800">1</td>
                        <td style="padding-left:10px;color:rgba(255,255,255,.65);font-size:13px">Abrí <strong style="color:#fff">nuestrasfinanzas.app</strong></td>
                      </tr>
                    </table>
                    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:10px">
                      <tr>
                        <td style="width:26px;height:26px;background:rgba(18,199,183,.15);border-radius:50%;text-align:center;vertical-align:middle;color:#12c7b7;font-size:11px;font-weight:800">2</td>
                        <td style="padding-left:10px;color:rgba(255,255,255,.65);font-size:13px">Tocá <strong style="color:#fff">Unirse con código</strong></td>
                      </tr>
                    </table>
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="width:26px;height:26px;background:rgba(18,199,183,.15);border-radius:50%;text-align:center;vertical-align:middle;color:#12c7b7;font-size:11px;font-weight:800">3</td>
                        <td style="padding-left:10px;color:rgba(255,255,255,.65);font-size:13px">Ingresá el código <strong style="color:#12c7b7">${codigo}</strong></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0">
              <p style="margin:0 0 6px;color:rgba(255,255,255,.2);font-size:11px;line-height:1.5">Recibiste este email porque alguien te invitó a NuestrasFinanzas.</p>
              <p style="margin:0;color:rgba(255,255,255,.12);font-size:10px">Si no esperabas esta invitación, simplemente ignorá este email.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
