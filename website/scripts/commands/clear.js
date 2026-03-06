/**
 * Clear command - Clear terminal screen
 */
export default {
    description: 'Clear terminal screen',
    execute: (term) => {
        term.clear();
        return null;
    }
};
