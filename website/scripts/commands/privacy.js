/**
 * Privacy command - Privacy policy
 */
export default {
    description: 'Privacy policy',
    execute: () => {
        return [
            '',
            '╔════════════════════════════════════════════════════════════╗',
            '║                      PRIVACY POLICY                        ║',
            '╚════════════════════════════════════════════════════════════╝',
            '',
            '  Data Collection:',
            '  ────────────────',
            '  • This terminal uses localStorage to save your chat session',
            '  • Chat messages are stored on our Matrix homeserver',
            '  • No cookies or tracking scripts are used',
            '  • No analytics or third-party tracking',
            '',
            '  Matrix Chat:',
            '  ────────────',
            '  • Chat credentials stored locally in your browser',
            '  • Messages sent through Matrix protocol (b.ruv.wtf)',
            '  • Use "chat disconnect" to clear stored credentials',
            '',
            '  Your Rights:',
            '  ────────────',
            '  • Clear localStorage anytime via browser settings',
            '  • Request data deletion: contact@lit.ruv.wtf',
            '  • All code is open source and auditable',
            '',
            '  Updates: Privacy policy last updated March 2026',
            ''
        ].join('\r\n');
    }
};
