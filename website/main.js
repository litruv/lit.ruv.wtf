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
    let hash = 0;
    for (let i = 0; i < dateString.length; i++) {
        hash = ((hash << 5) - hash) + dateString.charCodeAt(i);
        hash = hash & hash;
    }
    const colorIndex = Math.abs(hash) % postItColors.length;
    return postItColors[colorIndex];
}

let lastMediaVolume = 1;

// Define attachHoverListeners function
function attachHoverListeners(postElement) {
    const baseRotation = postElement.style.getPropertyValue('--post-rotation');

    postElement.addEventListener('mouseenter', function () {
        postElement.style.zIndex = 100;
        postElement.style.transition = "transform 0.22s cubic-bezier(.5,1.5,.5,1), box-shadow 0.22s cubic-bezier(.5,1.5,.5,1)";
        postElement.style.transform = `rotate(${getRandomRotation()}deg) scale(1.1)`;
    });

    postElement.addEventListener('mouseleave', function () {
        postElement.style.transition = "transform 0.18s cubic-bezier(.5,0,.5,1), box-shadow 0.18s cubic-bezier(.5,0,.5,1)";
        postElement.style.transform = `rotate(${baseRotation || '0deg'}) scale(1)`;
        postElement.style.zIndex = 1;
    });
}

function createPost(t) {
    const post = document.createElement("div");
    post.className = "post";
    post.style.transform = `rotate(${getRandomRotation()}deg)`;
    post.style.backgroundColor = getPostItColorByDate(t.createdAt);

    const link = document.createElement("a");
    link.href = t.url;
    link.target = "_blank";
    link.style.textDecoration = "none";

    let embedHtml = "";
    if (t.embed && t.embed.length > 0) {
        embedHtml = t.embed.map((embed, idx) => {
            if (embed.type === "image") {
                return `
                    <a href="${embed.url}" target="_blank">
                        <img class="image-placeholder" src="${embed.url}" alt="${embed.alt || "Image"}" data-fullres="${embed.fullres || embed.url}" />
                    </a>
                `;
            } else if (embed.type === "video") {
                const isM3u8 = embed.playlist && embed.playlist.endsWith('.m3u8');
                return `
                    <div class="video-embed-container">
                        <video 
                            class="video-embed"
                            ${isM3u8 ? `data-hls-src="${embed.playlist}"` : `src="${embed.playlist}"`}
                            poster="${embed.thumbnail || ""}" 
                            controls
                            preload="metadata"
                            tabindex="0"
                        >
                            Sorry, your browser doesn't support embedded videos.
                        </video>
                    </div>
                `;
            }
            return "";
        }).join("");
    }

    function linkifyText(text, highlightColor) {
        text = text.replace(/(^|[\s.,;:!?])#([a-zA-Z0-9_]{2,50})\b/g, (m, pre, tag) =>
            `${pre}<span class="hashtag" style="--hashtag-bg:${highlightColor};">#${tag}</span>`
        );
        text = text.replace(/(^|[\s.,;:!?])@([a-zA-Z0-9_.-]+\.[a-zA-Z0-9_.-]+)/g, (m, pre, handle) =>
            `${pre}<span class="mention"><b>@${handle}</b></span>`
        );
        return text;
    }

    function getHighlighterColor(cardColor) {
        if (cardColor === '#E6F3FF') return '#ffb7ce';
        if (cardColor === '#FFF9C4') return '#b7e0fd';
        if (cardColor === '#E8F5E8') return '#fff89a';
        if (cardColor === '#FFE4B5') return '#b6fcb6';
        if (cardColor === '#FFE1E6') return '#ffd59e';
        return '#fff89a';
    }

    const cardColor = getPostItColorByDate(t.createdAt);
    const highlightColor = getHighlighterColor(cardColor);

    const textHtml = linkifyText(t.text, highlightColor).replace(/\n/g, "<br>");

    post.innerHTML = `
        <div class="post-header">
            <div class="avatar">
                <img src="${t.avatar}" alt="${t.author}" />
            </div>
            <div>
                <div class="post-author">${t.author} (@${t.handle})</div>
                <div class="post-date">
                    ${formatDate(t.createdAt)}
                </div>
            </div>
        </div>
        <div class="post-content">${textHtml}</div>
        ${embedHtml}
        <div class="post-actions">
            <button class="action-btn like">♥ ${t.likes}</button>
            <button class="action-btn repost">⟲ ${t.reposts}</button>
            <button class="action-btn comment">↳ ${t.comments}</button>
        </div>
    `;

    setTimeout(() => {
        const imgs = post.querySelectorAll('img');
        imgs.forEach(img => {
            img.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                createShadowbox(post, img);
            });
        });

        post.querySelectorAll('.video-embed-container').forEach(container => {
            const video = container.querySelector('video');
            if (!video) return;

            video.volume = lastMediaVolume;

            video.addEventListener('mousedown', function (e) {
                e.stopPropagation();
            });

            video.addEventListener('volumechange', function () {
                if (!isNaN(video.volume)) {
                    lastMediaVolume = video.volume;
                    document.querySelectorAll('video.video-embed').forEach(v => {
                        if (v !== video && Math.abs(v.volume - lastMediaVolume) > 0.01) {
                            v.volume = lastMediaVolume;
                        }
                    });
                }
            });

            video.addEventListener('play', function () {
                document.querySelectorAll('video.video-embed').forEach(v => {
                    if (v !== video && !v.paused) {
                        v.pause();
                    }
                });
            });

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting && !video.paused) {
                        video.pause();
                    }
                });
            }, {
                threshold: 0.25
            });
            observer.observe(video);
        });

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
    }, 0);

    link.href = t.url;
    link.appendChild(post);
    
    return link;
}

function createShadowbox(postEl, imgEl) {
    const existing = document.getElementById('shadowbox-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'shadowbox-modal';
    modal.className = 'shadowbox-modal';

    const postClone = postEl.cloneNode(true);
    postClone.className += ' shadowbox-post';
    postClone.style.background = postEl.style.backgroundColor || '#fff';

    const tapeElements = postClone.querySelectorAll('.tape');
    tapeElements.forEach(tape => tape.remove());

    const imgs = postClone.querySelectorAll('img');
    const originalImgs = postEl.querySelectorAll('img');
    let focusedImg = null;
    let clickedImageIndex = -1;
    
    originalImgs.forEach((originalImg, idx) => {
        if (originalImg === imgEl) {
            clickedImageIndex = idx;
        }
    });

    imgs.forEach((cloneImg, idx) => {
        if (cloneImg.classList.contains('image-placeholder')) {
            const fullSizeUrl = getFullSizeImageUrl(cloneImg.src);
            cloneImg.src = fullSizeUrl;
            cloneImg.className += ' shadowbox-image';
        }
        if (idx === clickedImageIndex && cloneImg.classList.contains('image-placeholder')) {
            focusedImg = cloneImg;
        }
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'shadowbox-close';
    closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        closeShadowbox();
    });
    postClone.appendChild(closeBtn);

    postClone.addEventListener('click', e => e.stopPropagation());
    modal.appendChild(postClone);
    modal.addEventListener('click', closeShadowbox);
    document.body.appendChild(modal);

    setTimeout(() => {
        modal.classList.add('visible');
        postClone.classList.add('visible');
    }, 10);

    setTimeout(() => {
        if (focusedImg) {
            focusedImg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 400);

    function closeShadowbox() {
        modal.classList.remove('visible');
        postClone.classList.remove('visible');
        setTimeout(() => {
            modal.remove();
        }, 350);
    }

    function escListener(e) {
        if (e.key === 'Escape') {
            closeShadowbox();
            window.removeEventListener('keydown', escListener);
        }
    }
    window.addEventListener('keydown', escListener);

    let lastFocusedIdx = Array.from(imgs).findIndex(cloneImg => cloneImg === focusedImg);
    let snapTimeout = null;
    let isInitialScroll = true;
    
    setTimeout(() => {
        isInitialScroll = false;
    }, 800);
    
    postClone.addEventListener('scroll', () => {
        if (isInitialScroll) return;
        
        let modalRect = postClone.getBoundingClientRect();
        let modalCenter = modalRect.top + modalRect.height / 2;

        let candidates = [];
        imgs.forEach((img, idx) => {
            const rect = img.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const dist = Math.abs(center - modalCenter);
            candidates.push({ idx, dist, center, rect });
        });

        candidates.sort((a, b) => a.dist - b.dist);

        let best = candidates[0];
        if (
            best.idx !== lastFocusedIdx &&
            best.dist < best.rect.height * 0.75
        ) {
            lastFocusedIdx = best.idx;
            if (snapTimeout) clearTimeout(snapTimeout);
            snapTimeout = setTimeout(() => {
                imgs[lastFocusedIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 60);
        }
    });
}

function getFullSizeImageUrl(thumbUrl) {
    if (!thumbUrl) return thumbUrl;
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
let layoutColumns = null;
let postQueue = [];
let isProcessingQueue = false;
let currentNumColumns = 0; // Variable to store the current number of columns

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
    let minHeight = Infinity;
    let shortestColumns = [];
    
    // Find all columns with the minimum height
    for (const col of columns) {
        const height = col.offsetHeight;
        if (height < minHeight) {
            minHeight = height;
            shortestColumns = [col];
        } else if (height === minHeight) {
            shortestColumns.push(col);
        }
    }
    
    // If multiple columns have the same height, prefer the middle one
    if (shortestColumns.length > 1) {
        const middleIndex = Math.floor(columns.length / 2);
        const middleColumn = columns[middleIndex];
        if (shortestColumns.includes(middleColumn)) {
            return middleColumn;
        }
        // If middle column isn't shortest, return the one closest to middle
        let closestToMiddle = shortestColumns[0];
        let minDistance = Math.abs(columns.indexOf(closestToMiddle) - middleIndex);
        
        for (const col of shortestColumns) {
            const distance = Math.abs(columns.indexOf(col) - middleIndex);
            if (distance < minDistance) {
                minDistance = distance;
                closestToMiddle = col;
            }
        }
        return closestToMiddle;
    }
    
    return shortestColumns[0];
}

function addPostToLayout(postEl, zIndex) {
    if (!layoutColumns) return;
    
    const col = getShortestColumn(layoutColumns);
    const postDiv = postEl.firstElementChild; 
    
    const currentTransform = postDiv.style.transform;
    const rotationMatch = currentTransform.match(/rotate\(([-\d.]+deg)\)/);
    const rotation = rotationMatch ? rotationMatch[1] : '0deg';
    
    postDiv.style.setProperty('--post-rotation', rotation); 
    postDiv.style.zIndex = zIndex;
    
    postDiv.classList.add('loading');
    
    col.appendChild(postEl);
    
    setTimeout(() => {
        postDiv.classList.remove('loading');
        attachHoverListeners(postDiv);
    }, 600); 
    
    setTimeout(() => {
        const imgs = postEl.querySelectorAll('img.image-placeholder');
        if (imgs.length > 0 && window.addTapeToPost) {
            window.addTapeToPost(postEl);
        }
    }, 50);
}

async function processPostQueue() {
    if (isProcessingQueue || postQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (postQueue.length > 0) {
        const { postEl, zIndex } = postQueue.shift();
        
        // Create promises for this post's media
        const promises = [];
        
        // Preload images
        const imgs = postEl.querySelectorAll("img");
        if (imgs.length) {
            promises.push(...Array.from(imgs).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(res => {
                    img.onload = img.onerror = res;
                });
            }));
        }
        
        // Preload video metadata
        const videos = postEl.querySelectorAll("video");
        if (videos.length) {
            promises.push(...Array.from(videos).map(video => {
                if (video.readyState >= 1) return Promise.resolve();
                return new Promise(res => {
                    video.onloadedmetadata = video.onerror = res;
                });
            }));
        }
        
        // Wait for this post's media to load before adding to layout
        if (promises.length > 0) {
            await Promise.all(promises);
        }
        
        // Add post to layout
        addPostToLayout(postEl, zIndex);
        
        // Small delay between posts for visual effect
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isProcessingQueue = false;
    
    // Replace loading indicator with "view more" button when all posts are processed
    hideLoadingIndicator();
    showViewMoreButton();
}

function layoutPosts(postElements) {
    if (document.fullscreenElement && document.fullscreenElement.tagName === "VIDEO") {
        return;
    }
    const numCols = getNumColumns();
    const columns = createColumns(numCols);
    postElements.forEach((postEl, index) => {
        const col = getShortestColumn(columns);
        postEl.firstElementChild.style.zIndex = postElements.length - index;
        col.appendChild(postEl);
    });
    
    setTimeout(() => {
        if (window.addTapeToImages) {
            window.addTapeToImages();
        } else {
            console.error('[Main] addTapeToImages function not available');
        }
    }, 200);
}

function showLoadingIndicator() {
    const postsContainer = document.getElementById("posts");
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "loading-posts";
    loadingDiv.className = "loading-posts";
    loadingDiv.innerHTML = `
        <div class="loading-posts-content">
            <div class="loading-spinner"></div>
            Loading posts...
        </div>
    `;
    postsContainer.appendChild(loadingDiv);
}

function hideLoadingIndicator() {
    const loadingDiv = document.getElementById("loading-posts");
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

function showViewMoreButton() {
    const postsContainer = document.getElementById("posts");
    
    // Check if button already exists
    if (document.getElementById("view-more-button")) {
        return;
    }
    
    const viewMoreDiv = document.createElement("a");
    viewMoreDiv.id = "view-more-button";
    viewMoreDiv.href = "https://bsky.app/profile/lit.mates.dev";
    viewMoreDiv.target = "_blank";
    viewMoreDiv.className = "view-more-posts";
    viewMoreDiv.innerHTML = `
        <div class="view-more-posts-content">
            <strong>View more on Bluesky →</strong><br>
            <small>Follow @lit.mates.dev for more posts</small>
        </div>
    `;
    
    // Insert after the posts container but before footer
    postsContainer.insertAdjacentElement('afterend', viewMoreDiv);
}

async function fetchPosts() {
    // Show loading indicator
    showLoadingIndicator();
    
    try {
        const res = await fetch(
            "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=lit.mates.dev&limit=20&filter=posts_no_replies"
        );
        if (!res.ok) throw new Error("Failed to fetch posts");
        const data = await res.json();

        const posts = filterOriginalPosts(data.feed).map(item => {
            let embeds = [];
            const embedObj = item.post.embed;
            if (embedObj) {
                if (embedObj.$type === "app.bsky.embed.images#view" && Array.isArray(embedObj.images)) {
                    embeds = embedObj.images.map(img => ({
                        type: "image",
                        url: img.thumb,
                        alt: img.alt || "",
                        fullres: img.fullsize || img.full || img.thumb
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
            }

            return {
                author: item.post.author.displayName,
                handle: item.post.author.handle,
                avatar: item.post.author.avatar,
                createdAt: item.post.record.createdAt,
                text: item.post.record.text,
                likes: item.post.likeCount || 0,
                reposts: item.post.repostCount || 0,
                comments: item.post.replyCount || 0,
                url: `https://bsky.app/profile/${item.post.author.handle}/post/${item.post.uri.split("/").pop()}`,
                embed: embeds
            };
        });

        // Initialize layout columns
        const numCols = getNumColumns();
        layoutColumns = createColumns(numCols);
        currentNumColumns = numCols; // Initialize currentNumColumns
        
        // Create all post elements
        postElementsCache = posts.map(post => createPost(post));
        
        // Add posts to queue in order
        postQueue = postElementsCache.map((postEl, index) => ({
            postEl,
            zIndex: postElementsCache.length - index
        }));
        
        // Start processing the queue
        processPostQueue();

    } catch (err) {
        console.error("Error fetching posts:", err);
        // Hide loading indicator on error
        hideLoadingIndicator();
        
        // Show error message
        const postsContainer = document.getElementById("posts");
        const errorDiv = document.createElement("div");
        errorDiv.className = "loading-posts";
        errorDiv.innerHTML = `
            <div class="loading-posts-content" style="color: #dc2626;">
                ⚠ Failed to load posts. Please refresh the page.
            </div>
        `;
        postsContainer.appendChild(errorDiv);
    }
}

window.addEventListener("resize", () => {
    if (document.fullscreenElement && document.fullscreenElement.tagName === "VIDEO") {
        return;
    }

    const newNumCols = getNumColumns();

    if (postElementsCache && layoutColumns && newNumCols !== currentNumColumns) {
        currentNumColumns = newNumCols; // Update the current number of columns
        // Re-layout all existing posts
        layoutColumns = createColumns(newNumCols);
        postElementsCache.forEach((postEl, index) => {
            if (postEl.parentNode) { // Only re-layout posts that are already added
                const zIndex = postElementsCache.length - index;
                const col = getShortestColumn(layoutColumns);
                const postDiv = postEl.firstElementChild;
                postDiv.style.zIndex = zIndex;
                col.appendChild(postEl);
            }
        });
        // Re-add tape after layout changes using the full refresh
        setTimeout(() => {
            if (window.refreshTape) {
                window.refreshTape();
            }
        }, 100);
    }
});

fetchPosts();