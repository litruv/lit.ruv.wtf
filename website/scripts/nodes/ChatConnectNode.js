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
     * @UFUNCTION(BlueprintPure)
     */
    static BlueprintPure_GetDefaultPins() {
        return {
            inputs: [
                { id: 'exec_in', name: '', direction: 'input', kind: 'exec' }
            ],
            outputs: [
                { id: 'exec_out', name: '', direction: 'output', kind: 'exec' },
                { id: 'on_message', name: 'On Message', direction: 'output', kind: 'exec' },
                { id: 'message', name: 'Message', direction: 'output', kind: 'string' }
            ]
        };
    }

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
