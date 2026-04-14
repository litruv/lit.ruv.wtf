/**
 * @file NodeRenderContext.js
 * Render-time context passed to node handlers when building their DOM.
 */

/**
 * @typedef {import('../GraphNode.js').GraphNode} GraphNode
 */

/**
 * Wraps all render-time services nodes may need during BlueprintNativeEvent_OnRender.
 * Keeps NodeRenderer internals encapsulated while giving nodes controlled access.
 */
export class NodeRenderContext {
    /** @type {(src: string, target: HTMLElement) => Promise<void>} */
    #loadMarkdown;

    /** @type {(p: Promise<void>) => void} */
    #addMarkdownPromise;

    /** @type {((nodeId: string, pinId?: string) => void) | null} */
    #onNodeExecute;

    /** @type {(nodeId: string, instance: any) => void} */
    #registerChatInstance;

    /** @type {(nodeId: string, toggleEl: HTMLButtonElement) => void} */
    #startTimer;

    /** @type {(nodeId: string) => void} */
    #stopTimer;

    /** @type {() => string} */
    #svgPlay;

    /** @type {() => string} */
    #svgStop;

    /** @type {(nodeId: string, pinId: string) => any} */
    #resolveInputValue;

    /**
     * @param {{
     *   loadMarkdown: (src: string, target: HTMLElement) => Promise<void>,
     *   addMarkdownPromise: (p: Promise<void>) => void,
     *   onNodeExecute: ((nodeId: string, pinId?: string) => void) | null,
     *   registerChatInstance: (nodeId: string, instance: any) => void,
     *   startTimer: (nodeId: string, toggleEl: HTMLButtonElement) => void,
     *   stopTimer: (nodeId: string) => void,
     *   svgPlay: () => string,
     *   svgStop: () => string,
     *   resolveInputValue: (nodeId: string, pinId: string) => any,
     * }} callbacks
     */
    constructor(callbacks) {
        this.#loadMarkdown        = callbacks.loadMarkdown;
        this.#addMarkdownPromise  = callbacks.addMarkdownPromise;
        this.#onNodeExecute       = callbacks.onNodeExecute;
        this.#registerChatInstance = callbacks.registerChatInstance;
        this.#startTimer          = callbacks.startTimer;
        this.#stopTimer           = callbacks.stopTimer;
        this.#svgPlay             = callbacks.svgPlay;
        this.#svgStop             = callbacks.svgStop;
        this.#resolveInputValue   = callbacks.resolveInputValue;
    }

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {string} src
     * @param {HTMLElement} target
     */
    BlueprintCallable_LoadMarkdown(src, target) {
        this.#addMarkdownPromise(this.#loadMarkdown(src, target));
    }

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {string} nodeId
     * @param {string} [pinId]
     */
    BlueprintCallable_TriggerNodeExecute(nodeId, pinId) {
        this.#onNodeExecute?.(nodeId, pinId);
    }

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {string} nodeId
     * @param {any} instance
     */
    BlueprintCallable_RegisterChatInstance(nodeId, instance) {
        this.#registerChatInstance(nodeId, instance);
    }

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {string} nodeId
     * @param {HTMLButtonElement} toggleEl
     */
    BlueprintCallable_StartTimer(nodeId, toggleEl) {
        this.#startTimer(nodeId, toggleEl);
    }

    /**
     * @UFUNCTION(BlueprintCallable)
     * @param {string} nodeId
     */
    BlueprintCallable_StopTimer(nodeId) {
        this.#stopTimer(nodeId);
    }

    /**
     * @UFUNCTION(BlueprintPure)
     * @returns {string}
     */
    BlueprintPure_GetSvgPlay() {
        return this.#svgPlay();
    }

    /**
     * @UFUNCTION(BlueprintPure)
     * @returns {string}
     */
    BlueprintPure_GetSvgStop() {
        return this.#svgStop();
    }

    /**
     * @UFUNCTION(BlueprintPure)
     * Resolves an input pin value by following connections.
     * @param {string} nodeId
     * @param {string} pinId
     * @returns {any}
     */
    BlueprintPure_ResolveInputValue(nodeId, pinId) {
        return this.#resolveInputValue(nodeId, pinId);
    }
}
