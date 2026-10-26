/**
 * View rendering.
 *
 * Templates are rendered by calling ejs directly rather than by configuring an
 * Express view engine. A view engine is an application-level setting; a mounted
 * router must not depend on — or change — the host application's choice. This
 * way RR-CMS renders its own pages identically whether it owns the server or is
 * mounted inside CRTMS.
 */
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const day = require('./lib/day');
const help = require('./help/roles');

/* The version stamp for a static asset: its own mtime, memoised briefly so a
   page costs one stat rather than one per link. */
const ASSET_MEMO = new Map();
function assetUrl(p) {
  const rel = p.startsWith('/') ? p : '/' + p;
  const hit = ASSET_MEMO.get(rel);
  if (hit && Date.now() - hit.at < 5000) return hit.href;
  let v = '';
  try { v = String(Math.floor(fs.statSync(path.join(__dirname, 'public',
    rel.replace(/^\/assets/, ''))).mtimeMs)); } catch (e) { /* no file, no stamp */ }
  const href = cfg.basePath + rel + (v ? '?v=' + v : '');
  ASSET_MEMO.set(rel, { href, at: Date.now() });
  return href;
}
const cfg = require('./config');
const charts = require('./lib/charts');

const VIEWS = path.join(__dirname, 'views');

function viewEngine() {
  return (req, res, next) => {
    res.render = async (view, data = {}) => {
      const locals = {
        ...res.locals, ...data,
        cfg,
        url: p => (cfg.basePath + (p.startsWith('/') ? p : '/' + p)) || '/',
        /* A STYLESHEET THE BROWSER WILL NOT FETCH AGAIN IS A DEPLOY THAT DID
           NOT HAPPEN. Assets are served with a seven-day cache in production,
           which is right — they change rarely and every page would otherwise
           re-fetch them over a slow link. But nothing told the browser WHEN
           they changed, so a corrected app.css sat on the server while every
           screen went on using the old one, and a hard refresh does not
           reliably re-fetch a subresource. It cost the officer two rounds of
           "I copied it and nothing changed" in one evening.

           The file's own modification time is the version. It is a stat, not a
           read; it is memoised for a few seconds so a page of assets costs one
           each; and because it is read at REQUEST time rather than at startup,
           copying a stylesheet up without restarting still busts the cache —
           which is exactly how a stylesheet gets deployed. */
        asset: assetUrl,
        // req.path alone is relative to whichever sub-router is handling the
        // request, so inside /certificates it reads '/' and the sidebar would
        // highlight the dashboard. Rebuild the path as the user sees it, then
        // strip the mount prefix so the nav comparisons stay base-path agnostic.
        currentPath: (() => {
          const full = (req.baseUrl || '') + (req.path === '/' ? '' : req.path);
          const rel = cfg.basePath && full.startsWith(cfg.basePath)
            ? full.slice(cfg.basePath.length) : full;
          return rel || '/';
        })(),
        fmtInt: n => Number(n || 0).toLocaleString('en-IN'),
        fmtRs:  n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN'),
        fmtLakh: n => '₹' + (Number(n || 0) / 100000).toFixed(2) + ' L',
        esc: s => String(s ?? ''),
        // Charts are rendered to SVG on the server, so a page prints and works
        // with JavaScript off. See src/lib/charts.js.
        chart: charts,
        /* The running room's clock, so a template never computes a date of its
           own. Eleven of them did, in UTC, which is a different day from the
           one the route was working in for 5½ hours out of every 24. */
        today: day.today,
        thisMonth: day.thisMonth,
      };
      /* WHAT THIS MAN'S DAY SAYS ABOUT THIS SCREEN, worked out once here rather
         than in forty templates. It is an object lookup over the help data --
         no query, no cost -- and the layout draws the side panel from it. A
         screen that is not in his day and not in his index gets nothing, which
         is the honest answer and keeps the panel worth opening. */
      locals.pageHelp = res.locals.user
        ? help.helpFor(res.locals.user.role_code, locals.currentPath) : null;
      try {
        const body = await ejs.renderFile(path.join(VIEWS, view + '.ejs'), locals, { async: true });
        const html = data.bare
          ? body
          : await ejs.renderFile(path.join(VIEWS, 'layout.ejs'), { ...locals, body }, { async: true });
        res.type('html').send(html);
      } catch (e) {
        /* A SCREEN THAT ASKS FOR SOMETHING THE ROUTE NO LONGER SENDS.
           Screen files are read from disk on every request; routes are held in
           memory from the moment node started. So after new files are copied
           in, the screens are already the new ones and the routes are still the
           old ones -- and the first thing that breaks is a screen asking for a
           value its route has not been restarted to pass. The bare EJS message
           says "x is not defined", which reads like a coding error and is not
           one. It costs a diagnosis every time, so the message says it. */
        // EJS rethrows with the offending source lines prepended, so the
        // "x is not defined" sits at the END of a long message, not at the
        // start of a short one. Matching the start found nothing, every time.
        const undef = /(\w+) is not defined\s*$/.exec(e.message || '');
        const hint = undef
          ? '\n\nThe screen is asking for "' + undef[1] + '" and the running server is not\n' +
            'sending it. Almost always this means the server is older than the files:\n' +
            'new screens were copied in, but node is still running the old routes.\n\n' +
            'Stop it and start it again:   npm start\n' +
            'Or run it so it restarts itself on every change:   npm run dev\n'
          : '';
        if (!res.headersSent) res.status(500).type('text/plain').send('Template error: ' + e.message + hint);
        else console.error(e);
      }
    };
    next();
  };
}

module.exports = { viewEngine, VIEWS };
