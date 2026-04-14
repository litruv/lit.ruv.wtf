/**
 * Debug overlay panel — top-right corner.
 * Displays live viewport info and exposes the draggable-items toggle.
 */
export class DebugPanel {
    /** @type {HTMLElement} */
    #panel;

    /** @type {HTMLElement} */
    #zoomEl;

    /** @type {HTMLElement} */
    #dprEl;

    /** @type {HTMLElement | null} */
    #viewportEl;

    /** @type {HTMLElement} */
    #centerEl;

    /** @type {HTMLElement} */
    #viewboxEl;

    /** @type {HTMLElement} */
    #anchorEl;

    /** @type {HTMLInputElement} */
    #draggableCheckbox;

    /** @type {HTMLElement} */
    #activeItemRow;

    /** @type {HTMLElement} */
    #activeItemLabel;

    /** @type {HTMLElement} */
    #activeItemPos;

    /** @type {HTMLButtonElement} */
    #copyBtn;

    /** @type {HTMLButtonElement} */
    #copyJsonBtn;

    /** @type {HTMLButtonElement} */
    #showPropertiesBtn;

    /** @type {HTMLElement} */
    #nodeEditorDivider;

    /** @type {HTMLElement} */
    #nodeEditor;

    /** @type {HTMLInputElement} */
    #nodeIdInput;

    /** @type {HTMLInputElement} */
    #nodeTypeInput;

    /** @type {HTMLInputElement} */
    #nodeTitleInput;

    /** @type {HTMLInputElement} */
    #nodeXInput;

    /** @type {HTMLInputElement} */
    #nodeYInput;

    /** @type {HTMLInputElement} */
    #nodeWidthInput;

    /** @type {HTMLElement} */
    #inputsList;

    /** @type {HTMLElement} */
    #outputsList;

    /** @type {HTMLButtonElement} */
    #addInputBtn;

    /** @type {HTMLButtonElement} */
    #addOutputBtn;

    /** @type {HTMLInputElement} */
    #worldboxCheckbox;

    /** @type {HTMLInputElement} */
    #viewboxCheckbox;

    /** @type {((enabled: boolean) => void) | null} */
    #onDraggableChange = null;

    /** @type {((enabled: boolean) => void) | null} */
    #onWorldBoxChange = null;

    /** @type {((enabled: boolean) => void) | null} */
    #onViewboxChange = null;

    /** @type {(() => void) | null} */
    #onCopyNode = null;

    /** @type {(() => void) | null} */
    #onCopyGraph = null;

    /** @type {(() => void) | null} */
    #onShowProperties = null;

    /** @type {((nodeId: string, updates: any) => void) | null} */
    #onNodeUpdate = null;

    /** @type {string | null} */
    #lastActiveId = null;

    /**
     * @param {HTMLElement} panel - The `.debug-panel` element.
     * @param {((enabled: boolean) => void) | null} [onDraggableChange]
     * @param {(() => void) | null} [onCopyNode]
     * @param {((nodeId: string, updates: any) => void) | null} [onNodeUpdate]
     * @param {((enabled: boolean) => void) | null} [onWorldBoxChange]
     * @param {(() => void) | null} [onCopyGraph]
     * @param {((enabled: boolean) => void) | null} [onViewboxChange]
     * @param {(() => void) | null} [onShowProperties]
     */
    constructor(panel, onDraggableChange = null, onCopyNode = null, onNodeUpdate = null, onWorldBoxChange = null, onCopyGraph = null, onViewboxChange = null, onShowProperties = null) {
        this.#panel               = panel;
        this.#onDraggableChange   = onDraggableChange;
        this.#onCopyNode          = onCopyNode;
        this.#onCopyGraph         = onCopyGraph;
        this.#onNodeUpdate        = onNodeUpdate;
        this.#onWorldBoxChange    = onWorldBoxChange;
        this.#onViewboxChange     = onViewboxChange;
        this.#onShowProperties    = onShowProperties;
        this.#zoomEl              = /** @type {HTMLElement} */ (panel.querySelector(".debug-zoom"));
        this.#dprEl               = /** @type {HTMLElement} */ (panel.querySelector(".debug-dpr"));
        this.#viewportEl          = /** @type {HTMLElement} */ (panel.querySelector(".debug-viewport"));
        this.#centerEl            = /** @type {HTMLElement} */ (panel.querySelector(".debug-center"));
        this.#viewboxEl           = /** @type {HTMLElement} */ (panel.querySelector(".debug-viewbox"));
        this.#anchorEl            = /** @type {HTMLElement} */ (panel.querySelector(".debug-anchor"));
        this.#draggableCheckbox   = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-draggable-cb"));
        this.#activeItemRow       = /** @type {HTMLElement} */ (panel.querySelector(".debug-active-row"));
        this.#activeItemLabel     = /** @type {HTMLElement} */ (panel.querySelector(".debug-active-label"));
        this.#activeItemPos       = /** @type {HTMLElement} */ (panel.querySelector(".debug-active-pos"));
        this.#copyBtn             = /** @type {HTMLButtonElement} */ (panel.querySelector(".debug-copy-btn"));
        this.#copyJsonBtn         = /** @type {HTMLButtonElement} */ (panel.querySelector(".debug-copy-json-btn"));
        this.#showPropertiesBtn   = /** @type {HTMLButtonElement} */ (panel.querySelector(".debug-show-properties-btn"));
        this.#nodeEditorDivider   = /** @type {HTMLElement} */ (document.getElementById("debugNodeEditorDivider"));
        this.#nodeEditor          = /** @type {HTMLElement} */ (document.getElementById("debugNodeEditor"));
        this.#nodeIdInput         = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-node-id"));
        this.#nodeTypeInput       = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-node-type"));
        this.#nodeTitleInput      = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-node-title"));
        this.#nodeXInput          = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-node-x"));
        this.#nodeYInput          = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-node-y"));
        this.#nodeWidthInput      = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-node-width"));
        this.#inputsList          = /** @type {HTMLElement} */ (document.getElementById("debugInputsList"));
        this.#outputsList         = /** @type {HTMLElement} */ (document.getElementById("debugOutputsList"));
        this.#addInputBtn         = /** @type {HTMLButtonElement} */ (panel.querySelector(".debug-add-input-btn"));
        this.#addOutputBtn        = /** @type {HTMLButtonElement} */ (panel.querySelector(".debug-add-output-btn"));
        this.#worldboxCheckbox    = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-worldbox-cb"));
        this.#viewboxCheckbox     = /** @type {HTMLInputElement} */ (panel.querySelector(".debug-viewbox-cb"));

        const toggleBtn = /** @type {HTMLButtonElement} */ (panel.querySelector(".debug-toggle-btn"));
        toggleBtn?.addEventListener("click", () => {
            panel.classList.toggle("collapsed");
        });

        this.#draggableCheckbox.addEventListener("change", () => {
            this.#onDraggableChange?.(this.#draggableCheckbox.checked);
        });

        this.#worldboxCheckbox?.addEventListener("change", () => {
            this.#onWorldBoxChange?.(this.#worldboxCheckbox.checked);
        });

        this.#viewboxCheckbox?.addEventListener("change", () => {
            this.#onViewboxChange?.(this.#viewboxCheckbox.checked);
        });

        this.#copyBtn.addEventListener("click", () => {
            this.#onCopyNode?.();
        });

        this.#copyJsonBtn?.addEventListener("click", () => {
            this.#onCopyGraph?.();
        });

        this.#showPropertiesBtn?.addEventListener("click", () => {
            this.#onShowProperties?.();
        });

        this.#nodeTitleInput.addEventListener("input", () => this.#handleNodeChange());
        this.#nodeXInput.addEventListener("input", () => this.#handleNodeChange());
        this.#nodeYInput.addEventListener("input", () => this.#handleNodeChange());
        this.#nodeWidthInput.addEventListener("input", () => this.#handleNodeChange());
        
        this.#addInputBtn.addEventListener("click", () => this.#handleAddPin("input"));
        this.#addOutputBtn.addEventListener("click", () => this.#handleAddPin("output"));
    }

    // ─── Public ───────────────────────────────────────────────────────────────

    /** @returns {string | null} */
    get lastActiveId() { return this.#lastActiveId; }

    /**
     * Sets the draggable checkbox to the given value without firing the change callback.
     *
     * @param {boolean} enabled
     */
    setDraggable(enabled) {
        this.#draggableCheckbox.checked = enabled;
    }

    /**
     * Updates all displayed values.
     *
     * @param {{ zoom: number, center: { x: number, y: number }, viewbox: { x: number, y: number, width: number, height: number } }} viewInfo
     * @param {string | null} [activeId]
     * @param {{ x: number, y: number, width: number, height: number } | null} [activeRect]
     * @param {any} [nodeData] - Full node data object for editor
     */
    update(viewInfo, activeId = null, activeRect = null, nodeData = null) {
        const { zoom, center, viewbox } = viewInfo;

        this.#zoomEl.textContent   = zoom.toFixed(3);
        this.#dprEl.textContent    = (window.devicePixelRatio || 1).toFixed(2);
        
        // Use document.documentElement if window dimensions are 0
        const vpWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const vpHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (this.#viewportEl) {
            this.#viewportEl.textContent = `${vpWidth} × ${vpHeight}`;
        }
        
        this.#centerEl.textContent = `${this.#fmt(center.x)}, ${this.#fmt(center.y)}`;
        this.#viewboxEl.textContent =
            `${this.#fmt(viewbox.x)}, ${this.#fmt(viewbox.y)}  ${this.#fmt(viewbox.width)} \u00d7 ${this.#fmt(viewbox.height)}`;

        if (activeRect && viewbox.width > 0 && viewbox.height > 0) {
            // 0 = node left/top edge at viewport left/top, 1 = node right/bottom edge at viewport right/bottom.
            const ax = (activeRect.x - viewbox.x) / Math.max(1, viewbox.width  - activeRect.width);
            const ay = (activeRect.y - viewbox.y) / Math.max(1, viewbox.height - activeRect.height);
            this.#anchorEl.textContent = `${ax.toFixed(2)}, ${ay.toFixed(2)}`;
        } else {
            this.#anchorEl.textContent = '\u2014';
        }

        if (activeId && activeRect) {
            this.#lastActiveId = activeId;
            this.#activeItemRow.hidden     = false;
            this.#activeItemLabel.textContent = activeId;
            this.#activeItemPos.textContent   =
                `${this.#fmt(activeRect.x)}, ${this.#fmt(activeRect.y)}`;
            
            if (nodeData) {
                this.#populateNodeEditor(nodeData);
            }
        } else {
            this.#activeItemRow.hidden = true;
            this.#hideNodeEditor();
        }
    }

    /**
     * Populates node editor with node data.
     *
     * @param {any} node
     */
    #populateNodeEditor(node) {
        this.#nodeEditorDivider.hidden = false;
        this.#nodeEditor.hidden = false;
        
        this.#nodeIdInput.value = node.id || '';
        this.#nodeTypeInput.value = node.type || '';
        this.#nodeTitleInput.value = node.title || '';
        this.#nodeXInput.value = String(node.position?.x ?? 0);
        this.#nodeYInput.value = String(node.position?.y ?? 0);
        this.#nodeWidthInput.value = node.width != null ? String(node.width) : '';
        
        this.#renderPinsList(node.inputs || [], "input");
        this.#renderPinsList(node.outputs || [], "output");
    }

    /**
     * Renders pin list.
     *
     * @param {any[]} pins
     * @param {('input'|'output')} direction
     */
    #renderPinsList(pins, direction) {
        const container = direction === "input" ? this.#inputsList : this.#outputsList;
        container.innerHTML = '';
        
        pins.forEach((pin, index) => {
            const pinEl = document.createElement("div");
            pinEl.className = "debug-pin-item";
            pinEl.innerHTML = `
                <div class="debug-pin-row">
                    <input class="debug-pin-input debug-pin-id" type="text" placeholder="id" value="${pin.id || ''}" data-index="${index}" data-field="id" />
                    <input class="debug-pin-input debug-pin-name" type="text" placeholder="name" value="${pin.name || ''}" data-index="${index}" data-field="name" />
                    <select class="debug-pin-input debug-pin-kind" data-index="${index}" data-field="kind">
                        <option value="exec" ${pin.kind === 'exec' ? 'selected' : ''}>exec</option>
                        <option value="number" ${pin.kind === 'number' ? 'selected' : ''}>number</option>
                        <option value="string" ${pin.kind === 'string' ? 'selected' : ''}>string</option>
                        <option value="boolean" ${pin.kind === 'boolean' ? 'selected' : ''}>boolean</option>
                    </select>
                    <button class="debug-pin-remove" data-index="${index}" title="Remove">×</button>
                </div>
                <div class="debug-pin-row">
                    <input class="debug-pin-input debug-pin-default" type="text" placeholder="default value" value="${pin.defaultValue ?? ''}" data-index="${index}" data-field="defaultValue" />
                </div>
            `;
            
            pinEl.querySelectorAll('.debug-pin-input').forEach(input => {
                input.addEventListener('input', () => this.#handlePinChange(direction));
                input.addEventListener('change', () => this.#handlePinChange(direction));
            });
            
            const removeBtn = pinEl.querySelector('.debug-pin-remove');
            removeBtn?.addEventListener('click', () => this.#handleRemovePin(direction, index));
            
            container.appendChild(pinEl);
        });
    }

    /**
     * Hides node editor.
     */
    #hideNodeEditor() {
        this.#nodeEditorDivider.hidden = true;
        this.#nodeEditor.hidden = true;
    }

    /**
     * Handles node property changes.
     */
    #handleNodeChange() {
        if (!this.#lastActiveId || !this.#onNodeUpdate) return;

        const updates = {
            title: this.#nodeTitleInput.value,
            position: {
                x: parseFloat(this.#nodeXInput.value) || 0,
                y: parseFloat(this.#nodeYInput.value) || 0
            }
        };

        const widthVal = this.#nodeWidthInput.value.trim();
        if (widthVal !== '') {
            updates.width = parseFloat(widthVal) || null;
        }

        this.#onNodeUpdate(this.#lastActiveId, updates);
    }

    /**
     * Handles pin property changes.
     *
     * @param {('input'|'output')} direction
     */
    #handlePinChange(direction) {
        if (!this.#lastActiveId || !this.#onNodeUpdate) return;

        const container = direction === "input" ? this.#inputsList : this.#outputsList;
        const pins = [];
        
        container.querySelectorAll('.debug-pin-item').forEach(pinEl => {
            const idInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-id'));
            const nameInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-name'));
            const kindSelect = /** @type {HTMLSelectElement} */ (pinEl.querySelector('.debug-pin-kind'));
            const defaultInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-default'));
            
            const pin = {
                id: idInput.value || `pin_${Date.now()}`,
                name: nameInput.value || '',
                kind: kindSelect.value,
                direction: direction
            };
            
            if (defaultInput.value.trim() !== '') {
                pin.defaultValue = defaultInput.value;
            }
            
            pins.push(pin);
        });
        
        this.#onNodeUpdate(this.#lastActiveId, { [direction === "input" ? "inputs" : "outputs"]: pins });
    }

    /**
     * Handles adding a new pin.
     *
     * @param {('input'|'output')} direction
     */
    #handleAddPin(direction) {
        if (!this.#lastActiveId || !this.#onNodeUpdate) return;

        const container = direction === "input" ? this.#inputsList : this.#outputsList;
        const newPin = {
            id: `pin_${Date.now()}`,
            name: '',
            kind: 'exec',
            direction: direction
        };
        
        // Get existing pins and add new one
        const pins = [];
        container.querySelectorAll('.debug-pin-item').forEach(pinEl => {
            const idInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-id'));
            const nameInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-name'));
            const kindSelect = /** @type {HTMLSelectElement} */ (pinEl.querySelector('.debug-pin-kind'));
            const defaultInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-default'));
            
            const pin = {
                id: idInput.value,
                name: nameInput.value,
                kind: kindSelect.value,
                direction: direction
            };
            
            if (defaultInput.value.trim() !== '') {
                pin.defaultValue = defaultInput.value;
            }
            
            pins.push(pin);
        });
        
        pins.push(newPin);
        this.#onNodeUpdate(this.#lastActiveId, { [direction === "input" ? "inputs" : "outputs"]: pins });
    }

    /**
     * Handles removing a pin.
     *
     * @param {('input'|'output')} direction
     * @param {number} index
     */
    #handleRemovePin(direction, index) {
        if (!this.#lastActiveId || !this.#onNodeUpdate) return;

        const container = direction === "input" ? this.#inputsList : this.#outputsList;
        const pins = [];
        
        container.querySelectorAll('.debug-pin-item').forEach((pinEl, i) => {
            if (i === index) return; // Skip removed pin
            
            const idInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-id'));
            const nameInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-name'));
            const kindSelect = /** @type {HTMLSelectElement} */ (pinEl.querySelector('.debug-pin-kind'));
            const defaultInput = /** @type {HTMLInputElement} */ (pinEl.querySelector('.debug-pin-default'));
            
            const pin = {
                id: idInput.value,
                name: nameInput.value,
                kind: kindSelect.value,
                direction: direction
            };
            
            if (defaultInput.value.trim() !== '') {
                pin.defaultValue = defaultInput.value;
            }
            
            pins.push(pin);
        });
        
        this.#onNodeUpdate(this.#lastActiveId, { [direction === "input" ? "inputs" : "outputs"]: pins });
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    /**
     * Formats a world-space number to a compact fixed-point string.
     *
     * @param {number} n
     * @returns {string}
     */
    #fmt(n) {
        return n.toFixed(1);
    }
}
