'use strict';

const vscode = require('vscode');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const EXT_DIR  = __dirname;
const DIST_DIR = path.join(EXT_DIR, 'dist');
const ROOT_DIR = path.resolve(EXT_DIR, '..');

/** @type {vscode.WebviewPanel | undefined} */
let panel;

/** @type {string | undefined} */
let activeBlogDir;

/** @type {string | undefined} */
let pendingOpenSlug;

/** @type {BlogSidebarProvider | undefined} */
let sidebarProvider;

/**
 * @implements {vscode.TreeDataProvider<vscode.TreeItem>}
 */
class BlogSidebarProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * @returns {vscode.ProviderResult<vscode.TreeItem[]>}
     */
    getChildren() {
        if (!activeBlogDir || !fs.existsSync(activeBlogDir)) {
            const openItem = new vscode.TreeItem('Open Blog Editor', vscode.TreeItemCollapsibleState.None);
            openItem.tooltip = 'Open the Blog Editor panel';
            openItem.command = {
                command: 'blogEditor.open',
                title: 'Open Blog Editor'
            };
            openItem.iconPath = new vscode.ThemeIcon('edit');
            return [openItem];
        }

        const posts = fs.readdirSync(activeBlogDir)
            .filter(f => f.endsWith('.md') && !f.startsWith('.'))
            .map(f => {
                const slug = path.basename(f, '.md');
                const meta = parseFrontmatterFromFile(path.join(activeBlogDir, f));
                return { slug, title: meta.title || slug, date: meta.date || '' };
            })
            .sort((a, b) => {
                if (a.date && b.date) return b.date.localeCompare(a.date);
                if (a.date) return -1;
                if (b.date) return 1;
                return a.slug.localeCompare(b.slug);
            });

        if (posts.length === 0) {
            const empty = new vscode.TreeItem('No posts found', vscode.TreeItemCollapsibleState.None);
            empty.iconPath = new vscode.ThemeIcon('circle-slash');
            return [empty];
        }

        return posts.map(({ slug, title, date }) => new BlogPostItem(slug, title, date));
    }

    /**
     * @param {vscode.TreeItem} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        return element;
    }
}

/**
 * Parses YAML-ish frontmatter from a markdown file.
 * @param {string} filePath
 * @returns {{ title?: string, date?: string }}
 */
function parseFrontmatterFromFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!m) return {};
        /** @type {Record<string, string>} */
        const meta = {};
        for (const line of m[1].split(/\r?\n/)) {
            const i = line.indexOf(':');
            if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        }
        return meta;
    } catch { return {}; }
}

/**
 * A tree item representing a single blog post.
 * Stores the slug separately so context-menu commands can retrieve it
 * even when the label displays the human-readable title.
 */
class BlogPostItem extends vscode.TreeItem {
    /**
     * @param {string} slug
     * @param {string} title
     * @param {string} date
     */
    constructor(slug, title, date) {
        super(title || slug, vscode.TreeItemCollapsibleState.None);
        this.id          = slug;
        this.slug        = slug;
        this.description = date || '';
        this.tooltip     = `${slug}.md`;
        this.contextValue = 'blogPost';
        this.command = { command: 'blogEditor.openPost', title: 'Open Post', arguments: [slug] };
        this.iconPath = new vscode.ThemeIcon('file');
    }
}

/**
 * Walks up from startDir to find node_modules containing a package.
 * @param {string} pkg
 * @param {string} startDir
 * @returns {string | null}
 */
function resolveFromNearestNodeModules(pkg, startDir) {
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, 'node_modules', pkg);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    sidebarProvider = new BlogSidebarProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('blog-editor-sidebar', sidebarProvider),
        vscode.commands.registerCommand('blogEditor.open', () => openEditor(context)),
        vscode.commands.registerCommand('blogEditor.openPost', (slug) => openEditor(context, slug)),
        vscode.commands.registerCommand('blogEditor.refreshPosts', () => sidebarProvider?.refresh()),
        vscode.commands.registerCommand('blogEditor.newPost', () => newPost(context)),
        vscode.commands.registerCommand('blogEditor.renamePost', (item) => renamePost(item))
    );
}

/**
 * Prompts the user for a slug and creates a new blank blog post.
 * @param {vscode.ExtensionContext} context
 */
async function newPost(context) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

    const blogDir = path.join(workspaceRoot, 'website', 'data', 'blog');

    const slug = await vscode.window.showInputBox({
        prompt: 'Enter a slug for the new post (lowercase letters, numbers, hyphens)',
        placeHolder: 'my-new-post',
        validateInput: v => isValidSlug(v) ? null : 'Use only lowercase letters, numbers, and hyphens (e.g. my-post)'
    });
    if (!slug) return;

    const filePath = path.join(blogDir, `${slug}.md`);
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`A post named "${slug}" already exists.`);
        return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const starter = `---\ntitle: "${slug}"\ndate: "${now}"\ntags: []\n---\n\n`;
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(filePath, starter, 'utf-8');
    activeBlogDir = blogDir;
    sidebarProvider?.refresh();
    openEditor(context, slug);
}

/**
 * Renames a blog post slug via right-click context menu on a sidebar tree item.
 * @param {vscode.TreeItem} item
 */
async function renamePost(item) {
    const oldSlug = item?.slug ?? item?.id ?? (typeof item?.label === 'string' ? item.label : undefined);
    if (!oldSlug || typeof oldSlug !== 'string') { vscode.window.showErrorMessage('Could not determine post slug.'); return; }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

    const blogDir = path.join(workspaceRoot, 'website', 'data', 'blog');
    const oldPath = path.join(blogDir, `${oldSlug}.md`);

    const newSlug = await vscode.window.showInputBox({
        prompt: `Rename "${oldSlug}" to:`,
        value: oldSlug,
        validateInput: v => isValidSlug(v) ? null : 'Use only lowercase letters, numbers, and hyphens'
    });
    if (!newSlug || newSlug === oldSlug) return;

    const newPath = path.join(blogDir, `${newSlug}.md`);
    if (fs.existsSync(newPath)) { vscode.window.showErrorMessage(`"${newSlug}" already exists.`); return; }

    fs.renameSync(oldPath, newPath);
    sidebarProvider?.refresh();

    // If this post is currently open in the editor, refresh it with the new slug.
    if (panel) {
        panel.webview.postMessage({ type: 'openSlug', slug: newSlug });
    }
}

/**
 * Builds the Milkdown JS + CSS bundles into dist/ if they don't exist yet.
 * @returns {Promise<void>}
 */
async function ensureBundle() {
    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

    const milkdownPath = path.join(DIST_DIR, 'milkdown.js');
    const commonCssPath = path.join(DIST_DIR, 'milkdown-common.css');
    const themeCssPath = path.join(DIST_DIR, 'milkdown-theme.css');

    // Prefer prebuilt assets in packaged VSIX to avoid requiring esbuild at runtime.
    if (fs.existsSync(milkdownPath) && fs.existsSync(commonCssPath) && fs.existsSync(themeCssPath)) return;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Blog Editor: Bundling Milkdown…' },
        async () => {
            const esbuildPkg = resolveFromNearestNodeModules('esbuild', EXT_DIR)
                ?? resolveFromNearestNodeModules('esbuild', process.cwd());
            if (!esbuildPkg) {
                throw new Error('Missing prebuilt dist assets and esbuild is unavailable. Rebuild the VSIX from the repo root so dist files are packaged.');
            }
            const esbuild = require(path.join(esbuildPkg, 'lib', 'main.js'));
            const crepePkg = resolveFromNearestNodeModules('@milkdown/crepe', EXT_DIR)
                ?? resolveFromNearestNodeModules('@milkdown/crepe', process.cwd());
            if (!crepePkg) {
                throw new Error('Cannot find @milkdown/crepe for bundling. Install workspace dependencies or rebuild the VSIX with prebuilt dist.');
            }
            const rootDir = path.dirname(path.dirname(esbuildPkg));
            const crepeDir = path.join(crepePkg, 'lib', 'theme');
            const fontLoaders = { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl', '.svg': 'dataurl' };

            const [jsResult, cssCommon, cssTheme] = await Promise.all([
                esbuild.build({
                    stdin: { contents: `export { Crepe, CrepeFeature } from '@milkdown/crepe';`, resolveDir: rootDir, loader: 'js' },
                    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, write: false,
                }),
                esbuild.build({
                    entryPoints: [path.join(crepeDir, 'common', 'style.css')],
                    bundle: true, write: false, loader: fontLoaders,
                }),
                esbuild.build({
                    entryPoints: [path.join(crepeDir, 'frame-dark', 'style.css')],
                    bundle: true, write: false, loader: fontLoaders,
                }),
            ]);

            fs.writeFileSync(path.join(DIST_DIR, 'milkdown.js'),         jsResult.outputFiles[0].contents);
            fs.writeFileSync(path.join(DIST_DIR, 'milkdown-common.css'), cssCommon.outputFiles[0].contents);
            fs.writeFileSync(path.join(DIST_DIR, 'milkdown-theme.css'),  cssTheme.outputFiles[0].contents);
        }
    );
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {string} [initialSlug]
 */
async function openEditor(context, initialSlug) {
    if (panel) {
        panel.reveal();
        if (initialSlug) {
            panel.webview.postMessage({ type: 'openSlug', slug: initialSlug });
        }
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

    await ensureBundle();

    const websiteDir = path.join(workspaceRoot, 'website');
    const blogDir    = path.join(websiteDir, 'data', 'blog');
    activeBlogDir = blogDir;
    sidebarProvider?.refresh();

    if (initialSlug) pendingOpenSlug = initialSlug;

    panel = vscode.window.createWebviewPanel(
        'blogEditor', 'Blog Editor',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(DIST_DIR),
                vscode.Uri.file(websiteDir),
            ],
        }
    );

    panel.webview.html = buildHtml(panel.webview);

    panel.webview.onDidReceiveMessage(msg => handleMessage(msg, blogDir, websiteDir), undefined, context.subscriptions);
    panel.onDidDispose(() => {
        panel = undefined;
        pendingOpenSlug = undefined;
    }, undefined, context.subscriptions);
}

/**
 * Builds the webview HTML, replacing asset URIs and nonce.
 * @param {vscode.Webview} webview
 * @returns {string}
 */
function buildHtml(webview) {
    const nonce      = crypto.randomBytes(16).toString('hex');
    const milkdownJs = webview.asWebviewUri(vscode.Uri.file(path.join(DIST_DIR, 'milkdown.js')));
    const commonCss  = webview.asWebviewUri(vscode.Uri.file(path.join(DIST_DIR, 'milkdown-common.css')));
    const themeCss   = webview.asWebviewUri(vscode.Uri.file(path.join(DIST_DIR, 'milkdown-theme.css')));
    const csp        = webview.cspSource;

    const template = fs.readFileSync(path.join(EXT_DIR, 'editor.html'), 'utf-8');
    return template
        .replace(/\{\{NONCE\}\}/g,        nonce)
        .replace(/\{\{CSP_SOURCE\}\}/g,   csp)
        .replace('{{MILKDOWN_JS}}',        milkdownJs.toString())
        .replace('{{COMMON_CSS}}',         commonCss.toString())
        .replace('{{THEME_CSS}}',          themeCss.toString());
}

/**
 * Replaces relative image paths in markdown with webview-safe URIs.
 * @param {string} content
 * @param {string} websiteBaseUri  Result of webview.asWebviewUri(websiteDir).toString()
 * @returns {string}
 */
function injectWebviewImageUris(content, websiteBaseUri) {
    return content.replace(/(\!\[[^\]]*\]\()([^)]+)(\))/g, (match, open, src, close) => {
        if (/^https?:|^data:|^blob:/.test(src)) return match;
        return `${open}${websiteBaseUri}/${src.replace(/^\//, '')}${close}`;
    });
}

/**
 * Reverts webview URIs in markdown back to relative paths before saving.
 * @param {string} content
 * @param {string} websiteBaseUri
 * @returns {string}
 */
function revertWebviewImageUris(content, websiteBaseUri) {
    const escaped = websiteBaseUri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return content.replace(
        new RegExp(`(\\!\\[[^\\]]*\\]\\()${escaped}/([^)]+)(\\))`, 'g'),
        (_m, open, rel, close) => `${open}${rel}${close}`
    );
}

/**
 * Handles messages from the webview.
 * @param {{ type: string, slug?: string, content?: string, filename?: string, dataBase64?: string, blobUrl?: string }} msg
 * @param {string} blogDir
 * @param {string} websiteDir
 */
function handleMessage(msg, blogDir, websiteDir) {
    const webview = panel?.webview;
    if (!webview) return;
    try {
        const websiteBaseUri = webview.asWebviewUri(vscode.Uri.file(websiteDir)).toString();
        switch (msg.type) {
            case 'getPosts': {
                const slugs = fs.readdirSync(blogDir)
                    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
                    .map(f => path.basename(f, '.md'))
                    .sort();
                webview.postMessage({ type: 'posts', slugs });
                break;
            }
            case 'getPost': {
                const filePath = safePostPath(blogDir, msg.slug);
                if (!filePath) return;
                const raw = fs.readFileSync(filePath, 'utf-8').replace(/!\[[^\]]*\]\(blob:[^)]+\)\r?\n?/g, '');
                // Build imageMap: webviewUri → relativePath, so the browser can reverse blob URLs
                const imageMap = {};
                const imgPattern = /!\[[^\]]*\]\(([^)]+)\)/g;
                let imgMatch;
                while ((imgMatch = imgPattern.exec(raw)) !== null) {
                    const src = imgMatch[1];
                    if (/^https?:|^data:|^blob:/.test(src)) continue;
                    const absPath = path.join(websiteDir, src.replace(/^\//, ''));
                    if (fs.existsSync(absPath)) {
                        const uri = webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
                        imageMap[uri] = src;
                    }
                }
                const content = injectWebviewImageUris(raw, websiteBaseUri);
                webview.postMessage({ type: 'post', slug: msg.slug, content, imageMap });
                break;
            }
            case 'savePost': {
                const filePath = safePostPath(blogDir, msg.slug);
                if (!filePath) return;
                const content = revertWebviewImageUris(msg.content, websiteBaseUri);
                fs.writeFileSync(filePath, content, 'utf-8');
                webview.postMessage({ type: 'saved', slug: msg.slug });
                break;
            }
            case 'saveMedia': {
                const mediaDir = path.join(websiteDir, 'data', 'blog', 'media');
                fs.mkdirSync(mediaDir, { recursive: true });
                const safeName = (msg.filename || 'paste.png').replace(/[^a-z0-9._-]/gi, '_');
                const filePath = path.join(mediaDir, safeName);
                fs.writeFileSync(filePath, Buffer.from(msg.dataBase64, 'base64'));
                const relativePath = `data/blog/media/${safeName}`;
                const savedUri = webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
                webview.postMessage({ type: 'mediaSaved', blobUrl: msg.blobUrl, relativePath, webviewUri: savedUri });
                break;
            }
            case 'newPost': {
                if (!isValidSlug(msg.slug)) {
                    webview.postMessage({ type: 'error', message: 'Invalid slug.' });
                    return;
                }
                const filePath = path.join(blogDir, `${msg.slug}.md`);
                if (fs.existsSync(filePath)) {
                    webview.postMessage({ type: 'error', message: `"${msg.slug}" already exists.` });
                    return;
                }
                fs.writeFileSync(filePath, msg.content, 'utf-8');
                webview.postMessage({ type: 'created', slug: msg.slug });
                sidebarProvider?.refresh();
                break;
            }
            case 'renamePost': {
                if (!isValidSlug(msg.newSlug)) {
                    webview.postMessage({ type: 'error', message: 'Invalid slug.' });
                    return;
                }
                const oldFilePath = safePostPath(blogDir, msg.oldSlug);
                if (!oldFilePath) return;
                const newFilePath = path.join(blogDir, `${msg.newSlug}.md`);
                if (!newFilePath.startsWith(blogDir + path.sep)) return;
                if (fs.existsSync(newFilePath)) {
                    webview.postMessage({ type: 'error', message: `"${msg.newSlug}" already exists.` });
                    return;
                }
                fs.renameSync(oldFilePath, newFilePath);
                sidebarProvider?.refresh();
                webview.postMessage({ type: 'renamed', oldSlug: msg.oldSlug, newSlug: msg.newSlug });
                break;
            }
            case 'refreshPosts': {
                sidebarProvider?.refresh();
                break;
            }
            case 'ready': {
                if (pendingOpenSlug) {
                    webview.postMessage({ type: 'openSlug', slug: pendingOpenSlug });
                    pendingOpenSlug = undefined;
                }
                break;
            }
        }
    } catch (err) {
        webview.postMessage({ type: 'error', message: String(err) });
    }
}

/**
 * Returns an absolute path to a post file, guarding against path traversal.
 * @param {string} blogDir
 * @param {string | undefined} slug
 * @returns {string | null}
 */
function safePostPath(blogDir, slug) {
    if (!isValidSlug(slug)) {
        panel?.webview.postMessage({ type: 'error', message: 'Invalid slug.' });
        return null;
    }
    const resolved = path.resolve(blogDir, `${slug}.md`);
    if (!resolved.startsWith(blogDir + path.sep)) return null;
    return resolved;
}

/**
 * @param {string | undefined} slug
 * @returns {boolean}
 */
function isValidSlug(slug) {
    return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(slug) && slug.length <= 100;
}

function deactivate() {}

module.exports = { activate, deactivate };
