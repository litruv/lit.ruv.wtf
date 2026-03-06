/**
 * Echo command - Echo back message
 */
export default {
    description: 'Echo back message',
    execute: (term, writeClickable, VERSION, args) => {
        return args.join(' ') || '';
    }
};
