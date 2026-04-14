/**
 * @file PrintNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Logs a string value and fires it through the print callback.
 */
export class PrintNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "print";

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {import('./NodeExecutionContext.js').NodeExecutionContext} ctx
     */
    async BlueprintCallable_Execute(ctx) {
        const value = ctx.BlueprintPure_ResolveInput("value");
        ctx.BlueprintCallable_Print(value);
    }
}

NodeRegistry.UCLASS_Register(PrintNode);
