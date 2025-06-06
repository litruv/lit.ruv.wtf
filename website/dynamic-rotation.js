(function() {
    function updatePostRotations() {
        const posts = document.querySelectorAll('.post');
        
        posts.forEach(post => {
            const height = post.offsetHeight;
            
            // Calculate rotation: 3deg for 200px posts, 0.5deg for 500px+ posts
            const minRotation = 0.5;
            const maxRotation = 2.5;
            const minHeight = 200;
            const maxHeight = 700;
            
            // Linear interpolation between min and max rotation based on height
            let rotation = maxRotation - ((height - minHeight) / (maxHeight - minHeight)) * (maxRotation - minRotation);
            
            // Clamp between min and max
            rotation = Math.max(minRotation, Math.min(maxRotation, rotation));
            
            // Apply alternating direction
            const isOdd = Array.from(posts).indexOf(post) % 2 === 0;
            const finalRotation = isOdd ? -rotation : rotation;
            
            // Set CSS custom property
            post.style.setProperty('--dynamic-rotation', `${finalRotation}deg`);
            post.style.transform = `rotate(var(--dynamic-rotation, ${finalRotation}deg))`;
        });
    }
    
    // Update rotations when DOM is ready
    function init() {
        // Wait for images to load to get accurate heights
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(updatePostRotations, 100);
            });
        } else {
            setTimeout(updatePostRotations, 100);
        }
        
        // Update after window load for images
        window.addEventListener('load', () => {
            setTimeout(updatePostRotations, 200);
        });
        
        // Update on resize with debouncing
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(updatePostRotations, 300);
        });
    }
    
    init();
})();
