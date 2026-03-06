/**
 * Whoami command - Display user information
 */
export default {
    description: 'Display user information',
    execute: () => {
        return [
            '',
            '  User: visitor@lit.ruv.wtf',
            '  Session: ' + Date.now(),
            '  Terminal: xterm.js',
            ''
        ].join('\r\n');
    }
};
