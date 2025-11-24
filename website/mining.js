document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    const depthDisplay = document.getElementById('depth-counter');
    const scoreDisplay = document.getElementById('score-counter');

    if (!canvas) return;

    // --- Configuration ---
    let GRID_SIZE = 5; // 5x5 grid (Dynamic)
    let VISIBLE_LAYERS = 7; // How many layers deep we render (Dynamic)
    const BLOCK_SIZE = 1;
    
    const SELL_PRICES = { coal: 10, iron: 20, gold: 50, diamond: 200, emerald: 500 };
    const UPGRADE_COSTS = {
        speed: (level) => Math.floor(100 * Math.pow(1.5, level)),
        luck: (level) => Math.floor(500 * Math.pow(2, level)),
        mining_area: (level) => Math.floor(1000 * Math.pow(3, level)), // Expensive!
        vein_miner: (level) => Math.floor(2000 * Math.pow(2, level)),
        tnt_frequency: (level) => Math.floor(5000 * Math.pow(1.5, level)),
        tnt_power: (level) => Math.floor(10000 * Math.pow(2, level)),
        pickup_range: (level) => Math.floor(300 * Math.pow(1.5, level)),
        grid_size: (level) => Math.floor(10000 * Math.pow(4, level)) // Very Expensive!
    };

    // --- State ---
    let depth = 0;
    let score = 0;
    let isAnimating = false;
    let cameraOffsetY = 0;
    let upgrades = { speed: 0, luck: 0, mining_area: 0, vein_miner: 0, tnt_frequency: 0, tnt_power: 0, pickup_range: 0, grid_size: 0 };
    let tntTimer = 0;
    const tntProjectiles = [];
    
    // Store blocks: blocks[layerIndex][x][z]
    // layerIndex 0 is the top-most visible layer.
    let layers = []; 
    let extraBlocks = []; // Blocks above the ground (trees, etc)

    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background

    // Orthographic Camera for Isometric view
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const d = 5;
    const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    
    // Isometric angle
    camera.position.set(20, 14, 20);
    camera.lookAt(scene.position); // Look at 0,0,0
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: false, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // renderer.outputEncoding = THREE.sRGBEncoding; // We use GammaCorrectionShader instead
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // --- Post Processing (SSAO) ---
    const composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    const ssaoPass = new THREE.SSAOPass(scene, camera, canvas.clientWidth, canvas.clientHeight);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.001;
    ssaoPass.maxDistance = 0.1;
    composer.addPass(ssaoPass);

    const gammaCorrectionPass = new THREE.ShaderPass(THREE.GammaCorrectionShader);
    composer.addPass(gammaCorrectionPass);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(-30, 50, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    const dLight = 10;
    dirLight.shadow.camera.left = -dLight;
    dirLight.shadow.camera.right = dLight;
    dirLight.shadow.camera.top = dLight;
    dirLight.shadow.camera.bottom = -dLight;
    scene.add(dirLight);

    // --- Textures ---
    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (name) => {
        const tex = textureLoader.load(`blocks/${name}`);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.encoding = THREE.sRGBEncoding;
        return tex;
    };

    const loadItemTexture = (name) => {
        const tex = textureLoader.load(`items/${name}`);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.encoding = THREE.sRGBEncoding;
        return tex;
    };

    const textures = {
        stone: loadTexture('stone.png'),
        dirt: loadTexture('dirt.png'),
        cobblestone: loadTexture('cobblestone.png'),
        coal: loadTexture('coal_ore.png'),
        iron: loadTexture('iron_ore.png'),
        gold: loadTexture('gold_ore.png'),
        diamond: loadTexture('diamond_ore.png'),
        emerald: loadTexture('emerald_ore.png'),
        bedrock: loadTexture('bedrock.png'),
        grass_top: loadTexture('grass_top.png'),
        grass_side: loadTexture('grass_side.png'),
        dirt: loadTexture('dirt.png'),
        log_side: loadTexture('log_oak.png'),
        log_top: loadTexture('log_oak_top.png'),
        leaves: loadTexture('leaves_oak.png'),
        apple: loadItemTexture('apple.png'),
        stick: loadItemTexture('stick.png'),
        sapling: loadTexture('sapling_oak.png'),
        planks: loadTexture('planks_oak.png'),
        wood_pickaxe: loadItemTexture('wood_pickaxe.png'),
        stone_pickaxe: loadItemTexture('stone_pickaxe.png'),
        iron_pickaxe: loadItemTexture('iron_pickaxe.png'),
        gold_pickaxe: loadItemTexture('gold_pickaxe.png'),
        diamond_pickaxe: loadItemTexture('diamond_pickaxe.png'),
        tnt_side: loadTexture('tnt_side.png'),
        tnt_top: loadTexture('tnt_top.png'),
        tnt_bottom: loadTexture('tnt_bottom.png'),
        particle: (() => {
            const t = new THREE.TextureLoader().load('particle/particles.png');
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            return t;
        })()
    };

    // Load destroy stages
    const destroyTextures = [];
    for (let i = 0; i < 10; i++) {
        const tex = loadTexture(`destroy_stage_${i}.png`);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        destroyTextures.push(tex);
    }

    // Materials cache
    const materials = {};
    const getMaterial = (type) => {
        if (materials[type]) return materials[type];
        
        let map = textures.stone;
        if (textures[type]) map = textures[type];

        // Special case for grass block to look nice
        if (type === 'grass') {
            const mat = [
                new THREE.MeshLambertMaterial({ map: textures.grass_side }), // px
                new THREE.MeshLambertMaterial({ map: textures.grass_side }), // nx
                new THREE.MeshLambertMaterial({ map: textures.grass_top, color: 0x79C05A }),  // py (top) - Tinted green
                new THREE.MeshLambertMaterial({ map: textures.dirt }),       // ny (bottom)
                new THREE.MeshLambertMaterial({ map: textures.grass_side }), // pz
                new THREE.MeshLambertMaterial({ map: textures.grass_side })  // nz
            ];
            materials[type] = mat;
            return mat;
        }

        if (type === 'log') {
            const mat = [
                new THREE.MeshLambertMaterial({ map: textures.log_side }), // px
                new THREE.MeshLambertMaterial({ map: textures.log_side }), // nx
                new THREE.MeshLambertMaterial({ map: textures.log_top }),  // py (top)
                new THREE.MeshLambertMaterial({ map: textures.log_top }),  // ny (bottom)
                new THREE.MeshLambertMaterial({ map: textures.log_side }), // pz
                new THREE.MeshLambertMaterial({ map: textures.log_side })  // nz
            ];
            materials[type] = mat;
            return mat;
        }

        if (type === 'leaves') {
            const mat = new THREE.MeshLambertMaterial({ map: textures.leaves, transparent: true, alphaTest: 0.5, color: 0x79C05A });
            materials[type] = mat;
            return mat;
        }

        if (type === 'apple') {
            const mat = new THREE.MeshLambertMaterial({ map: textures.apple, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
            materials[type] = mat;
            return mat;
        }
        if (type === 'stick') {
            const mat = new THREE.MeshLambertMaterial({ map: textures.stick, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
            materials[type] = mat;
            return mat;
        }
        if (type === 'sapling') {
            const mat = new THREE.MeshLambertMaterial({ map: textures.sapling, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
            materials[type] = mat;
            return mat;
        }

        const mat = new THREE.MeshLambertMaterial({ map: map });
        materials[type] = mat;
        return mat;
    };

    // Damage Overlay
    const damageMaterial = new THREE.MeshBasicMaterial({
        map: destroyTextures[0],
        color: 0x808080,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        blending: THREE.CustomBlending,
        blendEquation: THREE.ReverseSubtractEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor
    });
    const damageGeometry = new THREE.BoxGeometry(BLOCK_SIZE * 1.002, BLOCK_SIZE * 1.002, BLOCK_SIZE * 1.002);
    const damageOverlay = new THREE.Mesh(damageGeometry, damageMaterial);
    damageOverlay.visible = false;
    scene.add(damageOverlay);

    // --- Game Logic ---

    // Hardness reference: Stone (1.5) takes 4 seconds (4,000 ms)
    // Multiplier = 4,000 / 1.5 = 2666.66 ms per hardness unit
    const HARDNESS_MULTIPLIER = 2666.66;

    const BLOCK_HEALTH = {
        grass: 0.3 * HARDNESS_MULTIPLIER,
        dirt: 0.2 * HARDNESS_MULTIPLIER,
        stone: 1.5 * HARDNESS_MULTIPLIER,
        cobblestone: 2 * HARDNESS_MULTIPLIER,
        coal: 3 * HARDNESS_MULTIPLIER,
        iron: 3 * HARDNESS_MULTIPLIER,
        gold: 3 * HARDNESS_MULTIPLIER,
        diamond: 3 * HARDNESS_MULTIPLIER,
        emerald: 3 * HARDNESS_MULTIPLIER,
        log: 2.0 * HARDNESS_MULTIPLIER,
        leaves: 0.05 * HARDNESS_MULTIPLIER,
        bedrock: Infinity
    };

    function createBlock(x, y, z, type) {
        const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        const material = getMaterial(type);
        const cube = new THREE.Mesh(geometry, material);
        cube.castShadow = true;
        cube.receiveShadow = true;
        
        // Center the grid
        // GRID_SIZE is dynamic now
        const offset = (GRID_SIZE * BLOCK_SIZE) / 2 - (BLOCK_SIZE / 2);
        
        cube.position.set(
            x * BLOCK_SIZE - offset,
            y * BLOCK_SIZE, // Y is vertical
            z * BLOCK_SIZE - offset
        );
        
        cube.userData = { gridX: x, gridY: y, gridZ: z, type: type };
        scene.add(cube);
        return cube;
    }

    function getBlockTypeForDepth(d) {
        // Helper to reuse generation logic
        if (d === 0) return 'grass';
        if (d === 1) return 'dirt';
        if (d === 2) return 'dirt';
        
        // Bedrock at bottom? No, infinite mining.
        
        const rand = Math.random();
        
        // Ore probabilities based on depth
        let coalProb = 0.05;
        let ironProb = 0.0;
        let goldProb = 0.0;
        let diamondProb = 0.0;
        let emeraldProb = 0.0;

        if (d > 5) ironProb = 0.03;
        if (d > 10) goldProb = 0.02;
        if (d > 20) diamondProb = 0.01;
        if (d > 50) emeraldProb = 0.005;

        // Increase probs as we go deeper
        if (d > 30) {
            coalProb = 0.08;
            ironProb = 0.05;
        }
        if (d > 60) {
            goldProb = 0.04;
            diamondProb = 0.02;
        }

        if (rand < emeraldProb) return 'emerald';
        if (rand < emeraldProb + diamondProb) return 'diamond';
        if (rand < emeraldProb + diamondProb + goldProb) return 'gold';
        if (rand < emeraldProb + diamondProb + goldProb + ironProb) return 'iron';
        if (rand < emeraldProb + diamondProb + goldProb + ironProb + coalProb) return 'coal';
        
        if (d < 5) return 'dirt';
        if (d < 10 && Math.random() < 0.5) return 'dirt';
        
        return Math.random() < 0.8 ? 'stone' : 'cobblestone';
    }

    function generateLayer(layerIndex, absoluteDepth) {
        const layer = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            layer[x] = [];
            for (let z = 0; z < GRID_SIZE; z++) {
                // layerIndex corresponds to Y position. 
                // 0 is top, -1 is below, etc.
                const type = getBlockTypeForDepth(absoluteDepth);
                const block = createBlock(x, -layerIndex, z, type);
                layer[x][z] = block;
            }
        }
        return layer;
    }

    const STRUCTURES = {
        tree: []
    };
    
    // Init Tree Structure
    (() => {
        const s = STRUCTURES.tree;
        for(let y=0; y<3; y++) s.push({x:0, y:y, z:0, type:'log'});
        for(let x=-2; x<=2; x++) {
            for(let y=2; y<=3; y++) {
                for(let z=-2; z<=2; z++) {
                    if(Math.abs(x)===2 && Math.abs(z)===2) continue;
                    if(x===0 && z===0 && y===2) continue;
                    s.push({x, y, z, type:'leaves'});
                }
            }
        }
        for(let x=-1; x<=1; x++) {
            for(let z=-1; z<=1; z++) {
                if(x===0 && z===0) continue;
                s.push({x, y:4, z, type:'leaves'});
            }
        }
        s.push({x:0, y:5, z:0, type:'leaves'});
    })();

    function placeStructure(gx, gy, gz, structureName) {
        const structure = STRUCTURES[structureName];
        if (!structure) return;
        
        structure.forEach(block => {
            spawnBlock(gx + block.x, gy + block.y, gz + block.z, block.type);
        });
    }

    function generateTree() {
        const cx = Math.floor(GRID_SIZE / 2);
        const cz = Math.floor(GRID_SIZE / 2);
        placeStructure(cx, 1, cz, 'tree');
    }

    function saveGame() {
        const saveData = {
            depth,
            score,
            inventory,
            upgrades,
            layers: layers.map(layer => layer.map(row => row.map(block => block ? block.userData.type : null))),
            extraBlocks: extraBlocks.map(b => ({
                type: b.userData.type,
                gridX: b.userData.gridX,
                gridZ: b.userData.gridZ,
                y: Math.round(b.position.y / BLOCK_SIZE),
                isSapling: b.userData.isSapling,
                growthTimer: b.userData.growthTimer
            })),
            drops: drops.map(d => ({
                type: d.userData.type,
                count: d.userData.count || 1,
                x: d.position.x,
                y: d.position.y,
                z: d.position.z,
                vx: d.userData.velocity.x,
                vy: d.userData.velocity.y,
                vz: d.userData.velocity.z,
                life: d.userData.life,
                autoCollect: d.userData.autoCollect
            }))
        };
        localStorage.setItem('miningGameSave', JSON.stringify(saveData));
    }

    function loadGame() {
        const dataStr = localStorage.getItem('miningGameSave');
        if (!dataStr) return false;
        
        try {
            const data = JSON.parse(dataStr);
            depth = data.depth;
            score = data.score;
            inventory = Object.assign({}, data.inventory);
            if (data.upgrades) {
                upgrades = Object.assign(upgrades, data.upgrades);
                // Ensure new upgrades are initialized if loading old save
                if (upgrades.mining_area === undefined) upgrades.mining_area = 0;
                if (upgrades.vein_miner === undefined) upgrades.vein_miner = 0;
                if (upgrades.tnt_frequency === undefined) upgrades.tnt_frequency = 0;
                if (upgrades.tnt_power === undefined) upgrades.tnt_power = 0;
                if (upgrades.pickup_range === undefined) upgrades.pickup_range = 0;
                if (upgrades.grid_size === undefined) upgrades.grid_size = 0;
                
                // Update GRID_SIZE based on loaded upgrade
                GRID_SIZE = 5 + (upgrades.grid_size * 2);
                VISIBLE_LAYERS = 7 + upgrades.grid_size;
                
                // Adjust camera for larger grids
                if (upgrades.grid_size > 0) {
                    const d = 5 + upgrades.grid_size;
                    camera.left = -d * aspect;
                    camera.right = d * aspect;
                    camera.top = d;
                    camera.bottom = -d;
                    camera.updateProjectionMatrix();
                }
            }
            
            depthDisplay.innerText = depth;
            scoreDisplay.innerText = score;
            updateInventoryUI();
            
            // Rebuild layers
            layers = [];
            data.layers.forEach((savedLayer, layerIdx) => {
                const layer = [];
                // Handle grid size mismatch if save is old
                const savedSize = savedLayer.length;
                const offsetDiff = (GRID_SIZE - savedSize) / 2;

                for(let x=0; x<GRID_SIZE; x++) {
                    layer[x] = [];
                    for(let z=0; z<GRID_SIZE; z++) {
                        // Map new coordinates to old saved coordinates
                        const oldX = x - offsetDiff;
                        const oldZ = z - offsetDiff;
                        
                        let type = null;
                        if (oldX >= 0 && oldX < savedSize && oldZ >= 0 && oldZ < savedSize) {
                            if (savedLayer[oldX] && savedLayer[oldX][oldZ]) {
                                type = savedLayer[oldX][oldZ];
                            }
                        } else {
                            // New outer block for expanded grid
                            // Only if we are expanding. If shrinking (not possible yet), we just clip.
                            // But wait, if we load an old save with smaller grid, we should probably fill the new space?
                            // Or just leave it empty?
                            // If we leave it empty, checkLayerCleared might trigger.
                            // So we should probably generate blocks for the new area.
                            if (GRID_SIZE > savedSize) {
                                type = getBlockTypeForDepth(depth + layerIdx);
                            }
                        }

                        if (type) {
                            const block = createBlock(x, -layerIdx, z, type);
                            layer[x][z] = block;
                            scene.add(block); // Ensure we add to scene!
                        } else {
                            layer[x][z] = null;
                        }
                    }
                }
                layers.push(layer);
            });

            // Fill missing layers if VISIBLE_LAYERS increased
            while (layers.length < VISIBLE_LAYERS) {
                const layerIdx = layers.length;
                const absDepth = depth + layerIdx;
                layers.push(generateLayer(layerIdx, absDepth));
            }

            // Rebuild extraBlocks
            extraBlocks = [];
            data.extraBlocks.forEach(bData => {
                if (bData.isSapling) {
                    spawnSapling(bData.gridX, bData.y, bData.gridZ, bData.growthTimer);
                } else {
                    spawnBlock(bData.gridX, bData.y, bData.gridZ, bData.type);
                }
            });

            // Rebuild drops
            if (data.drops) {
                data.drops.forEach(dData => {
                    const pos = new THREE.Vector3(dData.x, dData.y, dData.z);
                    spawnDrop(pos, dData.type, dData.autoCollect);
                    // The last added drop is at drops[drops.length-1]
                    const drop = drops[drops.length-1];
                    if (drop) {
                        drop.userData.velocity.set(dData.vx, dData.vy, dData.vz);
                        drop.userData.life = dData.life || 0;
                        drop.userData.physicsPos.copy(pos);
                        drop.userData.count = dData.count || 1;
                        
                        // Apply scale based on count
                        const count = drop.userData.count;
                        const newScale = Math.min(2.0, 0.6 + (count * 0.1));
                        if (drop.userData.isExtruded) {
                            drop.scale.set(newScale, newScale, newScale);
                        } else {
                            const blockScale = Math.min(1.5, 1.0 + (count * 0.1));
                            drop.scale.set(blockScale, blockScale, blockScale);
                        }
                    }
                });
            }
            
            return true;
        } catch (e) {
            console.error("Failed to load save", e);
            return false;
        }
    }

    function initGame() {
        if (loadGame()) {
            console.log("Game loaded from save.");
        } else {
            // Generate initial layers
            for (let i = 0; i < VISIBLE_LAYERS; i++) {
                layers.push(generateLayer(i, depth + i));
            }
            generateTree();
        }
        
        // Set initial camera position for tree
        if (extraBlocks.length > 0) {
            cameraOffsetY = 3.5;
            camera.position.set(20, 14 + cameraOffsetY, 20);
            camera.lookAt(0, cameraOffsetY, 0);
        }
        
        // Auto-save
        setInterval(saveGame, 5000);
    }

    function checkLayerCleared() {
        // Check the top layer (index 0)
        const topLayer = layers[0];
        let isEmpty = true;
        
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let z = 0; z < GRID_SIZE; z++) {
                if (topLayer[x][z] !== null) {
                    isEmpty = false;
                    break;
                }
            }
            if (!isEmpty) break;
        }

        if (isEmpty) {
            advanceLevel();
        }
    }

    function advanceLevel() {
        if (isAnimating) return;
        isAnimating = true;

        // Remove empty top layer from array
        layers.shift();
        
        // Increment depth
        depth++;
        depthDisplay.innerText = depth;

        // Generate new layer at the bottom
        const newLayerDepth = depth + VISIBLE_LAYERS - 1;
        
        // Create it one step lower (VISIBLE_LAYERS instead of VISIBLE_LAYERS - 1)
        // so it can animate up into place
        const newLayer = generateLayer(VISIBLE_LAYERS, newLayerDepth);
        
        layers.push(newLayer);

        // Animate all blocks moving up
        const duration = 500; // ms
        const start = Date.now();
        
        const startPositions = [];
        const allBlocks = [];
        
        layers.forEach(layer => {
            layer.forEach(row => {
                row.forEach(block => {
                    if (block) {
                        allBlocks.push(block);
                        startPositions.push(block.position.y);
                    }
                });
            });
        });

        extraBlocks.forEach(block => {
            allBlocks.push(block);
            startPositions.push(block.position.y);
        });

        // Also animate drops
        const dropStartPositions = [];
        drops.forEach(drop => {
            dropStartPositions.push(drop.userData.physicsPos.y);
        });

        function animate() {
            const now = Date.now();
            const progress = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out
            const offset = ease * BLOCK_SIZE;

            allBlocks.forEach((b, i) => {
                b.position.y = startPositions[i] + offset;
            });

            drops.forEach((drop, i) => {
                drop.userData.physicsPos.y = dropStartPositions[i] + offset;
                drop.position.y = drop.userData.physicsPos.y; // Visual update handled in updateDrops but we force it here for smoothness
            });

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                isAnimating = false;
                // Correct positions exactly to avoid float drift
                layers.forEach((layer, layerIdx) => {
                    layer.forEach(row => {
                        row.forEach(block => {
                            if (block) {
                                // The top layer (index 0) should now be at Y=0
                                block.position.y = -layerIdx * BLOCK_SIZE;
                            }
                        });
                    });
                });
                // Extra blocks just stay where they ended up (shifted up by 1)
                
                // Finalize drop positions
                drops.forEach((drop, i) => {
                    drop.userData.physicsPos.y = dropStartPositions[i] + BLOCK_SIZE;
                });
                
                saveGame();
                checkLayerCleared(); // Check if the next layer is also empty
            }
        }
        
        animate();
    }

    // --- Inventory ---
    let inventory = {};
    let selectedItem = null;
    const inventoryDisplay = document.getElementById('inventory-display');

    function isPlaceable(type) {
        const placeables = ['log', 'planks', 'cobblestone', 'dirt', 'stone', 'leaves', 'sapling', 'grass'];
        return placeables.includes(type);
    }

    function addToInventory(type) {
        if (!inventory[type]) inventory[type] = 0;
        inventory[type]++;
        updateInventoryUI();
    }

    function updateInventoryUI() {
        if (!inventoryDisplay) return;
        inventoryDisplay.innerHTML = '';
        for (const [type, count] of Object.entries(inventory)) {
            if (count <= 0) continue; // Skip items with 0 count

            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.type = type; // For animation targeting
            
            if (selectedItem === type) {
                slot.style.borderColor = '#ffff00';
                slot.style.borderWidth = '3px';
                slot.style.transform = 'scale(1.1)';
            }

            slot.onclick = () => {
                if (selectedItem === type) {
                    selectedItem = null;
                } else {
                    if (isPlaceable(type)) {
                        selectedItem = type;
                    }
                }
                updateInventoryUI();
            };
            
            const img = document.createElement('img');
            let iconName = type;
            if (type === 'coal') iconName = 'coal_ore';
            if (type === 'iron') iconName = 'iron_ore';
            if (type === 'gold') iconName = 'gold_ore';
            if (type === 'diamond') iconName = 'diamond_ore';
            if (type === 'emerald') iconName = 'emerald_ore';
            if (type === 'log') iconName = 'log_oak';
            if (type === 'leaves') iconName = 'leaves_oak';
            if (type === 'grass') iconName = 'grass_side';
            if (type === 'stick') iconName = 'stick';
            if (type === 'sapling') iconName = 'sapling_oak';
            if (type === 'apple') iconName = 'apple';
            if (type === 'planks') iconName = 'planks_oak';
            if (type === 'wood_pickaxe') iconName = 'wood_pickaxe';
            if (type === 'stone_pickaxe') iconName = 'stone_pickaxe';
            if (type === 'iron_pickaxe') iconName = 'iron_pickaxe';
            if (type === 'gold_pickaxe') iconName = 'gold_pickaxe';
            if (type === 'diamond_pickaxe') iconName = 'diamond_pickaxe';
            
            if (['apple', 'stick', 'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'gold_pickaxe', 'diamond_pickaxe'].includes(type)) {
                img.src = `items/${iconName}.png`;
            } else {
                img.src = `blocks/${iconName}.png`;
            }
            
            // Special handling for non-block items to tint them?
            if (type === 'stick') {
                img.style.transform = 'scale(0.8)';
            }
            if (type === 'sapling') {
                img.style.transform = 'scale(0.8)';
            }
            
            const countDiv = document.createElement('div');
            countDiv.className = 'inventory-count';
            countDiv.innerText = count;
            
            slot.appendChild(img);
            slot.appendChild(countDiv);
            inventoryDisplay.appendChild(slot);
        }
        updateCraftingUI();
    }

    // --- Crafting ---
    const craftingDisplay = document.getElementById('crafting-display');
    const RECIPES = [
        {
            output: 'planks',
            count: 4,
            inputs: { 'log': 1 }
        },
        {
            output: 'stick',
            count: 4,
            inputs: { 'planks': 2 }
        },
        {
            output: 'wood_pickaxe',
            count: 1,
            inputs: { 'planks': 3, 'stick': 2 }
        },
        {
            output: 'stone_pickaxe',
            count: 1,
            inputs: { 'cobblestone': 3, 'stick': 2 }
        },
        {
            output: 'iron_pickaxe',
            count: 1,
            inputs: { 'iron': 3, 'stick': 2 }
        },
        {
            output: 'gold_pickaxe',
            count: 1,
            inputs: { 'gold': 3, 'stick': 2 }
        },
        {
            output: 'diamond_pickaxe',
            count: 1,
            inputs: { 'diamond': 3, 'stick': 2 }
        }
    ];

    function canCraft(recipe) {
        for (const [item, count] of Object.entries(recipe.inputs)) {
            if (!inventory[item] || inventory[item] < count) return false;
        }
        return true;
    }

    function craft(recipe) {
        if (!canCraft(recipe)) return;
        
        // Deduct inputs
        for (const [item, count] of Object.entries(recipe.inputs)) {
            inventory[item] -= count;
            if (inventory[item] <= 0) delete inventory[item];
        }
        
        // Add output
        if (!inventory[recipe.output]) inventory[recipe.output] = 0;
        inventory[recipe.output] += recipe.count;
        
        updateInventoryUI();
        // updateCraftingUI called by updateInventoryUI
    }

    function updateCraftingUI() {
        if (!craftingDisplay) return;
        craftingDisplay.innerHTML = '';
        
        RECIPES.forEach(recipe => {
            const slot = document.createElement('div');
            slot.className = 'crafting-slot';
            if (canCraft(recipe)) {
                slot.classList.add('can-craft');
                slot.onclick = () => craft(recipe);
            } else {
                slot.style.opacity = '0.5';
                slot.style.cursor = 'default';
            }
            
            const img = document.createElement('img');
            let iconName = recipe.output;
            if (iconName === 'planks') iconName = 'planks_oak';
            
            if (['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'gold_pickaxe', 'diamond_pickaxe', 'stick'].includes(recipe.output)) {
                img.src = `items/${iconName}.png`;
            } else {
                img.src = `blocks/${iconName}.png`;
            }
            
            // Tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'crafting-tooltip';
            let costText = [];
            for (const [item, count] of Object.entries(recipe.inputs)) {
                costText.push(`${count} ${item}`);
            }
            tooltip.innerText = `${recipe.output} (${costText.join(', ')})`;
            
            slot.appendChild(img);
            slot.appendChild(tooltip);
            craftingDisplay.appendChild(slot);
        });
    }

    // --- Drops ---
    const drops = [];
    const dropGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    
    // Shadow Texture
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const shadowCtx = shadowCanvas.getContext('2d');
    const shadowGradient = shadowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
    shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    shadowCtx.fillStyle = shadowGradient;
    shadowCtx.fillRect(0, 0, 64, 64);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
    const shadowGeometry = new THREE.PlaneGeometry(0.4, 0.4);

    function spawnDrop(position, type, autoCollect = false) {
        // Check for existing drops to clump with
        for (const existingDrop of drops) {
            if (existingDrop.userData.type === type && !existingDrop.userData.collecting) {
                const dist = existingDrop.userData.physicsPos.distanceTo(position);
                if (dist < 1.0) { // Within 1 block radius
                    existingDrop.userData.count = (existingDrop.userData.count || 1) + 1;
                    
                    // Visual feedback for clumping (scale up slightly, max 2x)
                    const newScale = Math.min(2.0, 0.6 + (existingDrop.userData.count * 0.1));
                    if (existingDrop.userData.isExtruded) {
                        existingDrop.scale.set(newScale, newScale, newScale);
                    } else {
                        // Standard blocks start at 1.0
                        const blockScale = Math.min(1.5, 1.0 + (existingDrop.userData.count * 0.1));
                        existingDrop.scale.set(blockScale, blockScale, blockScale);
                    }
                    
                    // Reset life to keep it around longer
                    existingDrop.userData.life = 0;
                    return; // Merged, don't spawn new
                }
            }
        }

        const material = getMaterial(type);
        
        // Adjust geometry based on type
        let geometry = dropGeometry;
        let isExtruded = false;

        if (type === 'apple' || type === 'stick' || type === 'sapling') {
            if (geometryCache[type]) {
                geometry = geometryCache[type];
                isExtruded = true;
            } else {
                // Try to generate
                const tex = textures[type];
                if (tex && tex.image && tex.image.complete && tex.image.width > 0) {
                    geometry = generateExtrudedGeometry(tex.image);
                    geometryCache[type] = geometry;
                    isExtruded = true;
                } else if (tex && tex.image) {
                    // Load later
                    tex.image.onload = () => {
                        const geo = generateExtrudedGeometry(tex.image);
                        geometryCache[type] = geo;
                        // Update existing drops of this type?
                        // For simplicity, just next drops will be correct.
                        // Or we can update this drop:
                        if (drop.parent) { // If still in scene
                            drop.geometry = geo;
                        }
                    };
                }
            }
        }

        const drop = new THREE.Mesh(geometry, material);
        
        drop.castShadow = false;
        drop.receiveShadow = false;
        
        // Physics state
        drop.userData.physicsPos = position.clone();
        drop.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.025, // Slower spread
            0.025 + Math.random() * 0.025,  // Lower pop
            (Math.random() - 0.5) * 0.025
        );
        drop.userData.life = 0;
        drop.userData.bobOffset = Math.random() * Math.PI * 2; // Random start phase
        drop.userData.type = type;
        drop.userData.count = 1; // Start with 1 item
        drop.userData.autoCollect = autoCollect;
        drop.userData.autoCollectTimer = 0;
        drop.userData.isExtruded = isExtruded;

        if (isExtruded) {
            drop.scale.set(0.6, 0.6, 0.6);
            drop.userData.radius = 0.15; // 0.25 * 0.6
        } else {
            drop.userData.radius = 0.125;
        }

        // Shadow
        const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.copy(position);
        shadow.position.y = -100; // Hide initially
        
        drop.userData.shadow = shadow;

        scene.add(drop);
        scene.add(shadow);
        drops.push(drop);
    }

    function updateDrops() {
        for (let i = drops.length - 1; i >= 0; i--) {
            const drop = drops[i];
            
            // Collecting animation
            if (drop.userData.collecting) {
                // Calculate screen position
                const vector = drop.position.clone();
                vector.project(camera);
                
                const canvas = renderer.domElement;
                const rect = canvas.getBoundingClientRect();
                const scrollX = window.scrollX || window.pageXOffset;
                const scrollY = window.scrollY || window.pageYOffset;
                
                const x = (vector.x + 1) / 2 * rect.width + rect.left + scrollX;
                const y = -(vector.y - 1) / 2 * rect.height + rect.top + scrollY;
                
                // Create 2D floating item
                createFloatingItem(drop.userData.type, x - 16, y - 16, drop.userData.count || 1);
                
                // Remove 3D drop immediately
                scene.remove(drop);
                scene.remove(drop.userData.shadow);
                drops.splice(i, 1);
                continue;
            }

            const vel = drop.userData.velocity;
            const pos = drop.userData.physicsPos;
            
            // Gravity (Slower)
            vel.y -= 0.002; 
            
            // Move Physics Position
            pos.add(vel);
            
            // Floor Collision Logic (using pos)
            const gx = Math.round(pos.x / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
            const gz = Math.round(pos.z / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
            
            let floorY = -Infinity;
            
            // Check layers
            for (let l = 0; l < layers.length; l++) {
                if (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE) {
                    const block = layers[l][gx][gz];
                    if (block) {
                        const by = block.position.y;
                        if (by < pos.y && by > floorY) {
                            floorY = by;
                        }
                    }
                }
            }
            // Check extra blocks
            extraBlocks.forEach(b => {
                if (Math.round(b.position.x / BLOCK_SIZE + (GRID_SIZE/2 - 0.5)) === gx &&
                    Math.round(b.position.z / BLOCK_SIZE + (GRID_SIZE/2 - 0.5)) === gz) {
                    if (b.position.y < pos.y && b.position.y > floorY) {
                        floorY = b.position.y;
                    }
                }
            });

            // Collision check
            // Top of block is floorY + 0.5
            // Bottom of drop is pos.y - radius
            const radius = drop.userData.radius || 0.125;
            const bobAmplitude = 0.05;
            if (floorY !== -Infinity) {
                // Ensure we sit high enough so the bob doesn't clip
                if (pos.y - radius - bobAmplitude < floorY + 0.5) {
                    pos.y = floorY + 0.5 + radius + bobAmplitude;
                    vel.y = 0; // No bounce
                    vel.x *= 0.7; // Friction
                    vel.z *= 0.7;
                }
            } else {
                if (pos.y < -10) {
                    scene.remove(drop);
                    scene.remove(drop.userData.shadow);
                    drops.splice(i, 1);
                    continue;
                }
            }

            // Wall Collision
            const limit = (GRID_SIZE * BLOCK_SIZE) / 2 - 0.2;
            if (pos.x > limit) { pos.x = limit; vel.x *= -0.5; }
            if (pos.x < -limit) { pos.x = -limit; vel.x *= -0.5; }
            if (pos.z > limit) { pos.z = limit; vel.z *= -0.5; }
            if (pos.z < -limit) { pos.z = -limit; vel.z *= -0.5; }

            // Update Visuals
            drop.userData.life++;
            
            // Rotation (Yaw)
            drop.rotation.y += 0.01; // Slow rotation

            // Bobbing
            const bob = Math.sin(drop.userData.life * 0.02 + drop.userData.bobOffset) * 0.05;
            
            drop.position.copy(pos);
            drop.position.y += bob;

            // Shadow Update
            const shadow = drop.userData.shadow;
            if (floorY !== -Infinity) {
                shadow.position.set(pos.x, floorY + 0.5 + 0.01, pos.z);
                shadow.visible = true;
            } else {
                shadow.visible = false;
            }

            // Despawn logic
            // Removed auto-despawn. Items stay until collected.
            if (pos.y < -10) {
                scene.remove(drop);
                scene.remove(shadow);
                drops.splice(i, 1);
            }
        }
    }

    // --- Interaction ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isMining = false;
    let miningBlock = null;
    let miningStartTime = 0;
    let miningDuration = 0;

    function updateMouse(event) {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX || (event.touches && event.touches[0].clientX);
        const clientY = event.clientY || (event.touches && event.touches[0].clientY);
        
        if (clientX === undefined || clientY === undefined) return;

        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function getIntersection() {
        raycaster.setFromCamera(mouse, camera);

        const meshes = [];
        layers.forEach(layer => {
            layer.forEach(row => {
                row.forEach(block => {
                    if (block) meshes.push(block);
                });
            });
        });
        extraBlocks.forEach(block => meshes.push(block));

        const intersects = raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
            return intersects[0];
        }
        return null;
    }

    function getBlockUnderMouse() {
        const intersect = getIntersection();
        return intersect ? intersect.object : null;
    }

    function checkCollection() {
        // Base radius in NDC (screen space -1 to 1)
        // 0.15 is roughly 7.5% of screen width/height
        let pickupRadius = 0.15 + (upgrades.pickup_range * 0.05); 
        
        drops.forEach(drop => {
            if (drop.userData.collecting) return;

            const vector = drop.position.clone();
            vector.project(camera); // vector is now in NDC
            
            // Check if in front of camera
            if (vector.z > 1) return;

            const dx = vector.x - mouse.x;
            const dy = vector.y - mouse.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < pickupRadius) {
                 drop.userData.collecting = true;
                 if (drop.userData.shadow) drop.userData.shadow.visible = false;
            }
        });
    }

    function getBlockAt(x, y, z) {
        // Check layers
        if (y <= 0) {
            const layerIdx = -y;
            if (layerIdx < layers.length) {
                if (x >= 0 && x < GRID_SIZE && z >= 0 && z < GRID_SIZE) {
                    return layers[layerIdx][x][z];
                }
            }
        }
        // Check extra blocks
        return extraBlocks.find(b => 
            b.userData.gridX === x && 
            Math.round(b.position.y / BLOCK_SIZE) === y && 
            b.userData.gridZ === z
        );
    }

    function getMiningSpeedMultiplier() {
        let multiplier = 1;
        if (inventory['wood_pickaxe']) multiplier = 2;
        if (inventory['stone_pickaxe']) multiplier = 4;
        if (inventory['iron_pickaxe']) multiplier = 6;
        if (inventory['gold_pickaxe']) multiplier = 12;
        if (inventory['diamond_pickaxe']) multiplier = 8;
        
        // Apply speed upgrade
        multiplier *= (1 + (upgrades.speed * 0.2));
        
        return multiplier;
    }

    function startMining(block) {
        if (miningBlock === block) return; // Already mining this block
        
        cancelMining(); // Stop mining previous block

        if (!block) return;

        // Check if block is mineable (exposed)
        const gx = block.userData.gridX;
        const gz = block.userData.gridZ;
        const gy = Math.round(block.position.y / BLOCK_SIZE);
        
        // Check if there is a block above
        const blockAbove = getBlockAt(gx, gy + 1, gz);
        if (blockAbove) return;

        miningBlock = block;
        miningStartTime = performance.now();
        const type = block.userData.type;
        
        let baseDuration = BLOCK_HEALTH[type] || 1000;
        miningDuration = baseDuration / getMiningSpeedMultiplier();

        damageOverlay.position.copy(block.position);
        damageOverlay.visible = true;
        damageOverlay.material.map = destroyTextures[0];
    }

    function cancelMining() {
        miningBlock = null;
        damageOverlay.visible = false;
    }

    function processMining() {
        if (!isMining || !miningBlock) return;

        const elapsed = performance.now() - miningStartTime;
        const progress = elapsed / miningDuration;

        if (progress >= 1) {
            breakBlock(miningBlock);
            cancelMining();
            
            // Continuous mining: check if mouse is still down and over a block
            if (isMining) {
                const nextBlock = getBlockUnderMouse();
                if (nextBlock) {
                    startMining(nextBlock);
                }
            }
        } else {
            const stage = Math.floor(progress * 10);
            if (stage >= 0 && stage < 10) {
                damageOverlay.material.map = destroyTextures[stage];
            }
        }
    }

    function breakBlock(block, isChainReaction = false) {
        if (!block) return;
        
        const gx = block.userData.gridX;
        const gz = block.userData.gridZ;
        const type = block.userData.type;
        const loot = getLoot(type);

        // Handle drops
        loot.forEach(itemType => {
            spawnDrop(block.position, itemType, false);
        });

        // Check if it's in extra blocks
        const extraIdx = extraBlocks.indexOf(block);
        if (extraIdx !== -1) {
            scene.remove(block);
            extraBlocks.splice(extraIdx, 1);
            
            // Score
            let points = 1;
            if (type === 'log') points = 5;
            if (type === 'leaves') points = 1;
            score += points;
            scoreDisplay.innerText = score;
            return;
        }

        // Find layer index
        let foundLayerIdx = -1;
        for(let l=0; l<layers.length; l++) {
            if (layers[l][gx][gz] === block) {
                foundLayerIdx = l;
                break;
            }
        }

        if (foundLayerIdx !== -1) {
            scene.remove(block);
            layers[foundLayerIdx][gx][gz] = null;
            
            // Update score
            let points = 1;
            if (type === 'coal') points = 5;
            if (type === 'iron') points = 10;
            if (type === 'gold') points = 25;
            if (type === 'diamond') points = 100;
            if (type === 'emerald') points = 200;
            
            score += points;
            scoreDisplay.innerText = score;

            // --- Special Mining Effects (only for primary break) ---
            if (!isChainReaction) {
                // Vein Miner
                if (upgrades.vein_miner > 0 && ['coal', 'iron', 'gold', 'diamond', 'emerald'].includes(type)) {
                    const maxVein = 2 + upgrades.vein_miner * 2;
                    mineVein(gx, foundLayerIdx, gz, type, maxVein);
                }

                // Area Mining (only for non-ores usually, but let's do it for stone/dirt/grass)
                if (upgrades.mining_area > 0 && ['stone', 'dirt', 'grass', 'cobblestone'].includes(type)) {
                    const radius = upgrades.mining_area; // 1 = 3x3, 2 = 5x5
                    mineArea(gx, foundLayerIdx, gz, radius);
                }
                
                // Check for layer clear AFTER all chain reactions are done
                // We check layer 0 specifically because that's the one that triggers advancement
                checkLayerCleared();
            }
        }
    }

    function mineVein(gx, layerIdx, gz, type, maxBlocks) {
        let minedCount = 0;
        const queue = [{x: gx, z: gz, l: layerIdx}];
        const visited = new Set();
        visited.add(`${gx},${layerIdx},${gz}`);

        while (queue.length > 0 && minedCount < maxBlocks) {
            const current = queue.shift();
            
            // Check neighbors (up, down, left, right, forward, back)
            const neighbors = [
                {x: current.x+1, z: current.z, l: current.l},
                {x: current.x-1, z: current.z, l: current.l},
                {x: current.x, z: current.z+1, l: current.l},
                {x: current.x, z: current.z-1, l: current.l},
                // Same layer only for now to keep it simple, or maybe check adjacent layers?
                // Let's stick to same layer for simplicity first, or +/- 1 layer
            ];

            for (const n of neighbors) {
                if (n.x < 0 || n.x >= GRID_SIZE || n.z < 0 || n.z >= GRID_SIZE) continue;
                
                const key = `${n.x},${n.l},${n.z}`;
                if (visited.has(key)) continue;

                const block = layers[n.l][n.x][n.z];
                if (block && block.userData.type === type) {
                    visited.add(key);
                    queue.push(n);
                    breakBlock(block, true); // Chain reaction
                    minedCount++;
                    if (minedCount >= maxBlocks) break;
                }
            }
        }
    }

    function mineArea(gx, layerIdx, gz, radius) {
        for (let x = gx - radius; x <= gx + radius; x++) {
            for (let z = gz - radius; z <= gz + radius; z++) {
                if (x === gx && z === gz) continue; // Already mined
                if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) continue;

                const block = layers[layerIdx][x][z];
                if (block) {
                    // Only mine common blocks with area miner
                    if (['stone', 'dirt', 'grass', 'cobblestone'].includes(block.userData.type)) {
                        breakBlock(block, true);
                    }
                }
            }
        }
    }

    function spawnSapling(gx, gy, gz, growthTimer = 0) {
        const type = 'sapling';
        const geometry = new THREE.PlaneGeometry(0.7, 0.7);
        const mat = new THREE.MeshLambertMaterial({ 
            map: textures.sapling, 
            transparent: true, 
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });
        
        const plane1 = new THREE.Mesh(geometry, mat);
        plane1.rotation.y = Math.PI / 4;
        
        const plane2 = new THREE.Mesh(geometry, mat);
        plane2.rotation.y = -Math.PI / 4;
        
        const saplingGroup = new THREE.Group();
        saplingGroup.add(plane1);
        saplingGroup.add(plane2);
        
        saplingGroup.position.set(
            (gx - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE,
            gy * BLOCK_SIZE, // Center of block
            (gz - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE
        );
        
        // Adjust height. 0.7 height. Center is at 0.
        // We want bottom at -0.5 relative to block center.
        // So center should be at -0.5 + 0.35 = -0.15
        plane1.position.y = -0.15;
        plane2.position.y = -0.15;
        
        saplingGroup.userData = { 
            type: type, 
            gridX: gx, 
            gridZ: gz,
            isSapling: true,
            growthTimer: growthTimer,
            maxGrowthTime: 600 // 10 seconds at 60fps
        };
        
        // Progress Bar
        const barBg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.1),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        barBg.position.set(0, 0.5, 0);
        // Billboard
        barBg.userData.isBillboard = true;
        
        const barFg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.78, 0.08),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        barFg.position.z = 0.01;
        barFg.scale.x = 0;
        
        barBg.add(barFg);
        saplingGroup.add(barBg);
        saplingGroup.userData.progressBar = barFg;
        saplingGroup.userData.progressBarBg = barBg;
        
        scene.add(saplingGroup);
        extraBlocks.push(saplingGroup);
    }

    function placeBlock(gx, gy, gz, type) {
        // Deduct from inventory
        inventory[type]--;
        if (inventory[type] <= 0) {
            delete inventory[type];
            selectedItem = null;
        }
        updateInventoryUI();

        // Create Mesh
        if (type === 'sapling') {
            spawnSapling(gx, gy, gz);
            return;
        }

        let geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        let material = getMaterial(type);

        const block = new THREE.Mesh(geometry, material);
        block.position.set(
            (gx - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE,
            gy * BLOCK_SIZE,
            (gz - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE
        );
        
        block.castShadow = true;
        block.receiveShadow = true;
        block.userData = { type: type, gridX: gx, gridZ: gz }; // gridX/Z might be off if not in layer structure
        
        scene.add(block);
        extraBlocks.push(block);
    }

    function onMouseDown(event) {
        if (isAnimating) return;
        updateMouse(event);

        if (selectedItem) {
            const intersect = getIntersection();
            if (intersect) {
                const block = intersect.object;
                const face = intersect.face;
                
                const p = intersect.point.clone().add(face.normal.clone().multiplyScalar(BLOCK_SIZE * 0.5));
                
                const nx = Math.round(p.x / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
                const ny = Math.round(p.y / BLOCK_SIZE);
                const nz = Math.round(p.z / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
                
                if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
                    if (!getBlockAt(nx, ny, nz)) {
                        placeBlock(nx, ny, nz, selectedItem);
                        return;
                    }
                }
            }
        }

        isMining = true;
        const block = getBlockUnderMouse();
        if (block) startMining(block);
    }

    function onMouseUp(event) {
        isMining = false;
        cancelMining();
    }

    function onMouseMove(event) {
        updateMouse(event);
        checkCollection(); // Check if hovering over drops

        if (isMining) {
            const block = getBlockUnderMouse();
            if (block !== miningBlock) {
                if (block) {
                    startMining(block);
                } else {
                    cancelMining();
                }
            }
        }
    }

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
            onMouseDown(e);
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        onMouseUp(e);
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isMining && e.touches.length > 0) {
            onMouseMove(e);
        }
    }, { passive: false });


    function spawnBlock(gx, gy, gz, type) {
        // Check bounds
        if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return;

        // Helper to spawn block without inventory
        let geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        let material = getMaterial(type);
        const block = new THREE.Mesh(geometry, material);
        block.position.set(
            (gx - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE,
            gy * BLOCK_SIZE,
            (gz - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE
        );
        block.castShadow = true;
        block.receiveShadow = true;
        block.userData = { type: type, gridX: gx, gridZ: gz };
        scene.add(block);
        extraBlocks.push(block);
    }

    function updateSaplings() {
        for (let i = extraBlocks.length - 1; i >= 0; i--) {
            const block = extraBlocks[i];
            if (block.userData.isSapling) {
                block.userData.growthTimer++;
                
                // Update Billboard
                if (block.userData.progressBarBg) {
                    block.userData.progressBarBg.lookAt(camera.position);
                }
                
                // Update Progress
                const progress = block.userData.growthTimer / block.userData.maxGrowthTime;
                if (block.userData.progressBar) {
                    block.userData.progressBar.scale.x = progress;
                    // To scale from left, we need to adjust position?
                    // Default plane geometry is centered.
                    // If we scale x, it scales from center.
                    // We can just update scale.
                }
                
                if (block.userData.growthTimer >= block.userData.maxGrowthTime) {
                    // Grow!
                    const { gridX, gridY, gridZ } = block.userData;
                    // Wait, we didn't save gridY in userData in placeBlock for sapling?
                    // We saved gridX, gridZ.
                    // We can calculate gridY from position.
                    const gy = Math.round(block.position.y / BLOCK_SIZE);
                    
                    scene.remove(block);
                    extraBlocks.splice(i, 1);
                    
                    placeStructure(block.userData.gridX, gy, block.userData.gridZ, 'tree');
                }
            }
        }
    }

    // --- Particle System ---
    let particles = [];

    function spawnExplosionParticles(pos) {
        if (!textures.particle) return;

        const particleCount = 30;
        const material = new THREE.SpriteMaterial({ 
            map: textures.particle, 
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending
        });

        for (let i = 0; i < particleCount; i++) {
            const sprite = new THREE.Sprite(material);
            sprite.position.copy(pos);
            // Add some randomness to start position
            sprite.position.x += (Math.random() - 0.5) * 0.5;
            sprite.position.y += (Math.random() - 0.5) * 0.5;
            sprite.position.z += (Math.random() - 0.5) * 0.5;
            
            // Random velocity
            const speed = 0.1 + Math.random() * 0.3;
            sprite.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                (Math.random() - 0.5) * speed,
                (Math.random() - 0.5) * speed
            );
            
            sprite.userData.life = 1.0;
            const size = 0.3 + Math.random() * 0.4;
            sprite.scale.set(size, size, size);
            
            scene.add(sprite);
            particles.push(sprite);
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.position.add(p.userData.velocity);
            p.userData.velocity.y -= 0.005; // Slight gravity
            p.userData.velocity.multiplyScalar(0.95); // Drag
            p.userData.life -= 0.02;
            
            p.material.opacity = Math.max(0, p.userData.life);
            
            if (p.userData.life <= 0) {
                scene.remove(p);
                particles.splice(i, 1);
            }
        }
    }

    // --- Animation Loop ---
    let lastTime = 0;
    const fpsInterval = 1000 / 60;

    function animate(currentTime) {
        requestAnimationFrame(animate);

        if (!currentTime) currentTime = performance.now();
        const elapsed = currentTime - lastTime;

        if (elapsed > fpsInterval) {
            lastTime = currentTime - (elapsed % fpsInterval);

            processMining();
            updateDrops();
            updateSaplings();
            updateTNT();
            updateParticles();
            checkCollection();

            // Camera offset logic
            const targetOffset = extraBlocks.length > 0 ? 3.5 : 0;
            if (Math.abs(cameraOffsetY - targetOffset) > 0.01) {
                cameraOffsetY += (targetOffset - cameraOffsetY) * 0.05;
                camera.position.set(20, 14 + cameraOffsetY, 20);
                camera.lookAt(0, cameraOffsetY, 0);
            } else if (cameraOffsetY !== targetOffset) {
                 cameraOffsetY = targetOffset;
                 camera.position.set(20, 14 + cameraOffsetY, 20);
                 camera.lookAt(0, cameraOffsetY, 0);
            }

            composer.render();
        }
    }

    // Handle resize
    window.addEventListener('resize', () => {
        const aspect = canvas.clientWidth / canvas.clientHeight;
        const d = 5;
        camera.left = -d * aspect;
        camera.right = d * aspect;
        camera.top = d;
        camera.bottom = -d;
        camera.updateProjectionMatrix();
        
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        composer.setSize(canvas.clientWidth, canvas.clientHeight);
    });

    // Start
    initGame();
    animate();

    // --- Loot Table ---
    function getLoot(blockType) {
        if (blockType === 'leaves') {
            const drops = [];
            if (Math.random() < 0.05) drops.push('apple');
            if (Math.random() < 0.05) drops.push('stick');
            if (Math.random() < 0.05) drops.push('sapling');
            return drops;
        }
        if (blockType === 'stone') return ['cobblestone'];
        if (blockType === 'grass') return ['dirt'];
        if (blockType === 'coal') return ['coal'];
        if (blockType === 'iron') return ['iron'];
        if (blockType === 'gold') return ['gold'];
        if (blockType === 'diamond') return ['diamond'];
        if (blockType === 'emerald') return ['emerald'];
        if (blockType === 'log') return ['log'];
        if (blockType === 'dirt') return ['dirt'];
        if (blockType === 'cobblestone') return ['cobblestone'];
        
        return [blockType];
    }

    // --- Extrusion Logic ---
    const geometryCache = {};
    const extrusionCanvas = document.createElement('canvas');
    const extrusionCtx = extrusionCanvas.getContext('2d');

    function generateExtrudedGeometry(image, depth = 0.0625) { // 1/16
        const w = image.width;
        const h = image.height;
        extrusionCanvas.width = w;
        extrusionCanvas.height = h;
        extrusionCtx.drawImage(image, 0, 0);
        const data = extrusionCtx.getImageData(0, 0, w, h).data;

        const positions = [];
        const uvs = [];
        const normals = [];
        const indices = [];
        let indexOffset = 0;

        const addFace = (v1, v2, v3, v4, n, u1, u2, u3, u4) => {
            positions.push(...v1, ...v2, ...v3, ...v4);
            normals.push(...n, ...n, ...n, ...n);
            uvs.push(...u1, ...u2, ...u3, ...u4);
            indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
            indices.push(indexOffset, indexOffset + 2, indexOffset + 3);
            indexOffset += 4;
        };

        const isOpaque = (x, y) => {
            if (x < 0 || x >= w || y < 0 || y >= h) return false;
            return data[(y * w + x) * 4 + 3] > 10;
        };

        const px = 1 / w;
        const py = 1 / h;
        const d = depth / 2;

        // Scale factor to fit in 0.5x0.5 world unit
        const scale = 0.5; 
        const sx = scale / w;
        const sy = scale / h;
        const ox = -scale / 2;
        const oy = scale / 2;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (isOpaque(x, y)) {
                    const x0 = ox + x * sx;
                    const x1 = ox + (x + 1) * sx;
                    const y0 = oy - y * sy;
                    const y1 = oy - (y + 1) * sy;

                    const u0 = x * px;
                    const u1 = (x + 1) * px;
                    const v0 = 1 - y * py;
                    const v1 = 1 - (y + 1) * py;

                    // Front
                    addFace(
                        [x0, y0, d], [x0, y1, d], [x1, y1, d], [x1, y0, d],
                        [0, 0, 1],
                        [u0, v1], [u0, v0], [u1, v0], [u1, v1]
                    );

                    // Back
                    addFace(
                        [x1, y0, -d], [x1, y1, -d], [x0, y1, -d], [x0, y0, -d],
                        [0, 0, -1],
                        [u1, v1], [u1, v0], [u0, v0], [u0, v1]
                    );

                    // Top
                    if (!isOpaque(x, y - 1)) {
                        addFace(
                            [x0, y0, -d], [x0, y0, d], [x1, y0, d], [x1, y0, -d],
                            [0, 1, 0],
                            [u0, v1], [u0, v1], [u1, v1], [u1, v1] // Map to pixel top edge
                        );
                    }
                    // Bottom
                    if (!isOpaque(x, y + 1)) {
                        addFace(
                            [x0, y1, d], [x0, y1, -d], [x1, y1, -d], [x1, y1, d],
                            [0, -1, 0],
                            [u0, v0], [u0, v0], [u1, v0], [u1, v0] // Map to pixel bottom edge
                        );
                    }
                    // Left
                    if (!isOpaque(x - 1, y)) {
                        addFace(
                            [x0, y0, -d], [x0, y1, -d], [x0, y1, d], [x0, y0, d],
                            [-1, 0, 0],
                            [u0, v1], [u0, v0], [u0, v0], [u0, v1] // Map to pixel left edge
                        );
                    }
                    // Right
                    if (!isOpaque(x + 1, y)) {
                        addFace(
                            [x1, y0, d], [x1, y1, d], [x1, y1, -d], [x1, y0, -d],
                            [1, 0, 0],
                            [u1, v1], [u1, v0], [u1, v0], [u1, v1] // Map to pixel right edge
                        );
                    }
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        return geometry;
    }

    // Shop System
    window.toggleShop = function() {
        const shop = document.getElementById('shop-modal');
        if (shop.style.display === 'none' || !shop.style.display) {
            shop.style.display = 'flex';
            updateShopUI();
        } else {
            shop.style.display = 'none';
        }
    };

    function updateShopUI() {
        const content = document.getElementById('shop-content');
        content.innerHTML = '<h2>Shop</h2>';

        // Sell Section
        const sellDiv = document.createElement('div');
        sellDiv.className = 'shop-section';
        sellDiv.innerHTML = '<h3>Sell Ores</h3>';
        
        Object.entries(SELL_PRICES).forEach(([type, price]) => {
            const count = inventory[type] || 0;
            if (count > 0) {
                const btn = document.createElement('button');
                btn.className = 'shop-btn';
                btn.innerHTML = `Sell ${type} (${count}) - $${price * count}`;
                btn.onclick = () => sellOre(type);
                sellDiv.appendChild(btn);
            }
        });
        content.appendChild(sellDiv);

        // Upgrade Section
        const upgradeDiv = document.createElement('div');
        upgradeDiv.className = 'shop-section';
        upgradeDiv.innerHTML = '<h3>Upgrades</h3>';

        Object.entries(UPGRADE_COSTS).forEach(([type, costFunc]) => {
            const currentLevel = upgrades[type];
            const cost = costFunc(currentLevel);
            
            const btn = document.createElement('button');
            btn.className = 'shop-btn';
            btn.innerHTML = `Upgrade ${type} (Lvl ${currentLevel}) - $${cost}`;
            if (score < cost) btn.disabled = true;
            btn.onclick = () => buyUpgrade(type);
            upgradeDiv.appendChild(btn);
        });
        content.appendChild(upgradeDiv);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'shop-btn close-btn';
        closeBtn.innerText = 'Close';
        closeBtn.style.marginTop = '20px';
        closeBtn.onclick = window.toggleShop;
        content.appendChild(closeBtn);
    }

    function sellOre(type) {
        const count = inventory[type] || 0;
        if (count > 0) {
            const price = SELL_PRICES[type];
            score += price * count;
            inventory[type] = 0;
            scoreDisplay.innerText = score;
            updateInventoryUI();
            updateShopUI();
            saveGame();
        }
    }

    function buyUpgrade(type) {
        const costFunc = UPGRADE_COSTS[type];
        const currentLevel = upgrades[type];
        const cost = costFunc(currentLevel);

        if (score >= cost) {
            score -= cost;
            upgrades[type]++;
            
            if (type === 'grid_size') {
                expandGrid();
            }

            scoreDisplay.innerText = score;
            updateShopUI();
            saveGame();
        }
    }

    function expandGrid() {
        const oldSize = GRID_SIZE;
        const oldVisibleLayers = VISIBLE_LAYERS;

        GRID_SIZE = 5 + (upgrades.grid_size * 2);
        VISIBLE_LAYERS = 7 + upgrades.grid_size;
        
        const offsetDiff = (GRID_SIZE - oldSize) / 2;
        
        // Adjust camera
        const d = 5 + upgrades.grid_size;
        camera.left = -d * aspect;
        camera.right = d * aspect;
        camera.top = d;
        camera.bottom = -d;
        camera.updateProjectionMatrix();

        // Migrate layers
        const newLayers = [];
        layers.forEach((oldLayer, layerIdx) => {
            const newLayer = [];
            for (let x = 0; x < GRID_SIZE; x++) {
                newLayer[x] = [];
                for (let z = 0; z < GRID_SIZE; z++) {
                    // Map old coordinates to new centered coordinates
                    const oldX = x - offsetDiff;
                    const oldZ = z - offsetDiff;
                    
                    if (oldX >= 0 && oldX < oldSize && oldZ >= 0 && oldZ < oldSize) {
                        // Existing block
                        const block = oldLayer[oldX][oldZ];
                        newLayer[x][z] = block;
                        if (block) {
                            // Update position
                            const offset = (GRID_SIZE * BLOCK_SIZE) / 2 - (BLOCK_SIZE / 2);
                            block.position.x = x * BLOCK_SIZE - offset;
                            block.position.z = z * BLOCK_SIZE - offset;
                        }
                    } else {
                        // New outer block
                        // Generate block based on depth
                        // We use the global 'depth' variable + layerIdx
                        const absDepth = depth + layerIdx;
                        const type = getBlockTypeForDepth(absDepth);
                        
                        const block = createBlock(x, -layerIdx, z, type);
                        newLayer[x][z] = block;
                        scene.add(block);
                    }

                }
            }
            newLayers.push(newLayer);
        });
        layers = newLayers;

        // Add new layers at the bottom if VISIBLE_LAYERS increased
        while (layers.length < VISIBLE_LAYERS) {
            const layerIdx = layers.length;
            const absDepth = depth + layerIdx;
            layers.push(generateLayer(layerIdx, absDepth));
        }
    }

    // --- TNT System ---
    function updateTNT() {
        // Spawning
        if (upgrades.tnt_frequency > 0) {
            // Base interval 60s, decreases by 5s per level, min 5s
            const interval = Math.max(5000, 60000 - (upgrades.tnt_frequency * 5000));
            
            // Use performance.now() for smoother timing if needed, but simple counter is fine for now
            // Actually, let's use a delta time approach if we had one, but we don't.
            // Assuming 60fps, 16.6ms per frame.
            tntTimer += 16.6;
            
            if (tntTimer >= interval) {
                tntTimer = 0;
                spawnTNT();
            }
        }

        // Physics
        for (let i = tntProjectiles.length - 1; i >= 0; i--) {
            const tnt = tntProjectiles[i];
            
            // Initialize fuse if not present (for existing TNTs)
            if (tnt.userData.fuse === undefined) tnt.userData.fuse = 120;
            if (tnt.userData.landed === undefined) tnt.userData.landed = false;

            // Flashing effect
            tnt.userData.flashTimer += 1;
            // Flash faster as fuse runs out
            const flashInterval = tnt.userData.fuse < 60 ? 5 : 10;
            
            if (tnt.userData.flashTimer % flashInterval === 0) {
                tnt.userData.isFlashing = !tnt.userData.isFlashing;
                if (tnt.userData.isFlashing) {
                    if (!tnt.userData.whiteMaterial) {
                         tnt.userData.whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    }
                    tnt.material = tnt.userData.whiteMaterial;
                } else {
                    tnt.material = tnt.userData.originalMaterials;
                }
            }

            if (!tnt.userData.landed) {
                tnt.position.y -= 0.1; // Fall speed

                const gx = Math.round(tnt.position.x / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
                const gz = Math.round(tnt.position.z / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
                const gy = Math.round(tnt.position.y / BLOCK_SIZE);

                // Check if we hit a block
                const block = getBlockAt(gx, gy, gz);
                
                if (block) {
                    // Land on top
                    tnt.userData.landed = true;
                    tnt.position.y = block.position.y + BLOCK_SIZE;
                    // Snap to grid
                    tnt.position.x = (gx - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE;
                    tnt.position.z = (gz - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE;
                } else if (gy < -depth - 5) { 
                    // Fell too far
                    tntProjectiles.splice(i, 1);
                    scene.remove(tnt);
                }
            } else {
                // Landed logic
                // Check if block below still exists
                const gx = Math.round(tnt.position.x / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
                const gz = Math.round(tnt.position.z / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
                const gyBelow = Math.round((tnt.position.y - BLOCK_SIZE) / BLOCK_SIZE);
                
                const blockBelow = getBlockAt(gx, gyBelow, gz);
                if (!blockBelow && tnt.position.y > -depth - 1) {
                    tnt.userData.landed = false; // Start falling again
                }
                
                tnt.userData.fuse--;
                if (tnt.userData.fuse <= 0) {
                    explodeTNT(tnt);
                    tntProjectiles.splice(i, 1);
                }
            }
        }
    }

    function spawnTNT() {
        const gx = Math.floor(Math.random() * GRID_SIZE);
        const gz = Math.floor(Math.random() * GRID_SIZE);
        
        const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        
        const materials = [
            new THREE.MeshLambertMaterial({ map: textures.tnt_side }), // px
            new THREE.MeshLambertMaterial({ map: textures.tnt_side }), // nx
            new THREE.MeshLambertMaterial({ map: textures.tnt_top }),  // py (top)
            new THREE.MeshLambertMaterial({ map: textures.tnt_bottom }), // ny (bottom)
            new THREE.MeshLambertMaterial({ map: textures.tnt_side }), // pz
            new THREE.MeshLambertMaterial({ map: textures.tnt_side })  // nz
        ];
        
        const tnt = new THREE.Mesh(geometry, materials);
        
        tnt.position.set(
            (gx - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE,
            10, // Start high up
            (gz - (GRID_SIZE/2 - 0.5)) * BLOCK_SIZE
        );
        
        tnt.userData = {
            flashTimer: 0,
            isFlashing: false,
            originalMaterials: materials,
            fuse: 120, // 2 seconds at 60fps
            landed: false
        };

        scene.add(tnt);
        tntProjectiles.push(tnt);
    }

    function explodeTNT(tnt) {
        spawnExplosionParticles(tnt.position);
        scene.remove(tnt);
        
        // Explosion effect (simple)
        // Radius based on power: 0 -> 1 (3x3), 1 -> 2 (5x5)
        const radius = 1 + upgrades.tnt_power;
        
        const gx = Math.round(tnt.position.x / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
        const gz = Math.round(tnt.position.z / BLOCK_SIZE + (GRID_SIZE/2 - 0.5));
        
        // Find the layer we hit. Since TNT falls, it likely hit the top-most block at gx,gz.
        // But we might have hit a specific Y.
        // Let's just explode around the impact point.
        // We need to find the layer index corresponding to the impact Y.
        // tnt.position.y is roughly the block Y.
        
        const impactY = Math.round(tnt.position.y / BLOCK_SIZE);
        
        // Find layer index
        // layers[0] is at y = -depth
        // layers[1] is at y = -depth - 1
        // So y = -depth - layerIdx
        // layerIdx = -depth - y
        
        // Wait, layers are generated at `depth + i`.
        // `createBlock` uses `y = -layerIdx`.
        // But `generateLayer` calls `createBlock` with `y`?
        // No, `generateLayer` returns a 2D array of types.
        // `loadGame` rebuilds layers: `createBlock(x, -layerIdx, z, type)`.
        // So visually, layer 0 is at Y=0?
        
        // Ah, `createBlock` sets `block.position.y = y * BLOCK_SIZE`.
        // In `loadGame`, `y` is passed as `-layerIdx`.
        // So layer 0 is at Y=0. Layer 1 is at Y=-1.
        // But `advanceLevel` shifts layers. `layers.shift()`.
        // And `animate` moves blocks up.
        // `allBlocks.forEach((b, i) => { b.position.y = startPositions[i] + offset; });`
        // So the visual Y position changes!
        
        // This makes `getBlockAt` tricky if it relies on `layers` array index matching Y.
        // `getBlockAt`:
        // `if (y <= 0) { const layerIdx = -y; ... }`
        // This assumes layer 0 is at Y=0, layer 1 at Y=-1.
        // But if we advanced a level, the blocks moved UP.
        // So the block that was at Y=-1 is now at Y=0.
        // And it is now in `layers[0]`.
        // So `getBlockAt` logic holds: `layers[0]` is always at Y=0 (visually, after animation).
        
        // So `impactY` should correspond to `-layerIdx`.
        // `layerIdx = -impactY`.
        
        const centerLayerIdx = -impactY;
        
        // Explode in radius
        // We want a sphere or cylinder explosion?
        // Let's do a simple cube/cylinder explosion across layers.
        
        for (let l = centerLayerIdx - radius; l <= centerLayerIdx + radius; l++) {
            if (l < 0 || l >= layers.length) continue;
            
            for (let x = gx - radius; x <= gx + radius; x++) {
                for (let z = gz - radius; z <= gz + radius; z++) {
                    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) continue;
                    
                    // Distance check for round explosion
                    const dx = x - gx;
                    const dz = z - gz;
                    const dl = l - centerLayerIdx;
                    if (dx*dx + dz*dz + dl*dl > radius*radius) continue;

                    const block = layers[l][x][z];
                    if (block) {
                        breakBlock(block, true);
                    }
                }
            }
        }
        
        // Also check extra blocks (trees)
        for (let i = extraBlocks.length - 1; i >= 0; i--) {
            const b = extraBlocks[i];
            const bx = b.userData.gridX;
            const bz = b.userData.gridZ;
            const by = Math.round(b.position.y / BLOCK_SIZE);
            
            const dx = bx - gx;
            const dz = bz - gz;
            const dy = by - impactY;
            
            if (dx*dx + dz*dz + dy*dy <= radius*radius) {
                breakBlock(b, true);
            }
        }
        
        checkLayerCleared();
    }

    // Floating Item Animation
    function createFloatingItem(type, startX, startY, count) {
        const img = document.createElement('img');
        let iconName = type;
        if (type === 'coal') iconName = 'coal_ore';
        if (type === 'iron') iconName = 'iron_ore';
        if (type === 'gold') iconName = 'gold_ore';
        if (type === 'diamond') iconName = 'diamond_ore';
        if (type === 'emerald') iconName = 'emerald_ore';
        if (type === 'log') iconName = 'log_oak';
        if (type === 'leaves') iconName = 'leaves_oak';
        if (type === 'grass') iconName = 'grass_side';
        if (type === 'stick') iconName = 'stick';
        if (type === 'sapling') iconName = 'sapling_oak';
        if (type === 'apple') iconName = 'apple';
        if (type === 'planks') iconName = 'planks_oak';
        if (type === 'wood_pickaxe') iconName = 'wood_pickaxe';
        if (type === 'stone_pickaxe') iconName = 'stone_pickaxe';
        if (type === 'iron_pickaxe') iconName = 'iron_pickaxe';
        if (type === 'gold_pickaxe') iconName = 'gold_pickaxe';
        if (type === 'diamond_pickaxe') iconName = 'diamond_pickaxe';
        
        if (['apple', 'stick', 'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'gold_pickaxe', 'diamond_pickaxe'].includes(type)) {
            img.src = `items/${iconName}.png`;
        } else {
            img.src = `blocks/${iconName}.png`;
        }

        img.style.position = 'absolute';
        img.style.left = `${startX}px`;
        img.style.top = `${startY}px`;
        img.style.width = '32px';
        img.style.height = '32px';
        img.style.pointerEvents = 'none';
        img.style.zIndex = '1000';
        
        document.body.appendChild(img);

        // Find target
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        let targetX = (window.innerWidth / 2) + scrollX;
        let targetY = (window.innerHeight - 50) + scrollY;
        
        const slot = document.querySelector(`.inventory-slot[data-type="${type}"]`);
        if (slot) {
            const rect = slot.getBoundingClientRect();
            targetX = rect.left + rect.width / 2 - 16 + scrollX;
            targetY = rect.top + rect.height / 2 - 16 + scrollY;
        }

        // Control point for Bezier curve
        // "Fly away from inv bar" -> Fly UP first
        // We want a point that is higher (lower Y) than both start and end
        const cpX = (startX + targetX) / 2 + (Math.random() * 100 - 50);
        const cpY = Math.min(startY, targetY) - 150 - (Math.random() * 50);

        const startTime = Date.now();
        const duration = 600; // ms

        function animate() {
            const now = Date.now();
            const progress = Math.min((now - startTime) / duration, 1);
            
            // Quadratic Bezier
            // B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
            const t = progress;
            const invT = 1 - t;
            
            const x = (invT * invT * startX) + (2 * invT * t * cpX) + (t * t * targetX);
            const y = (invT * invT * startY) + (2 * invT * t * cpY) + (t * t * targetY);
            
            img.style.left = `${x}px`;
            img.style.top = `${y}px`;
            
            // Scale and opacity effects
            if (progress > 0.8) {
                img.style.opacity = `${1 - (progress - 0.8) * 5}`; // Fade out in last 20%
                img.style.transform = `scale(${1 - (progress - 0.8) * 2.5})`; // Shrink in last 20%
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                if (img.parentNode) {
                    document.body.removeChild(img);
                }
                addToInventory(type, count);
            }
        }

        requestAnimationFrame(animate);

    }
});
