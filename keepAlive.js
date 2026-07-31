const http = require("http");

/**
 * Starts a minimal HTTP server that always responds 200 OK. Point an
 * uptime monitor (e.g. UptimeRobot, cron-job.org) at it every 5 minutes
 * to stop free/sleep-prone hosts (Replit, Glitch, etc.) from spinning the
 * bot down. Not needed if you're hosting on a VPS with pm2 — see the
 * README's "Keeping the bot online 24/7" section.
 */
module.exports = function startKeepAliveServer() {

    const port = process.env.PORT || 3000;

    http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("InfoCore Bot is alive.");
    }).listen(port, () => {
        console.log(`🌐 Keep-alive server listening on port ${port}`);
    });

};
