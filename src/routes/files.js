/**
 * One way to see a stored file.
 *
 * Every photograph and document in RR-CMS is served from here, and only from
 * here. Access is decided by `services/file-access`, which finds the record
 * that owns the file and applies that record's running room and that record's
 * own permission.
 *
 * Before this existed there were two photo routes, one per module, and the
 * deficiency register borrowed the inspections one to show its own evidence --
 * which worked, and worked for a file the inspections route had no business
 * serving. Three more screens were about to be built on top of that. One door
 * with one lock is the point.
 */
const express = require('express');
const db = require('../db');
const uploads = require('../services/uploads');
const { fileFor } = require('../services/file-access');

const router = express.Router();

router.get('/:fileId', async (req, res, next) => {
  try {
    const f = await fileFor(db, req.user, req.params.fileId);
    uploads.sendFile(res, f);
  } catch (e) { next(e); }
});

module.exports = router;
