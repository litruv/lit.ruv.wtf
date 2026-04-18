/**
 * @typedef {import('./WorkspaceNavigator.js').WorkspaceNavigator} WorkspaceNavigator
 * @typedef {import('./NodeRenderer.js').NodeRenderer} NodeRenderer
 */

/**
 * Handles pointer-driven drag movement and sway animation for world-space items.
 *
 * Ported directly from Picograph's WorkspaceDragManager + WorkspaceGeometry:
 * - Anchor-ratio drag (cursor grabs exactly where it hits the element)
 * - Ghost placeholder for nodes while dragging
 * - movementX-preferred velocity → rotation blend (±7° clamp, grab-point pivot)
 * - 0.85×/frame rotation decay RAF loop
 * - RAF-coalesced connection refresh during drag, immediate flush on drop
 * - Grid snapping on ghost preview and drop (dragging remains smooth)
 */
export class ItemDragger {
    /** Grid size for snapping (matches CSS --grid-size) */
    static GRID_SIZE = 20;
    /** @type {HTMLElement} */
    #canvas;

    /** @type {WorkspaceNavigator} */
    #nav;

    /** @type {NodeRenderer} */
    #nodeRenderer;

    /** @type {boolean} */
    #enabled = false;

    /** @type {{ id: string, el: HTMLElement, pos: { x: number, y: number } }[]} */
    #images = [];

    /**
     * Per-item apply-transform callbacks.
     *
     * @type {Map<string, (x: number, y: number, rotation: number) => void>}
     */
    #applyTransform = new Map();

    /** @type {Map<string, { x: number, y: number }>} */
    #itemPositions = new Map();

    // ─── Rotation (matches workspace.nodeDragRotation in Picograph) ────────────

    /** @type {Map<string, number>} */
    #dragRotation = new Map();

    /**
     * Stores the grab-ratio pivot point per item, used to set transform-origin during rotation.
     *
     * @type {Map<string, { ratioX: number, ratioY: number }>}
     */
    #dragOrigin = new Map();

    /** @type {number | null} */
    #decayFrame = null;

    // ─── Ghost (node drag placeholder) ────────────────────────────────────────

    /** @type {{ el: HTMLElement, nodeId: string, width: number, height: number } | null} */
    #ghost = null;

    // ─── Connection refresh coalescing ─────────────────────────────────────────

    /** @type {number | null} */
    #connRefreshFrame = null;

    // ─── Edge-pan (auto-scroll while dragging near canvas edges) ──────────────

    /**
     * @type {{ clientX: number, clientY: number,
     *          anchors: Map<string, {ratioX: number, ratioY: number, width: number, height: number}>,
     *          primaryId: string, useGhost: boolean } | null}
     */
    #edgePanState = null;

    /** @type {number | null} */
    #edgePanFrame = null;

    /** @type {boolean} */
    #dragging = false;

    /** @type {(() => void) | null} */
    #cancelActiveDrag = null;

    // ─── Active item (debug panel) ─────────────────────────────────────────────

    /** @type {string | null} */
    #activeId = null;

    /** @type {{ x: number, y: number } | null} */
    #activePos = null;

    /** @type {((id: string | null, pos: { x: number, y: number } | null) => void) | null} */
    #onActiveItemChange = null;

    /** @type {(() => void) | null} */
    #onItemMoved = null;

    /**
     * @param {HTMLElement} canvas - The workspace canvas element.
     * @param {WorkspaceNavigator} nav
     * @param {NodeRenderer} nodeRenderer
     * @param {((id: string | null, pos: { x: number, y: number } | null) => void) | null} [onActiveItemChange]
     * @param {(() => void) | null} [onItemMoved]
     */
    constructor(canvas, nav, nodeRenderer, onActiveItemChange = null, onItemMoved = null) {
        this.#canvas             = canvas;
        this.#nav                = nav;
        this.#nodeRenderer       = nodeRenderer;
        this.#onActiveItemChange = onActiveItemChange;
        this.#onItemMoved        = onItemMoved;
    }

    // ─── Public ───────────────────────────────────────────────────────────────

    /** @returns {string | null} */
    get activeId() { return this.#activeId; }

    /** @returns {{ x: number, y: number } | null} */
    get activePos() { return this.#activePos; }

    /** True while a drag gesture is actively in progress. */
    get isDragging() { return this.#dragging; }

    /**
     * Immediately drops any active drag, snapping the item to grid at its current position.
     * Call this when a pinch-to-zoom starts so the two gestures don't fight each other.
     */
    cancelDrag() {
        this.#cancelActiveDrag?.();
    }

    /** @param {boolean} v */
    set enabled(v) {
        this.#enabled = v;
        this.#images.forEach(({ el }) => {
            el.style.pointerEvents = v ? "auto" : "none";
            el.style.cursor = v ? "grab" : "";
        });
        this.#nodeRenderer.getNodeElements().forEach((el) => {
            el.dataset.draggable = v ? "true" : "false";
        });
        if (!v) {
            this.#removeGhost();
            this.#stopDecay();
        }
    }

    /** @returns {boolean} */
    get enabled() { return this.#enabled; }

    /**
     * Registers an image element as draggable.
     *
     * @param {string} id
     * @param {HTMLElement} el
     * @param {{ x: number, y: number }} initialPos
     */
    registerImage(id, el, initialPos) {
        const entry = { id, el, pos: { ...initialPos } };
        this.#images.push(entry);
        this.#itemPositions.set(id, { ...initialPos });
        this.#applyTransform.set(id, (x, y, rot) => {
            entry.pos.x = x;
            entry.pos.y = y;
            el.style.transform = this.#buildTransform(x, y, rot);
        });

        el.addEventListener("pointerdown", (e) => {
            if (!this.#enabled) return;
            e.stopPropagation();
            const pointerWorld = this.#clientToWorkspace(e.clientX, e.clientY);
            const zoom   = this.#nav.zoomLevel || 1;
            const rect   = el.getBoundingClientRect();
            const width  = rect.width  / zoom || 512;
            const height = rect.height / zoom || 512;
            const ratioX = width  > 0 ? (pointerWorld.x - entry.pos.x) / width  : 0;
            const ratioY = height > 0 ? (pointerWorld.y - entry.pos.y) / height : 0;
            this.#beginDrag(id, e, el, new Map([[id, { ratioX, ratioY, width, height }]]), false);
        });
    }

    /**
     * Registers a node element as draggable. Call after the node has been added to NodeRenderer.
     *
     * @param {string} nodeId
     */
    registerNode(nodeId) {
        const el   = this.#nodeRenderer.getNodeElements().get(nodeId);
        const node = this.#nodeRenderer.getNodes().find(n => n.id === nodeId);
        if (!el || !node) return;

        this.#itemPositions.set(nodeId, { ...node.position });
        this.#applyTransform.set(nodeId, (x, y, rot) => {
            this.#nodeRenderer.setNodeTransform(nodeId, x, y, rot);
        });

        el.addEventListener("pointerdown", (e) => {
            if (!this.#enabled) return;
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.closest(".pin-handle")) return;
            e.stopPropagation();

            const pointerWorld = this.#clientToWorkspace(e.clientX, e.clientY);
            const zoom   = this.#nav.zoomLevel || 1;
            const rect   = el.getBoundingClientRect();
            const width  = Math.max(1, rect.width  / zoom);
            const height = Math.max(1, rect.height / zoom);
            const ratioX = width  > 0 ? (pointerWorld.x - node.position.x) / width  : 0;
            const ratioY = height > 0 ? (pointerWorld.y - node.position.y) / height : 0;
            this.#beginDrag(nodeId, e, el, new Map([[nodeId, { ratioX, ratioY, width, height }]]), true);
        });
    }

    // ─── Drag ─────────────────────────────────────────────────────────────────

    /**
     * @param {string} primaryId
     * @param {PointerEvent} event
     * @param {HTMLElement} primaryEl
     * @param {Map<string, { ratioX: number, ratioY: number, width: number, height: number }>} anchors
     * @param {boolean} useGhost
     */
    #beginDrag(primaryId, event, primaryEl, anchors, useGhost) {
        // Don't start a drag while a pinch-to-zoom is already running.
        // This can happen when both fingers land simultaneously: touchstart (pinch)
        // fires before pointerdown, so the guard here catches the race.
        if (this.#nav.isPinching) return;
        anchors.forEach((_, id) => this.#dragRotation.delete(id));

        // Stop any previous edge-pan and mark drag as active
        this.#stopEdgePan();
        this.#dragging = true;

        // Store grab-point ratios and apply them as transform-origin for pivot rotation
        anchors.forEach((anchor, id) => {
            this.#dragOrigin.set(id, { ratioX: anchor.ratioX, ratioY: anchor.ratioY });
            const el = this.#getItemElement(id);
            if (el) el.style.transformOrigin = `${anchor.ratioX * 100}% ${anchor.ratioY * 100}%`;
        });

        primaryEl.style.transition = "";

        let prevClientX = event.clientX;
        let prevClientY = event.clientY;
        let prevMoveTime = performance.now();

        // Ghost placeholder (nodes only)
        if (useGhost) {
            const anchor = anchors.get(primaryId);
            if (anchor) {
                const initialPointer = this.#clientToWorkspace(event.clientX, event.clientY);
                const ghostPos = {
                    x: initialPointer.x - anchor.ratioX * anchor.width,
                    y: initialPointer.y - anchor.ratioY * anchor.height,
                };
                this.#ensureGhost(primaryId, primaryEl, anchor.width, anchor.height, ghostPos);
            }
        }

        this.#setActive(primaryId, this.#itemPositions.get(primaryId) ?? null);

        // Initialise edge-pan state so #tickEdgePan can reference anchors without closure mutation
        this.#edgePanState = { clientX: event.clientX, clientY: event.clientY, anchors, primaryId, useGhost };

        const handlePointerMove = (/** @type {PointerEvent} */ moveE) => {
            if (moveE.pointerId !== event.pointerId) return;

            const pointer = this.#clientToWorkspace(moveE.clientX, moveE.clientY);

            anchors.forEach((anchor, id) => {
                const newX = pointer.x - anchor.ratioX * anchor.width;
                const newY = pointer.y - anchor.ratioY * anchor.height;
                this.#itemPositions.set(id, { x: newX, y: newY });
                const rot = this.#dragRotation.get(id) ?? 0;
                this.#applyTransform.get(id)?.(newX, newY, rot);

                if (useGhost && id === primaryId) {
                    this.#updateGhost(newX, newY);
                }
            });

            this.#setActive(primaryId, this.#itemPositions.get(primaryId) ?? null);

            // Update edge-pan pointer so the RAF loop knows where the pointer is
            this.#edgePanState.clientX = moveE.clientX;
            this.#edgePanState.clientY = moveE.clientY;
            if (this.#edgePanFrame === null) {
                this.#edgePanFrame = requestAnimationFrame(() => this.#tickEdgePan());
            }

            // Compute time-normalised velocity so touch (coalesced, less frequent events) and
            // mouse (per-frame events) produce the same rotation magnitude at the same finger/cursor speed.
            // Target frame budget: 16 ms. Clamp dt to 8–60 ms to avoid spikes on tab-switch etc.
            const now = performance.now();
            const dt = Math.max(8, Math.min(60, now - prevMoveTime));
            prevMoveTime = now;
            const rawDelta = moveE.clientX - prevClientX;
            const velocityX = (rawDelta / dt) * 16;
            anchors.forEach((_, id) => this.#nudgeRotation(id, velocityX));

            prevClientX = moveE.clientX;
            prevClientY = moveE.clientY;

            this.#scheduleConnectionRefresh();
        };

        const handlePointerFinish = (/** @type {PointerEvent} */ finishE) => {
            if (finishE.pointerId !== event.pointerId) return;
            window.removeEventListener("pointermove",   handlePointerMove);
            window.removeEventListener("pointerup",     handlePointerFinish);
            window.removeEventListener("pointercancel", handlePointerFinish);

            this.#cancelActiveDrag = null;
            this.#stopEdgePan();
            this.#dragging = false;

            // Commit position from final pointer coords, snapped to grid
            if (Number.isFinite(finishE.clientX)) {
                const pointer = this.#clientToWorkspace(finishE.clientX, finishE.clientY);
                anchors.forEach((anchor, id) => {
                    const rawX = pointer.x - anchor.ratioX * anchor.width;
                    const rawY = pointer.y - anchor.ratioY * anchor.height;
                    const snapped = this.#snapToGrid(rawX, rawY);
                    this.#itemPositions.set(id, { x: snapped.x, y: snapped.y });
                });
            }

            // Zero out rotations with snap-back transition, then decay
            anchors.forEach((_, id) => this.#setDragRotation(id, 0));

            if (useGhost) {
                const pos = this.#itemPositions.get(primaryId);
                if (pos) this.#updateGhost(pos.x, pos.y);
                window.setTimeout(() => this.#removeGhost(), 160);
            }

            // Keep selection active after drag ends
            this.#flushConnectionRefresh();
        };

        // Exposed so external callers (e.g. pinch-to-zoom start) can drop the drag cleanly
        this.#cancelActiveDrag = () => {
            window.removeEventListener("pointermove",   handlePointerMove);
            window.removeEventListener("pointerup",     handlePointerFinish);
            window.removeEventListener("pointercancel", handlePointerFinish);

            this.#cancelActiveDrag = null;
            this.#stopEdgePan();
            this.#dragging = false;

            // Snap current live positions to grid
            anchors.forEach((_, id) => {
                const pos = this.#itemPositions.get(id);
                if (!pos) return;
                const snapped = this.#snapToGrid(pos.x, pos.y);
                this.#itemPositions.set(id, snapped);
                const rot = this.#dragRotation.get(id) ?? 0;
                this.#applyTransform.get(id)?.(snapped.x, snapped.y, rot);
            });

            anchors.forEach((_, id) => this.#setDragRotation(id, 0));

            if (useGhost) {
                const pos = this.#itemPositions.get(primaryId);
                if (pos) this.#updateGhost(pos.x, pos.y);
                window.setTimeout(() => this.#removeGhost(), 160);
            }

            this.#flushConnectionRefresh();
        };

        window.addEventListener("pointermove",   handlePointerMove);
        window.addEventListener("pointerup",     handlePointerFinish);
        window.addEventListener("pointercancel", handlePointerFinish);
    }

    // ─── Ghost ────────────────────────────────────────────────────────────────

    /**
     * @param {string} nodeId
     * @param {HTMLElement} nodeEl
     * @param {number} width
     * @param {number} height
     * @param {{ x: number, y: number }} pos
     */
    #ensureGhost(nodeId, nodeEl, width, height, pos) {
        this.#removeGhost();
        const el = document.createElement("div");
        el.className = "node-drag-ghost";
        el.style.width  = `${width}px`;
        el.style.height = `${height}px`;
        el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        el.setAttribute("role", "presentation");
        if (nodeEl.parentElement) {
            nodeEl.parentElement.insertBefore(el, nodeEl);
        } else {
            nodeEl.appendChild(el);
        }
        this.#ghost = { el, nodeId, width, height };
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    #updateGhost(x, y) {
        if (!this.#ghost) return;
        const snapped = this.#snapToGrid(x, y);
        this.#ghost.el.style.transform = `translate3d(${snapped.x}px, ${snapped.y}px, 0)`;
    }

    #removeGhost() {
        if (!this.#ghost) return;
        if (this.#ghost.el.isConnected) this.#ghost.el.remove();
        this.#ghost = null;
    }

    // ─── Edge-pan (auto-scroll while dragging near canvas edges) ─────────────

    /**
     * Stops the edge-pan RAF loop and clears its state.
     */
    #stopEdgePan() {
        if (this.#edgePanFrame !== null) {
            cancelAnimationFrame(this.#edgePanFrame);
            this.#edgePanFrame = null;
        }
        this.#edgePanState = null;
    }

    /**
     * RAF loop that scrolls the viewport when the drag pointer is within 10% of any canvas edge,
     * then re-positions the dragged item so it stays under the pointer.
     * Runs continuously while the pointer stays in the edge zone; stops when it leaves.
     */
    #tickEdgePan() {
        this.#edgePanFrame = null;
        const state = this.#edgePanState;
        if (!state) return;

        const rect = this.#canvas.getBoundingClientRect();
        const { clientX, clientY, anchors, primaryId, useGhost } = state;

        const edgeW = rect.width  * 0.10;
        const edgeH = rect.height * 0.10;
        /** Max pan speed in screen pixels per frame */
        const MAX_SPEED = 14;

        const cx = clientX - rect.left;
        const cy = clientY - rect.top;

        let screenDx = 0;
        let screenDy = 0;

        if (cx < edgeW)                  screenDx =  MAX_SPEED * (1 - cx / edgeW);
        if (cx > rect.width  - edgeW)    screenDx = -MAX_SPEED * (1 - (rect.width  - cx) / edgeW);
        if (cy < edgeH)                  screenDy =  MAX_SPEED * (1 - cy / edgeH);
        if (cy > rect.height - edgeH)    screenDy = -MAX_SPEED * (1 - (rect.height - cy) / edgeH);

        if (screenDx !== 0 || screenDy !== 0) {
            const zoom    = this.#nav.zoomLevel || 1;
            this.#nav.panBy(screenDx / zoom, screenDy / zoom);

            // Re-derive world position from the (now-updated) viewport so node follows pointer
            const pointer = this.#clientToWorkspace(clientX, clientY);
            anchors.forEach((anchor, id) => {
                const newX = pointer.x - anchor.ratioX * anchor.width;
                const newY = pointer.y - anchor.ratioY * anchor.height;
                this.#itemPositions.set(id, { x: newX, y: newY });
                const rot = this.#dragRotation.get(id) ?? 0;
                this.#applyTransform.get(id)?.(newX, newY, rot);
                if (useGhost && id === primaryId) {
                    this.#updateGhost(newX, newY);
                }
            });

            this.#scheduleConnectionRefresh();
            this.#edgePanFrame = requestAnimationFrame(() => this.#tickEdgePan());
        }
        // Pointer outside the edge zone — loop pauses; next pointermove will restart it if needed
    }

    // ─── Rotation ─────────────────────────────────────────────────────────────

    /**
     * Blends horizontal velocity into an item's rotation state.
     * Exact port of nudgeNodeDragRotation from WorkspaceDragManager.
     *
     * @param {string} id
     * @param {number} velocityX
     */
    #nudgeRotation(id, velocityX) {
        if (!Number.isFinite(velocityX)) return;
        const existing = this.#dragRotation.get(id) ?? 0;
        const blended  = existing * 0.92 + velocityX * 0.18;
        this.#setDragRotation(id, blended);
    }

    /**
     * Applies or clears a rotation and updates the item's transform.
     * Exact port of setNodeDragRotation from WorkspaceDragManager.
     *
     * @param {string} id
     * @param {number} angle
     */
    #setDragRotation(id, angle) {
        const sanitized = Number.isFinite(angle) ? angle : 0;
        const clamped   = Math.max(-7, Math.min(7, sanitized));
        if (Math.abs(clamped) < 0.01) {
            this.#dragRotation.delete(id);
            this.#dragOrigin.delete(id);
            const el = this.#getItemElement(id);
            if (el) el.style.transformOrigin = "";
        } else {
            this.#dragRotation.set(id, clamped);
        }

        const pos = this.#itemPositions.get(id);
        if (pos) {
            this.#applyTransform.get(id)?.(pos.x, pos.y, clamped);
        }

        if (this.#dragRotation.size > 0) {
            this.#ensureDecay();
        } else {
            this.#stopDecay();
        }
    }

    /**
     * Returns the DOM element for a registered item (image or node).
     *
     * @param {string} id
     * @returns {HTMLElement | null}
     */
    #getItemElement(id) {
        const img = this.#images.find(i => i.id === id);
        if (img) return img.el;
        return this.#nodeRenderer.getNodeElements().get(id) ?? null;
    }

    // ─── Decay ────────────────────────────────────────────────────────────────

    /**
     * Ensures the rotation decay RAF loop is running.
     * Exact port of ensureNodeRotationDecay from WorkspaceDragManager.
     */
    #ensureDecay() {
        if (this.#decayFrame !== null) return;

        const step = () => {
            let hasActive = false;
            this.#dragRotation.forEach((angle, id) => {
                const pos = this.#itemPositions.get(id);
                if (!pos) { this.#dragRotation.delete(id); return; }

                const damped = angle * 0.85;
                if (Math.abs(damped) < 0.05) {
                    this.#dragRotation.delete(id);
                    this.#dragOrigin.delete(id);
                    const el = this.#getItemElement(id);
                    if (el) el.style.transformOrigin = "";
                    this.#applyTransform.get(id)?.(pos.x, pos.y, 0);
                } else {
                    this.#dragRotation.set(id, damped);
                    this.#applyTransform.get(id)?.(pos.x, pos.y, damped);
                    hasActive = true;
                }
            });

            this.#scheduleConnectionRefresh();

            if (hasActive) {
                this.#decayFrame = requestAnimationFrame(step);
            } else {
                this.#decayFrame = null;
                this.#flushConnectionRefresh();
            }
        };

        this.#decayFrame = requestAnimationFrame(step);
    }

    /**
     * Stops the decay loop if running.
     * Exact port of stopNodeRotationDecay from WorkspaceDragManager.
     */
    #stopDecay() {
        if (this.#decayFrame === null) return;
        cancelAnimationFrame(this.#decayFrame);
        this.#decayFrame = null;
    }

    // ─── Connection refresh coalescing ────────────────────────────────────────

    /**
     * Queues a single RAF to refresh connections.
     * Matches scheduleConnectionRefresh in BlueprintWorkspace.
     */
    #scheduleConnectionRefresh() {
        if (this.#connRefreshFrame !== null) return;
        this.#connRefreshFrame = requestAnimationFrame(() => {
            this.#connRefreshFrame = null;
            this.#onItemMoved?.();
        });
    }

    /**
     * Immediately refreshes connections, cancelling any pending RAF.
     * Matches flushConnectionRefresh in BlueprintWorkspace.
     */
    #flushConnectionRefresh() {
        if (this.#connRefreshFrame !== null) {
            cancelAnimationFrame(this.#connRefreshFrame);
            this.#connRefreshFrame = null;
        }
        this.#onItemMoved?.();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Snaps a world-space position to the grid.
     *
     * @param {number} x
     * @param {number} y
     * @returns {{ x: number, y: number }}
     */
    #snapToGrid(x, y) {
        const gridSize = ItemDragger.GRID_SIZE;
        return {
            x: Math.round(x / gridSize) * gridSize,
            y: Math.round(y / gridSize) * gridSize,
        };
    }

    /**
     * Converts client coordinates to world space.
     * Exact port of clientToWorkspace from WorkspaceDragManager.
     *
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{ x: number, y: number }}
     */
    #clientToWorkspace(clientX, clientY) {
        const rect   = this.#canvas.getBoundingClientRect();
        const zoom   = Math.max(0.01, this.#nav.zoomLevel || 1);
        const offset = this.#nav.getEffectiveOffset();
        return {
            x: (clientX - rect.left) / zoom - offset.x,
            y: (clientY - rect.top)  / zoom - offset.y,
        };
    }

    /**
     * Builds a CSS transform matching WorkspaceGeometry.positionToTransform in Picograph.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} rotation
     * @returns {string}
     */
    #buildTransform(x, y, rotation) {
        const rotZ = Number.isFinite(rotation) ? rotation : 0;
        if (!rotZ) return `translate3d(${x}px, ${y}px, 0)`;
        return `translate3d(${x}px, ${y}px, 0) rotate(${rotZ}deg)`;
    }

    /**
     * @param {string | null} id
     * @param {{ x: number, y: number } | null} pos
     */
    #setActive(id, pos) {
        this.#activeId  = id;
        this.#activePos = pos;
        this.#onActiveItemChange?.(id, pos);
    }

    /**
     * Unregisters a node that's being deleted.
     *
     * @param {string} nodeId
     */
    unregisterNode(nodeId) {
        this.#itemPositions.delete(nodeId);
        this.#applyTransform.delete(nodeId);
        this.#dragRotation.delete(nodeId);
        this.#dragOrigin.delete(nodeId);
        
        // Clear active if it's the deleted node
        if (this.#activeId === nodeId) {
            this.clearSelection();
        }
    }

    /**
     * Clear the current selection
     */
    clearSelection() {
        this.#setActive(null, null);
    }

    /**
     * Get the currently active item ID
     * @returns {string | null}
     */
    getActiveId() {
        return this.#activeId;
    }
}

