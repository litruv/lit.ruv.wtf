/**
 * @file LottieNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Renders a Lottie animation JSON file inside a node body using the
 * `<lottie-player>` web component (loaded via CDN in index.html).
 * Set `lottieSrc` on the graph node data to point at a Lottie JSON file.
 */
export class LottieNode extends NodeBase {
    /** @type {string} */
    static NodeType = "lottie";

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
     */
    BlueprintNativeEvent_OnRender(article, graphNode) {
        if (!graphNode.lottieSrc) return;

        const body = document.createElement("div");
        body.className = "node-body node-body--lottie";

        const player = document.createElement("lottie-player");
        player.setAttribute("src", graphNode.lottieSrc);
        player.setAttribute("background", "transparent");
        player.setAttribute("speed", "1");
        player.setAttribute("loop", "");
        player.setAttribute("autoplay", "");
        player.className = "node-lottie";

        body.appendChild(player);
        article.appendChild(body);
    }
}

NodeRegistry.UCLASS_Register(LottieNode);
