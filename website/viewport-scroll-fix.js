(function() {
    let scrollPosition = 0;
    let isResizing = false;
    let resizeTimeout;
    
    function preserveScroll() {
        if (!isResizing) {
            scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
            isResizing = true;
            
            // Temporarily disable smooth scrolling during resize
            document.documentElement.style.scrollBehavior = 'auto';
        }
        
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // Force restore scroll position multiple times to combat layout changes
            const restoreScroll = () => {
                window.scrollTo(0, scrollPosition);
            };
            
            restoreScroll();
            requestAnimationFrame(restoreScroll);
            setTimeout(restoreScroll, 10);
            setTimeout(restoreScroll, 50);
            
            setTimeout(() => {
                // Re-enable smooth scrolling
                document.documentElement.style.scrollBehavior = 'smooth';
                isResizing = false;
            }, 100);
        }, 100);
    }
    
    // Listen for resize events
    window.addEventListener('resize', preserveScroll);
    
    // Listen for orientation changes
    window.addEventListener('orientationchange', () => {
        preserveScroll();
        // Additional delay for orientation changes
        setTimeout(() => {
            window.scrollTo(0, scrollPosition);
        }, 500);
    });
    
    // Also intercept media query changes that affect layout
    const mediaQuery = window.matchMedia('(max-width: 799px)');
    mediaQuery.addListener(preserveScroll);
})();
