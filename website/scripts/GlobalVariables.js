/**
 * Simple global variable registry for sharing values between nodes.
 */
export class GlobalVariables {
    /** @type {Map<string, any>} */
    static #variables = new Map();

    /**
     * Sets a global variable.
     *
     * @param {string} name Variable name
     * @param {any} value Variable value
     */
    static set(name, value) {
        this.#variables.set(name, value);
    }

    /**
     * Gets a global variable.
     *
     * @param {string} name Variable name
     * @returns {any} Variable value or undefined
     */
    static get(name) {
        return this.#variables.get(name);
    }

    /**
     * Checks if a variable exists.
     *
     * @param {string} name Variable name
     * @returns {boolean}
     */
    static has(name) {
        return this.#variables.has(name);
    }

    /**
     * Deletes a variable.
     *
     * @param {string} name Variable name
     */
    static delete(name) {
        this.#variables.delete(name);
    }

    /**
     * Clears all variables.
     */
    static clear() {
        this.#variables.clear();
    }

    /**
     * Gets all variable names.
     *
     * @returns {string[]}
     */
    static keys() {
        return Array.from(this.#variables.keys());
    }
}
