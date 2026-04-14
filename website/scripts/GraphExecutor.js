/**
 * @typedef {import('./NodeRenderer.js').NodeRenderer} NodeRenderer
 * @typedef {(nodeId: string, value: string) => void} PrintHandler
 * @typedef {(connId: string, kind: string) => Promise<void>} StepHandler
 */

import { GlobalVariables } from './GlobalVariables.js';
import { NodeRegistry, NodeExecutionContext } from './nodes/index.js';

/**
 * Walks exec connections from a starting output pin and runs node logic
 * for recognised node types (print, etc.).
 *
 * Execution is fully async — each exec hop awaits the optional onStep callback,
 * allowing callers to animate wires between steps.
 *
 * Resolution order for string values:
 *   1. The defaultValue on the output pin of the connected source node.
 *   2. The defaultValue on the input pin itself (unconnected fallback).
 */
export class GraphExecutor {
    /** @type {NodeRenderer} */
    #nodeRenderer;

    /** @type {PrintHandler | null} */
    #onPrint;

    /**
     * Called with (connId, kind) before traversing each connection.
     * Awaited for exec wires; fire-and-forget for data wires.
     *
     * @type {StepHandler | null}
     */
    #onStep;

    /**
     * @param {NodeRenderer} nodeRenderer
     * @param {PrintHandler | null} [onPrint] - Invoked when a print node executes.
     * @param {StepHandler | null} [onStep]   - Awaited when traversing exec connections.
     */
    constructor(nodeRenderer, onPrint = null, onStep = null) {
        this.#nodeRenderer = nodeRenderer;
        this.#onPrint      = onPrint;
        this.#onStep       = onStep;
    }

    // ─── Public ───────────────────────────────────────────────────────────────

    /**
     * Starts async execution from a node's exec output pin.
     *
     * @param {string} nodeId
     * @param {string} [pinId]
     * @returns {Promise<void>}
     */
    execute(nodeId, pinId = "exec_out") {
        return this.#runExecPin(nodeId, pinId);
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    /**
     * Follows a single exec output connection, animates it, then executes the target node.
     *
     * @param {string} nodeId
     * @param {string} pinId
     * @returns {Promise<void>}
     */
    async #runExecPin(nodeId, pinId) {
        const conn = this.#nodeRenderer.getConnections()
            .find(c => c.from.nodeId === nodeId && c.from.pinId === pinId);
        if (!conn) return;
        if (this.#onStep) await this.#onStep(conn.id, conn.kind);
        await this.#executeNode(conn.to.nodeId);
    }

    /**
     * Executes the logic for a single node then advances through exec_out.
     *
     * @param {string} nodeId
     * @returns {Promise<void>}
     */
    async #executeNode(nodeId) {
        const node = this.#nodeRenderer.getNodes().find(n => n.id === nodeId);
        if (!node) return;

        const ctx = new NodeExecutionContext(
            nodeId,
            this.#nodeRenderer,
            (nId, pId) => this.#resolveInput(nId, pId),
            (nId, pId) => this.#runExecPin(nId, pId),
            this.#onPrint,
            this.#onStep
        );

        const handler = NodeRegistry.BlueprintPure_Get(node.type);
        if (handler) {
            try {
                await handler.BlueprintCallable_Execute(ctx);
            } catch (error) {
                console.error(`[Node ${nodeId}] Execution error:`, error);
            }
        }

        // Always continue exec flow
        await this.#runExecPin(nodeId, "exec_out");
    }

    /**
     * Resolves an input value by following connections and handling special node types.
     *
     * @param {string} nodeId
     * @param {string} pinId
     * @returns {any}
     */
    #resolveInput(nodeId, pinId) {
        const conn = this.#nodeRenderer.getConnections().find(
            c => c.to.nodeId === nodeId && c.to.pinId === pinId
        );

        if (conn) {
            // Auto-flash data wire when a value is resolved (fire-and-forget)
            this.#onStep?.(conn.id, conn.kind);
            const sourceNode = this.#nodeRenderer.getNodes().find(n => n.id === conn.from.nodeId);
            const sourcePin  = sourceNode?.getPin(conn.from.pinId);

            if (sourceNode?.type === "get_matrix_chat" && conn.from.pinId === "value") {
                if (GlobalVariables.has("MatrixChat")) return GlobalVariables.get("MatrixChat");
            }

            if (sourceNode?.type === "random_name" && conn.from.pinId === "name") {
                return sourceNode._generatedName || "";
            }

            if (sourceNode?.type === "append" && conn.from.pinId === "result") {
                const input1 = this.#resolveInput(sourceNode.id, "input1");
                const input2 = this.#resolveInput(sourceNode.id, "input2");
                const input3 = this.#resolveInput(sourceNode.id, "input3");
                return input1 + input2 + input3;
            }

            if (sourcePin?.defaultValue != null) return sourcePin.defaultValue;
        }

        const node = this.#nodeRenderer.getNodes().find(n => n.id === nodeId);
        return node?.getPin(pinId)?.defaultValue ?? "";
    }
}
