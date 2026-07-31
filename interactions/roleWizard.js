const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const config = require("../config/serverConfig");
const { logAction } = require("../features/logging");

const CONTINUE_ACTION = "__continue";

// Per-user, per-step in-progress selections for the toggle (checkbox)
// steps (Notification, Game). Cleared once the user presses Continue/Finish.
// userId -> { [stepIndex]: Set(roleName) }
const wizardState = new Map();

function getSteps() {
    return config.roleWizard.steps;
}

function getUserStepSet(userId, stepIndex, member) {

    if (!wizardState.has(userId)) wizardState.set(userId, {});
    const userState = wizardState.get(userId);

    if (!userState[stepIndex]) {

        const step = getSteps()[stepIndex];

        // Seed with whatever the member already holds, so re-opening the
        // step shows their existing picks checked.
        userState[stepIndex] = new Set(
            step.roles.filter(roleName =>
                member.roles.cache.some(r => r.name === roleName)
            )
        );

    }

    return userState[stepIndex];

}

function buildStepEmbed(stepIndex) {

    const step = getSteps()[stepIndex];

    return new EmbedBuilder()
        .setTitle(step.title)
        .setDescription(step.description)
        .setColor(step.color)
        .setFooter({ text: `Step ${stepIndex + 1} of ${getSteps().length} • infocore-panel:wizard` });

}

function buildStepComponents(stepIndex, member) {

    const step = getSteps()[stepIndex];

    const buttons = step.roles.map(roleName => {

        let style = ButtonStyle.Secondary;

        if (!step.exclusive && member) {

            const selected = getUserStepSet(member.id, stepIndex, member).has(roleName);
            style = selected ? ButtonStyle.Success : ButtonStyle.Secondary;

        }

        return new ButtonBuilder()
            .setCustomId(`wizard:${stepIndex}:${encodeURIComponent(roleName)}`)
            .setLabel(roleName)
            .setStyle(style);

    });

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    if (!step.exclusive) {

        const isLastStep = stepIndex === getSteps().length - 1;

        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`wizard:${stepIndex}:${CONTINUE_ACTION}`)
                .setLabel(isLastStep ? "Finish ✅" : "Continue ▶")
                .setStyle(ButtonStyle.Primary)
        ));

    }

    return rows;

}

function buildCompletionMessage() {

    return {
        embeds: [
            new EmbedBuilder()
                .setTitle("🎉 All set!")
                .setDescription("Your roles are saved. You can run the wizard again any time from the buttons in #role-select.")
                .setColor(0x2ECC71)
        ],
        components: []
    };

}

async function applyExclusiveChoice(guild, member, step, roleName) {

    const role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) return;

    const otherRoleIds = step.roles
        .filter(r => r !== roleName)
        .map(r => guild.roles.cache.find(gr => gr.name === r)?.id)
        .filter(Boolean)
        .filter(id => member.roles.cache.has(id));

    if (otherRoleIds.length) {
        await member.roles.remove(otherRoleIds).catch(() => {});
    }

    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => {});
    }

}

async function applyToggleSelections(guild, member, step, selectedSet) {

    for (const roleName of step.roles) {

        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) continue;

        const shouldHave = selectedSet.has(roleName);
        const has = member.roles.cache.has(role.id);

        if (shouldHave && !has) await member.roles.add(role).catch(() => {});
        if (!shouldHave && has) await member.roles.remove(role).catch(() => {});

    }

}

/**
 * Renders the first step (Year Level) for posting into #role-select.
 * Exported separately so builders/panels.js can post it during /setup
 * without needing a specific member (it's a shared, public message).
 */
function buildFirstStepMessage() {

    return {
        embeds: [buildStepEmbed(0)],
        components: buildStepComponents(0, null)
    };

}

async function handleWizardButton(interaction) {

    const [, stepIndexStr, action] = interaction.customId.split(":");
    const stepIndex = Number(stepIndexStr);
    const steps = getSteps();
    const step = steps[stepIndex];

    if (!step) return;

    const guild = interaction.guild;
    const member = interaction.member;
    const isPublicEntryPoint = stepIndex === 0;

    // ── Exclusive (radio-button) steps: Year Level, Program ────────────
    if (step.exclusive) {

        const roleName = decodeURIComponent(action);
        await applyExclusiveChoice(guild, member, step, roleName);

        const nextIndex = stepIndex + 1;
        const payload = nextIndex < steps.length
            ? { embeds: [buildStepEmbed(nextIndex)], components: buildStepComponents(nextIndex, member), flags: 64 }
            : { ...buildCompletionMessage(), flags: 64 };

        if (isPublicEntryPoint) {
            // Public message stays untouched for the next visitor; reply
            // to this user privately with the next step.
            await interaction.reply(payload);
        } else {
            await interaction.update(payload);
        }

        await logAction(guild, {
            title: "🎭 Role Selected",
            description: `${member} picked **${roleName}** (${step.title})`,
            color: 0x99AAB5
        });

        return;

    }

    // ── Toggle (checkbox) steps: Notification Roles, Game Roles ────────
    if (action === CONTINUE_ACTION) {

        const selected = getUserStepSet(member.id, stepIndex, member);
        await applyToggleSelections(guild, member, step, selected);

        wizardState.get(member.id)[stepIndex] = undefined;

        const nextIndex = stepIndex + 1;
        const payload = nextIndex < steps.length
            ? { embeds: [buildStepEmbed(nextIndex)], components: buildStepComponents(nextIndex, member) }
            : buildCompletionMessage();

        await interaction.update(payload);

        await logAction(guild, {
            title: "🎭 Roles Saved",
            description: `${member} finished **${step.title}**: ${[...selected].join(", ") || "(none selected)"}`,
            color: 0x99AAB5
        });

        return;

    }

    // Toggling an individual role button within a checkbox step
    const roleName = decodeURIComponent(action);
    const set = getUserStepSet(member.id, stepIndex, member);

    if (set.has(roleName)) set.delete(roleName);
    else set.add(roleName);

    await interaction.update({
        embeds: [buildStepEmbed(stepIndex)],
        components: buildStepComponents(stepIndex, member)
    });

}

module.exports = { buildFirstStepMessage, handleWizardButton };
