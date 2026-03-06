/**
 * About command - Information about this terminal
 */
export default {
    description: 'About this terminal',
    execute: (term, writeClickable, VERSION) => {
        return [
            '',
            '╔════════════════════════════════════════════════════════════╗',
            '║                   LIT.RUV.WTF TERMINAL                     ║',
            '╚════════════════════════════════════════════════════════════╝',
            '',
            '  A classic terminal interface built with xterm.js',
            '  Features: Keyboard navigation, Mouse support, CRT effects',
            '  Version: ' + VERSION,
            '  Built: ' + new Date().getFullYear(),
            '',
            '  Technologies:',
            '    • xterm.js - Terminal emulator',
            '    • JavaScript - Terminal logic',
            '    • CSS3 - Classic CRT styling',
            ''
        ].join('\r\n');
    }
};
