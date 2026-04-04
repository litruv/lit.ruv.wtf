/**
 * Donate command - Support the developer
 */
export default {
    description: 'Support via donation',
    execute: () => {
        return [
            '',
            '  If you enjoy what I do, consider buying me a iced coffee!',
            '',
            '  💳 Donate: https://donate.stripe.com/9AQdRv6ttfv40Ra289',
            '',
            '  Your support allows me to continue developing and maintaining my projects, and is greatly appreciated!',
            ''
        ].join('\r\n');
    }
};
