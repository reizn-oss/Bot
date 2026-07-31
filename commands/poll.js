const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

// In-memory vote storage: pollId -> { question, options: [str], votes: Map(userId -> optionIndex) }
// Resets on bot restart — fine for lightweight community polls. Swap in a
// real database here if you need polls to survive restarts.
const polls = new Map();
let nextPollId = 1;

const OPTION_LETTERS = ["🇦", "🇧", "🇨", "🇩", "🇪"];

function buildPollEmbed(poll) {

    const counts = new Array(poll.options.length).fill(0);
    for (const optionIndex of poll.votes.values()) counts[optionIndex]++;

    const totalVotes = poll.votes.size;

    const description = poll.options.map((opt, i) => {

        const count = counts[i];
        const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
        const barLength = Math.round(pct / 10);
        const bar = "█".repeat(barLength) + "░".repeat(10 - barLength);

        return `${OPTION_LETTERS[i]} **${opt}**\n${bar} ${count} vote(s) — ${pct}%`;

    }).join("\n\n");

    return new EmbedBuilder()
        .setTitle(`📊 ${poll.question}`)
        .setDescription(description)
        .setColor(0x5865F2)
        .setFooter({ text: `${totalVotes} total vote(s) • Click a button to vote (you can change your vote)` });

}

function buildPollRow(pollId, optionCount) {

    const buttons = [];

    for (let i = 0; i < optionCount; i++) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`poll:${pollId}:${i}`)
                .setLabel(OPTION_LETTERS[i])
                .setStyle(ButtonStyle.Primary)
        );
    }

    return new ActionRowBuilder().addComponents(buttons);

}

module.exports = {

    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Create a quick poll with up to 5 options.")
        .addStringOption(opt =>
            opt.setName("question").setDescription("The poll question").setRequired(true))
        .addStringOption(opt =>
            opt.setName("option1").setDescription("Option A").setRequired(true))
        .addStringOption(opt =>
            opt.setName("option2").setDescription("Option B").setRequired(true))
        .addStringOption(opt =>
            opt.setName("option3").setDescription("Option C").setRequired(false))
        .addStringOption(opt =>
            opt.setName("option4").setDescription("Option D").setRequired(false))
        .addStringOption(opt =>
            opt.setName("option5").setDescription("Option E").setRequired(false)),

    async execute(interaction) {

        const question = interaction.options.getString("question");

        const options = [1, 2, 3, 4, 5]
            .map(n => interaction.options.getString(`option${n}`))
            .filter(Boolean);

        const pollId = String(nextPollId++);

        const poll = { question, options, votes: new Map() };
        polls.set(pollId, poll);

        await interaction.reply({
            embeds: [buildPollEmbed(poll)],
            components: [buildPollRow(pollId, options.length)]
        });

    },

    // Called from the central button handler
    async handleVote(interaction, pollId, optionIndex) {

        const poll = polls.get(pollId);

        if (!poll) {
            return interaction.reply({
                content: "This poll is no longer active (bot may have restarted).",
                flags: 64
            });
        }

        poll.votes.set(interaction.user.id, Number(optionIndex));

        await interaction.update({
            embeds: [buildPollEmbed(poll)],
            components: [buildPollRow(pollId, poll.options.length)]
        });

    }

};
