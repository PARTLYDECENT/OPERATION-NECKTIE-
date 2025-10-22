/**
 * main.js - All game logic
 */

// Define a global-like namespace for the game
const Game = {};

Game.init = function() {
    const canvas = document.getElementById('canvas');

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.03); // Increased fog density for a more claustrophobic feel

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.set(0, 1.6, 0);
    camera.rotation.order = 'YXZ'; // Set rotation order once for consistent behavior.
    scene.add(camera); // CRITICAL FIX: Add camera to the scene so its children (weapons) are rendered.

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.4; // Lowered exposure for higher contrast and deeper shadows

    // Post-processing
    const composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0;
    bloomPass.strength = 0.5;
    bloomPass.radius = 0;
    composer.addPass(bloomPass);

    const nightVisionPass = new THREE.ShaderPass(NightVisionShader);
    nightVisionPass.enabled = false;
    composer.addPass(nightVisionPass);

    // Add an ambient light to the scene to prevent models from being pure black
    const ambientLight = new THREE.AmbientLight(0x404040, 0.05); // soft white light
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(0, 10, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0001; // Helps prevent shadow acne
    scene.add(mainLight);

    const flashlight = new THREE.SpotLight(0xffffff, 0, 20, Math.PI / 8, 0.5, 2);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024; // Improve flashlight shadow quality
    flashlight.shadow.bias = -0.001;
    camera.add(flashlight); // Attach flashlight to camera

    // Game state
    let gameState = {
        health: 1.0,
        level: 0,
        kills: 0,
        moveSpeed: 0.12,
        entities: [],
        projectiles: [],
        exitPortal: null,
        morphoser: null,
        keys: {},
        rotation: {
            x: 0,
            y: 0
        },
        isLocked: false,
        ammo: 30,
        maxAmmo: 30,
        reloading: false,
        lastShot: 0,
        shaderMode: 0,
        eventTimer: 0,
        activeEvent: null,
        maze: null,
        lastStepTime: 0,
        activeWeapon: 'gun',
        sword: null,
        shotgun: null,
        railgun: null,
        tentacle: null,
        pistol: null,
        rifle: null,
        flamethrower: null,
        isSwinging: false,
        swingStartTime: 0,
        isWhipping: false,
        whipStartTime: 0,
        flickeringLights: [],
        recoil: 0,
        lastRecoilTime: 0,
        chunks: {},
        chunkSize: 60,
        chunkRadius: 2,
        collected: 0,
        lastChunkUpdateTime: 0,
        chunkUpdateInterval: 500, // ms
        ghosts: [],
        ghostTextures: [],
        isPaused: false,
        isDead: false,
        isNightVision: false,
        nvKey: null,
        hasNVKey: false,
        sandstorm: null,
        truck: {
            object: null,
            isDriving: false,
            speed: 0,
            sensitivity: 0.002
        },
        defaultFOV: 60, // Default Field of View
        musicState: {
            track: 'off',
            isShuffle: false,
            playlist: [],
            currentIndex: 0
        },
        anomalies: [],
        bloodRain: null
    };
    let isFiring = false;
    let isAiming = false;

    const shaderModes = ['NORMAL', 'CREEPY', 'CRIMSON', 'VOID', 'GLITCH', 'RAGE', 'RAINBOW', 'WATER', 'GOLD', 'DIAMOND', 'EMERALD', 'RUBY', 'SAPPHIRE', 'OBSIDIAN', 'INVERT', 'NOIR', 'PSYCHEDELIC', 'TERMINAL', 'MATRIX'];

    let zombieModel = null;
    let zombieAnimations = [];
    let floorTexture = null;
    let truckModel = null;

    // Expose variables and functions needed by main2.js
    Game.canvas = canvas;
    Game.scene = scene;
    Game.camera = camera;
    Game.renderer = renderer;
    Game.composer = composer;
    Game.nightVisionPass = nightVisionPass;
    Game.mainLight = mainLight;
    Game.flashlight = flashlight;
    Game.gameState = gameState;
    Game.isFiring = isFiring;
    Game.isAiming = isAiming;
    Game.shaderModes = shaderModes;
    Game.zombieModel = () => zombieModel;
    Game.zombieAnimations = () => zombieAnimations;

    // Helper function for safe scene/camera additions
    function safeAdd(parent, child, childName = 'Unnamed Object') {
        if (!child) {
            console.error(`Attempted to add a null or undefined child (${childName}) to parent ${parent.type}.`);
            return;
        }
        parent.add(child);
    }

    // Enhanced wall material for horror effects
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999,
        roughness: 0.8,
        metalness: 0.2
    });
    wallMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.time = {
            value: 0
        };
        shader.uniforms.sanity = {
            value: 1.0
        };

        shader.vertexShader = 'uniform float time;
uniform float sanity;
' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float horrorFactor = 1.0 - sanity;
            float breathe = sin(time * 0.5 + position.y * 0.5) * 0.1 * horrorFactor;
            float twitch = sin(time * 15.0 + position.x * 2.0) * cos(time * 10.0 + position.z * 2.0) * 0.05 * pow(horrorFactor, 2.0);
            transformed += normal * (breathe + twitch);
            `
        );
        // Store the shader on the material so we can update uniforms
        wallMaterial.userData.shader = shader;
    };

    const skyMaterial = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
            time: { value: 0 },
            baseTop: { value: new THREE.Color(0x0b1230) },
            baseBottom: { value: new THREE.Color(0x00101a) },
            nebulaA: { value: new THREE.Color(0xff5aa8) },
            nebulaB: { value: new THREE.Color(0x5b3bff) },
            accentA: { value: new THREE.Color(0x00ffe1) },
            accentB: { value: new THREE.Color(0xffcc66) },
            starColor: { value: new THREE.Color(0xffffff) },
            starDensity: { value: 1.0 },
            nebulaDetail: { value: 1.0 },
            flowStrength: { value: 1.6 },
            speed: { value: 0.3 },
            cometSeed: { value: Math.random() * 1000.0 }
        },
        vertexShader: `
            varying vec3 vPos;
            void main() {
                vPos = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            precision highp float;
            varying vec3 vPos;
            uniform float time;
            uniform float speed;
            uniform float flowStrength;
            uniform float nebulaDetail;
            uniform float cometSeed;
            uniform vec3 baseTop;
            uniform vec3 baseBottom;
            uniform vec3 nebulaA;
            uniform vec3 nebulaB;
            uniform vec3 accentA;
            uniform vec3 accentB;
            uniform vec3 starColor;
            uniform float starDensity;

            float hash2(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float fbm3(vec3 p) {
                float amp = 0.5;
                float sum = 0.0;
                for(int i = 0; i < 6; i++) {
                    sum += amp * fract(sin(dot(p, vec3(127.1, 311.7, 74.7) * float(i + 1))) * 43758.5453);
                    p *= 2.0;
                    amp *= 0.5;
                }
                return sum;
            }

            vec3 curl(vec3 p) {
                float e = 0.01;
                float a = fbm3(p);
                float bx = fbm3(p + vec3(e, 0.0, 0.0));
                float by = fbm3(p + vec3(0.0, e, 0.0));
                float bz = fbm3(p + vec3(0.0, 0.0, e));
                return normalize(vec3(by - bz, bz - bx, bx - by));
            }

            vec3 nebulaPalette(float t) {
                return mix(nebulaA, nebulaB, smoothstep(0.0, 1.0, t));
            }

            float comet(vec2 uv, vec2 center, vec2 dir, float length, float thickness) {
                vec2 rel = uv - center;
                float proj = dot(rel, dir);
                float side = dot(rel, vec2(-dir.y, dir.x));
                float t = smoothstep(0.0, 1.0, proj / length);
                float line = exp(-pow(side / (thickness * (1.0 - t * 0.8) + 0.0001), 2.0) * 4.0);
                line *= (1.0 - smoothstep(0.0, 1.0, proj / length));
                return line * (0.6 + 0.4 * (1.0 - t));
            }

            void main() {
                vec3 dir = normalize(vPos);
                float up = smoothstep(-0.3, 1.0, dir.y);
                vec3 base = mix(baseBottom, baseTop, up);
                vec2 sph = vec2(atan(dir.z, dir.x), asin(dir.y));
                vec3 p = vec3(dir * 2.0);
                vec3 flow = curl(p * 0.7 + time * 0.12) * flowStrength;
                float density = 0.0;
                float scl = 1.0;
                for(int i = 0; i < 5; i++) {
                    float v = fbm3((p + flow * float(i) * 0.18 + vec3(time * 0.06 * float(i))) * scl);
                    v = smoothstep(0.18, 0.75, v);
                    density += v * (0.55 / float(i + 1));
                    scl *= 1.9;
                }
                density = clamp(density * nebulaDetail, 0.0, 1.0);
                vec3 neb = nebulaPalette(density) * density * 1.6;
                vec3 accents = mix(accentA, accentB, fract(density * 3.0 + time * 0.2));
                neb += accents * pow(density, 3.0) * 0.8;
                float stars = hash2(sph * 1000.0) * step(0.998, hash2(sph * 200.0 + 10.0)) * starDensity;
                stars += hash2(sph * 2000.0) * step(0.999, hash2(sph * 400.0 + 20.0)) * starDensity * 0.6;
                stars = pow(stars, 2.0);
                float cometTime = fract(time * 0.05 + cometSeed);
                vec2 cometDir = vec2(sin(cometSeed), cos(cometSeed));
                vec2 cometCenter = vec2(cometTime * 2.0 - 1.0, sin(cometSeed * 2.0) * 0.5);
                float c = comet(sph, cometCenter, cometDir, 0.3, 0.005);
                vec3 finalColor = base + neb + stars * starColor + c * accentA * 2.0;
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });
    const skyGeo = new THREE.SphereGeometry(300, 56, 56);
    const sky = new THREE.Mesh(skyGeo, skyMaterial);
    safeAdd(scene, sky, 'Sky Sphere');

    function createFloorMaterial(texture) {
        const material = new THREE.MeshStandardMaterial({
            map: texture
        });
        material.map.repeat.set(12, 12);

        material.onBeforeCompile = (shader) => {
            shader.uniforms.time = {
                value: 0
            };
            // Use a large enough array for zombie positions. 10 should be sufficient for nearby zombies.
            shader.uniforms.zombiePositions = {
                value: Array.from({ length: 10 }, () => new THREE.Vector3())
            };
            shader.uniforms.zombieCount = {
                value: 0
            };

            shader.vertexShader = `
                uniform float time;
                uniform vec3 zombiePositions[10];
                uniform int zombieCount;
                varying vec3 vWorldPosition;
            
` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `
                #include <worldpos_vertex>
                vWorldPosition = worldPosition.xyz;
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>

                float totalDisplacement = 0.0;
                for (int i = 0; i < 10; i++) {
                    if (i >= zombieCount) break;
                    float dist = distance(vWorldPosition.xz, zombiePositions[i].xz);
                    if (dist < 5.0) { // Wave radius
                        totalDisplacement += sin(dist * 4.0 - time * 5.0) * (1.0 - dist / 5.0) * 0.2;
                    }
                }
                transformed.y += totalDisplacement;
                `
            );
            material.userData.shader = shader;
        };
        return material;
    }

    function seededRandom(cx, cz, salt = 1234567) {
        let n = (cx * 374761393) ^ (cz * 668265263) ^ salt;
        n = (n ^ (n >>> 13)) >>> 0;
        return (n % 10000) / 10000;
    }

    function createChunk(cx, cz) {
        const group = new THREE.Group();
        const chunkSize = gameState.chunkSize;
        group.position.set(cx * chunkSize, 0, cz * chunkSize);

        const floorMaterial = createFloorMaterial(floorTexture);
        const floorGeo = new THREE.PlaneGeometry(chunkSize, chunkSize);
        const floor = new THREE.Mesh(floorGeo, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        floor.position.y = 0;
        safeAdd(group, floor, 'Chunk Floor');

        const ceilingMaterial = new THREE.MeshStandardMaterial({
            color: 0x202020,
            roughness: 0.95
        });
        const ceiling = new THREE.Mesh(floorGeo, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 4;
        group.add(ceiling);

        let currentWallMaterial;
        const shaderName = shaderModes[gameState.shaderMode];
        switch (shaderName) {
            case 'GOLD':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0xffd700,
                    metalness: 0.9,
                    roughness: 0.4
                });
                break;
            case 'DIAMOND':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0xb9f2ff,
                    metalness: 0.9,
                    roughness: 0.1,
                    transparent: true,
                    opacity: 0.8
                });
                break;
            case 'EMERALD':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0x50c878,
                    metalness: 0.7,
                    roughness: 0.2
                });
                break;
            case 'RUBY':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0xe0115f,
                    metalness: 0.7,
                    roughness: 0.2
                });
                break;
            case 'SAPPHIRE':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0x0f52ba,
                    metalness: 0.7,
                    roughness: 0.2
                });
                break;
            case 'OBSIDIAN':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0x000000,
                    metalness: 0.8,
                    roughness: 0.2
                });
                break;
            case 'CREEPY':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0x113311,
                    roughness: 0.9
                });
                break;
            case 'CRIMSON':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0xdc143c
                });
                break;
            case 'VOID':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0x000000,
                    emissive: 0x050505
                });
                break;
            case 'GLITCH':
                currentWallMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        time: { value: 0.0 }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform float time;
                        varying vec2 vUv;

                        float rand(vec2 co){
                            return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453123);
                        }

                        void main() {
                            vec2 uv = vUv;
                            float glitch = rand(vec2(time * 0.1, uv.y));
                            
                            if (glitch > 0.9) {
                                uv.x += (rand(vec2(time, uv.y * 0.2)) - 0.5) * 0.1;
                            }
                            
                            float r = rand(uv + time * 0.01);
                            float g = rand(uv + time * 0.02);
                            float b = rand(uv + time * 0.03);

                            float scanline = sin(vUv.y * 800.0) * 0.05;
                            
                            vec3 color = vec3(r, g, b);
                            color.r += scanline;
                            
                            if (rand(uv + time) > 0.99) {
                                color = 1.0 - color;
                            }

                            gl_FragColor = vec4(color, 1.0);
                        }
                    `
                });
                break;
            case 'RAGE':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0xff0000,
                    emissive: 0x660000
                });
                break;
            case 'RAINBOW':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(Math.random(), Math.random(), Math.random())
                });
                break;
            case 'WATER':
                currentWallMaterial = new THREE.MeshStandardMaterial({
                    color: 0x2266aa,
                    transparent: true,
                    opacity: 0.7,
                    roughness: 0.1
                });
                break;
            default:
                currentWallMaterial = wallMaterial;
        }

        const step = 12;
        gameState.flickeringLights = gameState.flickeringLights || [];
        group.userData.collectibles = [];
        group.userData.props = [];
        for (let ox = -chunkSize / 2; ox < chunkSize / 2; ox += step) {
            for (let oz = -chunkSize / 2; oz < chunkSize / 2; oz += step) {
                const r = seededRandom(cx + Math.floor(ox), cz + Math.floor(oz));
                if (r > 0.8) {
                    const w = 2 + seededRandom(cx + ox, cz + oz, 3) * (step - 4);
                    const d = 2 + seededRandom(cx + oz, cz + ox, 4) * (step - 4);
                    const h = 4 + Math.floor(seededRandom(cx + oz, cz + ox) * 8);;
                    const wallGeo = new THREE.CylinderGeometry((w + d) / 4, (w + d) / 4, h, 16);
                    const wall = new THREE.Mesh(wallGeo, currentWallMaterial);
                    wall.userData.isWall = true;
                    const xPos = ox + (seededRandom(cx + ox, cz + oz, 1) - 0.5) * (step - w);
                    const zPos = oz + (seededRandom(cz + oz, cx + ox, 2) - 0.5) * (step - d);
                    wall.position.set(xPos, h / 2, zPos);
                    wall.rotation.y = (seededRandom(ox, oz) - 0.5) * Math.PI * 0.25;
                    wall.castShadow = true;
                    safeAdd(group, wall, 'Wall Pillar');
                }
                if (seededRandom(cx + ox * 7, cz + oz * 11) > 0.98) {
                    const light = new THREE.PointLight(0xffee88, 0, 10, 2);
                    light.position.set(ox, 3.5, oz);
                    light.castShadow = true; // Enable shadows for flickering lights
                    light.shadow.mapSize.width = 256; // Use low-res shadow maps for performance
                    light.shadow.mapSize.height = 256;
                    light.shadow.camera.near = 0.5;
                    light.shadow.bias = -0.005; // Adjust to prevent shadow acne
                    group.add(light);
                    gameState.flickeringLights.push(light);
                }
                if (seededRandom(cx * 3 + ox, cz * 5 + oz) > 0.995) {
                    let entityType;
                    const typeRoll = seededRandom(ox, oz, 5);
                    if (typeRoll < 0.3) { // 30% chance for BlackGooEntity
                        entityType = 4;
                    } else if (typeRoll < 0.5) { // 20% chance for Alien
                        entityType = 2;
                    } else { // 50% chance for regular zombie types
                        entityType = Math.floor(seededRandom(ox, oz, 6) * 2);
                    }
                    const ent = createEntity(group.position.x + ox + seededRandom(ox, oz) * 2, group.position.z + oz + seededRandom(oz, ox) * 2, entityType);
                    gameState.entities.push(ent);
                    safeAdd(scene, ent.mesh || ent, 'Entity in Chunk');
                } else if (seededRandom(cx * 7 + ox, cz * 13 + oz, 9) > 0.97) {
                    let prop;
                    if (seededRandom(cx * 7 + ox, cz * 13 + oz, 10) > 0.5) {
                        prop = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 12), new THREE.MeshStandardMaterial({
                            color: 0x666666,
                            roughness: 0.9
                        }));
                        prop.position.set(ox, 1.5, oz);
                    } else {
                        prop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({
                            color: 0x775533,
                            roughness: 0.8
                        }));
                        prop.position.set(ox, 0.6, oz);
                    }
                    prop.castShadow = true;
                    prop.receiveShadow = true;
                    group.add(prop);
                    group.userData.props.push(prop);
                }
                if (seededRandom(cx * 11 + ox, cz * 17 + oz) > 0.997) {
                    const orbGeo = new THREE.SphereGeometry(0.25, 8, 8);
                    const orbMat = new THREE.MeshStandardMaterial({
                        color: 0xffff88,
                        emissive: 0xffff66,
                        emissiveIntensity: 1.5,
                        metalness: 0.2
                    });
                    const orb = new THREE.Mesh(orbGeo, orbMat);
                    orb.position.set(ox + seededRandom(ox, oz) * 0.5, 1.0 + seededRandom(ox + 1, oz + 1) * 0.5, oz + seededRandom(oz, ox) * 0.5);
                    orb.userData.collectible = true;
                    orb.userData.collected = false;
                    group.add(orb);
                    group.userData.collectibles.push(orb);
                }
            }
        }
        if (seededRandom(cx, cz) > 0.995) {
            const landmark = new THREE.Mesh(new THREE.ConeGeometry(2, 6, 8), new THREE.MeshStandardMaterial({
                color: 0x8800ff,
                emissive: 0x440044
            }));
            landmark.position.set(0, 3, 0);
            group.add(landmark);
        }
        group.userData = {
            cx,
            cz
        };
        return group;
    }

    function createAlienEntity(x, z, entityType) {
        const geometry = new THREE.IcosahedronGeometry(entityType.size, 20);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                uSpeed: { value: 0.5 },
                uNoiseDensity: { value: 1.2 },
                uNoiseStrength: { value: 0.25 },
                uIntensity: { value: 1.8 },
            },
            vertexShader: alienVertexShader,
            fragmentShader: alienFragmentShader,
        });
        const entity = new THREE.Mesh(geometry, material);
        entity.position.set(x, entityType.size, z);
        return entity;
    }

    function createCloakingMaterial(originalMaterial) {
        const cloakingMaterial = originalMaterial.clone();
        cloakingMaterial.transparent = true; // Enable transparency for the effect

        cloakingMaterial.onBeforeCompile = (shader) => {
            // Add new uniforms
            shader.uniforms.uTime = { value: 0 };
            shader.uniforms.uCamPos = { value: new THREE.Vector3() };
            shader.uniforms.uFlashlightPos = { value: new THREE.Vector3() };
            shader.uniforms.uFlashlightOn = { value: 0.0 };

            // Add varying to pass world position from vertex to fragment shader
            shader.vertexShader = `
                varying vec3 vWorldPosition;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <worldpos_vertex>',
                `
                #include <worldpos_vertex>
                vWorldPosition = worldPosition.xyz;
                `
            );

            // Inject fragment shader logic
            shader.fragmentShader = `
                uniform float uTime;
                uniform vec3 uCamPos;
                uniform vec3 uFlashlightPos;
                uniform float uFlashlightOn;
                varying vec3 vWorldPosition;

                // 4D simplex noise function (3D position + time)
                vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
                vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
                float snoise(vec4 v){
                    const vec2 C = vec2(0.138196601125010504, 0.309016994374947451);
                    vec4 i  = floor(v + dot(v, C.yyyy) );
                    vec4 x0 = v -   i + dot(i, C.xxxx);
                    vec4 i0;
                    i0.x = x0.x > x0.y ? 1.0 : 0.0;
                    i0.y = x0.x > x0.y ? 0.0 : 1.0;
                    i0.z = x0.z > x0.w ? 1.0 : 0.0;
                    i0.w = x0.z > x0.w ? 0.0 : 1.0;
                    vec4 i1 = i0.xyxy * (1.0 - i0.zwzw);
                    vec4 i2 = 1.0 - i1;
                    i1.xz = x0.x > x0.z ? i1.xz : vec2(0.0, 1.0);
                    i1.yw = x0.y > x0.w ? i1.yw : vec2(0.0, 1.0);
                    i1 = i1 * (1.0 - i0.zxzx * i0.wwyy);
                    i2 = 1.0 - i1;
                    vec4 i3 = i0.x > x0.w ? vec4(1.0,0.0,0.0,0.0) : vec4(0.0,0.0,0.0,1.0);
                    vec4 x1 = x0 - i1 + C.xxxx;
                    vec4 x2 = x0 - i2 + C.yyyy;
                    vec4 x3 = x0 - i3 + 0.5;
                    i = mod(i, 289.0);
                    vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, i3.z )) + i.y + vec4(0.0, i1.y, i2.y, i3.y )) + i.x + vec4(0.0, i1.x, i2.x, i3.x ));
                    vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); // Changed from 0.6 to 0.5 for stability
                    m = m*m ;
                    m = m*m ;
                    const vec4 C2 = vec4(0.08571428571, 0.2, 0.28571428571, 0.37142857142); // Correct constant
                    vec4 px = fract(p * C2.wwwz) * 2.0 - 1.0;
                    vec4 gy = abs(px) - 0.5;
                    vec4 ox = floor(px + 0.5);
                    vec4 gx = px - ox;
                    m *= taylorInvSqrt(gx*gx + gy*gy); // Corrected to pass a vec4
                    vec4 grad = vec4(x0.x,x1.x,x2.x,x3.x)*gx.x + vec4(x0.y,x1.y,x2.y,x3.y)*gx.y + vec4(x0.z,x1.z,x2.z,x3.z)*gx.z + vec4(x0.w,x1.w,x2.w,x3.w)*gx.w;
                    return 130.0 * dot(m, grad);
                }
            
` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>

                // --- Cloaking Effect ---
                // 1. Proximity to Camera
                float camDist = distance(vWorldPosition, uCamPos);
                float proximityFactor = 1.0 - smoothstep(2.0, 12.0, camDist); // Fully visible at < 2 units, starts revealing at 12 units

                // 2. Direct Gaze (higher value when looking straight at a surface)
                vec3 viewDir = normalize(uCamPos - vWorldPosition);
                float gazeFactor = pow(abs(dot(viewDir, normalize(vNormal))), 2.0);

                // 3. Flashlight
                float lightDist = distance(vWorldPosition, uFlashlightPos);
                float lightFactor = (1.0 - smoothstep(0.0, 15.0, lightDist)) * uFlashlightOn;

                float visibility = proximityFactor * 0.8 + gazeFactor * 0.3 + lightFactor * 1.5;
                visibility = clamp(visibility, 0.0, 1.0);

                float noise = (snoise(vec4(vWorldPosition * 2.0, uTime * 0.5)) + 1.0) * 0.5;
                
                if (noise > visibility) {
                    discard;
                }
                
                gl_FragColor.a *= visibility;
                `
            );

            cloakingMaterial.userData.shader = shader;
        };

        return cloakingMaterial;
    }

    class BlackGooEntity {
        constructor() {
            const geometry = new THREE.IcosahedronGeometry(2.0, 5);
            const material = new THREE.ShaderMaterial({
                vertexShader: gooVertexShader,
                fragmentShader: gooFragmentShader,
                uniforms: {
                    uTime: { value: 0 },
                    uMouse: { value: new THREE.Vector2(0, 0) },
                    uDisturbed: { value: 0 },
                    uFeeding: { value: 0 },
                    uIntensity: { value: 1.0 }
                },
                side: THREE.DoubleSide
            });

            this.mesh = new THREE.Mesh(geometry, material);
            this.clock = new THREE.Clock();
            this.mesh.userData.isGoo = true;
        }

        update() {
            const delta = this.clock.getDelta();
            this.mesh.material.uniforms.uTime.value += delta;
        }
    }

    function createEntity(x, z, type = 0) {
        const types = [{
            color: 0x330000,
            emissive: 0xff0000,
            speed: 0.01,
            health: 3,
            size: 0.8,
            isFriendly: false,
            damage: 0.1,
            dialogue: {
                normal: ["We are one.", "You cannot comprehend.", "The pattern must be completed.", "Your presence is a flaw.", "Your light will be extinguished.", "The Architect sees all.", "You are a glitch in the system.", "We are the antibodies of this reality.", "Your reality is a cage.", "The master is coming.", "You are just a vessel.", "Your thoughts are not your own."]
            }
        }, {
            color: 0x001a33,
            emissive: 0x0088ff,
            speed: 0.02,
            health: 2,
            size: 0.6,
            isFriendly: false,
            damage: 0.05,
            dialogue: {
                normal: ["It is listening.", "The frequency is changing.", "You disrupt the signal.", "Become one with the static.", "Your light will be extinguished.", "The Architect sees all.", "You are a glitch in the system.", "We are the antibodies of this reality.", "We see your fear.", "This is not your world.", "You are already lost.", "Your memories are lies."]
            }
        }, {
            color: 0x1a3300,
            emissive: 0x88ff00,
            speed: 0.0075,
            health: 5,
            size: 1.2,
            isFriendly: false,
            damage: 0.15,
            dialogue: {
                normal: ["The flesh is weak.", "We will consume.", "Your form is imperfect.", "Join the growth.", "Your light will be extinguished.", "The Architect sees all.", "You are a glitch in the system.", "We are the antibodies of this reality.", "The code is corrupt.", "There is no escape from the system.", "Your free will is an illusion.", "We are the future."]
            }
        }, {
            color: 0x003333,
            emissive: 0x00ffff,
            speed: 0.01,
            health: 100,
            size: 0.7,
            isFriendly: true,
            damage: 0,
            dialogue: {
                highSanity: ["You seem lucid. Good.", "The exit is real, but it moves.", "These walls... they listen.", "I saw a man with a face like a clock.", "The yellow is a lie.", "Stay away from the shadows, they bite.", "The architect of this place is a madman.", "I've seen others, but they all go mad.", "You are not the first to try and escape. You will not be the last.", "The Architect is a cruel master. He builds, we suffer.", "I have seen things you would not believe. Realities folding in on themselves.", "There is a song that the static sings. If you listen closely, you can hear the truth.", "Keep your wits about you. This place feeds on confusion.", "There are patterns in the static. Try to see them.", "The Architect is not a god, just a programmer.", "I've seen others like you. They all broke eventually.", "The exit changes, but it always has a key."],
                lowSanity: ["...the colors... they scream...", "It sees you. It knows your name.", "You're becoming part of this place.", "The static is singing to me.", "My teeth are not my own.", "The walls are breathing, can't you feel it?", "My reflection has a different face.", "The whispers are getting louder.", "The walls are hungry. They want to eat the light.", "My skin is not my own. It is a prison of flesh.", "The numbers, Mason! What do they mean?", "I can see the code. It's all around us. We are just variables in a simulation.", "The walls are melting again.", "My hands are not my hands.", "I can hear the pixels screaming.", "The floor is made of faces.", "My shadow is moving on its own.", "The colors taste like metal."],
                normal: ["You aren't supposed to be here.", "The buzzing... it makes them angry.", "Follow the green light.", "Don't lose your mind. They feed on fear.", "Hurry. This place... it remembers.", "There's no escape, only deeper levels.", "The creatures here are drawn to movement.", "Don't trust the silence.", "The exit is a lie. There is only the maze.", "The entities here are not what they seem. They are echoes of what was.", "I have a name, but I have forgotten it. It was taken from me.", "There is a place where the walls bleed and the floor is made of teeth. Avoid it.", "Be careful. They are drawn to the light.", "I've been here for a long time. Or maybe just a minute.", "The Architect built this place, but something else has taken root.", "The weapons you find are glitches. Use them."],
                enemyResponses: {
                    "We are one.": "I am not you.",
                    "You cannot comprehend.": "I don't want to.",
                    "The pattern must be completed.": "I will break it.",
                    "Your presence is a flaw.": "I am not a flaw.",
                    "It is listening.": "I know.",
                    "The frequency is changing.": "I can feel it.",
                    "You disrupt the signal.": "Good.",
                    "Become one with the static.": "Never.",
                    "The flesh is weak.": "But my will is strong.",
                    "We will consume.": "Not me.",
                    "Your form is imperfect.": "It's mine.",
                    "Join the growth.": "I refuse.",
                    "Your reality is a cage.": "A cage I will break.",
                    "The master is coming.": "Let him come.",
                    "You are just a vessel.": "I am my own person.",
                    "Your thoughts are not your own.": "They are mine to control.",
                    "We see your fear.": "And I see your weakness."
                }
            }
        }, {
            color: 0x000000,
            emissive: 0x000000,
            speed: 0,
            health: 1000,
            size: 2,
            isFriendly: false,
            damage: 0.2,
            dialogue: {
                normal: ["..."],
                lowSanity: ["..."],
                highSanity: ["..." ]
            }
        }];
        const entityType = types[type];

        let entity;
        if (type === 2) {
            entity = createAlienEntity(x, z, entityType);
        } else if (type === 4) {
            entity = new BlackGooEntity();
            entity.mesh.position.set(x, 1, z);
            // Add entity data to the mesh itself for consistency
            Object.assign(entity.mesh.userData, {
                type: type,
                health: entityType.health,
                speed: entityType.speed,
                damage: entityType.damage,
                isFriendly: entityType.isFriendly,
                dialogue: entityType.dialogue,
                dialogueIndex: 0,
                canSpeak: true,
                lastSpokeTime: 0
            });
            return entity;
        } else if (!entityType.isFriendly && zombieModel) {
            entity = THREE.SkeletonUtils.clone(zombieModel);
            entity.scale.set(1.1, 1.1, 1.1);

            // Apply cloaking material
            entity.traverse(child => {
                if (child.isMesh && child.material) {
                    // If a model has multiple materials, they might be in an array.
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => createCloakingMaterial(mat));
                    } else {
                        child.material = createCloakingMaterial(child.material);
                    }
                }
            });

            const mixer = new THREE.AnimationMixer(entity);
            entity.userData.mixer = mixer;
            entity.position.set(x, 0, z);

        } else {
            const geometry = entityType.isFriendly ? new THREE.DodecahedronGeometry(entityType.size, 0) : new THREE.TorusKnotGeometry(entityType.size * 0.6, entityType.size * 0.2, 100, 16);
            // This is for non-zombie models, so we don't apply the cloaking effect here.
            // If you wanted to, you would call createCloakingMaterial here too.
            const material = new THREE.MeshStandardMaterial({
                color: entityType.color,
                emissive: entityType.emissive,
                emissiveIntensity: 2.0,
                flatShading: true,
                roughness: 0.8
            });
            entity = new THREE.Mesh(geometry, material);
            entity.position.set(x, 1, z);
        }

        entity.castShadow = true;
        const light = new THREE.PointLight(entityType.emissive, 1.5, 15);
        entity.add(light);

        Object.assign(entity.userData, {
            type: type,
            health: entityType.health,
            speed: entityType.speed,
            damage: entityType.damage,
            baseAngle: Math.random() * Math.PI * 2,
            radius: 15 + Math.random() * 10,
            isFriendly: entityType.isFriendly,
            dialogue: entityType.dialogue,
            dialogueIndex: 0,
            canSpeak: true,
            lastSpokeTime: 0,
            voice: entityType.voice
        });

        return entity;
    }

    function createMorphoser() {
        const pC = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(pC * 3);
        const basePositions = new Float32Array(pC * 3);
        const colors = new Float32Array(pC * 3);
        const color = new THREE.Color();

        for (let i = 0; i < pC; i++) {
            const i3 = i * 3;
            const r = Math.random() * 2.5;
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = 2 * Math.PI * Math.random();

            basePositions[i3] = r * Math.sin(phi) * Math.cos(theta);
            basePositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            basePositions[i3 + 2] = r * Math.cos(phi);

            color.setHSL(0.5 + Math.random() * 0.2, 0.9, 0.6);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.05,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.8,
            vertexColors: true
        });

        const morph = new THREE.Points(geometry, material);
        morph.userData = {
            basePositions: basePositions,
            time: 0,
            noiseFactor: 2
        };

        const light = new THREE.PointLight(0x88aaff, 1.5, 20); // Cool blue light 
        morph.add(light);
        scene.add(morph);
        return morph;
    }

    function createSword() {
        const g = new THREE.Group(),
            bM = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                metalness: 0.9,
                roughness: 0.2
            }),
            hM = new THREE.MeshStandardMaterial({
                color: 0x332211,
                roughness: 0.8
            });
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.02), bM);
        b.position.y = 0.75;
        const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3), hM);
        const grd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), hM);
        grd.position.y = 0.15;
        g.add(b, hilt, grd);
        g.visible = false;
        camera.add(g);
        return g;
    }

    function createTentacle() {
        const g = new THREE.Group(),
            m = new THREE.MeshStandardMaterial({
                color: 0x8e44ad,
                roughness: 0.6,
                metalness: 0.2
            }),
            sG = new THREE.SphereGeometry(0.05, 8, 8);
        for (let i = 0; i < 15; i++) {
            const s = new THREE.Mesh(sG, m);
            s.position.y = -i * 0.1;
            g.add(s);
        }
        g.visible = false;
        camera.add(g);
        return g;
    }

    function createRailgun() {
        const g = new THREE.Group(),
            bdyM = new THREE.MeshStandardMaterial({
                color: 0x111111,
                metalness: 0.95,
                roughness: 0.3
            }),
            railM = new THREE.MeshStandardMaterial({
                color: 0x00aaff,
                emissive: 0x00aaff,
                emissiveIntensity: 2
            });
        const bdy = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 1.2), bdyM);
        const rG = new THREE.CylinderGeometry(0.01, 0.01, 1.0, 8);
        const r1 = new THREE.Mesh(rG, railM);
        r1.position.set(0.05, 0.03, -0.5);
        r1.rotation.x = Math.PI / 2;
        const r2 = new THREE.Mesh(rG, railM);
        r2.position.set(-0.05, 0.03, -0.5);
        r2.rotation.x = Math.PI / 2;
        g.add(bdy, r1, r2);
        g.visible = false;
        camera.add(g);
        return g;
    }

    function createShotgun() {
        const g = new THREE.Group(),
            m = new THREE.MeshStandardMaterial({
                color: 0x444444,
                metalness: 0.8,
                roughness: 0.5
            });
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 16), m);
        b.rotation.z = Math.PI / 2;
        b.position.x = 0.1;
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.3), m);
        s.position.z = -0.25;
        g.add(b, s);
        g.visible = false;
        camera.add(g);
        return g;
    }

    function createFlamethrower() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.4, 16),
            new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.5 })
        );
        body.rotation.z = Math.PI / 2;
        body.position.x = 0.1;
        const nozzle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.1, 16),
            new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.4 })
        );
        nozzle.position.x = 0.3;
        nozzle.rotation.z = Math.PI / 2;
        const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16),
            new THREE.MeshStandardMaterial({ color: 0x990000, metalness: 0.6, roughness: 0.5 })
        );
        tank.position.z = -0.3;
        g.add(body, nozzle, tank);
        g.visible = false;
        camera.add(g);
        return g;
    }

    function createExitPortal(level) {
        const g = new THREE.SphereGeometry(2, 32, 32),
            m = new THREE.MeshStandardMaterial({
                color: 0x00ff00,
                emissive: 0x00ff00,
                emissiveIntensity: 2.5,
                transparent: true,
                opacity: 0.7
            }),
            p = new THREE.Mesh(g, m);
        p.position.set(0, 2, 40 + level * 10);
        const l = new THREE.PointLight(0x00ff00, 2, 25);
        p.add(l);
        return p;
    }

    function createProjectile(origin, direction, color = 0xffff00, lifetime = 100, velocity = 1.2) {
        const g = new THREE.SphereGeometry(0.1, 8, 8),
            m = new THREE.MeshBasicMaterial({ color });
        const p = new THREE.Mesh(g, m);
        p.position.copy(origin);
        p.userData = {
            velocity: direction.normalize().multiplyScalar(velocity),
            lifetime: lifetime
        };
        return p;
    }

    function createNVKey() {
        const keyShape = new THREE.Shape();
        // A simple key shape
        keyShape.moveTo(0, -0.2);
        keyShape.lineTo(0, 0.2);
        keyShape.absarc(0.15, 0.2, 0.15, Math.PI, 0, true);
        keyShape.lineTo(0.3, 0.2);
        keyShape.lineTo(0.3, -0.2);
        keyShape.lineTo(0.2, -0.2);
        keyShape.lineTo(0.2, -0.1);
        keyShape.lineTo(0.1, -0.1);
        keyShape.lineTo(0.1, -0.2);
        keyShape.closePath();

        const extrudeSettings = {
            depth: 0.05,
            bevelEnabled: false
        };
        const geometry = new THREE.ExtrudeGeometry(keyShape, extrudeSettings);

        const material = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            emissive: 0x33ff33,
            emissiveIntensity: 3.0,
            side: THREE.DoubleSide
        });

        const keyMesh = new THREE.Mesh(geometry, material);
        keyMesh.userData.isNVKey = true;
        return keyMesh;
    }

    function spawnTruck() {
        if (truckModel) {
            gameState.truck.object = truckModel.clone();
            gameState.truck.object.position.set(camera.position.x + 5, 0, camera.position.z);
            safeAdd(scene, gameState.truck.object, 'Truck');
        }
    }

    function setupLevel() {
        gameState.entities.forEach(e => scene.remove(e.mesh ? e.mesh : e));
        gameState.entities = [];
        gameState.anomalies.forEach(a => scene.remove(a));
        if (gameState.morphoser) scene.remove(gameState.morphoser);
        const hostileCount = 5 + gameState.level;
        for (let i = 0; i < hostileCount; i++) {
            const type = Math.floor(Math.random() * 3);
            const angle = (i / hostileCount) * Math.PI * 2;
            const radius = 20 + Math.random() * 20;
            const ent = createEntity(Math.sin(angle) * radius, Math.cos(angle) * radius, type)
            gameState.entities.push(ent);
            safeAdd(scene, ent.mesh || ent, 'Hostile Entity');
        }
        const friendlyAngle = Math.random() * Math.PI * 2;
        const friendly = createEntity(Math.sin(friendlyAngle) * 15, Math.cos(friendlyAngle) * 15, 3)
        gameState.entities.push(friendly);
        safeAdd(scene, friendly, 'Friendly Entity');

        gameState.anomalies = [];
        for (let i = 0; i < 5; i++) {
            const anomaly = createAnomaly((Math.random() - 0.5) * 80, Math.random() * 10 + 2, (Math.random() - 0.5) * 80);
            gameState.anomalies.push(anomaly);
            safeAdd(scene, anomaly, 'Anomaly');
        }

        gameState.morphoser = createMorphoser();
        gameState.morphoser.position.set((Math.random() - 0.5) * 40, 2, (Math.random() - 0.5) * 40);

        // Place the NV key if it doesn't exist or hasn't been picked up
        if (!gameState.nvKey && !gameState.hasNVKey) {
            gameState.nvKey = createNVKey();
            const angle = Math.random() * Math.PI * 2;
            const radius = 15 + Math.random() * 10;
            gameState.nvKey.position.set(Math.sin(angle) * radius, 1, Math.cos(angle) * radius);
            safeAdd(scene, gameState.nvKey, 'NV Key');
        }
    }

    function initGame() {
        gameState.datalog = [];
        gameState.chunks = {};
        updateChunks(camera.position);
        setupLevel();
        setupMusicPlayer();
        gameState.exitPortal = createExitPortal(gameState.level);
        scene.add(gameState.exitPortal);
    }

    function setupMusicPlayer() {
        const musicPlaylist = [{
            name: 'Eerie Ambiance',
            path: 'assets/music/eerie_ambiance.mp3'
        }, {
            name: 'Chase Sequence',
            path: 'assets/music/chase_sequence.mp3'
        }, {
            name: 'The Void',
            path: 'assets/music/the_void.mp3'
        }, {
            name: 'Safe Room',
            path: 'assets/music/safe_room.mp3'
        }, ];
        gameState.musicState.playlist = musicPlaylist;

        const musicDropdown = document.getElementById('music-dropdown-content');
        const musicButton = document.getElementById('musicSelectButton');
        const musicPlayer = document.getElementById('bgMusicPlayer');

        const createMusicLink = (track) => {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = track ? track.name : 'Off';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                gameState.musicState.track = track ? track.name : 'off';
                musicButton.textContent = `Music: ${link.textContent}`;
                if (track) {
                    musicPlayer.src = track.path;
                    musicPlayer.play().catch(err => console.error("Music play failed:", err));
                } else {
                    musicPlayer.pause();
                    musicPlayer.src = '';
                }
            });
            musicDropdown.appendChild(link);
        };

        createMusicLink(null); // 'Off' button
        musicPlaylist.forEach(createMusicLink);
    }

    // --- Asset Loading ---
    const loadingManager = new THREE.LoadingManager();
    const gltfLoader = new THREE.GLTFLoader(loadingManager);
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const assetPromises = [];

    assetPromises.push(new Promise((resolve, reject) => {
        floorTexture = textureLoader.load('assets/textures/floor.png', (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            resolve();
        }, undefined, reject);
    }));
    assetPromises.push(new Promise((resolve, reject) => {
        gltfLoader.load('assets/models/zombie.glb', (gltf) => {
            zombieModel = gltf.scene;
            zombieAnimations = gltf.animations;
            console.log("Zombie model loaded.");
            resolve();
        }, undefined, reject);
    }));
    assetPromises.push(new Promise((resolve, reject) => {
        gltfLoader.load('assets/models/truck.glb', (gltf) => {
            truckModel = gltf.scene;
            console.log("Truck model loaded.");
            resolve();
        }, undefined, reject);
    }));
    assetPromises.push(new Promise((resolve, reject) => {
        gltfLoader.load('assets/models/pistol.glb', (gltf) => {
            gameState.pistol = gltf.scene;
            if (gameState.pistol) {
                gameState.pistol.scale.set(0.5, 0.5, 0.5);
                gameState.pistol.position.set(0.3, -0.3, -0.5);
                gameState.pistol.rotation.y = Math.PI;
                gameState.pistol.visible = false;
            } else {
                console.error("Pistol model loaded, but gltf.scene was empty.");
            }
            resolve();
        }, undefined, (error) => {
            console.error("An error occurred loading the pistol model at 'assets/models/pistol.glb':", error);
            showEventText("ERROR: Pistol model failed to load. Check console for details.");
            reject(error);
        });
    }));
    assetPromises.push(new Promise((resolve, reject) => {
        gltfLoader.load('assets/models/rifle.glb', (gltf) => {
            gameState.rifle = gltf.scene;
            if (gameState.rifle) {
                gameState.rifle.scale.set(0.8, 0.8, 0.8);
                gameState.rifle.position.set(0.4, -0.4, -0.6);
                gameState.rifle.rotation.y = Math.PI;
                gameState.rifle.visible = false;
            } else {
                console.error("Rifle model loaded, but gltf.scene was empty.");
            }
            resolve();
        }, undefined, (error) => {
            console.error("An error occurred loading the rifle model at 'assets/models/rifle.glb':", error);
            showEventText("ERROR: Rifle model failed to load. Check console for details.");
            reject(error);
        });
    }));

    const ghostImagePaths = [];
    for (let i = 1; i <= 8; i++) {
        ghostImagePaths.push(`assets/images/ghost${i}.jpg`);
    } // Corrected to load existing textures
    ghostImagePaths.forEach(path => {
        assetPromises.push(new Promise((resolve) => {
            textureLoader.load(path, (texture) => {
                gameState.ghostTextures.push(texture);
                resolve();
            }, undefined, (error) => {
                console.error(`Error loading ghost texture at ${path}:`, error);
                resolve();
            });
        }));
    });

    Promise.all(assetPromises).then(() => {
        console.log("All assets loaded, starting game.");
        initGame();
        gameState.sword = createSword();
        gameState.tentacle = createTentacle();
        gameState.shotgun = createShotgun();
        gameState.railgun = createRailgun();
        gameState.flamethrower = createFlamethrower();
        if (gameState.pistol) safeAdd(camera, gameState.pistol, 'Pistol');
        if (gameState.rifle) safeAdd(camera, gameState.rifle, 'Rifle');
        switchWeapon('gun'); // Set initial weapon after all are created.
        spawnTruck();
        animate(); // Start the game loop
    }).catch(error => {
        console.error("One or more assets failed to load:", error);
        showEventText("ERROR: Failed to load some game assets. Check console.");
    });

    function switchWeapon(weapon) {
        const { gameState } = Game;
        gameState.activeWeapon = weapon;
        if (gameState.pistol) gameState.pistol.visible = weapon === 'gun';
        if (gameState.sword) gameState.sword.visible = weapon === 'sword';
        if (gameState.tentacle) gameState.tentacle.visible = weapon === 'tentacle';
        if (gameState.railgun) gameState.railgun.visible = weapon === 'railgun';
        if (gameState.shotgun) gameState.shotgun.visible = weapon === 'shotgun';
        if (gameState.rifle) gameState.rifle.visible = weapon === 'rifle';
        if (gameState.flamethrower) gameState.flamethrower.visible = weapon === 'flamethrower';
    }

    function updateChunks(position) {
        const { scene, gameState, createChunk } = Game;
        const cx = Math.floor(position.x / gameState.chunkSize);
        const cz = Math.floor(position.z / gameState.chunkSize);

        // Remove old chunks
        for (const key in gameState.chunks) {
            const chunk = gameState.chunks[key];
            if (Math.abs(chunk.userData.cx - cx) > gameState.chunkRadius || Math.abs(chunk.userData.cz - cz) > gameState.chunkRadius) {
                scene.remove(chunk);
                delete gameState.chunks[key];
            }
        }

        // Add new chunks
        for (let i = -gameState.chunkRadius; i <= gameState.chunkRadius; i++) {
            for (let j = -gameState.chunkRadius; j <= gameState.chunkRadius; j++) {
                const key = `${cx + i},${cz + j}`;
                if (!gameState.chunks[key]) {
                    const newChunk = createChunk(cx + i, cz + j);
                    gameState.chunks[key] = newChunk;
                    scene.add(newChunk);
                }
            }
        }
    }

    function updateWallMaterials() {
        const { scene, gameState, wallMaterial, shaderModes } = Game;
        const shaderName = shaderModes[gameState.shaderMode];
        let newMaterial;

        switch (shaderName) {
            case 'GOLD':
                newMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.4 });
                break;
            case 'DIAMOND':
                newMaterial = new THREE.MeshStandardMaterial({ color: 0xb9f2ff, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.8 });
                break;
            // ... other cases from main1.js
            default:
                newMaterial = wallMaterial;
        }

        scene.traverse(child => {
            if (child.isMesh && child.userData.isWall) {
                child.material = newMaterial;
            }
        });
    }

    function showEventText(text) {
        const eventText = document.getElementById('eventText');
        eventText.textContent = text;
        eventText.style.opacity = 1;
        setTimeout(() => {
            eventText.style.opacity = 0;
        }, 3000);
    }

    function handleZombieDeath(entityObject) {
        const { gameState } = Game;
        if (!entityObject.userData.deathTime) {
            entityObject.userData.deathTime = performance.now();
            gameState.kills++;
            if (gameState.kills === 10) {
                showEventText("Rifle Unlocked! Press 6 to equip.");
            }
            gameState.sanity = Math.min(1, gameState.sanity + 0.1); // Use showEventText from Game object
        }
    }


    function addToDatalog(message, type = 'SYSTEM') {
        const { gameState } = Game;
        const timestamp = new Date().toLocaleTimeString();
        gameState.datalog.unshift({ message, type, timestamp });
        if (gameState.datalog.length > 100) { // Limit log size
            gameState.datalog.pop();
        }
    }
    function showDatalog() {
        const { gameState } = Game;
        const content = document.getElementById('datalogContent');
        content.innerHTML = '';
        gameState.datalog.forEach(entry => {
            const div = document.createElement('div');
            div.className = `datalog-entry ${entry.type}`;
            div.innerHTML = `<strong>[${entry.timestamp} - ${entry.type}]</strong>: ${entry.message}`;
            content.appendChild(div);
        });
        document.getElementById('pauseMenu').style.display = 'none';
        document.getElementById('datalogView').style.display = 'flex';
        gameState.pauseView = 'datalog';
    }

    function showControls() {
        const { gameState } = Game;
        document.getElementById('pauseMenu').style.display = 'none';
        document.getElementById('datalogView').style.display = 'none';
        document.getElementById('controlsView').style.display = 'flex';
        gameState.pauseView = 'controls';
    }

    function hideControls() {
        const { gameState } = Game;
        document.getElementById('controlsView').style.display = 'none';
        document.getElementById('pauseMenu').style.display = 'flex';
        gameState.pauseView = 'main';
    }

    function hideDatalog() {
        const { gameState } = Game;
        document.getElementById('datalogView').style.display = 'none';
        document.getElementById('pauseMenu').style.display = 'flex';
        gameState.pauseView = 'main';
        document.getElementById('controlsView').style.display = 'none';
    }

    function drawMinimap() {
        const { camera, gameState } = Game;
        const canvas = document.getElementById('minimapCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const mapSize = canvas.width;
        const mapScale = 2.5; // Lower number = more zoomed in

        // Clear canvas
        ctx.fillStyle = 'rgba(0, 10, 20, 0.7)';
        ctx.fillRect(0, 0, mapSize, mapSize);

        const playerX = camera.position.x;
        const playerZ = camera.position.z;

        // Function to transform world coords to map coords
        const toMapCoords = (worldX, worldZ) => {
            const mapX = (worldX - playerX) * mapScale + mapSize / 2;
            const mapZ = (worldZ - playerZ) * mapScale + mapSize / 2;
            return { x: mapX, y: mapZ };
        };

        // Draw entities
        gameState.entities.forEach(entity => {
            const entityObject = entity.mesh ? entity.mesh : entity;
            if (entityObject.userData.health <= 0) return;

            const pos = toMapCoords(entityObject.position.x, entityObject.position.z);
            ctx.fillStyle = entityObject.userData.isFriendly ? '#00eaff' : '#ff4444';
            ctx.fillRect(pos.x - 3, pos.y - 3, 6, 6);
        });

        // Draw exit portal
        if (gameState.exitPortal) {
            const pos = toMapCoords(gameState.exitPortal.position.x, gameState.exitPortal.position.z);
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        }

        // Draw player
        ctx.save();
        ctx.translate(mapSize / 2, mapSize / 2);
        ctx.rotate(-camera.rotation.y); // Use the camera's Y rotation
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); // Draw a triangle for the player
        ctx.moveTo(0, -8);
        ctx.lineTo(5, 5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function togglePause() {
        const { gameState, canvas } = Game;
        gameState.isPaused = !gameState.isPaused;
        const pauseMenu = document.getElementById('pauseMenu');
        if (gameState.isPaused) {
            document.exitPointerLock();
            hideDatalog();
            hideControls();
            pauseMenu.style.display = 'flex';
            drawMinimap();
            gameState.isLocked = false;
        } else {
            pauseMenu.style.display = 'none';
            canvas.requestPointerLock();
            animate(); // Restart the loop
        }
    }

    const events = [{
        name: 'LIGHTS FLICKERING',
        duration: 5000,
        effect: () => {
            Game.mainLight.intensity = 0.3 + Math.random() * 0.7;
        }
    }, {
        name: 'REALITY SHIFT',
        duration: 3000,
        effect: () => {
            Game.scene.fog.color.setHex(Math.random() * 0xffffff);
            Game.gameState.sanity -= 0.001;
        }
    }, {
        name: 'ENTITY SPAWN',
        duration: 1000,
        effect: () => {
            const { scene, camera, gameState, createEntity } = Game;
            if (gameState.entities.filter(e => !e.isFriendly).length < 15) {
                const a = Math.random() * Math.PI * 2,
                    r = 30;
                const nE = createEntity(camera.position.x + Math.sin(a) * r, camera.position.z + Math.cos(a) * r, Math.floor(Math.random() * 3));
                gameState.entities.push(nE);
                scene.add(nE);
            }
        }
    }, {
        name: 'SANDSTORM',
        duration: 15000,
        onStart: () => {
            const { scene, gameState } = Game;
            if (!gameState.sandstorm) {
                gameState.sandstorm = createSandstorm();
                scene.add(gameState.sandstorm);
            }
            gameState.sandstorm.visible = true;
            scene.fog.density = 0.1;
        },
        onEnd: () => {
            const { scene, gameState } = Game;
            if (gameState.sandstorm) gameState.sandstorm.visible = false;
            scene.fog.density = 0.025;
        }
    }, {
        name: 'BLOOD RAIN',
        duration: 10000,
        onStart: () => {
            const { scene, gameState } = Game;
            if (!gameState.bloodRain) {
                gameState.bloodRain = createBloodRain();
                scene.add(gameState.bloodRain);
            }
            gameState.bloodRain.visible = true;
            gameState.sanity -= 0.1;
        },
        onEnd: () => {
            if (Game.gameState.bloodRain) Game.gameState.bloodRain.visible = false;
        }
    }];

    function triggerEvent() {
        const { gameState } = Game;
        if (!gameState.activeEvent && Math.random() < 0.3) {
            gameState.activeEvent = events[Math.floor(Math.random() * events.length)];
            gameState.eventTimer = gameState.activeEvent.duration;
            document.getElementById('eventText').textContent = gameState.activeEvent.name;
            document.getElementById('eventText').style.opacity = 1;
            addToDatalog(`Event Triggered: ${gameState.activeEvent.name}`, 'EVENT');
            if (gameState.activeEvent.onStart) {
                gameState.activeEvent.onStart();
            }
        }
    }

    function attack() {
        const { gameState } = Game;
        if (gameState.activeWeapon === 'gun') shoot();
        else if (gameState.activeWeapon === 'sword') swingSword();
        else if (gameState.activeWeapon === 'shotgun') shootShotgun();
        else if (gameState.activeWeapon === 'railgun') shootRailgun();
        else if (gameState.activeWeapon === 'tentacle') whipTentacle();
        else if (gameState.activeWeapon === 'rifle') shootRifle();
        else if (gameState.activeWeapon === 'flamethrower') shootFlamethrower();
    }

    function shoot() {
        const { scene, camera, gameState, createProjectile } = Game;
        const now = performance.now();
        if (gameState.ammo > 0 && !gameState.reloading && now - gameState.lastShot > 200) {
            AudioEngine.play('shoot');
            gameState.ammo--;
            gameState.lastShot = now;
            if (gameState.pistol) {
                gameState.pistol.rotation.x = -0.2;
                gameState.pistol.position.z = -0.4;
            }
            const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const p = createProjectile(camera.position.clone(), d);
            gameState.projectiles.push(p);
            scene.add(p);
        }
    }

    function shootShotgun() {
        const { scene, camera, gameState, createProjectile } = Game;
        const now = performance.now();
        if (gameState.ammo > 0 && !gameState.reloading && now - gameState.lastShot > 1000) {
            AudioEngine.play('shoot');
            gameState.ammo--;
            gameState.lastShot = now;
            for (let i = 0; i < 8; i++) {
                const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                const s = 0.1;
                d.x += (Math.random() - 0.5) * s;
                d.y += (Math.random() - 0.5) * s;
                d.z += (Math.random() - 0.5) * s;
                const p = createProjectile(camera.position.clone(), d, 0xff8800, 50, 1.5);
                gameState.projectiles.push(p);
                scene.add(p);
            }
        }
    }

    function shootRailgun() {
        const { scene, camera, gameState } = Game;
        const now = performance.now();
        if (!gameState.reloading && now - gameState.lastShot > 2000) {
            AudioEngine.play('railgun');
            gameState.lastShot = now;
            const r = new THREE.Raycaster(),
                d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            r.set(camera.position, d);
            const intersects = r.intersectObjects(gameState.entities, true);
            const bM = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }),
                bG = new THREE.CylinderGeometry(0.05, 0.05, 100, 8),
                beam = new THREE.Mesh(bG, bM);
            beam.position.copy(camera.position).add(d.multiplyScalar(50));
            beam.quaternion.copy(camera.quaternion);
            beam.rotation.x += Math.PI / 2;
            Game.safeAdd(scene, beam, 'Railgun Beam');
            setTimeout(() => scene.remove(beam), 100);
            if (intersects.length > 0) {
                const hit = intersects[0].object;
                if (hit && hit.userData && !hit.userData.isFriendly) {
                    hit.userData.health -= 10;
                    AudioEngine.play('entityHit');
                    if (hit.userData.health <= 0) {
                        if (!hit.userData.deathTime) hit.userData.deathTime = performance.now();
                        gameState.kills++;
                        if (gameState.kills === 10) {
                            showEventText("Rifle Unlocked! Press 6 to equip.");
                        }
                        gameState.sanity = Math.min(1, gameState.sanity + 0.1);
                    }
                }
            }
        }
    }

    function shootRifle() {
        const { scene, camera, gameState, createProjectile } = Game;
        const now = performance.now();
        if (gameState.ammo > 0 && !gameState.reloading && now - gameState.lastShot > 100) {
            AudioEngine.play('shoot');
            gameState.ammo--;
            gameState.lastShot = now;
            if (gameState.rifle) {
                gameState.rifle.rotation.x = -0.2;
                gameState.rifle.position.z = -0.4;
            }
            const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const p = createProjectile(camera.position.clone(), d, 0x00ff00, 100, 2.0);
            gameState.projectiles.push(p);
            scene.add(p);
        }
    }

    function shootFlamethrower() {
        const { scene, camera, gameState } = Game;
        const now = performance.now();
        if (now - gameState.lastShot > 50) {
            AudioEngine.play('flamethrower');
            gameState.lastShot = now;
            const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const p = createProjectile(camera.position.clone(), d, 0xffa500, 50, 0.5);
            p.userData.isFlame = true;
            gameState.projectiles.push(p);
            scene.add(p);
        }
    }

    function swingSword() {
        const { camera, gameState } = Game;
        if (gameState.isSwinging) return;
        gameState.isSwinging = true;
        gameState.swingStartTime = performance.now();
        AudioEngine.play('swordSwing');
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        gameState.entities.forEach(e => {
            const entityObject = e.mesh ? e.mesh : e;
            if (!entityObject.userData.isFriendly && entityObject.position.distanceTo(camera.position) < 2.5) {
                const d = entityObject.position.clone().sub(camera.position).normalize();
                if (f.dot(d) > 0.8) {
                    entityObject.userData.health -= 3;
                    AudioEngine.play('entityHit');
                    if (entityObject.userData.health <= 0) {
                        if (!entityObject.userData.deathTime) entityObject.userData.deathTime = performance.now();
                        gameState.kills++;
                        if (gameState.kills === 10) {
                            showEventText("Rifle Unlocked! Press 6 to equip.");
                        }
                        gameState.sanity = Math.min(1, gameState.sanity + 0.1);
                    }
                }
            }
        });
        setTimeout(() => {
            gameState.isSwinging = false;
        }, 500);
    }

    function whipTentacle() {
        const { camera, gameState } = Game;
        if (gameState.isWhipping) return;
        gameState.isWhipping = true;
        gameState.whipStartTime = performance.now();
        AudioEngine.play('tentacleWhip');
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        gameState.entities.forEach(e => {
            const entityObject = e.mesh ? e.mesh : e;
            if (!entityObject.userData.isFriendly && entityObject.position.distanceTo(camera.position) < 4) {
                const d = entityObject.position.clone().sub(camera.position).normalize();
                if (f.dot(d) > 0.7) {
                    entityObject.userData.health -= 2;
                    AudioEngine.play('entityHit');
                    if (entityObject.userData.health <= 0) {
                        if (!entityObject.userData.deathTime) entityObject.userData.deathTime = performance.now();
                        gameState.kills++;
                        if (gameState.kills === 10) {
                            showEventText("Rifle Unlocked! Press 6 to equip.");
                        }
                        gameState.sanity = Math.min(1, gameState.sanity + 0.1);
                    }
                }
            }
        });
        setTimeout(() => {
            gameState.isWhipping = false;
        }, 700);
    }

    function handleConversations() {
        const { camera, gameState } = Game;
        const now = performance.now();
        gameState.entities.forEach(entity => {
            const entityObject = entity.mesh ? entity.mesh : entity;
            const ud = entityObject.userData;
            const distToPlayer = camera.position.distanceTo(entityObject.position);
            if (distToPlayer < 10 && ud.canSpeak && now - ud.lastSpokeTime > 10000) {
                if (ud.isFriendly) {
                    ud.canSpeak = false;
                    ud.lastSpokeTime = now;
                    let dialogueSet = gameState.sanity > 0.8 ? ud.dialogue.highSanity : (gameState.sanity < 0.4 ? ud.dialogue.lowSanity : ud.dialogue.normal);
                    const line = dialogueSet[ud.dialogueIndex % dialogueSet.length];
                    const dialogueBox = document.getElementById('dialogueBox');
                    dialogueBox.textContent = line;
                    dialogueBox.style.color = '#00eaff';
                    dialogueBox.style.opacity = 1;
                    AudioEngine.speakFriendly(line, () => {
                        addToDatalog(line, 'FRIENDLY');
                        setTimeout(() => {
                            dialogueBox.style.opacity = 0;
                            ud.canSpeak = true;
                            ud.dialogueIndex++;
                        }, 2000);
                    });
                } else if (now - ud.lastSpokeTime > 20000) {
                    ud.canSpeak = false;
                    ud.lastSpokeTime = now;
                    let dialogueSet = ud.dialogue.normal;
                    const line = dialogueSet[ud.dialogueIndex % dialogueSet.length];
                    const dialogueBox = document.getElementById('dialogueBox');
                    dialogueBox.textContent = line;
                    dialogueBox.style.color = '#ff0000';
                    dialogueBox.style.opacity = 1;
                    AudioEngine.speakEnemy(line, () => {
                        addToDatalog(line, 'HOSTILE');
                        setTimeout(() => {
                            dialogueBox.style.opacity = 0;
                            ud.canSpeak = true;
                            ud.dialogueIndex++;
                        }, 2000);
                    });
                }
            }
        });
        const friendlies = gameState.entities.filter(e => (e.mesh ? e.mesh.userData.isFriendly : e.userData.isFriendly));
        const hostiles = gameState.entities.filter(e => !(e.mesh ? e.mesh.userData.isFriendly : e.userData.isFriendly));

        friendlies.forEach(friendlyEntity => {
            const friendly = friendlyEntity.mesh ? friendlyEntity.mesh : friendlyEntity;
            hostiles.forEach(hostileEntity => {
                const hostile = hostileEntity.mesh ? hostileEntity.mesh : hostileEntity;
                const dist = friendly.position.distanceTo(hostile.position);
                if (dist < 15 && friendly.userData.canSpeak && hostile.userData.canSpeak && now - friendly.userData.lastSpokeTime > 15000 && now - hostile.userData.lastSpokeTime > 15000) {
                    friendly.userData.canSpeak = false;
                    hostile.userData.canSpeak = false;
                    friendly.userData.lastSpokeTime = now;
                    hostile.userData.lastSpokeTime = now;
                    const hostileDialogueSet = hostile.userData.dialogue.normal,
                        hostileLine = hostileDialogueSet[hostile.userData.dialogueIndex % hostileDialogueSet.length];
                    hostile.userData.dialogueIndex++;
                    const friendlyResponse = friendly.userData.dialogue.enemyResponses[hostileLine] || "What are you talking about?";
                    const dialogueBox = document.getElementById('dialogueBox');
                    setTimeout(() => {
                        dialogueBox.textContent = hostileLine;
                        dialogueBox.style.color = '#ff0000';
                        dialogueBox.style.opacity = 1;
                        AudioEngine.speakEnemy(hostileLine);
                        addToDatalog(hostileLine, 'HOSTILE');
                    }, 0);
                    setTimeout(() => {
                        dialogueBox.textContent = friendlyResponse;
                        dialogueBox.style.color = '#00eaff';
                        dialogueBox.style.opacity = 1;
                        AudioEngine.speakFriendly(friendlyResponse);
                        addToDatalog(friendlyResponse, 'FRIENDLY');
                    }, 3000);
                    setTimeout(() => {
                        dialogueBox.style.opacity = 0;
                        friendly.userData.canSpeak = true;
                        hostile.userData.canSpeak = true;
                    }, 6000);
                }
            });
        });
    }

    function updateZombieAnimations(entity, action) {
        const zombieAnimations = Game.zombieAnimations();
        const mixer = entity.userData.mixer;
        if (!mixer || !zombieAnimations || zombieAnimations.length === 0) return;

        if (!entity.userData.actions) {
            entity.userData.actions = {};
            const preferredNames = ['walk', 'run', 'attack', 'idle', 'death'];
            preferredNames.forEach(name => {
                const clip = THREE.AnimationClip.findByName(zombieAnimations, name) || THREE.AnimationClip.findByName(zombieAnimations, name.charAt(0).toUpperCase() + name.slice(1));
                if (clip) {
                    entity.userData.actions[name] = mixer.clipAction(clip);
                }
            });

            if (Object.keys(entity.userData.actions).length === 0) {
                console.warn("No named animations found. Falling back to index mapping.");
                const mapping = ['attack', 'walk', 'death', 'idle', 'run'];
                zombieAnimations.forEach((clip, index) => {
                    const actionName = mapping[index];
                    if (actionName) entity.userData.actions[actionName] = mixer.clipAction(clip);
                });
            }
        }

        const newAction = entity.userData.actions[action] || entity.userData.actions['idle'];
        const oldAction = entity.userData.currentAction;

        if (newAction && newAction !== oldAction) {
            if (oldAction) {
                oldAction.fadeOut(0.2);
            }

            newAction.reset();

            if (action === 'attack' || action === 'death') {
                newAction.setLoop(THREE.LoopOnce, 1);
                newAction.clampWhenFinished = true;
            } else {
                newAction.setLoop(THREE.LoopRepeat);
            }

            newAction.fadeIn(0.2).play();
            entity.userData.currentAction = newAction;
        }
    }

    // --- Event Listeners ---
    window.addEventListener('keydown', (e) => {
        const { gameState, shaderModes } = Game;
        const key = e.key.toLowerCase();
        gameState.keys[key] = true;
        if (key === '1') switchWeapon('gun');
        if (key === '2') switchWeapon('sword');
        if (key === '3') switchWeapon('tentacle');
        if (key === '4') switchWeapon('railgun');
        if (key === '5') switchWeapon('shotgun');
        if (key === '6') switchWeapon('rifle');
        if (key === '7') switchWeapon('flamethrower');
        if (key === 'r' && (gameState.activeWeapon === 'gun' || gameState.activeWeapon === 'shotgun' || gameState.activeWeapon === 'rifle') && !gameState.reloading) {
            AudioEngine.play('reload');
            gameState.reloading = true;
            setTimeout(() => {
                if (gameState.activeWeapon === 'gun' || gameState.activeWeapon === 'rifle') gameState.ammo = gameState.maxAmmo;
                if (gameState.activeWeapon === 'shotgun') gameState.ammo = 8;
                gameState.reloading = false;
            }, 1500);
        }
        if (key === 'tab') {
            e.preventDefault();
            gameState.shaderMode = (gameState.shaderMode + 1) % shaderModes.length;
            document.getElementById('shaderMode').textContent = shaderModes[gameState.shaderMode];
            updateWallMaterials();
        }
        if (key === 'e') {
            if (gameState.truck.isDriving) {
                gameState.truck.isDriving = false;
                const exitOffset = new THREE.Vector3(-4, 0, 0);
                exitOffset.applyQuaternion(gameState.truck.object.quaternion);
                Game.camera.position.copy(gameState.truck.object.position).add(exitOffset);
                Game.camera.position.y = 1.6;
            } else if (gameState.truck.object && Game.camera.position.distanceTo(gameState.truck.object.position) < 5) {
                if (gameState.isPaused) return; // Don't enter truck if paused
                gameState.truck.isDriving = true;
            }
        }
        if (key === 'escape') {
            togglePause();
        }
        if (key === 'n') {
            gameState.isNightVision = !gameState.isNightVision;
            Game.nightVisionPass.enabled = gameState.isNightVision;
            // Toggle flashlight with night vision
            if (gameState.isNightVision) {
                Game.flashlight.intensity = 1.5;
            } else {
                Game.flashlight.intensity = 0;
            }
        }
        if (key === 'f') { // Manual flashlight toggle
            if (Game.flashlight.intensity > 0) {
                Game.flashlight.intensity = 0;
                gameState.isNightVision = false; // Also turn off NV if flashlight is manually turned off
                Game.nightVisionPass.enabled = false;
            } else {
                Game.flashlight.intensity = 1.5;
            }
        }
        if (key === 'm') {
            // Toggle aiming state
            Game.isAiming = !Game.isAiming; // This needs to be on the Game object
        }
    });
    window.addEventListener('keyup', (e) => {
        Game.gameState.keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !Game.gameState.isPaused) { // Left mouse button
            Game.isFiring = true; // This needs to be on the Game object
        }
        if (e.button === 2 && !Game.gameState.isPaused) { // Right mouse button
            Game.isAiming = true; // This needs to be on the Game object
        }
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 0) { // Left mouse button
            Game.isFiring = false;
        }
        if (e.button === 2) { // Right mouse button
            Game.isAiming = false;
        }
    });

    Game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    Game.canvas.addEventListener('click', () => {
        const { gameState } = Game;
        if (!AudioEngine.isInitialized) AudioEngine.init();
        if (gameState.isPaused) return;
        if (!gameState.isLocked) {
            Game.canvas.requestPointerLock();
            const musicPlayer = document.getElementById('bgMusicPlayer');
            if (musicPlayer.paused && gameState.musicState.track !== 'off') musicPlayer.play().catch(e => { });
        } else if (gameState.activeWeapon !== 'rifle') {
            attack();
        }
    });
    document.addEventListener('pointerlockchange', () => {
        const { gameState } = Game;
        gameState.isLocked = document.pointerLockElement === Game.canvas;
        if (!gameState.isLocked && !gameState.isPaused) {
            if (gameState.pauseView !== 'datalog') {
                togglePause();
            }
        }
    });
    Game.canvas.addEventListener('mousemove', (e) => {
        const { gameState } = Game;
        if (gameState.isLocked) {
            gameState.rotation.y -= e.movementX * 0.002;
            gameState.rotation.x -= e.movementY * 0.002;
            gameState.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, gameState.rotation.x));
        }
    });

    document.getElementById('resumeButton').addEventListener('click', togglePause);
    document.getElementById('datalogButton').addEventListener('click', showDatalog);
    document.getElementById('controlsButton').addEventListener('click', showControls);
    document.getElementById('controlsBackButton').addEventListener('click', hideControls);
    document.getElementById('datalogBackButton').addEventListener('click', hideDatalog);

    window.addEventListener('resize', () => {
        const { camera, renderer, composer } = Game;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });


    // The main game loop
    function animate() {
        const { scene, camera, renderer, composer, nightVisionPass, flashlight, gameState, isFiring, isAiming, wallMaterial, sky, createProjectile, createEntity } = Game;

        if (gameState.isDead || gameState.isPaused) return;
        requestAnimationFrame(animate);
        const time = performance.now() * 0.001;
        const delta = time - (gameState.lastTime || time);
        gameState.lastTime = time;

        // --- Aim Down Sights (ADS) Logic ---
        const targetFOV = isAiming ? 45 : gameState.defaultFOV;
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, 0.15);
        camera.updateProjectionMatrix();

        const targetSensitivity = isAiming ? 0.001 : 0.002;
        gameState.sensitivity = THREE.MathUtils.lerp(gameState.sensitivity, targetSensitivity, 0.15);

        // Update crosshair visibility
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = isAiming ? 'none' : 'block';

        if (nightVisionPass.enabled) {
            if (gameState.nvKey) gameState.nvKey.visible = true;
            nightVisionPass.uniforms.time.value = time;
        } else {
            if (gameState.nvKey) gameState.nvKey.visible = false;
        }

        // Pickup logic for NV key
        if (gameState.nvKey && !gameState.hasNVKey && gameState.isNightVision) {
            if (camera.position.distanceTo(gameState.nvKey.position) < 2.0) {
                gameState.hasNVKey = true;
                scene.remove(gameState.nvKey);
                showEventText("SPECIAL KEY ACQUIRED");
                AudioEngine.play('pickup');
            }
        }

        // Ghost spawning and update logic
        if (gameState.isNightVision && gameState.ghostTextures.length > 0) {
            // Spawn new ghosts if conditions met
            if (gameState.ghosts.length < 5 && Math.random() < 0.005) { // Max 5 ghosts, 0.5% chance per frame
                const spawnDistance = 10 + Math.random() * 10; // 10-20 units from player
                const angle = Math.random() * Math.PI * 2;
                const spawnX = camera.position.x + Math.sin(angle) * spawnDistance;
                const spawnZ = camera.position.z + Math.cos(angle) * spawnDistance;
                const spawnY = camera.position.y + (Math.random() - 0.5) * 2; // Around player height

                const randomTexture = gameState.ghostTextures[Math.floor(Math.random() * gameState.ghostTextures.length)];
                const newGhost = createGhost(spawnX, spawnY, spawnZ, randomTexture);
                Game.safeAdd(scene, newGhost, 'Ghost');
                gameState.ghosts.push(newGhost);
            }

            for (let i = gameState.ghosts.length - 1; i >= 0; i--) {
                const ghost = gameState.ghosts[i];
                if (!ghost.parent) { // Ghost already removed
                    gameState.ghosts.splice(i, 1);
                    continue;
                }

                ghost.userData.lifetime += delta * 1000; // Convert delta to ms

                // Fade in/out logic
                if (ghost.userData.state === 'fadingIn') {
                    ghost.material.opacity += ghost.userData.fadeSpeed;
                    if (ghost.material.opacity >= 0.8) { // Max opacity
                        ghost.material.opacity = 0.8;
                        ghost.userData.state = 'active';
                    }
                } else if (ghost.userData.state === 'active') {
                    // Stay active for a while
                    if (ghost.userData.lifetime > ghost.userData.maxLifetime * 0.7) { // Start fading out after 70% lifetime
                        ghost.userData.state = 'fadingOut';
                    }
                } else if (ghost.userData.state === 'fadingOut') {
                    ghost.material.opacity -= ghost.userData.fadeSpeed * 1.5; // Fade out faster
                    if (ghost.material.opacity <= 0) {
                        disposeGhost(ghost, scene);
                        gameState.ghosts.splice(i, 1);
                        continue; // Move to next ghost
                    }
                }

                // Simple floating movement
                ghost.position.y += Math.sin(time * 2 + i) * 0.005;
                ghost.position.x += Math.cos(time * 1.5 + i) * 0.003;
                ghost.position.z += Math.sin(time * 1.8 + i) * 0.004;

                // Harassment effect
                const distToPlayer = camera.position.distanceTo(ghost.position);
                if (distToPlayer < ghost.userData.harassmentRange) {
                    gameState.sanity -= ghost.userData.damage * delta; // Sanity drain
                }
            }
        } else {
            // If night vision is off, remove all ghosts
            gameState.ghosts.forEach(ghost => disposeGhost(ghost, scene));
            gameState.ghosts = [];
        }

        // Update floating anomalies
        gameState.anomalies.forEach(anomaly => {
            anomaly.material.uniforms.time.value = time;
            anomaly.position.add(anomaly.userData.velocity);
            anomaly.rotation.x += 0.001;
            anomaly.rotation.y += 0.002;
            if (anomaly.position.distanceTo(camera.position) > 100) {
                anomaly.position.set((Math.random() - 0.5) * 80, Math.random() * 10 + 2, (Math.random() - 0.5) * 80);
            }
        });

        // Update blood rain
        if (gameState.bloodRain && gameState.bloodRain.visible) {
            const positions = gameState.bloodRain.geometry.attributes.position.array;
            const velocities = gameState.bloodRain.geometry.attributes.velocity.array;
            const rainHeight = gameState.bloodRain.userData.rainHeight;

            // Make rain follow the player
            gameState.bloodRain.position.x = camera.position.x;
            gameState.bloodRain.position.z = camera.position.z;

            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += velocities[i + 1];
                if (positions[i + 1] < 0) {
                    positions[i + 1] = rainHeight;
                }
            }
            gameState.bloodRain.geometry.attributes.position.needsUpdate = true;
        }

        // Update sandstorm
        if (gameState.sandstorm && gameState.sandstorm.visible) {
            const positions = gameState.sandstorm.geometry.attributes.position.array;
            const velocities = gameState.sandstorm.userData.velocities;
            const stormRadius = 50;

            gameState.sandstorm.position.x = camera.position.x;
            gameState.sandstorm.position.z = camera.position.z;

            for (let i = 0; i < positions.length; i += 3) {
                positions[i] += velocities[i] + Math.sin(time + positions[i + 2]) * 0.1;
                positions[i + 2] += velocities[i + 2] + Math.cos(time + positions[i]) * 0.1;

                if (Math.sqrt(positions[i] * positions[i] + positions[i + 2] * positions[i + 2]) > stormRadius) {
                    positions[i] *= -0.95;
                    positions[i + 2] *= -0.95;
                }
            }
            gameState.sandstorm.geometry.attributes.position.needsUpdate = true;
        }

        // Handle automatic rifle fire
        if (isFiring && gameState.activeWeapon === 'rifle' && !gameState.isPaused) {
            attack();
        }

        if (wallMaterial.userData.shader) {
            wallMaterial.userData.shader.uniforms.time.value = time;
            wallMaterial.userData.shader.uniforms.sanity.value = gameState.sanity;
        }
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

        if (gameState.truck.isDriving) {
            if (gameState.keys['w']) gameState.truck.speed += 0.01;
            else if (gameState.keys['s']) gameState.truck.speed -= 0.01;
            gameState.truck.speed *= 0.95;
            if (gameState.keys['a']) gameState.truck.object.rotation.y += 0.02;
            if (gameState.keys['d']) gameState.truck.object.rotation.y -= 0.02;

            const truckForward = new THREE.Vector3(0, 0, -1).applyQuaternion(gameState.truck.object.quaternion);
            gameState.truck.object.position.add(truckForward.multiplyScalar(gameState.truck.speed));

            const cameraOffset = new THREE.Vector3(0, 5, 10);
            const cameraPosition = cameraOffset.applyMatrix4(gameState.truck.object.matrixWorld);
            camera.position.copy(cameraPosition);
            camera.lookAt(gameState.truck.object.position);
        } else {
            if (sky && sky.material.uniforms.time) {
                sky.material.uniforms.time.value = time;
                sky.material.uniforms.speed.value = 0.25;
            }

            Object.values(gameState.chunks).forEach(chunk => {
                chunk.traverse(child => {
                    if (child.material && child.material.uniforms && child.material.uniforms.time) {
                        child.material.uniforms.time.value = time;
                    }
                });
            });

            // Update floor shaders with zombie positions
            const nearbyZombies = gameState.entities
                .map(e => e.mesh || e)
                .filter(e => e.userData && !e.userData.isFriendly && e.userData.health > 0 && e.position.distanceTo(camera.position) < 30)
                .slice(0, 10); // Limit to 10

            Object.values(gameState.chunks).forEach(chunk => {
                chunk.traverse(child => {
                    // This check ensures we only update the floor shader with zombie data.
                    if (child.isMesh && child.material && child.material.userData.shader && child.material.userData.shader.uniforms.zombiePositions) {
                        const shader = child.material.userData.shader;
                        // The time uniform is already updated for the floor in the loop above,
                        // but we need to update the zombie-specific uniforms here.
                        shader.uniforms.zombieCount.value = nearbyZombies.length;
                        nearbyZombies.forEach((zombie, i) => {
                            if (shader.uniforms.zombiePositions.value[i])
                                shader.uniforms.zombiePositions.value[i].copy(zombie.position);
                        });
                    }
                });
            });

            if (performance.now() - gameState.lastChunkUpdateTime > gameState.chunkUpdateInterval && !gameState.truck.isDriving) {
                updateChunks(camera.position);
                gameState.lastChunkUpdateTime = performance.now();
            }

            Object.values(gameState.chunks).forEach(chunk => {
                if (chunk.userData && chunk.userData.collectibles) {
                    chunk.userData.collectibles.forEach((orb) => {
                        if (!orb || orb.userData.collected) return;
                        const d = orb.position.distanceTo(camera.position.clone().sub(chunk.position));
                        if (d < 2.0) {
                            orb.userData.collected = true;
                            AudioEngine.play('pickup');
                            gameState.collected++;
                            document.getElementById('collected').textContent = gameState.collected;
                            if (orb.parent) orb.parent.remove(orb);
                            if (orb.geometry) orb.geometry.dispose();
                            if (orb.material) orb.material.dispose();
                        }
                    });
                    chunk.userData.collectibles = chunk.userData.collectibles.filter(o => o && !o.userData.collected);
                }
            });
            gameState.flickeringLights.forEach(light => {
                if (Math.random() > 0.95) light.intensity = Math.random() * 1.5;
            });

            camera.rotation.y = gameState.rotation.y;
            camera.rotation.x = gameState.rotation.x;

            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
                moveDirection = new THREE.Vector3();
            if (gameState.keys['w']) moveDirection.add(forward);
            if (gameState.keys['s']) moveDirection.sub(forward);
            if (gameState.keys['a']) moveDirection.sub(right);
            if (gameState.keys['d']) moveDirection.add(right);
            if (moveDirection.length() > 0) {
                const bobHeight = Math.cos(time * 8) * 0.03;
                camera.position.y = 1.6 + bobHeight;
                camera.position.add(moveDirection.normalize().multiplyScalar(gameState.moveSpeed));
                if (performance.now() - gameState.lastStepTime > 400) {
                    AudioEngine.play('walk');
                    gameState.lastStepTime = performance.now();
                }
            }

            const isMoving = moveDirection.length() > 0.01;
            if (gameState.pistol && gameState.pistol.visible) {
                const bobAngle = Math.sin(time * 2) * 0.02;
                const bobHeight = isMoving && !isAiming ? Math.cos(time * 8) * 0.02 : 0;
                const targetPos = isAiming ? new THREE.Vector3(0, -0.15, -0.45) : new THREE.Vector3(0.3, -0.3 + bobHeight, -0.5);
                gameState.pistol.position.lerp(targetPos, 0.15);
                gameState.pistol.rotation.z = bobAngle;
                gameState.pistol.rotation.x = THREE.MathUtils.lerp(gameState.pistol.rotation.x, 0, 0.1);
                gameState.pistol.rotation.y = THREE.MathUtils.lerp(gameState.pistol.rotation.y, Math.PI, 0.15);
            }
            if (gameState.rifle && gameState.rifle.visible) {
                const bobAngle = Math.sin(time * 2) * 0.02,
                    bobHeight = isMoving ? Math.cos(time * 8) * 0.02 : 0;
                const aimOffset = isAiming ? -0.1 : 0;
                gameState.rifle.position.set(0.3, -0.3 + bobHeight + aimOffset, isAiming ? -0.4 : -0.5);
                gameState.rifle.rotation.z = bobAngle;
                gameState.rifle.rotation.x = THREE.MathUtils.lerp(gameState.rifle.rotation.x, 0, 0.1);
            }
            if (gameState.sword && gameState.sword.visible) {
                const swingProgress = gameState.isSwinging ? (performance.now() - gameState.swingStartTime) / 400 : 0; // Faster swing
                if (gameState.isSwinging) {
                    // More dynamic slash animation
                    const p = Math.min(swingProgress, 1);
                    const windUp = Math.sin(p * Math.PI * 0.5); // First quarter of sine wave for wind-up
                    const slash = Math.sin(p * Math.PI); // Full sine wave for the slash motion

                    gameState.sword.position.set(0.4 - windUp * 0.4, -0.4 + windUp * 0.2, -0.8 + windUp * 0.2);
                    gameState.sword.rotation.set(windUp * 0.5, -windUp * 0.8, slash * 1.5);
                } else {
                    // Idle bob
                    const bobAngle = Math.sin(time * 2) * 0.05, bobHeight = isMoving ? Math.cos(time * 8) * 0.05 : 0;
                    gameState.sword.position.set(0.4, -0.4 + bobHeight, -0.8);
                    gameState.sword.rotation.set(0, 0, bobAngle);
                }
            }
            if (gameState.tentacle && gameState.tentacle.visible) { const whipProgress = gameState.isWhipping ? (performance.now() - gameState.whipStartTime) / 700 : 0; gameState.tentacle.position.set(0.5, -0.7, -1.2); gameState.tentacle.rotation.z = Math.sin(time * 5) * 0.2; gameState.tentacle.children.forEach((segment, i) => { const angle = Math.sin(i * 0.5 + time * 10) * 0.3; segment.position.x = Math.sin(i * 0.5 + time * 5) * i * 0.05; segment.rotation.z = angle; if (gameState.isWhipping) { const whipAngle = Math.sin(Math.min(whipProgress, 1) * Math.PI); segment.position.x += Math.sin(i * 0.5 + whipProgress * 10) * 0.5; segment.position.z = Math.cos(i * 0.5 + whipProgress * 10) * 0.5; } }); }
        }

        let closestHostileDist = 1000;
        gameState.entities.forEach(entity => {
            let entityObject = entity.mesh ? entity.mesh : entity;

            if (entity.update) { // specifically for BlackGooEntity class
                entity.update();
            }
            // Update alien shader time uniform
            if (entityObject.userData.type === 2 && entityObject.material.uniforms) {
                entityObject.material.uniforms.time.value = time;
            }
            if (entityObject.userData.deathTime && performance.now() - entityObject.userData.deathTime > 2000) {
                // Respawn logic
                if (!entityObject.userData.isFriendly) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 40 + Math.random() * 20;
                    entityObject.position.set(
                        camera.position.x + Math.sin(angle) * radius,
                        0,
                        camera.position.z + Math.cos(angle) * radius
                    );
                    entityObject.userData.health = 3; // Reset health
                    entityObject.userData.deathTime = null;
                } else {
                    scene.remove(entityObject);
                    gameState.entities = gameState.entities.filter(e => e !== entity);
                }
                return; // Continue to next entity
            }
            if (entityObject.userData.mixer) {
                const dist = entityObject.position.distanceTo(camera.position);
                let action = 'idle';
                if (entityObject.userData.health <= 0) {
                    action = 'death';
                } else if (dist < 2.5) {
                    action = 'attack';
                } else if (dist < 15) {
                    action = 'walk'; // Zombies move at this speed when closer
                    entityObject.userData.speed = 0.015; // Further slowed down from 0.025
                } else {
                    action = 'run'; // Changed from 'walk' to 'run' for this speed
                    entityObject.userData.speed = 0.01;
                }
                updateZombieAnimations(entityObject, action);
                // Only double the speed for the 'walk' animation
                let animationSpeedMultiplier = 1;
                if (action === 'walk') {
                    animationSpeedMultiplier = 2;
                }
                entityObject.userData.mixer.update(delta * animationSpeedMultiplier);
            }
            if (!entityObject.userData.isFriendly) {
                if (entityObject.userData.health > 0) {
                    const dist = entityObject.position.distanceTo(camera.position);
                    if (dist < closestHostileDist) closestHostileDist = dist;

                    if (dist < 1.5 && !gameState.isDead) {
                        if (!entityObject.userData.lastAttackTime || (performance.now() - entityObject.userData.lastAttackTime > 1000)) {
                            gameState.health -= entityObject.userData.damage || 0.1;
                            gameState.health = Math.max(0, gameState.health);
                            entityObject.userData.lastAttackTime = performance.now();
                        }
                    }

                    const lookAtTarget = camera.position.clone();
                    lookAtTarget.y = entityObject.position.y;
                    entityObject.lookAt(lookAtTarget);
                    if (dist > 2) {
                        const direction = new THREE.Vector3();
                        const cameraGroundPosition = camera.position.clone();
                        cameraGroundPosition.y = entityObject.position.y;
                        direction.subVectors(cameraGroundPosition, entityObject.position).normalize();
                        entityObject.position.add(direction.multiplyScalar(entityObject.userData.speed || 0.01));
                    }
                }
            }
        });

        // Update cloaking shader uniforms for all entities
        const flashlightOn = flashlight.intensity > 0 ? 1.0 : 0.0;
        const flashlightWorldPos = new THREE.Vector3();
        flashlight.getWorldPosition(flashlightWorldPos);

        gameState.entities.forEach(entity => {
            const mesh = entity.mesh || entity;
            mesh.traverse(child => {
                if (child.isMesh && child.material && child.material.userData.shader) {
                    child.material.userData.shader.uniforms.uTime.value = time;
                    child.material.userData.shader.uniforms.uCamPos.value.copy(camera.position);
                    child.material.userData.shader.uniforms.uFlashlightPos.value.copy(flashlightWorldPos);
                    child.material.userData.shader.uniforms.uFlashlightOn.value = flashlightOn;
                }
            });
        });

        for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
            const proj = gameState.projectiles[i];
            proj.position.add(proj.userData.velocity);
            proj.userData.lifetime--;
            if (proj.userData.gravity) {
                proj.userData.velocity.y -= 0.005; // Apply gravity to blood particles
            }
            if (proj.userData.lifetime <= 0) {
                scene.remove(proj); if (proj.geometry) proj.geometry.dispose(); if (proj.material) proj.material.dispose(); gameState.projectiles.splice(i, 1); continue;
            }
            if (proj.userData.gravity) continue; // Blood particles don't do damage
            for (let j = gameState.entities.length - 1; j >= 0; j--) {
                const entity = gameState.entities[j];
                const entityObject = entity.mesh ? entity.mesh : entity;
                if (!entityObject.userData.isFriendly && proj.position.distanceTo(entityObject.position) < 1.5) {
                    entityObject.userData.health--;
                    AudioEngine.play('entityHit');
                    createBloodSplatter(proj.position, scene, gameState, Game.safeAdd);
                    scene.remove(proj); gameState.projectiles.splice(i, 1);
                    if (entityObject.userData.health <= 0) {
                        handleZombieDeath(entityObject);
                    }
                    break;
                }
            }
        }

        handleConversations();

        if (gameState.morphoser) { gameState.morphoser.userData.time += delta * 0.5; const pos = gameState.morphoser.geometry.attributes.position.array, bPos = gameState.morphoser.userData.basePositions; for (let i = 0; i < pos.length; i += 3) { pos[i] = bPos[i] + Math.sin(gameState.morphoser.userData.time + bPos[i + 1]) * 0.5; pos[i + 1] = bPos[i + 1] + Math.cos(gameState.morphoser.userData.time + bPos[i + 2]) * 0.5; pos[i + 2] = bPos[i + 2] + Math.sin(gameState.morphoser.userData.time + bPos[i]) * 0.5; } gameState.morphoser.geometry.attributes.position.needsUpdate = true; const distToMorphoser = camera.position.distanceTo(gameState.morphoser.position); if (distToMorphoser < 15 && forward.dot(gameState.morphoser.position.clone().sub(camera.position).normalize()) > 0.7) { gameState.health -= 0.002 * (1 - distToMorphoser / 15); } }

        const warning = document.getElementById('warning');
        if (closestHostileDist < 25) { gameState.sanity -= 0.0008; warning.style.opacity = Math.max(0, 1 - closestHostileDist / 25); } else { warning.style.opacity = 0; }
        if (closestHostileDist < 3) gameState.sanity -= 0.015;

        gameState.sanity = Math.max(0, Math.min(1, gameState.sanity + 0.0001));

        const audioSanity = (gameState.sanity * 0.7) + (gameState.health * 0.3);
        AudioEngine.updateHealthEffect(audioSanity);

        if (gameState.eventTimer > 0) {
            gameState.eventTimer -= 16; // Roughly 60fps
            if (gameState.activeEvent && gameState.activeEvent.effect) {
                gameState.activeEvent.effect();
            }
            if (gameState.eventTimer <= 0) {
                if (gameState.activeEvent && gameState.activeEvent.onEnd) gameState.activeEvent.onEnd();
                gameState.activeEvent = null; scene.fog.color.setHex(0x0a0a0a); Game.mainLight.intensity = 0.8; document.getElementById('eventText').style.opacity = 0;
            }
        } else if (Math.random() < 0.001) { triggerEvent(); }

        if (gameState.exitPortal && camera.position.distanceTo(gameState.exitPortal.position) < 5) { AudioEngine.play('nextLevel'); gameState.level++; camera.position.set(0, 1.6, 0); scene.remove(gameState.exitPortal); gameState.exitPortal = Game.createExitPortal(gameState.level); scene.add(gameState.exitPortal); Game.setupLevel(); }

        if (gameState.health <= 0 && !gameState.isDead) {
            gameState.isDead = true;
            const deathOverlay = document.createElement('div');
            deathOverlay.style.position = 'absolute';
            deathOverlay.style.top = '0';
            deathOverlay.style.left = '0';
            deathOverlay.style.width = '100%';
            deathOverlay.style.height = '100%';
            deathOverlay.style.background = 'rgba(0,0,0,0.8)';
            deathOverlay.style.color = 'red';
            deathOverlay.style.display = 'flex';
            deathOverlay.style.justifyContent = 'center';
            deathOverlay.style.alignItems = 'center';
            deathOverlay.style.fontSize = '72px';
            deathOverlay.style.fontFamily = "'Courier New', monospace";
            deathOverlay.textContent = 'YOU DIED';
            deathOverlay.style.zIndex = '101';
            document.body.appendChild(deathOverlay);
            setTimeout(() => location.reload(), 3000);
            return;
        }

        document.getElementById('health').textContent = (gameState.health * 100).toFixed(0);
        document.getElementById('sanity').textContent = (gameState.sanity * 100).toFixed(0);
        document.getElementById('level').textContent = gameState.level;
        document.getElementById('kills').textContent = gameState.kills;
        document.getElementById('ammo').textContent = gameState.reloading ? 'RELOADING' : `${gameState.ammo} / ∞`;
        document.getElementById('ammoFill').style.width = `${gameState.reloading ? 0 : (gameState.ammo / gameState.maxAmmo) * 100}%`;

        composer.render();
    }

    // Attach the animate function to the Game object
    Game.animate = animate;
};
