/**
 * @typedef {Object} PinDescriptor
 * @property {string} id Unique pin identifier scoped to the node.
 * @property {string} name Display name.
 * @property {('input'|'output')} direction Pin direction.
 * @property {('exec'|'number'|'boolean'|'string'|'table'|'any'|'color')} kind Pin type kind.
 * @property {string} [defaultValue] Optional default value displayed inline for string/number-kind pins.
 * @property {number} [min] Optional minimum value for number pins.
 * @property {number} [max] Optional maximum value for number pins.
 */

/**
 * Represents a blueprint node instance.
 */
export class GraphNode {
    /**
     * @param {{ id: string, type: string, title: string, position: {x:number,y:number}, width?: number, inputs: PinDescriptor[], outputs: PinDescriptor[], markdownSrc?: string, imageSrc?: string, lottieSrc?: string, focusOptions?: { paddingFraction?: number, durationMs?: number, minWorldBox?: { width: number, height: number }, responsiveWorldBox?: { minViewportWidth: number, minWorldBox: { width: number, height: number }, anchorX?: number, anchorY?: number } | Array<{ minViewportWidth: number, minWorldBox: { width: number, height: number }, anchorX?: number, anchorY?: number }>, anchorX?: number, anchorY?: number } }} init
     */
    constructor(init) {
        this.id = init.id;
        this.type = init.type;
        this.title = init.title;
        this.position = { ...init.position };
        /** @type {number | undefined} */
        this.width = init.width;
        this.inputs = init.inputs.map(p => ({ ...p }));
        this.outputs = init.outputs.map(p => ({ ...p }));
        /** @type {string | undefined} */
        this.markdownSrc = init.markdownSrc;
        /** @type {string | undefined} */
        this.imageSrc = init.imageSrc;
        /** @type {string | undefined} */
        this.lottieSrc = init.lottieSrc;
        /** @type {{ paddingFraction?: number, durationMs?: number, minWorldBox?: { width: number, height: number }, anchorX?: number, anchorY?: number } | undefined} */
        this.focusOptions = init.focusOptions;
    }

    /**
     * @param {string} pinId
     * @returns {PinDescriptor | undefined}
     */
    getPin(pinId) {
        return [...this.inputs, ...this.outputs].find(p => p.id === pinId);
    }
}
