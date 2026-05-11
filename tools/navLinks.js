'use strict';

const GITHUB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>';
const BLUESKY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"/></svg>';

/**
 * @typedef {Object} NavLink
 * @property {string} label
 * @property {string} href
 * @property {boolean} [external]
 * @property {string} [svg] - Inline SVG string shown instead of label text.
 */

/** @type {NavLink[]} */
const NAV_LINKS = [
    { label: 'home',      href: '/' },
    { label: 'blog',      href: '/blog.html' },
    { label: 'docs',      href: '/docs/' },
    { label: 'materials', href: '/materials' },
    { label: 'GitHub',    href: 'https://github.com/litruv',              external: true, svg: GITHUB_SVG },
    { label: 'Bluesky',   href: 'https://bsky.app/profile/lit.mates.dev', external: true, svg: BLUESKY_SVG },
];

/**
 * Renders nav link `<a>` elements as an HTML string.
 *
 * @param {string} [indent='  '] - Leading whitespace for each line.
 * @returns {string}
 */
function renderNavLinkItems(indent = '  ') {
    return NAV_LINKS.map(({ label, href, external, svg }) => {
        const attrs = external ? ' target="_blank" rel="noopener"' : '';
        const content = svg ? svg : label;
        const extraClass = svg ? ' quick-link--icon' : '';
        return `${indent}<a href="${href}"${attrs} class="quick-link${extraClass}" aria-label="${label}"${svg ? ` title="${label}"` : ''}>${content}</a>`;
    }).join('\n');
}

module.exports = { NAV_LINKS, renderNavLinkItems };
