// player.js - Logika gracza z dokładną fizyką z MC 1.8.8
import { CONFIG, BLOCKS } from './config.js';
import { SoundManager } from './soundManager.js';

export class Player {
    constructor(world, camera, canvas) {
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;
        this.baseFOV = 70; // Domyślny FOV
        
        // Block outline
        this.selectedBlockOutline = null;
        this.selectedBlockPos = null;

        this.position = new THREE.Vector3(0, CONFIG.CHUNK_HEIGHT / 2 + 10, 0);
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.flying = true;
        this.selectedBlock = BLOCKS.GRASS;
        
        // Fizyka - dokładnie z Minecraft 1.8.8
        this.walkSpeed = 4.317; // bloki/s
        this.sprintSpeed = 5.612; // bloki/s
        this.flySpeed = 10.89; // bloki/s
        
        this.jumpHeight = 1.10; // Wysokość skoku (bloki)
        this.jumpForce = 8.4; // Jump velocity (bloki/s)
        
        this.gravity = 32; // Grawitacja (bloki/s²)
        this.drag = 0.98; // Opór powietrza
        
        this.cameraHeight = 1.62; // Wysokość oczu od stóp
        this.playerHeight = 1.8; // Całkowita wysokość gracza
        this.playerRadius = 0.3; // Promień hitboxa (0.6 szerokości / 2)
        
        this.keys = {};
        this.mouseDown = { left: false, right: false };
        this.pointerLocked = false;
        this.blockCooldown = 0;
        
        // Sprint (double W)
        this.lastWKeyTime = 0;
        this.doubleTapDelay = 0.3; // Sekund na double tap
        this.isSprinting = false;
        
        // Sound Manager - MUSI być inicjalizowany z this.world
        console.log('Creating SoundManager with world:', this.world);
        this.soundManager = new SoundManager(this.world);
        
        this.isMoving = false;
        this.onGround = false;
        
        // View bobbing
        this.bobTime = 0;
        this.bobAmount = 0.03; // Wysokość bobbingu (bloki) - jak w MC
        this.bobSpeed = 6; // Prędkość bobbingu (Hz)
        
        // Held block
        this.heldBlockMesh = null;

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
        const key = e.key.toLowerCase();
        
        // Double W detection - sprint (tylko na ziemi, nie w locie)
        if (key === 'w' && !this.flying && this.onGround && !this.keys['w']) {
            const now = performance.now() / 1000;
            
            // Jeśli ostatni W był niedawno (w doubleTapDelay)
            if (now - this.lastWKeyTime < this.doubleTapDelay) {
                // To drugi click - aktywuj sprint
                this.isSprinting = true;
                console.log('SPRINT AKTYWOWANY!');
            }
            
            this.lastWKeyTime = now;
        }
        
        this.keys[key] = true;

        if (e.key >= '1' && e.key <= '9') {
            this.selectedBlock = parseInt(e.key);
            document.getElementById('block').textContent = 
                ['', 'GRASS', 'DIRT', 'STONE', 'WOOD', 'LEAVES', '', '', ''][this.selectedBlock] || 'EMPTY';
        }

        if (key === 'f') {
            this.flying = !this.flying;
            if (!this.flying) this.velocity.y = 0;
            document.getElementById('flying').textContent = this.flying ? 'YES' : 'NO';
        }

        if (e.key === 'Escape') {
            document.exitPointerLock();
        }
    }

    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        
        // Zatrzymaj sprint gdy puszczisz W lub trzymasz S
        if (key === 'w' || key === 's') {
            this.isSprinting = false;
        }
        
        this.keys[key] = false;
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
        ).normalize();
        const right = new THREE.Vector3(
            -Math.cos(this.rotation.y),
            0,
            Math.sin(this.rotation.y)
        ).normalize();

        // Wybór prędkości
        let currentSpeed = this.walkSpeed;
        if (this.flying) {
            currentSpeed = this.flySpeed;
        } else if (this.isSprinting && this.keys['w']) {
            currentSpeed = this.sprintSpeed;
        }
        
        const inputVel = new THREE.Vector3();
        if (this.keys['w']) inputVel.add(forward);
        if (this.keys['s']) inputVel.sub(forward);
        if (this.keys['a']) inputVel.add(right);
        if (this.keys['d']) inputVel.sub(right);

        this.isMoving = inputVel.length() > 0;

        if (this.isMoving) {
            inputVel.normalize().multiplyScalar(currentSpeed);
            // Smooth interpolacja prędkości zamiast natychmiastowej zmiany
            const smoothFactor = Math.min(delta * 15, 1); // Szybkość interpolacji
            this.velocity.x += (inputVel.x - this.velocity.x) * smoothFactor;
            this.velocity.z += (inputVel.z - this.velocity.z) * smoothFactor;
        } else {
            this.velocity.x *= 0.8;
            this.velocity.z *= 0.8;
        }

        if (this.flying) {
            if (this.keys[' ']) this.velocity.y = currentSpeed;
            else if (this.keys['shift']) this.velocity.y = -currentSpeed;
            else this.velocity.y *= 0.8;
        } else {
            // Grawitacja
            this.velocity.y -= this.gravity * delta;
            
            const groundCheck = this.position.clone();
            groundCheck.y -= 0.1;
            this.onGround = this.checkCollision(groundCheck);
            
            // Jump
            if (this.onGround && this.keys[' ']) {
                this.velocity.y = this.jumpForce;
            }
        }

        const newPos = this.position.clone().add(this.velocity.clone().multiplyScalar(delta));
        
        // Sprawdź czy nowa pozycja będzie kolidować z sufitem (kamera)
        const newCameraPos = newPos.clone();
        newCameraPos.y += this.cameraHeight;
        
        if (!this.checkCollision(newPos) && !this.checkCameraCollision(newCameraPos)) {
            this.position.copy(newPos);
        } else {
            const posX = this.position.clone();
            posX.x += this.velocity.x * delta;
            const posXCam = posX.clone();
            posXCam.y += this.cameraHeight;
            if (this.checkCollision(posX) || this.checkCameraCollision(posXCam)) {
                this.velocity.x = 0;
            } else {
                this.position.x = posX.x;
            }
            
            const posZ = this.position.clone();
            posZ.z += this.velocity.z * delta;
            const posZCam = posZ.clone();
            posZCam.y += this.cameraHeight;
            if (this.checkCollision(posZ) || this.checkCameraCollision(posZCam)) {
                this.velocity.z = 0;
            } else {
                this.position.z = posZ.z;
            }
            
            const posY = this.position.clone();
            posY.y += this.velocity.y * delta;
            const posYCam = posY.clone();
            posYCam.y += this.cameraHeight;
            if (this.checkCollision(posY) || this.checkCameraCollision(posYCam)) {
                this.velocity.y = 0;
            } else {
                this.position.y = posY.y;
            }
        }

        // Dźwięki kroków - zależy od rzeczywistej zmiany pozycji i prędkości
        if (this.onGround && !this.flying) {
            this.soundManager.playStepSound(this.position, this.velocity);
        }

        // Aktualizuj outline bloku
        this.updateBlockOutline();

        this.camera.position.copy(this.position);
        this.camera.position.y += this.cameraHeight;
        
        // View bobbing - ruch kamery w górę/dół podczas chodzenia
        if (this.isMoving && !this.flying && this.onGround) {
            this.bobTime += delta * this.bobSpeed;
            const bobOffset = Math.sin(this.bobTime * Math.PI) * this.bobAmount;
            this.camera.position.y += bobOffset;
        } else {
            this.bobTime = 0;
        }
        
        // Aktualizuj held block
        this.updateHeldBlock(delta);
        
        this.camera.rotation.copy(this.rotation);
        
        // Zmień FOV podczas sprintu (+20 jak w MC) - płynnie
        const targetFOV = (this.isSprinting && this.keys['w'] && !this.flying) ? 
            this.baseFOV + 20 : this.baseFOV;
        
        // Interpolacja FOV
        this.camera.fov += (targetFOV - this.camera.fov) * Math.min(delta * 8, 1);
        this.camera.updateProjectionMatrix();
    }

    checkCollision(pos) {
        // Hitbox gracza: 0.6 x 1.8 bloku
        // Radius: 0.3 od środka
        const radius = this.playerRadius;
        const height = this.playerHeight;
        
        // Punkty sprawdzenia kolizji - całej wysokości gracza
        const checkPoints = [
            // Dolna część (nogi)
            [0, 0, 0],
            [radius, 0, 0],
            [-radius, 0, 0],
            [0, 0, radius],
            [0, 0, -radius],
            [radius, 0, radius],
            [radius, 0, -radius],
            [-radius, 0, radius],
            [-radius, 0, -radius],
            
            // Środek
            [0, height * 0.33, 0],
            [radius * 0.9, height * 0.33, 0],
            [-radius * 0.9, height * 0.33, 0],
            [0, height * 0.33, radius * 0.9],
            [0, height * 0.33, -radius * 0.9],
            
            // Wyżej (klatka piersiowa)
            [0, height * 0.66, 0],
            [radius * 0.9, height * 0.66, 0],
            [-radius * 0.9, height * 0.66, 0],
            [0, height * 0.66, radius * 0.9],
            [0, height * 0.66, -radius * 0.9],
            
            // Górna część (głowa) - SUFITOWANIE
            [0, height - 0.2, 0],
            [radius * 0.8, height - 0.2, 0],
            [-radius * 0.8, height - 0.2, 0],
            [0, height - 0.2, radius * 0.8],
            [0, height - 0.2, -radius * 0.8],
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

    checkCameraCollision(cameraPos) {
        // Sprawdź kolizję na poziomie kamery - mniejsza głowa dla mini skoków
        const radius = this.playerRadius * 0.3;
        
        const checkPoints = [
            [0, 0, 0],
            [radius, 0, 0],
            [-radius, 0, 0],
            [0, 0, radius],
            [0, 0, -radius],
            // Wyżej (sufity!)
            [0, 0.2, 0],
        ];
        
        for (const [dx, dy, dz] of checkPoints) {
            const x = Math.floor(cameraPos.x + dx);
            const y = Math.floor(cameraPos.y + dy);
            const z = Math.floor(cameraPos.z + dz);
            
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

    updateBlockOutline() {
        const hit = this.raycast();
        
        if (hit.hit) {
            const { x, y, z } = hit.block;
            
            // Jeśli to nowy blok, utwórz outline
            if (!this.selectedBlockPos || this.selectedBlockPos.x !== x || 
                this.selectedBlockPos.y !== y || this.selectedBlockPos.z !== z) {
                
                // Usuń stary outline
                if (this.selectedBlockOutline) {
                    this.world.scene.remove(this.selectedBlockOutline);
                    this.selectedBlockOutline.geometry.dispose();
                    this.selectedBlockOutline.material.dispose();
                }
                
                // Utwórz nowy outline
                const geometry = new THREE.BoxGeometry(1.002, 1.002, 1.002);
                const material = new THREE.LineBasicMaterial({ 
                    color: 0x000000,
                    linewidth: 2
                });
                const edges = new THREE.EdgesGeometry(geometry);
                this.selectedBlockOutline = new THREE.LineSegments(edges, material);
                this.selectedBlockOutline.position.set(x + 0.5, y + 0.5, z + 0.5);
                this.world.scene.add(this.selectedBlockOutline);
                
                this.selectedBlockPos = { x, y, z };
            }
        } else {
            // Brak trafu - usuń outline
            if (this.selectedBlockOutline) {
                this.world.scene.remove(this.selectedBlockOutline);
                this.selectedBlockOutline.geometry.dispose();
                this.selectedBlockOutline.material.dispose();
                this.selectedBlockOutline = null;
                this.selectedBlockPos = null;
            }
        }
    }

    updateHeldBlock(delta) {
        // Utwórz held block jeśli nie istnieje
        if (!this.heldBlockMesh) {
            const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
            
            // Ustaw teksturę dla wybranego bloku
            const textureMap = {
                1: 'grass_top_biome_plains',
                2: 'dirt',
                3: 'stone',
                4: 'log_oak_top',
                5: 'leaves_oak_biome_plains'
            };
            
            const textureName = textureMap[this.selectedBlock] || 'dirt';
            let texture = null;
            
            if (this.world && this.world.textureManager && this.world.textureManager.textures) {
                texture = this.world.textureManager.textures[textureName];
            }
            
            const material = new THREE.MeshLambertMaterial({ 
                map: texture || null,
                color: 0xffffff
            });
            
            this.heldBlockMesh = new THREE.Mesh(geometry, material);
            this.camera.add(this.heldBlockMesh);
            console.log('Held block created:', this.heldBlockMesh);
        }
        
        // Pozycjonuj blok w prawym dolnym rogu kamery
        this.heldBlockMesh.position.set(0.3, -0.3, -0.5);
        
        // Obróć blok
        this.heldBlockMesh.rotation.x += delta * 0.5;
        this.heldBlockMesh.rotation.y += delta * 0.3;
        
        // Bobbing bloku - taka sama animacja jak kamera
        if (this.isMoving && !this.flying && this.onGround) {
            const bobOffset = Math.sin(this.bobTime * Math.PI) * this.bobAmount * 0.5;
            this.heldBlockMesh.position.y = -0.3 + bobOffset;
        }
    }

    requestPointerLock() {
        this.canvas.requestPointerLock();
    }
}