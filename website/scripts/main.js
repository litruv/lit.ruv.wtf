import { WorkspaceNavigator } from "./WorkspaceNavigator.js";
import { NodeRenderer } from "./NodeRenderer.js";
import { ConnectionRenderer } from "./ConnectionRenderer.js";
import { GraphNode } from "./GraphNode.js";
import { GraphConnection } from "./GraphConnection.js";
import { GraphComment } from "./GraphComment.js";
import { DebugPanel } from "./DebugPanel.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { ItemDragger } from "./ItemDragger.js";
import { PinConnectionManager } from "./PinConnectionManager.js";
import { GraphExecutor } from "./GraphExecutor.js";
import { PrintBubble } from "./PrintBubble.js";
import { SpatialAudio } from "./SpatialAudio.js";
import { getTypeColor } from "./getTypeColor.js";
import { NodeContextMenu } from "./NodeContextMenu.js";
import { NodeRegistry } from "./nodes/NodeRegistry.js";

const canvas       = document.getElementById("workspaceCanvas");
const worldLayer   = document.getElementById("worldLayer");
const nodeLayer    = document.getElementById("nodeLayer");
const connLayerSvg = document.getElementById("connectionLayer");
const worldBoxLayer = document.getElementById("worldBoxLayer");
const viewboxLayer = document.getElementById("viewboxLayer");
const jsonEditorModal = document.getElementById("jsonEditorModal");
const jsonEditorTextarea = document.getElementById("jsonEditorTextarea");
const resetBtn     = document.getElementById("resetViewBtn");
const draggableToggle = document.getElementById("draggableToggle");
const debugPanelEl = document.getElementById("debugPanel");
const propertiesPanelEl = document.getElementById("propertiesPanel");

/** @type {HTMLTemplateElement} */
const nodeTemplate = document.getElementById("nodeTemplate");
/** @type {HTMLTemplateElement} */
const pinTemplate  = document.getElementById("pinTemplate");

const nav      = new WorkspaceNavigator(canvas, worldLayer);
const audio    = new SpatialAudio(() => nav.getViewInfo().viewbox);

const nodeRend = new NodeRenderer(nodeLayer, nodeTemplate, pinTemplate, (nodeId, pinId, direction) => {
    const targetId = nodeRend.getConnectedNodeId(nodeId, pinId, direction);
    if (!targetId) return;
    const rect = nodeRend.getNodeWorldRect(targetId);
    if (!rect) return;
    const focusOptions = nodeRend.getNodes().find(n => n.id === targetId)?.focusOptions ?? {};
    nav.animateFocusOnRect(rect, focusOptions);
    history.pushState({ nodeId: targetId }, "", `#${targetId}`);
}, (nodeId, pinId) => executor.execute(nodeId, pinId), () => connRend.render());

/** @type {Map<string, PrintBubble>} */
const printBubbles = new Map();

const executor   = new GraphExecutor(nodeRend, (nodeId, value) => {
    printBubbles.get(nodeId)?.push(value);
    
    // Play spatial audio at node position
    const node = nodeRend.getNodes().find(n => n.id === nodeId);
    if (node) {
        const rect = nodeRend.getNodeWorldRect(nodeId);
        if (rect) {
            const centerX = rect.x + rect.width / 2;
            const centerY = rect.y + rect.height / 2;
            audio.play('pop', centerX, centerY, rect.width, rect.height);
        }
    }
}, async (connId, kind) => {
    await connRend.activatePath(connId, kind === "exec" ? 200 : 150);
});
const connRend   = new ConnectionRenderer(connLayerSvg, canvas, nodeRend, nav);
const pinConns   = new PinConnectionManager(canvas, connLayerSvg, nodeLayer, nodeRend, nav, connRend);

// Properties Panel - Initialize early so it can be referenced
const propertiesPanel = new PropertiesPanel(propertiesPanelEl, () => {
    connRend.render();
    renderWorldBoxes();
    renderViewbox();
});

const dragger    = new ItemDragger(canvas, nav, nodeRend,
    () => { 
        const activeNode = dragger.activeId ? nodeRend.getNodes().find(n => n.id === dragger.activeId) : null;
        debugPanel.update(nav.getViewInfo(), dragger.activeId, dragger.activeId ? nodeRend.getNodeWorldRect(dragger.activeId) : null, activeNode);
        propertiesPanel.loadNode(activeNode);
    },
    () => { connRend.render(); }
);
// Suppress navigator pan while a node drag is actively in progress (enables edge-pan on mobile + mouse)
nav.setDragInProgressChecker(() => dragger.isDragging);
// Drop the active drag immediately when a pinch-to-zoom starts so the two gestures don't conflict
nav.setOnPinchStart(() => dragger.cancelDrag());

// Node context menu for adding nodes
const nodeContextMenu = new NodeContextMenu(canvas, (type, worldX, worldY) => {
    // Generate unique node ID
    const existingIds = nodeRend.getNodes().map(n => n.id);
    let counter = 1;
    let newId = type;
    while (existingIds.includes(newId)) {
        counter++;
        newId = `${type}_${counter}`;
    }

    // Get default pins from node definition
    const pins = NodeRegistry.BlueprintPure_GetDefaultPins(type);

    // Create and add new node
    const newNode = new GraphNode({
        id: newId,
        type: type,
        title: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        position: { x: Math.round(worldX), y: Math.round(worldY) },
        inputs: pins.inputs.map(p => ({ ...p })),
        outputs: pins.outputs.map(p => ({ ...p })),
        userSpawned: true
    });

    nodeRend.addNode(newNode);
    dragger.registerNode(newId);
    connRend.render();
    
    // Attach PrintBubble if it's a print node
    if (type === "print") {
        const el = nodeRend.getNodeElements().get(newId);
        if (el) printBubbles.set(newId, new PrintBubble(el));
    }
});

const debugPanel = new DebugPanel(debugPanelEl, 
    (enabled) => { dragger.enabled = enabled; pinConns.enabled = enabled; }, 
    () => {
        const liveGraph = {
            settings:    graphData.settings,
            images:      graphData.images,
            nodes:       nodeRend.getNodes().map(n => ({
                id:           n.id,
                type:         n.type,
                title:        n.title,
                position:     { x: Math.round(n.position.x), y: Math.round(n.position.y) },
                ...(n.width       !== undefined ? { width:       n.width }       : {}),
                ...(n.markdownSrc !== undefined ? { markdownSrc: n.markdownSrc } : {}),
                ...(n.imageSrc    !== undefined ? { imageSrc:    n.imageSrc }    : {}),
                ...(n.lottieSrc   !== undefined ? { lottieSrc:   n.lottieSrc }   : {}),
                ...(n.focusOptions !== undefined ? { focusOptions: n.focusOptions } : {}),
                inputs:  n.inputs,
                outputs: n.outputs,
            })),
            connections: nodeRend.getConnections().map(c => ({
                id:   c.id,
                from: c.from,
                to:   c.to,
                kind: c.kind,
            })),
        };
        navigator.clipboard.writeText(JSON.stringify(liveGraph, null, 2));
    }, (nodeId, updates) => {
    const node = nodeRend.getNodes().find(n => n.id === nodeId);
    if (!node) return;
    
    let needsRerender = false;
    
    if (updates.title !== undefined) node.title = updates.title;
    if (updates.position) {
        nodeRend.setNodePosition(nodeId, updates.position.x, updates.position.y);
    }
    if (updates.width !== undefined) {
        node.width = updates.width;
        const el = nodeRend.getNodeElement(nodeId);
        if (el) el.style.width = updates.width != null ? `${updates.width}px` : '';
    }
    
    if (updates.inputs !== undefined) {
        node.inputs = updates.inputs;
        needsRerender = true;
    }
    if (updates.outputs !== undefined) {
        node.outputs = updates.outputs;
        needsRerender = true;
    }
    
    const nodeEl = nodeRend.getNodeElement(nodeId);
    if (nodeEl && updates.title !== undefined) {
        const titleEl = nodeEl.querySelector('.node-title');
        if (titleEl) titleEl.textContent = updates.title;
    }
    
    // Re-render node if pins changed
    if (needsRerender && nodeEl) {
        const parent = nodeEl.parentElement;
        nodeEl.remove();
        
        // Re-add using internal render method
        const fragment = nodeTemplate.content.cloneNode(true);
        const article = fragment.querySelector('.blueprint-node');
        const title = article.querySelector('.node-title');
        const inputs = article.querySelector('.node-inputs');
        const outputs = article.querySelector('.node-outputs');
        
        article.dataset.nodeId = node.id;
        article.dataset.nodeType = node.type;
        title.textContent = node.title;
        article.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
        if (node.width != null) article.style.width = `${node.width}px`;
        
        // Re-render pins using pinTemplate
        inputs.innerHTML = '';
        outputs.innerHTML = '';
        
        node.inputs.forEach(pin => {
            const pinFrag = pinTemplate.content.cloneNode(true);
            const container = pinFrag.firstElementChild;
            const label = container.querySelector('.pin-label');
            const handle = container.querySelector('.pin-handle');
            
            container.dataset.pinId = pin.id;
            container.dataset.type = pin.kind;
            container.dataset.direction = 'input';
            container.classList.add('is-disconnected');
            container.style.setProperty('--pin-kind-color', getTypeColor(pin.kind));
            
            const isStandardExec = pin.kind === 'exec' && (pin.id === 'exec_in' || pin.id === 'exec_out');
            if (isStandardExec && !pin.name) {
                label.textContent = '';
                label.classList.add('is-hidden');
            } else {
                label.textContent = pin.name;
            }
            
            inputs.appendChild(container);
        });
        
        node.outputs.forEach(pin => {
            const pinFrag = pinTemplate.content.cloneNode(true);
            const container = pinFrag.firstElementChild;
            const label = container.querySelector('.pin-label');
            const handle = container.querySelector('.pin-handle');
            
            container.dataset.pinId = pin.id;
            container.dataset.type = pin.kind;
            container.dataset.direction = 'output';
            container.classList.add('is-disconnected');
            container.style.setProperty('--pin-kind-color', getTypeColor(pin.kind));
            
            const isStandardExec = pin.kind === 'exec' && (pin.id === 'exec_in' || pin.id === 'exec_out');
            if (isStandardExec && !pin.name) {
                label.textContent = '';
                label.classList.add('is-hidden');
            } else {
                label.textContent = pin.name;
            }
            
            outputs.appendChild(container);
        });
        
        parent?.appendChild(article);
        
        // Update internal node elements map
        const nodeElements = nodeRend.getNodeElements();
        nodeElements.set(nodeId, article);
        
        // Update debug panel with refreshed node
        const activeNode = nodeRend.getNodes().find(n => n.id === dragger.activeId);
        debugPanel.update(nav.getViewInfo(), dragger.activeId, dragger.activeId ? nodeRend.getNodeWorldRect(dragger.activeId) : null, activeNode);
    }
    
    connRend.render();
},
    (enabled) => {
        // WorldBox toggle
        if (worldBoxLayer) {
            worldBoxLayer.style.display = enabled ? 'block' : 'none';
            renderWorldBoxes();
        }
    },
    () => {
        // Copy entire graph as JSON
        const liveGraph = {
            settings:    graphData.settings,
            images:      graphData.images,
            comments:    graphData.comments,
            nodes:       nodeRend.getNodes().map(n => ({
                id:           n.id,
                type:         n.type,
                title:        n.title,
                position:     { x: Math.round(n.position.x), y: Math.round(n.position.y) },
                ...(n.width       !== undefined ? { width:       n.width }       : {}),
                ...(n.markdownSrc !== undefined ? { markdownSrc: n.markdownSrc } : {}),
                ...(n.imageSrc    !== undefined ? { imageSrc:    n.imageSrc }    : {}),
                ...(n.lottieSrc   !== undefined ? { lottieSrc:   n.lottieSrc }   : {}),
                ...(n.focusOptions !== undefined ? { focusOptions: n.focusOptions } : {}),
                inputs:  n.inputs,
                outputs: n.outputs,
            })),
            connections: nodeRend.getConnections().map(c => ({
                id:   c.id,
                from: c.from,
                to:   c.to,
                kind: c.kind,
            })),
        };
        navigator.clipboard.writeText(JSON.stringify(liveGraph, null, 2));
    },
    (enabled) => {
        // Viewbox toggle
        if (viewboxLayer) {
            viewboxLayer.style.display = enabled ? 'block' : 'none';
            renderViewbox();
        }
    },
    () => {
        // Show Properties Panel
        propertiesPanel.expand();
    }
);

// Connection SVG is screen-space — must re-render on every pan/zoom so paths track node positions.
let hasTransformed = false;
let trackTransform = false;
nav.setOnAfterTransform(() => {
    connRend.render();
    renderWorldBoxes();
    renderViewbox();
    const activeNode = dragger.activeId ? nodeRend.getNodes().find(n => n.id === dragger.activeId) : null;
    debugPanel.update(nav.getViewInfo(), dragger.activeId, dragger.activeId ? nodeRend.getNodeWorldRect(dragger.activeId) : null, activeNode);

    if (trackTransform && !hasTransformed) {
        hasTransformed = true;
        canvas.classList.add('has-transformed');
    }
});

// ─── WorldBox Visualizer ──────────────────────────────────────────────────────

/**
 * Renders worldbox overlays for all nodes with focusOptions
 */
function renderWorldBoxes() {
    if (!worldBoxLayer || worldBoxLayer.style.display === 'none') return;
    
    // Clear existing
    worldBoxLayer.innerHTML = '';
    
    const viewInfo = nav.getViewInfo();
    const zoom = viewInfo.zoom;
    const offset = nav.getEffectiveOffset();
    const canvasRect = canvas.getBoundingClientRect();
    
    nodeRend.getNodes().forEach(node => {
        if (!node.focusOptions?.minWorldBox && !node.focusOptions?.responsiveWorldBox) return;
        
        const rect = nodeRend.getNodeWorldRect(node.id);
        if (!rect) return;
        
        const nodeCenterX = rect.x + rect.width / 2;
        const nodeCenterY = rect.y + rect.height / 2;
        
        // Determine which breakpoint would be active at current viewport width
        const vw = window.innerWidth;
        let activeBreakpointIndex = -1; // -1 = base worldBox is active
        if (node.focusOptions.responsiveWorldBox && Array.isArray(node.focusOptions.responsiveWorldBox)) {
            const sorted = [...node.focusOptions.responsiveWorldBox]
                .map((bp, i) => ({ bp, i }))
                .sort((a, b) => (a.bp.minViewportWidth ?? 0) - (b.bp.minViewportWidth ?? 0));
            for (const { bp, i } of sorted) {
                if (vw < (bp.minViewportWidth ?? Infinity)) {
                    activeBreakpointIndex = i;
                    break;
                }
            }
        }

        // Render base worldbox if it exists
        if (node.focusOptions.minWorldBox) {
            const worldBox = node.focusOptions.minWorldBox;
            const anchorX = node.focusOptions.anchorX ?? 0.5;
            const anchorY = node.focusOptions.anchorY ?? 0.5;
            const isActive = activeBreakpointIndex === -1;
            
            // The viewport region is offset from the node center based on anchor.
            // anchor=0.5 means node is centered in viewport (no offset).
            // The box shifts so the node sits at the anchor position within it.
            const boxX = nodeCenterX - worldBox.width * anchorX;
            const boxY = nodeCenterY - worldBox.height * anchorY;
            
            // Convert to screen space
            const screenX = (boxX + offset.x) * zoom;
            const screenY = (boxY + offset.y) * zoom;
            const screenW = worldBox.width * zoom;
            const screenH = worldBox.height * zoom;
            
            const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rectEl.setAttribute('class', isActive ? 'worldbox-rect worldbox-rect--active' : 'worldbox-rect');
            rectEl.setAttribute('x', String(screenX));
            rectEl.setAttribute('y', String(screenY));
            rectEl.setAttribute('width', String(screenW));
            rectEl.setAttribute('height', String(screenH));
            worldBoxLayer.appendChild(rectEl);
            
            const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textEl.setAttribute('class', isActive ? 'worldbox-label worldbox-label--active' : 'worldbox-label');
            textEl.setAttribute('x', String(screenX + 6));
            textEl.setAttribute('y', String(screenY + 14));
            textEl.textContent = `${node.id} (${worldBox.width}×${worldBox.height})`;
            worldBoxLayer.appendChild(textEl);
            
            // Draw crosshair at the node center (the focus point)
            const anchorScreenX = (nodeCenterX + offset.x) * zoom;
            const anchorScreenY = (nodeCenterY + offset.y) * zoom;
            const crossSize = 8;
            
            const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hLine.setAttribute('class', isActive ? 'worldbox-anchor worldbox-anchor--active' : 'worldbox-anchor');
            hLine.setAttribute('x1', String(anchorScreenX - crossSize));
            hLine.setAttribute('y1', String(anchorScreenY));
            hLine.setAttribute('x2', String(anchorScreenX + crossSize));
            hLine.setAttribute('y2', String(anchorScreenY));
            worldBoxLayer.appendChild(hLine);
            
            const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vLine.setAttribute('class', isActive ? 'worldbox-anchor worldbox-anchor--active' : 'worldbox-anchor');
            vLine.setAttribute('x1', String(anchorScreenX));
            vLine.setAttribute('y1', String(anchorScreenY - crossSize));
            vLine.setAttribute('x2', String(anchorScreenX));
            vLine.setAttribute('y2', String(anchorScreenY + crossSize));
            worldBoxLayer.appendChild(vLine);
        }
        
        // Render responsive worldboxes
        if (node.focusOptions.responsiveWorldBox && Array.isArray(node.focusOptions.responsiveWorldBox)) {
            node.focusOptions.responsiveWorldBox.forEach((responsive, index) => {
                const worldBox = responsive.minWorldBox;
                if (!worldBox) return;
                
                const anchorX = responsive.anchorX ?? 0.5;
                const anchorY = responsive.anchorY ?? 0.5;
                const isActive = activeBreakpointIndex === index;
                
                // The viewport region is offset from the node center based on anchor.
                const boxX = nodeCenterX - worldBox.width * anchorX;
                const boxY = nodeCenterY - worldBox.height * anchorY;
                
                // Convert to screen space
                const screenX = (boxX + offset.x) * zoom;
                const screenY = (boxY + offset.y) * zoom;
                const screenW = worldBox.width * zoom;
                const screenH = worldBox.height * zoom;
                
                const opacity = isActive ? '1' : String(0.4 + (index * 0.15));

                const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rectEl.setAttribute('class', isActive ? 'worldbox-rect worldbox-rect--active' : 'worldbox-rect');
                rectEl.setAttribute('x', String(screenX));
                rectEl.setAttribute('y', String(screenY));
                rectEl.setAttribute('width', String(screenW));
                rectEl.setAttribute('height', String(screenH));
                rectEl.setAttribute('opacity', opacity);
                worldBoxLayer.appendChild(rectEl);
                
                const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                textEl.setAttribute('class', isActive ? 'worldbox-label worldbox-label--active' : 'worldbox-label');
                textEl.setAttribute('x', String(screenX + 6));
                textEl.setAttribute('y', String(screenY + 14 + (index * 16)));
                textEl.textContent = `@${responsive.minViewportWidth}px: ${worldBox.width}×${worldBox.height}`;
                textEl.setAttribute('opacity', opacity);
                worldBoxLayer.appendChild(textEl);
                
                // Draw crosshair at the node center (the focus point)
                const anchorScreenX = (nodeCenterX + offset.x) * zoom;
                const anchorScreenY = (nodeCenterY + offset.y) * zoom;
                const crossSize = 8;
                
                const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                hLine.setAttribute('class', isActive ? 'worldbox-anchor worldbox-anchor--active' : 'worldbox-anchor');
                hLine.setAttribute('x1', String(anchorScreenX - crossSize));
                hLine.setAttribute('y1', String(anchorScreenY));
                hLine.setAttribute('x2', String(anchorScreenX + crossSize));
                hLine.setAttribute('y2', String(anchorScreenY));
                hLine.setAttribute('opacity', opacity);
                worldBoxLayer.appendChild(hLine);
                
                const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                vLine.setAttribute('class', isActive ? 'worldbox-anchor worldbox-anchor--active' : 'worldbox-anchor');
                vLine.setAttribute('x1', String(anchorScreenX));
                vLine.setAttribute('y1', String(anchorScreenY - crossSize));
                vLine.setAttribute('x2', String(anchorScreenX));
                vLine.setAttribute('y2', String(anchorScreenY + crossSize));
                vLine.setAttribute('opacity', opacity);
                worldBoxLayer.appendChild(vLine);
            });
        }
    });
}

// ─── Viewbox Visualizer ───────────────────────────────────────────────────────

/**
 * Renders the current viewbox overlay showing visible world area
 */
function renderViewbox() {
    if (!viewboxLayer || viewboxLayer.style.display === 'none') return;
    
    // Clear existing
    viewboxLayer.innerHTML = '';
    
    const viewInfo = nav.getViewInfo();
    const zoom = viewInfo.zoom;
    const offset = nav.getEffectiveOffset();
    const viewbox = viewInfo.viewbox;
    
    // Convert viewbox (world coords) to screen space
    const screenX = (viewbox.x + offset.x) * zoom;
    const screenY = (viewbox.y + offset.y) * zoom;
    const screenW = viewbox.width * zoom;
    const screenH = viewbox.height * zoom;
    
    // Create rectangle
    const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectEl.setAttribute('class', 'viewbox-rect');
    rectEl.setAttribute('x', String(screenX));
    rectEl.setAttribute('y', String(screenY));
    rectEl.setAttribute('width', String(screenW));
    rectEl.setAttribute('height', String(screenH));
    viewboxLayer.appendChild(rectEl);
    
    // Add label
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('class', 'viewbox-label');
    textEl.setAttribute('x', String(screenX + 10));
    textEl.setAttribute('y', String(screenY + 20));
    textEl.textContent = `Viewbox (${Math.round(viewbox.width)}×${Math.round(viewbox.height)})`;
    viewboxLayer.appendChild(textEl);
}

// ─── Load graph from JSON ──────────────────────────────────────────────────

const response = await fetch("data/graph.json");
let graphData = await response.json();

// Load spatial audio
await audio.load('pop', 'data/pop.mp3');
await audio.load('denied', 'data/denied.mp3');

graphData.comments?.forEach(c => nodeRend.addComment(new GraphComment(c)));
graphData.nodes.forEach(n => nodeRend.addNode(new GraphNode(n)));
graphData.connections.forEach(c => nodeRend.addConnection(new GraphConnection(c.from, c.to, c.kind, c.id)));

// Load graph settings into properties panel
propertiesPanel.loadGraphSettings(graphData);

// Attach a PrintBubble to every print-type node
graphData.nodes.forEach(n => {
    if (n.type !== "print") return;
    const el = nodeRend.getNodeElements().get(n.id);
    if (el) printBubbles.set(n.id, new PrintBubble(el));
});

for (const img of graphData.images ?? []) {
    if (img.inline) {
        // Fetch and inline SVG for direct style control
        try {
            const response = await fetch(img.src);
            const svgText = await response.text();
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgEl = svgDoc.documentElement;
            
            svgEl.classList.add('world-image');
            // Remove percentage dimensions, set explicit width
            svgEl.removeAttribute('height');
            svgEl.setAttribute('width', String(img.width));
            // Preserve viewBox for aspect ratio
            if (!svgEl.hasAttribute('viewBox')) {
                const w = svgEl.getAttribute('width');
                const h = svgEl.getAttribute('height');
                if (w && h) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
            }
            svgEl.style.transform = `translate(${img.position.x}px, ${img.position.y}px)`;
            svgEl.style.display = 'block';
            
            // Apply cssStyle to all paths/shapes in SVG
            const shapes = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline');
            if (img.cssStyle) {
                const styleProps = img.cssStyle.split(';').filter(s => s.trim());
                styleProps.forEach(prop => {
                    const [key, val] = prop.split(':').map(s => s.trim());
                    if (!key || !val) return;
                    if (key === 'fill' || key === 'stroke' || key === 'stroke-width' || key === 'opacity') {
                        shapes.forEach(el => {
                            // Skip elements with fill="none" (background/artboard rects)
                            if (el.getAttribute('fill') === 'none') return;
                            el.style[key] = val;
                        });
                    } else {
                        svgEl.style[key] = val;
                    }
                });
            } else {
                // Default fill to white if no style specified
                shapes.forEach(el => {
                    if (el.getAttribute('fill') === 'none') return; // Skip background
                    if (!el.hasAttribute('fill') && !el.style.fill) {
                        el.style.fill = '#ffffff';
                    }
                });
            }
            
            worldLayer.prepend(svgEl);
            dragger.registerImage(img.src, svgEl, { ...img.position });
            console.log('Inlined SVG:', img.src, svgEl);
        } catch (err) {
            console.error(`Failed to inline SVG: ${img.src}`, err);
        }
    } else {
        // Standard img element
        const el = document.createElement("img");
        el.className = "world-image";
        el.src = img.src;
        el.width = img.width;
        el.alt = "";
        el.style.transform = `translate(${img.position.x}px, ${img.position.y}px)`;
        if (img.cssStyle) {
            el.style.cssText += `;${img.cssStyle}`;
        }
        el.addEventListener("dragstart", (e) => e.preventDefault());
        worldLayer.prepend(el);
        dragger.registerImage(img.src, el, { ...img.position });
    }
}

graphData.nodes.forEach(n => dragger.registerNode(n.id));

// ─── Initial focus ─────────────────────────────────────────────────────────

const settings        = graphData.settings ?? {};
const introDurationMs = settings.introDurationMs ?? 700;
const initialViewbox  = settings.initialViewbox ?? { x: 0, y: 0, width: 1280, height: 720 };

const initialDraggable = settings.draggable ?? false;
dragger.enabled     = initialDraggable;
pinConns.enabled    = initialDraggable;
debugPanel.setDraggable(initialDraggable);

// Snap to a tiny zoom first so the intro animation has somewhere to travel from
const introRect = {
    x:      initialViewbox.x + initialViewbox.width  / 2 - 50,
    y:      initialViewbox.y + initialViewbox.height / 2 - 50,
    width:  100,
    height: 100,
};
const anchorId  = location.hash.slice(1);
const anchorNode = anchorId ? nodeRend.getNodes().find(n => n.id === anchorId) : null;
const anchorRect = anchorNode ? nodeRend.getNodeWorldRect(anchorNode.id) : null;

// Seed the current history entry so popstate can restore it when navigating back
history.replaceState({ nodeId: anchorId || null }, "");

nav.focusOnRect(introRect);
// Initial connection render — one rAF so layout is measured after nodes are in the DOM.
requestAnimationFrame(() => connRend.render());
if (anchorNode) {
    // Wait for all markdown to finish loading so info nodes have their real height,
    // then one rAF to let the browser measure layout before animating.
    nodeRend.contentReady().then(() => requestAnimationFrame(() => {
        const rect = nodeRend.getNodeWorldRect(anchorNode.id);
        if (rect) {
            nav.animateFocusOnRect(rect, { ...(anchorNode.focusOptions ?? {}), durationMs: introDurationMs });
        } else {
            nav.animateFocusOnRect(initialViewbox, { paddingFraction: 0, durationMs: introDurationMs });
        }
        setTimeout(() => { trackTransform = true; }, introDurationMs + 100);
    }));
} else {
    nav.animateFocusOnRect(initialViewbox, { paddingFraction: 0, durationMs: introDurationMs });
    setTimeout(() => { trackTransform = true; }, introDurationMs + 100);
}

resetBtn.addEventListener("click", () => {
    history.pushState({ nodeId: null }, "", location.pathname + location.search);
    nav.animateFocusOnRect(initialViewbox, { paddingFraction: 0, durationMs: introDurationMs });
});

window.addEventListener("popstate", (e) => {
    const nodeId = (e.state?.nodeId ?? location.hash.slice(1)) || null;
    if (nodeId) {
        const node = nodeRend.getNodes().find(n => n.id === nodeId);
        if (node) {
            nodeRend.contentReady().then(() => requestAnimationFrame(() => {
                const rect = nodeRend.getNodeWorldRect(node.id);
                if (rect) nav.animateFocusOnRect(rect, { ...(node.focusOptions ?? {}), durationMs: introDurationMs });
            }));
            return;
        }
    }
    nav.animateFocusOnRect(initialViewbox, { paddingFraction: 0, durationMs: introDurationMs });
});

draggableToggle.addEventListener("click", () => {
    const isActive = draggableToggle.classList.toggle("active");
    dragger.enabled = isActive;
    pinConns.enabled = isActive;
});

// Clear selection when clicking on canvas background
canvas.addEventListener("click", (e) => {
    // Only clear if clicking directly on canvas (not on nodes or other elements)
    if (e.target === canvas) {
        dragger.clearSelection();
        propertiesPanel.loadNode(null);
    }
});

// Delete key to remove selected node
document.addEventListener("keydown", (e) => {
    // Skip if user is typing in an input
    if (e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement ||
        e.target.isContentEditable) {
        return;
    }
    
    if (e.key === "Delete" || e.key === "Backspace") {
        const activeId = dragger.getActiveId();
        if (activeId) {
            const node = nodeRend.getNodes().find(n => n.id === activeId);
            if (node?.userSpawned) {
                e.preventDefault();
                dragger.unregisterNode(activeId);
                nodeRend.removeNode(activeId);
                printBubbles.delete(activeId);
                propertiesPanel.loadNode(null);
                connRend.render();
            } else if (node) {
                // Node can't be deleted - shake it red and play denied sound
                e.preventDefault();
                const nodeEl = nodeRend.getNodeElements().get(activeId);
                if (nodeEl) {
                    nodeEl.classList.add('node-shake-red');
                    nodeEl.addEventListener('animationend', () => {
                        nodeEl.classList.remove('node-shake-red');
                    }, { once: true });
                }
                
                // Play denied sound at node position
                const rect = nodeRend.getNodeWorldRect(activeId);
                if (rect) {
                    const centerX = rect.x + rect.width / 2;
                    const centerY = rect.y + rect.height / 2;
                    audio.play('denied', centerX, centerY, rect.width, rect.height);
                }
            }
        }
    }
});

// Right-click context menu for adding nodes
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    
    // Don't show menu if we just finished a pan drag
    if (nav.didPanRecently(150)) {
        return;
    }
    
    // Convert client coords to world coords
    const rect = canvas.getBoundingClientRect();
    const zoom = Math.max(0.01, nav.zoomLevel || 1);
    const offset = nav.getEffectiveOffset();
    const worldX = (e.clientX - rect.left) / zoom - offset.x;
    const worldY = (e.clientY - rect.top) / zoom - offset.y;
    
    nodeContextMenu.show(e.clientX, e.clientY, worldX, worldY);
});

// Initialize dragging as disabled
dragger.enabled = false;
pinConns.enabled = false;
