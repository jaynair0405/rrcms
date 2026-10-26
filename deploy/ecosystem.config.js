/**
 * RR-CMS under PM2 — the way everything else on crtms.in already runs.
 *
 *   cd /opt/rrcms
 *   pm2 start deploy/ecosystem.config.js
 *   pm2 save                       # so it comes back with the others on reboot
 *   pm2 logs rrcms
 *
 * `pm2 save` writes the process list that pm2-railway.service resurrects at
 * boot. Without it RR-CMS runs until the next restart of the machine and then
 * quietly does not.
 *
 * No env block here on purpose: the application reads /opt/rrcms/.env itself
 * through dotenv, so the file is the single place configuration lives. Setting
 * the same values twice is how a server ends up with two answers.
 */
module.exports = {
  apps: [{
    name: 'rrcms',
    script: 'src/server.js',
    cwd: '/opt/rrcms',              // <-- wherever the application actually sits
    exec_mode: 'fork',
    instances: 1,

    /* IN PRODUCTION THIS APPLICATION REFUSES TO START when the database is
       behind the code, or when SESSION_SECRET is missing or too short. That is
       deliberate — a process that will not come up is better than pages that
       work until somebody reaches the wrong screen.

       PM2's default is to restart forever, which would turn one clear line in
       the log into thousands and hide the reason. These three settings make it
       try, fail, and stop: if it cannot stay up for 10 seconds, five times over,
       PM2 gives up and leaves the error where it can be read. */
    autorestart: true,
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 4000,

    max_memory_restart: '400M',

    /* The uploads directory is the only thing written outside the database, and
       it is set in .env (UPLOAD_DIR=/var/lib/rrcms/uploads). It must be on the
       backup, together with the dump — a restore of one without the other gives
       records pointing at documents that are not there. */

    out_file: '/var/log/rrcms/out.log',
    error_file: '/var/log/rrcms/error.log',
    merge_logs: true,
    time: true,                     // timestamps, so a log line can be dated
  }],
};
