function formatDate(t) {
    return new Date(t).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getRandomRotation() {
    return 3 * Math.random() - 1.5;
}

// Post-it note colors
const postItColors = [
    '#E6F3FF', // faded blue
    '#FFF9C4', // yellow
    '#E8F5E8', // green
    '#FFE4B5', // orange
    '#FFE1E6'  // pink
];

function getRandomPostItColor() {
    return postItColors[Math.floor(Math.random() * postItColors.length)];
}

function getPostItColorByDate(dateString) {
    // Create a simple hash from the date string
    let hash = 0;
    for (let i = 0; i < dateString.length; i++) {
        hash = ((hash << 5) - hash) + dateString.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Use absolute value and modulo to get color index
    const colorIndex = Math.abs(hash) % postItColors.length;
    return postItColors[colorIndex];
}

// Global variable to track last user-set volume (default to 1)
let lastMediaVolume = 1;

function createPost(t) {
    const post = document.createElement("div");
    post.className = "post";
    post.style.transform = `rotate(${getRandomRotation()}deg)`;
    post.style.backgroundColor = getPostItColorByDate(t.createdAt);

    // --- Shrink-then-grow hover effect ---
    post.addEventListener('mouseenter', function () {
        post.style.zIndex = 100;
        post.style.transition = "transform 0.22s cubic-bezier(.5,1.5,.5,1)";
        post.style.transform = `rotate(${getRandomRotation()}deg) scale(1.1)`;
    });
    post.addEventListener('mouseleave', function () {
        post.style.transition = "transform 0.18s cubic-bezier(.5,0,.5,1)";
        post.style.transform = `rotate(${getRandomRotation()}deg)`;
        post.style.zIndex = 1;
    });
    // --- end hover effect ---

    const link = document.createElement("a");
    link.href = t.url;
    link.target = "_blank";
    link.style.textDecoration = "none";

    // --- EMBED HTML (images and videos) ---
    let embedHtml = "";
    if (t.embed && t.embed.length > 0) {
        embedHtml = t.embed.map((embed, idx) => {
            if (embed.type === "image") {
                // Image embed
                return `
                    <a href="${embed.url}" target="_blank">
                        <img class="image-placeholder" src="${embed.url}" alt="${embed.alt || "Image"}" style="width: 100%;" data-fullres="${embed.fullres || embed.url}" />
                    </a>
                `;
            } else if (embed.type === "video") {
                // Video embed
                // Use a data attribute for m3u8 playlist, set src only if not m3u8
                const isM3u8 = embed.playlist && embed.playlist.endsWith('.m3u8');
                return `
                    <video 
                        class="video-embed"
                        ${isM3u8 ? `data-hls-src="${embed.playlist}"` : `src="${embed.playlist}"`}
                        poster="${embed.thumbnail || ""}" 
                        controls 
                        style="width: 100%; max-height: 60vh; margin: 12px 0; background: #000; border-radius: 8px;"
                        preload="none"
                    >
                        Sorry, your browser doesn't support embedded videos.
                    </video>
                `;
            }
            // ...other embed types can be handled here...
            return "";
        }).join("");
    }

    const textHtml = t.text.replace(/\n/g, "<br>");

    post.innerHTML = `
        <div class="post-header">
            <div class="avatar">
                <img src="${t.avatar}" alt="${t.author}" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>
            <div>
                <div style="font-weight: bold;">${t.author} (@${t.handle})</div>
                <div style="font-size: 0.875rem; color: #666;">
                    ${formatDate(t.createdAt)}
                </div>
            </div>
        </div>
        <div class="post-content">${textHtml}</div>
        ${embedHtml}
        <div class="post-actions">
            <button class="action-btn like">♥ ${t.likes}</button>
            <button class="action-btn repost">⟲ ${t.reposts}</button>
        </div>
    `;

    // Add shadowbox event to images (after DOM is ready)
    setTimeout(() => {
        const imgs = post.querySelectorAll('img');
        imgs.forEach(img => {
            img.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                createShadowbox(post, img);
            });
        });

        // --- HLS.js video support for .m3u8 ---
        const videos = post.querySelectorAll('video[data-hls-src],video.video-embed');
        videos.forEach(video => {
            // Set initial volume to lastMediaVolume
            video.volume = lastMediaVolume;

            // Prevent drag-selection when interacting with video controls (esp. volume)
            video.addEventListener('mousedown', function (e) {
                // Only prevent drag if the event is on the controls bar (not the video area)
                // This is a best-effort: always prevent drag for any mousedown on video controls
                e.stopPropagation();
            });

            // Listen for volume changes and sync to all players
            video.addEventListener('volumechange', function () {
                if (!isNaN(video.volume)) {
                    lastMediaVolume = video.volume;
                    // Sync all other videos on the page
                    document.querySelectorAll('video.video-embed').forEach(v => {
                        if (v !== video && Math.abs(v.volume - lastMediaVolume) > 0.01) {
                            v.volume = lastMediaVolume;
                        }
                    });
                }
            });
        });

        // HLS.js setup for m3u8
        const hlsVideos = post.querySelectorAll('video[data-hls-src]');
        if (hlsVideos.length > 0 && window.Hls) {
            hlsVideos.forEach(video => {
                const src = video.getAttribute('data-hls-src');
                if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = src;
                } else if (window.Hls.isSupported()) {
                    const hls = new window.Hls();
                    hls.loadSource(src);
                    hls.attachMedia(video);
                } else {
                    video.outerHTML = '<div style="color:red;padding:1em;text-align:center;">Video format not supported</div>';
                }
            });
        }
        // --- end HLS.js support ---
    }, 0);

    link.href = t.url;
    link.appendChild(post);
    
    console.log(`[Main] Created post with ${t.embed.length} embeds`);
    
    return link;
}

// --- Shadowbox Modal with Smooth Animation ---
function createShadowbox(postEl, imgEl) {
    // Remove any existing shadowbox
    const existing = document.getElementById('shadowbox-modal');
    if (existing) existing.remove();

    // Clone the post node
    const modal = document.createElement('div');
    modal.id = 'shadowbox-modal';
    modal.style.position = 'fixed';
    modal.style.top = 0;
    modal.style.left = 0;
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.0)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'flex-end'; // print from bottom
    modal.style.justifyContent = 'center';
    modal.style.zIndex = 9999;
    modal.style.cursor = 'zoom-out';
    modal.style.transition = 'background 0.35s cubic-bezier(.5,1.5,.5,1)';

    // Container for the post
    const postClone = postEl.cloneNode(true);
    postClone.style.transform = 'translateY(100vh) scale(0.98)';
    postClone.style.background = postEl.style.backgroundColor || '#fff';
    postClone.style.maxWidth = '95vw';
    postClone.style.maxHeight = '90vh';
    postClone.style.overflow = 'auto';
    postClone.style.position = 'relative';
    postClone.style.zIndex = 10001;
    postClone.style.cursor = 'default';
    postClone.style.opacity = '0';
    postClone.style.transition = 'opacity 0.25s cubic-bezier(.5,1.5,.5,1), transform 0.5s cubic-bezier(.5,1.5,.5,1)';

    // Remove tape elements from the shadowbox
    const tapeElements = postClone.querySelectorAll('.tape');
    tapeElements.forEach(tape => tape.remove());

    // Focus on the clicked image: zoom it in
    const imgs = postClone.querySelectorAll('img');
    const originalImgs = postEl.querySelectorAll('img');
    let focusedImg = null;
    let clickedImageIndex = -1;
    
    // Find the index of the clicked image in the original post
    originalImgs.forEach((originalImg, idx) => {
        if (originalImg === imgEl) {
            clickedImageIndex = idx;
        }
    });

    imgs.forEach((cloneImg, idx) => {
        // Always use the full-size image for all images in the modal
        if (cloneImg.classList.contains('image-placeholder')) {
            const fullSizeUrl = getFullSizeImageUrl(cloneImg.src);
            cloneImg.src = fullSizeUrl;
            // Apply modal styles to all images immediately
            cloneImg.style.maxWidth = '90vw';
            cloneImg.style.maxHeight = '80vh';
            cloneImg.style.width = '';
            cloneImg.style.objectFit = 'contain';
            cloneImg.style.display = 'block';
            cloneImg.style.margin = '24px auto';
            cloneImg.style.opacity = 1;
        }
        // Use index matching instead of URL comparison
        if (idx === clickedImageIndex && cloneImg.classList.contains('image-placeholder')) {
            focusedImg = cloneImg;
        }
    });

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '10px';
    closeBtn.style.right = '16px';
    closeBtn.style.fontSize = '2rem';
    closeBtn.style.background = 'rgba(0,0,0,0.2)';
    closeBtn.style.color = '#fff';
    closeBtn.style.border = 'none';
    closeBtn.style.width = '40px';
    closeBtn.style.height = '40px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.zIndex = 10002;
    closeBtn.style.transition = 'background 0.2s';
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = 'rgba(0,0,0,0.5)');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = 'rgba(0,0,0,0.2)');
    closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        closeShadowbox();
    });
    postClone.appendChild(closeBtn);

    // Prevent click inside post from closing modal
    postClone.addEventListener('click', e => e.stopPropagation());

    modal.appendChild(postClone);

    // Click outside closes modal
    modal.addEventListener('click', closeShadowbox);

    document.body.appendChild(modal);

    // --- Animate modal background and post "printing" from bottom ---
    setTimeout(() => {
        modal.style.background = 'rgba(0,0,0,0.7)';
        postClone.style.transform = 'translateY(0) scale(1)';
        postClone.style.opacity = '1';
    }, 10);

    // Scroll to focused image smoothly after animation
    setTimeout(() => {
        if (focusedImg) {
            focusedImg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 400);

    // Animate out and remove
    function closeShadowbox() {
        modal.style.background = 'rgba(0,0,0,0.0)';
        postClone.style.transform = 'translateY(100vh) scale(0.98)';
        postClone.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
        }, 350);
    }

    // Escape key closes modal
    function escListener(e) {
        if (e.key === 'Escape') {
            closeShadowbox();
            window.removeEventListener('keydown', escListener);
        }
    }
    window.addEventListener('keydown', escListener);

    // --- Snap scroll to next image in post on scroll ---
    let lastFocusedIdx = Array.from(imgs).findIndex(cloneImg => cloneImg === focusedImg);
    let snapTimeout = null;
    let isInitialScroll = true;
    
    // Disable initial scroll detection after the automatic scroll completes
    setTimeout(() => {
        isInitialScroll = false;
    }, 800);
    
    postClone.addEventListener('scroll', () => {
        // Skip scroll detection during initial automatic scroll
        if (isInitialScroll) return;
        
        // Find the image closest to the center of the viewport
        let modalRect = postClone.getBoundingClientRect();
        let modalCenter = modalRect.top + modalRect.height / 2;

        // Find all images whose center is within a threshold of the modal center
        let candidates = [];
        imgs.forEach((img, idx) => {
            const rect = img.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const dist = Math.abs(center - modalCenter);
            candidates.push({ idx, dist, center, rect });
        });

        // Sort by distance to center
        candidates.sort((a, b) => a.dist - b.dist);

        // If the closest image is not the current, and its center is within 15% of its height from modal center, focus it
        let best = candidates[0];
        if (
            best.idx !== lastFocusedIdx &&
            best.dist < best.rect.height * 0.75
        ) {
            // Just update the lastFocusedIdx and scroll, don't change styles
            lastFocusedIdx = best.idx;
            // Snap scroll after short delay
            if (snapTimeout) clearTimeout(snapTimeout);
            snapTimeout = setTimeout(() => {
                imgs[lastFocusedIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 60);
        }
    });
}

// Helper function to convert thumbnail URL to full-size URL
function getFullSizeImageUrl(thumbUrl) {
    if (!thumbUrl) return thumbUrl;
    // Convert Bluesky thumbnail URLs to full-size by removing size parameters
    return thumbUrl.replace(/@jpeg$/, '').replace(/\?.*$/, '');
}

function filterOriginalPosts(feed) {
    return feed.filter(item => {
        const isRepost = item?.reason?.$type === "app.bsky.feed.defs#reasonRepost";
        const isReply = item?.post?.record?.reply;
        return !isRepost && !isReply;
    });
}

let postElementsCache = null;

function createColumns(num) {
    const postsContainer = document.getElementById("posts");
    postsContainer.innerHTML = "";
    const columns = [];
    for (let i = 0; i < num; i++) {
        const col = document.createElement("div");
        col.className = "masonry-col";
        postsContainer.appendChild(col);
        columns.push(col);
    }
    return columns;
}

function getNumColumns() {
    if (window.innerWidth >= 1200) return 3;
    if (window.innerWidth >= 800) return 2;
    return 1;
}

function getShortestColumn(columns) {
    let minHeight = columns[0].offsetHeight;
    let minCol = columns[0];
    for (const col of columns) {
        if (col.offsetHeight < minHeight) {
            minHeight = col.offsetHeight;
            minCol = col;
        }
    }
    return minCol;
}

function layoutPosts(postElements) {
    // Prevent layout if any video is in fullscreen
    if (document.fullscreenElement && document.fullscreenElement.tagName === "VIDEO") {
        console.log('[Main] Skipping layoutPosts: video is fullscreen');
        return;
    }
    const numCols = getNumColumns();
    const columns = createColumns(numCols);
    postElements.forEach((postEl, index) => {
        const col = getShortestColumn(columns);
        // Set descending z-index - first post has highest z-index
        postEl.firstElementChild.style.zIndex = postElements.length - index;
        col.appendChild(postEl);
    });
    
    // Use refreshTape to avoid duplicate tape on resize/layout
    console.log('[Main] Posts laid out, refreshing tape for all images');
    setTimeout(() => {
        if (window.refreshTape) {
            window.refreshTape();
        } else {
            console.error('[Main] refreshTape function not available');
        }
    }, 200);
}

async function fetchPosts() {
    try {
        const res = await fetch(
            "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=lit.mates.dev&limit=20&filter=posts_no_replies"
        );
        if (!res.ok) throw new Error("Failed to fetch posts");
        const data = await res.json();

        const posts = filterOriginalPosts(data.feed).map(item => {
            // --- EMBED HANDLING ---
            let embeds = [];
            const embedObj = item.post.embed;
            if (embedObj) {
                // Debug output (optional)
                // console.log("[Main] Post embed:", embedObj);
                // console.log("[Main] Embed $type:", embedObj.$type);

                if (embedObj.$type === "app.bsky.embed.images#view" && Array.isArray(embedObj.images)) {
                    embeds = embedObj.images.map(img => ({
                        type: "image",
                        url: img.thumb,
                        alt: img.alt || "",
                        fullres: img.fullsize || img.full || img.thumb // fallback to thumb if no fullres
                    }));
                } else if (embedObj.$type === "app.bsky.embed.video#view") {
                    embeds = [{
                        type: "video",
                        playlist: embedObj.playlist,
                        thumbnail: embedObj.thumbnail,
                        alt: embedObj.alt || "",
                        aspectRatio: embedObj.aspectRatio || null
                    }];
                }
                // Optionally handle other embed types (external, record, etc) here
            }

            return {
                author: item.post.author.displayName,
                handle: item.post.author.handle,
                avatar: item.post.author.avatar,
                createdAt: item.post.record.createdAt,
                text: item.post.record.text,
                likes: item.post.likeCount || 0,
                reposts: item.post.repostCount || 0,
                url: `https://bsky.app/profile/${item.post.author.handle}/post/${item.post.uri.split("/").pop()}`,
                embed: embeds
            };
        });

        console.log(`[Main] Fetched ${posts.length} posts, ${posts.filter(p => p.embed.some(e => e.type === "image")).length} have images, ${posts.filter(p => p.embed.some(e => e.type === "video")).length} have videos`);

        // Only create post elements once
        postElementsCache = posts.map(post => createPost(post));
        // Preload images
        await Promise.all(postElementsCache.map(el => {
            const imgs = el.querySelectorAll("img");
            if (!imgs.length) return Promise.resolve();
            return Promise.all(Array.from(imgs).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(res => {
                    img.onload = img.onerror = res;
                });
            }));
        }));

        layoutPosts(postElementsCache);

    } catch (err) {
        console.error("Error fetching posts:", err);
    }
}

// Only re-layout on resize, do not re-fetch or re-create posts
window.addEventListener("resize", () => {
    // Prevent layout if any video is in fullscreen
    if (document.fullscreenElement && document.fullscreenElement.tagName === "VIDEO") {
        console.log('[Main] Skipping resize layout: video is fullscreen');
        return;
    }
    if (postElementsCache) {
        layoutPosts(postElementsCache);
        // Re-add tape after layout changes
        if (window.refreshTape) {
            setTimeout(() => {
                window.refreshTape();
            }, 100);
        }
    }
});

fetchPosts();