function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.end(JSON.stringify(data));
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function buildInviteEmail(codigo, grupo, de) {
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

          <tr>
            <td align="center" style="padding-bottom:28px">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="background:#12c7b7;border-radius:18px;width:60px;height:60px;text-align:center;vertical-align:middle">
                    <div style="line-height:60px;font-size:30px">💰</div>
                  </td>
                </tr>
              </table>
              <div style="color:#12c7b7;font-size:21px;font-weight:800;margin-top:10px;letter-spacing:-0.5px">NuestrasFinanzas</div>
              <div style="color:rgba(255,255,255,.35);font-size:11px;margin-top:3px;letter-spacing:2px;text-transform:uppercase">Finanzas del hogar</div>
            </td>
          </tr>

          <tr>
            <td style="background:#101828;border-radius:22px;border:1px solid rgba(255,255,255,.07)">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#12c7b7;height:4px;border-radius:22px 22px 0 0;font-size:0;line-height:0">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:32px 28px 36px">
                    <p style="margin:0 0 6px;color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700">Invitación recibida</p>
                    <h1 style="margin:0 0 20px;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25"><span style="color:#12c7b7">${de}</span> te invita a gestionar finanzas juntos</h1>
                    <p style="margin:0 0 28px;color:rgba(255,255,255,.6);font-size:14px;line-height:1.7">Te sumaron al grupo <strong style="color:#fff">"${grupo}"</strong> en NuestrasFinanzas. Usá el código de abajo para unirte en segundos.</p>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
                      <tr>
                        <td style="background:rgba(18,199,183,.08);border:1.5px solid rgba(18,199,183,.25);border-radius:16px;padding:22px 20px;text-align:center">
                          <div style="color:rgba(255,255,255,.45);font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin-bottom:10px">Código de acceso</div>
                          <div style="color:#12c7b7;font-size:36px;font-weight:900;letter-spacing:10px;font-family:'Courier New',Courier,monospace">${codigo}</div>
                          <div style="color:rgba(255,255,255,.35);font-size:11px;margin-top:8px">Ingresá este código en la app para unirte</div>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center">
                          <a href="https://nuestrasfinanzas.app" style="display:inline-block;background:#12c7b7;color:#0a0f1e;text-decoration:none;font-weight:800;font-size:15px;padding:15px 36px;border-radius:13px">Abrir NuestrasFinanzas &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { sendJson(res, 200, {}); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

  const { email, codigo, grupoNombre, remitente } = getBody(req);

  if (!email || !codigo) {
    return sendJson(res, 400, { error: 'Faltan datos requeridos' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    return sendJson(res, 500, { error: 'Servicio de email no configurado' });
  }

  const FROM = process.env.INVITE_FROM_EMAIL || 'NuestrasFinanzas <hola@nuestrasfinanzas.app>';
  const grupo = grupoNombre || 'el grupo';
  const de = remitente || 'Un amigo';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: `${de} te invita a NuestrasFinanzas 💰`,
        html: buildInviteEmail(codigo, grupo, de),
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return sendJson(res, 502, { error: err });
    }

    const data = await r.json();
    return sendJson(res, 200, { ok: true, id: data.id });
  } catch (e) {
    return sendJson(res, 500, { error: String(e) });
  }
};
