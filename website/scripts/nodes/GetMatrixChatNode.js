/**
 * @file GetMatrixChatNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';
import { GlobalVariables } from '../GlobalVariables.js';

/**
 * @UCLASS(BlueprintType)
 * Pure getter node that exposes the "MatrixChat" global as an object output.
 * Styled with a semi-transparent blue header to visually denote a variable getter.
 */
export class GetMatrixChatNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "get_matrix_chat";

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     */
    BlueprintNativeEvent_OnRender(article, graphNode) {
        const header = article.querySelector(".node-header");
        if (header) {
            header.style.background   = "rgba(100, 181, 246, 0.2)";
            header.style.borderColor  = "rgba(100, 181, 246, 0.4)";
        }

        const outputPin = graphNode.outputs.find(p => p.id === "value");
        if (outputPin && GlobalVariables.has("MatrixChat")) {
            outputPin.defaultValue = GlobalVariables.get("MatrixChat");
        }
    }
}

NodeRegistry.UCLASS_Register(GetMatrixChatNode);
