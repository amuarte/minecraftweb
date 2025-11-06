// player.js - Logika gracza z dokładną fizyką z MC 1.8.8
import { CONFIG, BLOCKS, HOTBAR_BLOCKS, BLOCKS_REGISTRY } from './config.js';
import { SoundManager } from './soundManager.js';
import { ChatManager } from './chatManager.js';

export class Player {
    constructor(world, camera, canvas, heldBlockScene, heldBlockCamera) {
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;
        this.heldBlockScene = heldBlockScene;
        this.heldBlockCamera = heldBlockCamera;
        this.baseFOV = 70; // Domyślny FOV
        
        // Block outline
        this.selectedBlockOutline = null;
        this.selectedBlockPos = null;

        this.position = new THREE.Vector3(0, CONFIG.CHUNK_HEIGHT / 2 + 10, 0);
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.flying = true;
        this.selectedSlotIndex = 0; // Aktywny slot hotbaru (0-8)
        
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

        // Raycast cache - optymalizacja: raycast jest drogi, cache'uj wynik
        this.lastRaycastResult = null;

        // View bobbing
        this.bobTime = 0;
        this.bobAmount = 0.03; // Wysokość bobbingu (bloki) - jak w MC
        this.bobSpeed = 6; // Prędkość bobbingu (Hz)

        // Held block
        this.heldBlockMesh = null;
        this.lastSelectedBlock = null;

        // Swing animation (animacja trzepnięcia przy niszczeniu/stawianiu bloków)
        this.swingProgress = 0; // 0.0 - 1.0
        this.isSwinging = false;
        this.swingDuration = 0.3; // 6 ticków = 0.3 sekundy (szybciej niż vanilla dla lepszego feel)

        // Czekaj na załadowanie world'u aby stworzyć held block

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

        // Jeśli chat jest otwarty, nie obsługuj movement keys
        const isChatOpen = window.gameRenderer && window.gameRenderer.chatManager && window.gameRenderer.chatManager.isOpen;
        if (isChatOpen && (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === ' ')) {
            return;
        }

        // Blokuj sterowanie (spacja, shift) gdy inventory jest otwarte
        if (window.gameRenderer && window.gameRenderer.guiManager && window.gameRenderer.guiManager.editingHotbar) {
            if (key === ' ' || key === 'shift') {
                e.preventDefault();
                return;
            }
        }

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
            this.selectedSlotIndex = parseInt(e.key) - 1; // Konwertuj 1-9 na 0-8
            // Pobierz rzeczywisty blok z hotbaru i wyświetl jego nazwę
            const slot = HOTBAR_BLOCKS[this.selectedSlotIndex];
            const blockId = ChatManager.getBlockId(slot);
            const blockName = BLOCKS_REGISTRY[blockId]?.displayName || 'EMPTY';
            document.getElementById('block').textContent = blockName;
        }

        if (key === 'f') {
            this.flying = !this.flying;
            if (!this.flying) this.velocity.y = 0;
            document.getElementById('flying').textContent = this.flying ? 'YES' : 'NO';
        }

        // E - Toggle hotbar editing mode
        if (key === 'e') {
            // Blokuj E gdy chat jest otwarty
            if (window.gameRenderer && window.gameRenderer.chatManager && window.gameRenderer.chatManager.isOpen) {
                return; // E będzie obsługiwane jako zwykły znak w chacie
            }

            e.preventDefault();
            if (window.gameRenderer && window.gameRenderer.guiManager) {
                const guiManager = window.gameRenderer.guiManager;
                const currentState = guiManager.editingHotbar;

                if (!currentState) {
                    // Włącz edycję - wyłącz pointer lock aby pokazać kursor
                    document.exitPointerLock();
                    guiManager.toggleHotbarEditMode(true);
                    console.log('🔧 Hotbar editing ENABLED - cursor visible!');
                } else {
                    // Wyłącz edycję - włącz pointer lock
                    guiManager.toggleHotbarEditMode(false);
                    this.requestPointerLock();
                    console.log('✓ Hotbar editing disabled');
                }
            }
        }

        if (e.key === 'Escape') {
            document.exitPointerLock();
            if (window.gameRenderer && window.gameRenderer.guiManager) {
                window.gameRenderer.guiManager.toggleHotbarEditMode(false);
            }
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

        // Blokuj ruch kamery gdy inventory jest otwarte
        if (window.gameRenderer && window.gameRenderer.guiManager && window.gameRenderer.guiManager.editingHotbar) {
            return;
        }

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

        // Blokuj WASD gdy inventory jest otwarte
        const inventoryOpen = window.gameRenderer && window.gameRenderer.guiManager && window.gameRenderer.guiManager.editingHotbar;

        if (!inventoryOpen) {
            if (this.keys['w']) inputVel.add(forward);
            if (this.keys['s']) inputVel.sub(forward);
            if (this.keys['a']) inputVel.add(right);
            if (this.keys['d']) inputVel.sub(right);
        }

        this.isMoving = inputVel.length() > 0;

        if (this.isMoving) {
            inputVel.normalize().multiplyScalar(currentSpeed);
            // Smooth interpolacja prędkości
            const smoothFactor = Math.min(delta * 15, 1);
            this.velocity.x += (inputVel.x - this.velocity.x) * smoothFactor;
            this.velocity.z += (inputVel.z - this.velocity.z) * smoothFactor;
        } else {
            this.velocity.x *= 0.8;
            this.velocity.z *= 0.8;
        }

        if (this.flying) {
            if (!inventoryOpen && this.keys[' ']) this.velocity.y = currentSpeed;
            else if (!inventoryOpen && this.keys['shift']) this.velocity.y = -currentSpeed;
            else this.velocity.y *= 0.8;
        } else {
            // Grawitacja
            this.velocity.y -= this.gravity * delta;

            const groundCheck = this.position.clone();
            groundCheck.y -= 0.1;
            // onGround = true jeśli gracz pada (velocity.y <= 0) - zapobiega bounce'owaniu
            this.onGround = this.checkCollision(groundCheck) && this.velocity.y <= 0;

            // Jump
            if (!inventoryOpen && this.onGround && this.keys[' ']) {
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

        // Raycast raz per frame dla outline i block interaction - cache'uj wynik
        this.lastRaycastResult = this.raycast();

        // Aktualizuj outline bloku (używa cached raycast)
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

        // Aktualizuj swing animation
        if (this.isSwinging) {
            this.swingProgress += delta / this.swingDuration;
            if (this.swingProgress >= 1.0) {
                this.swingProgress = 0;
                this.isSwinging = false;
            }
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

        // Punkty sprawdzenia kolizji - ZOPTYMALIZOWANE do 7 punktów
        // Zamiast 25 punktów: tylko narożniki + środek
        const checkPoints = [
            // Środek (każdy poziom)
            [0, 0, 0],
            [0, height * 0.5, 0],
            [0, height - 0.2, 0],

            // Narożniki na dnie i górze (4 + 2)
            [radius, 0, radius],
            [radius, 0, -radius],
            [-radius, 0, radius],
            [-radius, 0, -radius],

            // Górne narożniki dla sufitów
            [radius * 0.8, height - 0.2, radius * 0.8],
            [-radius * 0.8, height - 0.2, -radius * 0.8],
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
            // Użyj cached raycast zamiast wywoływać raycast() - optymalizacja
            const hit = this.lastRaycastResult;
            if (hit.hit) {
                if (this.mouseDown.left) {
                    console.log('Breaking block at:', hit.block.x, hit.block.y, hit.block.z);
                    this.world.setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
                    this.blockCooldown = 0.2;
                    // Uruchom swing animation
                    this.triggerSwing();
                } else if (this.mouseDown.right) {
                    // Pobierz ID bloku z aktywnego slotu hotbaru
                    const slot = HOTBAR_BLOCKS[this.selectedSlotIndex];
                    const blockId = ChatManager.getBlockId(slot);

                    // Nie można umieszczać bloków z pustych slotów
                    if (blockId === 0) {
                        console.log('⚠️ Cannot place block - slot is empty');
                        return;
                    }

                    // Sprawdź czy blok nie koliduje z graczem
                    if (this.canPlaceBlock(hit.prev.x, hit.prev.y, hit.prev.z)) {
                        console.log('Placing block at:', hit.prev.x, hit.prev.y, hit.prev.z, 'BlockID:', blockId);
                        this.world.setBlock(hit.prev.x, hit.prev.y, hit.prev.z, blockId);
                        this.blockCooldown = 0.2;
                        // Uruchom swing animation
                        this.triggerSwing();
                    }
                }
            }
        }
    }

    // Sprawdź czy można postawić blok na pozycji (x, y, z) - nie może kolidować z graczem
    canPlaceBlock(blockX, blockY, blockZ) {
        // Hitbox gracza
        const playerMinX = this.position.x - this.playerRadius;
        const playerMaxX = this.position.x + this.playerRadius;
        const playerMinY = this.position.y;
        const playerMaxY = this.position.y + this.playerHeight;
        const playerMinZ = this.position.z - this.playerRadius;
        const playerMaxZ = this.position.z + this.playerRadius;

        // Hitbox bloku (1x1x1)
        const blockMinX = blockX;
        const blockMaxX = blockX + 1;
        const blockMinY = blockY;
        const blockMaxY = blockY + 1;
        const blockMinZ = blockZ;
        const blockMaxZ = blockZ + 1;

        // AABB collision check
        const collides =
            playerMinX < blockMaxX && playerMaxX > blockMinX &&
            playerMinY < blockMaxY && playerMaxY > blockMinY &&
            playerMinZ < blockMaxZ && playerMaxZ > blockMinZ;

        return !collides; // Zwróć true jeśli NIE koliduje (możesz postawić)
    }

    triggerSwing() {
        // Rozpocznij animację swing od początku
        this.swingProgress = 0;
        this.isSwinging = true;
    }

    updateBlockOutline() {
        // Użyj cached raycast zamiast wywoływać raycast() - optymalizacja
        const hit = this.lastRaycastResult;

        if (hit.hit) {
            const { x, y, z } = hit.block;

            // Jeśli to nowy blok, przesuń outline zamiast dispose/recreate
            if (!this.selectedBlockPos || this.selectedBlockPos.x !== x ||
                this.selectedBlockPos.y !== y || this.selectedBlockPos.z !== z) {

                // Utwórz outline tylko raz
                if (!this.selectedBlockOutline) {
                    const geometry = new THREE.BoxGeometry(1.002, 1.002, 1.002);
                    const material = new THREE.LineBasicMaterial({
                        color: 0x000000,
                        linewidth: 2
                    });
                    const edges = new THREE.EdgesGeometry(geometry);
                    this.selectedBlockOutline = new THREE.LineSegments(edges, material);
                    this.world.scene.add(this.selectedBlockOutline);
                }

                // Przesuń outline do nowej pozycji i pokaż
                this.selectedBlockOutline.position.set(x + 0.5, y + 0.5, z + 0.5);
                this.selectedBlockOutline.visible = true;
                this.selectedBlockPos = { x, y, z };
            }
        } else {
            // Brak trafu - ukryj outline (nie usuwaj, just hide)
            if (this.selectedBlockOutline) {
                this.selectedBlockOutline.visible = false;
                this.selectedBlockPos = null;
            }
        }
    }

    updateHeldBlock(delta) {
        // Utwórz held block jeśli nie istnieje i held block scene jest gotowa
        if (!this.heldBlockMesh && this.heldBlockScene && this.world) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const materials = [
                new THREE.MeshPhongMaterial({ color: 0xffffff }),
                new THREE.MeshPhongMaterial({ color: 0xffffff }),
                new THREE.MeshPhongMaterial({ color: 0xffffff }),
                new THREE.MeshPhongMaterial({ color: 0xffffff }),
                new THREE.MeshPhongMaterial({ color: 0xffffff }),
                new THREE.MeshPhongMaterial({ color: 0xffffff })
            ];

            this.heldBlockMesh = new THREE.Mesh(geometry, materials);

            // Ustaw scale - MC wartości dla bloków: 0.4
            this.heldBlockMesh.scale.set(0.35, 0.35, 0.35);
            this.heldBlockMesh.rotation.order = 'YXZ';

            // Włącz depth test - blok NIE renderuje się przez inne bloki
            this.heldBlockMesh.material.forEach(mat => {
                mat.depthTest = true;
                mat.depthWrite = true;
            });

            // Dodaj oświetlenie do held block scene
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
            this.heldBlockScene.add(ambientLight);
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
            dirLight.position.set(1, 1, 0.5);
            this.heldBlockScene.add(dirLight);

            // Dodaj do osobnej sceny held block (nie do głównej sceny)
            this.heldBlockScene.add(this.heldBlockMesh);

            // Załaduj tekstury dla aktualnie wybranego bloku
            this.updateBlockMaterials();
            this.lastSelectedBlock = ChatManager.getBlockId(HOTBAR_BLOCKS[this.selectedSlotIndex]);

            console.log('Held block created in separate scene');
        }

        if (!this.heldBlockMesh) return; // Wyjdź jeśli się nie stworzyło

        // Zmień tekstury jeśli gracz zmienił wybrany blok (slot lub zawartość hotbaru)
        const currentSlot = HOTBAR_BLOCKS[this.selectedSlotIndex];
        const currentBlockId = ChatManager.getBlockId(currentSlot);

        // Jeśli wybrany blok jest pusty (0 = AIR), schowaj held block
        if (currentBlockId === 0) {
            this.heldBlockMesh.visible = false;
        } else {
            this.heldBlockMesh.visible = true;
            if (this.lastSelectedBlock !== currentBlockId) {
                this.updateBlockMaterials();
                this.lastSelectedBlock = currentBlockId;
            }
        }

        // Synchronizuj held block camera z główną kamerą
        this.heldBlockCamera.position.copy(this.camera.position);
        this.heldBlockCamera.rotation.copy(this.rotation);

        // Pozycjonuj blok w lokalnych współrzędnych kamery (jak nakładka 2D)
        // Oblicz kierunki w przestrzeni kamery
        const forward = new THREE.Vector3(0, 0, -1);
        const right = new THREE.Vector3(1, 0, 0);
        const up = new THREE.Vector3(0, 1, 0);

        // Zastosuj rotację kamery do kierunków
        forward.applyEuler(this.rotation);
        right.applyEuler(this.rotation);
        up.applyEuler(this.rotation);

        // Oblicz swing offset - sinusoidalna krzywa (0 -> 0.5 -> 1 -> 0.5 -> 0)
        let swingOffsetDown = 0;
        let swingOffsetSide = 0;
        if (this.isSwinging) {
            // Użyj sin dla płynnej animacji
            // swing progress: 0 -> 1, sin daje: 0 -> 1 -> 0
            const swingAmount = Math.sin(this.swingProgress * Math.PI);

            // W MC blok przesuwa się w dół i lekko w bok podczas swing
            swingOffsetDown = swingAmount * 0.15; // W dół
            swingOffsetSide = swingAmount * 0.1;  // W lewo (przeciwnie do prawej ręki)
        }

        // Pozycja: kamera + offset w lokalnych współrzędnych + swing offset
        // Dostosowane do Minecraft - blok bardziej po prawej i niżej
        this.heldBlockMesh.position.copy(this.camera.position)
            .add(right.multiplyScalar(0.45 + swingOffsetSide))   // prawo + swing w bok
            .add(up.multiplyScalar(-0.4 - swingOffsetDown))      // dół + swing w dół
            .add(forward.multiplyScalar(0.55)); // blisko kamery

        // Rotacja: synchronizuj z kamerą + offset Minecraft firstperson_righthand dla bloków
        // MC wartości dla bloków: rotation [0, 135, 0] - STAŁA, bez zmiany podczas swing
        const cameraQuaternion = new THREE.Quaternion().setFromEuler(this.rotation);
        const offsetQuaternion = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-5 * Math.PI / 180, 135 * Math.PI / 180, 5 * Math.PI / 180, 'YXZ')
        );

        // Pomnóż quaterniony: rotacja kamery * offset lokalny
        this.heldBlockMesh.quaternion.copy(cameraQuaternion).multiply(offsetQuaternion);
    }

    updateBlockMaterials() {
        if (!this.heldBlockMesh) return;

        // Pobierz ID bloku z aktywnego slotu
        const slot = HOTBAR_BLOCKS[this.selectedSlotIndex];
        const blockId = ChatManager.getBlockId(slot);

        // Jeśli slot jest pusty, nie aktualizuj materiałów
        if (blockId === 0) {
            console.warn('Cannot update materials for empty slot');
            return;
        }

        const textureMap = {
            1: { top: 'grass_top_biome_plains', side: 'grass_side_biome_plains', bottom: 'dirt' }, // GRASS
            2: { top: 'dirt', side: 'dirt', bottom: 'dirt' }, // DIRT
            3: { top: 'stone', side: 'stone', bottom: 'stone' }, // STONE
            4: { top: 'log_oak_top', side: 'log_oak', bottom: 'log_oak_top' }, // WOOD
            5: { top: 'leaves_oak_biome_plains', side: 'leaves_oak_biome_plains', bottom: 'leaves_oak_biome_plains' }, // LEAVES
            6: { top: 'planks_oak', side: 'planks_oak', bottom: 'planks_oak' }, // PLANKS
            7: { top: 'glass', side: 'glass', bottom: 'glass' } // GLASS
        };

        const blockTextures = textureMap[blockId] || textureMap[2];

        if (!this.world || !this.world.textureManager) return;

        const textures = {
            top: this.world.textureManager.textures[blockTextures.top],
            side: this.world.textureManager.textures[blockTextures.side],
            bottom: this.world.textureManager.textures[blockTextures.bottom]
        };

        // Aktualizuj tekstury istniejących materiałów zamiast tworzyć nowe
        // 0: +X (prawo), 1: -X (lewo), 2: +Y (góra), 3: -Y (dół), 4: +Z (przód), 5: -Z (tył)
        const materials = this.heldBlockMesh.material;

        // Sprawdź czy to transparent blok (glass, leaves)
        const isTransparent = blockId === BLOCKS.GLASS || blockId === BLOCKS.LEAVES;

        materials[0].map = textures.side; // +X (prawo)
        materials[1].map = textures.side; // -X (lewo)
        materials[2].map = textures.top;  // +Y (góra)
        materials[3].map = textures.bottom; // -Y (dół)
        materials[4].map = textures.side; // +Z (przód)
        materials[5].map = textures.side; // -Z (tył)

        // Ustaw transparent dla glass/leaves
        materials.forEach(mat => {
            mat.transparent = isTransparent;
            mat.alphaTest = isTransparent ? 0.5 : 0;
            mat.side = THREE.FrontSide; // Wszystkie bloki: tylko front side
            mat.needsUpdate = true;
        });
    }

    requestPointerLock() {
        this.canvas.requestPointerLock();
    }
}