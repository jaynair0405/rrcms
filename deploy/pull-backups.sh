#!/bin/bash
#
# Pull the nightly database dumps down from crtms.in to this Mac.
#
# WHY THE MAC PULLS RATHER THAN THE SERVER PUSHING. A push needs an SSH key
# generated on crtms.in and trusted somewhere else — a credential living on the
# public-facing machine, which is the one most likely to be broken into. Pulling
# leaves the server entirely passive: it holds no key, trusts nothing, and can
# reach nothing. The cost is that this only runs when the Mac is on, so a
# fortnight away is a fortnight with no fresh off-site copy. That is a real
# limitation and it is the reason this is worth revisiting once the pilot is
# steady.
#
# WHAT IT GUARDS AGAINST. Not "did rsync exit 0" — rsync exits 0 perfectly
# happily when it copies nothing at all, which is exactly what a silent failure
# looks like. It checks that a dump ARRIVED, that it is recent, and that it
# actually unzips. A backup nobody has ever opened is a rumour.
set -uo pipefail

SERVER=railway@93.127.198.125
REMOTE=/var/backups/mysql/
UPLOADS=/var/lib/rrcms/uploads/     # every photograph, challan and scanned document
DEST=~/rrcms19/backups
KEEP_DAYS=60          # longer than the server's 14: this copy is the deeper one
STALE_HOURS=30        # the server dumps daily; older than this and something stopped

DEST=${DEST/#\~/$HOME}
mkdir -p "$DEST"
LOG="$DEST/pull.log"
say() { echo "$(date '+%F %T')  $*" | tee -a "$LOG"; }

say "---- pulling from $SERVER ----"

# --ignore-existing: a dump never changes once written, so re-fetching 170 MB of
# files already held is a waste of somebody's evening.
if ! rsync -az --ignore-existing --timeout=120 \
      "$SERVER:$REMOTE"'*.sql.gz' "$DEST/" >>"$LOG" 2>&1; then
  say "FAILED — rsync could not fetch from the server. Nothing was deleted here."
  exit 1
fi

# THE FILES, NOT ONLY THE DATABASE.
#
# Only the METADATA of an upload is in the dump — the file itself lives on disk
# under UPLOAD_DIR. Restoring one without the other gives a register full of
# records pointing at documents that are not there, which is worse than an
# obvious gap because every screen still renders and every count still adds up.
#
# No --delete: a document removed on the server should not vanish from the
# backup, or the backup is only a mirror of the present. Uploads are written
# once and never edited, so --ignore-existing means a full pull happens once and
# every pull after it carries only what is new.
mkdir -p "$DEST/uploads"
if rsync -az --ignore-existing --timeout=120 "$SERVER:$UPLOADS" "$DEST/uploads/" >>"$LOG" 2>&1; then
  nfiles=$(find "$DEST/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')
  say "ok   uploads — $nfiles file(s) held here"
else
  # Not fatal on its own: the directory may not exist until the first upload.
  # But it must be SAID, or a silent skip becomes a permanent one.
  say "WARNING — could not pull the uploads directory. If the server has had"
  say "          uploads since go-live, this backup is incomplete."
fi

newest=$(ls -t "$DEST"/*.sql.gz 2>/dev/null | head -1)
if [ -z "$newest" ]; then
  say "FAILED — there is not a single dump in $DEST. Nothing was deleted here."
  exit 1
fi

# HOW OLD IS THE NEWEST ONE? rsync exits 0 when it copies nothing, so "it ran"
# proves nothing at all. If the server stopped dumping a week ago this is the
# only thing that would ever say so.
age_h=$(( ( $(date +%s) - $(stat -f %m "$newest") ) / 3600 ))
sz=$(stat -f %z "$newest")

# DOES IT ACTUALLY UNZIP? A truncated transfer looks like a file. gzip -t reads
# the whole thing and checks its checksum, which is cheap and is the difference
# between having a backup and believing you have one.
if ! gzip -t "$newest" 2>>"$LOG"; then
  say "FAILED — $(basename "$newest") is corrupt; it does not unzip. Nothing deleted."
  exit 1
fi

say "ok   newest is $(basename "$newest")  $(( sz / 1048576 )) MB  ${age_h}h old  — unzips cleanly"
say "held $(ls "$DEST"/*.sql.gz | wc -l | tr -d ' ') dump(s), $(du -sh "$DEST" | cut -f1) on this Mac"

if [ "$age_h" -gt "$STALE_HOURS" ]; then
  say "WARNING — the newest dump on the server is ${age_h} hours old. The nightly"
  say "          job on crtms.in has stopped. Check /var/backups/mysql/backup.log there."
  exit 1
fi

# Only after a run that proved itself. A week of failures must never end with
# this Mac deleting the last good copy it has.
find "$DEST" -name '*.sql.gz' -mtime +$KEEP_DAYS -print -delete >> "$LOG" 2>&1

say "---- done ----"
