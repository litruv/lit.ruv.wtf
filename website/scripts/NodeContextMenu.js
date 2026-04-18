/**
 * @file NodeContextMenu.js
 * Handles right-click context menu for adding nodes to the workspace.
 * Simplified from Picograph's WorkspaceContextMenuManager.
 */

import { NodeRegistry } from './nodes/NodeRegistry.js';

/**
 * Manages context menu for adding nodes on right-click.
 */
export class NodeContextMenu {
    /** @type {HTMLElement} */
    #canvas;

    /** @type {HTMLDivElement | null} */
    #container = null;

    /** @type {HTMLInputElement | null} */
    #searchInput = null;

    /** @type {HTMLDivElement | null} */
    #list = null;

    /** @type {boolean} */
    #isVisible = false;

    /** @type {{ x: number, y: number }} */
    #spawnPosition = { x: 0, y: 0 };

    /** @type {string[]} */
    #filteredTypes = [];

    /** @type {number} */
    #selectedIndex = -1;

    /** @type {HTMLButtonElement[]} */
    #itemElements = [];

    /** @type {((type: string, worldX: number, worldY: number) => void) | null} */
    #onSpawnNode = null;

    /**
     * @param {HTMLElement} canvas Workspace canvas element.
     * @param {(type: string, worldX: number, worldY: number) => void} onSpawnNode Callback to spawn node.
     */
    constructor(canvas, onSpawnNode) {
        this.#canvas = canvas;
        this.#onSpawnNode = onSpawnNode;
    }

    /**
     * Initializes the context menu DOM.
     */
    initialize() {
        if (this.#container) return;

        const container = document.createElement('div');
        container.className = 'node-context-menu';
        container.setAttribute('role', 'dialog');
        container.setAttribute('aria-label', 'Add node');

        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'context-menu-search';
        search.placeholder = 'Search nodes';
        search.setAttribute('aria-label', 'Search nodes');
        container.appendChild(search);

        const list = document.createElement('div');
        list.className = 'context-menu-list';
        list.setAttribute('role', 'listbox');
        container.appendChild(list);

        document.body.appendChild(container);

        search.addEventListener('input', () => {
            this.#renderResults(search.value);
        });

        search.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.hide();
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.#moveSelection(1);
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.#moveSelection(-1);
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                this.#selectCurrent();
            }
        });

        document.addEventListener('pointerdown', (event) => {
            if (!this.#isVisible) return;
            if (!(event.target instanceof Node)) {
                this.hide();
                return;
            }
            if (!container.contains(event.target)) {
                this.hide();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (!this.#isVisible) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                this.hide();
            }
        });

        this.#container = container;
        this.#searchInput = search;
        this.#list = list;
    }

    /**
     * Shows context menu at viewport coords.
     *
     * @param {number} clientX Viewport X.
     * @param {number} clientY Viewport Y.
     * @param {number} worldX World-space X for spawning.
     * @param {number} worldY World-space Y for spawning.
     */
    show(clientX, clientY, worldX, worldY) {
        this.initialize();

        if (!this.#container || !this.#searchInput) return;

        this.#spawnPosition = { x: worldX, y: worldY };
        this.#selectedIndex = -1;
        this.#searchInput.value = '';
        this.#renderResults('');

        this.#container.classList.add('is-visible');
        this.#container.style.left = `${clientX}px`;
        this.#container.style.top = `${clientY}px`;
        this.#isVisible = true;

        // Adjust if menu goes off-screen
        const menuRect = this.#container.getBoundingClientRect();
        let adjustedLeft = clientX;
        let adjustedTop = clientY;

        if (menuRect.right > window.innerWidth) {
            adjustedLeft -= menuRect.right - window.innerWidth;
        }
        if (menuRect.bottom > window.innerHeight) {
            adjustedTop -= menuRect.bottom - window.innerHeight;
        }

        adjustedLeft = Math.max(0, adjustedLeft);
        adjustedTop = Math.max(0, adjustedTop);

        this.#container.style.left = `${adjustedLeft}px`;
        this.#container.style.top = `${adjustedTop}px`;

        requestAnimationFrame(() => {
            this.#searchInput?.focus();
        });
    }

    /**
     * Hides the context menu.
     */
    hide() {
        if (!this.#container || !this.#isVisible) return;

        this.#container.classList.remove('is-visible');
        this.#isVisible = false;
        this.#selectedIndex = -1;
        this.#itemElements = [];
        this.#filteredTypes = [];
        if (this.#searchInput) {
            this.#searchInput.value = '';
        }
    }

    /**
     * Returns true if context menu is visible.
     *
     * @returns {boolean}
     */
    isVisible() {
        return this.#isVisible;
    }

    /**
     * Renders filtered node types based on query.
     *
     * @param {string} query Search query.
     */
    #renderResults(query) {
        if (!this.#list) return;

        const allTypes = NodeRegistry.BlueprintPure_GetRegisteredTypes();
        const normalizedQuery = query.trim().toLowerCase();

        this.#filteredTypes = normalizedQuery
            ? allTypes.filter(type => type.toLowerCase().includes(normalizedQuery))
            : allTypes.slice();

        this.#list.innerHTML = '';
        this.#itemElements = [];

        if (!this.#filteredTypes.length) {
            const empty = document.createElement('p');
            empty.className = 'context-menu-empty';
            empty.textContent = 'No matching nodes';
            this.#list.appendChild(empty);
            this.#selectedIndex = -1;
            return;
        }

        this.#filteredTypes.forEach((type, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'context-menu-item';
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', 'false');
            button.textContent = this.#formatNodeTypeName(type);

            button.addEventListener('click', () => {
                this.#updateSelection(index);
                this.#selectCurrent();
            });

            button.addEventListener('pointerenter', () => {
                this.#updateSelection(index);
            });

            button.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.#moveSelection(1);
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    this.#moveSelection(-1);
                }
            });

            this.#list.appendChild(button);
            this.#itemElements.push(button);
        });

        this.#updateSelection(0);
    }

    /**
     * Formats node type for display (e.g., "print_node" → "Print Node").
     *
     * @param {string} type Node type string.
     * @returns {string}
     */
    #formatNodeTypeName(type) {
        return type
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Moves selection by offset.
     *
     * @param {number} offset Delta.
     */
    #moveSelection(offset) {
        const total = this.#filteredTypes.length;
        if (!total || !Number.isFinite(offset) || offset === 0) return;

        let index = this.#selectedIndex;
        if (index < 0) {
            index = offset > 0 ? 0 : total - 1;
        } else {
            index = (index + offset + total) % total;
        }

        this.#updateSelection(index);
        this.#focusSelection();
    }

    /**
     * Updates visual selection.
     *
     * @param {number} index Target index.
     */
    #updateSelection(index) {
        const previousIndex = this.#selectedIndex;
        const items = this.#itemElements;

        if (previousIndex >= 0 && items[previousIndex]) {
            items[previousIndex].classList.remove('is-selected');
            items[previousIndex].setAttribute('aria-selected', 'false');
        }

        if (index < 0 || index >= this.#filteredTypes.length) {
            this.#selectedIndex = -1;
            return;
        }

        this.#selectedIndex = index;
        const element = items[index];
        if (element) {
            element.classList.add('is-selected');
            element.setAttribute('aria-selected', 'true');
            element.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Focuses currently selected element.
     */
    #focusSelection() {
        const element = this.#itemElements[this.#selectedIndex];
        if (!element) return;
        try {
            element.focus({ preventScroll: true });
        } catch {
            element.focus();
        }
    }

    /**
     * Spawns node for current selection.
     */
    #selectCurrent() {
        if (this.#selectedIndex < 0 || this.#selectedIndex >= this.#filteredTypes.length) {
            return;
        }

        const type = this.#filteredTypes[this.#selectedIndex];
        if (this.#onSpawnNode) {
            this.#onSpawnNode(type, this.#spawnPosition.x, this.#spawnPosition.y);
        }
        this.hide();
    }
}
