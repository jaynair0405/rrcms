/**
 * Camera capture for documents and photographs.
 *
 * Everything here is an enhancement. Each file input it attaches to works
 * perfectly well on its own — the officer picks a file, or on a phone the
 * ordinary file picker already offers the camera. This adds a live preview and
 * a shutter for the case that actually arises at a running room: a supervisor
 * at a desktop with a webcam, holding a police verification in his hand and a
 * man standing in front of him, with no scanner in the building.
 *
 * If the browser has no camera, or the page is served over plain HTTP from
 * another machine — browsers only give camera access on HTTPS or localhost —
 * nothing appears and the file input is left exactly as it was. A control that
 * fails silently when clicked would be worse than no control.
 */
(function () {
  'use strict';

  var canCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia
                      && window.HTMLCanvasElement);

  /** Passport photographs are 3:4; a document is whatever the camera gives. */
  var SHAPES = { portrait: 3 / 4, document: null };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k === 'class') n.className = attrs[k];
      else if (k in n) n[k] = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  var txt = function (s) { return document.createTextNode(s); };

  function openCamera(input, opts) {
    var shape = SHAPES[opts.shape] || null;
    var stream = null;

    var video  = el('video', { autoplay: true, playsInline: true, muted: true,
      style: 'width:100%;max-height:52vh;background:#000;border-radius:8px;display:block' });
    var canvas = el('canvas', { style: 'display:none' });
    var status = el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px' },
      [txt('Starting the camera…')]);

    var shoot  = el('button', { type: 'button', class: 'btn', disabled: true }, [txt('Take the picture')]);
    var again  = el('button', { type: 'button', class: 'btn ghost', style: 'display:none' }, [txt('Take it again')]);
    var use    = el('button', { type: 'button', class: 'btn', style: 'display:none' }, [txt('Use this picture')]);
    var close  = el('button', { type: 'button', class: 'btn ghost' }, [txt('Cancel')]);
    var switchCam = el('button', { type: 'button', class: 'btn ghost small', style: 'display:none' },
      [txt('Switch camera')]);

    var panel = el('div', { style:
      'position:fixed;inset:0;background:rgba(10,16,26,.62);z-index:9999;'
      + 'display:flex;align-items:center;justify-content:center;padding:18px' });
    var card = el('div', { class: 'card', style: 'max-width:560px;width:100%;margin:0' });
    var head = el('div', { class: 'card-h' }, [el('h3', {}, [txt(opts.title || 'Take a picture')])]);
    var bodyEl = el('div', { class: 'card-b' }, [video, canvas, status,
      el('div', { class: 'row', style: 'margin-top:12px;gap:8px' },
        [shoot, again, use, switchCam, el('div', { class: 'spacer' }), close])]);
    card.appendChild(head); card.appendChild(bodyEl); panel.appendChild(card);
    document.body.appendChild(panel);

    var facing = 'environment';
    var shot = null;

    function stop() {
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    function dismiss() { stop(); if (panel.parentNode) panel.parentNode.removeChild(panel); }

    function start() {
      stop();
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false
      }).then(function (s) {
        stream = s; video.srcObject = s; shoot.disabled = false;
        status.textContent = opts.hint || 'Hold the camera steady and fill the frame.';
        navigator.mediaDevices.enumerateDevices().then(function (devs) {
          if (devs.filter(function (d) { return d.kind === 'videoinput'; }).length > 1) {
            switchCam.style.display = '';
          }
        }).catch(function () {});
      }).catch(function (e) {
        // Say which of the three usual reasons it was, rather than "failed".
        var why = e && e.name === 'NotAllowedError'
            ? 'The browser refused access to the camera. Allow it for this site and try again.'
          : e && e.name === 'NotFoundError'
            ? 'No camera was found on this machine. Use the file box instead.'
          : window.isSecureContext === false
            ? 'The browser only allows the camera over HTTPS, or on the machine itself. '
              + 'Use the file box instead, or reach this site over HTTPS.'
            : 'The camera could not be started. Use the file box instead.';
        status.textContent = why;
        shoot.style.display = 'none';
      });
    }

    shoot.addEventListener('click', function () {
      var vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      var sx = 0, sy = 0, sw = vw, sh = vh;
      if (shape) {                              // centre-crop to the wanted shape
        if (vw / vh > shape) { sw = Math.round(vh * shape); sx = Math.round((vw - sw) / 2); }
        else { sh = Math.round(vw / shape); sy = Math.round((vh - sh) / 2); }
      }
      canvas.width = sw; canvas.height = sh;
      canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob(function (b) {
        shot = b;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.borderRadius = '8px';
        video.style.display = 'none';
        shoot.style.display = 'none'; switchCam.style.display = 'none';
        again.style.display = ''; use.style.display = '';
        status.textContent = 'Check it reads clearly before using it.';
      }, 'image/jpeg', 0.88);
    });

    again.addEventListener('click', function () {
      shot = null;
      canvas.style.display = 'none'; video.style.display = 'block';
      again.style.display = 'none'; use.style.display = 'none';
      shoot.style.display = '';
      status.textContent = opts.hint || 'Hold the camera steady and fill the frame.';
    });

    switchCam.addEventListener('click', function () {
      facing = facing === 'environment' ? 'user' : 'environment';
      start();
    });

    use.addEventListener('click', function () {
      if (!shot) return;
      // Hand the picture to the ordinary file input, so the form posts exactly
      // as it would have done had somebody chosen a file.
      var name = (opts.filename || 'capture') + '-' +
        new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.jpg';
      var file = new File([shot], name, { type: 'image/jpeg' });
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      guardEmptySubmits();
      dismiss();
      if (opts.submit && input.form) input.form.submit();
    });

    close.addEventListener('click', dismiss);
    panel.addEventListener('click', function (e) { if (e.target === panel) dismiss(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', esc); }
    });

    start();
  }

  /**
   * Keeps a submit button switched off until its file box actually holds a
   * file. The server refuses an empty submission anyway, but being told off
   * after the fact is a poor substitute for a button that cannot be pressed
   * by mistake -- particularly on a page carrying two upload boxes.
   */
  function guardEmptySubmits() {
    var inputs = document.querySelectorAll('input[type=file][data-requires-file]');
    Array.prototype.forEach.call(inputs, function (input) {
      var btn = document.getElementById(input.dataset.requiresFile);
      if (!btn || input.dataset.guardReady) return;
      input.dataset.guardReady = '1';
      var sync = function () {
        var has = input.files && input.files.length > 0;
        btn.disabled = !has;
        btn.style.opacity = has ? '' : '.5';
        btn.style.cursor = has ? '' : 'not-allowed';
        btn.title = has ? '' : 'Choose a picture, or take one with the camera, first';
      };
      input.addEventListener('change', sync);
      sync();
    });
  }

  /**
   * The muster: everyone present in one click, a search for the exceptions,
   * a running count so the supervisor can see he has finished, and a filter
   * for the people who were not present yesterday.
   *
   * All of it is enhancement. With JavaScript off the radio buttons still
   * post the same values they always did; what is lost is the convenience,
   * not the ability to mark a muster.
   */
  function musterHelpers() {
    var form = document.getElementById('musterform');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';

    var rows = [].slice.call(form.querySelectorAll('#mustertable tbody tr'));
    var count = document.getElementById('mustercount');
    var search = document.getElementById('mustersearch');
    var onlyWatch = document.getElementById('onlywatch');
    var allPresent = document.getElementById('allpresent');

    function tally() {
      if (!count) return;
      var n = { present: 0, absent: 0, other: 0, unmarked: 0 };
      rows.forEach(function (tr) {
        var picked = tr.querySelector('input[type=radio]:checked');
        var hidden = tr.querySelector('input[type=hidden][name^="s_"]');
        if (!picked && !hidden) { n.unmarked++; tr.classList.add('unmarked'); return; }
        tr.classList.remove('unmarked');
        var v = picked ? picked.value : hidden.value;
        if (v === 'present' || v === 'reliever') n.present++;
        else if (v === 'absent') n.absent++;
        else n.other++;
      });
      var parts = [n.present + ' present'];
      if (n.absent) parts.push(n.absent + ' absent');
      if (n.other) parts.push(n.other + ' on leave or off');
      parts.push(n.unmarked ? n.unmarked + ' NOT YET MARKED' : 'none left to mark');
      count.textContent = parts.join('  ·  ');
      count.style.color = n.unmarked ? 'var(--critical-ink)' : 'var(--good-ink)';
      count.style.fontWeight = n.unmarked ? '600' : '';
    }

    function filter() {
      var q = (search && search.value || '').trim().toLowerCase();
      var watchOnly = onlyWatch && onlyWatch.checked;
      rows.forEach(function (tr) {
        var hit = !q || (tr.dataset.name || '').indexOf(q) !== -1;
        if (watchOnly && tr.dataset.watch !== '1') hit = false;
        tr.style.display = hit ? '' : 'none';
      });
    }

    /**
     * The reliever box appears only for the man being marked Reliever, and
     * offers only the people actually marked absent or on leave today.
     *
     * Offering the whole roster would let a supervisor record a man as
     * relieving somebody who was standing beside him — which reads as a
     * covered absence in the arithmetic and is not one.
     */
    function relievers() {
      rows.forEach(function (tr) {
        var box = tr.querySelector('.relieverbox');
        if (!box) return;
        var picked = tr.querySelector('input[type=radio]:checked');
        var on = picked && picked.value === 'reliever';
        box.style.display = on ? '' : 'none';
        var sel = box.querySelector('select');
        if (!sel) return;
        if (!on) { sel.value = ''; sel.disabled = true; sel.required = false; return; }
        sel.disabled = false;
        // Required only once the box is actually showing. Marking it required
        // in the HTML would stop every muster being saved with JavaScript off,
        // where the boxes are all visible and most are irrelevant.
        //
        // This is the difference between the browser stopping you on the field
        // with the muster still in front of you, and the server bouncing you to
        // an error page having discarded ninety marks. The server check stays --
        // it is the one that is enforced -- but it should almost never be the
        // thing that catches this.
        sel.required = true;

        // Rebuild the list from who is actually marked away right now.
        //
        // A man the Railway has not screened posts a hidden "absent" and is
        // deliberately left out. His post is not an absence somebody covered --
        // he was never permitted to work it. Offering him here would let a
        // supervisor record a covered post where the truth is a post that
        // should not have been worked at all.
        var away = {};
        rows.forEach(function (other) {
          if (other.querySelector('input[type=hidden][name^="s_"]')) return;
          var p = other.querySelector('input[type=radio]:checked');
          if (!p || (p.value !== 'absent' && p.value !== 'leave')) return;
          away[p.name.slice(2)] = true;
        });
        // An absence already claimed by another reliever is taken off this
        // man's list. One absence can be covered once; two men naming the same
        // absentee would read as two present against one vacant post.
        var taken = {};
        rows.forEach(function (other) {
          if (other === tr) return;
          var r = other.querySelector('input[type=radio][value=reliever]:checked');
          var x = other.querySelector('.relieverbox select');
          if (r && x && x.value) taken[x.value] = true;
        });

        var keep = sel.value;
        Array.prototype.forEach.call(sel.options, function (o) {
          if (!o.value) return;
          var ok = !!away[o.value] && !taken[o.value];
          o.disabled = !ok;
          o.hidden = !ok;
        });
        if (keep && (!away[keep] || taken[keep])) sel.value = '';
        var note = box.querySelector('.muted');
        var n = Object.keys(away).length;
        var free = Object.keys(away).filter(function (k) { return !taken[k]; }).length;
        if (note) {
          note.textContent = !n
            ? 'Nobody is marked absent or on leave yet — mark the absence first, '
              + 'then say who covered it.'
            : !free
              ? 'Every absence today is already shown as covered by somebody else. '
                + 'One absence can only be covered once.'
              : 'Required — choose from the ' + free + ' absence'
                + (free === 1 ? '' : 's') + ' not yet covered.';
          note.style.color = sel.value ? '' : 'var(--critical-ink)';
        }
        // A reliever with nobody chosen is not a saveable muster. Say so on the
        // button rather than at the end of the journey.
        var save = form.querySelector('button[type=submit]');
        if (save) {
          var pending = rows.filter(function (t) {
            var r = t.querySelector('input[type=radio][value=reliever]:checked');
            var x = t.querySelector('.relieverbox select');
            return r && x && !x.value;
          }).length;
          save.title = pending ? 'Say whose post each reliever covered first' : '';
        }
      });
    }

    if (allPresent) allPresent.addEventListener('click', function () {
      rows.forEach(function (tr) {
        var r = tr.querySelector('input[type=radio][value=present]');
        if (r && !r.disabled) r.checked = true;
      });
      tally(); relievers();
    });
    if (search) search.addEventListener('input', filter);
    if (onlyWatch) onlyWatch.addEventListener('change', filter);
    form.addEventListener('change', function (e) {
      if (!e.target) return;
      // A change to one reliever's choice changes what the others may choose,
      // so every box is rebuilt, not just the one that was touched.
      if (e.target.type === 'radio') { tally(); relievers(); }
      else if (e.target.tagName === 'SELECT' && e.target.name.indexOf('r_') === 0) relievers();
    });
    tally(); relievers();
  }

  /**
   * A "Now" button beside a time box. The call book is written while the man
   * is standing at the counter; typing 04:47 into a time control with a
   * keyboard is the slowest part of recording a call, and the time typed a
   * minute later is the wrong one.
   *
   * The button only appears when the form is being filled for today. On a
   * back-dated entry "now" would write today's clock time onto another date,
   * which is worse than typing.
   */
  function nowButtons() {
    var localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    var inputs = document.querySelectorAll('input[type=time][data-now]');
    Array.prototype.forEach.call(inputs, function (input) {
      if (input.dataset.nowReady) return;
      var form = input.form;
      if (form && form.dataset.forDate && form.dataset.forDate !== localToday) return;
      input.dataset.nowReady = '1';

      var btn = el('button', { type: 'button', class: 'btn ghost small',
        style: 'margin-top:6px' }, [txt(input.dataset.now || 'Now')]);
      btn.addEventListener('click', function () {
        var d = new Date();
        input.value = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      input.parentNode.insertBefore(btn, input.nextSibling);
    });
  }

  /**
   * The linen day: a running check, per item, that the shelf adds up.
   *
   * For each item the arithmetic is the same and it is the supervisor's own:
   *
   *   yesterday's shelf + what came back from the wash − what was issued today
   *
   * Anything else needs an explanation. Before stage 24 this ran on a single
   * aggregate stock figure and so could only ever be checked for bedsheets --
   * and not honestly even then, because the "fresh received" it subtracted was
   * every item together.
   *
   * The check is advice, not a bar. Linen goes missing, is condemned, is
   * borrowed by the next room down the line; a supervisor who knows why his
   * count is short must still be able to record what he counted. What it
   * prevents is the commoner case -- a figure carried forward and never
   * corrected, so the stock reads the same for eleven days while sheets go out
   * every morning.
   */
  function linenHelpers() {
    var form = document.getElementById('linenform');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';
    var note = document.getElementById('linencheck');

    function intOf(v) { var n = parseInt(v, 10); return isNaN(n) ? null : n; }

    function check() {
      if (!note) return;
      var lines = [];
      Array.prototype.forEach.call(form.querySelectorAll('tr[data-item]'), function (tr) {
        var opening = intOf(tr.dataset.prevHand);
        var back = intOf(tr.dataset.back) || 0;
        var issuedEl = tr.querySelector('[name^="issued_"]');
        var handEl = tr.querySelector('[name^="hand_"]');
        if (!issuedEl || !handEl) return;
        var issued = intOf(issuedEl.value) || 0;
        var closing = intOf(handEl.value);
        // No yesterday, or nothing counted today: there is nothing to check.
        if (opening === null || closing === null) return;
        var expected = opening + back - issued;
        if (closing === expected) return;
        var diff = closing - expected;
        lines.push(tr.dataset.label + ': ' + opening + ' yesterday '
          + (back ? '+ ' + back + ' back from wash ' : '')
          + '− ' + issued + ' issued = ' + expected + ' expected, '
          + Math.abs(diff) + ' ' + (diff > 0 ? 'more' : 'fewer') + ' than entered.');
      });
      if (!lines.length) { note.textContent = ''; note.removeAttribute('style'); return; }
      note.textContent = lines.join(' ')
        + ' Check the figures, or save what was counted and say why in the remarks.';
      note.style.color = 'var(--warning-ink)';
      note.style.fontSize = '11.5px';
      note.style.marginTop = '10px';
    }

    form.addEventListener('input', function (e) {
      if (e.target && e.target.type === 'number') check();
    });
    check();

    /**
     * The dispatch grid: the whole bundle in one form.
     *
     * NOT checked against the fresh stock on the shelf. What goes to the wash
     * is the soiled pile off the beds, which is a different heap from the
     * washed linen waiting to be issued; questioning a dispatch because it
     * exceeds the fresh stock would question perfectly ordinary days. That
     * comparison was here when the grid was first built and it was wrong.
     *
     * What is checked is the one thing that cannot be true: sending more pieces
     * than the Railway has ever issued to the room. That is arithmetic, not a
     * judgement about how much linen ought to go out, and it catches 400 typed
     * for 40. It is still advice — the stock count it rests on may be old, or
     * may never have been taken.
     */
    var send = document.getElementById('sendform');
    var sendNote = document.getElementById('sendcheck');
    if (send && sendNote) {
      var sendCheck = function () {
        var over = [];
        Array.prototype.forEach.call(send.querySelectorAll('input[data-holding]'), function (i) {
          var held = intOf(i.dataset.holding), qty = intOf(i.value);
          if (held === null || qty === null || qty <= held) return;
          var label = i.closest('tr').querySelector('b').textContent;
          over.push(label.toLowerCase() + ' — ' + qty + ' going, ' + held + ' ever issued to this room');
        });
        if (!over.length) { sendNote.textContent = ''; sendNote.style.color = ''; return; }
        sendNote.textContent = 'More is going than the room was ever given: ' + over.join('; ')
          + '. Check the count, or the stock figure on the linen stock page if it is out of date.';
        sendNote.style.color = 'var(--warning-ink)';
      };
      send.addEventListener('input', function (e) {
        if (e.target && e.target.type === 'number') sendCheck();
      });
    }
  }

  /**
   * The crew name box on the call book, searching the division staff list.
   *
   * What comes back is a name, a CMS number, a designation and a headquarters —
   * enough to tell two men apart and nothing more. The identity numbers the
   * staff master holds are not withheld by this code; RR-CMS is not granted
   * them at all.
   *
   * Picking a man fills the hidden hrms_id, and the entry is then an
   * identification. Typing a name and picking nothing is equally valid — a
   * train manager or a crew from another division will never be on this list —
   * and the register records which of the two it was.
   *
   * With JavaScript off, the box keeps its plain datalist of men called at this
   * room before, and the CMS number can be typed. Nothing is lost but speed.
   */
  function crewLookup() {
    var wrap = document.getElementById('crewpick');
    if (!wrap || wrap.dataset.ready) return;
    var url = wrap.dataset.search;
    if (!url) return;                       // division has no staff master
    wrap.dataset.ready = '1';

    var input = wrap.querySelector('input[name=crew_name]');
    var hidden = wrap.querySelector('input[name=crew_hrms]');
    var note = document.getElementById('crewnote');
    var noBox = document.querySelector('input[name=crew_no]');

    var list = el('div', { style:
      'position:absolute;z-index:40;left:0;right:0;background:var(--card,#fff);'
      + 'border:1px solid rgba(0,0,0,.14);border-radius:8px;margin-top:2px;'
      + 'max-height:240px;overflow:auto;display:none;box-shadow:0 6px 18px rgba(0,0,0,.10)' });
    var holder = el('div', { style: 'position:relative' });
    input.parentNode.insertBefore(holder, input.nextSibling);
    holder.appendChild(list);

    var timer = null, lastQuery = '';
    var idleNote = note ? note.textContent : '';

    function say(text, colour) {
      if (!note) return;
      note.textContent = text;
      note.style.color = colour || '';
    }

    function hide() { list.style.display = 'none'; list.innerHTML = ''; }

    function choose(m) {
      input.value = m.full_name;
      hidden.value = m.hrms_id;
      if (noBox && m.cms_id) noBox.value = m.cms_id;
      say('Identified from the division staff list'
        + (m.designation ? ' — ' + m.designation : '')
        + (m.hq ? ', ' + m.hq : '')
        + (m.contact ? ' · ' + m.contact : '') + '.', 'var(--good-ink)');
      hide();
    }

    function render(found, q) {
      list.innerHTML = '';
      if (!found.length) {
        say('Nobody in the division staff list matches “' + q + '”. That is normal for a train '
          + 'manager or a crew from another division — type the name as it should be recorded, '
          + 'and add the CMS number below if it is known.');
        var none = el('div', { style: 'padding:9px 11px;font-size:12px;color:var(--muted,#667)' },
          [txt('No match in the division staff list. Carry on typing the name — '
             + 'the call is recorded either way.')]);
        list.appendChild(none);
        list.style.display = 'block';
        return;
      }
      say(found.length === 1 ? 'One match — click it to use it.'
                             : found.length + ' matches — click the right man.');
      found.forEach(function (m) {
        var row = el('div', { style:
          'padding:8px 11px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.05);font-size:12.5px' });
        row.appendChild(el('div', { style: 'font-weight:600' }, [txt(m.full_name)]));
        var bits = [m.cms_id, m.designation, m.hq].filter(Boolean).join('  ·  ');
        if (m.contact) bits += (bits ? '  ·  ' : '') + m.contact;
        row.appendChild(el('div', { style: 'color:var(--muted,#667);font-size:11px' }, [txt(bits)]));
        row.addEventListener('mousedown', function (e) { e.preventDefault(); choose(m); });
        list.appendChild(row);
      });
      list.style.display = 'block';
    }

    function look() {
      var q = input.value.trim();
      // The name box is cleared of its identification the moment it is edited:
      // an hrms_id left behind from an earlier pick would attach the call to
      // the wrong man.
      hidden.value = '';
      // Silence is the enemy here. A supervisor who types two letters, sees
      // nothing happen and concludes the thing is broken is not being
      // unreasonable -- he is reading the only evidence the screen gave him.
      if (!q) { say(idleNote); hide(); return; }
      if (q.length < 3) {
        say('Keep typing — the staff list is searched from three letters.');
        hide(); return;
      }
      if (q === lastQuery) return;
      lastQuery = q;
      say('Searching the division staff list…');
      var sep = url.indexOf('?') === -1 ? '?' : '&';
      fetch(url + sep + 'rr=' + encodeURIComponent(wrap.dataset.rr)
            + '&q=' + encodeURIComponent(q), { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (found) {
          if (input.value.trim() !== q) return;
          if (found === null) {
            // Say so rather than looking merely empty: an unreachable list and
            // a list with nobody on it are different things, and only one of
            // them is somebody's to fix.
            say('The division staff list could not be reached just now. '
              + 'Type the name and carry on — the call is still recorded.', 'var(--warning-ink)');
            hide(); return;
          }
          render(found, q);
        })
        .catch(function () {
          say('The division staff list could not be reached just now. '
            + 'Type the name and carry on — the call is still recorded.', 'var(--warning-ink)');
          hide();
        });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(look, 220);
    });
    input.addEventListener('blur', function () { setTimeout(hide, 150); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }

  /** Shows what a chosen complaint category covers, so the right one is picked. */
  function complaintCategoryHint() {
    var sel = document.getElementById('compcat');
    var note = document.getElementById('compcathint');
    if (!sel || !note || sel.dataset.ready) return;
    sel.dataset.ready = '1';
    var original = note.textContent;
    sel.addEventListener('change', function () {
      var opt = sel.options[sel.selectedIndex];
      var hint = opt && opt.dataset.hint;
      if (!hint) { note.textContent = original; note.style.color = ''; return; }
      note.textContent = opt.dataset.contractor === '0'
        ? hint + '. Counted as the Railway\'s own, not against the contractor.'
        : hint + '.';
      note.style.color = opt.dataset.contractor === '0' ? 'var(--warning-ink)' : '';
    });
  }

  /**
   * On the user form, show only the scope box the chosen role actually needs.
   *
   * A divisional officer is scoped by division, an RR In-charge by running
   * room, a contractor's supervisor by contractor — and HQ by none of them.
   * Showing all three at once invites somebody to fill in two, which means one
   * of them is silently ignored and the account's reach is not what whoever
   * created it believed.
   *
   * The server enforces the same rule and refuses a role with no scope, so
   * with JavaScript off nothing dangerous gets through — only the form is
   * uglier.
   */
  // Must match SCOPE_OF in src/routes/account.js and `roles.scope_level`.
  // A contractor supervisor is scoped by the RUNNING ROOM he works at; his firm
  // is derived from whoever holds that room today, and is never asked for.
  var SCOPE_OF = {
    hq: [], div_officer: ['division_id'], rr_incharge: ['running_room_id'],
    contractor_sup: ['running_room_id'], crew: [], sysadmin: [],
  };
  function scopePickers() {
    var rows = document.querySelectorAll('.scoperow');
    Array.prototype.forEach.call(rows, function (row) {
      var pick = row.querySelector('.rolepick');
      if (!pick || row.dataset.ready) return;
      row.dataset.ready = '1';
      var help = document.getElementById('rolehelp');
      var sync = function () {
        var want = SCOPE_OF[pick.value] || [];
        Array.prototype.forEach.call(row.querySelectorAll('[data-scope]'), function (box) {
          var wanted = want.indexOf(box.dataset.scope) !== -1;
          box.style.display = wanted ? '' : 'none';
          var sel = box.querySelector('select');
          if (sel) { sel.disabled = !wanted; if (!wanted) sel.value = ''; }
        });
        if (help) {
          var opt = pick.options[pick.selectedIndex];
          help.textContent = (opt && opt.dataset.help) || '';
          if (!want.length && opt) {
            help.textContent += ' No division, running room or contractor is set for this role.';
          }
        }
      };
      pick.addEventListener('change', sync);
      sync();
    });
  }

  /**
   * The train box on the call book, searching the division's train master.
   *
   * Two characters are enough here, unlike the crew box which wants three: a
   * train number is short, and "123" is a real narrowing where "ab" of a name
   * would return half the division.
   *
   * What goes into the record is the number alone. The name and the stations
   * are shown while choosing so the right one is picked -- a supervisor knows
   * the Mahanagari, not necessarily its number -- but the call book stores what
   * the register has always stored.
   */
  function trainLookup() {
    var wrap = document.getElementById('trainpick');
    if (!wrap || wrap.dataset.ready) return;
    var url = wrap.dataset.search;
    if (!url) return;
    wrap.dataset.ready = '1';

    // The call book now books the train on the call itself (`train_no`); the
    // meals screen still asks for `call_for_train`. One box, either name.
    var input = wrap.querySelector('input[name=train_no], input[name=call_for_train]');
    var nameBox = wrap.querySelector('input[name=train_name]');
    var note = document.getElementById('trainnote');
    var idle = note ? note.textContent : '';

    var list = el('div', { style:
      'position:absolute;z-index:40;left:0;right:0;background:var(--card,#fff);'
      + 'border:1px solid rgba(0,0,0,.14);border-radius:8px;margin-top:2px;'
      + 'max-height:240px;overflow:auto;display:none;box-shadow:0 6px 18px rgba(0,0,0,.10)' });
    var holder = el('div', { style: 'position:relative' });
    input.parentNode.insertBefore(holder, input.nextSibling);
    holder.appendChild(list);

    var timer = null, last = '';
    function hide() { list.style.display = 'none'; list.innerHTML = ''; }
    function say(t, c) { if (note) { note.textContent = t; note.style.color = c || ''; } }

    function look() {
      var q = input.value.trim();
      if (!q) { say(idle); hide(); return; }
      if (q.length < 2) { hide(); return; }
      if (q === last) return;
      last = q;
      var sep = url.indexOf('?') === -1 ? '?' : '&';
      fetch(url + sep + 'rr=' + encodeURIComponent(wrap.dataset.rr)
            + '&q=' + encodeURIComponent(q), { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (found) {
          if (input.value.trim() !== q) return;
          list.innerHTML = '';
          if (!found.length) {
            // Special and one-off trains are not all on the master. Saying so
            // stops a supervisor hunting for a number that is simply correct.
            say('No train on the division list matches “' + q + '”. Specials and one-off '
              + 'workings will not be on it — type the number as it is.');
            hide(); return;
          }
          say(found.length === 1 ? 'One train — click it to use it.'
                                 : found.length + ' trains — click the right one.');
          found.forEach(function (t) {
            var row = el('div', { style:
              'padding:8px 11px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.05);font-size:12.5px' });
            row.appendChild(el('div', { style: 'font-weight:600' },
              [txt(t.train_no + (t.train_name ? '  ' + t.train_name : ''))]));
            var bits = [t.between, t.run_days, t.direction].filter(Boolean).join('  ·  ');
            if (bits) row.appendChild(el('div',
              { style: 'color:var(--muted,#667);font-size:11px' }, [txt(bits)]));
            row.addEventListener('mousedown', function (e) {
              e.preventDefault();
              input.value = t.train_no;
              if (nameBox) nameBox.value = t.train_name || '';
              say(t.train_name ? t.train_name + (t.between ? ', ' + t.between : '')
                               : 'Train ' + t.train_no, 'var(--good-ink)');
              hide();
            });
            list.appendChild(row);
          });
          list.style.display = 'block';
        })
        .catch(hide);
    }

    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(look, 200); });
    input.addEventListener('blur', function () { setTimeout(hide, 150); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }

  /** Meals: a whole service in one press, a search, and a running count. */
  function mealHelpers() {
    var form = document.getElementById('mealsform');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';

    var rows = [].slice.call(form.querySelectorAll('#mealstable tbody tr'));
    var count = document.getElementById('mealcount');
    var search = document.getElementById('mealsearch');

    function tally() {
      if (!count) return;
      var by = {};
      form.querySelectorAll('input[type=checkbox][data-meal]').forEach(function (c) {
        if (c.checked) by[c.dataset.meal] = (by[c.dataset.meal] || 0) + 1;
      });
      var parts = ['breakfast', 'lunch', 'dinner'].map(function (m) {
        return (by[m] || 0) + ' ' + m;
      });
      count.textContent = parts.join('  ·  ');
    }

    form.querySelectorAll('[data-mealall]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = btn.dataset.mealall;
        // Only the rows currently on screen, so a search narrows what the
        // button acts on rather than quietly ticking everybody.
        var visible = rows.filter(function (tr) { return tr.style.display !== 'none'; });
        var boxes = [];
        visible.forEach(function (tr) {
          var b = tr.querySelector('input[data-meal="' + m + '"]');
          if (b) boxes.push(b);
        });
        var allOn = boxes.every(function (b) { return b.checked; });
        boxes.forEach(function (b) { b.checked = !allOn; });
        tally();
      });
    });

    if (search) search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      rows.forEach(function (tr) {
        tr.style.display = !q || (tr.dataset.name || '').indexOf(q) !== -1 ? '' : 'none';
      });
    });
    form.addEventListener('change', function (e) {
      if (e.target && e.target.type === 'checkbox') tally();
    });
    tally();
  }

  /**
   * The CCTV check: two buttons for the ordinary case, and a count.
   *
   * "Looked at" is separate from "working" on purpose. A camera nobody examined
   * must not acquire a state, so the row is only saved when its box is ticked,
   * and the buttons here tick it explicitly rather than as a side effect.
   */
  function cctvHelpers() {
    var form = document.getElementById('cctvcheck');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';

    var count = document.getElementById('cctvcount');
    var seen = function () { return [].slice.call(form.querySelectorAll('input[data-seen]')); };

    function sync() {
      seen().forEach(function (box) {
        var id = box.dataset.seen;
        var w = form.querySelector('[data-work="' + id + '"]');
        var r = form.querySelector('[data-rec="' + id + '"]');
        var d = form.querySelector('[name="d_' + id + '"]');
        [w, r, d].forEach(function (f) { if (f) { f.disabled = !box.checked;
                                                  f.style.opacity = box.checked ? '' : '.45'; } });
        // A camera that is not working cannot be recording. Saying otherwise on
        // screen would be a contradiction the officer has to notice himself.
        if (r && w) { var dead = w.value === '0';
                      if (dead) { r.value = '0'; r.disabled = true; r.style.opacity = '.45'; } }
      });
      if (count) {
        var looked = seen().filter(function (b) { return b.checked; }).length;
        count.textContent = looked + ' of ' + seen().length + ' looked at';
        count.style.color = looked ? '' : 'var(--muted)';
      }
    }

    var all = document.getElementById('cctvallseen');
    if (all) all.addEventListener('click', function () {
      var on = !seen().every(function (b) { return b.checked; });
      seen().forEach(function (b) { b.checked = on; });
      sync();
    });
    var ok = document.getElementById('cctvallwork');
    if (ok) ok.addEventListener('click', function () {
      seen().forEach(function (b) {
        b.checked = true;
        var w = form.querySelector('[data-work="' + b.dataset.seen + '"]');
        var r = form.querySelector('[data-rec="' + b.dataset.seen + '"]');
        if (w) w.value = '1';
        if (r) r.value = '1';
      });
      sync();
    });
    form.addEventListener('change', sync);
    sync();
  }

  /** The periodic review: everything complied in one press, and a count. */
  function reviewHelpers() {
    var form = document.getElementById('reviewform');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';
    var rows = [].slice.call(form.querySelectorAll('#reviewtable tbody tr'));
    var count = document.getElementById('reviewcount');

    function tally() {
      if (!count) return;
      var bad = 0, done = 0;
      rows.forEach(function (tr) {
        var p = tr.querySelector('input[type=radio]:checked');
        if (!p) return;
        done++;
        if (p.value === 'not_complied') bad++;
      });
      count.textContent = done === rows.length
        ? (bad ? bad + ' not complied' : 'all complied')
        : done + ' of ' + rows.length + ' looked at'
          + (bad ? '  ·  ' + bad + ' not complied' : '');
      count.style.color = bad ? 'var(--critical-ink)'
                        : done === rows.length ? 'var(--good-ink)' : '';
    }

    var all = document.getElementById('allcomplied');
    if (all) all.addEventListener('click', function () {
      rows.forEach(function (tr) {
        var r = tr.querySelector('input[type=radio][value=complied]');
        if (r) r.checked = true;
      });
      tally();
    });
    form.addEventListener('change', function (e) {
      if (e.target && e.target.type === 'radio') tally();
    });
    tally();
  }

  /** The three-monthly asset check: "all present and in order" in one press. */
  function assetCheckHelpers() {
    var form = document.getElementById('assetcheck');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';
    var boxes = function () { return [].slice.call(form.querySelectorAll('input[data-aseen]')); };

    function sync() {
      boxes().forEach(function (b) {
        var id = b.dataset.aseen;
        [form.querySelector('[data-afound="' + id + '"]'),
         form.querySelector('[data-acond="' + id + '"]'),
         form.querySelector('[name="r_' + id + '"]')].forEach(function (f) {
          if (!f) return;
          f.disabled = !b.checked;
          f.style.opacity = b.checked ? '' : '.45';
        });
      });
    }
    var all = document.getElementById('assetallseen');
    if (all) all.addEventListener('click', function () {
      var on = !boxes().every(function (b) { return b.checked; });
      boxes().forEach(function (b) { b.checked = on; });
      sync();
    });
    form.addEventListener('change', sync);
    sync();
  }

  /** The signed register: a live count of the lines actually filled in. */
  function registerHelpers() {
    var form = document.getElementById('regform');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';
    var count = document.getElementById('regcount');
    var rows = [].slice.call(form.querySelectorAll('#regtable tbody tr'));

    function tally() {
      if (!count) return;
      var filled = 0, named = 0;
      rows.forEach(function (tr) {
        var name = tr.querySelector('input[name^="n_"]');
        var rated = [].slice.call(tr.querySelectorAll('input[data-rating]'))
          .some(function (i) { return i.value !== ''; });
        if (rated) filled++;
        if (name && name.value.trim() && !rated) named++;
      });
      count.textContent = filled + ' line' + (filled === 1 ? '' : 's') + ' to save'
        + (named ? '  ·  ' + named + ' named but not rated' : '');
      count.style.color = named ? 'var(--warning-ink)' : '';
    }
    form.addEventListener('input', tally);
    tally();
  }

  /**
   * The call book books a whole call: one train, and the men the lobby named
   * under it. Each line gets its own lookup against the division staff list,
   * and each keeps its own hidden hrms_id, so an LP identified from the master
   * and an ALP typed by hand can sit on the same call — which is the ordinary
   * case, not the exception.
   *
   * With JavaScript off the lines are plain text boxes with the datalist of
   * men called here before, and every one of them still saves.
   */
  /**
   * The call sheet books a whole day: one row per train, and the men keyed into
   * the row. Every name box gets its own lookup against the division staff
   * list and keeps its own hidden hrms_id, so an LP identified from the master
   * and an ALP typed by hand can sit on the same row — which is the ordinary
   * case, not the exception.
   *
   * With JavaScript off every box is a plain text input with the datalist of
   * men called here before, and every row still saves.
   */
  function callCrewLines() {
    var wrap = document.getElementById('crewlines');
    if (!wrap) return;
    var url = wrap.dataset.search;
    var boxes = document.querySelectorAll('input.crewname');
    if (!boxes.length) return;

    Array.prototype.forEach.call(boxes, function (input) {
      if (input.dataset.ready) return;
      input.dataset.ready = '1';

      // The hidden identification and the note belong to this box alone. On the
      // sheet they sit in the same cell; on the changes tab, the same form.
      var cell = input.closest('.crewcell') || input.parentNode;
      var hidden = cell.querySelector('input[name^=h_]')
                || (input.form && input.form.querySelector('input[name=crew_hrms]'));
      var note = el('div', { class: 'muted', style: 'font-size:10px;margin-top:2px' });
      cell.appendChild(note);
      if (!url) return;                    // division has no staff master

      var list = el('div', { style:
        'position:absolute;z-index:40;left:0;min-width:230px;background:var(--card,#fff);'
        + 'border:1px solid rgba(0,0,0,.14);border-radius:8px;margin-top:2px;'
        + 'max-height:220px;overflow:auto;display:none;box-shadow:0 6px 18px rgba(0,0,0,.10)' });
      var holder = el('div', { style: 'position:relative' });
      input.parentNode.insertBefore(holder, input.nextSibling);
      holder.appendChild(list);

      var timer = null, last = '';
      function hide() { list.style.display = 'none'; list.innerHTML = ''; }
      function say(t, c) { note.textContent = t || ''; note.style.color = c || ''; }

      function look() {
        var q = input.value.trim();
        // An hrms_id left behind from an earlier pick would attach the call to
        // the wrong man, so editing the name clears the identification.
        if (hidden) hidden.value = '';
        if (!q) { say(''); hide(); return; }
        if (q.length < 3) { say('Searched from three letters.'); hide(); return; }
        if (q === last) return;
        last = q;
        say('Searching the division staff list…');
        var sep = url.indexOf('?') === -1 ? '?' : '&';
        // Which box this is decides who may be offered into it: drivers in the
        // Loco Pilot box, assistants in the Assistant box. Booking a cook as a
        // driver was never possible; booking the ALP as the LP was.
        var role = input.dataset.role ? '&role=' + encodeURIComponent(input.dataset.role) : '';
        fetch(url + sep + 'rr=' + encodeURIComponent(wrap.dataset.rr)
              + '&q=' + encodeURIComponent(q) + role, { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (found) {
            if (input.value.trim() !== q) return;
            if (found === null) {
              say('The staff list could not be reached. Type the name — the call still records.',
                  'var(--warning-ink)');
              hide(); return;
            }
            list.innerHTML = '';
            if (!found.length) {
              say('No ' + (input.dataset.role || 'crew') + ' on the division list matches that. '
                + 'Normal for a train manager or a crew from another division — type the name '
                + 'as it should be recorded.');
              hide(); return;
            }
            say(found.length === 1 ? 'One match — click it.' : found.length + ' matches — click the right man.');
            found.forEach(function (m) {
              var row = el('div', { style:
                'padding:7px 10px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.05);font-size:12.5px' });
              row.appendChild(el('div', { style: 'font-weight:600' }, [txt(m.full_name)]));
              var bits = [m.cms_id, m.designation, m.hq].filter(Boolean).join('  ·  ');
              if (m.contact) bits += (bits ? '  ·  ' : '') + m.contact;
              row.appendChild(el('div', { style: 'color:var(--muted,#667);font-size:11px' }, [txt(bits)]));
              row.addEventListener('mousedown', function (e) {
                e.preventDefault();
                input.value = m.full_name;
                if (hidden) hidden.value = m.hrms_id;
                say('Identified from the division staff list'
                  + (m.designation ? ' — ' + m.designation : '') + '.', 'var(--good-ink)');
                hide();
              });
              list.appendChild(row);
            });
            list.style.display = 'block';
          })
          .catch(function () {
            say('The staff list could not be reached. Type the name — the call still records.',
                'var(--warning-ink)');
            hide();
          });
      }

      input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(look, 220); });
      input.addEventListener('blur', function () { setTimeout(hide, 150); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    });
  }

  /**
   * One blank row, slotted where it belongs.
   *
   * A special that turns up between two booked trains can always be added on
   * the row below the table with its time, and it sorts into place. But a
   * bearer reading the sheet wants to put it WHERE he is looking, so every row
   * can open one blank beneath it.
   *
   * Exactly one at a time, on purpose. A sheet that can sprout a blank under
   * every row becomes a field of half-filled boxes, and then nobody can tell
   * what was actually called from what somebody started typing and left.
   */
  function insertRows() {
    var opens = document.querySelectorAll('.cbinsert-open');
    if (!opens.length || document.body.dataset.cbinsertReady) return;
    document.body.dataset.cbinsertReady = '1';

    function closeAll() {
      var rows = document.querySelectorAll('tr.cbinsert');
      Array.prototype.forEach.call(rows, function (r) { r.hidden = true; });
    }

    Array.prototype.forEach.call(opens, function (btn) {
      btn.addEventListener('click', function () {
        var row = document.querySelector('tr.cbinsert[data-for="' + btn.dataset.for + '"]');
        if (!row) return;
        var wasOpen = !row.hidden;
        closeAll();
        if (wasOpen) return;                 // pressing + again closes it
        row.hidden = false;
        var first = row.querySelector('input[type=time]');
        if (first) first.focus();
        // The lookups are attached per box; a row that was hidden at load time
        // still has its boxes, so nothing needs re-wiring here.
      });
    });

    var cancels = document.querySelectorAll('.cbinsert-cancel');
    Array.prototype.forEach.call(cancels, function (b) {
      b.addEventListener('click', closeAll);
    });
  }

  function attach() {
    registerHelpers();
    assetCheckHelpers();
    reviewHelpers();
    cctvHelpers();
    trainLookup();
    mealHelpers();
    scopePickers();
    complaintCategoryHint();
    guardEmptySubmits();
    musterHelpers();
    nowButtons();
    linenHelpers();
    crewLookup();
    callCrewLines();
    insertRows();
    if (!canCapture) return;
    var inputs = document.querySelectorAll('input[type=file][data-camera]');
    Array.prototype.forEach.call(inputs, function (input) {
      if (input.dataset.cameraReady) return;
      input.dataset.cameraReady = '1';

      var btn = el('button', { type: 'button', class: 'btn ghost small',
        style: 'margin-top:6px' }, [txt(input.dataset.cameraLabel || 'Use the camera')]);
      btn.addEventListener('click', function () {
        openCamera(input, {
          shape: input.dataset.camera,
          title: input.dataset.cameraTitle || 'Take a picture',
          hint: input.dataset.cameraHint,
          filename: input.dataset.cameraFile,
          submit: input.dataset.cameraSubmit === '1',
        });
      });
      input.parentNode.insertBefore(btn, input.nextSibling);

      // Show the chosen file's name, since a captured picture never passes
      // through the browser's own "no file chosen" label.
      var note = el('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' });
      input.parentNode.insertBefore(note, btn.nextSibling);
      input.addEventListener('change', function () {
        note.textContent = input.files && input.files.length
          ? 'Ready to upload: ' + input.files[0].name : '';
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

/* The garden form shows the fields that belong to what is being recorded: a
   supply of plants needs a count and a pot, an application of fertiliser needs
   to say whether it was organic, and nothing else needs either. Progressive
   enhancement as everywhere else — with JavaScript off, every field is visible
   and the form still saves. */
(function () {
  function gardenForm() {
    var f = document.getElementById('gardenform');
    var sel = document.getElementById('gtype');
    if (!f || !sel || f.dataset.ready) return;
    f.dataset.ready = '1';
    var gamla = document.getElementById('gamlafields');
    var fert = document.getElementById('fertfields');
    function sync() {
      if (gamla) gamla.hidden = sel.value !== 'gamla_supply';
      if (fert) fert.hidden = sel.value !== 'fertiliser';
    }
    sel.addEventListener('change', sync);
    sync();
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', gardenForm);
  else gardenForm();
})();

/* ---------------------------------------------------------------------------
 * WHAT DID I JUST ATTACH?
 *
 * Found on 10.09.2026 by the officer picking a photograph on the daily joint
 * checklist and seeing nothing happen. Nothing was broken -- the photograph
 * stored and displayed correctly. The SCREEN never said so.
 *
 * The file cell on that checklist is 117 pixels wide. A browser puts the
 * filename beside its own button and truncates it to fit, so after choosing
 * evidence.png the whole confirmation a supervisor gets is:
 *
 *     [ Choose File ]  e...g
 *
 * Five characters, in 11px type, on a form with twenty-five of these. On a
 * phone it is worse. A man who cannot tell whether the photograph attached will
 * pick it again, or decide the screen is broken and stop attaching photographs
 * at all -- and a register kept without evidence is the thing this whole stage
 * exists to prevent.
 *
 * ONE HANDLER FOR EVERY FILE INPUT, and that is the point of doing it here
 * rather than on the screen where it was noticed. There are thirteen file boxes
 * across the application today and four more coming with the photograph stages.
 * Thirteen separate confirmations would drift; one cannot.
 *
 * The size is checked here as well. The server accepts 20 MB and refuses more,
 * but by then the man has filled a twenty-five row form and lost it. Better to
 * say so beside the box, while the form is still on the screen.
 */
(function () {
  var MAX_MB = 20;

  function label(input) {
    var id = input.getAttribute('data-mark');
    if (id) return document.getElementById(id);
    id = 'fm' + Math.random().toString(36).slice(2, 9);
    input.setAttribute('data-mark', id);
    var el = document.createElement('div');
    el.className = 'filemark';
    el.id = id;
    input.insertAdjacentElement('afterend', el);
    return el;
  }

  function clear(input) {
    /* Setting value to '' is the only way to unset a file input that works
     * everywhere; assigning null throws in older Safari. */
    try { input.value = ''; } catch (e) { input.value = ''; }
    var el = label(input);
    el.textContent = '';
    el.className = 'filemark';
  }

  function show(input) {
    var el = label(input);
    var f = input.files && input.files[0];
    if (!f) { el.textContent = ''; el.className = 'filemark'; return; }

    var mb = f.size / 1024 / 1024;
    if (mb > MAX_MB) {
      el.className = 'filemark bad';
      el.textContent = 'Too large — ' + mb.toFixed(1) + ' MB, the limit is ' + MAX_MB + ' MB';
      clearTimeout(el._t);
      /* The file is left ON the input deliberately. Clearing it silently would
       * look like the click did nothing, which is the fault being fixed. */
      return;
    }

    el.className = 'filemark ok';
    var tick = document.createElement('span');
    tick.textContent = '✓ ';
    var name = document.createElement('span');
    name.className = 'fmname';
    name.textContent = input.files.length > 1 ? input.files.length + ' files' : f.name;
    name.title = f.name;
    var rm = document.createElement('button');
    rm.type = 'button';              // never submit the form it sits in
    rm.className = 'fmrm';
    rm.textContent = 'remove';
    rm.addEventListener('click', function () { clear(input); });

    el.textContent = '';
    el.appendChild(tick); el.appendChild(name); el.appendChild(rm);
  }

  /* Delegated, so inputs that arrive later -- a row added to a form, a panel
   * opened -- behave the same without anybody remembering to wire them. */
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'INPUT' && t.type === 'file') show(t);
  });
})();

/* ---------------------------------------------------------------------------
 * THE PHOTOGRAPH BOX THAT APPEARS WHEN THE ANSWER IS A FAILURE.
 *
 * Shown only when Not done is chosen, hidden again when the answer changes to
 * Done. IGP runs a hundred rounds a day across its four buildings, and a file
 * box on every one of them would turn a register a supervisor has to fill each
 * evening into a wall -- so a day of clean rounds looks exactly as it did
 * before, and the box appears where there is something to photograph.
 *
 * Delegated on the table, so the rows the register redraws when the building or
 * the round filter changes behave the same without being wired again.
 *
 * Choosing Done does NOT clear a file already picked. The supervisor may be
 * correcting a mis-click, and silently discarding what he attached would be the
 * same class of fault as the truncated filename: the screen deciding something
 * and not saying so. The route is where that is settled -- it discards a
 * photograph sent against a round marked done, because a picture of a mess
 * against a round the register calls fine is a contradiction, not evidence.
 */
(function () {
  /* The registers disagree about what a failure is called -- the cleaning round
   * is `not_done`, the deficiency review is `not_complied` -- and they should,
   * because those are the words the tender uses. The behaviour is the same, so
   * it is written once and keyed on the box, not on the screen. */
  var FAILED = { not_done: 1, not_complied: 1 };
  function sync(radio) {
    var name = radio && radio.name;
    if (!name) return;
    var box = document.querySelector('.failphoto[data-for="' + name + '"]');
    if (!box) return;
    var chosen = document.querySelector('input[name="' + name + '"]:checked');
    box.hidden = !(chosen && FAILED[chosen.value]);
  }
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t && t.tagName === 'INPUT' && t.type === 'radio') sync(t);
  });
  /* On load the server has already decided which boxes are open, from what is
     on record. This only catches rows the browser restored from a back button,
     where the radio is checked but the markup came from the earlier render. */
  function initial() {
    Array.prototype.forEach.call(document.querySelectorAll('.failphoto[data-for]'),
      function (box) {
        var r = document.querySelector('input[name="' + box.getAttribute('data-for') + '"]');
        if (r) sync(r);
      });
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initial);
  else initial();
})();

/* ---------------------------------------------------------------------------
 * TAKE A PHOTO, OR CHOOSE ONE. BOTH, ON EVERY PHONE.
 *
 * The officer's ruling on 10.09.2026: the supervisor and the RR in-charge must
 * have both the camera and the gallery. He works the day shift and fills the
 * register for rounds he walked hours earlier, so the picture is often already
 * on the phone — but he also needs to photograph what is in front of him.
 *
 * `capture="environment"` was removed for that reason: it opens the camera and
 * HIDES the gallery. `accept="image/*"` alone was supposed to let the phone
 * offer both. Tested on Android the same day: it went straight to the gallery
 * and never offered the camera. Which chooser appears is up to the phone, and
 * the phone is not reliable.
 *
 * So the choice is made here instead of asked for. Two buttons in front of one
 * file input; each sets or clears `capture` a moment before opening it. Same
 * input, same field name, no extra form parts — which matters, because multer
 * counts an empty part for every file box on the page and the joint checklist
 * already carries twenty-five.
 *
 * ONLY WHERE A CAMERA IS PLAUSIBLE. On a desktop `capture` is ignored, so a
 * "Take a photo" button would open a file dialog and be a lie. `pointer: coarse`
 * is the ordinary test for a touch device; on anything else the native control
 * is left exactly as it was.
 */
(function () {
  var touch = false;
  try { touch = window.matchMedia('(pointer: coarse)').matches; } catch (e) { touch = false; }
  if (!touch) return;

  function dress(input) {
    if (input.dataset.dressed) return;
    var accept = input.getAttribute('accept') || '';
    if (accept.indexOf('image') === -1) return;      // a PDF-only box needs no camera
    input.dataset.dressed = '1';

    var wrap = document.createElement('div');
    wrap.className = 'pickrow';

    function btn(text, useCamera) {
      var b = document.createElement('button');
      b.type = 'button';                 // never submit the form it sits in
      b.className = 'btn ghost small';
      b.textContent = text;
      b.addEventListener('click', function () {
        if (useCamera) input.setAttribute('capture', 'environment');
        else input.removeAttribute('capture');
        input.click();
      });
      return b;
    }
    wrap.appendChild(btn('Take a photo', true));
    /* "file" rather than "photo" where the box also takes a scanned document,
       because that is what the man will be looking for. */
    wrap.appendChild(btn(accept.indexOf('pdf') > -1 ? 'Choose a file' : 'Choose a photo', false));

    input.insertAdjacentElement('beforebegin', wrap);
    input.classList.add('picked-by-buttons');
  }

  function dressAll() {
    Array.prototype.forEach.call(document.querySelectorAll('input[type=file]'), dress);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', dressAll);
  else dressAll();
})();
