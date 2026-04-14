/**
 * @typedef {{ nodeId: string, pinId: string }} PinRef
 */

/**
 * Represents a directional connection between two node pins.
 */
export class GraphConnection {
    /**
     * @param {PinRef} from Output pin reference.
     * @param {PinRef} to Input pin reference.
     * @param {string} kind Pin type kind.
     * @param {string} [id]
     */
    constructor(from, to, kind, id) {
        this.id = id ?? (globalThis.crypto?.randomUUID?.() ?? `conn_${Math.random().toString(36).slice(2, 10)}`);
        this.from = { ...from };
        this.to = { ...to };
        this.kind = kind;
    }
}
