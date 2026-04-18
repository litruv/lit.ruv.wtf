/**
 * @file BindEventNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Binds the OnMessage event on a ChatNode. When a message arrives, updates
 * the username/message output pins and fires the event_out exec pin.
 */
export class BindEventNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "bind_event";

    /**
     * @UFUNCTION(BlueprintPure)
     */
    static BlueprintPure_GetDefaultPins() {
        return {
            inputs: [
                { id: 'exec_in', name: '', direction: 'input', kind: 'exec' },
                { id: 'event_name', name: 'Event', direction: 'input', kind: 'string', defaultValue: 'click' }
            ],
            outputs: [
                { id: 'exec_out', name: '', direction: 'output', kind: 'exec' }
            ]
        };
    }

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {import('./NodeExecutionContext.js').NodeExecutionContext} ctx
     */
    async BlueprintCallable_Execute(ctx) {
        const chatInstance = ctx.BlueprintPure_ResolveInput("target");
        const node         = ctx.BlueprintPure_GetNode();

        if (!chatInstance || typeof chatInstance.setOnMessage !== "function" || !node) return;

        chatInstance.setOnMessage((username, message) => {
            const usernamePin = node.outputs.find(p => p.id === "username");
            const messagePin  = node.outputs.find(p => p.id === "message");
            if (usernamePin) usernamePin.defaultValue = username;
            if (messagePin)  messagePin.defaultValue  = message;

            // Fire event_out — async, fire-and-forget
            ctx.BlueprintCallable_RunExecPin("event_out").catch(console.error);
        });
    }
}

NodeRegistry.UCLASS_Register(BindEventNode);
