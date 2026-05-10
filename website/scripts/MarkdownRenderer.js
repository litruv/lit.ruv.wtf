/**
 * Lightweight markdown-to-HTML renderer.
 * Supports: headings (h1–h3), bold, italic, inline code, code blocks,
 * blockquotes, unordered lists, ordered lists, horizontal rules, links, tables, paragraphs.
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

        // Extract and protect code blocks first (prevents splitting on blank lines inside code)
        const codeBlocks = [];
        html = html.replace(/```[\s\S]*?```/g, (match) => {
            const placeholder = `\n___CODEBLOCK_${codeBlocks.length}___\n`;
            codeBlocks.push(match);
            return placeholder;
        });

        // Split into blocks, preserving loose-list continuity across blank lines
        const blocks = MarkdownRenderer.#splitBlocks(html);
        const parts = blocks.map(block => {
            block = block.trim();
            // Restore code blocks
            block = block.replace(/___CODEBLOCK_(\d+)___/g, (_, idx) => codeBlocks[parseInt(idx)]);
            return MarkdownRenderer.#renderBlock(block);
        });
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
        const fenceMatch = block.match(/^```(\w*)(?:\s*\{([^}]+)\})?\s*\n([\s\S]*?)\n?```$/);
        if (fenceMatch) {
            const lang = fenceMatch[1] || "";
            const options = fenceMatch[2] || "";
            const code = fenceMatch[3];
            
            // Parse options (e.g., {maxHeight: 300})
            let maxHeight = null;
            if (options) {
                const maxHeightMatch = options.match(/maxHeight\s*:\s*(\d+)/);
                if (maxHeightMatch) {
                    maxHeight = maxHeightMatch[1];
                }
            }
            
            // Use Prism for syntax highlighting if available and language is specified
            let highlightedCode = code;
            if (lang && typeof Prism !== 'undefined' && Prism.languages[lang]) {
                highlightedCode = Prism.highlight(code, Prism.languages[lang], lang);
            } else {
                highlightedCode = MarkdownRenderer.#escape(code);
            }
            
            const langClass = lang ? ` language-${lang}` : "";
            const styleAttr = maxHeight ? ` style="max-height: ${maxHeight}px; overflow-y: auto;"` : "";
            const escapedCode = MarkdownRenderer.#escape(code);
            return `<div class="md-code-block"><button class="md-copy-btn" data-code="${escapedCode}" title="Copy code">📋</button><pre class="md-pre"${styleAttr}><code class="${langClass}">${highlightedCode}</code></pre></div>`;
        }

        // Horizontal rule
        if (/^[-*_]{3,}$/.test(block)) {
            return `<div class="md-hr" role="separator"><span class="md-hr-line"></span><span class="md-hr-arrow"></span></div>`;
        }

        // Headings
        const headingMatch = block.match(/^(#{1,6})\s+(.+)$/m);
        if (headingMatch && block.split("\n").length === 1) {
            const level = headingMatch[1].length;
            const pin = level === 1 ? '<span class="md-h1-pin" aria-hidden="true"></span>'
                       : level === 2 ? '<span class="md-h2-pin" aria-hidden="true"></span>'
                       : '';
            return `<h${level} class="md-h${level}">${pin}${MarkdownRenderer.#renderInline(headingMatch[2])}</h${level}>`;
        }

        // Tables
        if (MarkdownRenderer.#isTableBlock(block)) {
            return MarkdownRenderer.#renderTable(block);
        }

        // Standalone image
        const imgBlockMatch = block.match(/^!\[([^\]]*)\]\((.+)\)$/);
        if (imgBlockMatch) {
            const { src, caption, imageAttributes } = MarkdownRenderer.#parseImageMeta(imgBlockMatch[1], imgBlockMatch[2]);
            if (src) {
                return `<figure class="md-figure"><img class="md-img" src="${src}" alt="${caption}"${imageAttributes} />${caption ? `<figcaption class="md-figcaption">${caption}</figcaption>` : ""}</figure>`;
            }
        }

        // Blockquote
        if (/^> /.test(block)) {
            const inner = block.replace(/^> ?/gm, "");
            return `<blockquote class="md-blockquote">${MarkdownRenderer.#renderInline(inner)}</blockquote>`;
        }

        // Unordered list
        if (/^[-*+] /.test(block)) {
            return MarkdownRenderer.#renderList(block, "ul");
        }

        // Ordered list
        if (/^\d+\. /.test(block)) {
            return MarkdownRenderer.#renderList(block, "ol");
        }

        // Standalone line break tags
        if (MarkdownRenderer.#isLineBreakBlock(block)) {
            return MarkdownRenderer.#renderLineBreakBlock(block);
        }

        // Paragraph (handle single-line line breaks within block)
        const lines = block.split("\n").map(l => MarkdownRenderer.#renderInline(l));
        return `<p class="md-p">${lines.join("<br />")}</p>`;
    }

    /**
     * Renders nested lists (ul or ol) with indentation support.
     * @param {string} block
     * @param {"ul" | "ol"} listType
     * @returns {string}
     */
    static #renderList(block, listType) {
        const lines = block.split("\n").filter(Boolean);
        const items = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const indent = line.match(/^(\s*)/)[1].length;
            
            // Extract content
            let content;
            if (listType === "ul") {
                content = line.replace(/^\s*[-*+]\s+/, "");
            } else {
                content = line.replace(/^\s*\d+\.\s+/, "");
            }

            // Look ahead for nested items (more indented)
            let nestedBlock = "";
            let j = i + 1;
            while (j < lines.length) {
                const nextLine = lines[j];
                const nextIndent = nextLine.match(/^(\s*)/)[1].length;
                if (nextIndent > indent) {
                    nestedBlock += (nestedBlock ? "\n" : "") + nextLine.slice(indent + 2); // Remove parent indent
                    j++;
                } else {
                    break;
                }
            }

            // Render item with nested list if present
            let itemHtml = MarkdownRenderer.#renderInline(content);
            if (nestedBlock) {
                const nestedType = /^[-*+] /.test(nestedBlock.trim()) ? "ul" : "ol";
                itemHtml += MarkdownRenderer.#renderList(nestedBlock, nestedType);
            }
            items.push(`<li class="md-li">${itemHtml}</li>`);
            i = j;
        }

        const tag = listType === "ul" ? "ul" : "ol";
        return `<${tag} class="md-${tag}">${items.join("")}</${tag}>`;
    }

    /**
     * Detects whether a block is a markdown pipe table.
     *
     * @param {string} block
     * @returns {boolean}
     */
    static #isTableBlock(block) {
        const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
        if (lines.length < 2) return false;
        if (!lines[0].includes("|") || !lines[1].includes("|")) return false;
        const separators = MarkdownRenderer.#splitTableRow(lines[1]);
        if (separators.length === 0) return false;
        return separators.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
    }

    /**
     * Renders a markdown pipe table block.
     *
     * @param {string} block
     * @returns {string}
     */
    static #renderTable(block) {
        const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
        const headerCells = MarkdownRenderer.#splitTableRow(lines[0]);
        const separatorCells = MarkdownRenderer.#splitTableRow(lines[1]);
        const columnCount = Math.max(headerCells.length, separatorCells.length);
        const alignments = MarkdownRenderer.#parseTableAlignments(separatorCells, columnCount);

        const normalizedHeader = MarkdownRenderer.#normalizeTableCells(headerCells, columnCount);
        const thead = `<thead><tr>${normalizedHeader
            .map((cell, index) => `<th class="md-th"${MarkdownRenderer.#getTableAlignStyle(alignments[index])}>${MarkdownRenderer.#renderInline(cell)}</th>`)
            .join("")}</tr></thead>`;

        const bodyRows = lines.slice(2)
            .map(row => MarkdownRenderer.#normalizeTableCells(MarkdownRenderer.#splitTableRow(row), columnCount))
            .map(rowCells => `<tr>${rowCells
                .map((cell, index) => `<td class="md-td"${MarkdownRenderer.#getTableAlignStyle(alignments[index])}>${MarkdownRenderer.#renderInline(cell)}</td>`)
                .join("")}</tr>`)
            .join("");
        const tbody = `<tbody>${bodyRows}</tbody>`;

        return `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`;
    }

    /**
     * Splits a markdown table row into cells.
     *
     * @param {string} row
     * @returns {string[]}
     */
    static #splitTableRow(row) {
        let normalized = row.trim();
        if (normalized.startsWith("|")) normalized = normalized.slice(1);
        if (normalized.endsWith("|")) normalized = normalized.slice(0, -1);
        return normalized.split("|").map(cell => cell.trim());
    }

    /**
     * Normalizes row cells to a fixed column count.
     *
     * @param {string[]} cells
     * @param {number} columnCount
     * @returns {string[]}
     */
    static #normalizeTableCells(cells, columnCount) {
        const normalized = cells.slice(0, columnCount);
        while (normalized.length < columnCount) normalized.push("");
        return normalized;
    }

    /**
     * Parses markdown alignment hints from the table separator row.
     *
     * @param {string[]} separatorCells
     * @param {number} columnCount
     * @returns {Array<"left" | "center" | "right">}
     */
    static #parseTableAlignments(separatorCells, columnCount) {
        const normalized = MarkdownRenderer.#normalizeTableCells(separatorCells, columnCount);
        return normalized.map(cell => {
            const trimmed = cell.trim();
            const startsWithColon = trimmed.startsWith(":");
            const endsWithColon = trimmed.endsWith(":");
            if (startsWithColon && endsWithColon) return "center";
            if (endsWithColon) return "right";
            return "left";
        });
    }

    /**
     * Builds a text-align style attribute for table cells.
     *
     * @param {"left" | "center" | "right"} align
     * @returns {string}
     */
    static #getTableAlignStyle(align) {
        return ` style="text-align: ${align};"`;
    }

    /**
     * Detects blocks that only contain one or more HTML line break tags.
     *
     * @param {string} block
     * @returns {boolean}
     */
    static #isLineBreakBlock(block) {
        const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
        if (lines.length === 0) return false;
        return lines.every(line => /^<br\s*\/?>$/i.test(line));
    }

    /**
     * Renders a standalone line-break block without paragraph wrappers.
     *
     * @param {string} block
     * @returns {string}
     */
    static #renderLineBreakBlock(block) {
        const lineCount = block.split("\n").map(line => line.trim()).filter(Boolean).length;
        return Array.from({ length: lineCount }, () => "<br />").join("\n");
    }

    /**
     * Splits markdown into renderable blocks while keeping loose/nested list items together.
     *
     * @param {string} markdown
     * @returns {string[]}
     */
    static #splitBlocks(markdown) {
        const lines = markdown.split("\n");
        const blocks = [];
        let index = 0;

        while (index < lines.length) {
            while (index < lines.length && lines[index].trim() === "") {
                index++;
            }

            if (index >= lines.length) {
                break;
            }

            const line = lines[index];
            const trimmedLine = line.trim();

            if (/^___CODEBLOCK_\d+___$/.test(trimmedLine)) {
                blocks.push(trimmedLine);
                index++;
                continue;
            }

            if (MarkdownRenderer.#isListMarkerLine(line)) {
                const listLines = [line];
                index++;

                while (index < lines.length) {
                    const current = lines[index];

                    if (current.trim() === "") {
                        let lookAhead = index;
                        while (lookAhead < lines.length && lines[lookAhead].trim() === "") {
                            lookAhead++;
                        }

                        if (lookAhead >= lines.length) {
                            index = lookAhead;
                            break;
                        }

                        const next = lines[lookAhead];
                        if (MarkdownRenderer.#isListMarkerLine(next) || /^\s+/.test(next)) {
                            listLines.push(...lines.slice(index, lookAhead));
                            index = lookAhead;
                            continue;
                        }

                        break;
                    }

                    if (MarkdownRenderer.#isListMarkerLine(current) || /^\s+/.test(current)) {
                        listLines.push(current);
                        index++;
                        continue;
                    }

                    break;
                }

                blocks.push(listLines.join("\n").trimEnd());
                continue;
            }

            const paragraphLines = [line];
            index++;

            while (index < lines.length && lines[index].trim() !== "") {
                paragraphLines.push(lines[index]);
                index++;
            }

            blocks.push(paragraphLines.join("\n"));
        }

        return blocks;
    }

    /**
     * Checks whether a line starts a markdown list item.
     *
     * @param {string} line
     * @returns {boolean}
     */
    static #isListMarkerLine(line) {
        return /^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line);
    }

    // ─── Inline-level ─────────────────────────────────────────────────────────

    /**
     * @param {string} text
     * @returns {string}
     */
    static #renderInline(text) {
        // Escape HTML first, then re-apply formatting
        let out = MarkdownRenderer.#escape(text);

        // Allow explicit line break tags in markdown text only.
        out = out.replace(/&lt;br\s*\/?&gt;/gi, "<br />");

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

        // Images ![alt](url) — must be matched before links
        out = out.replace(
            /!\[([^\]]*)\]\((.+?)\)/g,
            (_, altText, rawMeta) => {
                const { src, caption, imageAttributes } = MarkdownRenderer.#parseImageMeta(altText, rawMeta);
                if (!src) return MarkdownRenderer.#escape(altText);
                return `<img class="md-img md-img--inline" src="${src}" alt="${caption}"${imageAttributes} />`;
            }
        );

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
        // Allow absolute URLs, root-relative, hash links, relative-dot paths, and plain relative paths
        if (/^(https?:\/\/|mailto:|\/|#|\.)/.test(trimmed)) return trimmed;
        // Allow relative paths (e.g. data/blog/media/image.png) — no protocol = safe relative
        if (/^[a-zA-Z0-9_\-][a-zA-Z0-9_.\-\/]*$/.test(trimmed)) return trimmed;
        return null;
    }

    /**
     * Applies intrinsic pixel scaling to markdown images with a size token.
     *
     * @param {ParentNode} container
     * @returns {void}
     */
    static applyImageScale(container) {
        container.querySelectorAll("img[data-md-scale]").forEach(img => {
            const scale = parseFloat(img.getAttribute("data-md-scale") || "");
            if (!Number.isFinite(scale) || scale <= 0) return;

            const applyScale = () => {
                if (!img.naturalWidth) return;
                const targetWidthPx = Math.max(1, Math.round(img.naturalWidth * scale));
                img.style.width = `${targetWidthPx}px`;
                img.style.height = "auto";
                img.style.maxWidth = "100%";
            };

            if (img.complete) {
                applyScale();
                return;
            }

            img.addEventListener("load", applyScale, { once: true });
        });
    }

    /**
     * Parses markdown image metadata including optional title and size token.
     *
     * Supported format: ![alt](url "title")
     * - Numeric alt-only values (e.g. 0.50) are treated as intrinsic size scale metadata.
     * - Title text is used as the visible caption when present.
     *
     * @param {string} rawAlt
     * @param {string} rawMeta
     * @returns {{ src: string | null, caption: string, imageAttributes: string }}
     */
    static #parseImageMeta(rawAlt, rawMeta) {
        const meta = rawMeta.trim();
        const titleMatch = meta.match(/^(\S+)(?:\s+"([\s\S]*?)")?$/);
        if (!titleMatch) {
            return {
                src: null,
                caption: MarkdownRenderer.#escape(rawAlt),
                imageAttributes: "",
            };
        }

        const src = MarkdownRenderer.#sanitizeUrl(titleMatch[1]);
        const titleCaption = titleMatch[2] ? MarkdownRenderer.#escape(titleMatch[2]) : "";
        const trimmedAlt = rawAlt.trim();
        const sizeScale = MarkdownRenderer.#parseImageSizeScale(trimmedAlt);
        const caption = titleCaption || (sizeScale === null ? MarkdownRenderer.#escape(trimmedAlt) : "");
        const imageAttributes = sizeScale !== null ? ` data-md-scale="${sizeScale}"` : "";

        return {
            src,
            caption,
            imageAttributes,
        };
    }

    /**
     * Parses a numeric image scale token from markdown alt text.
     *
     * @param {string} rawAlt
     * @returns {number | null}
     */
    static #parseImageSizeScale(rawAlt) {
        if (!/^\d*\.?\d+$/.test(rawAlt)) return null;
        const value = parseFloat(rawAlt);
        if (!Number.isFinite(value)) return null;
        if (value <= 0 || value > 1) return null;
        return value;
    }
}
