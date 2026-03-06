/**
 * Contact command - Contact information
 */
export default {
    description: 'Contact information',
    execute: () => {
        return [
            '',
            '  Contact Information:',
            '  ────────────────────',
            '  Email: contact@lit.ruv.wtf',
            '  Web:   https://lit.ruv.wtf',
            ''
        ].join('\r\n');
    }
};
