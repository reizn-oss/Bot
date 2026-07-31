module.exports = {
    apps: [
        {
            name: "infocorebot",
            script: "index.js",
            // Restart automatically on crash, but back off if it keeps
            // crashing immediately (bad token, etc.) instead of looping forever.
            autorestart: true,
            max_restarts: 10,
            min_uptime: "30s",
            restart_delay: 5000,
            watch: false,
            max_memory_restart: "300M",
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
