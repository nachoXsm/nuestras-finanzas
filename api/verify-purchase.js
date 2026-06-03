// Verifies a Google Play subscription token and returns the expiry date.
// Requires env vars: GOOGLE_SERVICE_ACCOUNT_JSON (full JSON of service account key)
// and PLAY_PACKAGE_NAME (app.nuestrasfinanzas).

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

// Minimal JWT signer for Google service account (RS256)
async function signJWT(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = enc(header) + '.' + enc(payload);

  // Import PEM key
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const keyData = Buffer.from(pemBody, 'base64');
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    Buffer.from(signingInput)
  );
  return signingInput + '.' + Buffer.from(sig).toString('base64url');
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const jwt = await signJWT(payload, serviceAccount.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Failed to get Google access token');
  return data.access_token;
}

async function verifySubscription(packageName, productId, token, accessToken) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${token}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Play API error: ${res.status} ${text}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { sendJson(res, 200, {}); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }

  const { token, productId } = getBody(req);
  if (!token || !productId) {
    return sendJson(res, 400, { error: 'Missing token or productId' });
  }

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const packageName = process.env.PLAY_PACKAGE_NAME || 'app.nuestrasfinanzas';

  if (!saJson) {
    // Dev mode: no service account configured — grant 30-day trial
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    return sendJson(res, 200, { ok: true, expiresAt, dev: true });
  }

  try {
    const serviceAccount = JSON.parse(saJson);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const purchase = await verifySubscription(packageName, productId, token, accessToken);

    // subscriptionState: SUBSCRIPTION_STATE_ACTIVE, _IN_GRACE_PERIOD, _ON_HOLD, _PAUSED, _CANCELED, _EXPIRED
    const activeStates = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_ON_HOLD'];
    const isActive = activeStates.includes(purchase.subscriptionState);

    if (!isActive) {
      return sendJson(res, 200, { ok: false, error: 'Subscription not active', state: purchase.subscriptionState });
    }

    // Get expiry from lineItems[0]
    const lineItem = purchase.lineItems && purchase.lineItems[0];
    const expiresAt = lineItem && lineItem.expiryTime
      ? lineItem.expiryTime
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return sendJson(res, 200, { ok: true, expiresAt, productId, state: purchase.subscriptionState });
  } catch (e) {
    return sendJson(res, 500, { error: e.message || 'Verification failed' });
  }
};
