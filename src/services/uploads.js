/**
 * Photo and document evidence.
 *
 * Files go to disk under UPLOAD_DIR; only metadata goes in the database. Names
 * are generated, never taken from the client, and the type is checked against
 * the actual bytes rather than the declared MIME — a filename can claim anything.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const cfg = require('../config');
const { today } = require('../lib/day');

const UPLOAD_DIR = path.resolve(cfg.uploadDir);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------------------------------------------------------- resizing
 *
 * WHY A PHOTOGRAPH IS NOT STORED AS THE PHONE TOOK IT.
 *
 * Two reasons, and the second is the one that actually bites.
 *
 * SIZE. A modern phone photograph is 4 MB. At five a day -- rounds not done,
 * defects reported, inspection findings -- one running room fills 14 GB over
 * the two years of this contract, and crtms.in has 25 GB free on a 48 GB disk
 * with the nightly dumps already in it. The same photograph at 1600 pixels is
 * about 300 KB: thirteen times smaller, and every bit as good at answering "was
 * this room untidy". Deleting evidence to save space is a decision nobody should
 * have to make, and resizing means nobody has to.
 *
 * HEIC. An iPhone produces HEIC, this uploader has always accepted it, and no
 * browser displays it. So an iPhone photograph was being stored perfectly and
 * then shown as a broken image for ever. Converting to JPEG fixes that, and it
 * was the more urgent of the two.
 *
 * IT MUST NEVER LOSE THE PHOTOGRAPH. Resizing is best-effort: if sharp is not
 * installed, or cannot read what arrived, or somehow produces something larger
 * than it was given, the original bytes are stored unchanged. A supervisor who
 * photographs a defect must never be told his evidence failed to save because a
 * library was missing.
 */
const MAX_EDGE = 1600;
let sharp = null;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

async function shrink(buffer, kind) {
  // A PDF is a document, not a photograph. Left exactly as it arrived.
  if (!sharp || kind.ext === 'pdf') return null;
  try {
    const img = sharp(buffer, { failOn: 'none' });
    const meta = await img.metadata();
    if (!meta || !meta.width || !meta.height) return null;

    const out = await img
      // Applies the phone's own orientation tag, so a picture taken sideways is
      // stored the way it was seen rather than the way the sensor read it.
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    // A small PNG can come out of this bigger than it went in. Keep whichever
    // is smaller -- the point was to save space, not to convert for its own sake.
    // HEIC is the exception: it converts even when that costs bytes, because the
    // alternative is a photograph no browser will draw.
    if (kind.ext !== 'heic' && out.length >= buffer.length) return null;
    return { buffer: out, mime: 'image/jpeg', ext: 'jpg' };
  } catch (e) {
    return null;   // unreadable, or a format this build cannot decode
  }
}

// Magic bytes for the formats a phone camera produces, plus PDF — a police
// verification or a medical certificate usually arrives as a scanned PDF.
const SIGNATURES = [
  { ext: 'jpg',  mime: 'image/jpeg', test: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'png',  mime: 'image/png',  test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', test: b => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'heic', mime: 'image/heic', test: b => b.slice(4, 8).toString('latin1') === 'ftyp' },
  { ext: 'pdf',  mime: 'application/pdf', test: b => b.slice(0, 4).toString('latin1') === '%PDF' },
];

/**
 * A photograph straight off a phone is routinely 4 to 10 MB, and a scan of a
 * six-page police verification larger still. The old 8 MB ceiling rejected
 * ordinary phone photographs, so the limit is set where real documents sit
 * rather than where they ought to sit. Disk is cheaper than a supervisor
 * giving up on the screen.
 */
const MAX_MB = 20;

/** What the forms tell the user, kept next to the list it describes. */
const ACCEPTED = `JPEG, PNG, WebP, HEIC or PDF, up to ${MAX_MB} MB`;

const upload = multer({
  storage: multer.memoryStorage(),
  // A browser sends an EMPTY part for every file input on the form, whether or
  // not anything was chosen, and multer counts each of those against this
  // limit. The daily joint checklist carries one photograph box per clause and
  // the tender has 30 daily clauses, so a limit of 12 refused the report with
  // "too many files" before a single photograph had been attached.
  //
  // This did not show up for a long time because the demo carried an abridged
  // clause list. It would have failed on the first joint report filed at a real
  // running room. 64 leaves room for the checklist to grow without leaving the
  // limit meaningless.
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 64 },
});

function identify(buffer) {
  return SIGNATURES.find(s => { try { return s.test(buffer); } catch { return false; } }) || null;
}

/**
 * Persists one uploaded file. Returns the files.id, or null if it is not an
 * image we accept — a rejected upload must not break the surrounding action.
 */
async function store(file, { entityTable = null, entityId = null, userId = null,
                              accept = null } = {}) {
  if (!file || !file.buffer || !file.buffer.length) return null;
  const kind = identify(file.buffer);
  if (!kind) return null;
  /* A CALLER MAY NARROW WHAT IT WILL TAKE.
   * The general list includes PDF, because a police verification arrives as a
   * scan. The public crew form must not: a man photographing an untidy room
   * sends a photograph, and an endpoint that needs no login should accept the
   * narrowest thing that does the job. */
  if (accept && !accept.includes(kind.ext)) return null;

  /* Resized where it can be, stored as it came where it cannot. `original_name`
   * keeps what the man's phone called it either way -- the name is his, and it
   * is often the only thing that tells one photograph from another. */
  const small = await shrink(file.buffer, kind);
  const bytes = small ? small.buffer : file.buffer;
  const mime  = small ? small.mime   : kind.mime;
  const ext   = small ? small.ext    : kind.ext;

  const uuid = crypto.randomUUID();
  const day = today();
  const dir = path.join(UPLOAD_DIR, day);
  fs.mkdirSync(dir, { recursive: true });

  const stored = path.join(day, `${uuid}.${ext}`);
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), bytes);

  const res = await db.execute(`
    INSERT INTO files (uuid, original_name, stored_path, mime_type, size_bytes, sha256,
                       entity_table, entity_id, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    /* The hash and the size are of what is ON DISK, not of what arrived. A
     * checksum that does not match the stored file is worse than none: it would
     * be produced in a dispute to prove the file was untampered with, and it
     * would fail. */
    [uuid, String(file.originalname || 'photo').slice(0, 255), stored, mime, bytes.length,
     crypto.createHash('sha256').update(bytes).digest('hex'), entityTable, entityId, userId]);
  return res.insertId;
}

/** Streams a stored file back, after the caller has checked access. */
function sendFile(res, row) {
  const abs = path.join(UPLOAD_DIR, row.stored_path);
  if (!abs.startsWith(UPLOAD_DIR) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.type(row.mime_type);
  // Never let a browser second-guess the type we verified from the bytes.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition',
    `inline; filename="${String(row.original_name || 'document').replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(abs).pipe(res);
}

/* The formats a camera produces, with PDF deliberately left out. */
const PHOTO_TYPES = ['jpg', 'png', 'webp', 'heic'];

/**
 * A stricter uploader for a screen that needs one. The public crew form uses
 * this: multer holds the whole file in memory before anything is written, so a
 * ceiling on a route nobody has to log in to reach is a ceiling on how much
 * memory a stranger can make this server hold.
 */
function bounded({ mb, files = 1 }) {
  return multer({ storage: multer.memoryStorage(),
                  limits: { fileSize: mb * 1024 * 1024, files } });
}

module.exports = { upload, store, sendFile, UPLOAD_DIR, ACCEPTED, MAX_MB,
                   resizes: () => !!sharp, MAX_EDGE, PHOTO_TYPES, bounded };
