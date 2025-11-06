// renderer.js - Inicjalizacja Three.js i główna pętla gry
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { GUIManager } from './guiManager.js';
import { ChatManager } from './chatManager.js';
import { TextureManager } from './textures.js';
import { WorldSaver } from './worldSaver.js';

export class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        this.player = null;
        this.ui = null;
        this.guiManager = null;
        this.chatManager = null;
        this.textureManager = null;

        // Osobna scena i kamera dla held block (nie reaguje na FOV głównej kamery)
        this.heldBlockScene = null;
        this.heldBlockCamera = null;

        // 2D overlay canvas dla chatu
        this.overlayCanvas = null;

        this.lastTime = performance.now();
        this.fps = 0;
        this.frameCount = 0;
        this.fpsTime = 0;
        this.isReady = false;

        this.init();
    }

    init() {
        this.worldSaver = WorldSaver;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, CONFIG.RENDER_DISTANCE * CONFIG.CHUNK_SIZE * 1.5);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // Held Block Scene i Camera - osobne renderowanie, stały FOV
        this.heldBlockScene = new THREE.Scene();
        // Przezroczyste tło - nie zakrywa głównej sceny
        this.heldBlockScene.background = null;

        this.heldBlockCamera = new THREE.PerspectiveCamera(
            70, // Stały FOV - nie zmienia się podczas sprintu
            window.innerWidth / window.innerHeight,
            0.01,
            10
        );

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        // === LIGHTING - Proste Three.js lighting ===
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(1, 1, 0.5);
        this.scene.add(dirLight);

        // TextureManager
        this.textureManager = new TextureManager();

        // World
        this.world = new World(this.scene, this.textureManager);

        // Player - przekaż też held block scene i kamerę
        this.player = new Player(this.world, this.camera, this.canvas, this.heldBlockScene, this.heldBlockCamera);

        // UI
        this.ui = new UI(this.worldSaver, this.world, this.player);
        this.ui.setupUI();

        // GUI Manager
        this.guiManager = new GUIManager(this.world, this.player, this.textureManager);

        // Chat Manager - przekaż główny canvas
        this.chatManager = new ChatManager(this.canvas);

        // Expose renderer globally for hotbar editing
        window.gameRenderer = this;

        // Window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.heldBlockCamera.aspect = window.innerWidth / window.innerHeight;
        this.heldBlockCamera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Zmień rozmiar overlay canvas
        if (this.overlayCanvas) {
            this.overlayCanvas.width = window.innerWidth;
            this.overlayCanvas.height = window.innerHeight;
        }
    }

    start() {
        this.ui.hideInstructions();
        this.player.requestPointerLock();
        this.startGameLoop();
    }

    async initAndStart() {
        console.log('Waiting for textures...');
        await this.textureManager.loadingPromise;
        console.log('Textures loaded!');
        console.log('Textures in manager:', Object.keys(this.textureManager.textures));

        // === Inicjalizuj hotbar po załadowaniu tekstur ===
        console.log('Initializing hotbar...');
        await this.guiManager.initializeHotbar();
        console.log('✓ Hotbar initialized');

        // === Załaduj initial chunki wokół spawn point'u ===
        console.log('Loading initial chunks...');
        const spawnChunkX = 0;
        const spawnChunkZ = 0;
        for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) {
                this.world.createChunk(spawnChunkX + x, spawnChunkZ + z);
            }
        }
        console.log('✓ Loaded', this.world.chunks.size, 'initial chunks');

        console.log('Rebuilding', this.world.chunks.size, 'chunks...');
        this.world.chunks.forEach((chunk, key) => {
            console.log('Rebuilding chunk:', key);
            chunk.buildMesh();
        });

        this.isReady = true;
        console.log('Game is ready, starting...');
        this.start();
    }

    startGameLoop() {
        const tick = () => {
            requestAnimationFrame(tick);

            const currentTime = performance.now();
            const delta = Math.min((currentTime - this.lastTime) / 1000, 0.1);
            this.lastTime = currentTime;

            if (!this.isReady) {
                this.renderer.render(this.scene, this.camera);
                // NIE renderuj held block gdy gra nie jest gotowa
                return;
            }

            this.frameCount++;
            this.fpsTime += delta;
            if (this.fpsTime >= 1) {
                this.fps = this.frameCount;
                this.frameCount = 0;
                this.fpsTime = 0;
                console.log('FPS:', this.fps, 'Chunks:', this.world.chunks.size);
            }

            // Update chat
            this.chatManager.update(delta);

            // Pauzuj grę jeśli pointer lock jest wyłączony I inventory nie jest otwarte I chat nie jest otwarty
            if (!this.player.pointerLocked && !this.guiManager.editingHotbar && !this.chatManager.isOpen) {
                this.renderer.render(this.scene, this.camera);
                // NIE renderuj held block gdy gra jest zapauzowana
                return;
            }

            // Blokuj player input gdy chat lub inventory są otwarte
            const inputBlocked = this.chatManager.isOpen || this.guiManager.editingHotbar;

            // Update player (ale nie gdy chat jest otwarty)
            if (!inputBlocked) {
                this.player.update(delta);
                this.player.handleBlockInteraction();
            }

            // Load chunks
            const playerChunkX = Math.floor(this.player.position.x / CONFIG.CHUNK_SIZE);
            const playerChunkZ = Math.floor(this.player.position.z / CONFIG.CHUNK_SIZE);

            for (let x = -CONFIG.RENDER_DISTANCE; x <= CONFIG.RENDER_DISTANCE; x++) {
                for (let z = -CONFIG.RENDER_DISTANCE; z <= CONFIG.RENDER_DISTANCE; z++) {
                    this.world.createChunk(playerChunkX + x, playerChunkZ + z);
                }
            }

            // Rebuild dirty chunks (batched mesh updates) - AFTER create chunks
            // Bo nowe chunki mogą oznaczyć sąsiadów jako dirty
            this.world.rebuildDirtyChunks();

            // Update UI
            this.ui.updateStats({
                fps: this.fps,
                position: {
                    x: Math.floor(this.player.position.x),
                    y: Math.floor(this.player.position.y),
                    z: Math.floor(this.player.position.z)
                },
                chunks: this.world.chunks.size
            });

            // Update hotbar selection visual
            this.ui.updateHotbarSelection();

            // Update GUI
            if (this.guiManager) {
                this.guiManager.update();
            }

            // Renderuj główną scenę + held block scene w jednym passe
            // autoClear = false zapobiega zbędnemu czyszczeniu między renderami
            this.renderer.render(this.scene, this.camera);
            this.renderer.autoClear = false;
            this.renderer.clearDepth(); // Tylko depth, nie kolor
            this.renderer.render(this.heldBlockScene, this.heldBlockCamera);
            this.renderer.autoClear = true;

            // Renderuj chat overlay (2D canvas na top WebGL canvas)
            if (this.chatManager.isOpen) {
                this.renderChatOverlay();
            } else {
                // Ukryj overlay canvas gdy chat jest zamknięty
                if (this.overlayCanvas) {
                    this.overlayCanvas.style.display = 'none';
                }
            }
        };

        tick();
    }

    renderChatOverlay() {
        // Utwórz overlay canvas jeśli nie istnieje
        if (!this.overlayCanvas) {
            this.overlayCanvas = document.createElement('canvas');
            this.overlayCanvas.id = 'chat-overlay';
            this.overlayCanvas.width = window.innerWidth;
            this.overlayCanvas.height = window.innerHeight;
            this.overlayCanvas.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                display: block;
                z-index: 999;
                pointer-events: none;
            `;
            document.body.appendChild(this.overlayCanvas);
        }

        // Upewnij się że overlay canvas jest widoczny
        this.overlayCanvas.style.display = 'block';

        // Pobierz 2D context
        const ctx = this.overlayCanvas.getContext('2d');
        if (!ctx) return;

        // Wyłącz interpolację dla pixel-perfect renderowania
        ctx.imageSmoothingEnabled = false;

        // Wyczyść overlay canvas
        ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        // Pobierz canvas z tekstami chatu
        const chatCanvas = this.chatManager.getTextCanvas();

        // Rysuj chat w bottom-left corner bez dodatkowego skalowania
        // Canvas jest już wyrenderowany z scale=3 w drawText()
        ctx.drawImage(chatCanvas, 0, this.overlayCanvas.height - chatCanvas.height, chatCanvas.width, chatCanvas.height);
    }
}