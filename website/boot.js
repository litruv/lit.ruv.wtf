/**
 * BIOS Boot Animation
 * Displays a retro BIOS-style boot sequence before the terminal loads
 */

const BIOS_LINES = [
    { text: 'LitRuv BIOS v4.20.69', class: 'white', delay: 300 },
    { text: 'Copyright (C) 2024-2026 LitRuv Industries', class: '', delay: 200 },
    { text: '', delay: 400 },
    { text: 'CPU: Quantum Core i9-42069 @ 6.9GHz', class: '', delay: 300 },
    { text: 'Memory Test: ', class: '', inline: true, delay: 200 },
    { text: '65536K OK', class: 'highlight', delay: 600 },
    { text: '', delay: 300 },
    { text: 'Detecting Primary Master... LitDrive SSD 2TB', class: '', delay: 400 },
    { text: 'Detecting Primary Slave... None', class: '', delay: 300 },
    { text: '', delay: 400 },
    { text: 'Initializing Terminal Interface...', class: 'highlight', delay: 500 },
    { text: 'Loading modules: [', class: '', inline: true, delay: 200 },
    { text: '████████████████████', class: 'highlight', inline: true, delay: 800 },
    { text: '] 100%', class: '', delay: 300 },
    { text: '', delay: 200 },
    { text: 'Starting LIT.RUV.WTF Terminal...', class: 'highlight', delay: 400 }
];

/**
 * Run the BIOS boot animation
 * @returns {Promise} Resolves when animation is complete
 */
function runBootAnimation() {
    return new Promise((resolve) => {
        const bootScreen = document.getElementById('bootScreen');
        const biosText = document.getElementById('biosText');
        const pageFade = document.getElementById('pageFade');
        
        if (!bootScreen || !biosText) {
            if (pageFade) pageFade.classList.add('fade-out');
            resolve();
            return;
        }

        // Start fade in from black after brief delay
        setTimeout(() => {
            if (pageFade) pageFade.classList.add('fade-out');
        }, 200);

        let lineIndex = 0;
        let totalDelay = 800; // Start after fade begins
        const baseDelay = 150;

        BIOS_LINES.forEach((line, index) => {
            const delay = totalDelay;
            totalDelay += line.delay || baseDelay;

            setTimeout(() => {
                const span = document.createElement('span');
                if (line.class) {
                    span.className = line.class;
                }
                span.textContent = line.text;
                biosText.appendChild(span);
                
                if (!line.inline) {
                    biosText.appendChild(document.createTextNode('\n'));
                }
            }, delay);
        });

        // Fade out and remove boot screen
        setTimeout(() => {
            bootScreen.classList.add('fade-out');
            setTimeout(() => {
                bootScreen.style.display = 'none';
                if (pageFade) pageFade.style.display = 'none';
                resolve();
            }, 500);
        }, totalDelay + 300);
    });
}

// Export for use in terminal.js
window.runBootAnimation = runBootAnimation;
