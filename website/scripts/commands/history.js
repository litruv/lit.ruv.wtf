/**
 * History command - Show command history
 */
export default {
    description: 'Show command history',
    execute: (term, writeClickable, VERSION, args, commandHistory) => {
        if (commandHistory.length === 0) {
            return '\r\n  No command history yet.\r\n';
        }
        let output = ['\r\n  Command History:', '  ───────────────'];
        commandHistory.forEach((cmd, idx) => {
            output.push(`  ${(idx + 1).toString().padStart(3, ' ')}  ${cmd}`);
        });
        output.push('');
        return output.join('\r\n');
    }
};
