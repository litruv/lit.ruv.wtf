/**
 * Color command - Change color scheme
 */
export default {
    description: 'Change color scheme',
    execute: (term, writeClickable, VERSION, args) => {
        const scheme = args[0] || '';
        const schemes = {
            green: { bg: '#001800', fg: '#00ff00', border: '#0f0' },
            amber: { bg: '#1a0f00', fg: '#ffb000', border: '#ffb000' },
            blue: { bg: '#000818', fg: '#00a0ff', border: '#00a0ff' },
            white: { bg: '#0a0a0a', fg: '#e0e0e0', border: '#999' }
        };
        
        if (!scheme || !schemes[scheme]) {
            return [
                '',
                '  Available color schemes:',
                '    • green  - Classic green terminal',
                '    • amber  - Amber monochrome',
                '    • blue   - IBM blue',
                '    • white  - White phosphor',
                '',
                '  Usage: color [scheme]',
                ''
            ].join('\r\n');
        }
        
        const colors = schemes[scheme];
        term.options.theme.background = colors.bg;
        term.options.theme.foreground = colors.fg;
        document.querySelector('.container').style.borderColor = colors.border;
        document.querySelector('.container').style.background = colors.bg;
        document.body.style.color = colors.fg;
        
        return `\r\n  Color scheme changed to: ${scheme}\r\n`;
    }
};
