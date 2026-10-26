const cfg = require('../config');

// Which roles hold each permission, so a refusal can say who to ask.
const HOLDERS = {
  'rr.view':            'every role except crew',
  'rr.edit':            'Sr. DEE (TRO) / DME (O&C), System Administrator',
  'contract.view':      'HQ, Sr. DEE (TRO) / DME (O&C), System Administrator',
  'contract.edit':      'Sr. DEE (TRO) / DME (O&C), System Administrator',
  'staff.view':         'HQ, Sr. DEE (TRO) / DME (O&C), RR In-charge, Contractor Supervisor, System Administrator',
  'staff.edit':         'Contractor Supervisor',
  'staff.screen':       'Sr. DEE (TRO) / DME (O&C)',
  'muster.mark':        'Contractor Supervisor',
  'muster.countersign': 'Sr. DEE (TRO) / DME (O&C), RR In-charge',
  'stay.manage':        'RR In-charge, Contractor Supervisor',
  'feedback.view':      'HQ, Sr. DEE (TRO) / DME (O&C), RR In-charge, System Administrator',
  'feedback.close':     'Sr. DEE (TRO) / DME (O&C), RR In-charge',
  'inspection.create':  'Sr. DEE (TRO) / DME (O&C), RR In-charge',
  'deficiency.record':  'Sr. DEE (TRO) / DME (O&C), RR In-charge',
  'bill.pass':          'Sr. DEE (TRO) / DME (O&C)',
  'master.edit':        'System Administrator',
};

function notFound(req, res) {
  res.status(404);
  if (req.accepts('html')) return res.render('error', { title: 'Not found', status: 404,
    message: 'That page does not exist.', held: null, role: req.user ? req.user.role_name : null, detail: null });
  res.json({ error: 'not found' });
}

const { MAX_MB } = require('../services/uploads');

/**
 * Multer reports an oversized or malformed upload by throwing, and by default
 * that surfaced as "The request could not be completed" — which tells the
 * person at the site nothing, and looks like the system is broken when the
 * only fault is a large photograph. Turn it into something actionable.
 */
function uploadFault(err) {
  if (!err || err.name !== 'MulterError') return null;
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return `That file is larger than ${MAX_MB} MB. A photograph taken at a lower `
        + 'resolution, or the camera button on this page, will be well within the limit.';
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Too many files were sent at once. Attach them one at a time.';
    default:
      return 'That upload could not be read. Try attaching the file again.';
  }
}

function handler() {
  return (err, req, res, _next) => {
    const uploadMsg = uploadFault(err);
    if (uploadMsg) { err = Object.assign(new Error(uploadMsg), { status: 400 }); }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status);
    if (req.accepts('html')) {
      // Client errors carry a message written for the user — show it. Only a
      // server fault gets the generic line, because its detail is for the log.
      let message = status < 500 ? err.message : 'The request could not be completed.';
      let held = null;
      const m = /Permission "([^"]+)"/.exec(err.message || '');
      if (m) {
        message = 'Your role does not have access to this page.';
        held = HOLDERS[m[1]] || null;
      }
      return res.render('error', {
        title: status === 403 ? 'Not permitted' : status === 404 ? 'Not found' : 'Something went wrong',
        status, message, held,
        role: req.user ? req.user.role_name : null,
        detail: cfg.env === 'development' && status >= 500 ? err.stack : null,
      });
    }
    res.json({ error: err.message });
  };
}

module.exports = { notFound, handler };
