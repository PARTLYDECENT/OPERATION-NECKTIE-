// The BlackGooEntity class is defined in the main index.html script.

const BiomeManager = {
    biomes: [
        { name: 'BACKROOMS', fogColor: 0x9c8f6f, wallTexture: 'Wallpaper', floorTexture: 'Carpet' },
        { name: 'FLOODED', fogColor: 0x1a3d4a, wallTexture: 'Concrete', floorTexture: 'Water' },
        { name: 'CRIMSON', fogColor: 0x4d0000, wallTexture: 'Flesh', floorTexture: 'FleshFloor' },
        { name: 'RUINS', fogColor: 0x5a6e5a, wallTexture: 'Bricks', floorTexture: 'Grass' },
        { name: 'VOID', fogColor: 0x050505, wallTexture: 'Void', floorTexture: 'Void' },
    ],

    // Simple noise for large biome regions
    getBiome(x, z) {
        const noiseVal = (Math.sin(x * 0.01 + z * 0.02) * 0.5 + 0.5); // Simple sine wave noise
        const index = Math.floor(noiseVal * this.biomes.length);
        return this.biomes[index];
    },

    generateChunk(chunkX, chunkZ, biome, textures, shaders) {
        const group = new THREE.Group();
        const entities = [];
        const CHUNK_SIZE = 50;
        group.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);

        switch(biome.name) {
            case 'BACKROOMS':
                this.generateBackroomsChunk(group, CHUNK_SIZE, textures, shaders, entities);
                break;
            case 'FLOODED':
                this.generateFloodedChunk(group, CHUNK_SIZE, textures, entities);
                break;
            // Add other biome cases here
            default:
                this.generateBackroomsChunk(group, CHUNK_SIZE, textures, shaders, entities);
                break;
        }
        return { group, entities };
    },

    generateBackroomsChunk(group, size, textures, shaders, entities) {
        const wallMaterial = new THREE.ShaderMaterial(shaders[0]);
        const floorMaterial = new THREE.MeshStandardMaterial({ map: textures.floor });
        floorMaterial.map.repeat.set(10, 10);

        const floorGeo = new THREE.PlaneGeometry(size, size);
        const floor = new THREE.Mesh(floorGeo, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        group.add(floor);

        const ceiling = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x101010 }));
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 4;
        group.add(ceiling);

        const wallGeo = new THREE.BoxGeometry(1, 4, 8);
        for(let x = -size/2; x < size/2; x += 8) {
            for(let z = -size/2; z < size/2; z += 8) {
                if(Math.random() > 0.3) {
                    const wall = new THREE.Mesh(wallGeo, wallMaterial.clone());
                    wall.position.set(x + 4, 2, z);
                    wall.castShadow = true;
                    group.add(wall);
                }
                if(Math.random() > 0.3) {
                    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 1), wallMaterial.clone());
                    wall2.position.set(x, 2, z + 4);
                    wall2.castShadow = true;
                    group.add(wall2);
                }
            }
        }

        if (Math.random() > 0.95) {
            const goo = new BlackGooEntity();
            goo.mesh.position.set((Math.random() - 0.5) * size, 1, (Math.random() - 0.5) * size);
            group.add(goo.mesh);
            entities.push(goo);
        }
    },

    generateFloodedChunk(group, size, textures, entities) {
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const floorGeo = new THREE.PlaneGeometry(size, size);

        const waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a526b,
            transparent: true,
            opacity: 0.8,
            metalness: 0.8,
            roughness: 0.2
        });
        const water = new THREE.Mesh(floorGeo, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.2;
        group.add(water);

        const ceiling = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x101010 }));
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 10; // Higher ceilings for tunnels
        group.add(ceiling);

        // Generate some random pillars
        const pillarGeo = new THREE.CylinderGeometry(1, 1, 10, 16);
        for (let i = 0; i < 10; i++) {
            const pillar = new THREE.Mesh(pillarGeo, wallMaterial);
            pillar.position.set((Math.random() - 0.5) * size, 5, (Math.random() - 0.5) * size);
            pillar.castShadow = true;
            group.add(pillar);
        }
    }
};