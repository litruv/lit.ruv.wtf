const fs = require('fs').promises;
const path = require('path');

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
copyWebsiteFiles();
