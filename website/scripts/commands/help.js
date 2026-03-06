/**
 * Help command - Display available commands
 */
export default {
    description: 'Display available commands',
    execute: (term, writeClickable) => {
        term.writeln('');
        term.writeln('╔════════════════════════════════════════════════════════════╗');
        term.writeln('║                    AVAILABLE COMMANDS                      ║');
        term.writeln('╚════════════════════════════════════════════════════════════╝');
        term.writeln('');
        writeClickable('  [command=help]      - Display this help message');
        writeClickable('  [command=about]     - Information about this terminal');
        writeClickable('  [command=clear]     - Clear the terminal screen');
        term.writeln('  echo      - Echo back your message (usage: echo [message])');
        writeClickable('  [command=date]      - Display current date and time');
        writeClickable('  [command=whoami]    - Display current user information');
        writeClickable('  [command=history]   - Show command history');
        writeClickable('  [command=color]     - Change terminal color scheme');
        writeClickable('  [command=banner]    - Display welcome banner');
        writeClickable('  [command=bluesky]   - Fetch recent posts from Bluesky');
        writeClickable('  [command=chat]      - Enter interactive chat (type /quit to exit)');
        writeClickable('  [command=github]    - Visit GitHub repository');
        writeClickable('  [command=contact]   - Display contact information');
        writeClickable('  [command=privacy]   - Display privacy policy');
        term.writeln('');
        term.writeln('Navigate: Use ↑/↓ arrows for command history');
        term.writeln('Mouse:    Click commands to run them');
        term.writeln('');
        return null;
    }
};
