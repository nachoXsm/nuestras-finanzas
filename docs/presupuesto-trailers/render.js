const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const src = process.argv[2], out = process.argv[3];
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + src, { waitUntil: 'networkidle' });
  await p.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
