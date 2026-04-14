/**
 * @file SequenceNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Fires all then_N outputs in order, then continues exec flow.
 */
export class SequenceNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "sequence";

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {import('./NodeExecutionContext.js').NodeExecutionContext} ctx
     */
    async BlueprintCallable_Execute(ctx) {
        const node = ctx.BlueprintPure_GetNode();
        if (!node) return;

        // Fire every then_N output in order
        const thenPins = node.outputs
            .filter(p => p.id.startsWith("then_"))
            .sort((a, b) => a.id.localeCompare(b.id));

        for (const pin of thenPins) {
            await ctx.BlueprintCallable_RunExecPin(pin.id);
        }
    }
}

NodeRegistry.UCLASS_Register(SequenceNode);
