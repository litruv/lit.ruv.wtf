/**
 * Handles pan and zoom for the graph workspace canvas.
 * Ported directly from WorkspaceNavigationManager in Picograph.
 * Grid is CSS-driven; this class updates CSS custom properties and background position.
 */
export class WorkspaceNavigator {
    /** @type {HTMLElement} */
    #canvas;

    /** @type {HTMLElement | null} */
    #worldLayer = null;

    /** @type {(() => void) | null} */
    #onAfterTransform = null;

    /** @type {{ x: number, y: number }} */
    #backgroundOffset = { x: 0, y: 0 };

    /** @type {{ x: number, y: number }} */
    #pendingLayerOffset = { x: 0, y: 0 };

    /** @type {number} */
    #zoomLevel = 1;

    /** @type {number} */
    #targetZoomLevel = 1;

    /** @type {{ min: number, max: number, step: number }} */
    #zoomConfig = { min: 0.25, max: 2.5, step: 0.1 };

    /** @type {number | null} */
    #smoothZoomRafId = null;

    /** @type {number | null} */
    #focusAnimRafId = null;

    /** @type {number} */
    #focusAnimGen = 0;

    /** @type {{ screenPoint: { x: number, y: number }, pointer: { clientX?: number, clientY?: number } } | null} */
    #smoothZoomFocus = null;

    /** @type {{ pointerId: number, startX: number, startY: number, currentClientX: number, currentClientY: number, hasMoved: boolean, backgroundOrigin: { x: number, y: number }, lastDelta: { x: number, y: number } } | null} */
    #panState = null;

    /** @type {number} */
    #lastPanTimestamp = 0;

    /** @type {{ width: number, height: number }} */
    #lastCanvasSize = { width: 0, height: 0 };

    /** @type {{ touches: Map<number, {x: number, y: number}>, initialDistance: number, initialZoom: number, initialBackgroundOffset: {x: number, y: number}, center: {x: number, y: number} } | null} */
    #pinchState = null;

    /** @type {(() => boolean) | null} */
    #isDragInProgress = null;

    /** @type {(() => void) | null} */
    #onPinchStart = null;

    /**
     * @param {HTMLElement} canvas - The `.workspace-canvas` element.
     * @param {HTMLElement | null} [worldLayer] - Optional world-space layer to transform with pan/zoom.
     * @param {(() => void) | null} [onAfterTransform] - Called after every transform update.
     */
    constructor(canvas, worldLayer = null, onAfterTransform = null) {
        this.#canvas = canvas;
        this.#worldLayer = worldLayer;
        this.#onAfterTransform = onAfterTransform;
        const initialRect = canvas.getBoundingClientRect();
        this.#lastCanvasSize = { width: initialRect.width, height: initialRect.height };
        this.#updateZoomDisplay();
        this.#bindEvents();
        this.#bindResizeObserver();
    }

    /**
     * Sets the callback fired after every transform update.
     * Assign this AFTER constructing dependent renderers to avoid temporal dead zone issues.
     *
     * @param {(() => void) | null} cb
     */
    setOnAfterTransform(cb) {
        this.#onAfterTransform = cb;
    }

    /**
     * Registers a callback that returns true when a node drag is actively in progress.
     * When true, single-finger touch and pointer pan will be suppressed so the drag
     * can move the node without competing with the pan handler.
     *
     * @param {(() => boolean) | null} fn
     */
    setDragInProgressChecker(fn) {
        this.#isDragInProgress = fn;
    }

    /**
     * Registers a callback fired when a two-finger pinch gesture begins.
     * Use this to cancel any active node drag before the zoom takes over.
     *
     * @param {(() => void) | null} fn
     */
    setOnPinchStart(fn) {
        this.#onPinchStart = fn;
    }

    /** True while a two-finger pinch gesture is in progress. */
    get isPinching() { return this.#pinchState !== null; }

    /**
     * Pans the viewport by a world-space delta.
     * Used by ItemDragger's edge-pan loop to scroll while dragging a node.
     *
     * @param {number} worldDx
     * @param {number} worldDy
     */
    panBy(worldDx, worldDy) {
        this.#setBackgroundOffset({
            x: this.#backgroundOffset.x + worldDx,
            y: this.#backgroundOffset.y + worldDy,
        });
    }

    // ─── Public ───────────────────────────────────────────────────────────────

    /** Current zoom level. */
    get zoom() { return this.#zoomLevel; }

    /** @returns {number} */
    get zoomLevel() { return this.#zoomLevel; }

    /**
     * Checks if a pan operation occurred recently (within the threshold).
     * Useful for suppressing context menus after right-click drag pans.
     *
     * @param {number} [thresholdMs=100] - Time window in milliseconds
     * @returns {boolean}
     */
    didPanRecently(thresholdMs = 100) {
        return (this.#timestamp() - this.#lastPanTimestamp) < thresholdMs;
    }

    /**
     * Returns the total effective offset (backgroundOffset + pendingLayerOffset).
     * Matches WorkspaceNavigationManager.getEffectiveOffset() in Picograph.
     *
     * @returns {{ x: number, y: number }}
     */
    getEffectiveOffset() {
        return {
            x: this.#backgroundOffset.x + this.#pendingLayerOffset.x,
            y: this.#backgroundOffset.y + this.#pendingLayerOffset.y,
        };
    }

    /** Reset view to origin, zoom 1. */
    reset() {
        if (this.#smoothZoomRafId !== null) {
            cancelAnimationFrame(this.#smoothZoomRafId);
            this.#smoothZoomRafId = null;
            this.#smoothZoomFocus = null;
        }
        this.#backgroundOffset = { x: 0, y: 0 };
        this.#pendingLayerOffset = { x: 0, y: 0 };
        this.#zoomLevel = 1;
        this.#targetZoomLevel = 1;
        this.#updateZoomDisplay();
    }

    /**
     * Animates the viewport to frame a world-space rect.
     * Respects a minimum framing fraction so nodes never appear too small.
     *
     * @param {{ x: number, y: number, width: number, height: number }} worldRect World-space bounds to frame.
     * @param {{ paddingFraction?: number, durationMs?: number, minWorldBox?: { width: number, height: number }, responsiveWorldBox?: { minViewportWidth: number, minWorldBox: { width: number, height: number }, anchorX?: number, anchorY?: number } | Array<{ minViewportWidth: number, minWorldBox: { width: number, height: number }, anchorX?: number, anchorY?: number }>, anchorX?: number, anchorY?: number }} [options]
     *   anchorX/anchorY are screen-space fractions (0–1) for where the rect centre lands.
     *   0.5,0.5 = screen centre (default). 0.0,0.5 = left edge centre. 0.0,0.0 = top-left.
     *   responsiveWorldBox allows overriding minWorldBox, anchorX, anchorY based on viewport width.
     *   Can be a single breakpoint object or an array of breakpoints (evaluated largest to smallest).
     */
    animateFocusOnRect(worldRect, options = {}) {
        let {
            paddingFraction  = 0.0,
            durationMs       = 550,
            minWorldBox      = null,   // { width, height } — minimum world-space area that must be visible
            responsiveWorldBox = null, // { minViewportWidth, minWorldBox, anchorX?, anchorY? } — overrides when viewport is smaller
            anchorX          = 0.5,    // screen-space X fraction where rect centre is placed
            anchorY          = 0.5,    // screen-space Y fraction where rect centre is placed
        } = options;

        // Cancel any ongoing smooth zoom and commit pending offset
        if (this.#smoothZoomRafId !== null) {
            cancelAnimationFrame(this.#smoothZoomRafId);
            this.#smoothZoomRafId = null;
            this.#smoothZoomFocus = null;
            const pending = this.#pendingLayerOffset;
            this.#pendingLayerOffset = { x: 0, y: 0 };
            if (Math.abs(pending.x) > 0.0001 || Math.abs(pending.y) > 0.0001) {
                this.#setBackgroundOffset({
                    x: this.#backgroundOffset.x + pending.x,
                    y: this.#backgroundOffset.y + pending.y,
                });
            }
        }

        const canvasRect = this.#canvas.getBoundingClientRect();
        const vw = canvasRect.width;
        const vh = canvasRect.height;

        // Check if we should use responsive settings
        if (responsiveWorldBox) {
            const breakpoints = Array.isArray(responsiveWorldBox) ? responsiveWorldBox : [responsiveWorldBox];
            // Sort ascending — smallest threshold that still exceeds window width wins (most specific match)
            const sorted = [...breakpoints].sort((a, b) => (a.minViewportWidth ?? 0) - (b.minViewportWidth ?? 0));
            
            // Find first matching breakpoint where window is smaller than threshold
            const windowWidth = window.innerWidth;
            for (const bp of sorted) {
                if (windowWidth < (bp.minViewportWidth ?? Infinity)) {
                    minWorldBox = bp.minWorldBox ?? minWorldBox;
                    anchorX = bp.anchorX ?? anchorX;
                    anchorY = bp.anchorY ?? anchorY;
                    break;
                }
            }
        }

        const pad = Math.min(vw, vh) * paddingFraction;
        const availW = Math.max(1, vw - pad * 2);
        const availH = Math.max(1, vh - pad * 2);

        // The framing rect is the union of worldRect and the minWorldBox centred on it
        let frameW = Math.max(1, worldRect.width);
        let frameH = Math.max(1, worldRect.height);

        if (minWorldBox) {
            // Expand frame to at least minWorldBox dimensions, centred on worldRect centre
            frameW = Math.max(frameW, minWorldBox.width  ?? 0);
            frameH = Math.max(frameH, minWorldBox.height ?? 0);
        }

        // Zoom to fit the frame rect inside the available viewport
        let targetZoom = Math.min(availW / frameW, availH / frameH);
        targetZoom = Math.max(this.#zoomConfig.min, Math.min(this.#zoomConfig.max, targetZoom));

        // Calculate the target world center based on node and minWorldBox
        const worldCx = worldRect.x + Math.max(1, worldRect.width)  / 2;
        const worldCy = worldRect.y + Math.max(1, worldRect.height) / 2;

        let targetWorldCenterX = worldCx;
        let targetWorldCenterY = worldCy;

        if (minWorldBox) {
            // When minWorldBox exists, anchor positions the node WITHIN the box.
            // The box itself should be centered on screen (ignoring anchor for box positioning).
            // Calculate worldbox bounds with node positioned at anchor within it
            const boxX = worldCx - minWorldBox.width * anchorX;
            const boxY = worldCy - minWorldBox.height * anchorY;
            targetWorldCenterX = boxX + minWorldBox.width / 2;
            targetWorldCenterY = boxY + minWorldBox.height / 2;
        }

        // Position the target point at viewport center
        const centerScreenX = pad + availW / 2;
        const centerScreenY = pad + availH / 2;
        const targetOffsetX = centerScreenX / targetZoom - targetWorldCenterX;
        const targetOffsetY = centerScreenY / targetZoom - targetWorldCenterY;

        const fromZoom    = this.#zoomLevel;
        const fromOffsetX = this.#backgroundOffset.x;
        const fromOffsetY = this.#backgroundOffset.y;

        const gen = ++this.#focusAnimGen;
        const start = this.#timestamp();

        const tick = () => {
            if (this.#focusAnimGen !== gen) return;
            const elapsed = this.#timestamp() - start;
            const t = Math.min(elapsed / durationMs, 1);
            const eased = 1 - Math.pow(1 - t, 3);

            this.#zoomLevel = fromZoom + (targetZoom - fromZoom) * eased;
            this.#targetZoomLevel = this.#zoomLevel;
            this.#setBackgroundOffset({
                x: fromOffsetX + (targetOffsetX - fromOffsetX) * eased,
                y: fromOffsetY + (targetOffsetY - fromOffsetY) * eased,
            });
            this.#updateZoomDisplay();

            if (t < 1) {
                this.#focusAnimRafId = requestAnimationFrame(tick);
            } else {
                this.#focusAnimRafId = null;
                this.#zoomLevel = targetZoom;
                this.#targetZoomLevel = targetZoom;
            }
        };
        this.#focusAnimRafId = requestAnimationFrame(tick);
    }

    /**
     * Instantly fits a world-space rect into the viewport with optional padding.
     * The zoom is chosen to fit the rect; aspect-ratio mismatches are letter-boxed.
     *
     * @param {{ x: number, y: number, width: number, height: number }} worldRect
     * @param {{ paddingFraction?: number }} [options]
     */
    focusOnRect(worldRect, { paddingFraction = 0, anchorX = 0.5, anchorY = 0.5 } = {}) {
        if (this.#smoothZoomRafId !== null) {
            cancelAnimationFrame(this.#smoothZoomRafId);
            this.#smoothZoomRafId = null;
            this.#smoothZoomFocus = null;
        }
        if (this.#focusAnimRafId !== null) {
            cancelAnimationFrame(this.#focusAnimRafId);
            this.#focusAnimRafId = null;
            this.#focusAnimGen++;
        }
        this.#pendingLayerOffset = { x: 0, y: 0 };
        const canvas = this.#canvas.getBoundingClientRect();
        const vw = canvas.width;
        const vh = canvas.height;
        const pad  = Math.min(vw, vh) * paddingFraction;
        const availW = Math.max(1, vw - pad * 2);
        const availH = Math.max(1, vh - pad * 2);
        const zoom = Math.max(
            this.#zoomConfig.min,
            Math.min(this.#zoomConfig.max,
                Math.min(availW / Math.max(1, worldRect.width), availH / Math.max(1, worldRect.height))
            )
        );
        const centerScreenX = pad + anchorX * availW;
        const centerScreenY = pad + anchorY * availH;
        const cx = worldRect.x + worldRect.width  / 2;
        const cy = worldRect.y + worldRect.height / 2;
        this.#zoomLevel = zoom;
        this.#targetZoomLevel = zoom;
        this.#setBackgroundOffset({
            x: centerScreenX / zoom - cx,
            y: centerScreenY / zoom - cy,
        });
        this.#updateZoomDisplay();
    }

    /**
     * Immediately centres the viewport on a world-space point at the given zoom.
     * @param {{ x: number, y: number }} worldPoint World-space coordinates to centre on.
     * @param {number} [zoom] Zoom level to snap to.
     */
    focusOnWorld(worldPoint, zoom = 1) {
        if (this.#smoothZoomRafId !== null) {
            cancelAnimationFrame(this.#smoothZoomRafId);
            this.#smoothZoomRafId = null;
            this.#smoothZoomFocus = null;
        }
        this.#pendingLayerOffset = { x: 0, y: 0 };
        const clamped = Math.max(this.#zoomConfig.min, Math.min(this.#zoomConfig.max, zoom));
        this.#zoomLevel = clamped;
        this.#targetZoomLevel = clamped;
        const rect = this.#canvas.getBoundingClientRect();
        this.#setBackgroundOffset({
            x: rect.width  / 2 / clamped - worldPoint.x,
            y: rect.height / 2 / clamped - worldPoint.y,
        });
        this.#updateZoomDisplay();
    }

    /**
     * Returns the current viewport info in world space.
     *
     * @returns {{ zoom: number, center: { x: number, y: number }, viewbox: { x: number, y: number, width: number, height: number } }}
     */
    getViewInfo() {
        const rect = this.#canvas.getBoundingClientRect();
        const zoom = this.#zoomLevel || 1;
        const eff  = this.getEffectiveOffset();
        const vx   = -eff.x;
        const vy   = -eff.y;
        const vw   = rect.width  / zoom;
        const vh   = rect.height / zoom;
        return {
            zoom,
            viewbox: { x: vx, y: vy, width: vw, height: vh },
            center:  { x: vx + vw / 2, y: vy + vh / 2 },
        };
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    #bindResizeObserver() {
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { inlineSize: newW, blockSize: newH } = entry.contentBoxSize[0];
                const dw = newW - this.#lastCanvasSize.width;
                const dh = newH - this.#lastCanvasSize.height;
                this.#lastCanvasSize = { width: newW, height: newH };
                if (Math.abs(dw) < 0.5 && Math.abs(dh) < 0.5) continue;
                const zoom = this.#zoomLevel || 1;
                this.#setBackgroundOffset({
                    x: this.#backgroundOffset.x + dw / 2 / zoom,
                    y: this.#backgroundOffset.y + dh / 2 / zoom,
                });
                this.#updateZoomDisplay();
            }
        });
        observer.observe(this.#canvas);
    }

    #bindEvents() {
        this.#canvas.addEventListener("wheel", (e) => this.#onWheel(e), { passive: false });
        this.#canvas.addEventListener("pointerdown", (e) => this.#onPointerDown(e));
        this.#canvas.addEventListener("touchstart", (e) => this.#onTouchStart(e), { passive: false });
        this.#canvas.addEventListener("touchmove", (e) => this.#onTouchMove(e), { passive: false });
        this.#canvas.addEventListener("touchend", (e) => this.#onTouchEnd(e), { passive: false });
        this.#canvas.addEventListener("touchcancel", (e) => this.#onTouchEnd(e), { passive: false });
        this.#canvas.addEventListener("contextmenu", (e) => {
            // Suppress context menu if pan just ended (matches original 200ms threshold)
            if (this.#timestamp() - this.#lastPanTimestamp < 200) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
        });
    }

    /** @param {WheelEvent} e */
    #onWheel(e) {
        if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return;

        const rect = this.#canvas.getBoundingClientRect();
        const screenPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        if (screenPoint.x < 0 || screenPoint.y < 0 || screenPoint.x > rect.width || screenPoint.y > rect.height) return;

        e.preventDefault();
        const direction = e.deltaY < 0 ? 1 : -1;
        this.#pushSmoothZoom(screenPoint, direction, { clientX: e.clientX, clientY: e.clientY });
    }

    /** @param {PointerEvent} e */
    #onPointerDown(e) {
        if (e.button !== 0 && e.button !== 2) return;
        this.#beginPan(e);
    }

    // ─── Touch (Pinch-to-Zoom) ────────────────────────────────────────────────

    /** @param {TouchEvent} e */
    #onTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            // Drop any active node drag before pinch-zoom takes control
            this.#onPinchStart?.();
            const rect = this.#canvas.getBoundingClientRect();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            
            const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
            const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
            
            const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const center = {
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            };
            
            this.#pinchState = {
                touches: new Map([
                    [t1.identifier, p1],
                    [t2.identifier, p2]
                ]),
                initialDistance: distance,
                initialZoom: this.#zoomLevel,
                initialBackgroundOffset: { ...this.#backgroundOffset },
                center: center
            };
            
            // Cancel pan state when pinch starts
            this.#panState = null;
        } else if (e.touches.length === 1 && !this.#panState) {
            // If a node drag is in progress, suppress single-finger pan so the node moves instead
            if (this.#isDragInProgress?.()) return;
            // Single finger pan - only if not already panning
            const touch = e.touches[0];
            this.#panState = {
                pointerId: touch.identifier,
                startX: touch.clientX,
                startY: touch.clientY,
                currentClientX: touch.clientX,
                currentClientY: touch.clientY,
                hasMoved: false,
                backgroundOrigin: { ...this.#backgroundOffset },
                lastDelta: { x: 0, y: 0 },
            };
        }
    }

    /** @param {TouchEvent} e */
    #onTouchMove(e) {
        // Handle two-finger pinch + pan
        if (this.#pinchState && e.touches.length === 2) {
            e.preventDefault();
            const rect = this.#canvas.getBoundingClientRect();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            
            const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top };
            const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top };
            
            // Calculate current distance for zoom
            const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const scale = currentDistance / this.#pinchState.initialDistance;
            
            let newZoom = this.#pinchState.initialZoom * scale;
            newZoom = Math.max(this.#zoomConfig.min, Math.min(this.#zoomConfig.max, newZoom));
            
            // Calculate current center for pan
            const currentCenter = {
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            };
            
            // Pan delta in screen space
            const panDeltaScreen = {
                x: currentCenter.x - this.#pinchState.center.x,
                y: currentCenter.y - this.#pinchState.center.y
            };
            
            const previousZoom = this.#zoomLevel;
            const initialCenter = this.#pinchState.center;
            
            // World point under initial pinch center (using initial background offset)
            const worldPoint = {
                x: initialCenter.x / this.#pinchState.initialZoom - this.#pinchState.initialBackgroundOffset.x,
                y: initialCenter.y / this.#pinchState.initialZoom - this.#pinchState.initialBackgroundOffset.y
            };
            
            this.#zoomLevel = newZoom;
            this.#targetZoomLevel = newZoom;
            
            // Adjust offset to keep world point under pinch center AND apply pan
            this.#setBackgroundOffset({
                x: initialCenter.x / newZoom - worldPoint.x + panDeltaScreen.x / newZoom,
                y: initialCenter.y / newZoom - worldPoint.y + panDeltaScreen.y / newZoom
            });
            
            this.#updateZoomDisplay();
            return;
        }
        
        // Handle single-finger pan
        if (this.#panState && e.touches.length === 1) {
            const touch = e.touches[0];
            
            this.#panState.currentClientX = touch.clientX;
            this.#panState.currentClientY = touch.clientY;

            const deltaXScreen = touch.clientX - this.#panState.startX;
            const deltaYScreen = touch.clientY - this.#panState.startY;
            const zoom = this.#zoomLevel || 1;
            const worldDelta = { x: deltaXScreen / zoom, y: deltaYScreen / zoom };

            if (!this.#panState.hasMoved) {
                if (Math.hypot(deltaXScreen, deltaYScreen) < 3) return;
                e.preventDefault();
                this.#panState.hasMoved = true;
            }

            if (this.#panState.hasMoved) {
                e.preventDefault();
            }

            this.#panState.lastDelta = worldDelta;
            this.#setBackgroundOffset({
                x: this.#panState.backgroundOrigin.x + worldDelta.x,
                y: this.#panState.backgroundOrigin.y + worldDelta.y,
            });
            this.#updateZoomDisplay();
        }
    }

    /** @param {TouchEvent} e */
    #onTouchEnd(e) {
        // Clear pinch state if we go below 2 touches
        if (this.#pinchState && e.touches.length < 2) {
            this.#pinchState = null;
        }
        
        // Clear pan state if no touches remain
        if (this.#panState && e.touches.length === 0) {
            const finalState = this.#panState;
            this.#panState = null;
            if (finalState.hasMoved) {
                this.#lastPanTimestamp = this.#timestamp();
            }
        }
    }

    // ─── Pan ─────────────────────────────────────────────────────────────────

    /** @param {PointerEvent} event */
    #beginPan(event) {
        if (this.#panState || this.#pinchState) return;
        // Do not start a pan while a node drag is actively in progress
        if (this.#isDragInProgress?.()) return;

        const state = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            currentClientX: event.clientX,
            currentClientY: event.clientY,
            hasMoved: false,
            backgroundOrigin: { ...this.#backgroundOffset },
            lastDelta: { x: 0, y: 0 },
        };

        /** @param {PointerEvent} moveEvent */
        const handlePointerMove = (moveEvent) => {
            if (!this.#panState || moveEvent.pointerId !== this.#panState.pointerId) return;

            this.#panState.currentClientX = moveEvent.clientX;
            this.#panState.currentClientY = moveEvent.clientY;

            const deltaXScreen = moveEvent.clientX - this.#panState.startX;
            const deltaYScreen = moveEvent.clientY - this.#panState.startY;
            const zoom = this.#zoomLevel || 1;
            const worldDelta = { x: deltaXScreen / zoom, y: deltaYScreen / zoom };

            if (!this.#panState.hasMoved) {
                if (Math.hypot(deltaXScreen, deltaYScreen) < 3) return;
                moveEvent.preventDefault();
                this.#panState.hasMoved = true;
            }

            this.#panState.lastDelta = worldDelta;
            this.#setBackgroundOffset({
                x: this.#panState.backgroundOrigin.x + worldDelta.x,
                y: this.#panState.backgroundOrigin.y + worldDelta.y,
            });
            this.#updateZoomDisplay();
        };

        /** @param {PointerEvent} upEvent */
        const handlePointerUp = (upEvent) => {
            if (!this.#panState || upEvent.pointerId !== this.#panState.pointerId) return;
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            const finalState = this.#panState;
            this.#panState = null;
            if (finalState.hasMoved) {
                this.#lastPanTimestamp = this.#timestamp();
            }
        };

        this.#panState = state;
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
    }

    // ─── Smooth Zoom ──────────────────────────────────────────────────────────

    /**
     * @param {{ x: number, y: number }} screenPoint
     * @param {number} direction
     * @param {{ clientX?: number, clientY?: number }} [pointer]
     */
    #pushSmoothZoom(screenPoint, direction, pointer = {}) {
        if (!direction) return;
        // Cancel any in-progress rect focus animation
        if (this.#focusAnimRafId !== null) {
            cancelAnimationFrame(this.#focusAnimRafId);
            this.#focusAnimRafId = null;
            this.#focusAnimGen++;
        }
        const step = direction * this.#zoomConfig.step;
        this.#targetZoomLevel = Math.max(
            this.#zoomConfig.min,
            Math.min(this.#zoomConfig.max, this.#targetZoomLevel + step)
        );
        this.#smoothZoomFocus = { screenPoint, pointer };
        if (this.#smoothZoomRafId === null) {
            this.#smoothZoomRafId = requestAnimationFrame(() => this.#tickSmoothZoom());
        }
    }

    #tickSmoothZoom() {
        this.#smoothZoomRafId = null;
        if (!this.#smoothZoomFocus) return;

        const target = this.#targetZoomLevel;
        const current = this.#zoomLevel;
        const diff = target - current;
        const settled = Math.abs(diff) < 0.001;
        const newZoom = settled
            ? target
            : Math.max(this.#zoomConfig.min, Math.min(this.#zoomConfig.max, current + diff * 0.25));

        const { screenPoint } = this.#smoothZoomFocus;
        const previousZoom = current;

        // World point under cursor (using old zoom)
        const worldPoint = {
            x: screenPoint.x / previousZoom,
            y: screenPoint.y / previousZoom,
        };

        this.#zoomLevel = newZoom;

        const scale = previousZoom / newZoom;
        const shift = {
            x: worldPoint.x * (scale - 1),
            y: worldPoint.y * (scale - 1),
        };

        this.#pendingLayerOffset.x += shift.x;
        this.#pendingLayerOffset.y += shift.y;

        // Rebase active pan so world deltas stay stable mid-zoom
        if (Math.abs(shift.x) > 0.0001 || Math.abs(shift.y) > 0.0001) {
            this.#rebasePanAfterZoom(this.#smoothZoomFocus.pointer);
        }

        this.#canvas.style.setProperty("--workspace-zoom", `${newZoom}`);
        this.#applyBackgroundOffset();

        if (settled) {
            this.#smoothZoomFocus = null;
            const finalOffset = this.#pendingLayerOffset;
            this.#pendingLayerOffset = { x: 0, y: 0 };
            if (Math.abs(finalOffset.x) > 0.0001 || Math.abs(finalOffset.y) > 0.0001) {
                // Commit pivot into backgroundOffset (no nodes to translate on the website)
                this.#setBackgroundOffset({
                    x: this.#backgroundOffset.x + finalOffset.x,
                    y: this.#backgroundOffset.y + finalOffset.y,
                });
                // Also rebase pan origin so pan doesn't jump
                if (this.#panState) {
                    this.#panState.backgroundOrigin.x += finalOffset.x;
                    this.#panState.backgroundOrigin.y += finalOffset.y;
                }
            }
            this.#updateZoomDisplay();
        } else {
            this.#smoothZoomRafId = requestAnimationFrame(() => this.#tickSmoothZoom());
        }
    }

    // ─── Transform helpers ────────────────────────────────────────────────────

    /** @param {{ x: number, y: number }} offset */
    #setBackgroundOffset(offset) {
        this.#backgroundOffset = {
            x: Number.isFinite(offset.x) ? offset.x : 0,
            y: Number.isFinite(offset.y) ? offset.y : 0,
        };
        this.#applyBackgroundOffset();
    }

    #applyBackgroundOffset() {
        const zoom = this.#zoomLevel || 1;
        const scaledX = (this.#backgroundOffset.x + this.#pendingLayerOffset.x) * zoom;
        const scaledY = (this.#backgroundOffset.y + this.#pendingLayerOffset.y) * zoom;
        const position = `${scaledX}px ${scaledY}px`;
        this.#canvas.style.backgroundPosition = `${position}, ${position}, ${position}, ${position}`;
        this.#applyWorldLayerTransform();
    }

    #updateZoomDisplay() {
        const zoom = this.#zoomLevel || 1;
        this.#canvas.style.setProperty("--workspace-zoom", `${zoom}`);
        this.#applyBackgroundOffset(); // also calls #applyWorldLayerTransform
    }

    #applyWorldLayerTransform() {
        if (!this.#worldLayer) return;
        const zoom = this.#zoomLevel || 1;
        const tx = (this.#backgroundOffset.x + this.#pendingLayerOffset.x) * zoom;
        const ty = (this.#backgroundOffset.y + this.#pendingLayerOffset.y) * zoom;
        this.#worldLayer.style.transformOrigin = "0 0";
        this.#worldLayer.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
        this.#onAfterTransform?.();
    }

    /** @param {{ clientX?: number, clientY?: number }} [pointer] */
    #rebasePanAfterZoom(pointer) {
        if (!this.#panState) return;
        const zoom = this.#zoomLevel || 1;
        const clientX = Number.isFinite(this.#panState.currentClientX)
            ? this.#panState.currentClientX
            : pointer?.clientX;
        const clientY = Number.isFinite(this.#panState.currentClientY)
            ? this.#panState.currentClientY
            : pointer?.clientY;
        if (Number.isFinite(clientX)) {
            this.#panState.startX = clientX - this.#panState.lastDelta.x * zoom;
        }
        if (Number.isFinite(clientY)) {
            this.#panState.startY = clientY - this.#panState.lastDelta.y * zoom;
        }
    }

    /** @returns {number} */
    #timestamp() {
        return typeof performance !== "undefined" ? performance.now() : Date.now();
    }
}
