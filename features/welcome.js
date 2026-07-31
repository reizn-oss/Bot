const { EmbedBuilder } = require("discord.js");

const config = require("../config/serverConfig");
const { logAction } = require("./logging");

async function handleMemberAdd(member) {

    const guild = member.guild;

    // Auto-assign the Unverified tag so it's obvious who hasn't verified yet
    const unverifiedRole = guild.roles.cache.find(r => r.name === config.unverifiedRole);
    if (unverifiedRole) {
        await member.roles.add(unverifiedRole).catch(() => {});
    }

    // Post a welcome embed
    const welcomeChannel = guild.channels.cache.find(
        c => c.name === config.channelNames.welcome
    );

    if (welcomeChannel) {

        const embed = new EmbedBuilder()
            .setTitle(`👋 Welcome to ${guild.name}!`)
            .setDescription(
                `Hey ${member}, glad you're here!\n\n` +
                `📜 Head to <#${guild.channels.cache.find(c => c.name === config.channelNames.rules)?.id ?? config.channelNames.rules}> to read the rules first — ` +
                `that's step 1 before you can unlock the rest of the server.`
            )
            .setColor(0x5865F2)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `Member #${guild.memberCount}` })
            .setTimestamp();

        await welcomeChannel.send({ embeds: [embed] }).catch(() => {});

    }

    await logAction(guild, {
        title: "📥 Member Joined",
        description: `${member} (${member.user.tag})`,
        color: 0x57F287
    });

}

async function handleMemberRemove(member) {

    await logAction(member.guild, {
        title: "📤 Member Left",
        description: `${member.user?.tag ?? "Unknown user"}`,
        color: 0xED4245
    });

}

module.exports = { handleMemberAdd, handleMemberRemove };
