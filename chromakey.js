const fs = require('fs');
const path = require('path');

// Using Jimp for image processing
const { Jimp } = require('jimp');

async function chromakeyImage() {
    try {
        const inputPath = path.join(__dirname, 'website', 'screenborder.jpg');
        const outputPath = path.join(__dirname, 'website', 'screenborder.png');
        
        console.log('Loading image...');
        const image = await Jimp.read(inputPath);
        
        console.log('Removing green screen...');
        
        // Scan through each pixel
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
            const red = this.bitmap.data[idx + 0];
            const green = this.bitmap.data[idx + 1];
            const blue = this.bitmap.data[idx + 2];
            const alpha = this.bitmap.data[idx + 3];
            
            // Very aggressive green detection
            const isGreen = green > red * 1.05 && green > blue * 1.05 && green > 30;
            
            // Catch any bright greens
            const isBrightGreen = green > 120 && green > red && green > blue;
            
            if (isGreen || isBrightGreen) {
                // Make pixel transparent
                this.bitmap.data[idx + 3] = 0;
            } else if (green > red || green > blue) {
                // Aggressively reduce alpha for any greenish tint
                const greenness = Math.max(
                    (green - red) / 255,
                    (green - blue) / 255
                );
                this.bitmap.data[idx + 3] = Math.floor(alpha * (1 - greenness));
            }
        });
        
        console.log('Saving PNG...');
        await image.write(outputPath);
        
        console.log('✓ Chromakey complete! Saved to website/screenborder.png');
    } catch (error) {
        console.error('✗ Chromakey failed:', error);
        process.exit(1);
    }
}

chromakeyImage();
