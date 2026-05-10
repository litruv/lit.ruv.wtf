'use strict';

/**
 * @typedef {Object} NavLink
 * @property {string} label
 * @property {string} href
 * @property {boolean} [external]
 */

/** @type {NavLink[]} */
const NAV_LINKS = [
    { label: 'blog',      href: '/blog.html' },
    { label: 'docs',      href: '/docs/' },
    { label: 'github',    href: 'https://github.com/litruv',               external: true },
    { label: 'bluesky',   href: 'https://bsky.app/profile/lit.mates.dev',  external: true },
    { label: 'materials', href: '/materials' },
];

/**
 * Renders nav link `<a>` elements as an HTML string.
 *
 * @param {string} [indent='  '] - Leading whitespace for each line.
 * @returns {string}
 */
function renderNavLinkItems(indent = '  ') {
    return NAV_LINKS.map(({ label, href, external }) => {
        const attrs = external ? ' target="_blank" rel="noopener"' : '';
        return `${indent}<a href="${href}"${attrs} class="quick-link">${label}</a>`;
    }).join('\n');
}

module.exports = { NAV_LINKS, renderNavLinkItems };
