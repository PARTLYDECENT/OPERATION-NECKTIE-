const NightVisionShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'time': { value: 0.0 },
        'noiseAmount': { value: 0.08 },
        'scanlineAmount': { value: 0.03 },
        'vignetteAmount': { value: 1.5 },
        'colorBoost': { value: 2.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        #include <common>
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float noiseAmount;
        uniform float scanlineAmount;
        uniform float vignetteAmount;
        uniform float colorBoost;
        varying vec2 vUv;

        // RENAMED THIS FUNCTION
        float myRand(vec2 co){
            return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
        }

        void main() {
            vec4 diffuse = texture2D( tDiffuse, vUv );
            float luminance = dot(diffuse.rgb, vec3(0.299, 0.587, 0.114));
            
            vec3 nightVisionColor = vec3(0.05, 0.2, 0.05); 
            nightVisionColor += vec3(0.1, 1.0, 0.2) * luminance * colorBoost;

            // Noise
            // AND RENAMED THE CALL TO IT
            float noise = (myRand(vUv + time) - 0.5) * noiseAmount;
            nightVisionColor += noise;

            // Scanlines
            float scanline = sin(vUv.y * 800.0 + time * 10.0) * scanlineAmount;
            nightVisionColor -= scanline;

            // Vignette
            float vignette = smoothstep(0.0, 1.0, distance(vUv, vec2(0.5)) * vignetteAmount);
            nightVisionColor *= (1.0 - vignette);

            gl_FragColor = vec4( nightVisionColor, 1.0 );
        }
    `
};