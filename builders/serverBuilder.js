const createRoles = require("./roles");
const createCategories = require("./categories");
const createChannels = require("./channels");
const postPanels = require("./panels");
const logger = require("../utils/logger");

module.exports = async (guild) => {

    console.log(`\nBuilding server: ${guild.name}`);

    await createRoles(guild);

    const categories = await createCategories(guild);

    const channelsByName = await createChannels(guild, categories);

    await postPanels(guild, channelsByName);

    logger.done();

};
