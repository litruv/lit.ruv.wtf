/** @type {Record<string, string>} */
const TYPE_COLORS = {
    exec:    "#ffffff",
    number:  "#3ee581",
    boolean: "#ff4f4f",
    string:  "#ff66ff",
    table:   "#5ec4ff",
    color:   "#5b8ef5",
    object:  "#64b5f6",
    any:     "#8c919d",
};

/**
 * Returns the CSS color for a given pin kind.
 *
 * @param {string} kind
 * @returns {string}
 */
export function getTypeColor(kind) {
    return TYPE_COLORS[kind] ?? TYPE_COLORS.any;
}
