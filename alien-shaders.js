const alienVertexShader = `
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vDistort;
    varying vec3 vPosition;

    uniform float time;
    uniform float uSpeed;
    uniform float uNoiseDensity;
    uniform float uNoiseStrength;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        
        i = mod289(i);
        vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
        float t = time * uSpeed;
        
        float noise1 = snoise((position + t) * uNoiseDensity);
        float noise2 = snoise((position + t * 1.5) * uNoiseDensity * 2.0) * 0.5;
        float noise3 = snoise((position + t * 0.7) * uNoiseDensity * 0.5) * 0.3;
        
        float distortion = (noise1 + noise2 + noise3) * uNoiseStrength;
        
        float tentacleNoise = snoise((position + vec3(sin(t), cos(t), sin(t * 0.5))) * 3.0);
        float tentacles = smoothstep(0.3, 0.8, tentacleNoise) * 0.4;
        
        vec3 pos = position + (normal * (distortion + tentacles));
        
        float pulse = sin(t * 2.0) * 0.08 + 1.0;
        pos *= pulse;
        
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        vDistort = distortion + tentacles;
        vPosition = pos;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const alienFragmentShader = `
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vDistort;
    varying vec3 vPosition;

    uniform float time;
    uniform float uIntensity;

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
        mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
        mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y
        );
    }

    void main() {
        float distort = vDistort * uIntensity;
        
        float redIntensity1 = 0.15 + distort * 0.3;
        float redIntensity2 = 0.25 + sin(distort * 3.0 + time * 0.1) * 0.15;
        
        vec3 darkRed = vec3(0.15, 0.0, 0.0);
        vec3 mediumRed = vec3(0.4, 0.0, 0.0);
        vec3 brightRed = vec3(0.7, 0.05, 0.0);
        
        float surfaceNoise = noise2D(vUv * 20.0 + time * 0.3);
        
        vec3 color1 = mix(darkRed, mediumRed, redIntensity1);
        vec3 color2 = mix(mediumRed, brightRed, redIntensity2);
        
        vec3 finalColor = mix(color1, color2, surfaceNoise);
        
        float glow = pow(abs(vDistort), 2.0) * 0.6;
        vec3 glowColor = vec3(0.5, 0.0, 0.0) * glow;
        finalColor += glowColor;
        
        float pulse = sin(time * 4.0) * 0.1 + 0.5;
        finalColor *= pulse;
        
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float rim = 1.0 - max(dot(viewDirection, vNormal), 0.0);
        rim = smoothstep(0.6, 1.0, rim);
        finalColor += vec3(0.35, 0.0, 0.0) * rim * 0.3;
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;