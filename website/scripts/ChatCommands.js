/**
 * Handles IRC-style slash commands for the chat node.
 */
export class ChatCommands {
    static COMMANDS = [
        { name: 'nick',    args: '<name>',           desc: 'Change display name',    aliases: [] },
        { name: 'help',    args: '',                 desc: 'Show command list',      aliases: [] },
    ];

    /**
     * @param {import('./ChatNode.js').ChatNode} chat
     */
    constructor(chat) {
        this.chat = chat;
    }

    get client() { return this.chat.getClient(); }

    /**
     * @param {string} message
     */
    async handle(message) {
        const parts = message.slice(1).split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        const aliasMap = new Map();
        for (const def of ChatCommands.COMMANDS) {
            aliasMap.set(def.name, def.name);
            for (const alias of def.aliases) aliasMap.set(alias, def.name);
        }

        const canonical = aliasMap.get(command);
        if (!canonical || typeof this[canonical] !== 'function') {
            this.chat.addErrorMessage(`Unknown command: /${command}. Type /help for commands.`);
            return;
        }
        await this[canonical](args);
    }

    async nick(args) {
        if (!args[0]) {
            this.chat.addErrorMessage('Usage: /nick NewNickname');
            return;
        }
        try {
            if (!await this.client.setDisplayName(args[0])) {
                throw new Error('Server refused');
            }
            this.chat.addSystemMessage(`Nickname changed to ${args[0]}`);
        } catch (e) {
            this.chat.addErrorMessage(`Failed to change nickname: ${e.message}`);
        }
    }

    help() {
        [
            '─── Commands ───────────────────────',
            'Profile: /nick <name>',
            '─────────────────────────────────────',
        ].forEach(l => this.chat.addSystemMessage(l));
    }
}
