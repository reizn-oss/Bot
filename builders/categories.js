const { ChannelType } = require("discord.js");

const config = require("../config/serverConfig");
const logger = require("../utils/logger");
const { getOverwritesFor, denyThreadsForEveryone } = require("./permissions");

module.exports = async (guild) => {

    logger.step("Creating Categories...");

    const categories = {};

    // Regular + staff categories from config.categories
    for (const cat of config.categories) {

        try {

            let category = guild.channels.cache.find(c =>
                c.name === cat.name &&
                c.type === ChannelType.GuildCategory
            );

            // Threads are blocked everywhere, so every category gets the
            // thread denial layered on top of its normal gating.
            const overwrites = denyThreadsForEveryone(guild, getOverwritesFor(guild, cat));

            if (!category) {

                category = await guild.channels.create({
                    name: cat.name,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: overwrites
                });

                logger.success(cat.name);

            } else {

                // Category already exists — always re-sync so permission
                // changes (roles renamed, allowedRoles narrowed, etc.) and
                // the thread denial apply even to categories created by an
                // earlier version of /setup.
                await category.permissionOverwrites.set(overwrites);

                logger.skip(cat.name);

            }

            categories[cat.name] = category;

        } catch (err) {

            throw new Error(`Failed to create category "${cat.name}": ${err.message}`);

        }

    }

    // Dedicated category for voice channels
    try {

        let voiceCategory = guild.channels.cache.find(c =>
            c.name === config.voiceCategory &&
            c.type === ChannelType.GuildCategory
        );

        if (!voiceCategory) {

            voiceCategory = await guild.channels.create({
                name: config.voiceCategory,
                type: ChannelType.GuildCategory
            });

            logger.success(config.voiceCategory);

        } else {

            logger.skip(config.voiceCategory);

        }

        categories[config.voiceCategory] = voiceCategory;

    } catch (err) {

        throw new Error(`Failed to create category "${config.voiceCategory}": ${err.message}`);

    }

    return categories;

};
