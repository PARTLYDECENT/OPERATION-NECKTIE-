// ugv.js

const UGV_STATE = {
    PATROLLING: 'patrolling',
    ATTACKING: 'attacking',
    IDLE: 'idle'
};

/**
 * Represents a UGV (Unmanned Ground Vehicle) enemy.
 * This entity moves towards the player and fires projectiles.
 */
class UGVEntity {
    /**
     * @param {THREE.Scene} scene The main scene to add the UGV to.
     * @param {THREE.GLTFLoader} gltfLoader A loader instance to load the model.
     * @param {THREE.Vector3} position The initial position to spawn the UGV.
     * @param {object} gameState A reference to the main game state for projectiles.
     * @param {function} safeAdd A helper function to safely add objects to the scene.
     * @param {function} createProjectileFn A function to create projectiles.
     * @param {THREE.Vector3} playerVelocity A reference to the player's velocity vector.
     */
    constructor(scene, gltfLoader, position, gameState, safeAdd, createProjectileFn, playerVelocity) {
        this.scene = scene;
        this.gameState = gameState;
        this.safeAdd = safeAdd;
        this.mesh = null;
        this.createProjectile = createProjectileFn; // Store the function
        this.speed = 0.02; // Slightly slower patrol speed
        this.attackSpeed = 0.035; // Faster when attacking
        this.playerVelocity = playerVelocity; // Store reference to player's velocity
        this.health = 60;
        this.lastShotTime = 0;
        this.shootInterval = 2500; // Time between shots in ms
        this.shootInterval = 4000; // Time between shots in ms (was 2500)
        this.optimalDistance = 15; // Tries to stay this far away

        // --- AI State ---
        this.state = UGV_STATE.PATROLLING;
        this.detectionRange = 45;
        this.patrolPoints = [];
        this.currentPatrolPointIndex = 0;
        this.idleTimer = 0;
        this.idleDuration = 3000; // 3 seconds

        this.generatePatrolPoints(position);

        gltfLoader.load('assets/models/ugv.glb', (gltf) => {
            this.mesh = gltf.scene;
            this.mesh.position.copy(position);
            this.mesh.scale.set(0.7, 0.7, 0.7); // Adjust scale as needed

            // Add userData for consistency with other entities
            this.mesh.userData = {
                type: 'ugv', // New type
                health: this.health,
                isFriendly: false,
                entityInstance: this, // Reference back to the class instance
                hitboxRadius: 3.0, // Increased hitbox for easier targeting
            };

            this.safeAdd(this.scene, this.mesh, 'UGV');
        }, undefined, (error) => {
            console.error("Failed to load UGV model at 'assets/models/ugv.glb':", error);
        });
    }

    /**
     * Generates a few random patrol points around the UGV's spawn location.
     * @param {THREE.Vector3} origin The spawn position.
     */
    generatePatrolPoints(origin) {
        this.patrolPoints.push(origin.clone()); // Start at spawn point
        for (let i = 0; i < 3; i++) {
            const patrolRadius = 10 + Math.random() * 15;
            const angle = Math.random() * Math.PI * 2;
            const point = new THREE.Vector3(
                origin.x + Math.sin(angle) * patrolRadius,
                origin.y,
                origin.z + Math.cos(angle) * patrolRadius
            );
            this.patrolPoints.push(point);
        }
    }

    /**
     * The main update loop for the UGV's behavior.
     * @param {THREE.Vector3} playerPosition The current position of the player.
     */
    update(playerPosition) {
        if (!this.mesh || this.mesh.userData.health <= 0) return;

        const distToPlayer = this.mesh.position.distanceTo(playerPosition);

        // --- State Transitions ---
        switch (this.state) {
            case UGV_STATE.PATROLLING:
            case UGV_STATE.IDLE:
                if (distToPlayer < this.detectionRange) {
                    this.state = UGV_STATE.ATTACKING;
                }
                break;
            case UGV_STATE.ATTACKING:
                if (distToPlayer > this.detectionRange * 1.5) { // Player has escaped
                    this.state = UGV_STATE.PATROLLING;
                }
                break;
        }

        // --- State Actions ---
        switch (this.state) {
            case UGV_STATE.PATROLLING:
                this.doPatrol();
                break;
            case UGV_STATE.ATTACKING:
                this.doAttack(playerPosition, distToPlayer);
                break;
            case UGV_STATE.IDLE:
                this.doIdle();
                break;
        }
    }

    doPatrol() {
        const targetPoint = this.patrolPoints[this.currentPatrolPointIndex];
        if (this.mesh.position.distanceTo(targetPoint) < 1.0) {
            this.state = UGV_STATE.IDLE;
            this.idleTimer = performance.now();
            this.currentPatrolPointIndex = (this.currentPatrolPointIndex + 1) % this.patrolPoints.length;
            return;
        }

        const direction = new THREE.Vector3().subVectors(targetPoint, this.mesh.position).normalize();
        this.mesh.position.add(direction.multiplyScalar(this.speed));
        this.mesh.lookAt(targetPoint);
    }

    doIdle() {
        if (performance.now() - this.idleTimer > this.idleDuration) {
            this.state = UGV_STATE.PATROLLING;
        }
        // UGV just sits and "scans"
    }

    doAttack(playerPosition, distToPlayer) {
        const projectileSpeed = 0.8; // Must match the speed used when creating the projectile

        // --- Predictive Targeting ---
        // Estimate time for projectile to reach player
        const timeToTarget = distToPlayer / (projectileSpeed * 60); // approx. conversion from frame-units to seconds
        
        // Predict player's future position
        const predictedPlayerPosition = playerPosition.clone().add(this.playerVelocity.clone().multiplyScalar(timeToTarget * 10)); // a multiplier to adjust prediction

        // The direction to fire is towards the predicted position
        const fireDirection = new THREE.Vector3().subVectors(predictedPlayerPosition, this.mesh.position).normalize();

        // --- Movement & Rotation ---
        // The UGV should still move towards the player's actual position
        const moveDirection = new THREE.Vector3().subVectors(playerPosition, this.mesh.position).normalize();
        if (distToPlayer > this.optimalDistance) {
            this.mesh.position.add(moveDirection.clone().multiplyScalar(this.attackSpeed));
        }
        
        // The UGV should look where it's about to fire
        const lookAtTarget = this.mesh.position.clone().add(fireDirection);
        this.mesh.lookAt(lookAtTarget);

        // --- Shooting ---
        const now = performance.now();
        if (now - this.lastShotTime > this.shootInterval) {
            AudioEngine.playBufferedSound('ugvShot', 0.7); // Play the loaded mp3 sound at 70% volume
            const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)); // Fire from center of UGV
            
            // Create the projectile using the calculated fireDirection and correct parameters
            const projectile = this.createProjectile(origin, fireDirection, 0xffa500, 120, projectileSpeed, this.mesh, 0.1); // 10% damage

            this.gameState.projectiles.push(projectile);
            this.safeAdd(this.scene, projectile, 'UGV Projectile');
            this.lastShotTime = now;
        }
    }
}