/**
 * Date command - Display current date and time
 */
export default {
    description: 'Display current date and time',
    execute: () => {
        const now = new Date();
        return [
            '',
            '  ' + now.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            '  ' + now.toLocaleTimeString('en-US'),
            ''
        ].join('\r\n');
    }
};
