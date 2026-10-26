/**
 * What a clause says, AT THIS RUNNING ROOM.
 *
 * WHY THIS ROUTE EXISTS
 *
 * The officer, looking at the live site on 09.09.2026: "where we mention the
 * clause of contract, can we show what the clause is by clicking on the wording
 * clause".
 *
 * WHY IT CANNOT SIMPLY LOOK THE CODE UP
 *
 * Every clause code printed on a screen -- A6, C6, B2 -- comes from the
 * DIVISIONAL TENDER's penalty annexure, which is the paper RR-CMS was built
 * from. IGP is not run by that paper. Its contract has thirty-one clauses
 * lettered (a) to (ee), and where one of them answers to a tender code, that
 * contract clause is the answer at IGP -- at ITS rate, not the tender's.
 *
 * So this reads through `terms.clauseFor`, the same function the deficiency
 * routes use. A screen and a recorded deficiency must not be able to give
 * different answers about the same clause on the same day; the way to guarantee
 * that is for both to ask the same question of the same code.
 *
 * WHEN THE CONTRACT IS SILENT the tender's clause is returned and the panel is
 * told to SAY SO. That fallback is correct -- a site's penalty list is not the
 * whole of the contract conditions -- but a reader who is not told cannot tell
 * the difference between "this is your contract" and "your contract does not
 * mention this, so the divisional paper applies". Those are different facts and
 * the panel prints them differently.
 *
 * NO PERMISSION IS REQUIRED beyond being signed in and being able to reach the
 * running room. A clause is the contract the reader is already working under,
 * and the whole schedule is on the master data screen already. What IS enforced
 * is the running room: asking for clause C6 "at running room 19" must not be a
 * way to learn which contract governs a site you cannot see.
 */
const express = require('express');
const db = require('../db');
const terms = require('../services/contract-terms');
const { assertRunningRoomAccess } = require('../middleware/scope');
const { today } = require('../lib/day');

const router = express.Router();

/* Codes are short and fixed in shape. Anything else is not a clause code, and
 * saying so plainly beats letting it reach the database as a parameter. */
const CODE = /^[A-Za-z][0-9]{1,2}$/;

router.get('/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    if (!CODE.test(code)) return res.status(400).json({ error: 'not a clause code' });

    const rrId = parseInt(req.query.rr, 10);
    if (!rrId) return res.status(400).json({ error: 'no running room' });
    await assertRunningRoomAccess(db, req.user, rrId);

    /* The clause in force TODAY, not on whatever date the page is showing. A
     * clause is a term of the contract as it stands; the page date says which
     * day's records are being read, which is a different question. */
    const row = await terms.clauseFor(db, rrId, code, today());
    if (!row) {
      return res.json({ asked: code, found: false,
        note: 'Not on the schedule in force at this running room.' });
    }

    const own = row.contract_id != null;
    res.json({
      asked:       code,
      found:       true,
      code:        row.clause_code,
      description: row.description,
      rate:        row.rate,
      unit:        row.unit,
      group:       row.group_name,
      note:        row.formula_note,
      /* The two facts a reader cannot get from the text itself. */
      fromContract: own,
      source:      own ? (row.source_ref || 'this running room’s own contract')
                       : 'the divisional tender for Central Railway running rooms',
      silent:      own ? null
                       : 'This running room’s contract does not name this. The '
                       + 'divisional tender applies.',
    });
  } catch (e) { next(e); }
});

module.exports = router;
