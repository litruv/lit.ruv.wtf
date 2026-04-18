import { getTypeColor } from "./getTypeColor.js";
import { MarkdownRenderer } from "./MarkdownRenderer.js";
import { NodeRegistry, NodeRenderContext } from "./nodes/index.js";

/**
 * @typedef {import('./GraphNode.js').GraphNode} GraphNode
 * @typedef {import('./GraphNode.js').PinDescriptor} PinDescriptor
 * @typedef {import('./GraphConnection.js').GraphConnection} GraphConnection
 * @typedef {import('./GraphComment.js').GraphComment} GraphComment
 */

/**
 * Renders static blueprint nodes into a DOM layer.
 * Stripped-down port of WorkspaceNodeRenderer — no drag, no selection, no context menus.
 */
export class NodeRenderer {
    /** @type {HTMLElement} */
    #nodeLayer;

    /** @type {HTMLTemplateElement} */
    #nodeTemplate;

    /** @type {HTMLTemplateElement} */
    #pinTemplate;

    /** @type {Map<string, GraphNode>} */
    #nodes = new Map();

    /** @type {Map<string, HTMLElement>} */
    #nodeElements = new Map();

    /** @type {Map<string, GraphConnection>} */
    #connections = new Map();

    /** @type {Map<string, GraphComment>} */
    #comments = new Map();

    /** @type {Map<string, HTMLElement>} */
    #commentElements = new Map();

    /** @type {HTMLElement | null} */
    #commentLayer = null;

    /**
     * Active interval handles keyed by timer node ID.
     *
     * @type {Map<string, number>}
     */
    #timerIntervals = new Map();

    /** @type {((nodeId: string, pinId: string, direction: string) => void) | null} */
    #onNodeClick = null;

    /** @type {((nodeId: string, pinId?: string) => void) | null} */
    #onNodeExecute = null;

    /** @type {(() => void) | null} */
    #onConnectionRemoved = null;

    /**
     * Promises for all async markdown loads, used by contentReady().
     *
     * @type {Promise<void>[]}
     */
    #markdownPromises = [];

    /**
     * Active chat node instances keyed by node ID.
     *
     * @type {Map<string, import('./ChatNode.js').ChatNode>}
     */
    #chatInstances = new Map();

    /** @type {NodeRenderContext | null} */
    #renderCtx = null;

    /**
     * @param {HTMLElement} nodeLayer
     * @param {HTMLTemplateElement} nodeTemplate
     * @param {HTMLTemplateElement} pinTemplate
     * @param {((nodeId: string, pinId: string, direction: string) => void) | null} [onNodeClick]
     * @param {((nodeId: string, pinId?: string) => void) | null} [onNodeExecute]
     * @param {(() => void) | null} [onConnectionRemoved]
     */
    constructor(nodeLayer, nodeTemplate, pinTemplate, onNodeClick = null, onNodeExecute = null, onConnectionRemoved = null) {
        this.#nodeLayer = nodeLayer;
        this.#nodeTemplate = nodeTemplate;
        this.#pinTemplate = pinTemplate;
        this.#onNodeClick = onNodeClick;
        this.#onNodeExecute = onNodeExecute;
        this.#onConnectionRemoved = onConnectionRemoved;
        this.#renderCtx = new NodeRenderContext({
            loadMarkdown:         (src, target) => this.#loadMarkdown(src, target),
            addMarkdownPromise:   (p) => this.#markdownPromises.push(p),
            onNodeExecute:        (nodeId, pinId) => this.#onNodeExecute?.(nodeId, pinId),
            registerChatInstance: (nodeId, instance) => this.#chatInstances.set(nodeId, instance),
            startTimer:           (nodeId, toggle) => this.#startTimer(nodeId, toggle),
            stopTimer:            (nodeId) => this.#stopTimer(nodeId),
            svgPlay:              () => NodeRenderer.#svgPlay(),
            svgStop:              () => NodeRenderer.#svgStop(),
            resolveInputValue:    (nodeId, pinId) => this.#resolveInputValue(nodeId, pinId),
        });
    }

    // ─── Public ───────────────────────────────────────────────────────────────

    /**
     * Adds a node to the graph and renders it into the DOM.
     *
     * @param {GraphNode} node
     */
    addNode(node) {
        this.#nodes.set(node.id, node);
        this.#renderNode(node);
    }

    /**
     * Removes a node from the graph and DOM.
     *
     * @param {string} nodeId
     */
    removeNode(nodeId) {
        const element = this.#nodeElements.get(nodeId);
        if (element) {
            element.remove();
            this.#nodeElements.delete(nodeId);
        }
        
        // Remove all connections touching this node
        const connIds = [];
        for (const [id, conn] of this.#connections) {
            if (conn.from.nodeId === nodeId || conn.to.nodeId === nodeId) {
                connIds.push(id);
            }
        }
        
        for (const id of connIds) {
            this.#connections.delete(id);
        }
        
        // Stop any active timers
        const intervalHandle = this.#timerIntervals.get(nodeId);
        if (intervalHandle !== undefined) {
            clearInterval(intervalHandle);
            this.#timerIntervals.delete(nodeId);
        }
        
        // Clean up chat instances
        const chatInstance = this.#chatInstances.get(nodeId);
        if (chatInstance) {
            this.#chatInstances.delete(nodeId);
        }
        
        this.#nodes.delete(nodeId);
        
        // Notify connections need refresh
        if (connIds.length > 0) {
            this.#onConnectionRemoved?.();
        }
    }

    /**
     * Adds a comment box to the graph and renders it into the DOM.
     *
     * @param {GraphComment} comment
     */
    addComment(comment) {
        this.#comments.set(comment.id, comment);
        this.#renderComment(comment);
    }

    /**
     * Removes all connections touching a specific pin and refreshes pin state.
     * Calls onConnectionRemoved if any were removed.
     *
     * @param {string} nodeId
     * @param {string} pinId
     * @param {('input'|'output')} direction
     */
    disconnectPin(nodeId, pinId, direction) {
        let removed = false;
        for (const [id, conn] of this.#connections) {
            const matches = direction === "output"
                ? conn.from.nodeId === nodeId && conn.from.pinId === pinId
                : conn.to.nodeId   === nodeId && conn.to.pinId   === pinId;
            if (matches) {
                const otherNodeId = direction === "output" ? conn.to.nodeId : conn.from.nodeId;
                this.#connections.delete(id);
                this.#refreshPinStates(nodeId);
                this.#refreshPinStates(otherNodeId);
                removed = true;
            }
        }
        if (removed) this.#onConnectionRemoved?.();
    }

    /**
     * Adds a connection with kind-aware deduplication:
     * - Exec pins: one-out (only one connection may leave a given exec output), many-in allowed.
     * - Data pins: many-out allowed, one-in (only one connection may enter a given data input).
     *
     * @param {GraphConnection} connection
     */
    addConnection(connection) {
        /** @type {Set<string>} */
        const staleNodes = new Set();

        for (const [id, existing] of this.#connections) {
            const isDuplicate = connection.kind === "exec"
                ? existing.from.nodeId === connection.from.nodeId && existing.from.pinId === connection.from.pinId
                : existing.to.nodeId   === connection.to.nodeId   && existing.to.pinId   === connection.to.pinId;

            if (isDuplicate) {
                staleNodes.add(existing.from.nodeId);
                staleNodes.add(existing.to.nodeId);
                this.#connections.delete(id);
                break;
            }
        }

        this.#connections.set(connection.id, connection);

        staleNodes.add(connection.from.nodeId);
        staleNodes.add(connection.to.nodeId);
        for (const nodeId of staleNodes) this.#refreshPinStates(nodeId);
    }

    /**
     * Returns all current connections.
     *
     * @returns {GraphConnection[]}
     */
    getConnections() {
        return [...this.#connections.values()];
    }

    /**
     * Returns all current nodes.
     *
     * @returns {GraphNode[]}
     */
    getNodes() {
        return [...this.#nodes.values()];
    }

    /**
     * Returns the world-space bounding rect of a node using its position and DOM size.
     *
     * @param {string} nodeId
     * @returns {{ x: number, y: number, width: number, height: number } | null}
     */
    /**
     * Returns a promise that resolves once all markdown content has finished loading.
     * Uses allSettled so a single failed fetch does not block others.
     *
     * @returns {Promise<void>}
     */
    contentReady() {
        return Promise.allSettled(this.#markdownPromises).then(() => {});
    }

    getNodeWorldRect(nodeId) {
        const node = this.#nodes.get(nodeId);
        const el   = this.#nodeElements.get(nodeId);
        if (!node || !el) return null;
        return {
            x:      node.position.x,
            y:      node.position.y,
            width:  el.offsetWidth  || 220,
            height: el.offsetHeight || 80,
        };
    }

    /**
     * Returns the first node connected to the given node (via any connection).
     *
     * @param {string} nodeId
     * @returns {string | null} The other node's ID, or null.
     */
    getFirstConnectedNodeId(nodeId) {
        for (const conn of this.#connections.values()) {
            if (conn.from.nodeId === nodeId) return conn.to.nodeId;
            if (conn.to.nodeId   === nodeId) return conn.from.nodeId;
        }
        return null;
    }

    /**
     * Returns the node ID connected to a specific pin.
     *
     * @param {string} nodeId
     * @param {string} pinId
     * @param {('input'|'output')} direction
     * @returns {string | null}
     */
    getConnectedNodeId(nodeId, pinId, direction) {
        for (const conn of this.#connections.values()) {
            if (direction === "output" && conn.from.nodeId === nodeId && conn.from.pinId === pinId) return conn.to.nodeId;
            if (direction === "input"  && conn.to.nodeId   === nodeId && conn.to.pinId   === pinId) return conn.from.nodeId;
        }
        return null;
    }

    /**
     * Returns the DOM element for a node.
     *
     * @param {string} nodeId
     * @returns {HTMLElement | undefined}
     */
    getNodeElement(nodeId) {
        return this.#nodeElements.get(nodeId);
    }

    /**
     * Returns the pin handle element for use in connection geometry calculations.
     *
     * @param {string} nodeId
     * @param {string} pinId
     * @param {('input'|'output')} direction
     * @returns {HTMLElement | null}
     */
    getPinHandle(nodeId, pinId, direction) {
        const article = this.#nodeElements.get(nodeId);
        if (!article) return null;
        const container = direction === "input"
            ? article.querySelector(".node-inputs")
            : article.querySelector(".node-outputs");
        if (!container) return null;
        const pin = container.querySelector(`[data-pin-id="${pinId}"]`);
        return pin ? pin.querySelector(".pin-handle") : null;
    }

    /**
     * Updates a node's world-space position and its DOM transform, with optional rotation for sway.
     * Rotation formula matches WorkspaceGeometry.positionToTransform in Picograph.
     *
     * @param {string} nodeId
     * @param {number} x
     * @param {number} y
     * @param {number} [rotation] - Z-rotation in degrees; also produces a perspective Y-axis lean.
     */
    setNodeTransform(nodeId, x, y, rotation = 0) {
        const node = this.#nodes.get(nodeId);
        const el   = this.#nodeElements.get(nodeId);
        if (!node || !el) return;
        node.position.x = x;
        node.position.y = y;
        el.style.transform = NodeRenderer.#buildTransform(x, y, rotation);
    }

    /**
     * Updates a node's world-space position (no rotation).
     *
     * @param {string} nodeId
     * @param {number} x
     * @param {number} y
     */
    setNodePosition(nodeId, x, y) {
        this.setNodeTransform(nodeId, x, y, 0);
    }

    /**
     * Builds a CSS transform string from a world position and optional rotation.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} rotation
     * @returns {string}
     */
    static #buildTransform(x, y, rotation) {
        if (!rotation) return `translate3d(${x}px, ${y}px, 0)`;
        return `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
    }

    /**
     * Returns all rendered node elements keyed by node ID.
     *
     * @returns {Map<string, HTMLElement>}
     */
    getNodeElements() {
        return this.#nodeElements;
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    /** @param {GraphNode} node */
    #renderNode(node) {
        const fragment = /** @type {DocumentFragment} */ (this.#nodeTemplate.content.cloneNode(true));
        const article  = /** @type {HTMLElement} */ (fragment.querySelector(".blueprint-node"));
        const title    = /** @type {HTMLElement} */ (article.querySelector(".node-title"));
        const inputs   = /** @type {HTMLElement} */ (article.querySelector(".node-inputs"));
        const outputs  = /** @type {HTMLElement} */ (article.querySelector(".node-outputs"));

        article.dataset.nodeId   = node.id;
        article.dataset.nodeType = node.type;
        title.textContent = node.title;
        article.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
        if (node.width != null) article.style.width = `${node.width}px`;

        inputs.innerHTML  = "";
        outputs.innerHTML = "";

        node.inputs.forEach(pin => {
            const el = this.#createPinElement(node.id, pin, "input");
            inputs.appendChild(el);
        });

        node.outputs.forEach(pin => {
            const el = this.#createPinElement(node.id, pin, "output");
            outputs.appendChild(el);
        });

        // Dispatch type-specific rendering to the registered node handler
        const handler = NodeRegistry.BlueprintPure_Get(node.type);
        if (handler) {
            handler.BlueprintNativeEvent_OnRender(article, node, this.#renderCtx);
        }

        this.#nodeLayer.appendChild(article);
        this.#nodeElements.set(node.id, article);
    }

    /**
     * Fetches a markdown file and renders it into the target element.
     *
     * @param {string} src - Relative URL to the .md file.
     * @param {HTMLElement} target - Container to populate.
     * @returns {Promise<void>}
     */
    async #loadMarkdown(src, target) {
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            target.innerHTML = MarkdownRenderer.render(text);
        } catch (err) {
            target.innerHTML = `<p class="md-error">Failed to load content.</p>`;
            console.error(`[NodeRenderer] Could not load markdown "${src}":`, err);
        }
    }

    /**
     * Renders a comment box into the DOM.
     *
     * @param {GraphComment} comment
     */
    #renderComment(comment) {
        // Create comment layer if it doesn't exist
        if (!this.#commentLayer) {
            this.#commentLayer = document.createElement("div");
            this.#commentLayer.className = "comment-layer";
            this.#nodeLayer.insertBefore(this.#commentLayer, this.#nodeLayer.firstChild);
        }

        const box = document.createElement("div");
        box.className = "blueprint-comment";
        box.dataset.commentId = comment.id;
        box.style.transform = `translate3d(${comment.position.x}px, ${comment.position.y}px, 0)`;
        box.style.width = `${comment.size.width}px`;
        box.style.height = `${comment.size.height}px`;
        
        // Create the colored background layer
        const bg = document.createElement("div");
        bg.className = "comment-background";
        bg.style.backgroundColor = comment.color;
        bg.style.opacity = comment.opacity.toString();
        box.appendChild(bg);

        const titleBar = document.createElement("div");
        titleBar.className = "comment-title";
        titleBar.textContent = comment.title;
        box.appendChild(titleBar);

        this.#commentLayer.appendChild(box);
        this.#commentElements.set(comment.id, box);
    }

    // ─── Timer ────────────────────────────────────────────────────────────────

    /**
     * Starts the interval loop for a timer node, updating toggle button state.
     *
     * @param {string} nodeId
     * @param {HTMLButtonElement} toggle
     */
    #startTimer(nodeId, toggle) {
        this.#stopTimer(nodeId);

        const node = this.#nodes.get(nodeId);
        const intervalPin = node?.inputs.find(p => p.id === "interval");
        const seconds = Math.max(0.1, Math.min(10, parseFloat(intervalPin?.defaultValue ?? "1") || 1));

        toggle.dataset.running = "true";
            toggle.innerHTML = NodeRenderer.#svgStop();

        const handle = window.setInterval(() => {
            this.#onNodeExecute?.(nodeId);
        }, seconds * 1000);

        this.#timerIntervals.set(nodeId, handle);
    }

    /**
     * Stops a running timer and resets the toggle button state.
     *
     * @param {string} nodeId
     */
    #stopTimer(nodeId) {
        const handle = this.#timerIntervals.get(nodeId);
        if (handle != null) {
            window.clearInterval(handle);
            this.#timerIntervals.delete(nodeId);
        }

        const el = this.#nodeElements.get(nodeId);
        const toggle = /** @type {HTMLButtonElement | null} */ (el?.querySelector(".node-timer-btn"));
        if (toggle) {
            toggle.dataset.running = "false";
            toggle.innerHTML = NodeRenderer.#svgPlay();
            toggle.title = "Start timer";
        }
    }

    /** @returns {string} */
    static #svgPlay() {
        return `<svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden="true"><polygon points="1,0 9,4.5 1,9"/></svg>`;
    }

    /** @returns {string} */
    static #svgStop() {
        return `<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="8" height="8" rx="1"/></svg>`;
    }

    /**
     * Resolves input value by following connections (for render-time use).
     *
     * @param {string} nodeId
     * @param {string} pinId
     * @returns {any}
     */
    #resolveInputValue(nodeId, pinId) {
        try {
            console.log('[NodeRenderer#resolveInputValue] Looking for', nodeId, pinId);
            console.log('[NodeRenderer#resolveInputValue] Available connections:', this.#connections);
            console.log('[NodeRenderer#resolveInputValue] Available nodes:', Array.from(this.#nodes.keys()));
            
            const conn = Array.from(this.#connections.values()).find(
                c => c.to.nodeId === nodeId && c.to.pinId === pinId
            );

            console.log('[NodeRenderer#resolveInputValue] Found connection:', conn);

            if (conn) {
                const sourceNode = this.#nodes.get(conn.from.nodeId);
                
                console.log('[NodeRenderer] Resolving', nodeId, pinId, 'from', conn.from.nodeId, 'sourceNode:', sourceNode);
                
                // Handle random_name node
                if (sourceNode?.type === "random_name" && conn.from.pinId === "name") {
                    console.log('[NodeRenderer] Random name value:', sourceNode._generatedName);
                    return sourceNode._generatedName || "";
                }

                // Fallback to source pin defaultValue
                const sourcePin = sourceNode?.getPin?.(conn.from.pinId);
                if (sourcePin?.defaultValue != null) {
                    return sourcePin.defaultValue;
                }
            }

            // No connection, use local pin defaultValue
            const node = this.#nodes.get(nodeId);
            const pin = node?.getPin?.(pinId);
            return pin?.defaultValue ?? "";
        } catch (err) {
            console.error(`Failed to resolve input ${nodeId}.${pinId}:`, err);
            return "";
        }
    }

    /**
     * @param {string} nodeId
     * @param {PinDescriptor} pin
     * @param {('input'|'output')} direction
     * @returns {HTMLElement}
     */
    #createPinElement(nodeId, pin, direction) {
        const fragment  = /** @type {DocumentFragment} */ (this.#pinTemplate.content.cloneNode(true));
        const container = /** @type {HTMLElement} */ (fragment.firstElementChild);
        const label     = /** @type {HTMLElement} */ (container.querySelector(".pin-label"));
        const handle    = /** @type {HTMLElement} */ (container.querySelector(".pin-handle"));

        container.dataset.pinId    = pin.id;
        container.dataset.type     = pin.kind;
        container.dataset.direction = direction;
        container.style.setProperty("--pin-kind-color", getTypeColor(pin.kind));

        // Exec and string pins are clickable: focus the connected node
        if (this.#onNodeClick && (pin.kind === "exec" || pin.kind === "string")) {
            container.classList.add("is-clickable");

            /** @param {MouseEvent} e */
            const handleClick = (e) => {
                e.stopPropagation();
                if (e.altKey) return;
                if (container.classList.contains("is-disconnected")) return;
                this.#onNodeClick(nodeId, pin.id, direction);
            };

            handle.addEventListener("click", handleClick);
            label.addEventListener("click", handleClick);
        }

        // Alt+click on any pin handle disconnects it
        handle.addEventListener("click", (e) => {
            if (!e.altKey) return;
            e.stopPropagation();
            this.disconnectPin(nodeId, pin.id, direction);
        });

        const isStandardExec = pin.kind === "exec" && (pin.id === "exec_in" || pin.id === "exec_out");
        if (isStandardExec && !pin.name) {
            label.textContent = "";
            label.classList.add("is-hidden");
        } else {
            label.textContent = pin.name;
        }

        // String pins: render an editable inline value chip
        // For outputs: only on pure/string nodes
        // For inputs: always show if there's a defaultValue
        const node = this.#nodes.get(nodeId);
        const isPureOrStringNode = node && (node.type === "pure" || node.type === "string");
        const shouldShowStringValue = pin.kind === "string" && pin.defaultValue != null &&
            ((direction === "output" && isPureOrStringNode) || direction === "input");
        
        if (shouldShowStringValue) {
            const valueChip = document.createElement("span");
            valueChip.className = "pin-value";
            valueChip.textContent = pin.defaultValue;
            valueChip.contentEditable = "true";
            valueChip.spellcheck = false;

            // Prevent workspace pan/drag from stealing pointer events while editing
            valueChip.addEventListener("pointerdown", (e) => e.stopPropagation());

            // Prevent pin click navigation from firing when clicking into the chip
            valueChip.addEventListener("click", (e) => e.stopPropagation());

            // Keep caret inside on Enter instead of inserting a <br>
            valueChip.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    valueChip.blur();
                }
            });

            // Sync back to the live pin descriptor so GraphExecutor reads the new value
            valueChip.addEventListener("input", () => {
                pin.defaultValue = valueChip.textContent ?? "";
            });

            // Clean up any accidental HTML on blur
            valueChip.addEventListener("blur", () => {
                const text = valueChip.textContent ?? "";
                pin.defaultValue = text;
                valueChip.textContent = text;
            });

            container.appendChild(valueChip);
        }

        // Number pins with defaultValue: render a clamped numeric input on inputs only
        if (pin.kind === "number" && pin.defaultValue != null && direction === "input") {
            const numInput = document.createElement("input");
            numInput.type  = "number";
            numInput.className = "pin-value pin-value--number";
            numInput.value = pin.defaultValue;
            if (pin.min != null) numInput.min = String(pin.min);
            if (pin.max != null) numInput.max = String(pin.max);
            numInput.step  = "0.1";

            numInput.addEventListener("pointerdown", (e) => e.stopPropagation());
            numInput.addEventListener("click", (e) => e.stopPropagation());

            const clampAndSync = () => {
                let v = parseFloat(numInput.value);
                if (!Number.isFinite(v)) v = parseFloat(pin.defaultValue ?? "1");
                if (pin.min != null) v = Math.max(pin.min, v);
                if (pin.max != null) v = Math.min(pin.max, v);
                const str = String(Math.round(v * 100) / 100);
                numInput.value  = str;
                pin.defaultValue = str;
            };

            numInput.addEventListener("change", clampAndSync);
            numInput.addEventListener("blur",   clampAndSync);

            container.appendChild(numInput);
        }

        // Start disconnected — addConnection() will update these
        container.classList.add("is-disconnected");

        return container;
    }

    /**
     * Re-evaluates connected/disconnected classes for all pins on a node.
     *
     * @param {string} nodeId
     */
    #refreshPinStates(nodeId) {
        const node = this.#nodes.get(nodeId);
        if (!node) return;
        [...node.inputs, ...node.outputs].forEach(pin => {
            this.#applyPinState(nodeId, pin.id, pin.direction);
        });
    }

    /**
     * @param {string} nodeId
     * @param {string} pinId
     * @param {('input'|'output')} direction
     */
    #applyPinState(nodeId, pinId, direction) {
        const handle = this.getPinHandle(nodeId, pinId, direction);
        const pin = this.#findPinContainer(nodeId, pinId, direction);
        if (!pin) return;

        const connected = [...this.#connections.values()].some(c =>
            (c.from.nodeId === nodeId && c.from.pinId === pinId) ||
            (c.to.nodeId === nodeId && c.to.pinId === pinId)
        );

        pin.classList.toggle("is-connected",    connected);
        pin.classList.toggle("is-disconnected", !connected);

        // Hide inline value chip on input pins when connected
        if (direction === "input") {
            const chip = pin.querySelector(".pin-value");
            if (chip) chip.style.display = connected ? "none" : "";
        }
    }

    /**
     * @param {string} nodeId
     * @param {string} pinId
     * @param {('input'|'output')} direction
     * @returns {HTMLElement | null}
     */
    #findPinContainer(nodeId, pinId, direction) {
        const article = this.#nodeElements.get(nodeId);
        if (!article) return null;
        const section = direction === "input"
            ? article.querySelector(".node-inputs")
            : article.querySelector(".node-outputs");
        return section?.querySelector(`[data-pin-id="${pinId}"]`) ?? null;
    }
}
