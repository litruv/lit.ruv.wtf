/**
 * CRT Bulge Coordinate Transformer
 * Intercepts mouse events and applies inverse distortion to match the visual bulge effect
 */
class CRTBulgeTransformer {
    constructor(containerSelector, strength = 0.15) {
        this.container = document.querySelector(containerSelector);
        this.strength = strength;
        this.setupEventListeners();
    }

    /**
     * Apply inverse barrel distortion to transform visual coords to DOM coords
     * @param {number} x - Visual X coordinate relative to container
     * @param {number} y - Visual Y coordinate relative to container
     * @param {number} width - Container width
     * @param {number} height - Container height
     * @returns {{x: number, y: number}} - Transformed coordinates
     */
    inverseDistort(x, y, width, height) {
        // Normalize to -1 to 1 (center is 0,0)
        const nx = (x / width) * 2 - 1;
        const ny = (y / height) * 2 - 1;
        
        // The visual filter pushes pixels outward based on distance squared
        // To invert: we need to find where this pixel came FROM
        // Using Newton-Raphson iteration to solve the inverse
        
        let ux = nx;
        let uy = ny;
        
        // Iterate to find the original position
        for (let i = 0; i < 5; i++) {
            const distSq = ux * ux + uy * uy;
            const factor = 1 + this.strength * distSq;
            
            // Forward distortion: visual = original * factor
            // Inverse: original = visual / factor (approximately)
            ux = nx / factor;
            uy = ny / factor;
        }
        
        // Convert back to pixel coordinates
        const newX = ((ux + 1) / 2) * width;
        const newY = ((uy + 1) / 2) * height;
        
        return { x: newX, y: newY };
    }

    /**
     * Transform mouse event coordinates
     * @param {MouseEvent} e - Original mouse event
     * @returns {{x: number, y: number}} - Transformed page coordinates
     */
    transformEvent(e) {
        const rect = this.container.getBoundingClientRect();
        
        // Get position relative to container
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        
        // Apply inverse distortion
        const transformed = this.inverseDistort(relX, relY, rect.width, rect.height);
        
        // Convert back to page coordinates
        return {
            x: rect.left + transformed.x,
            y: rect.top + transformed.y
        };
    }

    /**
     * Set up event listeners for mouse interaction
     */
    setupEventListeners() {
        // Create invisible overlay to capture events
        const overlay = document.createElement('div');
        overlay.id = 'crt-event-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
            cursor: inherit;
        `;
        document.body.appendChild(overlay);

        // Track currently hovered element for hover states
        let lastHoveredElement = null;

        // Handle mouse movement
        overlay.addEventListener('mousemove', (e) => {
            const transformed = this.transformEvent(e);
            
            // Temporarily hide overlay to find element underneath
            overlay.style.pointerEvents = 'none';
            const elementBelow = document.elementFromPoint(transformed.x, transformed.y);
            overlay.style.pointerEvents = 'auto';
            
            // Update cursor based on element below
            if (elementBelow) {
                const computedStyle = window.getComputedStyle(elementBelow);
                overlay.style.cursor = computedStyle.cursor;
                
                // Handle hover state changes
                if (elementBelow !== lastHoveredElement) {
                    if (lastHoveredElement) {
                        lastHoveredElement.dispatchEvent(new MouseEvent('mouseleave', {
                            bubbles: true,
                            clientX: transformed.x,
                            clientY: transformed.y
                        }));
                    }
                    elementBelow.dispatchEvent(new MouseEvent('mouseenter', {
                        bubbles: true,
                        clientX: transformed.x,
                        clientY: transformed.y
                    }));
                    lastHoveredElement = elementBelow;
                }
                
                // Dispatch mousemove to element
                elementBelow.dispatchEvent(new MouseEvent('mousemove', {
                    bubbles: true,
                    clientX: transformed.x,
                    clientY: transformed.y
                }));
            }
        });

        // Handle clicks
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            const transformed = this.transformEvent(e);
            
            overlay.style.pointerEvents = 'none';
            const elementBelow = document.elementFromPoint(transformed.x, transformed.y);
            overlay.style.pointerEvents = 'auto';
            
            if (elementBelow) {
                elementBelow.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    clientX: transformed.x,
                    clientY: transformed.y
                }));
                
                // Focus if it's an interactive element
                if (elementBelow.tagName === 'INPUT' || elementBelow.tagName === 'TEXTAREA' || elementBelow.tabIndex >= 0) {
                    elementBelow.focus();
                }
            }
        });

        // Handle mousedown
        overlay.addEventListener('mousedown', (e) => {
            const transformed = this.transformEvent(e);
            
            overlay.style.pointerEvents = 'none';
            const elementBelow = document.elementFromPoint(transformed.x, transformed.y);
            overlay.style.pointerEvents = 'auto';
            
            if (elementBelow) {
                elementBelow.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true,
                    clientX: transformed.x,
                    clientY: transformed.y,
                    button: e.button
                }));
            }
        });

        // Handle mouseup
        overlay.addEventListener('mouseup', (e) => {
            const transformed = this.transformEvent(e);
            
            overlay.style.pointerEvents = 'none';
            const elementBelow = document.elementFromPoint(transformed.x, transformed.y);
            overlay.style.pointerEvents = 'auto';
            
            if (elementBelow) {
                elementBelow.dispatchEvent(new MouseEvent('mouseup', {
                    bubbles: true,
                    clientX: transformed.x,
                    clientY: transformed.y,
                    button: e.button
                }));
            }
        });

        // Handle wheel/scroll
        overlay.addEventListener('wheel', (e) => {
            const transformed = this.transformEvent(e);
            
            overlay.style.pointerEvents = 'none';
            const elementBelow = document.elementFromPoint(transformed.x, transformed.y);
            overlay.style.pointerEvents = 'auto';
            
            if (elementBelow) {
                elementBelow.dispatchEvent(new WheelEvent('wheel', {
                    bubbles: true,
                    clientX: transformed.x,
                    clientY: transformed.y,
                    deltaX: e.deltaX,
                    deltaY: e.deltaY,
                    deltaMode: e.deltaMode
                }));
            }
        }, { passive: true });

        // Handle context menu
        overlay.addEventListener('contextmenu', (e) => {
            const transformed = this.transformEvent(e);
            
            overlay.style.pointerEvents = 'none';
            const elementBelow = document.elementFromPoint(transformed.x, transformed.y);
            overlay.style.pointerEvents = 'auto';
            
            if (elementBelow) {
                const event = new MouseEvent('contextmenu', {
                    bubbles: true,
                    clientX: transformed.x,
                    clientY: transformed.y
                });
                if (!elementBelow.dispatchEvent(event)) {
                    e.preventDefault();
                }
            }
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Match the strength value from create-bulge-map.js
    new CRTBulgeTransformer('.container', 0.15);
});
