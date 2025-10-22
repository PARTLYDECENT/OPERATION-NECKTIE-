/**
 * =============================================================================
 * ENHANCED AUDIO ENGINE
 * =============================================================================
 * * - Modernized with `fetch` and `async/await`.
 * - Implemented a robust speech queue for "dialogue".
 * - Centralized sound loading and buffer management.
 * - Refactored procedural 'reload' sound to be clock-accurate.
 * - Added `stopAllSounds` and `setMasterVolume` helpers.
 */
const AudioEngine = {
    ctx: null,
    isInitialized: false,
    masterGain: null,

    // Central store for all loaded sound buffers
    buffers: new Map(),

    // Active looping sources
    ambientSource: null,
    ambientGain: null,
    horrorSource: null,
    horrorGain: null,

    // Speech Synthesis "Dialogue" Queue
    speechQueue: [],
    isSpeaking: false,
    voices: [],

    /**
     * Initializes the AudioContext and loads initial sounds.
     * This MUST be called from a user gesture (e.g., a 'click' event).
     */
    init() {
        if (this.isInitialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.ctx.resume(); // Essential for autoplay policies

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            // Initialize speech synthesis and load voices
            if ('speechSynthesis' in window) {
                window.speechSynthesis.onvoiceschanged = () => {
                    this.voices = window.speechSynthesis.getVoices();
                    console.log(`Audio Engine: ${this.voices.length} voices loaded.`);
                };
                this.voices = window.speechSynthesis.getVoices(); // Initial load
            }

            this.isInitialized = true;
            console.log("Audio Engine Initialized.");
            
            // Load initial sounds (retains original behavior)
            // this.loadAmbientSound('../assets/sounds/ambient.wav'); // Original commented out
            this.loadHorrorSound('../assets/sounds/horror_ambient.wav');

        } catch (e) { 
            console.error("Web Audio API is not supported in this browser", e); 
        }
    },

    /**
     * [ENHANCED] Private loader using modern Fetch API.
     * @param {string} url - Path to the audio file.
     * @returns {Promise<AudioBuffer|null>}
     */
    async _loadSoundInternal(url) {
        if (!this.isInitialized) {
            console.error("Audio Engine not initialized. Call init() first.");
            return null;
        }
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load sound file. Status: ${response.status} for ${url}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            // Use await for decodeAudioData, as it returns a Promise
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (e) {
            console.error(`Error loading or decoding audio data for ${url}`, e);
            return null;
        }
    },

    /**
     * [NEW] Generic sound loader.
     * Loads a sound and stores it in the buffer Map.
     * @param {string} name - The key to store the buffer under (e.g., 'ambient', 'horror').
     * @param {string} url - The path to the sound file.
     * @returns {Promise<AudioBuffer|null>}
     */
    async loadSound(name, url) {
        if (this.buffers.has(name)) {
            return this.buffers.get(name);
        }
        console.log(`Loading sound: "${name}" from ${url}`);
        const buffer = await this._loadSoundInternal(url);
        if (buffer) {
            this.buffers.set(name, buffer);
            console.log(`Sound loaded successfully: "${name}"`);
        }
        return buffer;
    },

    /**
     * [ENHANCED] Kept original public API, now uses new loader.
     */
    async loadAmbientSound(url) {
        const buffer = await this.loadSound('ambient', url);
        if (buffer) {
            this._playAmbient(); // Automatically play when loaded
        }
    },

    /**
     * [ENHANCED] Kept original public API, now uses new loader.
     */
    async loadHorrorSound(url) {
        const buffer = await this.loadSound('horror', url);
        if (buffer) {
            this._playHorror(); // Automatically play when loaded
        }
    },

    /**
     * [NEW] Private helper to create a looping source.
     * @param {AudioBuffer} buffer - The buffer to play.
     * @param {number} initialGain - The starting volume.
     * @returns {{source: AudioBufferSourceNode, gain: GainNode}|null}
     */
    _createLoopingSource(buffer, initialGain = 1.0) {
        if (!this.isInitialized || !buffer) return null;
        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        
        source.buffer = buffer;
        source.loop = true;
        gain.gain.setValueAtTime(initialGain, this.ctx.currentTime);
        
        source.connect(gain);
        gain.connect(this.masterGain);
        source.start(0);
        
        return { source, gain };
    },

    /**
     * [ENHANCED] Uses the new buffer Map.
     */
    _playAmbient() {
        const buffer = this.buffers.get('ambient');
        if (!this.isInitialized || !buffer || this.ambientSource) return;

        const components = this._createLoopingSource(buffer, 0.1);
        if (components) {
            this.ambientSource = components.source;
            this.ambientGain = components.gain;
            console.log("Playing ambient sound.");
        }
    },

    /**
     * [ENHANCED] Uses the new buffer Map.
     */
    _playHorror() {
        const buffer = this.buffers.get('horror');
        if (!this.isInitialized || !buffer || this.horrorSource) return;
        
        const components = this._createLoopingSource(buffer, 0.0); // Start silent
        if (components) {
            this.horrorSource = components.source;
            this.horrorGain = components.gain;
            console.log("Playing horror ambient sound (silently).");
        }
    },

    /**
     * [ENHANCED] Robust "dialogue" system with a queue.
     */
    speak(text, options, onEndCallback) {
        if (!('speechSynthesis' in window)) {
            console.warn("Speech synthesis not supported.");
            if (onEndCallback) onEndCallback();
            return;
        }
        
        // Add to queue and process it
        this.speechQueue.push({ text, options: options || {}, onEndCallback });
        this._processSpeechQueue();
    },

    /**
     * [NEW] Private method to process the speech queue sequentially.
     */
    _processSpeechQueue() {
        if (this.isSpeaking || this.speechQueue.length === 0) {
            return;
        }
        this.isSpeaking = true;
        
        const item = this.speechQueue.shift();
        const { text, options, onEndCallback } = item;
        
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Set options
            utterance.pitch = (typeof options.pitch === 'number') ? options.pitch : 0.95;
            utterance.rate = (typeof options.rate === 'number') ? options.rate : 0.95;
            utterance.volume = (typeof options.volume === 'number') ? options.volume : 1.0;

            // Voice selection
            if (this.voices.length > 0) {
                let foundVoice = null;
                if (options.voice) { // Find by name first
                    foundVoice = this.voices.find(v => v.name === options.voice);
                } else if (options.preferDeep) {
                    foundVoice = this.voices.find(v => /male|david|daniel|alex|mark|john/i.test(v.name) && /en/i.test(v.lang)) ||
                                    this.voices.find(v => /en/i.test(v.lang));
                } else if (options.preferSoft) {
                    foundVoice = this.voices.find(v => /female|susan|katherine|zira|alloy/i.test(v.name) && /en/i.test(v.lang)) ||
                                    this.voices.find(v => /en/i.test(v.lang));
                }
                utterance.voice = foundVoice || this.voices.find(v => /en/i.test(v.lang)) || this.voices[0];
            }

            // Set up callbacks
            utterance.onend = () => {
                this.isSpeaking = false;
                if (onEndCallback) {
                    try { onEndCallback(); } 
                    catch (e) { console.error("Error in speech 'onend' callback:", e); }
                }
                this._processSpeechQueue(); // Process next item
            };

            utterance.onerror = (e) => {
                console.error("Speech synthesis error:", e);
                this.isSpeaking = false;
                this._processSpeechQueue(); // Try next item even on error
            };

            window.speechSynthesis.speak(utterance);

        } catch (e) {
            console.error("Failed to speak:", e);
            this.isSpeaking = false;
            if (onEndCallback) onEndCallback();
            this._processSpeechQueue(); // Ensure queue continues
        }
    },

    /**
     * [NEW] Stops currently playing speech and clears the queue.
     */
    stopSpeech() {
        if (!('speechSynthesis' in window)) return;
        this.speechQueue = []; // Clear the pending queue
        this.isSpeaking = false;
        window.speechSynthesis.cancel(); // Stop currently speaking utterance
    },

    speakFriendly(text, onEndCallback) {
        this.speak(text, { pitch: 1.05, rate: 1.0, volume: 1.0, preferSoft: true }, onEndCallback);
    },
    
    speakEnemy(text, onEndCallback) {
        this.play('enemyGrowl'); // Play growl immediately
        this.speak(text, { pitch: 0.45, rate: 0.9, volume: 1.0, preferDeep: true }, onEndCallback);
    },
    
    _play(sound) { 
        if (!this.isInitialized) return; 
        sound(this.ctx, this.masterGain); 
    },
    
    /**
     * Plays a procedural sound from the `sounds` object.
     * @param {string} soundName - The key of the sound to play.
     */
    play(soundName) {
        if (!this.isInitialized) {
            console.warn("Audio Engine not initialized.");
            return;
        }
        if (!this.sounds[soundName]) {
            console.warn(`Sound "${soundName}" not found in procedural sounds.`);
            return;
        }
        this._play(this.sounds[soundName]);
    },

    updateHealthEffect(health) {
        if (!this.isInitialized || !this.ctx) return;
        
        const normHealth = Math.max(0, Math.min(1, health)); // Clamp health 0-1
        
        if (this.ambientSource && this.ambientGain) {
            const playbackRate = 0.8 + normHealth * 0.2;
            const gain = 0.05 + normHealth * 0.05;
            
            this.ambientSource.playbackRate.linearRampToValueAtTime(playbackRate, this.ctx.currentTime + 0.5);
            if (isFinite(gain)) {
                this.ambientGain.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.5);
            }
        }
        
        if (this.horrorGain) {
            // Becomes audible below ~75% health, max volume at 25%
            const horrorGain = Math.max(0, (1.0 - normHealth) * 0.4 - 0.1); 
            if (isFinite(horrorGain)) {
                this.horrorGain.gain.linearRampToValueAtTime(horrorGain, this.ctx.currentTime + 1.0);
            }
        }
    },

    /**
     * [NEW] Sets the master volume with a smooth ramp.
     * @param {number} volume - Volume from 0.0 to 1.0.
     * @param {number} [rampTime=0.2] - Time in seconds to ramp to the new volume.
     */
    setMasterVolume(volume, rampTime = 0.2) {
        if (!this.isInitialized || !this.masterGain) return;
        const vol = Math.max(0, Math.min(1, volume)); // Clamp
        this.masterGain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + rampTime);
    },

    /**
     * [NEW] Stops all looping sounds and speech.
     */
    stopAllSounds() {
        if (!this.isInitialized) return;
        
        // Stop and disconnect looping sources
        [this.ambientSource, this.horrorSource].forEach(source => {
            if (source) {
                try { source.stop(0); } catch (e) {}
                source.disconnect();
            }
        });
        [this.ambientGain, this.horrorGain].forEach(gain => {
            if (gain) gain.disconnect();
        });

        this.ambientSource = null;
        this.ambientGain = null;
        this.horrorSource = null;
        this.horrorGain = null;
        
        this.stopSpeech();
        
        console.log("All looping audio sources and speech stopped.");
    },

    sounds: {
        shoot: (ctx, dest) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(dest); o.type = 'triangle'; o.frequency.setValueAtTime(880, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.1); g.gain.setValueAtTime(0.5, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2); },
        swordSwing: (ctx, dest) => { const n = ctx.createBufferSource(), bs = ctx.sampleRate * 0.3, b = ctx.createBuffer(1, bs, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1; n.buffer = b; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(1500, ctx.currentTime); bp.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.3); bp.Q.value = 5; const g = ctx.createGain(); g.gain.setValueAtTime(0.6, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); n.connect(bp); bp.connect(g); g.connect(dest); n.start(ctx.currentTime); n.stop(ctx.currentTime + 0.3); },
        tentacleWhip: (ctx, dest) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(dest); o.type = 'sawtooth'; o.frequency.setValueAtTime(100, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1); g.gain.setValueAtTime(0.4, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2); },
        walk: (ctx, dest) => { const n = ctx.createBufferSource(), bs = ctx.sampleRate * 0.1, b = ctx.createBuffer(1, bs, ctx.sampleRate); let d = b.getChannelData(0); for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1; n.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, ctx.currentTime); const g = ctx.createGain(); g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); n.connect(f); f.connect(g); g.connect(dest); n.start(ctx.currentTime); n.stop(ctx.currentTime + 0.1); },
        
        /**
         * [ENHANCED] Refactored to use AudioContext time scheduling
         * instead of unreliable `setTimeout`.
         */
        reload: (ctx, dest) => {
            const playClick = (freq, time) => {
                if (!ctx || ctx.state === 'closed') return;
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.connect(g); g.connect(dest);
                o.type = 'square';
                const startTime = ctx.currentTime + time;
                o.frequency.setValueAtTime(freq, startTime);
                g.gain.setValueAtTime(0.1, startTime);
                g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
                o.start(startTime);
                o.stop(startTime + 0.05);
            };
            playClick(1500, 0);      // First click, at 0ms
            playClick(1200, 0.150);  // Second click, at 150ms
        },
        
        entityHit: (ctx, dest) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(dest); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2); g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2); },
        railgun: (ctx, destination) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(2000, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1); g.gain.setValueAtTime(0.4, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); o.connect(g); g.connect(destination); o.start(); o.stop(ctx.currentTime + 0.5); },
        nextLevel: (ctx, dest) => { [261.63, 329.63, 392.00, 523.25].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(dest); o.type = 'sine'; o.frequency.setValueAtTime(f, ctx.currentTime + i * 0.1); g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.1); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.1); o.start(ctx.currentTime + i * 0.1); o.stop(ctx.currentTime + i * 0.1 + 0.15); }); },
        pickup: (ctx, dest) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(dest); o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15); g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2); },
        enemyGrowl: (ctx, dest) => { const o = ctx.createOscillator(), g = ctx.createGain(), lf = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(60, ctx.currentTime); lf.type = 'sine'; lf.frequency.setValueAtTime(0.8, ctx.currentTime); const shaper = ctx.createWaveShaper(), curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i * 2 / 256 - 1; curve[i] = Math.tanh(x * 2); } shaper.curve = curve; shaper.oversample = '2x'; lf.connect(g.gain); o.connect(shaper); shaper.connect(g); g.connect(dest); g.gain.setValueAtTime(0.001, ctx.currentTime); g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0); o.start(ctx.currentTime); lf.start(ctx.currentTime); o.stop(ctx.currentTime + 1.0); lf.stop(ctx.currentTime + 1.0); },
    },
};

/**
 * =============================================================================
 * ENHANCED THREE.JS HELPERS
 * =============================================================================
 */

function createSandstorm() {
    const particleCount = 50000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    const stormRadius = 50;
    const stormHeight = 30;

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * stormRadius;
        positions[i3] = Math.sin(angle) * radius;
        positions[i3 + 1] = Math.random() * stormHeight;
        positions[i3 + 2] = Math.cos(angle) * radius;

        velocities[i3] = (Math.random() - 0.5) * 0.05;
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.05;
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.05,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    const sandstorm = new THREE.Points(geometry, material);
    sandstorm.userData.velocities = velocities;
    return sandstorm;
}

function createBloodRain() {
    const particleCount = 10000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    const rainArea = 80; // Area around the player
    const rainHeight = 20;

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * rainArea;
        positions[i3 + 1] = Math.random() * rainHeight;
        positions[i3 + 2] = (Math.random() - 0.5) * rainArea;

        velocities[i3] = 0;
        velocities[i3 + 1] = -0.2 - Math.random() * 0.2; // Fall speed
        velocities[i3 + 2] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
        color: 0x8b0000,
        size: 0.08,
        transparent: true,
        opacity: 0.6
    });

    const bloodRain = new THREE.Points(geometry, material);
    bloodRain.userData.rainHeight = rainHeight;
    return bloodRain;
}


/**
 * [ENHANCED] Pre-define geometry and materials for blood splatters.
 * This is *much* more performant than creating new ones inside the loop.
 */
const _bloodSplatGeometry = new THREE.SphereGeometry(1, 4, 4); // Base geometry (scaled later)
const _bloodSplatMaterial1 = new THREE.MeshBasicMaterial({ color: 0x8b0000 });
const _bloodSplatMaterial2 = new THREE.MeshBasicMaterial({ color: 0xa00000 });

/**
 * [ENHANCED] Creates blood splatter particles using shared geometry and materials.
 */
function createBloodSplatter(pos, scene, gameState, safeAdd) {
    for (let i = 0; i < 15; i++) {
        const size = 0.05 + Math.random() * 0.1;
        
        // [ENHANCED] Reuse materials
        const particleMat = Math.random() > 0.5 ? _bloodSplatMaterial1 : _bloodSplatMaterial2;
        
        // [ENHANCED] Reuse geometry
        const particle = new THREE.Mesh(_bloodSplatGeometry, particleMat);
        
        particle.position.copy(pos);
        particle.scale.set(size, size, size); // Set size using scale
        
        particle.userData = {
            velocity: new THREE.Vector3( (Math.random() - 0.5) * 0.3, Math.random() * 0.3, (Math.random() - 0.5) * 0.3 ),
            life: 60, // Frames
            gravity: true
        };
        safeAdd(scene, particle, 'Blood Particle');
        gameState.projectiles.push(particle);
    }
}

function createAnomaly(x, y, z) {
    const geometry = new THREE.IcosahedronGeometry(1.5, 3);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            intensity: { value: 0.5 + Math.random() * 0.5 }
        },
        vertexShader: `
            uniform float time;
            uniform float intensity;
            varying vec3 vNormal;
            varying float vNoise;

            // Perlin-like noise function
            float noise(vec3 p) {
                return fract(sin(dot(p, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
            }

            void main() {
                vNormal = normal;
                vec3 pos = position;
                float displacement = noise(pos * 3.0 + time) * intensity;
                pos += normal * displacement;
                vNoise = displacement;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            varying vec3 vNormal;
            varying float vNoise;

            void main() {
                vec3 color = vec3(0.1, 0.5, 1.0);
                float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
                gl_FragColor = vec4(color * (vNoise * 1.5 + 0.5) + rim * 0.8, 0.7);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false // [ENHANCED] Good for transparent, additive effects
    });

    const anomaly = new THREE.Mesh(geometry, material);
    anomaly.position.set(x, y, z);
    anomaly.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02);
    return anomaly;
}

function createGhost(x, y, z, texture) {
    const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.0, // Start invisible
        blending: THREE.AdditiveBlending,
        depthWrite: false // Important for transparency sorting
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(3, 3, 1); // Adjust size as needed
    sprite.userData = {
        isGhost: true,
        lifetime: 0,
        maxLifetime: 3000 + Math.random() * 2000, // 3-5 seconds
        fadeSpeed: 0.005 + Math.random() * 0.005, // How fast it fades in/out
        state: 'fadingIn', // 'fadingIn', 'active', 'fadingOut'
        harassmentRange: 3,
        damage: 0.005 // Sanity damage per second if close
    };
    return sprite;
}

/**
 * [ENHANCED] Safer disposal function.
 */
function disposeGhost(ghost, scene) {
    if (!ghost) return;
    
    if (ghost.parent) {
        ghost.parent.remove(ghost);
    }
    
    if (ghost.material) {
        // We do NOT dispose the map (texture) here,
        // as it might be shared with other ghosts.
        // We only dispose the material instance.
        ghost.material.dispose();
    }
    
    // Sprite geometry is shared and managed by Three.js,
    // so we don't need to dispose `ghost.geometry`.
}