class TapeDebugger {
    constructor() {
        this.enabled = false;
        this.debugOverlay = null;
        this.debugInfo = null;
        this.setupDebugUI();
    }

    setupDebugUI() {
        // Create debug toggle button
        const debugButton = document.createElement('button');
        debugButton.textContent = 'Debug Tape';
        debugButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000; /* Increased to ensure button is always visible */
            padding: 10px;
            background: #ff4444;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-family: monospace;
            font-weight: bold;
        `;
        debugButton.onclick = () => this.toggleDebug();
        document.body.appendChild(debugButton);

        // Create debug overlay
        this.debugOverlay = document.createElement('div');
        this.debugOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999; /* Increased to appear above tape */
            display: none;
        `;
        document.body.appendChild(this.debugOverlay);

        // Create debug info panel
        this.debugInfo = document.createElement('div');
        this.debugInfo.style.cssText = `
            position: fixed;
            top: 60px;
            right: 10px;
            width: 300px;
            max-height: 80vh;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000; /* Increased to ensure panel is always visible */
            display: none;
        `;
        document.body.appendChild(this.debugInfo);
    }

    toggleDebug() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.showDebug();
        } else {
            this.hideDebug();
        }
    }

    showDebug() {
        console.log('[Tape Debug] Enabling visual debugging');
        this.debugOverlay.style.display = 'block';
        this.debugInfo.style.display = 'block';
        this.visualizeAllTape();
        this.updateDebugInfo();
    }

    hideDebug() {
        console.log('[Tape Debug] Disabling visual debugging');
        this.debugOverlay.style.display = 'none';
        this.debugInfo.style.display = 'none';
        this.debugOverlay.innerHTML = '';
    }

    visualizeAllTape() {
        this.debugOverlay.innerHTML = '';
        const images = document.querySelectorAll('.image-placeholder');
        
        images.forEach((image, imageIndex) => {
            this.visualizeImageDebug(image, imageIndex);
        });
    }

    visualizeImageDebug(image, imageIndex) {
        const rect = image.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        // Create image outline
        const imageOutline = document.createElement('div');
        imageOutline.style.cssText = `
            position: absolute;
            left: ${rect.left + scrollLeft}px;
            top: ${rect.top + scrollTop}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border: 3px solid #00ff00;
            background: rgba(0, 255, 0, 0.1);
            pointer-events: none;
        `;
        
        // Add image label
        const imageLabel = document.createElement('div');
        imageLabel.textContent = `IMG ${imageIndex + 1}`;
        imageLabel.style.cssText = `
            position: absolute;
            top: -25px;
            left: 0;
            background: #00ff00;
            color: black;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: bold;
        `;
        imageOutline.appendChild(imageLabel);
        
        // Visualize tape pieces
        const tapeElements = image.querySelectorAll('.tape');
        tapeElements.forEach((tape, tapeIndex) => {
            this.visualizeTapeDebug(tape, tapeIndex, rect, scrollTop, scrollLeft, imageIndex);
        });
        
        this.debugOverlay.appendChild(imageOutline);
    }

    visualizeTapeDebug(tape, tapeIndex, imageRect, scrollTop, scrollLeft, imageIndex) {
        const tapeRect = tape.getBoundingClientRect();
        
        // Create tape outline
        const tapeOutline = document.createElement('div');
        tapeOutline.style.cssText = `
            position: absolute;
            left: ${tapeRect.left + scrollLeft}px;
            top: ${tapeRect.top + scrollTop}px;
            width: ${tapeRect.width}px;
            height: ${tapeRect.height}px;
            border: 2px solid #ff0000;
            background: rgba(255, 0, 0, 0.3);
            pointer-events: none;
            transform: ${tape.style.transform};
        `;
        
        // Add tape label
        const tapeLabel = document.createElement('div');
        tapeLabel.textContent = `T${tapeIndex + 1}`;
        tapeLabel.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff0000;
            color: white;
            padding: 1px 3px;
            font-size: 8px;
            font-weight: bold;
        `;
        tapeOutline.appendChild(tapeLabel);
        
        // Add positioning info
        const positionInfo = document.createElement('div');
        const corner = this.determineTapeCorner(tape);
        positionInfo.textContent = corner;
        positionInfo.style.cssText = `
            position: absolute;
            top: -15px;
            left: 0;
            background: #ff0000;
            color: white;
            padding: 1px 3px;
            font-size: 8px;
            white-space: nowrap;
        `;
        tapeOutline.appendChild(positionInfo);
        
        this.debugOverlay.appendChild(tapeOutline);
    }

    determineTapeCorner(tape) {
        const style = tape.style;
        if (style.top && style.left) return 'TOP-LEFT';
        if (style.top && style.right) return 'TOP-RIGHT';
        if (style.bottom && style.left) return 'BOTTOM-LEFT';
        if (style.bottom && style.right) return 'BOTTOM-RIGHT';
        return 'UNKNOWN';
    }

    updateDebugInfo() {
        const images = document.querySelectorAll('.image-placeholder');
        const tapeElements = document.querySelectorAll('.tape');
        
        let infoHtml = `
            <h3 style="margin-top: 0; color: #ff4444;">🎬 Tape Debug Info</h3>
            <div><strong>Images:</strong> ${images.length}</div>
            <div><strong>Tape Elements:</strong> ${tapeElements.length}</div>
            <div><strong>Expected Tape:</strong> ${images.length * 2}</div>
            <hr style="border-color: #333;">
        `;
        
        images.forEach((image, index) => {
            const tapes = image.querySelectorAll('.tape');
            const pattern = index % 2 === 0 ? 'Pattern 1 (TL+BR)' : 'Pattern 2 (TR+BL)';
            
            infoHtml += `
                <div style="margin: 10px 0; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 3px;">
                    <strong>Image ${index + 1}:</strong><br>
                    Pattern: ${pattern}<br>
                    Tape Count: ${tapes.length}/2<br>
                    ${tapes.length !== 2 ? '<span style="color: #ff4444;">⚠️ Missing tape!</span>' : '<span style="color: #44ff44;">✓ Complete</span>'}
                </div>
            `;
        });
        
        // Add tape details
        tapeElements.forEach((tape, index) => {
            const corner = this.determineTapeCorner(tape);
            const transform = tape.style.transform || 'none';
            const size = `${tape.style.width} x ${tape.style.height}`;
            
            infoHtml += `
                <div style="margin: 5px 0; padding: 5px; background: rgba(255,0,0,0.1); border-radius: 3px; font-size: 10px;">
                    <strong>Tape ${index + 1}:</strong> ${corner}<br>
                    Size: ${size}<br>
                    Transform: ${transform}
                </div>
            `;
        });
        
        this.debugInfo.innerHTML = infoHtml;
    }

    // Method to refresh debug visualization when layout changes
    refresh() {
        if (this.enabled) {
            this.visualizeAllTape();
            this.updateDebugInfo();
        }
    }
}

// Initialize debugger
const tapeDebugger = new TapeDebugger();

// Add to global scope for easy access
window.tapeDebugger = tapeDebugger;

// Hook into existing functions to update debug visualization
const originalAddTapeToImages = window.addTapeToImages;
const originalRefreshTape = window.refreshTape;

if (originalAddTapeToImages) {
    window.addTapeToImages = function() {
        originalAddTapeToImages.apply(this, arguments);
        setTimeout(() => tapeDebugger.refresh(), 100);
    };
}

if (originalRefreshTape) {
    window.refreshTape = function() {
        originalRefreshTape.apply(this, arguments);
        setTimeout(() => tapeDebugger.refresh(), 100);
    };
}

// Refresh debug on window resize
window.addEventListener('resize', () => {
    setTimeout(() => tapeDebugger.refresh(), 200);
});

console.log('[Tape Debug] Visual debugging system loaded. Click "Debug Tape" button to toggle.');
