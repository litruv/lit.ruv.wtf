/**
 * Properties Panel - Visual editor for nodes, focus options, and graph settings
 * Similar to Photoshop's properties panel
 */
export class PropertiesPanel {
    /** @type {HTMLElement} */
    #panel;

    /** @type {(() => void) | null} */
    #onChange = null;

    /** @type {any} */
    #currentNode = null;

    /** @type {any} */
    #graphData = null;

    /**
     * @param {HTMLElement} panel
     * @param {(() => void) | null} [onChange]
     */
    constructor(panel, onChange = null) {
        this.#panel = panel;
        this.#onChange = onChange;

        this.#bindEvents();
    }

    #bindEvents() {
        // Toggle button (close)
        const toggleBtn = this.#panel.querySelector('.properties-toggle-btn');
        toggleBtn?.addEventListener('click', () => {
            this.#panel.classList.toggle('collapsed');
        });

        // Tab button (open when collapsed)
        const tabBtn = this.#panel.querySelector('.properties-panel-tab');
        tabBtn?.addEventListener('click', () => {
            this.#panel.classList.remove('collapsed');
        });

        // Collapsible sections
        this.#panel.querySelectorAll('.section-header.collapsible').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('collapsed');
            });
        });

        // Node property inputs
        document.getElementById('propNodeTitle')?.addEventListener('input', () => this.#updateNodeProperty('title'));
        document.getElementById('propNodeX')?.addEventListener('input', () => this.#updateNodeProperty('x'));
        document.getElementById('propNodeY')?.addEventListener('input', () => this.#updateNodeProperty('y'));
        document.getElementById('propNodeWidth')?.addEventListener('input', () => this.#updateNodeProperty('width'));

        // Focus options inputs
        document.getElementById('propFocusDuration')?.addEventListener('input', () => this.#updateFocusOptions());
        document.getElementById('propFocusAnchorX')?.addEventListener('input', () => this.#updateFocusOptions());
        document.getElementById('propFocusAnchorY')?.addEventListener('input', () => this.#updateFocusOptions());
        document.getElementById('propWorldBoxWidth')?.addEventListener('input', () => this.#updateFocusOptions());
        document.getElementById('propWorldBoxHeight')?.addEventListener('input', () => this.#updateFocusOptions());

        // Add breakpoint button
        document.getElementById('addBreakpointBtn')?.addEventListener('click', () => this.#addBreakpoint());

        // Apply settings button
        document.getElementById('applySettingsBtn')?.addEventListener('click', () => this.#applyGraphSettings());

        // Graph settings
        document.getElementById('propGraphDraggable')?.addEventListener('change', () => {
            if (this.#graphData?.settings) {
                this.#graphData.settings.draggable = document.getElementById('propGraphDraggable').checked;
                this.#onChange?.();
            }
        });
    }

    /**
     * Load a node into the properties panel
     * 
     * @param {any} node
     */
    loadNode(node) {
        this.#currentNode = node;

        if (!node) {
            document.getElementById('nodePropertiesSection').style.display = 'none';
            document.getElementById('focusOptionsSection').style.display = 'none';
            document.getElementById('noSelectionMessage').style.display = 'block';
            return;
        }

        document.getElementById('nodePropertiesSection').style.display = 'block';
        document.getElementById('focusOptionsSection').style.display = 'block';
        document.getElementById('noSelectionMessage').style.display = 'none';

        // Populate node properties
        const idInput = document.getElementById('propNodeId');
        const typeInput = document.getElementById('propNodeType');
        const titleInput = document.getElementById('propNodeTitle');
        const xInput = document.getElementById('propNodeX');
        const yInput = document.getElementById('propNodeY');
        const widthInput = document.getElementById('propNodeWidth');

        if (idInput) idInput.value = node.id || '';
        if (typeInput) typeInput.value = node.type || '';
        if (titleInput) titleInput.value = node.title || '';
        if (xInput) xInput.value = node.position?.x ?? 0;
        if (yInput) yInput.value = node.position?.y ?? 0;
        if (widthInput) widthInput.value = node.width || '';

        // Populate focus options
        const focusOpts = node.focusOptions || {};
        const durationInput = document.getElementById('propFocusDuration');
        const anchorXInput = document.getElementById('propFocusAnchorX');
        const anchorYInput = document.getElementById('propFocusAnchorY');
        const boxWidthInput = document.getElementById('propWorldBoxWidth');
        const boxHeightInput = document.getElementById('propWorldBoxHeight');

        if (durationInput) durationInput.value = focusOpts.durationMs || '';
        if (anchorXInput) anchorXInput.value = focusOpts.anchorX ?? '';
        if (anchorYInput) anchorYInput.value = focusOpts.anchorY ?? '';
        if (boxWidthInput) boxWidthInput.value = focusOpts.minWorldBox?.width || '';
        if (boxHeightInput) boxHeightInput.value = focusOpts.minWorldBox?.height || '';

        // Render breakpoints
        this.#renderBreakpoints();
    }

    /**
     * Load graph settings
     * 
     * @param {any} graphData
     */
    loadGraphSettings(graphData) {
        this.#graphData = graphData;

        const draggableCheck = document.getElementById('propGraphDraggable');
        const introDurationInput = document.getElementById('propIntroDuration');
        const viewXInput = document.getElementById('propInitViewX');
        const viewYInput = document.getElementById('propInitViewY');
        const viewWidthInput = document.getElementById('propInitViewWidth');
        const viewHeightInput = document.getElementById('propInitViewHeight');

        const settings = graphData?.settings || {};
        const viewbox = settings.initialViewbox || {};

        if (draggableCheck) draggableCheck.checked = settings.draggable ?? true;
        if (introDurationInput) introDurationInput.value = settings.introDurationMs || '';
        if (viewXInput) viewXInput.value = viewbox.x || '';
        if (viewYInput) viewYInput.value = viewbox.y || '';
        if (viewWidthInput) viewWidthInput.value = viewbox.width || '';
        if (viewHeightInput) viewHeightInput.value = viewbox.height || '';
    }

    #updateNodeProperty(prop) {
        if (!this.#currentNode) return;

        const titleInput = document.getElementById('propNodeTitle');
        const xInput = document.getElementById('propNodeX');
        const yInput = document.getElementById('propNodeY');
        const widthInput = document.getElementById('propNodeWidth');

        if (prop === 'title' && titleInput) {
            this.#currentNode.title = titleInput.value;
        } else if (prop === 'x' && xInput) {
            this.#currentNode.position.x = parseFloat(xInput.value) || 0;
        } else if (prop === 'y' && yInput) {
            this.#currentNode.position.y = parseFloat(yInput.value) || 0;
        } else if (prop === 'width' && widthInput) {
            this.#currentNode.width = widthInput.value ? parseFloat(widthInput.value) : undefined;
        }

        this.#onChange?.();
    }

    #updateFocusOptions() {
        if (!this.#currentNode) return;

        if (!this.#currentNode.focusOptions) {
            this.#currentNode.focusOptions = {};
        }

        const durationInput = document.getElementById('propFocusDuration');
        const anchorXInput = document.getElementById('propFocusAnchorX');
        const anchorYInput = document.getElementById('propFocusAnchorY');
        const boxWidthInput = document.getElementById('propWorldBoxWidth');
        const boxHeightInput = document.getElementById('propWorldBoxHeight');

        if (durationInput?.value) {
            this.#currentNode.focusOptions.durationMs = parseFloat(durationInput.value);
        }
        if (anchorXInput?.value) {
            this.#currentNode.focusOptions.anchorX = parseFloat(anchorXInput.value);
        }
        if (anchorYInput?.value) {
            this.#currentNode.focusOptions.anchorY = parseFloat(anchorYInput.value);
        }

        if (boxWidthInput?.value || boxHeightInput?.value) {
            if (!this.#currentNode.focusOptions.minWorldBox) {
                this.#currentNode.focusOptions.minWorldBox = {};
            }
            if (boxWidthInput?.value) {
                this.#currentNode.focusOptions.minWorldBox.width = parseFloat(boxWidthInput.value);
            }
            if (boxHeightInput?.value) {
                this.#currentNode.focusOptions.minWorldBox.height = parseFloat(boxHeightInput.value);
            }
        }

        this.#onChange?.();
    }

    #renderBreakpoints() {
        const container = document.getElementById('breakpointsList');
        if (!container) return;

        container.innerHTML = '';

        const responsiveBoxes = this.#currentNode?.focusOptions?.responsiveWorldBox;
        if (!responsiveBoxes) return;

        const breakpoints = Array.isArray(responsiveBoxes) ? responsiveBoxes : [responsiveBoxes];

        breakpoints.forEach((bp, index) => {
            const item = document.createElement('div');
            item.className = 'breakpoint-item';
            item.innerHTML = `
                <div class="breakpoint-header">
                    <div class="breakpoint-title">Breakpoint ${index + 1}</div>
                    <button class="breakpoint-remove" data-index="${index}">Remove</button>
                </div>
                <div class="prop-row">
                    <label class="prop-label">Min Viewport Width</label>
                    <input type="number" class="prop-input bp-min-width" data-index="${index}" value="${bp.minViewportWidth || 0}" />
                </div>
                <div class="prop-row">
                    <label class="prop-label">WorldBox Width</label>
                    <input type="number" class="prop-input bp-box-width" data-index="${index}" value="${bp.minWorldBox?.width || ''}" />
                </div>
                <div class="prop-row">
                    <label class="prop-label">WorldBox Height</label>
                    <input type="number" class="prop-input bp-box-height" data-index="${index}" value="${bp.minWorldBox?.height || ''}" />
                </div>
                <div class="prop-row">
                    <label class="prop-label">Anchor X</label>
                    <input type="number" class="prop-input bp-anchor-x" data-index="${index}" step="0.1" min="0" max="1" value="${bp.anchorX ?? ''}" />
                </div>
                <div class="prop-row">
                    <label class="prop-label">Anchor Y</label>
                    <input type="number" class="prop-input bp-anchor-y" data-index="${index}" step="0.1" min="0" max="1" value="${bp.anchorY ?? ''}" />
                </div>
            `;
            container.appendChild(item);

            // Bind events
            item.querySelector('.breakpoint-remove')?.addEventListener('click', () => this.#removeBreakpoint(index));
            item.querySelectorAll('input').forEach(input => {
                input.addEventListener('input', () => this.#updateBreakpoint(index));
            });
        });
    }

    #addBreakpoint() {
        if (!this.#currentNode) return;

        if (!this.#currentNode.focusOptions) {
            this.#currentNode.focusOptions = {};
        }

        if (!this.#currentNode.focusOptions.responsiveWorldBox) {
            this.#currentNode.focusOptions.responsiveWorldBox = [];
        } else if (!Array.isArray(this.#currentNode.focusOptions.responsiveWorldBox)) {
            this.#currentNode.focusOptions.responsiveWorldBox = [this.#currentNode.focusOptions.responsiveWorldBox];
        }

        this.#currentNode.focusOptions.responsiveWorldBox.push({
            minViewportWidth: 768,
            minWorldBox: { width: 800, height: 600 },
            anchorX: 0.5,
            anchorY: 0.5
        });

        this.#renderBreakpoints();
        this.#onChange?.();
    }

    #removeBreakpoint(index) {
        if (!this.#currentNode?.focusOptions?.responsiveWorldBox) return;

        const breakpoints = Array.isArray(this.#currentNode.focusOptions.responsiveWorldBox) 
            ? this.#currentNode.focusOptions.responsiveWorldBox 
            : [this.#currentNode.focusOptions.responsiveWorldBox];

        breakpoints.splice(index, 1);

        if (breakpoints.length === 0) {
            delete this.#currentNode.focusOptions.responsiveWorldBox;
        } else {
            this.#currentNode.focusOptions.responsiveWorldBox = breakpoints;
        }

        this.#renderBreakpoints();
        this.#onChange?.();
    }

    #updateBreakpoint(index) {
        if (!this.#currentNode?.focusOptions?.responsiveWorldBox) return;

        const breakpoints = Array.isArray(this.#currentNode.focusOptions.responsiveWorldBox) 
            ? this.#currentNode.focusOptions.responsiveWorldBox 
            : [this.#currentNode.focusOptions.responsiveWorldBox];

        const bp = breakpoints[index];
        if (!bp) return;

        const minWidthInput = document.querySelector(`.bp-min-width[data-index="${index}"]`);
        const boxWidthInput = document.querySelector(`.bp-box-width[data-index="${index}"]`);
        const boxHeightInput = document.querySelector(`.bp-box-height[data-index="${index}"]`);
        const anchorXInput = document.querySelector(`.bp-anchor-x[data-index="${index}"]`);
        const anchorYInput = document.querySelector(`.bp-anchor-y[data-index="${index}"]`);

        if (minWidthInput?.value) bp.minViewportWidth = parseFloat(minWidthInput.value);
        
        if (!bp.minWorldBox) bp.minWorldBox = {};
        if (boxWidthInput?.value) bp.minWorldBox.width = parseFloat(boxWidthInput.value);
        if (boxHeightInput?.value) bp.minWorldBox.height = parseFloat(boxHeightInput.value);
        
        if (anchorXInput?.value) bp.anchorX = parseFloat(anchorXInput.value);
        if (anchorYInput?.value) bp.anchorY = parseFloat(anchorYInput.value);

        this.#onChange?.();
    }

    #applyGraphSettings() {
        if (!this.#graphData) return;

        const introDurationInput = document.getElementById('propIntroDuration');
        const viewXInput = document.getElementById('propInitViewX');
        const viewYInput = document.getElementById('propInitViewY');
        const viewWidthInput = document.getElementById('propInitViewWidth');
        const viewHeightInput = document.getElementById('propInitViewHeight');

        if (!this.#graphData.settings) this.#graphData.settings = {};
        if (!this.#graphData.settings.initialViewbox) this.#graphData.settings.initialViewbox = {};

        if (introDurationInput?.value) {
            this.#graphData.settings.introDurationMs = parseFloat(introDurationInput.value);
        }

        const viewbox = this.#graphData.settings.initialViewbox;
        if (viewXInput?.value) viewbox.x = parseFloat(viewXInput.value);
        if (viewYInput?.value) viewbox.y = parseFloat(viewYInput.value);
        if (viewWidthInput?.value) viewbox.width = parseFloat(viewWidthInput.value);
        if (viewHeightInput?.value) viewbox.height = parseFloat(viewHeightInput.value);

        this.#onChange?.();

        // Show confirmation
        const btn = document.getElementById('applySettingsBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Applied ✓';
            btn.style.background = 'rgba(60, 180, 100, 1)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 1500);
        }
    }

    /** @returns {boolean} */
    isCollapsed() {
        return this.#panel.classList.contains('collapsed');
    }

    /** Collapse the panel */
    collapse() {
        this.#panel.classList.add('collapsed');
    }

    /** Expand the panel */
    expand() {
        this.#panel.classList.remove('collapsed');
    }
}
