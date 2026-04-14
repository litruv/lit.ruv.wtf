/**
 * @file NodeExecutionContext.js
 * Runtime context passed to node handlers during graph traversal.
 */

/**
 * @typedef {import('../GraphNode.js').GraphNode} GraphNode
 * @typedef {import('../GraphConnection.js').GraphConnection} GraphConnection
 * @typedef {import('../NodeRenderer.js').NodeRenderer} NodeRenderer
 */

/**
 * Provides controlled access to runtime execution services.
 * Passed to BlueprintCallable_Execute on every node handler invocation.
 */
export class NodeExecutionContext {
    /** @type {string} */
    #nodeId;

    /** @type {NodeRenderer} */
    #nodeRenderer;

    /** @type {(nodeId: string, pinId: string) => any} */
    #resolveInputFn;

    /** @type {(nodeId: string, pinId: string) => Promise<void>} */
    #runExecPinFn;

    /** @type {((nodeId: string, value: string) => void) | null} */
    #onPrint;

    /** @type {((connId: string, kind: string) => Promise<void>) | null} */
    #onStep;

    /**
     * @param {string} nodeId
     * @param {NodeRenderer} nodeRenderer
     * @param {(nodeId: string, pinId: string) => any} resolveInputFn
     * @param {(nodeId: string, pinId: string) => Promise<void>} runExecPinFn
     * @param {((nodeId: string, value: string) => void) | null} onPrint
     * @param {((connId: string, kind: string) => Promise<void>) | null} onStep
     */
    constructor(nodeId, nodeRenderer, resolveInputFn, runExecPinFn, onPrint, onStep) {
        this.#nodeId        = nodeId;
        this.#nodeRenderer  = nodeRenderer;
        this.#resolveInputFn = resolveInputFn;
        this.#runExecPinFn  = runExecPinFn;
        this.#onPrint       = onPrint;
        this.#onStep        = onStep;
    }

    /**
     * Returns the ID of the currently executing node.
     *
     * @UFUNCTION(BlueprintPure)
     * @returns {string}
     */
    BlueprintPure_GetNodeId() {
        return this.#nodeId;
    }

    /**
     * Returns the GraphNode data for the currently executing node.
     *
     * @UFUNCTION(BlueprintPure)
     * @returns {GraphNode | null}
     */
    BlueprintPure_GetNode() {
        return this.#nodeRenderer.getNodes().find(n => n.id === this.#nodeId) ?? null;
    }

    /**
     * Resolves the runtime value of a named input pin, following connections.
     *
     * @UFUNCTION(BlueprintPure)
     * @param {string} pinId
     * @returns {any}
     */
    BlueprintPure_ResolveInput(pinId) {
        return this.#resolveInputFn(this.#nodeId, pinId);
    }

    /**
     * Returns all live graph connections.
     *
     * @UFUNCTION(BlueprintPure)
     * @returns {GraphConnection[]}
     */
    BlueprintPure_GetConnections() {
        return this.#nodeRenderer.getConnections();
    }

    /**
     * Triggers exec flow from an output pin on this node.
     *
     * @UFUNCTION(BlueprintCallable)
     * @param {string} pinId
     * @returns {Promise<void>}
     */
    BlueprintCallable_RunExecPin(pinId) {
        return this.#runExecPinFn(this.#nodeId, pinId);
    }

    /**
     * Fires the print callback with a string value.
     *
     * @UFUNCTION(BlueprintCallable)
     * @param {string} value
     */
    BlueprintCallable_Print(value) {
        this.#onPrint?.(this.#nodeId, value);
    }
}
