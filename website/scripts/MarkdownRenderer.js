/**
 * Lightweight markdown-to-HTML renderer.
 * Supports: headings (h1–h3), bold, italic, inline code, code blocks,
 * blockquotes, unordered lists, ordered lists, horizontal rules, links, paragraphs.
 * No external dependencies.
 */

/** @type {Array<{ pattern: RegExp, svg: string }>} */
const LINK_ICONS = [
    {
        pattern: /youtube\.com|youtu\.be/,
        svg: `<svg class="md-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    },
    {
        pattern: /github\.com/,
        svg: `<svg class="md-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FFFFFF" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`,
    },
    {
        pattern: /bsky\.app/,
        svg: `<svg class="md-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0085FF" d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"/></svg>`,
    },
    {
        pattern: /matrix\.to|matrix\.org/,
        svg: `<svg class="md-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FFFFFF" d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 0 0-.18-.66 1.106 1.106 0 0 0-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 0 0-.48.499 1.946 1.946 0 0 0-.231.696 5.56 5.56 0 0 0-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 0 0-.143-.688 1.052 1.052 0 0 0-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.282-.171.138-.319.337-.439.595-.12.259-.18.6-.18 1.02v4.966H5.46V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z"/></svg>`,
    },
];
export class MarkdownRenderer {
    /**
     * Converts a markdown string to sanitized HTML.
     *
     * @param {string} markdown - Raw markdown text.
     * @returns {string} HTML string safe for innerHTML insertion.
     */
    static render(markdown) {
        let html = markdown
            // Normalize line endings
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

        // Split into blocks separated by blank lines
        const blocks = html.split(/\n{2,}/);
        const parts  = blocks.map(block => MarkdownRenderer.#renderBlock(block.trim()));
        return parts.filter(Boolean).join("\n");
    }

    // ─── Block-level ──────────────────────────────────────────────────────────

    /**
     * @param {string} block
     * @returns {string}
     */
    static #renderBlock(block) {
        if (!block) return "";

        // Fenced code block
        const fenceMatch = block.match(/^```(\w*)\n([\s\S]*?)```$/);
        if (fenceMatch) {
            const lang = MarkdownRenderer.#escape(fenceMatch[1] || "");
            const code = MarkdownRenderer.#escape(fenceMatch[2]);
            return `<pre class="md-pre"><code${lang ? ` class="lang-${lang}"` : ""}>${code}</code></pre>`;
        }

        // Horizontal rule
        if (/^[-*_]{3,}$/.test(block)) {
            return `<hr class="md-hr" />`;
        }

        // Headings
        const headingMatch = block.match(/^(#{1,3})\s+(.+)$/m);
        if (headingMatch && block.split("\n").length === 1) {
            const level = headingMatch[1].length;
            return `<h${level} class="md-h${level}">${MarkdownRenderer.#renderInline(headingMatch[2])}</h${level}>`;
        }

        // Blockquote
        if (/^> /.test(block)) {
            const inner = block.replace(/^> ?/gm, "");
            return `<blockquote class="md-blockquote">${MarkdownRenderer.#renderInline(inner)}</blockquote>`;
        }

        // Unordered list
        if (/^[-*+] /.test(block)) {
            const items = block.split("\n").filter(Boolean).map(line => {
                const content = line.replace(/^[-*+]\s+/, "");
                return `<li class="md-li">${MarkdownRenderer.#renderInline(content)}</li>`;
            });
            return `<ul class="md-ul">${items.join("")}</ul>`;
        }

        // Ordered list
        if (/^\d+\. /.test(block)) {
            const items = block.split("\n").filter(Boolean).map(line => {
                const content = line.replace(/^\d+\.\s+/, "");
                return `<li class="md-li">${MarkdownRenderer.#renderInline(content)}</li>`;
            });
            return `<ol class="md-ol">${items.join("")}</ol>`;
        }

        // Paragraph (handle single-line line breaks within block)
        const lines = block.split("\n").map(l => MarkdownRenderer.#renderInline(l));
        return `<p class="md-p">${lines.join("<br />")}</p>`;
    }

    // ─── Inline-level ─────────────────────────────────────────────────────────

    /**
     * @param {string} text
     * @returns {string}
     */
    static #renderInline(text) {
        // Escape HTML first, then re-apply formatting
        let out = MarkdownRenderer.#escape(text);

        // Inline code (must come before bold/italic to avoid breaking backtick content)
        out = out.replace(/`([^`]+)`/g, (_, code) =>
            `<code class="md-code">${code}</code>`
        );

        // Bold + italic
        out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

        // Bold
        out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

        // Italic
        out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");

        // Links [text](url)
        out = out.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (_, linkText, url) => {
                const safeUrl = MarkdownRenderer.#sanitizeUrl(url);
                if (!safeUrl) return linkText;
                const iconEntry = LINK_ICONS.find(e => e.pattern.test(safeUrl));
                const prefix = iconEntry ? iconEntry.svg : "";
                const pipeIdx = linkText.indexOf("|");
                const inner = pipeIdx !== -1
                    ? `<span class="md-link-title">${linkText.slice(0, pipeIdx)}</span><span class="md-link-sub">${linkText.slice(pipeIdx + 1)}</span>`
                    : linkText;
                return `<a class="md-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${prefix}${inner}</a>`;
            }
        );

        return out;
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    /**
     * Escapes HTML special characters.
     *
     * @param {string} str
     * @returns {string}
     */
    static #escape(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /**
     * Returns a URL only if it uses a safe scheme; otherwise null.
     *
     * @param {string} url
     * @returns {string | null}
     */
    static #sanitizeUrl(url) {
        const trimmed = url.trim();
        if (/^(https?:\/\/|mailto:|\/|#|\.)/.test(trimmed)) return trimmed;
        return null;
    }
}
