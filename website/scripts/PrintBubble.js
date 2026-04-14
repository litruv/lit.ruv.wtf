/**
 * Manages a Twitch-chat-style stacked speech bubble above a print node element.
 *
 * Messages enter at the bottom of the stack, push older messages upward, and
 * individually fade out after 5 seconds — matching the Twitch chat feel.
 */
export class PrintBubble {
    /** @type {HTMLElement} */
    #stack;

    /** Each active message and its cleanup timer. @type {Array<{ el: HTMLElement, timer: number }>} */
    #entries = [];

    static #FADE_START_MS    = 4500;
    static #FADE_DURATION_MS = 500;

    /**
     * @param {HTMLElement} nodeEl - The node element to attach bubbles to.
     */
    constructor(nodeEl) {
        this.#stack = document.createElement("div");
        this.#stack.className = "print-bubble-stack";
        this.#stack.setAttribute("role", "log");
        this.#stack.setAttribute("aria-live", "polite");
        nodeEl.appendChild(this.#stack);
    }

    /**
     * Pushes a new message onto the bubble stack.
     *
     * @param {string} text - The message to display.
     */
    push(text) {
        const msg = document.createElement("div");
        msg.className = "print-bubble-msg";
        msg.textContent = String(text);
        this.#stack.appendChild(msg);

        const entry = { el: msg, timer: 0 };
        this.#entries.push(entry);

        entry.timer = window.setTimeout(() => {
            this.#fadeOut(entry);
        }, PrintBubble.#FADE_START_MS);
    }

    /**
     * Triggers the fade-out animation and removes the message element.
     *
     * @param {{ el: HTMLElement, timer: number }} entry
     */
    #fadeOut(entry) {
        entry.el.classList.add("is-fading");
        window.setTimeout(() => {
            entry.el.remove();
            const idx = this.#entries.indexOf(entry);
            if (idx !== -1) this.#entries.splice(idx, 1);
        }, PrintBubble.#FADE_DURATION_MS);
    }

    /**
     * Immediately clears all active messages and their timers.
     */
    clear() {
        for (const entry of this.#entries) {
            window.clearTimeout(entry.timer);
            entry.el.remove();
        }
        this.#entries = [];
    }
}
