/**
 * @file PureNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Pure data node — optionally renders an image body. No exec logic.
 */
export class PureNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "pure";

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     */
    BlueprintNativeEvent_OnRender(article, graphNode) {
        if (!graphNode.imageSrc) return;

        const body = document.createElement("div");
        body.className = "node-body node-body--image";

        const img = document.createElement("img");
        img.src = graphNode.imageSrc;
        img.alt = "";
        img.className = "node-image";
        body.appendChild(img);

        article.appendChild(body);
    }
}

NodeRegistry.UCLASS_Register(PureNode);
