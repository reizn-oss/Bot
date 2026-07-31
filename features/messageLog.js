const { logAction } = require("./logging");

async function handleMessageDelete(message) {

    if (!message.guild || message.author?.bot) return;

    await logAction(message.guild, {
        title: "🗑️ Message Deleted",
        description: `In ${message.channel}`,
        color: 0xED4245,
        fields: [
            { name: "Author", value: `${message.author ?? "Unknown"}` },
            { name: "Content", value: message.content?.slice(0, 500) || "(no text content / not cached)" }
        ]
    });

}

async function handleMessageUpdate(oldMessage, newMessage) {

    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    await logAction(newMessage.guild, {
        title: "✏️ Message Edited",
        description: `In ${newMessage.channel} — [jump to message](${newMessage.url})`,
        color: 0xFEE75C,
        fields: [
            { name: "Author", value: `${newMessage.author}` },
            { name: "Before", value: oldMessage.content?.slice(0, 400) || "(not cached)" },
            { name: "After", value: newMessage.content?.slice(0, 400) || "(empty)" }
        ]
    });

}

module.exports = { handleMessageDelete, handleMessageUpdate };
