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

    // Hits your Lavalink node's /v4/info and /v4/loadtracks directly and
    // reports back the raw response — useful for telling a proxy/Cloudflare
    // block (HTML response) apart from an actual node problem (JSON
    // response, even an error one) without needing shell/SSH access. Visit
    // /debug/lavalink on this service's URL. Doesn't expose your Lavalink
    // password to the caller.
    const nodesToCheck = [
        {
            label: process.env.LAVALINK_NODE_ID || "node-1",
            host: process.env.LAVALINK_HOST,
            port: Number(process.env.LAVALINK_PORT) || 443,
            authorization: process.env.LAVALINK_PASSWORD,
            secure: process.env.LAVALINK_SECURE !== "false"
        },
        // Only checked if a second node is actually configured.
        ...(process.env.LAVALINK_HOST2 ? [{
            label: process.env.LAVALINK_NODE_ID2 || "node-2",
            host: process.env.LAVALINK_HOST2,
            port: Number(process.env.LAVALINK_PORT2) || 443,
            authorization: process.env.LAVALINK_PASSWORD2,
            secure: process.env.LAVALINK_SECURE2 !== "false"
        }] : [])
    ];

    async function checkNode(node) {

        const infoUrl = `${node.secure ? "https" : "http"}://${node.host}:${node.port}/v4/info`;
        const searchUrl = `${node.secure ? "https" : "http"}://${node.host}:${node.port}/v4/loadtracks?identifier=scsearch:test`;

        async function probe(url) {
            try {
                const res = await fetch(url, { headers: { Authorization: node.authorization } });
                const bodyText = await res.text();
                return {
                    status: res.status,
                    contentType: res.headers.get("content-type"),
                    looksLikeHtml: /^\s*</.test(bodyText),
                    bodyPreview: bodyText.slice(0, 300)
                };
            } catch (err) {
                return { error: err.message };
            }
        }

        const [info, search] = await Promise.all([probe(infoUrl), probe(searchUrl)]);

        return { label: node.label, info: { url: infoUrl, ...info }, search: { url: searchUrl, ...search } };

    }

    http.createServer(async (req, res) => {

        if (req.url === "/debug/lavalink") {

            const results = await Promise.all(nodesToCheck.map(checkNode));

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(results, null, 2));

            return;

        }

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("InfoCore Bot is alive.");

    }).listen(port, () => {
        console.log(`🌐 Keep-alive server listening on port ${port}`);
    });

};
