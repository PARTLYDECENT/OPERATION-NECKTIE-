const proceduralEntityVertexShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    
    void main() {
        vPosition = position;
        vNormal = normal;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const proceduralEntityFragmentShader = `
    precision mediump float;

    uniform float u_time;

    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
        float t = u_time * 0.5;

        // Use the normalized local position on the sphere as the primary coordinate system
        vec3 p = normalize(vPosition);
        
        // --- Map 3D position to spherical coordinates (like latitude/longitude) ---
        // d_lat becomes our "distance from pole", ranging from 0.0 to 1.0
        float d_lat = acos(p.y) / 3.14159; 
        // angle_lon is the angle around the Y axis
        float angle_lon = atan(p.z, p.x);

        vec3 col = vec3(0.0);

        // --- PART 1: The Core (Adapted to 3D) ---
        // The tanh function now drives a pattern that flows over the sphere's surface
        float core_driver = tanh(log(d_lat + 0.1) * 4.0 + sin(angle_lon * 12.0 + t * 3.0));
        core_driver = (core_driver + 1.0) * 0.5; // Remap from [-1,1] to [0,1]
        
        // The core shape is now defined by pulsing bands based on longitude
        float core_shape = cos(angle_lon * 5.0 + t) * 0.2 + 0.8;
        vec3 core_col = vec3(1.0, 0.1, 0.1) * core_driver * core_shape;
        col += core_col;


        // --- PART 2: The Energy Shell (Fresnel Glow) ---
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = 1.0 - dot(vNormal, viewDirection);
        fresnel = pow(fresnel, 2.0); // Sharpen the effect
        
        // The fractal rings are now latitudinal bands
        float ring_pattern = pow(fract(d_lat * 25.0 - t * 2.0), 10.0);

        vec3 shell_col = (vec3(0.1, 0.5, 1.0) * ring_pattern + vec3(0.5, 0.8, 1.0)) * fresnel;
        col += shell_col;


        // --- PART 3: Warped "Tangent" Tendrils ---
        // We use the 3D position vector 'p' directly for a chaotic 3D grid
        float tendril_pattern = tan(p.x * 8.0) * tan(p.y * 8.0) * tan(p.z * 4.0 + t);
        tendril_pattern = 1.0 - smoothstep(0.0, 0.5, abs(tendril_pattern));
        tendril_pattern = clamp(tendril_pattern, 0.0, 1.0);

        // The tendrils are most visible at the edges of the sphere (using fresnel)
        vec3 tendril_col = vec3(0.2, 1.0, 0.3) * tendril_pattern * fresnel;
        col += tendril_col;


        // Final output
        gl_FragColor = vec4(col, 1.0);
    }
`;