/**
 * @file NodeBase.js
 * Abstract base class for all Blueprint graph node types.
 *
 * Method prefixes mirror Unreal Engine UFUNCTION macro conventions:
 *   BlueprintNativeEvent_  — has a native default implementation; subclasses may override
 *   BlueprintCallable_     — has exec-pin side effects; called during graph traversal
 *   BlueprintPure_         — side-effect free; does not advance exec flow
 */

/**
 * @typedef {import('../GraphNode.js').GraphNode} GraphNode
 * @typedef {import('./NodeRenderContext.js').NodeRenderContext} NodeRenderContext
 * @typedef {import('./NodeExecutionContext.js').NodeExecutionContext} NodeExecutionContext
 */

/**
 * @UCLASS(Abstract)
 * Base class all node handlers inherit from. Registered via NodeRegistry.
 */
export class NodeBase {
    /**
     * The graph type string that maps to this class in the registry.
     * Must be overridden by every subclass.
     * @UCLASS(BlueprintType)
     * @type {string}
     */
    static NodeType = "";

    /**
     * Called after the node's base DOM (header, pins) has been built.
     * Override to inject type-specific UI into the article element.
     *
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {GraphNode} graphNode
     * @param {NodeRenderContext} renderCtx
     */
    // eslint-disable-next-line no-unused-vars
    BlueprintNativeEvent_OnRender(article, graphNode, renderCtx) {}

    /**
     * Called when this node is reached during exec graph traversal.
     * Override to implement node-specific behaviour.
     * Exec flow continues automatically after this returns.
     *
     * @UFUNCTION(BlueprintCallable)
     * @param {NodeExecutionContext} ctx
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line no-unused-vars
    async BlueprintCallable_Execute(ctx) {}
}
