/** The same application served from the root path, to prove both configurations work. */
process.env.APP_BASE_PATH = '/';
process.env.SESSION_SECRET = 'test-secret';
/* NODE_ENV, and the reason it is set here rather than left alone.
 *
 * config.js refuses a session secret under 32 characters when NODE_ENV is
 * production -- rightly, because the secret typed in a hurry on deployment day
 * is the one worth refusing. This test hands it an 11-character stub.
 *
 * On a developer's machine NODE_ENV is unset and the guard never fires, so the
 * test passed everywhere it was ever run. On the SERVER, where .env sets
 * production, `npm test` died here -- on the one machine where being able to
 * run the tests matters most, the evening before a contract went live.
 * smoke.js has said 'development' since it was written; this file had not. */
process.env.NODE_ENV = 'development';
const assert = require('assert'), http = require('http'), express = require('express');
const stub = { query: async () => [[], []], execute: async () => [{}, []] };
const host = express(); host.use('/', require('../src/app')({ pool: stub }));
const s = host.listen(0), port = s.address().port;
http.get({ port, path: '/login' }, r => {
  let b = ''; r.on('data', c => b += c);
  r.on('end', () => {
    assert.strictEqual(r.statusCode, 200);
    assert.ok(b.includes('action="/login"'), 'form action at root: ' + /action="[^"]*"/.exec(b));
    assert.ok(b.includes('href="/assets/app.css"'), 'asset URL at root');
    console.log('  ✓ same code serves correctly from the root path');
    s.close(); process.exit(0);
  });
});
