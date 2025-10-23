
function createTrippySky() {
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
            flowStrength: { value: 3.2 },
            speed: { value: 0.8 },
            cometSeed: { value: Math.random() * 1000.0 },
            // NEW: Trippy effect parameters
            hueShiftSpeed: { value: 0.15 },
            distortionStrength: { value: 0.35 },
            colorCycleSpeed: { value: 0.25 },
            pulsateIntensity: { value: 0.6 },
            turbulenceScale: { value: 2.5 }
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
            // NEW: Trippy uniforms
            uniform float hueShiftSpeed;
            uniform float distortionStrength;
            uniform float colorCycleSpeed;
            uniform float pulsateIntensity;
            uniform float turbulenceScale;

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

            // NEW: HSL to RGB conversion for hue shifting
            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }

            // NEW: Enhanced psychedelic palette with cycling
            vec3 psychedelicPalette(float t, float cycle) {
                vec3 col1 = mix(nebulaA, vec3(0.0, 1.0, 1.0), sin(cycle * 0.5) * 0.5 + 0.5);
                vec3 col2 = mix(nebulaB, vec3(1.0, 0.0, 1.0), cos(cycle * 0.3) * 0.5 + 0.5);
                return mix(col1, col2, smoothstep(0.0, 1.0, t));
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
                
                // NEW: Dynamic base color cycling
                base = mix(base, vec3(sin(time * hueShiftSpeed) * 0.5 + 0.5, 
                                      cos(time * hueShiftSpeed * 0.7) * 0.5 + 0.5,
                                      sin(time * hueShiftSpeed * 1.3) * 0.5 + 0.5), 0.3);
                
                vec2 sph = vec2(atan(dir.z, dir.x), asin(dir.y));
                vec3 p = vec3(dir * 2.0);
                
                // NEW: Enhanced distortion for trippy warping
                p += sin(p.xy * turbulenceScale + time * 0.4) * distortionStrength;
                p += cos(p.yz * turbulenceScale * 0.7 + time * 0.3) * distortionStrength * 0.7;
                
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
                
                // NEW: Psychedelic color cycling
                float colorCycle = time * colorCycleSpeed;
                vec3 neb = psychedelicPalette(density, colorCycle) * density * 1.8;
                
                // NEW: Enhanced accents with pulsation
                float pulse = sin(time * 2.0 + density * 3.0) * pulsateIntensity + 1.0;
                vec3 accents = mix(accentA, accentB, fract(density * 3.0 + time * 0.4));
                neb += accents * pow(density, 3.0) * 0.8 * pulse;
                
                // NEW: Distorted and pulsating stars
                float starPulse = sin(time * 3.0) * 0.4 + 0.8;
                float stars = hash2(sph * 1000.0 + sin(time * 0.5) * 100.0) * step(0.998, hash2(sph * 200.0 + 10.0)) * starDensity * starPulse;
                stars += hash2(sph * 2000.0 + cos(time * 0.3) * 100.0) * step(0.999, hash2(sph * 400.0 + 20.0)) * starDensity * 0.6 * starPulse;
                stars = pow(stars, 2.0);
                
                // NEW: Color-shifting stars
                vec3 shiftedStarColor = mix(starColor, vec3(sin(time * hueShiftSpeed) * 0.5 + 0.5, 
                                                             cos(time * hueShiftSpeed * 0.8) * 0.5 + 0.5,
                                                             sin(time * hueShiftSpeed * 1.2) * 0.5 + 0.5), 0.6);
                
                float cometTime = fract(time * 0.05 + cometSeed);
                vec2 cometDir = vec2(sin(cometSeed + time * 0.1), cos(cometSeed + time * 0.1));
                vec2 cometCenter = vec2(cometTime * 2.0 - 1.0, sin(cometSeed * 2.0 + time * 0.2) * 0.5);
                float c = comet(sph, cometCenter, cometDir, 0.3, 0.005);
                
                // NEW: Multiple comets for extra wildness
                float c2 = comet(sph, cometCenter * 0.7, cometDir * 0.8, 0.25, 0.003);
                vec3 cometColor = mix(accentA, accentB, sin(time * colorCycleSpeed) * 0.5 + 0.5);
                
                vec3 finalColor = base + neb + stars * shiftedStarColor + (c + c2 * 0.6) * cometColor * 2.2;
                
                // NEW: Subtle vignette and overall color shift for immersion
                float vignette = 1.0 - length(sph) * 0.3;
                finalColor *= vignette;
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });
    const skyGeo = new THREE.SphereGeometry(300, 56, 56);
    const sky = new THREE.Mesh(skyGeo, skyMaterial);
    return sky;
}
