import { getTypeColor } from "./getTypeColor.js";
import { GraphConnection } from "./GraphConnection.js";

/**
 * @typedef {import('./NodeRenderer.js').NodeRenderer} NodeRenderer
 * @typedef {import('./WorkspaceNavigator.js').WorkspaceNavigator} WorkspaceNavigator
 * @typedef {import('./ConnectionRenderer.js').ConnectionRenderer} ConnectionRenderer
 */

/**
 * @typedef {{ nodeId: string, pinId: string }} PinRef
 */

/**
 * @typedef {{
 *   direction: 'input' | 'output',
 *   source: PinRef | undefined,
 *   target: PinRef | undefined,
 *   path: SVGPathElement,
 *   circle: SVGCircleElement,
 *   anchorX: number,
 *   anchorY: number,
 *   lastPointerX: number,
 *   lastPointerY: number,
 * }} PendingConnection
 */

/**
 * Handles pin-to-pin connection dragging in world-space.
 *
 * Mirrors the gesture flow from Picograph's BlueprintWorkspace:
 *   pointerdown on handle → temp SVG path follows cursor → pointerup on
 *   compatible pin → commit connection.
 *
 * Only active when {@link PinConnectionManager.enabled} is true.
 */
export class PinConnectionManager {
    /** @type {HTMLElement} */
    #canvas;

    /** @type {SVGElement} */
    #svg;

    /** @type {HTMLElement} */
    #nodeLayer;

    /** @type {NodeRenderer} */
    #nodeRenderer;

    /** @type {WorkspaceNavigator} */
    #nav;

    /** @type {ConnectionRenderer} */
    #connRenderer;

    /** @type {PendingConnection | null} */
    #pending = null;

    /** @type {boolean} */
    #enabled = false;

    /**
     * @param {HTMLElement} canvas - Workspace canvas element.
     * @param {SVGElement} svg - Connection layer SVG element.
     * @param {HTMLElement} nodeLayer - Node layer element.
     * @param {NodeRenderer} nodeRenderer
     * @param {WorkspaceNavigator} nav
     * @param {ConnectionRenderer} connRenderer
     */
    constructor(canvas, svg, nodeLayer, nodeRenderer, nav, connRenderer) {
        this.#canvas       = canvas;
        this.#svg          = svg;
        this.#nodeLayer    = nodeLayer;
        this.#nodeRenderer = nodeRenderer;
        this.#nav          = nav;
        this.#connRenderer = connRenderer;

        this.#nodeLayer.addEventListener("pointerdown", (e) => {
            if (!this.#enabled) return;
            this.#handleNodeLayerPointerDown(e);
        });

        this.#nodeLayer.addEventListener("pointerenter", (e) => this.#handlePinHover(e, true),  true);
        this.#nodeLayer.addEventListener("pointerleave", (e) => this.#handlePinHover(e, false), true);
    }

    // ─── Public ───────────────────────────────────────────────────────────────

    /** @param {boolean} v */
    set enabled(v) { this.#enabled = v; }

    /** @returns {boolean} */
    get enabled() { return this.#enabled; }

    /** @returns {PendingConnection | null} */
    get pending() { return this.#pending; }

    // ─── Private — event detection ─────────────────────────────────────────────

    /**
     * Highlights or clears connection wires when the pointer enters or leaves a pin handle.
     *
     * @param {PointerEvent} e
     * @param {boolean} entering
     */
    #handlePinHover(e, entering) {
        const target = /** @type {HTMLElement} */ (e.target);
        const handle = target.closest(".pin-handle");
        if (!handle) return;

        const pinContainer = handle.closest("[data-pin-id]");
        const nodeArticle  = handle.closest("[data-node-id]");
        if (!pinContainer || !nodeArticle) return;

        const nodeId = /** @type {HTMLElement} */ (nodeArticle).dataset.nodeId;
        const pinId  = /** @type {HTMLElement} */ (pinContainer).dataset.pinId;
        if (!nodeId || !pinId) return;

        if (entering) {
            this.#connRenderer.highlightPin(nodeId, pinId);
        } else {
            this.#connRenderer.clearHighlight();
        }
    }

    /**
     * @param {PointerEvent} e
     */
    #handleNodeLayerPointerDown(e) {
        if (e.button !== 0) return;

        const target = /** @type {HTMLElement} */ (e.target);
        const handle = target.closest(".pin-handle");
        if (!handle) return;

        const pinContainer = handle.closest("[data-pin-id]");
        const nodeArticle  = handle.closest("[data-node-id]");
        if (!pinContainer || !nodeArticle) return;

        const nodeId    = /** @type {HTMLElement} */ (nodeArticle).dataset.nodeId;
        const pinId     = /** @type {HTMLElement} */ (pinContainer).dataset.pinId;
        const direction = /** @type {'input'|'output'} */ (
            /** @type {HTMLElement} */ (pinContainer).dataset.direction
        );

        if (!nodeId || !pinId || !direction) return;

        // Retrieve the pin kind so we can colour the temp wire
        const node = this.#nodeRenderer.getNodes().find(n => n.id === nodeId);
        if (!node) return;
        const pin = node.getPin(pinId);
        if (!pin) return;

        this.#startPendingConnectionGesture(e, nodeId, pinId, direction, pin.kind);
    }

    // ─── Private — gesture ────────────────────────────────────────────────────

    /**
     * Mirrors Picograph's `#startPendingConnectionGesture`.
     *
     * @param {PointerEvent} event
     * @param {string} nodeId
     * @param {string} pinId
     * @param {'input'|'output'} direction
     * @param {string} kind
     */
    #startPendingConnectionGesture(event, nodeId, pinId, direction, kind) {
        if (this.#pending) this.#cancelPendingConnection();

        event.stopPropagation();
        event.preventDefault();

        const path = this.#createConnectionPath(kind);
        this.#svg.appendChild(path);
        
        // Add endpoint circle for visual cursor alignment
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", getTypeColor(kind));
        circle.setAttribute("opacity", "0.9");
        circle.dataset.pending = "true";
        this.#svg.appendChild(circle);

        // Compute initial anchor position in screen-space
        const canvasRect = this.#canvas.getBoundingClientRect();
        const startHandle = this.#nodeRenderer.getPinHandle(nodeId, pinId, direction);
        const startRect = startHandle ? startHandle.getBoundingClientRect() : null;
        const initAnchorX = startRect ? startRect.left - canvasRect.left + startRect.width / 2 : 0;
        const initAnchorY = startRect ? startRect.top - canvasRect.top + startRect.height / 2 : 0;

        this.#pending = {
            direction,
            source: direction === "output" ? { nodeId, pinId } : undefined,
            target: direction === "input"  ? { nodeId, pinId } : undefined,
            path,
            circle,
            anchorX:      initAnchorX,
            anchorY:      initAnchorY,
            lastPointerX: initAnchorX,
            lastPointerY: initAnchorY,
        };

        const handlePointerMove = (/** @type {PointerEvent} */ moveE) => {
            if (moveE.pointerId !== event.pointerId) return;
            this.#updatePendingConnectionPath(moveE.clientX, moveE.clientY, nodeId, pinId, direction);
        };

        const handlePointerUp = (/** @type {PointerEvent} */ upE) => {
            if (upE.pointerId !== event.pointerId) return;

            window.removeEventListener("pointermove",   handlePointerMove);
            window.removeEventListener("pointerup",     handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);

            this.#tryFinalizeAtPoint(upE.clientX, upE.clientY);
        };

        window.addEventListener("pointermove",   handlePointerMove);
        window.addEventListener("pointerup",     handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
    }

    /**
     * Mirrors Picograph's `#updatePendingConnectionPath`.
     *
     * @param {number} clientX
     * @param {number} clientY
     * @param {string} nodeId
     * @param {string} pinId
     * @param {'input'|'output'} direction
     */
    #updatePendingConnectionPath(clientX, clientY, nodeId, pinId, direction) {
        if (!this.#pending) return;

        const startHandle = this.#nodeRenderer.getPinHandle(nodeId, pinId, direction);
        if (!startHandle) return;

        const canvasRect = this.#canvas.getBoundingClientRect();
        const startRect = startHandle.getBoundingClientRect();

        // Screen-space coordinates
        const anchor = {
            x: startRect.left - canvasRect.left + startRect.width / 2,
            y: startRect.top - canvasRect.top + startRect.height / 2,
        };
        const pointer = {
            x: clientX - canvasRect.left,
            y: clientY - canvasRect.top,
        };

        // Keep anchor and pointer up-to-date for springback animation
        this.#pending.anchorX = anchor.x;
        this.#pending.anchorY = anchor.y;
        this.#pending.lastPointerX = pointer.x;
        this.#pending.lastPointerY = pointer.y;

        const start = direction === "output" ? anchor : pointer;
        const end   = direction === "output" ? pointer : anchor;

        const cpOffset = Math.max(60, Math.abs(end.x - start.x) * 0.5);
        
        // Lerp pointer-side control point based on drag direction
        // When pointer.x >= anchor.x: factor = 0 (forward, offset = -cpOffset)
        // When pointer.x < anchor.x: factor increases (backward, offset lerps to +cpOffset)
        const dragDelta = pointer.x - anchor.x;
        const lerpFactor = Math.max(0, Math.min(1, -dragDelta / (cpOffset * 2)));
        const pointerCpOffset = -cpOffset + (lerpFactor * cpOffset * 2); // lerp from -cpOffset to +cpOffset
        
        // Make the pointer-side control point curve toward the pin
        let cp1x, cp1y, cp2x, cp2y;
        if (direction === "output") {
            // start = anchor (pin), end = pointer
            // Anchor side always extends right, pointer side lerps
            cp1x = start.x + cpOffset;
            cp1y = start.y;
            cp2x = end.x + pointerCpOffset;
            cp2y = end.y + (anchor.y - pointer.y) * 0.5; // curve toward anchor
        } else {
            // start = pointer, end = anchor (pin)
            // Pointer side lerps, anchor side always extends left
            cp1x = start.x + pointerCpOffset;
            cp1y = start.y + (anchor.y - pointer.y) * 0.5; // curve toward anchor
            cp2x = end.x - cpOffset;
            cp2y = end.y;
        }
        
        const d = `M ${start.x} ${start.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${end.x} ${end.y}`;

        this.#pending.path.dataset.active = "true";
        this.#pending.path.setAttribute("d", d);
        
        // Update circle position to pointer location
        this.#pending.circle.setAttribute("cx", pointer.x.toString());
        this.#pending.circle.setAttribute("cy", pointer.y.toString());
    }

    /**
     * Checks the elements under the pointer on release for a compatible pin.
     * Mirrors the drop detection pattern from Picograph's WorkspaceNodeRenderer's
     * `pointerup` handler on pin containers.
     *
     * @param {number} clientX
     * @param {number} clientY
     */
    #tryFinalizeAtPoint(clientX, clientY) {
        if (!this.#pending) return;

        const elements = document.elementsFromPoint(clientX, clientY);
        for (const el of elements) {
            if (!(el instanceof HTMLElement)) continue;

            const pinContainer = el.closest("[data-pin-id]");
            const nodeArticle  = el.closest("[data-node-id]");
            if (!pinContainer || !nodeArticle) continue;

            const targetNodeId    = /** @type {HTMLElement} */ (nodeArticle).dataset.nodeId;
            const targetPinId     = /** @type {HTMLElement} */ (pinContainer).dataset.pinId;
            const targetDirection = /** @type {'input'|'output'} */ (
                /** @type {HTMLElement} */ (pinContainer).dataset.direction
            );

            if (!targetNodeId || !targetPinId || !targetDirection) continue;

            this.#finalizeConnection(targetNodeId, targetPinId, targetDirection);
            return;
        }

        this.#cancelPendingConnection();
    }

    /**
     * Mirrors Picograph's `#finalizeConnection`.
     *
     * @param {string} nodeId
     * @param {string} pinId
     * @param {'input'|'output'} direction
     */
    #finalizeConnection(nodeId, pinId, direction) {
        if (!this.#pending) return;

        const { source, target } = this.#pending;

        /** @type {PinRef | null} */
        let fromRef = null;
        /** @type {PinRef | null} */
        let toRef   = null;

        if (direction === "input" && source) {
            fromRef = source;
            toRef   = { nodeId, pinId };
        } else if (direction === "output" && target) {
            fromRef = { nodeId, pinId };
            toRef   = target;
        }

        if (fromRef && toRef && fromRef.nodeId !== toRef.nodeId) {
            const fromNode = this.#nodeRenderer.getNodes().find(n => n.id === fromRef.nodeId);
            const toNode   = this.#nodeRenderer.getNodes().find(n => n.id === toRef.nodeId);
            const fromPin  = fromNode?.getPin(fromRef.pinId);
            const toPin    = toNode?.getPin(toRef.pinId);

            if (fromPin && toPin && this.#kindsCompatible(fromPin.kind, toPin.kind)) {
                const conn = new GraphConnection(fromRef, toRef, fromPin.kind);
                this.#nodeRenderer.addConnection(conn);
                this.#pending.path.remove();
                this.#pending.circle.remove();
                this.#pending = null;
                this.#connRenderer.render();
                return;
            }
        }

        this.#cancelPendingConnection();
    }

    /**
     * Mirrors Picograph's `#cancelPendingConnection`.
     * Launches a springback animation before removing the wire.
     */
    #cancelPendingConnection() {
        if (!this.#pending) return;

        const { path, circle, direction, anchorX, anchorY, lastPointerX, lastPointerY } = this.#pending;
        this.#pending = null;
        
        // Remove circle immediately (no springback needed)
        circle.remove();

        this.#animateWireSpringback(path, direction, anchorX, anchorY, lastPointerX, lastPointerY);
    }

    /**
     * Retracts the wire with a whip character: the free end snaps home quickly
     * while the bezier arch sags and decays at a slower rate, giving the visual
     * impression of a real cable being released.
     *
     * @param {SVGPathElement} path
     * @param {'input'|'output'} direction
     * @param {number} anchorX - Anchor screen-space X.
     * @param {number} anchorY - Anchor screen-space Y.
     * @param {number} fromX   - Free-end X at release.
     * @param {number} fromY   - Free-end Y at release.
     */
    #animateWireSpringback(path, direction, anchorX, anchorY, fromX, fromY) {
        // Endpoint snaps home fast; arch shape collapses slower — two different rates
        // produce the non-linear whip character.
        const endpointDecay = 0.022; // px/ms half-life ~31ms — fast snap
        const archDecay     = 0.007; // half-life ~99ms — slow arch collapse
        const wobbleDecay   = 0.008; // wobble amplitude decay (slower than endpoint, faster than arch)

        let px = fromX;
        let py = fromY;

        // Initial sag magnitude: proportional to release distance, capped.
        const releaseDist = Math.sqrt((fromX - anchorX) ** 2 + (fromY - anchorY) ** 2);
        let sag = Math.min(releaseDist * 0.1, 30); // Reduced from 0.4/120
        let wobbleAmplitude = Math.min(releaseDist * 0.4, 80); // Increased from 0.3/60

        let lastTime = performance.now();
        let phase = 0;
        const wobbleFreq = 0.018; // radians per ms (~2.8 Hz) - increased frequency

        /** @param {number} now */
        const tick = (now) => {
            const dt = Math.min(now - lastTime, 32);
            lastTime = now;

            // Endpoint: fast exponential decay toward anchor
            const ef = Math.exp(-endpointDecay * dt);
            px = anchorX + (px - anchorX) * ef;
            py = anchorY + (py - anchorY) * ef;

            // Arch sag: slower exponential decay
            const af = Math.exp(-archDecay * dt);
            sag *= af;

            // Wobble: amplitude decay + phase advance
            const wf = Math.exp(-wobbleDecay * dt);
            wobbleAmplitude *= wf;
            phase += wobbleFreq * dt;

            const dx   = anchorX - px;
            const dy   = anchorY - py;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const start = direction === "output" ? { x: anchorX, y: anchorY } : { x: px, y: py };
            const end   = direction === "output" ? { x: px, y: py }           : { x: anchorX, y: anchorY };

            // Control points: standard horizontal tension + perpendicular sag offset + sine wave wobble
            const mx = (start.x + end.x) / 2;
            const my = (start.y + end.y) / 2;
            const len = Math.max(dist, 1);
            // Perpendicular unit vector (rotated 90°)
            const perpX = -(end.y - start.y) / len;
            const perpY =  (end.x - start.x) / len;

            const tension = Math.max(20, dist * 0.45);
            
            // Apply sine wave wobble to anchor-side control point only
            const wobble = Math.sin(phase) * wobbleAmplitude;
            
            // Anchor is at 'start' for output pins, 'end' for input pins
            const cp1x = start.x + tension + perpX * (sag + (direction === "output" ? wobble : 0));
            const cp1y = start.y           + perpY * (sag + (direction === "output" ? wobble : 0));
            const cp2x = end.x   - tension + perpX * (sag + (direction === "input" ? wobble : 0));
            const cp2y = end.y             + perpY * (sag + (direction === "input" ? wobble : 0));

            path.setAttribute("d",
                `M ${start.x} ${start.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${end.x} ${end.y}`
            );

            if (dist < 1 && sag < 1 && wobbleAmplitude < 0.5) {
                path.remove();
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    }

    // ─── Private — helpers ────────────────────────────────────────────────────

    /**
     * Creates a styled SVG path element for the pending wire.
     * Matches Picograph's `#createConnectionPath`.
     *
     * @param {string} kind
     * @returns {SVGPathElement}
     */
    #createConnectionPath(kind) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-dasharray", "6 4");
        path.style.stroke   = getTypeColor(kind);
        path.style.opacity  = "0.8";
        path.dataset.kind   = kind;
        path.dataset.pending = "true";
        return path;
    }

    /**
     * Returns true if two pin kinds can be connected.
     * Mirrors Picograph's type compatibility (any pin accepts `any`).
     *
     * @param {string} a
     * @param {string} b
     * @returns {boolean}
     */
    #kindsCompatible(a, b) {
        return a === b || a === "any" || b === "any";
    }
}
