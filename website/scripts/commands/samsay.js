/**
 * SAM Say command - Use SAM (Software Automatic Mouth) to speak text
 */

/**
 * SAM (Software Automatic Mouth) speech synthesizer instance
 * @type {object|null}
 */
let sam = null;

/**
 * Initialize SAM speech synthesizer with SAM voice
 * @returns {object|null} SAM instance or null if unavailable
 */
function initSam() {
    if (sam) return sam;
    if (typeof SamJs !== 'undefined') {
        // SAM preset: speed=72, pitch=64, mouth=128, throat=128
        sam = new SamJs({ speed: 72, pitch: 64, mouth: 128, throat: 128 });
    }
    return sam;
}

/**
 * Speak text using SAM
 * @param {string} text - Text to speak
 * @returns {void}
 */
function samSpeak(text) {
    const samInstance = initSam();
    if (samInstance) {
        try {
            samInstance.speak(text);
        } catch (_err) {
            // Silently fail if speech doesn't work
        }
    }
}

export default {
    description: 'Use SAM speech synthesizer to speak text',
    execute: (term, writeClickable, VERSION, args) => {
        const message = args.join(' ');
        
        if (!message) {
            return 'Usage: samsay <message>';
        }
        
        if (typeof SamJs === 'undefined') {
            return 'SAM speech synthesizer is not available.';
        }
        
        samSpeak(message);
        return `SAM says: ${message}`;
    }
};
