/**
 * @file InfoNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Renders a markdown body below the node header.
 */
export class InfoNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "info";

    /**
     * @UFUNCTION(BlueprintPure)
     */
    static BlueprintPure_GetDefaultPins() {
        return {
            inputs: [],
            outputs: []
        };
    }

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     * @param {import('./NodeRenderContext.js').NodeRenderContext} renderCtx
     */
    BlueprintNativeEvent_OnRender(article, graphNode, renderCtx) {
        if (!graphNode.markdownSrc) return;

        const body = document.createElement("div");
        body.className = "node-body";
        body.setAttribute("aria-live", "polite");
        article.appendChild(body);

        renderCtx.BlueprintCallable_LoadMarkdown(graphNode.markdownSrc, body);
    }
}

NodeRegistry.UCLASS_Register(InfoNode);
