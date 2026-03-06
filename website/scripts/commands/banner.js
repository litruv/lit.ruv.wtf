/**
 * Banner command - Display welcome banner
 */
export default {
    description: 'Display welcome banner',
    execute: (term, writeClickable, VERSION, args, commandHistory, welcomeBannerFull, welcomeBannerCompact, welcomeBannerMinimal) => {
        const cols = term.cols;
        if (cols >= 78) {
            term.writeln(welcomeBannerFull.split('\r\n').slice(0, -3).join('\r\n'));
            writeClickable('  Type [command=help] for available commands.');
            term.writeln('  Use ↑/↓ arrows to navigate command history.');
            term.writeln('');
        } else if (cols >= 40) {
            term.writeln(welcomeBannerCompact.split('\r\n').slice(0, -2).join('\r\n'));
            writeClickable('  Welcome! Type [command=help] for commands.');
            term.writeln('');
        } else {
            term.writeln(welcomeBannerMinimal.split('\r\n').slice(0, -2).join('\r\n'));
            writeClickable('  Type [command=help]');
            term.writeln('');
        }
        return null;
    }
};
