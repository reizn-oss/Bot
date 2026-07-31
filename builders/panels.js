const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const config = require("../config/serverConfig");
const logger = require("../utils/logger");
const { buildFirstStepMessage } = require("../interactions/roleWizard");

// Marker used to detect a panel the bot already posted, so re-running
// /setup doesn't spam duplicate panels into the channel.
const PANEL_MARKER = "infocore-panel";

async function findExistingPanel(channel, matcher) {

    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);

    if (!messages) return null;

    const test = typeof matcher === "function"
        ? matcher
        : (footerText) => footerText === matcher;

    return messages.find(m =>
        m.author.id === channel.client.user.id &&
        test(m.embeds[0]?.footer?.text)
    );

}

async function postRulesPanel(guild, channel) {

    const footerText = `${PANEL_MARKER}:rules`;

    const existing = await findExistingPanel(channel, footerText);
    if (existing) {
        logger.skip("rules panel");
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("📜 Server Rules")
        .setDescription(
            "**1.** Be respectful — no harassment, hate speech, or discrimination.\n" +
            "**2.** No spam, self-promotion, or unsolicited advertising.\n" +
            "**3.** Keep NSFW content out — this is a school community space.\n" +
            "**4.** No invite links to other servers without staff permission.\n" +
            "**5.** Follow Discord's Terms of Service and Community Guidelines.\n" +
            "**6.** Listen to staff — Administrators, Student Welfare, Student Council, and Computer Society.\n\n" +
            `✅ Read everything above? Head to <#${guild.channels.cache.find(c => c.name === config.channelNames.verify)?.id ?? config.channelNames.verify}> next to verify and unlock the server.`
        )
        .setColor(0xFEE75C)
        .setFooter({ text: footerText });

    await channel.send({ embeds: [embed] });
    logger.success("rules panel");

}

async function postVerifyPanel(guild, channel) {

    const footerText = `${PANEL_MARKER}:verify`;

    const existing = await findExistingPanel(channel, footerText);
    if (existing) {
        logger.skip("verify panel");
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("✅ Verify to unlock the server")
        .setDescription(
            "Click the button below after reading the rules to get access " +
            "to the rest of **The InfoCore: CCIS Link-Hub**."
        )
        .setColor(0x2ECC71)
        .setFooter({ text: footerText });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify:confirm")
            .setLabel("Verify")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
    );

    await channel.send({ embeds: [embed], components: [row] });
    logger.success("verify panel");

}

async function postRoleWizardEntryPoint(guild, channel) {

    const existing = await findExistingPanel(channel, (footer) => footer?.includes("infocore-panel:wizard"));
    if (existing) {
        logger.skip("role wizard panel");
        return;
    }

    await channel.send(buildFirstStepMessage());
    logger.success("role wizard panel");

}

async function postTicketPanel(guild, channel) {

    const footerText = `${PANEL_MARKER}:ticket`;

    const existing = await findExistingPanel(channel, footerText);
    if (existing) {
        logger.skip("ticket panel");
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("🎫 Need help from the Council?")
        .setDescription("Click the button below to open a private ticket.")
        .setColor(0x5865F2)
        .setFooter({ text: footerText });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket:create")
            .setLabel("Open Ticket")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎫")
    );

    await channel.send({ embeds: [embed], components: [row] });
    logger.success("ticket panel");

}

module.exports = async (guild, channelsByName) => {

    logger.step("Posting Panels...");

    const rulesChannel = channelsByName[config.channelNames.rules];
    const verifyChannel = channelsByName[config.channelNames.verify];
    const roleSelectChannel = channelsByName[config.channelNames.roleSelect];
    const ticketPanelChannel = channelsByName[config.channelNames.ticketPanel];

    if (rulesChannel) {
        await postRulesPanel(guild, rulesChannel);
    }

    if (verifyChannel) {
        await postVerifyPanel(guild, verifyChannel);
    }

    if (roleSelectChannel) {
        await postRoleWizardEntryPoint(guild, roleSelectChannel);
    }

    if (ticketPanelChannel) {
        await postTicketPanel(guild, ticketPanelChannel);
    }

};
