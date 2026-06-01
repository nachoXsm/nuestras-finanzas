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

const COLORES = {
  verde:    { bg: 'rgba(30,200,120,.12)', border: 'rgba(30,200,120,.4)', text: '#1ec978', label: 'Amigable' },
  amarillo: { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.4)', text: '#f59e0b', label: 'Recordatorio' },
  rojo:     { bg: 'rgba(220,38,38,.12)',  border: 'rgba(220,38,38,.4)',  text: '#ef4444', label: 'Urgente' },
};

function buildClaimEmail(de, para, monto, tono, mensaje) {
  const c = COLORES[tono] || COLORES.verde;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Recordatorio de deuda - NuestrasFinanzas</title>
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

          <tr>
            <td style="background:#101828;border-radius:22px;border:1px solid rgba(255,255,255,.07)">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:${c.text};height:4px;border-radius:22px 22px 0 0;font-size:0;line-height:0">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:32px 28px 36px">
                    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:16px">
                      <tr>
                        <td style="background:${c.bg};border:1px solid ${c.border};border-radius:20px;padding:4px 12px">
                          <span style="color:${c.text};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px">${c.label}</span>
                        </td>
                      </tr>
                    </table>
                    <h1 style="margin:0 0 20px;color:#ffffff;font-size:24px;font-weight:800;line-height:1.25"><span style="color:#12c7b7">${de}</span> te envió un recordatorio</h1>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px">
                      <tr>
                        <td style="background:${c.bg};border:1.5px solid ${c.border};border-radius:16px;padding:22px 20px;text-align:center">
                          <div style="color:rgba(255,255,255,.45);font-size:10px;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;margin-bottom:10px">Deuda pendiente</div>
                          <div style="color:${c.text};font-size:36px;font-weight:900;letter-spacing:-1px">${monto}</div>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
                      <tr>
                        <td style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:16px 18px">
                          <div style="color:rgba(255,255,255,.4);font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px">Mensaje</div>
                          <div style="color:rgba(255,255,255,.8);font-size:14px;line-height:1.6">${mensaje}</div>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center">
                          <a href="https://nuestras-finanzas-two.vercel.app" style="display:inline-block;background:#12c7b7;color:#0a0f1e;text-decoration:none;font-weight:800;font-size:15px;padding:15px 36px;border-radius:13px">Abrir NuestrasFinanzas &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 0 0">
              <p style="margin:0 0 6px;color:rgba(255,255,255,.2);font-size:11px;line-height:1.5">Este mensaje fue enviado desde NuestrasFinanzas por ${de}.</p>
              <p style="margin:0;color:rgba(255,255,255,.12);font-size:10px">Si no lo esperabas, podés ignorarlo.</p>
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

  const { email, de, para, monto, tono, mensaje } = getBody(req);

  if (!email || !de || !monto) {
    return sendJson(res, 400, { error: 'Faltan datos requeridos' });
  }

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
  if (!GMAIL_USER || !GMAIL_PASS) {
    return sendJson(res, 500, { error: 'Servicio de email no configurado' });
  }

  const c = COLORES[tono] || COLORES.verde;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });

    await transporter.sendMail({
      from: `NuestrasFinanzas <${GMAIL_USER}>`,
      to: email,
      subject: `${de} te recordó una deuda de ${monto} 💰`,
      html: buildClaimEmail(de, para, monto, tono, mensaje),
    });

    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 500, { error: String(e) });
  }
};
