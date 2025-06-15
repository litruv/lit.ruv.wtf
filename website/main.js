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

function createPost(t) {
    const post = document.createElement("div");
    post.className = "post";
    post.style.transform = `rotate(${getRandomRotation()}deg)`;
    post.style.backgroundColor = getRandomPostItColor();

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

    const embedHtml = t.embed.length > 0
        ? t.embed.map(img =>
            `
            <a href="${img.url}" target="_blank">
                <img class="image-placeholder" src="${img.url}" alt="${img.alt || "Image"}" style="width: 100%;" data-fullres="${img.fullres || img.url}" />
            </a>
        `
        ).join("")
        : "";

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
    }, 0);

    link.href = t.url;
    link.appendChild(post);
    
    console.log(`[Main] Created post with ${t.embed.length} images`);
    
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

        const posts = filterOriginalPosts(data.feed).map(item => ({
            author: item.post.author.displayName,
            handle: item.post.author.handle,
            avatar: item.post.author.avatar,
            createdAt: item.post.record.createdAt,
            text: item.post.record.text,
            likes: item.post.likeCount || 0,
            reposts: item.post.repostCount || 0,
            url: `https://bsky.app/profile/${item.post.author.handle}/post/${item.post.uri.split("/").pop()}`,
            embed: item.post.embed?.images?.map(img => ({
                url: img.thumb,
                alt: img.alt || "",
                fullres: img.fullsize || img.full || img.thumb // fallback to thumb if no fullres
            })) || []
        }));

        console.log(`[Main] Fetched ${posts.length} posts, ${posts.filter(p => p.embed.length > 0).length} have images`);

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