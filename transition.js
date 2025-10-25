// transition.js

const TransitionManager = {
    active: false,
    timer: 0,
    duration: 0,
    scene: null,
    originalMaterials: new Map(),
    textureLoader: new THREE.TextureLoader(),
    localImages: [
        'assets/images/ghost1.jpg',
        'assets/images/ghost2.jpg',
        'assets/images/ghost3.jpg',
        'assets/images/ghost4.jpg',
        'assets/images/ghost5.jpg',
        'assets/images/ghost6.jpg',
        'assets/images/ghost7.jpg',
        'assets/images/ghost8.jpg'
    ],

    startTransition(scene, duration = 5000) {
        if (this.active) return;

        console.log("Starting wild transition!");
        this.active = true;
        this.duration = duration;
        this.timer = 0;
        this.scene = scene;
        this.originalMaterials.clear();

        // Store original materials
        this.scene.traverse(child => {
            if (child.isMesh && child.material) {
                this.originalMaterials.set(child, child.material);
            }
        });

        // Start the madness
        this.intervalId = setInterval(() => this.applyWildEffects(), 250); // Apply effects every 250ms
    },

    stopTransition() {
        if (!this.active) return;

        console.log("Stopping wild transition.");
        this.active = false;
        clearInterval(this.intervalId);

        // Restore original materials
        this.originalMaterials.forEach((material, child) => {
            child.material = material;
        });
        this.originalMaterials.clear();
    },

    update(delta) {
        if (!this.active) return;

        this.timer += delta * 1000;
        if (this.timer >= this.duration) {
            this.stopTransition();
        }
    },

    applyWildEffects() {
        if (!this.active) return;

        this.scene.traverse(child => {
            // Randomly change textures of meshes
            if (child.isMesh && Math.random() < 0.1) {
                const randomImageUrl = this.localImages[Math.floor(Math.random() * this.localImages.length)];
                this.textureLoader.load(randomImageUrl, (texture) => {
                    if (child.material && child.material.map) {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        child.material.map = texture;
                        child.material.needsUpdate = true;
                    } else if (child.material && !child.material.uniforms) {
                         const newMaterial = new THREE.MeshStandardMaterial({ map: texture });
                         child.material = newMaterial;
                    }
                });
            }

            // Randomly change light colors
            if (child.isLight && Math.random() < 0.3) {
                child.color.setHex(Math.random() * 0xffffff);
            }
        });

        // Maybe randomly change the fog
        if (Math.random() < 0.2) {
            this.scene.fog.color.setHex(Math.random() * 0xffffff);
        }
    }
};
