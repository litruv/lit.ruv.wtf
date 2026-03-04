const { Jimp } = require('jimp');
const path = require('path');

async function createDisplacementMap() {
    const size = 512;
    const image = new Jimp({ width: size, height: size });
    
    // Create a gentle CRT bulge displacement map
    // Center appears to bulge outward (magnified)
    // R channel = horizontal displacement
    // G channel = vertical displacement
    // 128 = no displacement, <128 = pull toward 0, >128 = push toward max
    
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Normalize to -1 to 1 range (center is 0,0)
            const nx = (x / (size - 1)) * 2 - 1;
            const ny = (y / (size - 1)) * 2 - 1;
            
            // Use smooth cubic falloff for gentle curve
            // Pull edges slightly toward center (pincushion)
            const distSq = nx * nx + ny * ny;
            const strength = distSq * 0.15; // Gentle effect
            
            // Direction away from center (positive = away from center)
            const dx = nx * strength;
            const dy = ny * strength;
            
            // Convert to 0-255 range (128 = no displacement)
            const r = Math.floor(128 + dx * 127);
            const g = Math.floor(128 + dy * 127);
            
            const idx = (y * size + x) * 4;
            image.bitmap.data[idx + 0] = Math.max(0, Math.min(255, r));
            image.bitmap.data[idx + 1] = Math.max(0, Math.min(255, g));
            image.bitmap.data[idx + 2] = 128;
            image.bitmap.data[idx + 3] = 255;
        }
    }
    
    const outputPath = path.join(__dirname, 'website', 'bulge-map.png');
    await image.write(outputPath);
    console.log('✓ Displacement map created: website/bulge-map.png');
}

createDisplacementMap();
