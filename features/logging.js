const { EmbedBuilder } = require("discord.js");

const config = require("../config/serverConfig");

/**
 * Sends a small embed to the configured mod-logs channel.
 * Silently no-ops if the channel doesn't exist yet (e.g. /setup hasn't
 * been run) so nothing else in the bot ever crashes because of logging.
 */
async function logAction(guild, { title, description, color = 0x99AAB5, fields = [] }) {

    try {

        const channel = guild.channels.cache.find(
            c => c.name === config.channelNames.modLogs
        );

        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description || null)
            .setColor(color)
            .setTimestamp();

        if (fields.length) embed.addFields(fields);

        await channel.send({ embeds: [embed] });

    } catch (err) {

        console.error("Failed to write to mod-logs:", err.message);

    }

}

module.exports = { logAction };
