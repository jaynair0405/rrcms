#!/usr/bin/env node
/**
 * Standalone entry point. Deliberately thin — everything of substance is in
 * app.js, which is what gets mounted if RR-CMS ever moves inside CRTMS.
 */
const express = require('express');
const cfg = require('./config');
const createApp = require('./app');
const schema = require('./services/schema-check');

async function main() {
  // Look before serving. A database one migration behind the code produces a
  // raw SQL error on whichever screen happens to touch the new column, in front
  // of a user who can do nothing about it — see src/services/schema-check.js.
  if (!await schema.verify()) process.exit(1);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cfg.basePath || '/', createApp());

  app.listen(cfg.port, () => {
    console.log(`  ${cfg.appName} listening on http://localhost:${cfg.port}${cfg.basePath || ''}`);
    console.log(`  auth mode: ${cfg.authMode}   env: ${cfg.env}`);
    /* SAID OUT LOUD, because the alternative is a server quietly storing 10 MB
     * photographs on a disk with 25 GB left. Resizing is best-effort by design
     * -- an upload is never refused because a library is missing -- and the
     * cost of that is a mode nobody would otherwise notice they were in. */
    const up = require('./services/uploads');
    console.log(up.resizes()
      ? `  photographs: resized to ${up.MAX_EDGE}px on upload, HEIC converted to JPEG`
      : `  photographs: STORED AS SENT — sharp is not installed, so a phone `
        + `photograph keeps its full size and HEIC will not display. Run `
        + `npm install to fix.`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
