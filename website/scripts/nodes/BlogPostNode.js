/**
 * @file BlogPostNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';

/**
 * @UCLASS(BlueprintType)
 * Displays a blog post with metadata (title, date, author) and markdown content.
 */
export class BlogPostNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "blog_post";

    /**
     * @UFUNCTION(BlueprintPure)
     */
    static BlueprintPure_GetDefaultPins() {
        return {
            inputs: [],
            outputs: []
        };
    }

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     * @param {import('./NodeRenderContext.js').NodeRenderContext} renderCtx
     */
    BlueprintNativeEvent_OnRender(article, graphNode, renderCtx) {
        const body = document.createElement("div");
        body.className = "node-body";
        body.setAttribute("aria-live", "polite");

        // Load blog data
        const loadBlogData = async () => {
            try {
                const response = await fetch('data/blogs.json');
                const blogs = await response.json();
                
                // Find the blog post by slug
                const post = blogs.find(b => b.slug === graphNode.blogSlug);
                
                if (!post) {
                    body.innerHTML = `<p style="color: #ff6b6b;">Blog post "${graphNode.blogSlug}" not found.</p>`;
                    return;
                }

                // Render metadata header
                const metaDiv = document.createElement("div");
                metaDiv.className = "blog-meta";
                metaDiv.style.cssText = "margin-bottom: 1em; padding-bottom: 0.5em; border-bottom: 1px solid rgba(255,255,255,0.1);";
                
                if (post.title) {
                    const titleEl = document.createElement("a");
                    titleEl.href = `/blog/${encodeURIComponent(post.slug)}/`;
                    titleEl.textContent = post.title;
                    titleEl.style.cssText = "display:block; margin: 0 0 0.5em 0; font-size: 1.5em; color: inherit; text-decoration: none;";
                    titleEl.addEventListener('mouseenter', () => titleEl.style.textDecoration = 'underline');
                    titleEl.addEventListener('mouseleave', () => titleEl.style.textDecoration = 'none');
                    metaDiv.appendChild(titleEl);
                }
                
                const metaInfo = [];
                if (post.date) {
                    const dateObj = new Date(post.date);
                    metaInfo.push(`📅 ${dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
                }
                if (post.author) {
                    metaInfo.push(`✍️ ${post.author}`);
                }
                
                if (metaInfo.length > 0) {
                    const infoEl = document.createElement("a");
                    infoEl.href = `/blog/${encodeURIComponent(post.slug)}/`;
                    infoEl.style.cssText = "display:block; color: rgba(255,255,255,0.6); font-size: 0.9em; text-decoration: none;";
                    infoEl.textContent = metaInfo.join(' • ');
                    infoEl.addEventListener('mouseenter', () => infoEl.style.textDecoration = 'underline');
                    infoEl.addEventListener('mouseleave', () => infoEl.style.textDecoration = 'none');
                    metaDiv.appendChild(infoEl);
                }
                
                if (post.tags && post.tags.length > 0) {
                    const tagsDiv = document.createElement("div");
                    tagsDiv.style.cssText = "margin-top: 0.5em;";
                    post.tags.forEach(tag => {
                        const tagEl = document.createElement("span");
                        tagEl.textContent = `#${tag}`;
                        tagEl.style.cssText = "display: inline-block; margin-right: 0.5em; padding: 0.2em 0.5em; background: rgba(100,150,255,0.2); border-radius: 3px; font-size: 0.85em;";
                        tagsDiv.appendChild(tagEl);
                    });
                    metaDiv.appendChild(tagsDiv);
                }
                
                body.appendChild(metaDiv);

                // Render markdown content directly
                const contentDiv = document.createElement("div");
                contentDiv.className = "blog-content";
                body.appendChild(contentDiv);
                
                // Import and use MarkdownRenderer directly
                const { MarkdownRenderer } = await import('../MarkdownRenderer.js');
                contentDiv.innerHTML = MarkdownRenderer.render(post.content);
                MarkdownRenderer.applyImageScale(contentDiv);
                
                // Add copy button handlers
                contentDiv.querySelectorAll('.md-copy-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const code = btn.getAttribute('data-code');
                        if (code) {
                            navigator.clipboard.writeText(code).then(() => {
                                const originalText = btn.textContent;
                                btn.textContent = '✓';
                                btn.classList.add('copied');
                                setTimeout(() => {
                                    btn.textContent = originalText;
                                    btn.classList.remove('copied');
                                }, 2000);
                            }).catch(err => {
                                console.error('Failed to copy:', err);
                            });
                        }
                    });
                });
                
            } catch (error) {
                body.innerHTML = `<p style="color: #ff6b6b;">Error loading blog post: ${error.message}</p>`;
                console.error('Failed to load blog post:', error);
            }
        };

        article.appendChild(body);
        loadBlogData();
    }
}

NodeRegistry.UCLASS_Register(BlogPostNode);
