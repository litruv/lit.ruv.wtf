/**
 * @file NodeRegistry.js
 * Static registry mapping node type strings to their handler instances.
 */

import { NodeBase } from './NodeBase.js';

/**
 * Static registry for all Blueprint node types.
 * Node classes self-register by calling UCLASS_Register during module init.
 */
export class NodeRegistry {
    /** @type {Map<string, NodeBase>} */
    static #registry = new Map();

    /**
     * Registers a node class by its static NodeType.
     * Call once per class, typically at the bottom of the class file.
     *
     * @UFUNCTION(BlueprintCallable)
     * @param {typeof NodeBase} NodeClass
     */
    static UCLASS_Register(NodeClass) {
        if (!NodeClass.NodeType) {
            throw new Error(`[NodeRegistry] "${NodeClass.name}" is missing a static NodeType.`);
        }
        this.#registry.set(NodeClass.NodeType, new NodeClass());
    }

    /**
     * Returns the handler instance for a given node type, or null.
     *
     * @UFUNCTION(BlueprintPure)
     * @param {string} nodeType
     * @returns {NodeBase | null}
     */
    static BlueprintPure_Get(nodeType) {
        return this.#registry.get(nodeType) ?? null;
    }

    /**
     * Returns all currently registered type strings.
     *
     * @UFUNCTION(BlueprintPure)
     * @returns {string[]}
     */
    static BlueprintPure_GetRegisteredTypes() {
        return [...this.#registry.keys()];
    }

    /**
     * Returns default pin configuration for a node type by delegating to the node class.
     *
     * @UFUNCTION(BlueprintPure)
     * @param {string} nodeType
     * @returns {{ inputs: Array<{id: string, name: string, direction: string, kind: string, defaultValue?: string}>, outputs: Array<{id: string, name: string, direction: string, kind: string}> }}
     */
    static BlueprintPure_GetDefaultPins(nodeType) {
        const handler = this.BlueprintPure_Get(nodeType);
        if (!handler) {
            return { inputs: [], outputs: [] };
        }
        return handler.constructor.BlueprintPure_GetDefaultPins();
    }
}
