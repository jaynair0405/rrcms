/**
 * THE PART OF RR-CMS A STRANGER CAN REACH.
 *
 * Two routers are mounted before requireAuth(): the crew feedback form, which
 * has to be public because a driver off a night run will not create an account
 * to say the bathroom tap is broken, and the login page. Everything else is
 * behind a session.
 *
 * That form now takes a photograph. An upload endpoint that needs no login is
 * the one place where the difference between "we accept what is sensible" and
 * "we accept whatever arrives" shows up as somebody else's files on our disk,
 * so the rules are written down here rather than left to a reading of the code.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}

console.log('\n  The public surface\n');

/* ---- which routers are outside authentication at all ------------------- */
const app = read('src/app.js');
const beforeAuth = app.slice(0, app.indexOf('requireAuth()'));
const publicRouters = [...beforeAuth.matchAll(/require\('\.\/routes\/([a-z-]+)'\)/g)].map(m => m[1]);

t('exactly two routers are mounted before authentication', () => {
  assert.deepStrictEqual(publicRouters.sort(), ['auth', 'public-feedback'],
    `outside authentication: ${publicRouters.join(', ')}`);
});

/* ---- what the public form will accept ---------------------------------- */
const pub = read('src/routes/public-feedback.js');

t('the public form does not use the 64-part uploader', () => {
  assert.ok(!/uploads\.upload\b/.test(pub),
    'uploads.upload accepts 64 parts because the daily checklist needs them; this form does not');
  assert.ok(!/\.any\(/.test(pub), '.any() accepts every field on the request');
});

t('it takes ONE file, on ONE named field', () => {
  assert.ok(/\.single\(/.test(pub), 'no .single() — the field is not pinned');
  assert.ok(/files:\s*1\b/.test(pub), 'the part limit is not 1');
});

t('every file it stores is checked against a whitelist', () => {
  const calls = [...pub.matchAll(/uploads\.store\(([\s\S]{0,400}?)\)\s*;/g)].map(m => m[1]);
  assert.ok(calls.length, 'the public form stores no files at all — has the photo box gone?');
  calls.forEach(c => assert.ok(/accept\s*:/.test(c),
    'a store() call on the public route passes no accept: whitelist'));
});

t('the whitelist is photographs, and does not include PDF', () => {
  const uploads = require('../src/services/uploads');
  assert.ok(Array.isArray(uploads.PHOTO_TYPES) && uploads.PHOTO_TYPES.length,
    'PHOTO_TYPES is not a list');
  assert.ok(!uploads.PHOTO_TYPES.includes('pdf'),
    'PDF is accepted on a route that needs no login');
  ['jpg', 'png', 'heic'].forEach(k => assert.ok(uploads.PHOTO_TYPES.includes(k),
    `a phone camera produces ${k} and it is not accepted`));
});

t('a photograph is counted separately from a rating', () => {
  assert.ok(/PHOTOS_PER_HOUR/.test(pub),
    'the photo throttle is gone — a rating and a file share one allowance again');
});

t('the file box is the last thing in the form', () => {
  /* Multer reads the parts in order and aborts on one over the ceiling. With
     the picture last, the ratings are already read by the time that happens. */
  const v = read('src/views/public/feedback.ejs');
  const form = v.slice(v.indexOf('<form'), v.indexOf('</form>'));
  const file = form.indexOf('type="file"');
  assert.ok(file > -1, 'no file box on the public form');
  ['name="channel"', 'name="<%= h[0] %>"', 'name="comments"', 'name="crew_name"'].forEach(f =>
    assert.ok(form.indexOf(f) > -1 && form.indexOf(f) < file,
      `${f} is posted after the photograph and would be lost with it`));
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
