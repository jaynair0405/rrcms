'use strict';
/**
 * WHAT EACH ROLE DOES, IN THE ORDER HE DOES IT.
 *
 * Asked for by the officer in his own words: "a help section for each user
 * role. what to do where and how to do, where to find what etc. now even i have
 * to open many links to find which is where." The last sentence is the whole
 * brief. A system with forty screens is not learned by being shown forty
 * screens; it is learned by being told the sequence of a day, once.
 *
 * THE SEQUENCE IS THE OFFICER'S, NOT MINE. Every step below was put to him as a
 * draft and corrected: the bearer keeps the call book, not the supervisor; the
 * muster is marked by both the supervisor and the bearer until biometric
 * attendance arrives; meals are written up like the linen until the crew can
 * acknowledge them on a screen of their own. Where a step is a stop-gap that
 * will change, it says so, because a man who knows why a thing is temporary
 * forgives it.
 *
 * NOTHING HERE MAY CLAIM A SCREEN CANNOT DO. Every `at` below is a real path
 * that the role's own permissions open, and `test/help-links.js` checks it
 * against the router on every run -- a help page that sends a man to a 404 is
 * worse than no help page, because he stops believing the next line too.
 */

const ROLES = {

  contractor_sup: {
    title: 'Contractor Supervisor',
    lead: 'You keep the running room’s day on record. Almost everything here is '
        + 'something you already do — this is where it gets written down so that '
        + 'the Railway can see it was done.',
    sections: [
      {
        when: 'Once, when the running room first comes on',
        why: 'Every register after this is checked against what is set up here: a man who '
           + 'is not on the staff list cannot be marked present, and a linen count means '
           + 'nothing until the book has a figure to compare it with. So this comes before '
           + 'the first day, not alongside it.',
        steps: [
          { do: 'Change the password you were given', at: '/account/password' },
          { do: 'Add every man posted here, with his designation', at: '/staff',
            note: 'Add new man, one at a time. Leave a date of joining blank rather than '
                + 'guess it: a blank says nobody knows yet, a guessed date says somebody checked.' },
          { do: 'Load each man’s documents and his photograph', at: '/staff',
            note: 'Open his name. Aadhaar, police verification, medical fitness and the rest. '
                + 'He stays “screening pending” until the Railway has seen them.' },
          { do: 'Ask the RR In-charge to admit them provisionally', at: '/staff',
            note: 'Until he does, nobody you added can be marked present on the muster.' },
          { do: 'Enter the linen the Railway has issued to the room', at: '/records/linen-stock',
            note: 'The consignment from stores, with its date. This is the figure every later '
                + 'count is compared with.' },
          { do: 'Make the first count of the linen shelf', at: '/records/linen' },
          { do: 'Enter what you hold of cleaning materials, cutlery and gas', at: '/facility/consumables' },
          { do: 'Lodge the FSSAI licence, if meals are served', at: '/food-safety',
            note: 'Until it is lodged the room shows as unlicensed. That is a finding, not a fault.' },
        ],
      },
      {
        when: 'First thing, before you issue anything',
        why: 'The shelf you see before the day’s first bedsheet goes out is the shelf '
           + 'as it stood when yesterday ended. That is the one moment in the day when a '
           + 'count means something exact, and it is why these three come first.',
        steps: [
          { do: 'Count the linen on the shelf', at: '/records/linen',
            note: 'The page opens on yesterday. Write what you actually count — it does not '
                + 'change the figure the system carries, it is compared with it, and the '
                + 'difference is what the Railway wants to see. The RR In-charge accepts the '
                + 'count and only then does the book start again from it.' },
          { do: 'Write up yesterday’s linen — what was issued to crews', at: '/records/linen',
            note: 'Same page, same day. An empty box means you did not issue that item, which '
                + 'is not the same as issuing none — write 0 if you mean none.' },
          { do: 'Mark yesterday’s evening and night shifts', at: '/records/muster',
            note: 'Change the day to yesterday and the shift to Evening, then Night. You were '
                + 'not there for those two, so they are marked the next morning.' },
        ],
      },
      {
        when: 'Today, as the day runs',
        steps: [
          { do: 'Mark today’s muster', at: '/records/muster',
            note: 'General shift for the men who work the day; Morning if your roster runs '
                + 'shifts. You and the bearer both mark it for now — that becomes yours alone '
                + 'when biometric attendance arrives.' },
          { do: 'Tick each cleaning round as it is done', at: '/records/cleaning',
            note: 'Not at the end of the day. A round ticked hours later is a round nobody can '
                + 'prove happened in its window, and the window is what the contract buys.' },
          { do: 'Record the meals served', at: '/records/meals',
            note: 'Written up like the linen for now. When the crew can acknowledge a meal on a '
                + 'screen, this becomes one entry per crew per meal instead.' },
          { do: 'Enter any complaint a crew member makes', at: '/records/complaints',
            note: 'The day it is made. A complaint entered a week later cannot be answered.' },
          { do: 'The laundry man: what goes out, what comes back', at: '/records/linen',
            note: 'On the same linen page, lower down. Say whether the bundle came off the beds '
                + 'or off the fresh shelf — the two are different pools and the shelf figure '
                + 'depends on the answer. Keep the challan number: washing at a place the '
                + 'Railway has not approved is a deficiency by itself.' },
        ],
      },
      {
        when: 'When the occasion arises',
        steps: [
          { do: 'Consumables received and issued', at: '/facility/consumables' },
          { do: 'A new asset, or one that has failed', at: '/facility/assets' },
          { do: 'Pest control done', at: '/facility/pest' },
          { do: 'CCTV cameras checked', at: '/facility/cctv' },
          { do: 'Kitchen and food safety checks', at: '/food-safety' },
          { do: 'The week’s menu', at: '/facility/menu' },
          { do: 'A fire, a theft, an accident — anything that happened', at: '/incidents',
            note: 'Record it whoever you are and whatever the hour. Closing it is the Railway’s '
                + 'act, not yours — but a two o’clock fire must not wait for the right person '
                + 'to be on duty before anybody writes it down.' },
          { do: 'A new man, his documents and his photograph', at: '/staff',
            note: 'You add him and load his papers. He cannot be marked present until the '
                + 'Railway permits him — the RR In-charge can admit him provisionally so the '
                + 'register can be kept, and the Sr. DEE approves him properly.' },
        ],
      },
      {
        when: 'Once a month',
        steps: [
          { do: 'Wages, EPF, ESIC and the payment sheet', at: '/wages',
            note: 'The Railway confirms it saw the jointly signed sheet. The date wages were '
                + 'actually paid and the number of men are both facts somebody has to put his '
                + 'name to.' },
        ],
      },
    ],
    notMine: [
      ['Approving a man for deployment', 'Sr. DEE (TRO) / DME (O&C)'],
      ['Admitting a man provisionally', 'RR In-charge / CLI'],
      ['Counter-signing the muster', 'RR In-charge / CLI'],
      ['Accepting your count of the linen shelf', 'RR In-charge / CLI'],
      ['Verifying a day of cleaning', 'RR In-charge / CLI'],
      ['Recording or closing a deficiency', 'The Railway'],
      ['Approving a washing centre or pest operator', 'Sr. DEE (TRO) / DME (O&C)'],
    ],
    findIt: [
      ['Bedsheets, pillow covers — what was issued today', '/records/linen'],
      ['What the shelf holds, and what the Railway issued in total', '/records/linen-stock'],
      ['A bundle still at the laundry', '/records/linen'],
      ['Attendance, any day, any shift', '/records/muster'],
      ['Cleaning rounds and whether one is overdue', '/records/cleaning'],
      ['Calls received — kept by the bearer', '/records/call-book'],
      ['Crew complaints', '/records/complaints'],
      ['Meals served', '/records/meals'],
      ['Cleaning materials, cutlery, gas — stock in hand', '/facility/consumables'],
      ['Cots, mattresses, RO plants — the asset register', '/facility/assets'],
      ['Pest control, when it is next due', '/facility/pest'],
      ['Cameras and when each was last checked', '/facility/cctv'],
      ['The menu and the meal card', '/facility/menu'],
      ['FSSAI licence and kitchen checks', '/food-safety'],
      ['Your men, their documents and screening', '/staff'],
      ['Inspections the Railway has made', '/inspections'],
      ['Deficiencies raised against the contract', '/deficiencies'],
      ['The month’s pack of certificates', '/certificates'],
      ['Wages and statutory returns', '/wages'],
      ['Change your password', '/account/password'],
    ],
  },


  rr_incharge: {
    title: 'RR In-charge / CLI',
    lead: 'You are the Railway at this running room. Almost everything you do here is one of '
        + 'two things: checking what the contractor has written down, or writing down something '
        + 'only the Railway can say. The two are kept apart on purpose — a contractor who could '
        + 'sign off his own work would be proving nothing to anybody.',
    sections: [
      {
        when: 'Once, when the running room first comes on',
        why: 'The contractor’s supervisor sets up his half — his men, their papers, the first '
           + 'linen count. These are the Railway’s half, and the registers cannot be kept '
           + 'properly until both are done.',
        steps: [
          { do: 'Change the password you were given', at: '/account/password' },
          { do: 'Check the staff list and admit each man provisionally', at: '/staff',
            note: 'Once the supervisor has added them. Provisional lets him be marked present; '
                + 'the Sr. DEE approves him properly after screening.' },
          { do: 'Set the day of the week for each weekly cleaning item', at: '/records/cleaning',
            note: 'Only for items the contract calls “once in week” without naming a day. '
                + 'Agree the day at the site; the contractor cannot move it himself.' },
          { do: 'Accept the supervisor’s first linen count', at: '/records/linen' },
          { do: 'Check the list of trains for the call sheet', at: '/records/call-sheet-trains' },
          { do: 'Register the Railway’s assets', at: '/facility/assets',
            note: 'Cots, mattresses, ACs, geysers, RO plants — what the room holds on day one.' },
          { do: 'Register the CCTV cameras, by place', at: '/facility/cctv' },
          { do: 'Agree the first weekly menu and the rate board', at: '/facility/menu' },
          { do: 'Print the feedback QR posters and put them up', at: '/feedback/qr',
            note: 'At bedsides and in the dining hall. Check the poster opens on a phone first.' },
        ],
      },
      {
        when: 'On your visit — most days',
        why: 'The daily check is required whether or not the contractor’s man is there. He works '
           + 'the day shift; you can walk in at any hour. If nobody from the contractor is present, '
           + 'say so on the report rather than leaving the question blank — a contractor with no man '
           + 'available at two in the morning is a fact, and a different one from a form nobody filled in.',
        steps: [
          { do: 'Walk the round and file the daily checklist', at: '/inspections/new',
            note: 'Clause by clause, with a photograph where it helps. Name the building you walked '
                + 'if the running room stands in more than one — “somewhere in Igatpuri” is not '
                + 'something the contractor can answer or anybody can go back and check.' },
          { do: 'Verify the cleaning rounds', at: '/records/cleaning',
            note: 'The contractor’s men tick the rounds; you confirm you saw the work. A cleaning '
                + 'record nobody confirms is the contractor marking his own homework, which is why '
                + 'clause A6 needs both halves.' },
          { do: 'Counter-sign the muster — each shift separately', at: '/records/muster',
            note: 'The night shift is marked the next morning, so signing the whole day in the '
                + 'afternoon would put your name under rows that did not exist when you looked. '
                + 'Change the shift at the top and sign each one you have seen.' },
          { do: 'Accept the count of the linen shelf', at: '/records/linen',
            note: 'The supervisor counts; you accept. Only then does the book carry that figure '
                + 'forward. A count can be accepted once its day is over, so this morning you are '
                + 'accepting yesterday’s. The difference against the book is kept either way — '
                + 'accepting settles the position, it does not erase the difference.' },
          { do: 'Record any deficiency you found, against its clause', at: '/deficiencies',
            note: 'Captured with the clause and the date. No money is computed anywhere in RR-CMS — '
                + 'the rate is the Railway’s to apply, and this puts the fact in front of whoever does.' },
        ],
      },
      {
        when: 'When it arises',
        steps: [
          { do: 'Admit a new man provisionally, so he can be marked present', at: '/staff',
            note: 'Yours to do; approving him properly is the Sr. DEE’s. Provisional says he is '
                + 'already working and nobody has screened him yet, and it stays flagged until '
                + 'somebody does.' },
          { do: 'Key in the signed physical feedback register', at: '/feedback/register',
            note: 'What the crew wrote in the book at the running room. The QR code takes the same '
                + 'feedback straight from a phone; this is for the men who use the book.' },
          { do: 'Close or action a feedback item', at: '/feedback' },
          { do: 'Close an incident, or set it under enquiry', at: '/incidents',
            note: 'Anybody may record an incident, including the contractor’s supervisor at two in '
                + 'the morning. Closing one is the Railway’s act alone.' },
          { do: 'Record a CCTV check', at: '/facility/cctv' },
          { do: 'Register an asset, or one that has failed', at: '/facility/assets' },
          { do: 'Agree the weekly menu and fix the rate board', at: '/facility/menu' },
          { do: 'Food safety — the licence, the returns, an inspection', at: '/food-safety' },
          { do: 'Keep the call-sheet trains current', at: '/records/call-sheet-trains' },
          { do: 'Record where the running room stands on its standing obligations', at: '/compliance' },
        ],
      },
      {
        when: 'Every month',
        steps: [
          { do: 'Enter the occupant count', at: '/running-rooms',
            note: 'Taken from RRMS and typed in here. RRMS owns the occupancy register and RR-CMS '
                + 'has no access to it, so this one figure is copied across by hand rather than '
                + 'invented or guessed at.' },
          { do: 'Grade each man — retain, monitor or replace', at: '/staff/grading',
            note: 'The screen already holds what the occupants said about him this month and what '
                + 'the muster says about his attendance; you add the joint evaluation and the '
                + 'recommendation. Both figures are worked out fresh each time the page is opened.' },
          { do: 'Confirm the Railway has seen the wage payment sheet', at: '/wages',
            note: 'The contractor records what he paid; you confirm you saw the jointly signed '
                + 'sheet. Clause M5 turns on the date wages were actually paid and on the number '
                + 'of men.' },
          { do: 'Check the month’s pack of certificates', at: '/certificates' },
          { do: 'Prepare the monthly bill', at: '/bills' },
        ],
      },
    ],
    notMine: [
      ['Approving a man for deployment', 'Sr. DEE (TRO) / DME (O&C)'],
      ['Approving a washing centre or a pest control operator', 'Sr. DEE (TRO) / DME (O&C)'],
      ['Passing the bill', 'Sr. DEE (TRO) / DME (O&C)'],
      ['Editing the contract or its schedules', 'Sr. DEE (TRO) / DME (O&C)'],
      ['Creating users and setting their scope', 'System Administrator'],
      ['Marking the muster', 'The contractor’s supervisor — you counter-sign it'],
      ['Counting the linen shelf', 'The contractor’s supervisor — you accept the count'],
    ],
    findIt: [
      ['Your inspections, and what they found', '/inspections'],
      ['File today’s checklist', '/inspections/new'],
      ['Deficiencies raised, open and closed', '/deficiencies'],
      ['This week’s and this month’s deficiency review', '/deficiencies/review'],
      ['The muster, any day, any shift', '/records/muster'],
      ['Cleaning rounds, and whether one is overdue', '/records/cleaning'],
      ['The linen register and counts awaiting your acceptance', '/records/linen'],
      ['What the shelf holds against what the Railway issued', '/records/linen-stock'],
      ['Crew feedback, and the signed register', '/feedback'],
      ['How much of the crew was actually asked', '/feedback/coverage'],
      ['The feedback QR poster for the running room', '/feedback/qr'],
      ['Staff, their documents and screening', '/staff'],
      ['Monthly grading of each man', '/staff/grading'],
      ['Wages, EPF, ESIC and the payment sheet', '/wages'],
      ['Incidents', '/incidents'],
      ['Standing obligations', '/compliance'],
      ['Assets, consumables, pest control and CCTV', '/facility/assets'],
      ['The menu and the rate board', '/facility/menu'],
      ['Food safety and the FSSAI licence', '/food-safety'],
      ['The month’s pack of certificates', '/certificates'],
      ['Bills', '/bills'],
      ['Reports across your running room', '/reports'],
    ],
  },


  div_officer: {
    title: 'Sr. DEE (TRO) / DME (O&C)',
    lead: 'You are the division. Almost nothing here is daily — the running room’s day is kept '
        + 'by the contractor and checked by the CLI. What is yours are the decisions nobody else '
        + 'may take, and the review that sees twenty running rooms at once instead of one.',
    sections: [
      {
        when: 'Decisions only you can take',
        why: 'These are not on a schedule. They arrive, and until you act nothing downstream can '
           + 'move — a man cannot be marked present, a washing centre cannot be used without it '
           + 'being a deficiency in itself, a bill cannot be paid.',
        steps: [
          { do: 'Approve or reject a man’s screening', at: '/staff',
            note: 'Use the unscreened filter. The CLI can admit a man provisionally so the '
                + 'register can be kept from day one, but provisional is not approval — it says '
                + 'he is already working and nobody has checked him. The flag stays until you do.' },
          { do: 'Approve, inspect or blacklist a washing centre or pest control operator',
            at: '/masters/vendors',
            note: 'Approval is what clause C1 turns on: linen washed at a place the Railway has '
                + 'not approved is a deficiency by itself, whatever the linen comes back like.' },
          { do: 'Close a deficiency', at: '/deficiencies',
            note: 'Recorded as closed against your name and the date. RR-CMS computes no money '
                + 'anywhere — the rate and the recovery are applied outside it, and this is the '
                + 'record that the matter was dealt with.' },
          { do: 'Pass a bill for payment', at: '/bills',
            note: 'The CLI prepares it at the running room and it comes to you. Nothing sits '
                + 'between the two.' },
          { do: 'Read in a contract, or amend its schedules', at: '/contractors',
            note: 'A running room’s own contract governs its rates, its penalty clauses, its '
                + 'linen list and its manpower. Where a contract has been read in, its figures '
                + 'replace the generic ones everywhere — which is why reading one in properly '
                + 'matters more than any other single act in this system.' },
          { do: 'Create or edit a running room', at: '/running-rooms' },
        ],
      },
      {
        when: 'The review — weekly and monthly',
        why: 'The value of this system to you is not any one screen; it is seeing the same '
           + 'question answered the same way at every running room in the division on the same day.',
        steps: [
          { do: 'The deficiency review, week and month', at: '/deficiencies/review' },
          { do: 'How much of the crew was actually asked for feedback', at: '/feedback/coverage',
            note: 'A running room with excellent feedback from four men has not been measured. '
                + 'Coverage is the figure that says whether the rest of the feedback means anything.' },
          { do: 'The month’s certificate pack, running room by running room', at: '/certificates' },
          { do: 'Wages, EPF and ESIC across the division', at: '/wages' },
          { do: 'Reports — sites, and trends over time', at: '/reports' },
          { do: 'Crew feedback and the monthly grading picture', at: '/feedback' },
        ],
      },
      {
        when: 'When you visit a running room',
        why: 'Monthly, or once a quarter, and an ADEE or DEE may go in your place. The daily '
           + 'checklist stays the CLI’s work whoever visits — so nothing here is a step you have '
           + 'to remember, it is simply open to you when you are standing there.',
        steps: [
          { do: 'Everything the CLI can do', at: '/help',
            note: 'File an inspection, counter-sign a muster, verify a cleaning round, accept a '
                + 'linen count, record a deficiency you found yourself. Switch this page to '
                + 'RR In-charge / CLI at the top to see how each of those works.' },
        ],
      },
    ],
    notMine: [
      ['Marking the muster', 'The contractor’s supervisor'],
      ['Counting the linen shelf', 'The contractor’s supervisor'],
      ['Recording the day’s cleaning rounds', 'The contractor’s supervisor'],
      ['Creating users and setting their scope', 'System Administrator'],
      ['Anything at a running room outside your division', 'That division’s officer'],
    ],
    findIt: [
      ['Men awaiting screening, across the division', '/staff'],
      ['Monthly grading and the retain / monitor / replace picture', '/staff/grading'],
      ['Washing centres and pest control operators', '/masters/vendors'],
      ['Contracts, contractors and their agreements', '/contractors'],
      ['Deficiencies, open and closed', '/deficiencies'],
      ['The weekly and monthly deficiency review', '/deficiencies/review'],
      ['Bills', '/bills'],
      ['The month’s certificate pack', '/certificates'],
      ['Wages, EPF, ESIC and Shramik Kalyan', '/wages'],
      ['Crew feedback', '/feedback'],
      ['Feedback coverage — how much of the crew was asked', '/feedback/coverage'],
      ['Inspections filed at every running room', '/inspections'],
      ['Incidents', '/incidents'],
      ['Standing obligations', '/compliance'],
      ['Food safety and FSSAI licences', '/food-safety'],
      ['Running rooms, and their particulars', '/running-rooms'],
      ['Reports across sites and over time', '/reports'],
      ['The contract schedules as read in', '/masters'],
    ],
  },

};

/* HQ is written next, with the officer, one at a time -- the
   sequence of a day belongs to the man who works it and is not a thing to
   invent from a permission list. */
const PENDING_ROLES = {
  hq: 'HQ / PCEE Office',
};

/**
 * WHICH OF THIS MAN'S STEPS HAPPEN ON THIS SCREEN.
 *
 * The officer asked whether the help could sit beside the screen it describes,
 * and answered his own objection in the same breath: "but how several pages."
 * It is the right objection, and the answer is that there are no several pages.
 * Help per screen was never a thing to write -- every step above already NAMES
 * the screen it happens on, so the index only has to be read the other way
 * round. Fourteen of the supervisor's screens answer from what is already here,
 * notes and all, and a role written later lights up its own screens for its own
 * people without a line being written twice.
 *
 * A sub-page counts as its screen: /staff/1074 is the staff screen. Matching is
 * exact first, then the longest `at` the path sits UNDER -- on a path boundary,
 * so that /records/linen-stock is never mistaken for /records/linen.
 */
function helpFor(roleCode, path) {
  const role = ROLES[roleCode];
  if (!role || !path) return null;

  let best = null;
  for (const sec of role.sections) {
    for (const st of sec.steps) {
      if (path !== st.at && !path.startsWith(st.at + '/')) continue;
      if (!best || st.at.length > best.length) best = st.at;
    }
  }
  /* A SCREEN THAT IS NOT A STEP IN HIS DAY BUT IS STILL HIS.
     The linen stock page is not something a supervisor does every morning, so
     no step names it -- but it is in his index, and a panel that says nothing
     on a screen he was sent to by his own help page is a panel he stops
     opening. So the index answers where the day does not. */
  if (!best) {
    const found = role.findIt.filter(f => path === f[1] || path.startsWith(f[1] + '/'))
      .sort((a, b) => b[1].length - a[1].length)[0];
    return found ? { roleTitle: role.title, groups: [], next: null, about: found[0] } : null;
  }

  /* Every step on this screen, and the one that follows the last of them in the
     day. Knowing what comes next is most of what a man wants in his first
     fortnight -- the sequence, not the screen he is already looking at. */
  const flat = [];
  role.sections.forEach(sec => sec.steps.forEach(st => flat.push({ sec, st })));
  const here = flat.filter(f => f.st.at === best);
  const lastIdx = flat.lastIndexOf(here[here.length - 1]);
  const next = flat[lastIdx + 1] || null;

  const groups = [];
  for (const f of here) {
    const g = groups.find(x => x.when === f.sec.when);
    if (g) g.steps.push(f.st); else groups.push({ when: f.sec.when, steps: [f.st] });
  }
  return { roleTitle: role.title, groups,
           next: next ? { when: next.sec.when, do: next.st.do, at: next.st.at } : null };
}

module.exports = { ROLES, PENDING_ROLES, helpFor };
