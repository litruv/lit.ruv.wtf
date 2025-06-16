function addTapeToImages() {
    const images = document.querySelectorAll('.image-placeholder');
    
    if (images.length === 0) {
        return;
    }
    
    images.forEach((image, index) => {
        const existingTape = image.querySelectorAll('.tape');
        if (existingTape.length > 0) {
            return;
        }
        
        const imageParent = image.parentElement;
        if (imageParent && window.getComputedStyle(imageParent).position === 'static') {
            imageParent.style.position = 'relative';
        }
        
        const tape1 = createTapeElement(index, 1);
        const tape2 = createTapeElement(index, 2);
        
        const usePattern1 = index % 2 === 0;
        if (usePattern1) {
            positionTape(tape1, 'top-left');
            positionTape(tape2, 'bottom-right');
        } else {
            positionTape(tape1, 'top-right');
            positionTape(tape2, 'bottom-left');
        }
        
        imageParent.appendChild(tape1);
        imageParent.appendChild(tape2);
    });
}

function createTapeElement(imageIndex, tapeNumber) {
    const tape = document.createElement('div');
    tape.className = 'tape';
    
    const width = 60 + Math.random() * 20; 
    const height = 40 + Math.random() * 16; 
    
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
    
    return tape;
}

function positionTape(tape, corner) {
    const randomOffset = () => Math.random() * 8 - 4; 
    const randomRotation = (Math.random() * 20 - 10); 
    const OUT_X = 25; 
    const OUT_Y = 18; 

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
}

function refreshTape() {
    const existingTape = document.querySelectorAll('.tape');
    existingTape.forEach(tape => tape.remove());
    addTapeToImages();
}

function addTapeToPost(postElement) {
    const images = postElement.querySelectorAll('.image-placeholder');
    
    if (images.length === 0) {
        return;
    }
    
    images.forEach((image, index) => {
        const existingTape = image.parentElement.querySelectorAll('.tape');
        if (existingTape.length > 0) {
            return;
        }
        
        const imageParent = image.parentElement;
        if (imageParent && window.getComputedStyle(imageParent).position === 'static') {
            imageParent.style.position = 'relative';
        }
        
        const tape1 = createTapeElement(index, 1);
        const tape2 = createTapeElement(index, 2);
        
        const usePattern1 = index % 2 === 0;
        if (usePattern1) {
            positionTape(tape1, 'top-left');
            positionTape(tape2, 'bottom-right');
        } else {
            positionTape(tape1, 'top-right');
            positionTape(tape2, 'bottom-left');
        }
        
        imageParent.appendChild(tape1);
        imageParent.appendChild(tape2);
    });
}

function testSimpleTape() {
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
    
    setTimeout(() => {
        testTape.remove();
    }, 3000);
}

// Export functions
window.addTapeToImages = addTapeToImages;
window.addTapeToPost = addTapeToPost;
window.refreshTape = refreshTape;
window.testSimpleTape = testSimpleTape;
