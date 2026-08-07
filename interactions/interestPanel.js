const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const config = require("../config/serverConfig");
const { logAction } = require("../features/logging");

// Distinct footer marker from the role wizard's "infocore-panel:wizard" —
// this panel is posted, tracked, and handled completely separately.
const PANEL_MARKER = "infocore-panel:interest";

/**
 * Renders the interest-role panel for posting into #role-select. It's a
 * single static public message — every button just toggles that one role
 * on/off immediately (no multi-step flow, no per-user button state).
 */
function buildInterestMessage() {

    const panel = config.interestPanel;

    const embed = new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.description)
        .setColor(panel.color)
        .setFooter({ text: PANEL_MARKER });

    const row = new ActionRowBuilder().addComponents(
        panel.roles.map(entry =>
            new ButtonBuilder()
                .setCustomId(`interest:${encodeURIComponent(entry.name)}`)
                .setLabel(entry.name)
                .setEmoji(entry.emoji)
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return { embeds: [embed], components: [row] };

}

async function handleInterestButton(interaction) {

    const [, encodedName] = interaction.customId.split(":");
    const roleName = decodeURIComponent(encodedName);

    const entry = config.interestPanel.roles.find(r => r.name === roleName);
    if (!entry) return;

    const guild = interaction.guild;
    const member = interaction.member;
    const role = guild.roles.cache.find(r => r.name === roleName);

    if (!role) {
        return interaction.reply({ content: `❌ ${roleName} role not found. Ask an admin to run /setup.`, flags: 64 });
    }

    const unlockedChannel = guild.channels.cache.find(c => c.name === entry.unlocks);
    const channelMention = unlockedChannel ? `${unlockedChannel}` : `#${entry.unlocks}`;

    const alreadyHas = member.roles.cache.has(role.id);

    if (alreadyHas) {
        await member.roles.remove(role).catch(() => {});
        await interaction.reply({ content: `➖ Removed **${roleName}**. ${channelMention} is hidden again.`, flags: 64 });
    } else {
        await member.roles.add(role).catch(() => {});
        await interaction.reply({ content: `✅ Added **${roleName}**! ${channelMention} is now unlocked.`, flags: 64 });
    }

    await logAction(guild, {
        title: "🎭 Interest Role Toggled",
        description: `${member} ${alreadyHas ? "removed" : "added"} **${roleName}**`,
        color: 0x99AAB5
    });

}

module.exports = { buildInterestMessage, handleInterestButton, PANEL_MARKER };
