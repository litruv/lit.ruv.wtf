function addTapeToImages() {
    const images = document.querySelectorAll('.image-placeholder');
    console.log(`[Tape] Found ${images.length} images to add tape to`);
    
    if (images.length === 0) {
        console.warn('[Tape] No .image-placeholder elements found');
        return;
    }
    
    images.forEach((image, index) => {
        console.log(`[Tape] Processing image ${index + 1}/${images.length}`);
        
        // Check if image already has tape
        const existingTape = image.querySelectorAll('.tape');
        if (existingTape.length > 0) {
            console.log(`[Tape] Image ${index + 1} already has tape, skipping`);
            return;
        }
        
        // Ensure the image parent has relative positioning
        const imageParent = image.parentElement;
        if (imageParent && window.getComputedStyle(imageParent).position === 'static') {
            imageParent.style.position = 'relative';
            console.log(`[Tape] Set image parent to relative positioning`);
        }
        
        // Create two tape pieces
        const tape1 = createTapeElement(index, 1);
        const tape2 = createTapeElement(index, 2);
        
        // Position based on pattern
        const usePattern1 = index % 2 === 0;
        if (usePattern1) {
            positionTape(tape1, 'top-left');
            positionTape(tape2, 'bottom-right');
        } else {
            positionTape(tape1, 'top-right');
            positionTape(tape2, 'bottom-left');
        }
        
        // Add to the image's parent container
        imageParent.appendChild(tape1);
        imageParent.appendChild(tape2);
        
        console.log(`[Tape] Added tape to image ${index + 1} parent`);
    });
}

function createTapeElement(imageIndex, tapeNumber) {
    const tape = document.createElement('div');
    tape.className = 'tape';
    
    // Even chunkier tape: wider and much taller
    const width = 60 + Math.random() * 20; // 60-80px
    const height = 40 + Math.random() * 16; // 40-56px
    
    tape.style.cssText = `
        position: absolute;
        width: ${width}px;
        height: ${height}px;
        background: rgba(255, 248, 220, 0.93);
        z-index: 100;
        pointer-events: none;
        box-shadow: 2px 2px 6px rgba(0,0,0,0.18);
        background-image: linear-gradient(45deg, 
            rgba(255, 255, 255, 0.25) 25%, 
            transparent 25%, 
            transparent 75%, 
            rgba(255, 255, 255, 0.25) 75%);
        background-size: 4px 4px;
    `;
    
    console.log(`[Tape] Created tape element ${tapeNumber} for image ${imageIndex + 1}`);
    return tape;
}

function positionTape(tape, corner) {
    const randomOffset = () => Math.random() * 8 - 4; // -4 to 4px
    const randomRotation = (Math.random() * 20 - 10); // -10 to 10 degrees
    const OUT_X = 25; // px, how far out from the left/right
    const OUT_Y = 18; // px, how far out from the top/bottom

    switch (corner) {
        case 'top-left':
            tape.style.top = `${-OUT_Y + randomOffset()}px`;
            tape.style.left = `${-OUT_X + randomOffset()}px`;
            tape.style.transform = `rotate(${-45 + randomRotation}deg)`;
            break;
        case 'top-right':
            tape.style.top = `${-OUT_Y + randomOffset()}px`;
            tape.style.right = `${-OUT_X + randomOffset()}px`;
            tape.style.transform = `rotate(${45 + randomRotation}deg)`;
            break;
        case 'bottom-left':
            tape.style.bottom = `${-OUT_Y + randomOffset()}px`;
            tape.style.left = `${-OUT_X + randomOffset()}px`;
            tape.style.transform = `rotate(${45 + randomRotation}deg)`;
            break;
        case 'bottom-right':
            tape.style.bottom = `${-OUT_Y + randomOffset()}px`;
            tape.style.right = `${-OUT_X + randomOffset()}px`;
            tape.style.transform = `rotate(${-45 + randomRotation}deg)`;
            break;
    }
    
    console.log(`[Tape] Positioned tape at ${corner}:`, {
        top: tape.style.top,
        bottom: tape.style.bottom,
        left: tape.style.left,
        right: tape.style.right,
        transform: tape.style.transform
    });
}

function refreshTape() {
    console.log('[Tape] Refreshing tape - removing existing tape');
    
    // Remove existing tape
    const existingTape = document.querySelectorAll('.tape');
    console.log(`[Tape] Found ${existingTape.length} existing tape elements to remove`);
    
    existingTape.forEach(tape => tape.remove());
    
    console.log('[Tape] Re-adding tape to images');
    addTapeToImages();
}

// Simple test function
function testSimpleTape() {
    console.log('[Tape Test] Creating simple test...');
    
    const firstImage = document.querySelector('.image-placeholder');
    if (!firstImage) {
        console.error('[Tape Test] No images found');
        return;
    }
    
    const parent = firstImage.parentElement;
    parent.style.position = 'relative';
    
    const testTape = document.createElement('div');
    testTape.className = 'tape';
    testTape.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        width: 60px;
        height: 30px;
        background: red;
        border: 2px solid black;
        z-index: 999;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
    `;
    testTape.textContent = 'TEST';
    
    parent.appendChild(testTape);
    console.log('[Tape Test] Added test tape to first image parent');
    
    setTimeout(() => {
        testTape.remove();
        console.log('[Tape Test] Removed test tape');
    }, 3000);
}

// Export functions
window.addTapeToImages = addTapeToImages;
window.refreshTape = refreshTape;
window.testSimpleTape = testSimpleTape;

console.log('[Tape] Simple tape system loaded. Use window.testSimpleTape() to test.');
