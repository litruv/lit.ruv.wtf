/**
 * @file RandomNameNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Generates random names from first/second part combinations.
 * Pre-runs on load and has a button to regenerate.
 */
export class RandomNameNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "random_name";

    /** @type {Array<string>} */
    static #firstParts = [];
    
    /** @type {Array<string>} */
    static #secondParts = [];
    
    /** @type {Promise<void> | null} */
    static #loadPromise = null;

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
                { id: 'name', name: 'Name', direction: 'output', kind: 'string' }
            ]
        };
    }

    /**
     * Load name parts from JSON
     */
    static async #loadNameParts() {
        if (this.#loadPromise) return this.#loadPromise;
        
        this.#loadPromise = (async () => {
            try {
                const response = await fetch('data/nameParts.json');
                const data = await response.json();
                this.#firstParts = data.firstParts || [];
                this.#secondParts = data.secondParts || [];
            } catch (err) {
                console.error('Failed to load name parts:', err);
                this.#firstParts = ['Random'];
                this.#secondParts = ['Name'];
            }
        })();
        
        return this.#loadPromise;
    }

    /**
     * Generate random name
     * @returns {string}
     */
    static generateName() {
        if (this.#firstParts.length === 0 || this.#secondParts.length === 0) {
            return 'Loading...';
        }
        const first = this.#firstParts[Math.floor(Math.random() * this.#firstParts.length)];
        const second = this.#secondParts[Math.floor(Math.random() * this.#secondParts.length)];
        return `${first}${second}`;
    }

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {import('./NodeExecutionContext.js').NodeExecutionContext} ctx
     */
    async BlueprintCallable_Execute(ctx) {
        const graphNode = ctx.BlueprintPure_GetNode();
        if (!graphNode) return;
        
        // Generate new name
        graphNode._generatedName = RandomNameNode.generateName();
        
        // Update DOM if rendered
        const nodeEl = document.querySelector(`[data-node-id="${graphNode.id}"]`);
        if (nodeEl) {
            const nameDisplay = nodeEl.querySelector('.node-name-display');
            if (nameDisplay) {
                nameDisplay.textContent = graphNode._generatedName;
            }
        }
        
    }

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     * @param {import('./NodeRenderContext.js').NodeRenderContext} renderCtx
     */
    async BlueprintNativeEvent_OnRender(article, graphNode, renderCtx) {
        await RandomNameNode.#loadNameParts();

        // Generate initial name if not set
        if (!graphNode._generatedName) {
            graphNode._generatedName = RandomNameNode.generateName();
        }

        console.log('[RandomNameNode] Generated name:', graphNode._generatedName, 'for node', graphNode.id);

        // Add button to header
        const header = article.querySelector(".node-header");
        if (header) {
            const btn = document.createElement("button");
            btn.className = "node-run-btn";
            btn.title = "Generate New Name";
            btn.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden="true"><polygon points="1,0 9,4.5 1,9"/></svg>`;

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                graphNode._generatedName = RandomNameNode.generateName();
                nameDisplay.textContent = graphNode._generatedName;
                
                btn.classList.add("node-run-btn--flash");
                btn.addEventListener("animationend", () => btn.classList.remove("node-run-btn--flash"), { once: true });
            });

            header.appendChild(btn);
        }

        // Display name in body
        const body = document.createElement("div");
        body.className = "node-body node-body--text";

        const nameDisplay = document.createElement("div");
        nameDisplay.className = "node-name-display";
        nameDisplay.textContent = graphNode._generatedName;

        body.appendChild(nameDisplay);
        article.appendChild(body);
    }

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {import('../GraphNode.js').GraphNode} graphNode
     * @param {string} pinId
     * @returns {any}
     */
    BlueprintNativeEvent_GetOutputValue(graphNode, pinId) {
        if (pinId === 'name') {
            return graphNode._generatedName || '';
        }
        return null;
    }
}

NodeRegistry.UCLASS_Register(RandomNameNode);
