/**
 * @file TimerNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Renders a toggle button in the header that starts/stops an interval timer.
 */
export class TimerNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "timer";

    /**
     * @UFUNCTION(BlueprintPure)
     */
    static BlueprintPure_GetDefaultPins() {
        return {
            inputs: [
                { id: 'interval', name: 'Interval (s)', direction: 'input', kind: 'number', defaultValue: '1', min: 0.1, max: 10 }
            ],
            outputs: [
                { id: 'exec_out', name: '', direction: 'output', kind: 'exec' }
            ]
        };
    }

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     * @param {import('./NodeRenderContext.js').NodeRenderContext} renderCtx
     */
    BlueprintNativeEvent_OnRender(article, graphNode, renderCtx) {
        const header = article.querySelector(".node-header");
        if (!header) return;

        const toggle = document.createElement("button");
        toggle.className = "node-timer-btn";
        toggle.title = "Start timer";
        toggle.innerHTML = renderCtx.BlueprintPure_GetSvgPlay();

        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            const running = toggle.dataset.running === "true";
            if (running) {
                renderCtx.BlueprintCallable_StopTimer(graphNode.id);
            } else {
                renderCtx.BlueprintCallable_StartTimer(graphNode.id, toggle);
            }
        });

        header.appendChild(toggle);
    }
}

NodeRegistry.UCLASS_Register(TimerNode);
