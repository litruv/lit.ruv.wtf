const fs = require('fs').promises;
const path = require('path');

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
 */
async function processBlogPosts() {
    const blogDir = path.join(__dirname, 'website', 'data', 'blog');
    const outputPath = path.join(__dirname, 'website', 'data', 'blogs.json');
    const graphPath = path.join(__dirname, 'website', 'data', 'graph.json');
    
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
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('⚠ No blog directory found, skipping blog processing');
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

// Run the build
async function build() {
    await processBlogPosts();
    await copyWebsiteFiles();
}

build();
