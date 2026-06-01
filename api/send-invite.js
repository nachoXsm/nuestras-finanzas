const nodemailer = require('nodemailer');

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

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding-bottom:28px">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" valign="middle" style="padding-right:12px">
                    <img src="https://nuestras-finanzas-two.vercel.app/icon-192.png" width="56" height="56" alt="N" style="border-radius:14px;display:block">
                  </td>
                  <td valign="middle">
                    <div style="font-size:26px;font-weight:900;line-height:1;letter-spacing:-0.5px">
                      <span style="color:#ffffff">nuestras</span><br>
                      <span style="color:#12c7b7">finanzas</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
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
                    <p style="margin:0 0 28px;color:rgba(255,255,255,.6);font-size:14px;line-height:1.7">Te sumaron al grupo <strong style="color:#fff">"${grupo}"</strong>. Descargá la app e ingresá el código para unirte en segundos.</p>

                    <!-- Code box -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px">
                      <tr>
                        <td style="background:rgba(18,199,183,.08);border:1.5px solid rgba(18,199,183,.25);border-radius:16px;padding:22px 20px;text-align:center">
                          <div style="color:rgba(255,255,255,.45);font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin-bottom:10px">Código de acceso</div>
                          <div style="color:#12c7b7;font-size:36px;font-weight:900;letter-spacing:10px;font-family:'Courier New',Courier,monospace">${codigo}</div>
                          <div style="color:rgba(255,255,255,.35);font-size:11px;margin-top:8px">Ingresá este código en la app para unirte</div>
                        </td>
                      </tr>
                    </table>

                    <!-- Store buttons -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center" style="padding-bottom:10px">
                          <div style="color:rgba(255,255,255,.4);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">Descargá la app</div>
                        </td>
                      </tr>
                      <tr>
                        <td align="center">
                          <table cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                              <td style="padding-right:8px">
                                <a href="https://play.google.com/store/apps/details?id=app.nuestrasfinanzas" style="display:inline-block;background:#fff;color:#000;text-decoration:none;font-weight:800;font-size:13px;padding:12px 20px;border-radius:12px;white-space:nowrap">▶ Play Store</a>
                              </td>
                              <td>
                                <a href="https://apps.apple.com/app/nuestrasfinanzas" style="display:inline-block;background:#fff;color:#000;text-decoration:none;font-weight:800;font-size:13px;padding:12px 20px;border-radius:12px;white-space:nowrap"> App Store</a>
                              </td>
                            </tr>
                          </table>
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
                        <td style="padding-left:10px;color:rgba(255,255,255,.65);font-size:13px">Descargá la app de <strong style="color:#fff">Play Store</strong> o <strong style="color:#fff">App Store</strong></td>
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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { sendJson(res, 200, {}); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

  const { email, codigo, grupoNombre, remitente } = getBody(req);

  if (!email || !codigo) {
    return sendJson(res, 400, { error: 'Faltan datos requeridos' });
  }

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
  if (!GMAIL_USER || !GMAIL_PASS) {
    return sendJson(res, 500, { error: 'Servicio de email no configurado' });
  }

  const grupo = grupoNombre || 'el grupo';
  const de = remitente || 'Un amigo';

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });

    await transporter.sendMail({
      from: `NuestrasFinanzas <${GMAIL_USER}>`,
      to: email,
      subject: `${de} te invita a NuestrasFinanzas 💰`,
      html: buildInviteEmail(codigo, grupo, de),
    });

    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 500, { error: String(e) });
  }
};
