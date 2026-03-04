/**
 * CRT Canvas Renderer
 * Renders content to a canvas with WebGL barrel distortion shader
 * Handles input coordinate transformation automatically
 */
class CRTCanvasRenderer {
    /**
     * @param {HTMLElement} sourceElement - Element to render (will be hidden)
     * @param {Object} options - Configuration options
     */
    constructor(sourceElement, options = {}) {
        this.source = sourceElement;
        this.options = {
            bulgeStrength: options.bulgeStrength ?? 0.08,
            scanlineIntensity: options.scanlineIntensity ?? 0.1,
            vignetteStrength: options.vignetteStrength ?? 0.2,
            fps: options.fps ?? 60,
            ...options
        };
        
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.animationId = null;
        
        this.init();
    }

    /**
     * Initialize the canvas and WebGL context
     */
    init() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'crt-canvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
        `;
        
        // Insert canvas before source
        this.source.parentNode.insertBefore(this.canvas, this.source);
        
        // Hide source but keep it functional
        this.source.style.position = 'absolute';
        this.source.style.opacity = '0';
        this.source.style.pointerEvents = 'none';
        
        // Get WebGL context
        this.gl = this.canvas.getContext('webgl', { 
            alpha: true, 
            antialias: false,
            preserveDrawingBuffer: true 
        });
        
        if (!this.gl) {
            console.error('WebGL not supported, falling back to source element');
            this.source.style.opacity = '1';
            this.source.style.pointerEvents = 'auto';
            this.canvas.remove();
            return;
        }
        
        this.setupShaders();
        this.setupGeometry();
        this.setupTexture();
        this.setupEventListeners();
        this.resize();
        
        window.addEventListener('resize', () => this.resize());
        
        this.startRenderLoop();
    }

    /**
     * Create and compile WebGL shaders
     */
    setupShaders() {
        const gl = this.gl;
        
        // Vertex shader
        const vertexSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;
        
        // Fragment shader with barrel distortion
        const fragmentSource = `
            precision mediump float;
            
            uniform sampler2D u_texture;
            uniform vec2 u_resolution;
            uniform float u_bulgeStrength;
            uniform float u_scanlineIntensity;
            uniform float u_vignetteStrength;
            uniform float u_time;
            
            varying vec2 v_texCoord;
            
            vec2 barrelDistort(vec2 uv) {
                // Center UV around origin
                vec2 centered = uv * 2.0 - 1.0;
                
                // Calculate distance from center
                float distSq = dot(centered, centered);
                
                // Apply barrel distortion
                float distortion = 1.0 + u_bulgeStrength * distSq;
                centered *= distortion;
                
                // Convert back to 0-1 range
                return centered * 0.5 + 0.5;
            }
            
            void main() {
                // Apply barrel distortion
                vec2 distortedUV = barrelDistort(v_texCoord);
                
                // Check if UV is out of bounds
                if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || 
                    distortedUV.y < 0.0 || distortedUV.y > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }
                
                // Sample texture
                vec4 color = texture2D(u_texture, distortedUV);
                
                // Scanlines
                float scanline = sin(distortedUV.y * u_resolution.y * 1.5) * 0.5 + 0.5;
                color.rgb *= 1.0 - (u_scanlineIntensity * (1.0 - scanline));
                
                // Subtle RGB shift for chromatic aberration
                float shift = u_bulgeStrength * 0.002;
                float r = texture2D(u_texture, distortedUV + vec2(shift, 0.0)).r;
                float b = texture2D(u_texture, distortedUV - vec2(shift, 0.0)).b;
                color.r = mix(color.r, r, 0.5);
                color.b = mix(color.b, b, 0.5);
                
                // Vignette
                vec2 vignetteUV = v_texCoord * 2.0 - 1.0;
                float vignette = 1.0 - dot(vignetteUV, vignetteUV) * u_vignetteStrength;
                color.rgb *= vignette;
                
                gl_FragColor = color;
            }
        `;
        
        // Compile shaders
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
        
        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Shader program failed to link:', gl.getProgramInfoLog(this.program));
        }
        
        gl.useProgram(this.program);
        
        // Get uniform locations
        this.uniforms = {
            texture: gl.getUniformLocation(this.program, 'u_texture'),
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            bulgeStrength: gl.getUniformLocation(this.program, 'u_bulgeStrength'),
            scanlineIntensity: gl.getUniformLocation(this.program, 'u_scanlineIntensity'),
            vignetteStrength: gl.getUniformLocation(this.program, 'u_vignetteStrength'),
            time: gl.getUniformLocation(this.program, 'u_time')
        };
    }

    /**
     * Compile a shader
     */
    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }

    /**
     * Set up geometry (full-screen quad)
     */
    setupGeometry() {
        const gl = this.gl;
        
        // Position attribute
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1,  1,  1, -1,   1, 1
        ]), gl.STATIC_DRAW);
        
        const positionLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
        
        // Texture coordinate attribute
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 1,  1, 1,  0, 0,
            0, 0,  1, 1,  1, 0
        ]), gl.STATIC_DRAW);
        
        const texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    }

    /**
     * Set up texture for rendering source element
     */
    setupTexture() {
        const gl = this.gl;
        
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    /**
     * Handle canvas resize
     */
    resize() {
        const rect = this.source.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Apply inverse barrel distortion to get source coordinates from canvas coordinates
     */
    inverseDistort(canvasX, canvasY) {
        const rect = this.canvas.getBoundingClientRect();
        
        // Normalize to 0-1
        let u = canvasX / rect.width;
        let v = canvasY / rect.height;
        
        // Center around 0
        let x = u * 2 - 1;
        let y = v * 2 - 1;
        
        // Iteratively solve inverse (Newton-Raphson)
        for (let i = 0; i < 10; i++) {
            const distSq = x * x + y * y;
            const distortion = 1 + this.options.bulgeStrength * distSq;
            
            // The forward transform is: distorted = original * distortion
            // So inverse is approximately: original = distorted / distortion
            x = (u * 2 - 1) / distortion;
            y = (v * 2 - 1) / distortion;
        }
        
        // Convert back to pixel coordinates
        const sourceX = ((x + 1) / 2) * rect.width;
        const sourceY = ((y + 1) / 2) * rect.height;
        
        return { x: sourceX, y: sourceY };
    }

    /**
     * Set up event listeners for mouse/touch input
     */
    setupEventListeners() {
        const forwardEvent = (e, type) => {
            const rect = this.canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            
            const sourceCoords = this.inverseDistort(canvasX, canvasY);
            const sourceX = rect.left + sourceCoords.x;
            const sourceY = rect.top + sourceCoords.y;
            
            // Find element at transformed position in source
            this.source.style.pointerEvents = 'auto';
            this.source.style.opacity = '0.001'; // Nearly invisible but still there
            const element = document.elementFromPoint(sourceX, sourceY);
            this.source.style.pointerEvents = 'none';
            this.source.style.opacity = '0';
            
            if (element && this.source.contains(element)) {
                const newEvent = new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: sourceX,
                    clientY: sourceY,
                    button: e.button,
                    buttons: e.buttons
                });
                element.dispatchEvent(newEvent);
                
                // Update cursor
                this.canvas.style.cursor = window.getComputedStyle(element).cursor;
            }
        };

        // Mouse events
        this.canvas.addEventListener('click', (e) => forwardEvent(e, 'click'));
        this.canvas.addEventListener('mousedown', (e) => forwardEvent(e, 'mousedown'));
        this.canvas.addEventListener('mouseup', (e) => forwardEvent(e, 'mouseup'));
        this.canvas.addEventListener('mousemove', (e) => forwardEvent(e, 'mousemove'));
        this.canvas.addEventListener('dblclick', (e) => forwardEvent(e, 'dblclick'));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            forwardEvent(e, 'contextmenu');
        });

        // Wheel events
        this.canvas.addEventListener('wheel', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            
            const sourceCoords = this.inverseDistort(canvasX, canvasY);
            const sourceX = rect.left + sourceCoords.x;
            const sourceY = rect.top + sourceCoords.y;
            
            this.source.style.pointerEvents = 'auto';
            const element = document.elementFromPoint(sourceX, sourceY);
            this.source.style.pointerEvents = 'none';
            
            if (element && this.source.contains(element)) {
                element.dispatchEvent(new WheelEvent('wheel', {
                    bubbles: true,
                    clientX: sourceX,
                    clientY: sourceY,
                    deltaX: e.deltaX,
                    deltaY: e.deltaY,
                    deltaMode: e.deltaMode
                }));
            }
        }, { passive: true });

        // Keyboard events should go to focused elements naturally
        // Focus management
        this.canvas.addEventListener('mousedown', () => {
            // Focus the terminal when clicking canvas
            const terminal = this.source.querySelector('.xterm-helper-textarea');
            if (terminal) {
                terminal.focus();
            }
        });
    }

    /**
     * Capture source element to texture using html2canvas
     */
    async captureSource() {
        const gl = this.gl;
        
        // Use html2canvas to render the source element
        try {
            const canvas = await html2canvas(this.source, {
                backgroundColor: null,
                scale: window.devicePixelRatio || 1,
                logging: false,
                useCORS: true
            });
            
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        } catch (err) {
            console.error('Failed to capture source:', err);
        }
    }

    /**
     * Render frame
     */
    render(time) {
        const gl = this.gl;
        
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Set uniforms
        gl.uniform1i(this.uniforms.texture, 0);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.bulgeStrength, this.options.bulgeStrength);
        gl.uniform1f(this.uniforms.scanlineIntensity, this.options.scanlineIntensity);
        gl.uniform1f(this.uniforms.vignetteStrength, this.options.vignetteStrength);
        gl.uniform1f(this.uniforms.time, time * 0.001);
        
        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    /**
     * Start the render loop
     */
    startRenderLoop() {
        const frameInterval = 1000 / this.options.fps;
        let lastCapture = 0;
        
        const loop = async (time) => {
            // Capture at reduced rate to save performance
            if (time - lastCapture > frameInterval) {
                await this.captureSource();
                lastCapture = time;
            }
            
            this.render(time);
            this.animationId = requestAnimationFrame(loop);
        };
        
        this.animationId = requestAnimationFrame(loop);
    }

    /**
     * Stop rendering
     */
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.canvas.remove();
        this.source.style.opacity = '1';
        this.source.style.pointerEvents = 'auto';
    }
}

// Export for use
window.CRTCanvasRenderer = CRTCanvasRenderer;
