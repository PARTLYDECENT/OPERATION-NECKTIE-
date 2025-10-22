const gooVertexShader = `
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uDisturbed;
    uniform float uFeeding;
    uniform float uIntensity;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vDisplacement;
    varying vec3 vWorldPos;
    varying float vElevation;
    
    vec3 hash3(vec3 p) {
        p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                dot(p, vec3(269.5, 183.3, 246.1)),
                dot(p, vec3(113.5, 271.9, 124.6)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }
    
    float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        
        return mix(mix(mix(dot(hash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
                        dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
                    mix(dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
                        dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
                mix(mix(dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
                        dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
                    mix(dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
                        dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
    }
    
    vec3 warp(vec3 p, float t) {
        return p + vec3(
        noise(p * 2.0 + t),
        noise(p * 2.0 + t + 100.0),
        noise(p * 2.0 + t + 200.0)
        ) * 0.5;
    }
    
    float fbm(vec3 p, int octaves) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for(int i = 0; i < 8; i++) {
            if(i >= octaves) break;
            vec3 warpedP = warp(p * frequency, uTime * 0.2);
            value += amplitude * noise(warpedP);
            frequency *= 2.13;
            amplitude *= 0.47;
        }
        return value;
    }
    
    float ridgedNoise(vec3 p) {
        float n = abs(noise(p));
        n = 1.0 - n;
        n = n * n;
        return n;
    }
    
    float turbulence(vec3 p, float t) {
        float sum = 0.0;
        float freq = 1.0;
        float amp = 1.0;
        
        for(int i = 0; i < 6; i++) {
        sum += abs(noise(p * freq + t)) * amp;
        freq *= 2.0;
        amp *= 0.5;
        }
        return sum;
    }
    
    void main() {
        vec3 pos = position;
        vec3 norm = normal;
        
        float pulse1 = sin(uTime * 1.2) * 0.5 + 0.5;
        float pulse2 = sin(uTime * 2.3 + 1.5) * 0.5 + 0.5;
        float pulse3 = sin(uTime * 0.7 + 3.0) * 0.5 + 0.5;
        float complexPulse = (pulse1 + pulse2 * 0.5 + pulse3 * 0.3) / 1.8;
        
        float n1 = fbm(pos * 1.5 + uTime * 0.15, 8);
        float n2 = ridgedNoise(pos * 4.0 + uTime * 0.3);
        float n3 = turbulence(pos * 6.0, uTime * 0.4);
        float n4 = fbm(pos * 0.8 - uTime * 0.1, 6);
        
        float displacement = n1 * 0.35 + n2 * 0.25 + n3 * 0.15 + n4 * 0.2;
        displacement *= (0.8 + complexPulse * 0.4);
        
        float ridges = ridgedNoise(pos * 12.0 + uTime * 0.2);
        ridges = pow(ridges, 2.0) * 0.15;
        
        float dripNoise = fbm(vec3(pos.xy * 3.0, pos.z * 0.5 + uTime * 0.8), 6);
        float dripEffect = smoothstep(0.3, 0.7, dripNoise) * max(0.0, -pos.y * 0.3);
        pos.y -= dripEffect * 0.4;
        
        vec3 worldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        vec3 mousePos3D = vec3(uMouse * 4.0, 0.0);
        float distToMouse = length(worldPos.xy - mousePos3D.xy);
        float attraction = smoothstep(4.0, 0.0, distToMouse);
        
        vec3 attractDir = normalize(mousePos3D - worldPos);
        float attractNoise = fbm(pos * 5.0 + uTime, 4);
        pos += attractDir * attraction * (1.5 + attractNoise * 0.5) * (1.0 + complexPulse * 0.5);
        
        float spikeMask = fbm(pos * 8.0 + uTime * 0.5, 6);
        if(spikeMask > 0.65) {
            float spikeHeight = pow((spikeMask - 0.65) / 0.35, 2.0) * 1.2;
            vec3 spikeDir = norm + attractDir * attraction * 0.5;
            spikeDir = normalize(spikeDir);
            
            float spikeWave = sin(uTime * 3.0 + spikeMask * 20.0) * 0.5 + 0.5;
            pos += spikeDir * spikeHeight * spikeWave;
        }
        
        if(uDisturbed > 0.0) {
            float chaos = turbulence(pos * 15.0, uTime * 8.0);
            displacement += chaos * uDisturbed * 0.7;
            
            float explosiveNoise = fbm(pos * 20.0 + uTime * 10.0, 8);
            pos += norm * explosiveNoise * uDisturbed * 0.3;
            
            if(explosiveNoise > 0.7) {
                pos += norm * (explosiveNoise - 0.7) * uDisturbed * 2.0;
            }
        }
        
        if(uFeeding > 0.0) {
            float feedingNoise = fbm(pos * 8.0 + uTime * 3.0, 8);
            
            pos += attractDir * attraction * uFeeding * 1.5;
            
            vec3 writhe = vec3(
                sin(uTime * 4.0 + feedingNoise * 10.0),
                cos(uTime * 3.5 + feedingNoise * 8.0),
                sin(uTime * 5.0 + feedingNoise * 12.0)
            ) * 0.2 * uFeeding;
            pos += writhe;
            
            if(feedingNoise > 0.55) {
                float tentacleStrength = pow((feedingNoise - 0.55) / 0.45, 1.5);
                pos += norm * tentacleStrength * sin(uTime * 4.0) * 0.8 * uFeeding;
            }
        }
        
        pos += norm * (displacement + ridges);
        
        float stretch = smoothstep(-1.5, 0.0, pos.y) * 0.3;
        pos.y -= stretch * (1.0 - complexPulse * 0.5);
        
        vPosition = pos;
        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        vNormal = normalize(normalMatrix * norm);
        vDisplacement = displacement;
        vElevation = pos.y;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const gooFragmentShader = `
    uniform float uTime;
    uniform float uDisturbed;
    uniform float uFeeding;
    uniform float uIntensity;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPos;
    varying float vDisplacement;
    varying float vElevation;
    
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    
    float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                    mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                    mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    
    float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for(int i = 0; i < 6; i++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }
    
    void main() {
        vec3 baseColor = vec3(0.01, 0.01, 0.015);
        
        float oilSlick = noise(vPosition * 30.0 + uTime * 0.1);
        vec3 oilColor = vec3(0.02, 0.015, 0.03) + vec3(0.03, 0.01, 0.02) * oilSlick;
        
        float surfaceDetail = fbm(vPosition * 25.0 + uTime * 0.3);
        baseColor += vec3(surfaceDetail * 0.04);
        
        float veins1 = noise(vPosition * 18.0 + uTime * 0.15);
        float veins2 = noise(vPosition * 22.0 - uTime * 0.12);
        veins1 = smoothstep(0.45, 0.55, veins1);
        veins2 = smoothstep(0.48, 0.52, veins2);
        float veinPattern = max(veins1, veins2);
        
        vec3 veinColor = vec3(0.15, 0.02, 0.05) * veinPattern * 0.6;
        
        float internalGlow = fbm(vPosition * 12.0 + uTime * 0.5);
        internalGlow = pow(internalGlow, 3.0);
        vec3 glowColor = vec3(0.05, 0.01, 0.02) * internalGlow * 0.4;
        
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 4.0);
        
        vec3 fresnelColor = vec3(0.4, 0.35, 0.45) * fresnel * 1.5;
        
        float rimIntensity = pow(fresnel, 2.0);
        vec3 rimOil = vec3(
            sin(fresnel * 10.0 + uTime) * 0.5 + 0.5,
            sin(fresnel * 10.0 + uTime + 2.0) * 0.5 + 0.5,
            sin(fresnel * 10.0 + uTime + 4.0) * 0.5 + 0.5
        ) * 0.1 * rimIntensity;
        
        float sss = pow(max(dot(vNormal, normalize(vec3(1, 2, 1))), 0.0), 3.0);
        vec3 sssColor = vec3(0.2, 0.05, 0.08) * sss * 0.8;
        
        vec3 lightDir = normalize(vec3(2, 3, 4));
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(vNormal, halfDir), 0.0), 128.0);
        vec3 specColor = vec3(0.8, 0.8, 0.9) * spec * 1.2;
        
        float displacementShade = smoothstep(-0.5, 0.5, vDisplacement);
        baseColor *= 0.7 + displacementShade * 0.3;
        
        float elevationShade = smoothstep(-2.0, 0.5, vElevation);
        baseColor *= 0.6 + elevationShade * 0.4;
        
        if(uDisturbed > 0.0) {
            vec3 disturbColor = vec3(1.0, 0.0, 0.1) * uDisturbed;
            baseColor = mix(baseColor, disturbColor * 0.3, uDisturbed * 0.7);
            fresnelColor += disturbColor * 3.0;
            glowColor += disturbColor * 0.5;
            
            float disturbPulse = sin(uTime * 15.0) * 0.5 + 0.5;
            veinColor += vec3(0.8, 0.0, 0.0) * disturbPulse * uDisturbed;
        }
        
        if(uFeeding > 0.0) {
            vec3 feedColor = vec3(0.15, 0.4, 0.1);
            vec3 acidColor = vec3(0.3, 0.9, 0.2);
            
            baseColor = mix(baseColor, feedColor * 0.2, uFeeding * 0.5);
            
            float feedPulse = sin(uTime * 6.0) * 0.5 + 0.5;
            glowColor += acidColor * feedPulse * uFeeding * 0.8;
            veinColor += acidColor * 0.3 * uFeeding;
            
            float droolGlow = smoothstep(0.0, -1.5, vElevation) * uFeeding;
            glowColor += acidColor * droolGlow * 1.5;
        }
        
        vec3 finalColor = baseColor + oilColor + veinColor + glowColor;
        finalColor += fresnelColor + rimOil + sssColor + specColor;
        
        float depth = length(vWorldPos - cameraPosition);
        float fogFactor = 1.0 - exp(-depth * 0.08);
        finalColor = mix(finalColor, vec3(0.0), fogFactor * 0.3);
        
        float ao = smoothstep(-0.3, 0.3, vDisplacement);
        finalColor *= 0.6 + ao * 0.4;
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;