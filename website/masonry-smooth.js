(function() {
    let currentLayout = null;
    let posts = [];
    let columns = [];
    let originalPositions = new Map();
    
    function initMasonry() {
        const postsContainer = document.getElementById('posts');
        if (!postsContainer) return;
        
        posts = Array.from(postsContainer.querySelectorAll('.post'));
        columns = Array.from(postsContainer.querySelectorAll('.masonry-col'));
        
        if (posts.length === 0 || columns.length === 0) return;
        
        // Assign z-index based on post order (newer posts first)
        posts.forEach((post, index) => {
            post.style.zIndex = 100 - index;
        });
        
        // Store original positions of posts
        posts.forEach((post, index) => {
            const rect = post.getBoundingClientRect();
            originalPositions.set(post, {
                originalParent: post.parentNode,
                originalIndex: index,
                originalRect: rect
            });
        });
        
        checkLayout();
    }
    
    function checkLayout() {
        const isMobile = window.innerWidth <= 799;
        const newLayout = isMobile ? 'mobile' : 'desktop';
        
        if (newLayout !== currentLayout) {
            currentLayout = newLayout;
            // Don't redistribute - just let CSS media queries handle it
            // The layout change is handled purely by CSS
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMasonry);
    } else {
        initMasonry();
    }
    
    // Listen for resize events but don't do anything that affects layout
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(checkLayout, 150);
    });
})();
