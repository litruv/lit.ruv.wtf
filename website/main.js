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

function createPost(t) {
    const post = document.createElement("div");
    post.className = "post";
    post.style.transform = `rotate(${getRandomRotation()}deg)`;

    const link = document.createElement("a");
    link.href = t.url;
    link.target = "_blank";
    link.style.textDecoration = "none";

    const embedHtml = t.embed.length > 0
        ? t.embed.map(img =>
            `
            <a href="${img.url}" target="_blank">
                <img class="image-placeholder" src="${img.url}" alt="${img.alt || "Image"}" style="width: 100%;" />
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

    link.href = t.url;
    link.appendChild(post);
    return link;
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
    postElements.forEach(postEl => {
        const col = getShortestColumn(columns);
        col.appendChild(postEl);
    });
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
                alt: img.alt || ""
            })) || []
        }));

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
    }
});

fetchPosts();