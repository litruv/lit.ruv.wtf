/**
 * @file ButtonNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Renders a play button in the header that triggers node execution.
 */
export class ButtonNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "button";

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     * @param {import('./NodeRenderContext.js').NodeRenderContext} renderCtx
     */
    BlueprintNativeEvent_OnRender(article, graphNode, renderCtx) {
        const header = article.querySelector(".node-header");
        if (!header) return;

        const btn = document.createElement("button");
        btn.className = "node-run-btn";
        btn.title = "Execute";
        btn.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden="true"><polygon points="1,0 9,4.5 1,9"/></svg>`;

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            renderCtx.BlueprintCallable_TriggerNodeExecute(graphNode.id);
            btn.classList.add("node-run-btn--flash");
            btn.addEventListener("animationend", () => btn.classList.remove("node-run-btn--flash"), { once: true });
        });

        header.appendChild(btn);
    }
}

NodeRegistry.UCLASS_Register(ButtonNode);
