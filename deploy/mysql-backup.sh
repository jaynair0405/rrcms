#!/bin/bash
#
# Nightly dump of every application database on this server.
#
# WHY THIS EXISTS. On 07.09.2026 crtms.in held bbtro (153 tables — CRTMS and
# three Python applications) and was being dumped nowhere at all. /etc/cron.d
# had certbot, e2scrub and sysstat, and nothing else. That is the largest single
# risk on the box and it has nothing to do with RR-CMS: a bad DELETE, a
# corrupted table or a failed disk would have ended four live applications at
# once, with nothing to go back to.
#
# HOW IT AUTHENTICATES, and why there is no password anywhere in this file.
# `root@localhost` on this server is auth_socket: it authenticates by the Unix
# user running the command, not by a password. Run as root from cron, mysqldump
# simply works. A password in a backup script is a password in a file that gets
# copied off the server every night, which is the last place one should be.
#
# WHAT IT DOES NOT DO. A dump sitting on the same disk as the database is not a
# backup — it survives a mistake, not a dead disk. Part 6 of GO-LIVE.md copies
# these off the server, and rehearses a restore. Until that is done this is half
# the job, and the better half is the half that is missing.
set -uo pipefail

OUT=/var/backups/mysql
KEEP_DAYS=14
DBS="bbtro rrcms"
# WHO ELSE MAY READ THE DUMPS.
#
# The directory was root-only, which is the safe default and also made the
# backups impossible to copy off the server: the account you SSH in as could not
# even list them, and a backup that cannot leave the machine is not yet a
# backup. So the group is given read access and nothing more — no write, no
# delete, no ability to alter a dump after it was taken.
#
# It is worth being clear about what this costs. Anyone who can log in as this
# user can now read the databases in full. That account already holds the
# application's own database password in its .env, so it could read them anyway;
# this widens nothing that was not already open. Set it empty to turn the
# sharing off, and pull the dumps as root by another route.
READ_GROUP=railway
STAMP=$(date +%F_%H%M)
LOG=$OUT/backup.log

mkdir -p "$OUT"
if [ -n "${READ_GROUP:-}" ] && getent group "$READ_GROUP" >/dev/null 2>&1; then
  chgrp "$READ_GROUP" "$OUT"; chmod 750 "$OUT"
else
  chmod 700 "$OUT"
fi

say() { echo "$(date '+%F %T')  $*" >> "$LOG"; }

say "---- start ----"
fail=0

# THE SERVER ITSELF, BEFORE ANYTHING ELSE.
#
# The first version of this script asked `SHOW DATABASES LIKE` for each name and
# treated any answer that was not the name as "not there yet". Run with MySQL
# stopped, it therefore logged "skip bbtro — no such database", exited 0, and
# pruned a fortnight of old dumps on a night when it had backed up nothing at
# all. Found by running it, not by reading it.
#
# A database that does not exist is a fact. A database server that cannot be
# reached is a failure, and the two must never look the same.
if ! mysqladmin ping >/dev/null 2>&1; then
  say "FAILED — the MySQL server cannot be reached. Nothing was dumped and"
  say "         nothing old was deleted."
  say "---- done (fail=1) ----"
  exit 1
fi
for db in $DBS; do
  # A database that does not exist yet is not a failure. rrcms will not be there
  # until Part 1 has been done, and a backup that reports failure every night
  # until then is a backup nobody reads the log of.
  if ! mysql -N -B -e "SHOW DATABASES LIKE '$db'" | grep -qx "$db"; then
    say "skip $db — no such database on this server"
    continue
  fi
  # A DATABASE WITH NO TABLES IS NOT A BROKEN BACKUP.
  #
  # On the day the schema is created and before the migrations are run, `rrcms`
  # exists and is empty. mysqldump writes a valid 493-byte file, the size guard
  # below called that a failure, and the run exited 1 — every night until Part 2
  # was done. Two things follow, and the second is the worse: a nightly failure
  # that is expected teaches you to stop reading the log, and because the run
  # "failed" the pruning below never ran, so retention would never have worked
  # at all.
  #
  # The table count tells the two apart. No tables: nothing to dump yet, say so
  # and move on. Tables, and a tiny dump: that is a real failure.
  tables=$(mysql -N -B -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$db'" 2>>"$LOG")
  if [ "${tables:-0}" -eq 0 ]; then
    say "skip $db — the database exists but has no tables in it yet"
    continue
  fi

  f="$OUT/${db}-${STAMP}.sql.gz"
  # --single-transaction   a consistent dump of InnoDB without locking the
  #                        applications out while it runs
  # --routines --triggers --events   these are part of the schema and are lost
  #                        silently without them
  if mysqldump --single-transaction --quick --routines --triggers --events \
       --default-character-set=utf8mb4 "$db" 2>>"$LOG" | gzip -9 > "$f"; then
    # gzip of an empty or failed dump still succeeds, so the SIZE is checked.
    sz=$(stat -c %s "$f")
    if [ "$sz" -lt 1024 ]; then
      say "FAILED $db — $tables tables but the dump is only ${sz} bytes; kept for inspection"
      fail=1
    else
      # Readable by the group and by nobody else. A dump is the whole database
      # in plain text once it is unzipped; world-readable would put every
      # running room's record in front of any account on the machine.
      if [ -n "${READ_GROUP:-}" ] && getent group "$READ_GROUP" >/dev/null 2>&1; then
        chgrp "$READ_GROUP" "$f"; chmod 640 "$f"
      else
        chmod 600 "$f"
      fi
      say "ok   $db  $tables tables  $(numfmt --to=iec "$sz" 2>/dev/null || echo "${sz}B")  $f"
    fi
  else
    say "FAILED $db — mysqldump returned an error"
    rm -f "$f"
    fail=1
  fi
done

# Old dumps go only after a successful run, so a week of failures never leaves
# the server with nothing.
if [ "$fail" -eq 0 ]; then
  find "$OUT" -name '*.sql.gz' -mtime +$KEEP_DAYS -print -delete >> "$LOG" 2>&1
fi

say "---- done (fail=$fail) ----"
exit $fail
