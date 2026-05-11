'use strict';

import nspell from 'nspell';
import affData from 'dictionary-en-us/index.aff';
import dicData from 'dictionary-en-us/index.dic';

const spell = nspell(affData, dicData);
const SPELLCHECK_HIGHLIGHT = 'blog-editor-spellcheck';
const WORD_PATTERN = /[A-Za-z][A-Za-z'’-]{1,}/g;
const SKIP_TAGS = new Set(['CODE', 'PRE', 'A', 'KBD', 'SAMP']);
const PERSONAL_DICTIONARY_KEY = 'blog-editor-personal-dictionary-v1';

/**
 * @param {string} value
 * @returns {boolean}
 */
function isWordChar(value) {
    return /[A-Za-z'’-]/.test(value);
}

/**
 * Lightweight editor spellcheck controller using CSS Highlights.
 */
export class BlogEditorSpellcheck {
    /**
     * @param {HTMLElement} root
     * @param {(message: string, isError?: boolean) => void} updateStatus
     */
    constructor(root, updateStatus) {
        this.root = root;
        this.updateStatus = updateStatus;
        this.enabled = true;
        this.pendingTimer = 0;
        this.highlightName = SPELLCHECK_HIGHLIGHT;
        this.personalWords = new Set();
        this.supported = typeof CSS !== 'undefined' && typeof CSS.highlights !== 'undefined' && typeof Highlight !== 'undefined';
        this.loadPersonalDictionary();
    }

    /**
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!this.supported) {
            this.updateStatus(enabled ? 'spellcheck unavailable in this renderer' : 'spellcheck off', !enabled ? false : true);
            return;
        }

        if (!enabled) {
            this.clear();
            this.updateStatus('spellcheck off');
            return;
        }

        this.schedule();
    }

    schedule() {
        if (!this.supported || !this.enabled) return;
        window.clearTimeout(this.pendingTimer);
        this.pendingTimer = window.setTimeout(() => this.refresh(), 180);
    }

    refresh() {
        if (!this.supported || !this.enabled) return;
        const highlight = new Highlight();
        let count = 0;

        for (const node of this.iterTextNodes()) {
            const text = node.textContent ?? '';
            WORD_PATTERN.lastIndex = 0;
            let match;
            while ((match = WORD_PATTERN.exec(text)) !== null) {
                const word = match[0];
                if (!this.isMisspelledWord(word)) continue;
                const range = new Range();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + word.length);
                highlight.add(range);
                count += 1;
            }
        }

        CSS.highlights.set(this.highlightName, highlight);
        this.updateStatus(count > 0 ? `spellcheck on · ${count} issue${count === 1 ? '' : 's'}` : 'spellcheck on · clear');
    }

    clear() {
        if (!this.supported) return;
        window.clearTimeout(this.pendingTimer);
        CSS.highlights.delete(this.highlightName);
    }

    destroy() {
        this.clear();
    }

    /**
     * Loads the personal dictionary from browser storage.
     */
    loadPersonalDictionary() {
        if (typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem(PERSONAL_DICTIONARY_KEY);
            if (!raw) return;
            const words = JSON.parse(raw);
            if (!Array.isArray(words)) return;
            for (const entry of words) {
                if (typeof entry !== 'string' || !entry.trim()) continue;
                const word = entry.trim();
                this.personalWords.add(word);
                spell.add(word);
            }
        } catch {
            this.personalWords.clear();
        }
    }

    /**
     * Persists the personal dictionary to browser storage.
     */
    savePersonalDictionary() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(PERSONAL_DICTIONARY_KEY, JSON.stringify([...this.personalWords].sort((a, b) => a.localeCompare(b))));
        } catch {
            // Ignore storage quota / privacy errors.
        }
    }

    /**
     * Adds a word to the personal dictionary and refreshes highlights.
     * @param {string} word
     */
    addToDictionary(word) {
        const normalized = typeof word === 'string' ? word.trim() : '';
        if (!normalized) return;
        if (this.personalWords.has(normalized)) return;
        this.personalWords.add(normalized);
        spell.add(normalized);
        this.savePersonalDictionary();
        this.refresh();
        this.updateStatus(`added "${normalized}" to dictionary`);
    }

    /**
     * @param {string} word
     * @returns {boolean}
     */
    isMisspelledWord(word) {
        if (!this.shouldCheckWord(word)) return false;
        return !spell.correct(word);
    }

    /**
     * @param {string} word
     * @param {number} [limit]
     * @returns {string[]}
     */
    getSuggestions(word, limit = 6) {
        if (!word || !this.isMisspelledWord(word)) return [];
        return spell.suggest(word).slice(0, Math.max(0, limit));
    }

    *iterTextNodes() {
        const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT, {
            acceptNode: node => {
                if (!(node.parentElement instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
                if (!node.textContent || !WORD_PATTERN.test(node.textContent)) return NodeFilter.FILTER_REJECT;
                if (node.parentElement.closest('[data-type="image-block"]')) return NodeFilter.FILTER_REJECT;
                if (this.shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let current;
        while ((current = walker.nextNode())) {
            yield current;
        }
    }

    /**
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    shouldSkip(element) {
        let current = element;
        while (current && current !== this.root) {
            if (SKIP_TAGS.has(current.tagName)) return true;
            if (current.getAttribute('contenteditable') === 'false') return true;
            current = current.parentElement;
        }
        return false;
    }

    /**
     * Returns the misspelled word under a viewport point, if any.
     * @param {number} clientX
     * @param {number} clientY
     * @returns {string | null}
     */
    getMisspelledWordAtPoint(clientX, clientY) {
        const hit = this.getMisspelledAtPoint(clientX, clientY);
        return hit ? hit.word : null;
    }

    /**
     * Returns misspelled word details under a viewport point, if any.
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{ word: string, range: Range } | null}
     */
    getMisspelledAtPoint(clientX, clientY) {
        if (!this.supported) return null;

        let node = null;
        let offset = 0;

        if (typeof document.caretPositionFromPoint === 'function') {
            const pos = document.caretPositionFromPoint(clientX, clientY);
            if (pos) {
                node = pos.offsetNode;
                offset = pos.offset;
            }
        } else if (typeof document.caretRangeFromPoint === 'function') {
            const range = document.caretRangeFromPoint(clientX, clientY);
            if (range) {
                node = range.startContainer;
                offset = range.startOffset;
            }
        }

        if (!(node instanceof Text)) return null;
        if (!(node.parentElement instanceof HTMLElement)) return null;
        if (this.shouldSkip(node.parentElement)) return null;

        const text = node.textContent ?? '';
        if (!text) return null;

        let start = Math.min(Math.max(offset, 0), text.length);
        let end = start;

        if (start > 0 && !isWordChar(text[start]) && isWordChar(text[start - 1])) {
            start -= 1;
            end = start;
        }

        while (start > 0 && isWordChar(text[start - 1])) start -= 1;
        while (end < text.length && isWordChar(text[end])) end += 1;

        if (end <= start) return null;

        const word = text.slice(start, end);
        if (!this.isMisspelledWord(word)) return null;

        const range = new Range();
        range.setStart(node, start);
        range.setEnd(node, end);
        return { word, range };
    }

    /**
     * @param {string} word
     * @returns {boolean}
     */
    shouldCheckWord(word) {
        if (word.length < 3) return false;
        if (/^[A-Z0-9_-]+$/.test(word)) return false;
        if (/\d/.test(word)) return false;
        return true;
    }
}
