'use strict';

const vscode = require('vscode');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const extensionManifest = require('./package.json');

const EXT_DIR  = __dirname;
const DIST_DIR = path.join(EXT_DIR, 'dist');
const ROOT_DIR = path.resolve(EXT_DIR, '..');
const EXTENSION_VERSION = extensionManifest.version;

/** @type {vscode.WebviewPanel | undefined} */
let panel;

/** @type {string | undefined} */
let activeBlogDir;

/** @type {string | undefined} */
let pendingOpenSlug;

/** @type {BlogSidebarProvider | undefined} */
let sidebarProvider;

/** @type {vscode.OutputChannel | undefined} */
let output;

const DEFAULT_LM_STUDIO_BASE_URL = 'http://127.0.0.1:1234';
const LM_STUDIO_CHAT_ENDPOINTS = ['/v1/chat/completions'];
const LM_STUDIO_MODELS_ENDPOINTS = ['/api/v1/models', '/v1/models'];
const BLOG_TAGS_JSON_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Blog Tags',
    type: 'array',
    maxItems: 20,
    uniqueItems: true,
    items: {
        type: 'string',
        minLength: 1,
        maxLength: 32,
        pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    },
};

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
 * @returns {{ title?: string, date?: string, author?: string, tags?: string }}
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
 * @param {string} value
 * @returns {number}
 */
function parseDateToMs(value) {
    if (!value) return 0;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : 0;
}

/**
 * Gets best previous author by most recent post date (fallback: file mtime).
 * @param {string} blogDir
 * @returns {string}
 */
function getPreviousAuthor(blogDir) {
    if (!fs.existsSync(blogDir)) return '';
    const entries = fs.readdirSync(blogDir)
        .filter(f => f.endsWith('.md') && !f.startsWith('.'))
        .map(file => {
            const filePath = path.join(blogDir, file);
            const meta = parseFrontmatterFromFile(filePath);
            const mtimeMs = fs.statSync(filePath).mtimeMs;
            return { author: (meta.author || '').trim(), dateMs: parseDateToMs(meta.date || ''), mtimeMs };
        })
        .filter(item => item.author)
        .sort((a, b) => {
            if (a.dateMs !== b.dateMs) return b.dateMs - a.dateMs;
            return b.mtimeMs - a.mtimeMs;
        });
    return entries[0]?.author || '';
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function parseTagArray(raw) {
    if (typeof raw !== 'string') {
        if (raw && typeof raw === 'object' && Array.isArray(raw.tags)) {
            return raw.tags
                .map(v => String(v).trim().replace(/^#+/, '').toLowerCase())
                .filter(Boolean);
        }
        return [];
    }

    const cleaned = raw
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();

    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tags)) {
                return parsed.tags
                    .map(v => String(v).trim().replace(/^#+/, '').toLowerCase())
                    .filter(Boolean);
            }
        } catch {
            // Fall through to array and split parsing.
        }
    }

    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
        try {
            const parsed = JSON.parse(cleaned.slice(start, end + 1));
            if (Array.isArray(parsed)) {
                return parsed
                    .map(v => String(v).trim().replace(/^#+/, '').toLowerCase())
                    .filter(Boolean);
            }
        } catch {
            // Fall through to comma/newline split.
        }
    }

    return cleaned
        .split(/[\n,]/)
        .map(v => v.replace(/^[\s\-•*#]+/, '').trim().toLowerCase())
        .filter(Boolean);
}

/**
 * @param {string[]} tags
 * @returns {string[]}
 */
function normalizeGeneratedTags(tags) {
    /** @type {string[]} */
    const out = [];
    const seen = new Set();
    for (const tag of tags) {
        const clean = tag
            .replace(/^#+/, '')
            .replace(/["'`]/g, '')
            .trim()
            .toLowerCase();
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
        if (out.length >= 12) break;
    }
    return out;
}

const FALLBACK_TAG_RULES = [
    { tag: 'unreal-engine', patterns: [/\bunreal engine\b/i, /\bue\b/i] },
    { tag: 'game-development', patterns: [/\bgame dev\b/i, /\bgame development\b/i, /\bgamedev\b/i] },
    { tag: 'programming', patterns: [/\bprogramming\b/i, /\bdeveloper\b/i, /\bdevelopment\b/i] },
    { tag: '3d-art', patterns: [/\b3d art\b/i, /\b3d\b/i] },
    { tag: 'animation', patterns: [/\banimation\b/i, /\banimations\b/i] },
    { tag: 'systems-design', patterns: [/\bsystems design\b/i, /\binteraction systems\b/i, /\bsystems-heavy\b/i] },
    { tag: 'tools', patterns: [/\btools\b/i, /\btooling\b/i] },
    { tag: 'development-logs', patterns: [/\bdevelopment logs\b/i, /\bdev logs\b/i, /\blog\b/i] },
    { tag: 'embedded-devices', patterns: [/\bembedded devices\b/i, /\bembedded\b/i] },
    { tag: 'hardware', patterns: [/\bhardware\b/i, /\baudio gear\b/i] },
    { tag: 'ui-frameworks', patterns: [/\bui frameworks\b/i, /\bui framework\b/i] },
    { tag: 'modding', patterns: [/\bmodding\b/i, /\bmodding workflows\b/i] },
    { tag: 'prototypes', patterns: [/\bprototypes\b/i, /\bprototype\b/i] },
    { tag: 'experiments', patterns: [/\bexperiments\b/i, /\bexperiment\b/i] },
];

const FALLBACK_TAG_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'blog', 'both', 'but', 'by', 'for',
    'from', 'here', 'into', 'its', 'just', 'make', 'more', 'onto', 'post', 'that',
    'the', 'their', 'this', 'those', 'through', 'use', 'useful', 'using', 'welcome',
    'with', 'worth', 'you', 'your',
]);

/**
 * @param {{ title: string, body: string, tags: string }} payload
 * @returns {string[]}
 */
function buildFallbackTags(payload) {
    const sourceText = `${payload.title || ''}\n${payload.body || ''}`;
    const fallback = normalizeGeneratedTags(parseTagArray(payload.tags || ''));
    const seen = new Set(fallback);

    for (const rule of FALLBACK_TAG_RULES) {
        if (seen.has(rule.tag)) continue;
        if (rule.patterns.some(pattern => pattern.test(sourceText))) {
            fallback.push(rule.tag);
            seen.add(rule.tag);
        }
        if (fallback.length >= 8) return fallback;
    }

    const titleTokens = (payload.title || '')
        .toLowerCase()
        .match(/[a-z0-9]+/g) || [];
    for (const token of titleTokens) {
        if (token.length < 4 || FALLBACK_TAG_STOP_WORDS.has(token) || seen.has(token)) continue;
        fallback.push(token);
        seen.add(token);
        if (fallback.length >= 8) break;
    }

    return normalizeGeneratedTags(fallback);
}

/**
 * @param {string} message
 */
function log(message) {
    const ts = new Date().toISOString();
    output?.appendLine(`[${ts}] ${message}`);
}

/**
 * @param {string | undefined} urlOrBase
 * @returns {string}
 */
function resolveLmStudioBaseUrl(urlOrBase) {
    const raw = (urlOrBase || '').trim();
    if (!raw) return DEFAULT_LM_STUDIO_BASE_URL;
    try {
        const parsed = new URL(raw);
        parsed.search = '';
        parsed.hash = '';
        const pathname = parsed.pathname || '/';
        const cut = pathname.search(/\/(api\/v1|v1)\b/i);
        parsed.pathname = cut >= 0 ? pathname.slice(0, cut) || '/' : pathname;
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return DEFAULT_LM_STUDIO_BASE_URL;
    }
}

/**
 * @param {string} baseUrl
 * @returns {string[]}
 */
function buildChatEndpointCandidates(baseUrl) {
    return LM_STUDIO_CHAT_ENDPOINTS.map(p => `${baseUrl}${p}`);
}

/**
 * @param {unknown} data
 * @returns {string}
 */
function extractLmStudioMessageContent(data) {
    if (!data || typeof data !== 'object') return '';
    const obj = /** @type {Record<string, unknown>} */ (data);

    const choices = Array.isArray(obj.choices) ? obj.choices : [];
    for (const choice of choices) {
        if (!choice || typeof choice !== 'object') continue;
        const c = /** @type {Record<string, unknown>} */ (choice);
        const message = c.message;
        if (message && typeof message === 'object') {
            const messageObj = /** @type {Record<string, unknown>} */ (message);
            const content = messageObj.content;
            if (typeof content === 'string' && content.trim()) return content;
            const reasoningContent = messageObj.reasoning_content;
            if (typeof reasoningContent === 'string' && reasoningContent.trim()) return reasoningContent;
        }
        if (typeof c.text === 'string' && c.text.trim()) return c.text;
    }

    if (typeof obj.output_text === 'string' && obj.output_text.trim()) return obj.output_text;
    if (typeof obj.content === 'string' && obj.content.trim()) return obj.content;
    return '';
}

/**
 * @param {string} baseUrl
 * @param {AbortSignal} signal
 * @returns {Promise<string>}
 */
async function detectLmStudioModel(baseUrl, signal) {
    for (const endpointPath of LM_STUDIO_MODELS_ENDPOINTS) {
        const endpoint = `${baseUrl}${endpointPath}`;
        try {
            log(`AI tags: probing models endpoint ${endpoint}`);
            const res = await fetch(endpoint, { method: 'GET', signal });
            log(`AI tags: models endpoint status ${res.status} (${endpoint})`);
            if (!res.ok) continue;
            /** @type {{ data?: Array<{ id?: string, state?: string, loaded?: boolean }> }} */
            const data = await res.json();
            const models = Array.isArray(data?.data) ? data.data : [];
            const loaded = models.find(m => m && typeof m.id === 'string' && (m.loaded === true || String(m.state || '').toLowerCase() === 'loaded'));
            if (loaded?.id) {
                log(`AI tags: selected loaded model ${loaded.id}`);
                return loaded.id;
            }
            const first = models.find(m => m && typeof m.id === 'string');
            if (first?.id) {
                log(`AI tags: selected first model ${first.id}`);
                return first.id;
            }
        } catch {
            // Try next endpoint variant.
        }
    }
    log('AI tags: could not detect model from API, using fallback local-model');
    return 'local-model';
}

/**
 * @param {string} endpoint
 * @param {Record<string, unknown>} body
 * @param {AbortSignal} signal
 * @returns {Promise<Response>}
 */
async function postLmStudio(endpoint, body, signal) {
    const payload = { ...body, stream: false };
    return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify(payload),
    });
}

/**
 * Generates tags from LM Studio OpenAI-compatible endpoint.
 * @param {{ title: string, body: string, tags: string }} payload
 * @returns {Promise<string[]>}
 */
async function generateTagsWithLmStudio(payload) {
    const configuredUrl = process.env.BLOG_EDITOR_LM_STUDIO_URL;
    const baseUrl = resolveLmStudioBaseUrl(configuredUrl);
    const endpoints = buildChatEndpointCandidates(baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const prompt = [
        'Generate 3 to 8 relevant blog tags.',
        'Return at least 1 tag even if the post is sparse.',
        'Keep any existing tag if it is still relevant.',
        'Prefer concrete topical tags over generic filler.',
        `Title: ${payload.title || '(untitled)'}`,
        `Existing tags: ${payload.tags || '(none)'}`,
        'Body:',
        (payload.body || '').slice(0, 6000),
    ].join('\n\n');

    try {
        log(`AI tags: request started (version=${EXTENSION_VERSION}, title=${payload.title ? 'yes' : 'no'}, bodyChars=${payload.body.length}, existingTags=${payload.tags ? 'yes' : 'no'})`);
        log(`AI tags: base URL ${baseUrl}`);
        log(`AI tags: title preview ${JSON.stringify((payload.title || '').slice(0, 120))}`);
        log(`AI tags: existing tags preview ${JSON.stringify((payload.tags || '').slice(0, 120))}`);
        log(`AI tags: body preview ${JSON.stringify((payload.body || '').slice(0, 280))}`);
        const modelId = await detectLmStudioModel(baseUrl, controller.signal);
        log(`AI tags: using model ${modelId}`);
        let lastError = '';

        for (const endpoint of endpoints) {
            const requestBody = {
                model: modelId,
                temperature: 0.2,
                max_tokens: 256,
                messages: [
                    {
                        role: 'system',
                        content: 'Return only a JSON array that matches the provided schema. Do not include prose, markdown, commentary, or reasoning. The array must contain at least one relevant tag.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'blog_tags',
                        strict: true,
                        schema: BLOG_TAGS_JSON_SCHEMA,
                    },
                },
            };

            let res = await postLmStudio(endpoint, requestBody, controller.signal);
            log(`AI tags: chat attempt ${endpoint} -> ${res.status}`);
            let textOnError = '';
            if (!res.ok) textOnError = await res.text();

            // Structured output is required here. If an endpoint does not support
            // response_format/json_schema, skip it and try the next endpoint
            // instead of falling back to unstructured text generation.
            if (!res.ok && (res.status === 400 || res.status === 422)) {
                const unsupported = /response_format|json_schema|unsupported|unknown/i.test(textOnError);
                if (unsupported) {
                    lastError = `Endpoint ${endpoint} does not support structured output.`;
                    log(`AI tags: ${lastError}`);
                    continue;
                }
            }

            if (!res.ok) {
                const text = textOnError || await res.text();
                const maybeWrongEndpoint = res.status === 404 || res.status === 405 || /not\s*found/i.test(text);
                if (maybeWrongEndpoint) {
                    lastError = `Endpoint ${endpoint} unavailable (${res.status}).`;
                    log(`AI tags: ${lastError}`);
                    continue;
                }
                lastError = `LM Studio request failed (${res.status}) on ${endpoint}: ${text || 'no body'}`;
                log(`AI tags: ${lastError}`);
                continue;
            }

            /** @type {unknown} */
            const data = await res.json();
            const content = extractLmStudioMessageContent(data);
            const parsed = parseTagArray(content);
            const tags = normalizeGeneratedTags(parsed);
            if (tags.length === 0) {
                const fallbackTags = buildFallbackTags(payload);
                if (fallbackTags.length > 0) {
                    log(`AI tags: LM Studio returned empty structured output, falling back to ${fallbackTags.length} derived tag(s)`);
                    log(`AI tags: fallback tags ${JSON.stringify(fallbackTags)}`);
                    return fallbackTags;
                }
                lastError = `LM Studio returned no usable tags from ${endpoint}.`;
                log(`AI tags: ${lastError}`);
                continue;
            }
            log(`AI tags: success via ${endpoint}, generated ${tags.length} tags`);
            return tags;
        }

        throw new Error(lastError || `No LM Studio chat endpoint succeeded. Tried: ${endpoints.join(', ')}`);
    } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
            log('AI tags: request timed out after 90s');
            throw new Error('LM Studio request timed out after 90s.');
        }
        log(`AI tags: exception ${String(err)}`);
        throw err;
    } finally {
        clearTimeout(timeout);
        log('AI tags: request finished');
    }
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
    output = vscode.window.createOutputChannel('Blog Editor');
    context.subscriptions.push(output);
    log(`Blog Editor activated (version ${EXTENSION_VERSION})`);

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
    const author = getPreviousAuthor(blogDir);
    const authorLine = author ? `\nauthor: "${author.replace(/"/g, '\\"')}"` : '';
    const starter = `---\ntitle: "${slug}"\ndate: "${now}"${authorLine}\ntags: ""\n---\n\n`;
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
    const spellcheckPath = path.join(DIST_DIR, 'spellcheck.js');

    // Prefer prebuilt assets in packaged VSIX to avoid requiring esbuild at runtime.
    if (fs.existsSync(milkdownPath) && fs.existsSync(commonCssPath) && fs.existsSync(themeCssPath) && fs.existsSync(spellcheckPath)) return;

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

            const [jsResult, cssCommon, cssTheme, spellcheckResult] = await Promise.all([
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
                esbuild.build({
                    entryPoints: [path.join(EXT_DIR, 'spellcheck.js')],
                    bundle: true,
                    format: 'esm',
                    platform: 'browser',
                    target: 'es2022',
                    minify: true,
                    write: false,
                    loader: { '.aff': 'text', '.dic': 'text' },
                }),
            ]);

            fs.writeFileSync(path.join(DIST_DIR, 'milkdown.js'),         jsResult.outputFiles[0].contents);
            fs.writeFileSync(path.join(DIST_DIR, 'milkdown-common.css'), cssCommon.outputFiles[0].contents);
            fs.writeFileSync(path.join(DIST_DIR, 'milkdown-theme.css'),  cssTheme.outputFiles[0].contents);
            fs.writeFileSync(path.join(DIST_DIR, 'spellcheck.js'),       spellcheckResult.outputFiles[0].contents);
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
    const spellcheckJs = webview.asWebviewUri(vscode.Uri.file(path.join(DIST_DIR, 'spellcheck.js')));
    const commonCss  = webview.asWebviewUri(vscode.Uri.file(path.join(DIST_DIR, 'milkdown-common.css')));
    const themeCss   = webview.asWebviewUri(vscode.Uri.file(path.join(DIST_DIR, 'milkdown-theme.css')));
    const csp        = webview.cspSource;

    const template = fs.readFileSync(path.join(EXT_DIR, 'editor.html'), 'utf-8');
    return template
        .replace(/\{\{NONCE\}\}/g,        nonce)
        .replace(/\{\{CSP_SOURCE\}\}/g,   csp)
        .replace('{{MILKDOWN_JS}}',        milkdownJs.toString())
        .replace('{{SPELLCHECK_JS}}',      spellcheckJs.toString())
        .replace('{{COMMON_CSS}}',         commonCss.toString())
        .replace('{{THEME_CSS}}',          themeCss.toString());
}

/**
 * Splits markdown image target into URL/path and optional trailing title segment.
 * Examples:
 *   data/blog/media/a.png "Caption" -> { src: data/blog/media/a.png, suffix:  "Caption" }
 *   https://x/y.png -> { src: https://x/y.png, suffix: '' }
 * @param {string} target
 * @returns {{ src: string, suffix: string }}
 */
function splitImageTarget(target) {
    const trimmed = target.trim();
    const m = trimmed.match(/^(\S+)(\s+["'][\s\S]*["'])?$/);
    if (!m) return { src: trimmed, suffix: '' };
    return { src: m[1], suffix: m[2] ?? '' };
}

/**
 * Replaces relative image paths in markdown with webview-safe URIs.
 * @param {string} content
 * @param {string} websiteBaseUri  Result of webview.asWebviewUri(websiteDir).toString()
 * @returns {string}
 */
function injectWebviewImageUris(content, websiteBaseUri) {
    return content.replace(/(\!\[[^\]]*\]\()([^)]+)(\))/g, (match, open, target, close) => {
        const { src, suffix } = splitImageTarget(target);
        if (/^https?:|^data:|^blob:/.test(src)) return match;
        return `${open}${websiteBaseUri}/${src.replace(/^\//, '')}${suffix}${close}`;
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
        (_m, open, target, close) => {
            const { src, suffix } = splitImageTarget(target);
            return `${open}${src}${suffix}${close}`;
        }
    );
}

/**
 * Handles messages from the webview.
 * @param {{ type: string, slug?: string, oldSlug?: string, newSlug?: string, content?: string, filename?: string, dataBase64?: string, blobUrl?: string, title?: string, body?: string, tags?: string }} msg
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
                    const { src } = splitImageTarget(imgMatch[1]);
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
            case 'generateTags': {
                const title = (msg.title || '').trim();
                const body = (msg.body || '').trim();
                const tags = (msg.tags || '').trim();
                log('AI tags: webview requested generation');
                if (!title && !body) {
                    log('AI tags: rejected request - missing title/body');
                    webview.postMessage({ type: 'error', message: 'Need title or body for tag generation.' });
                    return;
                }
                webview.postMessage({ type: 'aiTagsStarted' });
                generateTagsWithLmStudio({ title, body, tags })
                    .then(generated => {
                        log('AI tags: sending generated tags to webview');
                        webview.postMessage({ type: 'aiTagsGenerated', tags: generated });
                    })
                    .catch(err => {
                        log(`AI tags: generation failed ${String(err)}`);
                        webview.postMessage({ type: 'error', message: `AI tag generation failed: ${String(err)}` });
                    });
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
