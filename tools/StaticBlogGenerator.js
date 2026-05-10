'use strict';

const fs = require('fs').promises;
const path = require('path');
const { renderNavLinkItems } = require('./navLinks');

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

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const prev = posts[i + 1] || null;
            const next = posts[i - 1] || null;
            const postDir = path.join(this.blogRootDir, post.slug);
            await fs.mkdir(postDir, { recursive: true });
            const postHtml = this.renderPostPage(post, prev, next);
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
     * @param {{slug: string, title: string, date: string | null} | null} prev - Older post (lower index)
     * @param {{slug: string, title: string, date: string | null} | null} next - Newer post (higher index)
     * @returns {string}
     */
    renderPostPage(post, prev = null, next = null) {
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

        const markdownJson = JSON.stringify(post.content || '').replace(/<\//g, '<\\/');

        const prevPeek = prev
            ? [
                `<div class="blog-post-peek-wrapper blog-post-peek-wrapper--prev">`,
                `<a class="blog-post-peek blog-post-peek--prev" href="/blog/${encodeURIComponent(prev.slug)}/" aria-label="Older post: ${this.escapeHtml(prev.title)}">`,
                `  <div class="blog-post-peek-header">`,
                `    <span class="blog-post-peek-direction">← older</span>`,
                `    <span class="blog-post-peek-pin" data-peek-pin="prev-out"></span>`,
                `  </div>`,
                `  <div class="blog-post-peek-body">`,
                `    <span class="blog-post-peek-title">${this.escapeHtml(prev.title)}</span>`,
                prev.date ? `    <span class="blog-post-peek-date">${this.formatDate(prev.date)}</span>` : '',
                `  </div>`,
                `</a>`,
                `</div>`,
            ].join('\n')
            : '<div class="blog-post-peek-wrapper blog-post-peek-wrapper--prev"></div>';

        const nextPeek = next
            ? [
                `<div class="blog-post-peek-wrapper blog-post-peek-wrapper--next">`,
                `<a class="blog-post-peek blog-post-peek--next" href="/blog/${encodeURIComponent(next.slug)}/" aria-label="Newer post: ${this.escapeHtml(next.title)}">`,
                `  <div class="blog-post-peek-header">`,
                `    <span class="blog-post-peek-pin" data-peek-pin="next-in"></span>`,
                `    <span class="blog-post-peek-direction" style="text-align:right">newer →</span>`,
                `  </div>`,
                `  <div class="blog-post-peek-body">`,
                `    <span class="blog-post-peek-title">${this.escapeHtml(next.title)}</span>`,
                next.date ? `    <span class="blog-post-peek-date">${this.formatDate(next.date)}</span>` : '',
                `  </div>`,
                `</a>`,
                `</div>`,
            ].join('\n')
            : '<div class="blog-post-peek-wrapper blog-post-peek-wrapper--next"></div>';

        const content = [
            '<main class="blog-shell">',
            this.renderBrandBar(),
            '<div class="blog-post-layout">',
            prevPeek,
            '<article class="blog-card" aria-labelledby="blog-post-title">',
            '  <header class="blog-post-header">',
            `    <h1 id="blog-post-title" class="blog-post-title">${safeTitle}</h1>`,
            metaBits.length > 0 ? `    <p class="blog-post-meta">${metaBits.join('<span aria-hidden="true">-</span>')}</p>` : '',
            tagsHtml,
            '  </header>',
            '<div class="md-hr" role="separator"><span class="md-hr-line"></span><span class="md-hr-arrow"></span></div>',
            '  <section class="blog-post-content" data-blog-post-content></section>',
            `  <script id="blogPostMarkdown" type="application/json">${markdownJson}</script>`,
            '</article>',
            nextPeek,
            '<svg class="blog-post-splines" aria-hidden="true"></svg>',
            '</div>',
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
            '  <base href="/">',
            `  <title>${escapedTitle}</title>`,
            '  <meta name="description" content="Lit.ruv.wtf blog posts.">',
            `  <link rel="canonical" href="https://lit.ruv.wtf${canonicalPath}">`,
            '  <link rel="icon" type="image/png" sizes="32x32" href="/logos/32px.png">',
            '  <link rel="icon" type="image/png" sizes="64x64" href="/logos/64px.png">',
            '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">',
            '  <link rel="stylesheet" href="/styles/main.css">',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js"></script>',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-jsx.min.js"></script>',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-css.min.js"></script>',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"></script>',
            '  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>',
            '</head>',
            '<body class="blog-page">',
            '<nav class="quick-links" aria-label="Primary">',
            this.renderHeaderLinks(),
            '</nav>',
            this.renderScrollTopBar(),
            bodyHtml,
            '  <script type="module" src="/scripts/blogPage.js"></script>',
            '</body>',
            '</html>'
        ].join('\n');
    }

    /**
     * @returns {string}
     */
    renderHeaderLinks() {
        return renderNavLinkItems('  ');
    }

    /**
     * @returns {string}
     */
    renderScrollTopBar() {
        return [
            '<header class="blog-scroll-topbar" data-blog-scroll-topbar>',
            '  <a class="blog-scroll-logo-link" href="/" aria-label="Back to main site">',
            '    <img src="/logos/LogoFull.svg" alt="lit.ruv.wtf" class="blog-scroll-logo" />',
            '  </a>',
            '  <nav class="blog-scroll-links" aria-label="Scrolled navigation">',
            this.renderHeaderLinks(),
            '  </nav>',
            '</header>'
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

module.exports = {
    StaticBlogGenerator
};
