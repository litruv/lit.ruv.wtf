import { getTypeColor } from "./getTypeColor.js";

/**
 * @typedef {import('./GraphConnection.js').GraphConnection} GraphConnection
 * @typedef {import('./NodeRenderer.js').NodeRenderer} NodeRenderer
 * @typedef {import('./WorkspaceNavigator.js').WorkspaceNavigator} WorkspaceNavigator
 */

/**
 * Renders bezier SVG connections between node pins.
 * Matches the geometry logic of BlueprintWorkspace.#renderConnections / #computeConnectionGeometry.
 */
export class ConnectionRenderer {
    /** @type {SVGElement} */
    #svg;

    /** @type {HTMLElement} */
    #canvas;

    /** @type {NodeRenderer} */
    #nodeRenderer;

    /** @type {WorkspaceNavigator} */
    #nav;

    /** @type {Map<string, SVGPathElement>} */
    #paths = new Map();

    /** @type {Set<SVGPathElement>} */
    #highlightedPaths = new Set();

    /**
     * @param {SVGElement} svg The connection layer SVG element (world-space, inside worldLayer).
     * @param {HTMLElement} canvas The workspace canvas element (used for bounding rect).
     * @param {NodeRenderer} nodeRenderer
     * @param {WorkspaceNavigator} nav
     */
    constructor(svg, canvas, nodeRenderer, nav) {
        this.#svg = svg;
        this.#canvas = canvas;
        this.#nodeRenderer = nodeRenderer;
        this.#nav = nav;
    }

    /**
     * Redraws all connections. Call after DOM layout settles (e.g. rAF).
     */
    render() {
        const canvasRect = this.#canvas.getBoundingClientRect();
        const cw = canvasRect.width;
        const ch = canvasRect.height;
        const zoom = this.#nav.zoomLevel;

        const connections = this.#nodeRenderer.getConnections();
        const activeIds = new Set();

        connections.forEach(conn => {
            activeIds.add(conn.id);

            let path = this.#paths.get(conn.id);
            if (!path) {
                path = this.#createPath(conn.kind);
                this.#svg.appendChild(path);
                this.#paths.set(conn.id, path);
            }

            const geometry = this.#computeGeometry(conn, canvasRect);
            if (!geometry) {
                path.setAttribute("d", "");
                return;
            }

            const { start, end } = geometry;
            const cpOffset = Math.max(60 * zoom, Math.abs(end.x - start.x) * 0.5);

            // Viewport cull: AABB of all 4 bezier control points vs canvas
            const MARGIN = 100 * zoom;
            const minX = Math.min(start.x, start.x + cpOffset, end.x - cpOffset, end.x);
            const maxX = Math.max(start.x, start.x + cpOffset, end.x - cpOffset, end.x);
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            if (maxX < -MARGIN || minX > cw + MARGIN || maxY < -MARGIN || minY > ch + MARGIN) {
                path.setAttribute("d", "");
                return;
            }

            path.setAttribute("d",
                `M ${start.x} ${start.y} C ${start.x + cpOffset} ${start.y} ${end.x - cpOffset} ${end.y} ${end.x} ${end.y}`
            );
            path.style.stroke = getTypeColor(conn.kind);
        });

        // Remove stale paths
        this.#paths.forEach((path, id) => {
            if (!activeIds.has(id)) {
                path.remove();
                this.#paths.delete(id);
            }
        });
    }

    // ─── Public — highlighting ─────────────────────────────────────────────────

    /**
     * Highlights all SVG paths connected to the given pin.
     *
     * @param {string} nodeId
     * @param {string} pinId
     */
    highlightPin(nodeId, pinId) {
        this.clearHighlight();
        for (const conn of this.#nodeRenderer.getConnections()) {
            const matches =
                (conn.from.nodeId === nodeId && conn.from.pinId === pinId) ||
                (conn.to.nodeId   === nodeId && conn.to.pinId   === pinId);
            if (!matches) continue;
            const path = this.#paths.get(conn.id);
            if (path) {
                path.dataset.highlighted = "true";
                this.#highlightedPaths.add(path);
            }
        }
    }

    /**
     * Removes highlight from all previously highlighted paths.
     */
    clearHighlight() {
        this.#highlightedPaths.forEach(p => delete p.dataset.highlighted);
        this.#highlightedPaths.clear();
    }

    /**
     * Animates a glowing pulse sweeping along a clone of the path, leaving the original untouched.
     * Resolves once the animation finishes.
     *
     * @param {string} connId
     * @param {number} [durationMs]
     * @returns {Promise<void>}
     */
    async activatePath(connId, durationMs = 200) {
        const path = this.#paths.get(connId);
        if (!path) {
            await new Promise(r => window.setTimeout(r, durationMs));
            return;
        }

        const len = path.getTotalLength();
        if (!len) {
            await new Promise(r => window.setTimeout(r, durationMs));
            return;
        }

        // Clone the path so the original is never mutated.
        const ghost = /** @type {SVGPathElement} */ (path.cloneNode(false));
        const pulse = Math.min(100, Math.max(30, len * 0.35));
        ghost.style.strokeDasharray  = `${pulse} ${len + pulse}`;
        ghost.style.strokeDashoffset = `${pulse}`;
        ghost.style.pointerEvents    = "none";
        ghost.removeAttribute("data-highlighted");
        ghost.removeAttribute("data-executing");
        path.insertAdjacentElement("afterend", ghost);

        const anim = ghost.animate(
            [
                { strokeDashoffset: pulse,         strokeWidth: "7",   filter: "brightness(5) drop-shadow(0 0 14px currentColor)" },
                { strokeDashoffset: -(len * 0.5),  strokeWidth: "5",   filter: "brightness(3) drop-shadow(0 0 8px currentColor)",  offset: 0.5 },
                { strokeDashoffset: -(len + pulse), strokeWidth: "2.5", filter: "brightness(1) drop-shadow(0 0 0px currentColor)" },
            ],
            { duration: durationMs, easing: "ease-in", fill: "forwards" }
        );

        await anim.finished;
        ghost.remove();
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    /**
     * @param {string} kind
     * @returns {SVGPathElement}
     */
    #createPath(kind) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("stroke-linecap", "round");
        path.dataset.kind = kind;
        return path;
    }

    /**
     * Returns screen-space coordinates for a connection's pin handles.
     *
     * @param {GraphConnection} conn
     * @param {DOMRect} canvasRect
     * @returns {{ start: {x:number,y:number}, end: {x:number,y:number} } | null}
     */
    #computeGeometry(conn, canvasRect) {
        const fromHandle = this.#nodeRenderer.getPinHandle(conn.from.nodeId, conn.from.pinId, "output");
        const toHandle   = this.#nodeRenderer.getPinHandle(conn.to.nodeId,   conn.to.pinId,   "input");
        if (!fromHandle || !toHandle) return null;

        const fromRect = fromHandle.getBoundingClientRect();
        const toRect   = toHandle.getBoundingClientRect();

        return {
            start: {
                x: fromRect.left - canvasRect.left + fromRect.width  / 2,
                y: fromRect.top  - canvasRect.top  + fromRect.height / 2,
            },
            end: {
                x: toRect.left - canvasRect.left + toRect.width  / 2,
                y: toRect.top  - canvasRect.top  + toRect.height / 2,
            },
        };
    }
}
