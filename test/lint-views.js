/**
 * Template lint.
 *
 * EJS has two output tags: <%= %> escapes, <%- %> does not. Putting markup
 * inside the escaping tag renders it as visible text — a bug that route tests
 * never catch, because the response is still 200. It has now happened twice,
 * so it is checked mechanically.
 */
const fs = require('fs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'src', 'views');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ejs')) files.push(p);
  }
})(VIEWS);

const problems = [];
for (const f of files) {
  const rel = path.relative(path.join(__dirname, '..'), f);
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    // markup inside an escaping tag
    for (const m of line.matchAll(/<%=(?!-)([\s\S]*?)%>/g))
      if (/<\/?(span|div|b|i|br|em|strong|td|tr|a)\b/.test(m[1]))
        problems.push(`${rel}:${i + 1}  markup inside <%= %> — use <%- %> or an if-block\n      ${line.trim().slice(0, 110)}`);
    // an include that is not awaited (async rendering returns a Promise)
    if (/<%-\s*include\(/.test(line) && !/await\s+include\(/.test(line))
      problems.push(`${rel}:${i + 1}  include() must be awaited\n      ${line.trim().slice(0, 110)}`);
  });

  /* A FILE BOX IN A FORM THAT DOES NOT SAY multipart/form-data.
   *
   * The browser does not complain. It posts the FILENAME as an ordinary text
   * field and drops the file, so multer sees nothing, the route stores nothing,
   * and the screen says the record was saved. No error appears anywhere. It
   * cost an afternoon on the cleaning register and would have cost another on
   * the deficiency review, so it is checked here rather than remembered. */
  const src = fs.readFileSync(f, 'utf8');
  const forms = src.split(/<form\b/i).slice(1);
  forms.forEach(chunk => {
    const body = chunk.split(/<\/form>/i)[0];
    if (!/type\s*=\s*["']?file/i.test(body)) return;
    /* The end of the opening tag, NOT the first `>` in the chunk: an EJS tag
     * such as `<%= url('/x') %>` sits inside the attribute list and closes with
     * a `>` of its own. Reading up to that one truncated every form on the
     * project and reported all fourteen as faulty. */
    let openTag = chunk, i = 0;
    while (i < chunk.length) {
      if (chunk.startsWith('<%', i)) { const e = chunk.indexOf('%>', i); i = e === -1 ? chunk.length : e + 2; continue; }
      if (chunk[i] === '>') { openTag = chunk.slice(0, i); break; }
      i++;
    }
    if (/enctype\s*=\s*["']multipart\/form-data/i.test(openTag)) return;
    problems.push(`${rel}  a form with a file box has no enctype="multipart/form-data"` +
                  ` — the browser will post the filename and silently drop the file\n` +
                  `      <form ${openTag.trim().slice(0, 100)}>`);
  });
}

/* HIDDEN THAT DOES NOT HIDE.
 *
 * `[hidden]{display:none}` is a user-agent rule, so ANY class rule that sets
 * `display` beats it and the element stays on the screen while the code
 * believes it is gone. It has cost two faults already -- the help panel sitting
 * 3,500px down every page, and the camera buttons showing on a Mac where they
 * do nothing. Both were invisible in testing because the `hidden` property read
 * back true. So the rule is checked, not remembered: a stylesheet that governs
 * anything hidden must say so globally, with !important.
 */
const GLOBAL_HIDDEN = /\[hidden\]\s*{[^}]*display\s*:\s*none\s*!important/;

function needsGuard(css, usesHidden, where) {
  if (!usesHidden) return;
  if (GLOBAL_HIDDEN.test(css)) return;
  problems.push(`${where}  hides elements but has no global ` +
    `[hidden]{display:none !important} — a class that sets display will beat it ` +
    `and the element will stay on the screen`);
}

const appCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.css'), 'utf8');
const appJs  = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
needsGuard(appCss, /\.hidden\s*=|hidden\b/.test(appJs), 'src/public/app.css');

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), f);
  const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  if (!styles.trim()) continue;                 // uses app.css, checked above
  needsGuard(styles, /\bhidden\b/.test(src), rel);
}

if (problems.length) {
  console.log(`\n  ${problems.length} template problem(s):\n`);
  problems.forEach(p => console.log('  ✗ ' + p));
  process.exit(1);
}
console.log(`  ✓ ${files.length} templates clean`);
