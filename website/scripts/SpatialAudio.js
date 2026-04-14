/**
 * Manages spatial audio playback with distance-based volume and stereo panning.
 */
export class SpatialAudio {
    /** @type {AudioContext} */
    #audioContext;

    /** @type {Map<string, AudioBuffer>} */
    #buffers = new Map();

    /** @type {() => {x: number, y: number, width: number, height: number}} */
    #getViewport;

    /**
     * @param {() => {x: number, y: number, width: number, height: number}} getViewport - Returns current viewport bounds in world-space
     */
    constructor(getViewport) {
        this.#audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.#getViewport = getViewport;
    }

    /**
     * Preloads an audio file.
     *
     * @param {string} key - Identifier for this audio
     * @param {string} url - Path to audio file
     */
    async load(key, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.#audioContext.decodeAudioData(arrayBuffer);
            this.#buffers.set(key, audioBuffer);
        } catch (err) {
            console.error(`[SpatialAudio] Failed to load "${url}":`, err);
        }
    }

    /**
     * Plays a sound at a world-space position with spatial audio.
     * Volume is based on how much of the viewport the source occupies.
     * Sounds muffle progressively as the source moves off-screen.
     *
     * @param {string} key - Audio identifier
     * @param {number} worldX - X position in world-space (anchor center)
     * @param {number} worldY - Y position in world-space (anchor center)
     * @param {number} worldWidth - Width in world-space
     * @param {number} worldHeight - Height in world-space
     * @param {{ minVolume?: number, maxVolume?: number, sizeThreshold?: number }} [options]
     */
    play(key, worldX, worldY, worldWidth, worldHeight, options = {}) {
        const buffer = this.#buffers.get(key);
        if (!buffer) {
            console.warn(`[SpatialAudio] Audio "${key}" not loaded`);
            return;
        }

        const viewport = this.#getViewport();

        // Calculate what percentage of viewport the source occupies
        const viewportArea = viewport.width * viewport.height;
        const sourceArea   = worldWidth * worldHeight;
        const areaPercentage = sourceArea / viewportArea;

        // Volume based on size percentage (larger on screen = louder)
        const minVolume    = options.minVolume    ?? 0;
        const maxVolume    = options.maxVolume    ?? 1.0;
        const sizeThreshold = options.sizeThreshold ?? 0.05;

        const sizeFactor = Math.min(1, areaPercentage / sizeThreshold);
        const volume = minVolume + (maxVolume - minVolume) * sizeFactor;

        // Viewport intersection — how much of the node is actually visible (0–1)
        const nodeLeft   = worldX - worldWidth  / 2;
        const nodeTop    = worldY - worldHeight / 2;
        const nodeRight  = worldX + worldWidth  / 2;
        const nodeBottom = worldY + worldHeight / 2;

        const overlapW = Math.max(0, Math.min(nodeRight,  viewport.x + viewport.width)  - Math.max(nodeLeft, viewport.x));
        const overlapH = Math.max(0, Math.min(nodeBottom, viewport.y + viewport.height) - Math.max(nodeTop,  viewport.y));
        const overlapArea = overlapW * overlapH;
        const visibilityFraction = sourceArea > 0 ? Math.min(1, overlapArea / sourceArea) : 0;

        // Stereo panning based on horizontal position relative to viewport centre
        const centerX = viewport.x + viewport.width / 2;
        const dx      = worldX - centerX;
        const panRange = viewport.width / 2;
        const pan = Math.max(-1, Math.min(1, dx / panRange));

        // Muffling: low-pass filter whose cutoff drops as the node leaves the screen.
        // Fully on-screen  → 20 000 Hz (effectively open)
        // Fully off-screen → 400 Hz (thick muffle)
        const MUFFLE_OPEN   = 20000;
        const MUFFLE_CLOSED =   300;
        const cutoff = MUFFLE_CLOSED + (MUFFLE_OPEN - MUFFLE_CLOSED) * visibilityFraction;

        // Create audio nodes
        const source = this.#audioContext.createBufferSource();
        source.buffer = buffer;

        const gainNode = this.#audioContext.createGain();
        gainNode.gain.value = volume;

        const panNode = this.#audioContext.createStereoPanner();
        panNode.pan.value = pan;

        const filterNode = this.#audioContext.createBiquadFilter();
        filterNode.type            = "lowpass";
        filterNode.frequency.value = cutoff;
        filterNode.Q.value         = 0.7;

        // Connect: source → filter → gain → pan → destination
        source.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(this.#audioContext.destination);

        source.start(0);
    }
}
