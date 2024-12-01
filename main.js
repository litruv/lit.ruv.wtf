function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
function getRandomRotation() {
    return Math.random() * 3 - 1.5
}
function createPost(post) {
    const article = document.createElement('div');
    article.className = 'post';
    article.style.transform = `rotate(${getRandomRotation()}deg)`;

    const postLink = document.createElement('a');
    postLink.href = post.url;
    postLink.target = "_blank";
    postLink.style.textDecoration = "none";

    const imageHTML = post.embed.length > 0
        ? post.embed.map(img => `
            <a href="${img.url}" target="_blank">
                <img class="image-placeholder" src="${img.url}" alt="${img.alt || 'Image'}" style="width: 100%;" />
            </a>
        `).join('')
        : '';
    article.innerHTML = `
        <div class="post-header">
            <div class="avatar">
                <img src="${post.avatar}" alt="${post.author}" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>
            <div>
                <div style="font-weight: bold;">${post.author} (@${post.handle})</div>
                <div style="font-size: 0.875rem; color: #666;">
                    ${formatDate(post.createdAt)}
                </div>
            </div>
        </div>
        <div class="post-content">${post.text}</div>
        ${imageHTML}
        <div class="post-actions">
            <button class="action-btn like">♥ ${post.likes}</button>
            <button class="action-btn repost">⟲ ${post.reposts}</button>
        </div>
    `;
    postLink.appendChild(article);
    return postLink;
}
function filterOriginalPosts(feed) {
    return feed.filter((item) => {
        const isRepost = item?.reason?.$type === 'app.bsky.feed.defs#reasonRepost';
        const isReply = item?.post?.record?.reply;
        return !isRepost && !isReply;
    });
}
async function fetchPosts() {
    try {
        const response = await fetch("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=lit.mates.dev&limit=20&filter=posts_no_replies");
        if (!response.ok) {
            throw new Error('Failed to fetch posts');
        }
        const data = await response.json();
        const filteredFeed = filterOriginalPosts(data.feed);
        const posts = filteredFeed.map(item => ({
            author: item.post.author.displayName,
            handle: item.post.author.handle,
            avatar: item.post.author.avatar,
            createdAt: item.post.record.createdAt,
            text: item.post.record.text,
            likes: item.post.likeCount || 0,
            reposts: item.post.repostCount || 0,
            url: `https://bsky.app/profile/${item.post.author.handle}/post/${item.post.cid}`,
            embed: item.post.embed?.images?.map(img => ({
                url: img.fullsize,
                alt: img.alt || ''
            })) || []
        }));
        const postsContainer = document.getElementById('posts');
        postsContainer.innerHTML = '';
        posts.forEach(post => {
            postsContainer.appendChild(createPost(post));
        });
    } catch (error) {
        console.error('Error fetching posts:', error);
    }
}
fetchPosts();