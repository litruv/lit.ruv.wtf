'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Generates static blog pages and an index page from markdown post data.
 */
class StaticBlogGenerator {
    /**
     * @param {{ siteRootDir: string }} options
     */
    constructor(options) {
        /** @type {string} */
        this.siteRootDir = options.siteRootDir;
        /** @type {string} */
        this.blogRootDir = path.join(this.siteRootDir, 'blog');
        /** @type {string} */
        this.blogIndexPath = path.join(this.siteRootDir, 'blog.html');
    }

    /**
     * Generates blog index and post pages.
     *
     * @param {Array<{slug: string, title: string, date: string | null, author: string | null, tags?: string[], content: string}>} posts
     * @returns {Promise<void>}
     */
    async generate(posts) {
        await fs.rm(this.blogRootDir, { recursive: true, force: true });
        await fs.mkdir(this.blogRootDir, { recursive: true });

        const indexHtml = this.renderIndexPage(posts);
        await fs.writeFile(this.blogIndexPath, indexHtml, 'utf-8');

        for (const post of posts) {
            const postDir = path.join(this.blogRootDir, post.slug);
            await fs.mkdir(postDir, { recursive: true });
            const postHtml = this.renderPostPage(post);
            await fs.writeFile(path.join(postDir, 'index.html'), postHtml, 'utf-8');
        }
    }

    /**
     * @param {Array<{slug: string, title: string, date: string | null, author: string | null, tags?: string[]}>} posts
     * @returns {string}
     */
    renderIndexPage(posts) {
        const cardsHtml = posts.map((post) => {
            const dateLabel = post.date ? this.formatDate(post.date) : 'Undated';
            const authorLabel = post.author ? this.escapeHtml(post.author) : 'Unknown author';
            const safeTitle = this.escapeHtml(post.title || post.slug);
            const safeSlug = encodeURIComponent(post.slug);
            const tags = Array.isArray(post.tags) ? post.tags : [];
            const tagsHtml = tags.length > 0
                ? `<div class="blog-index-tags">${tags.map((tag) => `<span class="blog-tag">${this.escapeHtml(tag)}</span>`).join('')}</div>`
                : '';

            return [
                '<article class="blog-index-item">',
                `  <h2 class="blog-index-item-title"><a href="/blog/${safeSlug}/">${safeTitle}</a></h2>`,
                `  <p class="blog-index-item-meta">${dateLabel} <span aria-hidden="true">-</span> ${authorLabel}</p>`,
                tagsHtml,
                '</article>'
            ].join('\n');
        }).join('\n');

        const content = [
            '<main class="blog-shell">',
            this.renderBrandBar(),
            '<section class="blog-card" aria-labelledby="blog-index-title">',
            '  <header class="blog-post-header">',
            '    <h1 id="blog-index-title" class="blog-post-title">Blog</h1>',
            '    <p class="blog-index-subtitle">Direct links to every post.</p>',
            '  </header>',
            `  <div class="blog-index-list">${cardsHtml || '<p class="blog-empty">No posts yet.</p>'}</div>`,
            '</section>',
            '</main>'
        ].join('\n');

        return this.renderPageTemplate('Blog', content, '/blog.html');
    }

    /**
     * @param {{slug: string, title: string, date: string | null, author: string | null, tags?: string[], content: string}} post
     * @returns {string}
     */
    renderPostPage(post) {
        const safeTitle = this.escapeHtml(post.title || post.slug);
        const dateLabel = post.date ? this.formatDate(post.date) : null;
        const authorLabel = post.author ? this.escapeHtml(post.author) : null;
        const tags = Array.isArray(post.tags) ? post.tags : [];

        const metaBits = [];
        if (dateLabel) metaBits.push(`<span>${dateLabel}</span>`);
        if (authorLabel) metaBits.push(`<span>${authorLabel}</span>`);

        const tagsHtml = tags.length > 0
            ? `<div class="blog-post-tags">${tags.map((tag) => `<span class="blog-tag">${this.escapeHtml(tag)}</span>`).join('')}</div>`
            : '';

        const contentHtml = StaticMarkdownRenderer.render(post.content || '');

        const content = [
            '<main class="blog-shell">',
            this.renderBrandBar(),
            '<article class="blog-card" aria-labelledby="blog-post-title">',
            '  <header class="blog-post-header">',
            `    <h1 id="blog-post-title" class="blog-post-title">${safeTitle}</h1>`,
            metaBits.length > 0 ? `    <p class="blog-post-meta">${metaBits.join('<span aria-hidden="true">-</span>')}</p>` : '',
            tagsHtml,
            '  </header>',
            `  <section class="blog-post-content">${contentHtml}</section>`,
            '</article>',
            '</main>'
        ].join('\n');

        return this.renderPageTemplate(`${safeTitle} - Blog`, content, `/blog/${encodeURIComponent(post.slug)}/`);
    }

    /**
     * @param {string} title
     * @param {string} bodyHtml
     * @param {string} canonicalPath
     * @returns {string}
     */
    renderPageTemplate(title, bodyHtml, canonicalPath) {
        const escapedTitle = this.escapeHtml(title);

        return [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8">',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            `  <title>${escapedTitle}</title>`,
            '  <meta name="description" content="Lit.ruv.wtf blog posts.">',
            `  <link rel="canonical" href="https://lit.ruv.wtf${canonicalPath}">`,
            '  <link rel="icon" type="image/png" sizes="32x32" href="/logos/32px.png">',
            '  <link rel="icon" type="image/png" sizes="64x64" href="/logos/64px.png">',
            '  <link rel="stylesheet" href="/styles/main.css">',
            '</head>',
            '<body class="blog-page">',
            this.renderHeaderLinks(),
            bodyHtml,
            '</body>',
            '</html>'
        ].join('\n');
    }

    /**
     * @returns {string}
     */
    renderHeaderLinks() {
        return [
            '<nav class="quick-links" aria-label="Primary">',
            '  <a href="/blog.html" class="quick-link">blog</a>',
            '  <a href="/docs/" class="quick-link">docs</a>',
            '  <a href="https://github.com/litruv" target="_blank" rel="noopener" class="quick-link">github</a>',
            '  <a href="https://bsky.app/profile/lit.mates.dev" target="_blank" rel="noopener" class="quick-link">bluesky</a>',
            '  <a href="/materials" class="quick-link">materials</a>',
            '</nav>'
        ].join('\n');
    }

    /**
     * @returns {string}
     */
    renderBrandBar() {
        return [
            '<a class="blog-logo-link" href="/" aria-label="Back to main site">',
            '  <img src="/logos/LogoFull.svg" alt="lit.ruv.wtf" class="blog-logo" />',
            '</a>'
        ].join('\n');
    }

    /**
     * @param {string} dateInput
     * @returns {string}
     */
    formatDate(dateInput) {
        const parsed = new Date(dateInput);
        if (Number.isNaN(parsed.valueOf())) {
            return this.escapeHtml(dateInput);
        }

        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(parsed);
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

/**
 * Lightweight markdown renderer for static blog generation.
 */
class StaticMarkdownRenderer {
    /**
     * @param {string} markdown
     * @returns {string}
     */
    static render(markdown) {
        const normalized = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!normalized) return '';

        const codeBlocks = [];
        const withCodePlaceholders = normalized.replace(/```([\w-]*)(?:\s*\{[^}]*\})?\s*\n([\s\S]*?)\n?```/g, (_, lang, code) => {
            const index = codeBlocks.length;
            codeBlocks.push({ lang: lang || '', code: code || '' });
            return `\n__CODEBLOCK_${index}__\n`;
        });

        const blocks = withCodePlaceholders.split(/\n{2,}/);
        const parts = blocks.map((block) => {
            const trimmed = block.trim();
            if (!trimmed) return '';

            const codeMatch = trimmed.match(/^__CODEBLOCK_(\d+)__$/);
            if (codeMatch) {
                const item = codeBlocks[Number(codeMatch[1])];
                const languageClass = item.lang ? ` language-${this.escapeHtml(item.lang)}` : '';
                return `<pre class="md-pre"><code class="${languageClass}">${this.escapeHtml(item.code)}</code></pre>`;
            }

            if (/^[-*_]{3,}$/.test(trimmed)) {
                return '<hr class="md-hr" />';
            }

            const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (heading && trimmed.split('\n').length === 1) {
                const level = heading[1].length;
                return `<h${level} class="md-h${level}">${this.renderInline(heading[2])}</h${level}>`;
            }

            if (/^>\s?/.test(trimmed)) {
                const quoteText = trimmed.split('\n').map((line) => line.replace(/^>\s?/, '')).join('\n');
                return `<blockquote class="md-blockquote">${this.renderInline(quoteText).replace(/\n/g, '<br />')}</blockquote>`;
            }

            if (/^[-*+]\s+/.test(trimmed)) {
                const items = trimmed
                    .split('\n')
                    .filter((line) => /^\s*[-*+]\s+/.test(line))
                    .map((line) => line.replace(/^\s*[-*+]\s+/, ''));
                return `<ul class="md-ul">${items.map((item) => `<li class="md-li">${this.renderInline(item)}</li>`).join('')}</ul>`;
            }

            if (/^\d+\.\s+/.test(trimmed)) {
                const items = trimmed
                    .split('\n')
                    .filter((line) => /^\s*\d+\.\s+/.test(line))
                    .map((line) => line.replace(/^\s*\d+\.\s+/, ''));
                return `<ol class="md-ol">${items.map((item) => `<li class="md-li">${this.renderInline(item)}</li>`).join('')}</ol>`;
            }

            const imageOnly = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
            if (imageOnly) {
                const imageMeta = this.parseImageMeta(imageOnly[1], imageOnly[2], imageOnly[3] || '');
                const captionHtml = imageMeta.caption ? `<figcaption class="md-figcaption">${this.escapeHtml(imageMeta.caption)}</figcaption>` : '';
                return `<figure class="md-figure"><img class="md-img" src="${imageMeta.src}" alt="${this.escapeHtml(imageMeta.alt)}"${imageMeta.attributes} />${captionHtml}</figure>`;
            }

            const lines = trimmed.split('\n').map((line) => this.renderInline(line));
            return `<p class="md-p">${lines.join('<br />')}</p>`;
        });

        return parts.filter(Boolean).join('\n');
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    static renderInline(text) {
        const codeSpans = [];
        const withCodePlaceholders = text.replace(/`([^`]+)`/g, (_, code) => {
            const index = codeSpans.length;
            codeSpans.push(code);
            return `__INLINE_CODE_${index}__`;
        });

        let html = this.escapeHtml(withCodePlaceholders);

        html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, url, title) => {
            const imageMeta = this.parseImageMeta(alt, url, title || '');
            return `<img class="md-img md-img--inline" src="${imageMeta.src}" alt="${this.escapeHtml(imageMeta.alt)}"${imageMeta.attributes} />`;
        });

        html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, url, title) => {
            const href = this.normalizeUrl(url);
            const rel = /^https?:\/\//i.test(href) ? ' rel="noopener noreferrer" target="_blank"' : '';
            const titleAttr = title ? ` title="${this.escapeHtml(title)}"` : '';
            return `<a class="md-link" href="${href}"${titleAttr}${rel}>${label}</a>`;
        });

        html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        html = html.replace(/__INLINE_CODE_(\d+)__/g, (_, idx) => {
            const code = codeSpans[Number(idx)] || '';
            return `<code class="md-code">${this.escapeHtml(code)}</code>`;
        });

        return html;
    }

    /**
     * @param {string} alt
     * @param {string} rawUrl
     * @param {string} title
     * @returns {{src: string, alt: string, caption: string, attributes: string}}
     */
    static parseImageMeta(alt, rawUrl, title) {
        const scale = this.parseScale(alt);
        const src = this.normalizeUrl(rawUrl);
        const safeAlt = scale !== null ? '' : String(alt || '');
        const caption = title ? String(title) : (scale !== null ? '' : String(alt || ''));
        const widthAttr = scale !== null ? ` style="width:${Math.round(scale * 10000) / 100}%;"` : '';

        return {
            src,
            alt: safeAlt,
            caption,
            attributes: widthAttr
        };
    }

    /**
     * @param {string} value
     * @returns {number | null}
     */
    static parseScale(value) {
        const normalized = String(value || '').trim();
        if (!/^\d*\.?\d+$/.test(normalized)) return null;
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return null;
        return parsed;
    }

    /**
     * @param {string} url
     * @returns {string}
     */
    static normalizeUrl(url) {
        const value = String(url || '').trim();
        if (!value) return '#';
        if (/^(https?:|mailto:|tel:|#|\/)/i.test(value)) return value;
        return `/${value.replace(/^\.\//, '').replace(/\\/g, '/')}`;
    }

    /**
     * @param {string} value
     * @returns {string}
     */
    static escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

module.exports = {
    StaticBlogGenerator
};
