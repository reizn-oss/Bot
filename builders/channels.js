const { ChannelType, ForumLayoutType } = require("discord.js");

const config = require("../config/serverConfig");
const logger = require("../utils/logger");
const {
    buildPublicChannelOverwrites,
    denyThreadsForEveryone,
    restrictChatTo,
    buildViewRestrictedOverwrites,
    buildRoleGatedOverwrites,
    getOverwritesFor
} = require("./permissions");

// Channel entries can be a plain string ("rules") or an object with any mix
// of these overrides — see the big comment above config.categories in
// config/serverConfig.js for what each one does.
function normalizeChannel(entry) {
    return typeof entry === "string" ? { name: entry } : entry;
}

// Computes the permission overwrite array for one channel, or `undefined`
// if it should just inherit its category's permissions untouched (that
// inherited case still gets the thread denial for free, since it's applied
// at the category level in builders/categories.js).
function computeChannelOverwrites(guild, cat, channelConfig) {

    const { public: isPublicOverride, chatRestrictedTo, viewRestrictedTo, gateRole } = channelConfig;
    const needsPublicOverwrite = isPublicOverride && !cat.public;

    let overwrites;

    if (viewRestrictedTo) {

        overwrites = buildViewRestrictedOverwrites(guild, viewRestrictedTo);

    } else if (gateRole) {

        overwrites = buildRoleGatedOverwrites(guild, gateRole);

    } else if (chatRestrictedTo) {

        const base = needsPublicOverwrite ? buildPublicChannelOverwrites(guild) : getOverwritesFor(guild, cat);
        overwrites = restrictChatTo(guild, base, chatRestrictedTo);

    } else if (needsPublicOverwrite) {

        overwrites = buildPublicChannelOverwrites(guild);

    } else {

        overwrites = undefined;

    }

    // Threads are blocked everywhere. Channels inheriting from their
    // category (overwrites still undefined here) already get this for
    // free at the category level.
    if (overwrites) {
        overwrites = denyThreadsForEveryone(guild, overwrites);
    }

    return overwrites;

}

module.exports = async (guild, categories) => {

    logger.step("Creating Channels...");

    const channelsByName = {};

    // Text channels inside each configured category
    for (const cat of config.categories) {

        const category = categories[cat.name];

        for (const rawChannel of cat.channels) {

            const channelConfig = normalizeChannel(rawChannel);
            const { name: channelName, forum: isForum, tags } = channelConfig;

            const overwrites = computeChannelOverwrites(guild, cat, channelConfig);
            const needsExplicitOverwrite = !!overwrites;

            try {

                let channel = guild.channels.cache.find(c =>
                    c.name === channelName &&
                    c.parentId === category.id
                );

                if (channel) {

                    // Discord's API has no way to convert a channel's type
                    // after creation (text <-> forum). If the config now
                    // wants a Forum channel but this one was created as
                    // plain text (or vice versa), warn instead of silently
                    // leaving it wrong — delete the channel manually and
                    // re-run /setup to have it recreated with the right
                    // type and tags.
                    const wantsForum = !!isForum;
                    const isActuallyForum = channel.type === ChannelType.GuildForum;

                    if (wantsForum !== isActuallyForum) {
                        logger.warn(
                            `"${channelName}" exists as a ${isActuallyForum ? "Forum" : "Text"} channel but ` +
                            `config now expects a ${wantsForum ? "Forum" : "Text"} channel. Discord can't convert ` +
                            `channel types — delete "${channelName}" in Discord and re-run /setup to recreate it correctly.`
                        );
                    }

                    logger.skip(channelName);

                    // Re-sync permissions on every run so a channel that's
                    // newly flagged (public / chatRestrictedTo /
                    // viewRestrictedTo / gateRole), or un-flagged, stays
                    // correct.
                    if (needsExplicitOverwrite) {
                        await channel.permissionOverwrites.set(overwrites);
                    }

                } else {

                    channel = await guild.channels.create({
                        name: channelName,
                        type: isForum ? ChannelType.GuildForum : ChannelType.GuildText,
                        parent: category.id,
                        // No permissionOverwrites -> Discord syncs this
                        // channel's permissions with its parent category.
                        // Flagged channels get explicit overwrites instead.
                        permissionOverwrites: overwrites,
                        ...(isForum ? {
                            defaultForumLayout: ForumLayoutType.GalleryView,
                            availableTags: (tags || []).map(name => ({ name }))
                        } : {})
                    });

                    logger.success(channelName);

                }

                channelsByName[channelName] = channel;

            } catch (err) {

                throw new Error(`Failed to create channel "${channelName}": ${err.message}`);

            }

        }

    }

    // Voice channels that live inside their own category (e.g. per-game
    // voice channels under 🎮 GAMING — these can carry a gateRole too, same
    // as their text-channel counterparts)
    for (const cat of config.categories) {

        if (!cat.voiceChannels) continue;

        const category = categories[cat.name];

        for (const rawVoice of cat.voiceChannels) {

            const voiceConfig = normalizeChannel(rawVoice);
            const { name: voiceName, gateRole } = voiceConfig;

            const overwrites = gateRole ? buildRoleGatedOverwrites(guild, gateRole) : undefined;

            try {

                let channel = guild.channels.cache.find(c =>
                    c.name === voiceName &&
                    c.parentId === category.id
                );

                if (channel) {

                    logger.skip(voiceName);

                    if (overwrites) {
                        await channel.permissionOverwrites.set(overwrites);
                    }

                    continue;

                }

                await guild.channels.create({
                    name: voiceName,
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    permissionOverwrites: overwrites
                });

                logger.success(voiceName);

            } catch (err) {

                throw new Error(`Failed to create voice channel "${voiceName}": ${err.message}`);

            }

        }

    }

    // Voice channels inside the dedicated voice category
    const voiceCategory = categories[config.voiceCategory];

    for (const voiceName of config.voiceChannels) {

        try {

            const exists = guild.channels.cache.find(c =>
                c.name === voiceName &&
                c.parentId === voiceCategory.id
            );

            if (exists) {
                logger.skip(voiceName);
                continue;
            }

            await guild.channels.create({
                name: voiceName,
                type: ChannelType.GuildVoice,
                parent: voiceCategory.id
            });

            logger.success(voiceName);

        } catch (err) {

            throw new Error(`Failed to create voice channel "${voiceName}": ${err.message}`);

        }

    }

    return channelsByName;

};
