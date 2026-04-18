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
     * @UFUNCTION(BlueprintPure)
     */
    static BlueprintPure_GetDefaultPins() {
        return {
            inputs: [
                { id: 'exec_in', name: '', direction: 'input', kind: 'exec' },
                { id: 'value', name: 'Value', direction: 'input', kind: 'string', defaultValue: 'Hello!' }
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
        const value = ctx.BlueprintPure_ResolveInput("value");
        ctx.BlueprintCallable_Print(value);
    }
}

NodeRegistry.UCLASS_Register(PrintNode);
