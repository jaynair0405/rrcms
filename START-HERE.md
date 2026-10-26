# Start here

RR-CMS — the Running Room Contract Management System. Stage 34.

Four pilot running rooms: **IGP, LNL, ROHA, JNPT**.

You can run it two ways. Start with the first.

---

## 1. The demo — no database, nothing installed on your Mac

This is the real application. Same routes, same permissions, same screens as the live
system; only the storage is fake, so nothing you type survives a restart. It is the
fastest way to see what the thing actually is.

```bash
cd ~/rrcms19/rrcms-app

pwd                 # <- check it says .../rrcms-app, NOT your crtms folder
npm install         # installs into ./node_modules right here

npm run demo        # 44 invented running rooms, three years of history
# or
npm run demo:pilot  # the four real pilot sites
```

Then open **http://localhost:3100**

Sign in with the role as the username, and `demo` as the password:

| Username | Password | What they see |
|---|---|---|
| `sysadmin` | `demo` | all 44 running rooms |
| `div_officer` | `demo` | Solapur only — 5 rooms |
| `rr_incharge` | `demo` | Kalyan only — 1 room |
| `contractor_sup` | `demo` | one contractor's rooms only |
| `hq` | `demo` | everything, read-only |

Stop it with **Ctrl-C**, same as CRTMS.

---

### Does `npm install` affect CRTMS?

**No.** `npm install` is per-folder, not system-wide. It reads the `package.json`
in the folder you are standing in and creates a `node_modules` folder *in that same
folder*. CRTMS has its own `node_modules` in its own folder. The two never meet.

Nothing is installed globally — that would need a `-g` flag, which we never use.
Your Node version, your CRTMS packages and your CRTMS database are all untouched.

The only way to affect CRTMS would be running `npm install` **inside the CRTMS
folder** by accident. So run `pwd` first and confirm it says `rrcms-app`. That is the
entire precaution.

Nothing else on your Mac is touched: no MySQL, no system settings, no CRTMS files.
Delete the folder and every trace is gone.

---

## What to look at, in five minutes

Sign in as **sysadmin**:

1. **Dashboard** — 44 running rooms, 2,675 beds, 3,521 crews/day. These are your
   own CSV figures. If any number is wrong, tell me.
2. **Running Rooms → CSMT** — no meal facility, so the manpower table has **no
   cooks and no bearers**. That rule is not in the tender's tables; we derived it.
3. **Running Rooms → search "KWV"** (Kurduvadi, 15 beds) — says *"scaled to 15
   beds"*, but Supervisor and Call Boy are still **3**, because they are
   round-the-clock posts. This is the other derived rule.
4. **Master data → Deficiency schedule** — the clauses with their rates, and a
   banner saying no amount is ever computed.

Then the part that actually matters:

5. Sign out. Sign in as **`rr_incharge`**. You should see **one** running room.
6. Now type `http://localhost:3100/running-rooms/1` in the address bar.
   It must say **Not permitted**. If it shows you CSMT, the security is broken —
   tell me straight away.

That last step is the real test. Everything else is cosmetic by comparison.

---

## 2. The real database

Needed the moment you want data that survives a restart — and needed before you believe
anything. **The demo runs the real code against a fake database, so it cannot catch a
wrong column name: the stub answers whatever the route asks it.** That has happened three
times, and a real MySQL was what refused it each time.

Every step is in **TESTING.md**, along with what to walk through at a running room and the
two tools that walk it for you. Don't start there until the demo above makes sense.
