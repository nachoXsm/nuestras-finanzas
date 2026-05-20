function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

module.exports = function handler(req, res) {
  const envNames = Object.keys(process.env || {})
    .filter(name => /GEMINI|GOOGLE|VISION/i.test(name))
    .sort();

  return sendJson(res, 200, {
    ok: true,
    runtime: 'vercel-node',
    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    geminiApiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    geminiModel: process.env.GEMINI_MODEL || null,
    visibleRelevantEnvNames: envNames
  });
};
