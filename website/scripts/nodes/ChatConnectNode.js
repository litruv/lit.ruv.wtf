/**
 * @file ChatConnectNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Calls connect() on a ChatNode instance received via the target input.
 */
export class ChatConnectNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "chat_connect";

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {import('./NodeExecutionContext.js').NodeExecutionContext} ctx
     */
    async BlueprintCallable_Execute(ctx) {
        const chatInstance = ctx.BlueprintPure_ResolveInput("target");
        if (chatInstance && typeof chatInstance.connect === "function") {
            chatInstance.connect();
        }
    }
}

NodeRegistry.UCLASS_Register(ChatConnectNode);
