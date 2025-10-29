// player.js - Logika gracza, wejście i raycast
import { CONFIG, BLOCKS } from './config.js';

export class Player {
    constructor(world, camera, canvas) {
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;

        this.position = new THREE.Vector3(0, CONFIG.CHUNK_HEIGHT / 2 + 10, 0);
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.flying = true;
        this.selectedBlock = BLOCKS.GRASS;
        this.speed = 8;
        this.flySpeed = 15;
        this.jumpForce = 0.15;
        this.gravity = -0.5;
        this.cameraHeight = 1.6;

        this.keys = {};
        this.mouseDown = { left: false, right: false };
        this.pointerLocked = false;
        this.blockCooldown = 0;

        this.setupInputListeners();
    }

    setupInputListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('pointerlockchange', () => this.handlePointerLock());
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    }

    handleKeyDown(e) {
        this.keys[e.key.toLowerCase()] = true;

        if (e.key >= '1' && e.key <= '9') {
            this.selectedBlock = parseInt(e.key);
            document.getElementById('block').textContent = 
                ['', 'GRASS', 'DIRT', 'STONE', 'WOOD', 'LEAVES', '', '', ''][this.selectedBlock] || 'EMPTY';
        }

        if (e.key.toLowerCase() === 'f') {
            this.flying = !this.flying;
            if (!this.flying) this.velocity.y = 0;
            document.getElementById('flying').textContent = this.flying ? 'YES' : 'NO';
        }

        if (e.key === 'Escape') {
            document.exitPointerLock();
        }
    }

    handleKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.pointerLocked = false;
        }
    }

    handleMouseMove(e) {
        if (!this.pointerLocked) return;
        
        this.rotation.y -= e.movementX * 0.002;
        this.rotation.x -= e.movementY * 0.002;
        this.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.rotation.x));
    }

    handleMouseDown(e) {
        if (!this.pointerLocked) {
            console.log('Requesting pointer lock...');
            this.requestPointerLock();
            return;
        }
        if (e.button === 0) this.mouseDown.left = true;
        if (e.button === 2) this.mouseDown.right = true;
    }

    handleMouseUp(e) {
        if (e.button === 0) this.mouseDown.left = false;
        if (e.button === 2) this.mouseDown.right = false;
    }

    handlePointerLock() {
        this.pointerLocked = document.pointerLockElement === this.canvas;
    }

    raycast() {
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyEuler(this.rotation);

        const step = 0.05;
        const maxDist = 8;
        const pos = this.camera.position.clone();

        for (let i = 0; i < maxDist / step; i++) {
            pos.add(direction.clone().multiplyScalar(step));
            
            const x = Math.floor(pos.x);
            const y = Math.floor(pos.y);
            const z = Math.floor(pos.z);

            const block = this.world.getBlock(x, y, z);

            if (block !== BLOCKS.AIR) {
                const prevPos = pos.clone().sub(direction.clone().multiplyScalar(step * 2));
                return {
                    hit: true,
                    block: { x, y, z },
                    prev: {
                        x: Math.floor(prevPos.x),
                        y: Math.floor(prevPos.y),
                        z: Math.floor(prevPos.z)
                    }
                };
            }
        }

        return { hit: false };
    }

    update(delta) {
        this.blockCooldown = Math.max(0, this.blockCooldown - delta);

        const forward = new THREE.Vector3(
            -Math.sin(this.rotation.y),
            0,
            -Math.cos(this.rotation.y)
        );
        const right = new THREE.Vector3(
            -Math.cos(this.rotation.y),
            0,
            Math.sin(this.rotation.y)
        );

        const currentSpeed = this.flying ? this.flySpeed : this.speed;
        const moveSpeed = currentSpeed * delta;
        
        const inputVel = new THREE.Vector3();
        if (this.keys['w']) inputVel.add(forward);
        if (this.keys['s']) inputVel.sub(forward);
        if (this.keys['a']) inputVel.add(right);
        if (this.keys['d']) inputVel.sub(right);

        if (inputVel.length() > 0) {
            inputVel.normalize().multiplyScalar(moveSpeed);
            this.velocity.x = inputVel.x;
            this.velocity.z = inputVel.z;
        } else {
            this.velocity.x *= 0.8;
            this.velocity.z *= 0.8;
        }

        if (this.flying) {
            if (this.keys[' ']) this.velocity.y = currentSpeed * delta * 2;
            else if (this.keys['shift']) this.velocity.y = -currentSpeed * delta * 2;
            else this.velocity.y *= 0.8;
        } else {
            this.velocity.y += this.gravity * delta;
            
            const groundCheck = this.position.clone();
            groundCheck.y -= 0.1;
            const onGround = this.checkCollision(groundCheck);
            
            if (onGround && this.keys[' ']) {
                this.velocity.y = this.jumpForce;
            }
        }

        const newPos = this.position.clone().add(this.velocity);
        
        if (!this.checkCollision(newPos)) {
            this.position.copy(newPos);
        } else {
            const posX = this.position.clone();
            posX.x += this.velocity.x;
            if (this.checkCollision(posX)) {
                this.velocity.x = 0;
            } else {
                this.position.x = posX.x;
            }
            
            const posZ = this.position.clone();
            posZ.z += this.velocity.z;
            if (this.checkCollision(posZ)) {
                this.velocity.z = 0;
            } else {
                this.position.z = posZ.z;
            }
            
            const posY = this.position.clone();
            posY.y += this.velocity.y;
            if (this.checkCollision(posY)) {
                this.velocity.y = 0;
            } else {
                this.position.y = posY.y;
            }
        }

        this.camera.position.copy(this.position);
        this.camera.position.y += this.cameraHeight;
        this.camera.rotation.copy(this.rotation);
    }

    checkCollision(pos) {
        const radius = 0.4;
        const height = 1.8;
        
        const checkPoints = [
            [0, 0, 0],
            [radius, 0, 0],
            [-radius, 0, 0],
            [0, 0, radius],
            [0, 0, -radius],
            [radius, 0, radius],
            [radius, 0, -radius],
            [-radius, 0, radius],
            [-radius, 0, -radius],
            [0, height * 0.5, 0],
        ];
        
        for (const [dx, dy, dz] of checkPoints) {
            const x = Math.floor(pos.x + dx);
            const y = Math.floor(pos.y + dy);
            const z = Math.floor(pos.z + dz);
            
            const block = this.world.getBlock(x, y, z);
            if (block !== BLOCKS.AIR) {
                return true;
            }
        }
        
        return false;
    }

    handleBlockInteraction() {
        if ((this.mouseDown.left || this.mouseDown.right) && this.blockCooldown === 0) {
            const hit = this.raycast();
            if (hit.hit) {
                if (this.mouseDown.left) {
                    console.log('Breaking block at:', hit.block.x, hit.block.y, hit.block.z);
                    this.world.setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
                    this.blockCooldown = 0.2;
                } else if (this.mouseDown.right) {
                    const px = Math.floor(this.position.x);
                    const py = Math.floor(this.position.y);
                    const pz = Math.floor(this.position.z);
                    
                    if (hit.prev.x !== px || hit.prev.y !== py || hit.prev.y !== py - 1 || hit.prev.z !== pz) {
                        console.log('Placing block at:', hit.prev.x, hit.prev.y, hit.prev.z);
                        this.world.setBlock(hit.prev.x, hit.prev.y, hit.prev.z, this.selectedBlock);
                        this.blockCooldown = 0.2;
                    }
                }
            }
        }
    }

    requestPointerLock() {
        this.canvas.requestPointerLock();
    }
}