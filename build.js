const fs = require('fs').promises;
const path = require('path');
const esbuild = require('esbuild');
const { execSync } = require('child_process');
const { StaticBlogGenerator } = require('./tools/StaticBlogGenerator');
const { renderNavLinkItems } = require('./tools/navLinks');

/**
 * Parse YAML front matter from markdown content
 * @param {string} content - The markdown file content
 * @returns {{metadata: Object, content: string}}
 */
function parseMarkdownWithFrontmatter(content) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
        return { metadata: {}, content: content };
    }
    
    const yamlContent = match[1];
    const markdownContent = match[2];
    
    // Simple YAML parser for basic key: value pairs
    const metadata = {};
    const lines = yamlContent.split(/\r?\n/);
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            // Remove quotes if present
            metadata[key] = value.replace(/^["']|["']$/g, '');
        }
    }
    
    return { metadata, content: markdownContent };
}

/**
 * Process blog markdown files and generate blogs.json, also update graph.json
 * @param {string} buildDir - Path to the build output directory
 */
async function processBlogPosts(buildDir) {
    const blogDir = path.join(__dirname, 'website', 'data', 'blog');
    const outputPath = path.join(buildDir, 'data', 'blogs.json');
    const graphPath = path.join(buildDir, 'data', 'graph.json');
    const staticBlogGenerator = new StaticBlogGenerator({
        siteRootDir: buildDir
    });
    
    try {
        const files = await fs.readdir(blogDir);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        
        const posts = [];
        
        for (const file of mdFiles) {
            const filePath = path.join(blogDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const { metadata, content: markdown } = parseMarkdownWithFrontmatter(content);
            
            const slug = path.basename(file, '.md');
            
            // Extract and process tags separately
            const tags = metadata.tags ? metadata.tags.split(',').map(t => t.trim()) : [];
            
            // Remove processed fields from metadata
            const { tags: _tags, title, date, author, ...extraMetadata } = metadata;
            
            posts.push({
                slug,
                title: title || slug,
                date: date || null,
                author: author || null,
                tags,
                content: markdown,
                ...extraMetadata
            });
        }
        
        // Sort by date descending (newest first)
        posts.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(b.date) - new Date(a.date);
        });
        
        await fs.writeFile(outputPath, JSON.stringify(posts, null, 2));
        console.log(`✓ Processed ${posts.length} blog post(s)`);
        
        // Update graph.json with blog nodes
        if (posts.length > 0) {
            await updateGraphWithBlogNodes(posts, graphPath);
        }

        await staticBlogGenerator.generate(posts);
        console.log('✓ Generated static blog pages');
        await generateRssFeed(posts, buildDir);
        return posts;
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('⚠ No blog directory found, skipping blog processing');
            await staticBlogGenerator.generate([]);
            console.log('✓ Generated empty static blog index');
            return [];
        } else {
            throw err;
        }
    }
}

/**
 * Update graph.json with blog post nodes
 * @param {Array} posts - Array of blog post objects
 * @param {string} graphPath - Path to graph.json
 */
async function updateGraphWithBlogNodes(posts, graphPath) {
    const graphData = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
    
    // Remove existing blog nodes and their connections
    graphData.nodes = graphData.nodes.filter(node => node.type !== 'blog_post');
    graphData.connections = graphData.connections.filter(conn => {
        const fromNode = graphData.nodes.find(n => n.id === conn.from.nodeId);
        const toNode = graphData.nodes.find(n => n.id === conn.to.nodeId);
        return fromNode && toNode;
    });
    
    const startX = 1500;
    const startY = 900;
    const horizontalSpacing = 700;
    const nodeWidth = 600;
    
    const blogNodes = [];
    const blogConnections = [];
    
    posts.forEach((post, index) => {
        const nodeId = `blog_${post.slug}`;
        const x = startX + (index * horizontalSpacing);
        
        const node = {
            id: nodeId,
            type: 'blog_post',
            title: post.title,
            blogSlug: post.slug,
            position: {
                x: x,
                y: startY
            },
            width: nodeWidth,
            inputs: index > 0 ? [{
                id: 'exec_in',
                name: 'Previous',
                direction: 'input',
                kind: 'exec'
            }] : [],
            outputs: index < posts.length - 1 ? [{
                id: 'exec_out',
                name: 'Next',
                direction: 'output',
                kind: 'exec'
            }] : []
        };
        
        blogNodes.push(node);
        
        // Create connection to next post
        if (index < posts.length - 1) {
            const nextNodeId = `blog_${posts[index + 1].slug}`;
            blogConnections.push({
                id: `blog_connection_${index}`,
                from: {
                    nodeId: nodeId,
                    pinId: 'exec_out'
                },
                to: {
                    nodeId: nextNodeId,
                    pinId: 'exec_in'
                },
                kind: 'exec'
            });
        }
    });
    
    // Add blog nodes and connections to graph
    graphData.nodes.push(...blogNodes);
    graphData.connections.push(...blogConnections);
    
    await fs.writeFile(graphPath, JSON.stringify(graphData, null, 2));
    console.log(`✓ Added ${blogNodes.length} blog node(s) to graph`);
}

/**
 * Bundle all JavaScript files into a single bundle.js using esbuild
 */
async function bundleJavaScript() {
    const entryPointMain = path.join(__dirname, 'website', 'scripts', 'main.js');
    const entryPointBlog = path.join(__dirname, 'website', 'scripts', 'blogPage.js');
    const outdir = path.join(__dirname, 'build', 'scripts');
    const scriptsDir = path.join(__dirname, 'build', 'scripts');
    
    try {
        await esbuild.build({
            entryPoints: [entryPointMain, entryPointBlog],
            bundle: true,
            outdir: outdir,
            entryNames: '[name].bundle',
            format: 'esm',
            platform: 'browser',
            target: 'es2022',
            minify: true,
            sourcemap: false,
        });
        
        console.log('✓ Bundled JavaScript with esbuild');
        
        // Remove all individual JS files except bundle.js
        async function removeJsFiles(dir) {
            const items = await fs.readdir(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stats = await fs.stat(fullPath);
                
                if (stats.isDirectory()) {
                    await removeJsFiles(fullPath);
                    // Remove empty directory
                    await fs.rmdir(fullPath);
                } else if (item.endsWith('.js') && !item.endsWith('.bundle.js')) {
                    await fs.unlink(fullPath);
                }
            }
        }
        
        await removeJsFiles(scriptsDir);
        console.log('✓ Removed individual JS files');
    } catch (error) {
        console.error('✗ JavaScript bundling failed:', error);
        throw error;
    }
}

// Copy files recursively from website to build
async function copyWebsiteFiles() {
    const websiteDir = path.join(__dirname, 'website');
    const buildDir = path.join(__dirname, 'build');
    
    console.log('Building site from website/ to build/...');
    
    async function copyRecursive(src, dest) {
        const stats = await fs.stat(src);
        
        if (stats.isDirectory()) {
            await fs.mkdir(dest, { recursive: true });
            const items = await fs.readdir(src);
            
            for (const item of items) {
                const srcPath = path.join(src, item);
                const destPath = path.join(dest, item);
                await copyRecursive(srcPath, destPath);
            }
        } else {
            await fs.copyFile(src, dest);
        }
    }
    
    try {
        // Clean build directory
        try {
            await fs.rm(buildDir, { recursive: true, force: true });
        } catch (err) {
            // Directory might not exist, that's okay
        }
        
        // Copy website files
        await copyRecursive(websiteDir, buildDir);
        console.log('✓ Build complete! Files copied to build/');
    } catch (error) {
        console.error('✗ Build failed:', error);
        process.exit(1);
    }
}

/**
 * Minify CSS files in the build directory
 */
async function minifyCSS() {
    const stylesDir = path.join(__dirname, 'build', 'styles');
    
    try {
        const files = await fs.readdir(stylesDir);
        const cssFiles = files.filter(f => f.endsWith('.css'));
        
        for (const file of cssFiles) {
            const filePath = path.join(stylesDir, file);
            const outputPath = filePath;
            
            execSync(`npx cleancss -o "${outputPath}" "${filePath}"`, {
                cwd: __dirname,
                stdio: 'pipe'
            });
        }
        
        console.log(`✓ Minified ${cssFiles.length} CSS file(s)`);
    } catch (error) {
        console.error('✗ CSS minification failed:', error);
        throw error;
    }
}

/**
 * Update HTML files to use bundled JavaScript
 */
async function updateHtmlForBundle() {
    const buildDir = path.join(__dirname, 'build');

    /**
     * @param {string} filePath
     * @returns {Promise<void>}
     */
    async function updateHtmlFile(filePath) {
        let html = await fs.readFile(filePath, 'utf-8');
    
        html = html.replace(
            /<script type="module" src="scripts\/main\.js"><\/script>/,
            '<script type="module" src="scripts/main.bundle.js"></script>'
        );

        html = html.replace(/src="\/scripts\/blogPage\.js"/g, 'src="/scripts/blogPage.bundle.js"');

        html = html.replace(
            /[ \t]*<!-- NAV_LINKS -->/g,
            renderNavLinkItems('            ')
        );
        
        await fs.writeFile(filePath, html);
    }

    /**
     * @param {string} dir
     * @returns {Promise<void>}
     */
    async function walkAndUpdateHtml(dir) {
        const items = await fs.readdir(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stats = await fs.stat(fullPath);
            if (stats.isDirectory()) {
                await walkAndUpdateHtml(fullPath);
                continue;
            }

            if (item.endsWith('.html')) {
                await updateHtmlFile(fullPath);
            }
        }
    }

    try {
        await walkAndUpdateHtml(buildDir);
        console.log('✓ Updated HTML to use JavaScript bundles');
    } catch (error) {
        console.error('✗ Failed to update HTML:', error);
        throw error;
    }
}

/**
 * Generates an RSS 2.0 feed from blog posts and writes it to build/rss.xml.
 *
 * @param {Array<{slug: string, title: string, date: string|null, author: string|null, content: string}>} posts
 * @param {string} buildDir
 * @returns {Promise<void>}
 */
async function generateRssFeed(posts, buildDir) {
    const siteUrl = 'https://lit.ruv.wtf';
    const feedUrl = `${siteUrl}/rss.xml`;

    /**
     * @param {string} str
     * @returns {string}
     */
    function xmlEscape(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    /**
     * Strips markdown syntax to produce plain-text for descriptions.
     *
     * @param {string} md
     * @returns {string}
     */
    function mdToPlain(md) {
        return (md || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            .replace(/!\[.*?\]\(.*?\)/g, '')
            .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
            .replace(/^[-*_]{3,}$/gm, '')
            .replace(/\n{2,}/g, ' ')
            .replace(/\n/g, ' ')
            .trim()
            .slice(0, 400);
    }

    const items = posts.map(post => {
        const url = `${siteUrl}/blog/${encodeURIComponent(post.slug)}/`;
        const pubDate = post.date ? new Date(post.date).toUTCString() : '';
        const description = xmlEscape(mdToPlain(post.content));
        return [
            '    <item>',
            `      <title>${xmlEscape(post.title || post.slug)}</title>`,
            `      <link>${url}</link>`,
            `      <guid isPermaLink="true">${url}</guid>`,
            pubDate ? `      <pubDate>${pubDate}</pubDate>` : '',
            post.author ? `      <author>${xmlEscape(post.author)}</author>` : '',
            `      <description>${description}</description>`,
            '    </item>',
        ].filter(Boolean).join('\n');
    });

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        '    <title>lit.ruv.wtf</title>',
        `    <link>${siteUrl}</link>`,
        '    <description>Blog posts from lit.ruv.wtf</description>',
        '    <language>en-us</language>',
        `    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />`,
        ...items,
        '  </channel>',
        '</rss>',
    ].join('\n');

    await fs.writeFile(path.join(buildDir, 'rss.xml'), xml, 'utf-8');
    console.log('✓ Generated RSS feed');
}

/**
 * Generates a sitemap.xml from static routes and blog posts.
 *
 * @param {Array<{slug: string, date: string|null}>} posts
 * @param {string} buildDir
 * @returns {Promise<void>}
 */
async function generateSitemap(posts, buildDir) {
    const siteUrl = 'https://lit.ruv.wtf';
    const today = new Date().toISOString().slice(0, 10);

    /**
     * @param {string} loc
     * @param {{ lastmod?: string, priority?: string }} opts
     * @returns {string}
     */
    function urlEntry(loc, { lastmod = today, priority = '0.80' } = {}) {
        return [
            '    <url>',
            `        <loc>${loc}</loc>`,
            `        <lastmod>${lastmod}</lastmod>`,
            `        <priority>${priority}</priority>`,
            '    </url>',
        ].join('\n');
    }

    const staticEntries = [
        urlEntry(`${siteUrl}/`, { priority: '1.00' }),
        urlEntry(`${siteUrl}/blog.html`, { priority: '0.90' }),
        urlEntry(`${siteUrl}/docs/sitemap.xml`, { priority: '0.80' }),
        urlEntry(`${siteUrl}/materials/`, { priority: '0.80' }),
    ];

    const postEntries = posts.map(post => {
        const lastmod = post.date ? new Date(post.date).toISOString().slice(0, 10) : today;
        return urlEntry(`${siteUrl}/blog/${encodeURIComponent(post.slug)}/`, { lastmod, priority: '0.50' });
    });

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9',
        '        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
        ...staticEntries,
        ...postEntries,
        '</urlset>',
    ].join('\n');

    await fs.writeFile(path.join(buildDir, 'sitemap.xml'), xml, 'utf-8');
    console.log(`✓ Generated sitemap with ${staticEntries.length + postEntries.length} URL(s)`);
}

// Run the build
async function build() {
    const buildDir = path.join(__dirname, 'build');
    await copyWebsiteFiles();
    const posts = await processBlogPosts(buildDir);
    await generateSitemap(posts, buildDir);
    await bundleJavaScript();
    await minifyCSS();
    await updateHtmlForBundle();
    
    // Report final sizes
    console.log('\n=== Build Summary ===');
    const mainBundleStats = await fs.stat(path.join(__dirname, 'build', 'scripts', 'main.bundle.js'));
    const blogBundleStats = await fs.stat(path.join(__dirname, 'build', 'scripts', 'blogPage.bundle.js'));
    const cssStats = await fs.stat(path.join(__dirname, 'build', 'styles', 'main.css'));
    console.log(`main.bundle.js: ${(mainBundleStats.size / 1024).toFixed(2)} KB`);
    console.log(`blogPage.bundle.js: ${(blogBundleStats.size / 1024).toFixed(2)} KB`);
    console.log(`main.css:  ${(cssStats.size / 1024).toFixed(2)} KB`);
    console.log('=====================\n');
}

build();
