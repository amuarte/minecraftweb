// renderer.js - Inicjalizacja Three.js i główna pętla gry
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { GUIManager } from './guiManager.js';
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
        this.textureManager = null;

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

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas,
            antialias: false,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight.position.set(1, 1, 0.5);
        this.scene.add(dirLight);

        // TextureManager
        this.textureManager = new TextureManager();

        // World
        this.world = new World(this.scene, this.textureManager);

        // Player
        this.player = new Player(this.world, this.camera, this.canvas);

        // UI
        this.ui = new UI(this.worldSaver, this.world, this.player);
        this.ui.setupUI();

        // GUI Manager
        this.guiManager = new GUIManager(this.world, this.player, this.textureManager);

        // Window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
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

            if (!this.player.pointerLocked) {
                this.renderer.render(this.scene, this.camera);
                return;
            }

            // Update player
            this.player.update(delta);
            this.player.handleBlockInteraction();

            // Load chunks
            const playerChunkX = Math.floor(this.player.position.x / CONFIG.CHUNK_SIZE);
            const playerChunkZ = Math.floor(this.player.position.z / CONFIG.CHUNK_SIZE);

            for (let x = -CONFIG.RENDER_DISTANCE; x <= CONFIG.RENDER_DISTANCE; x++) {
                for (let z = -CONFIG.RENDER_DISTANCE; z <= CONFIG.RENDER_DISTANCE; z++) {
                    this.world.createChunk(playerChunkX + x, playerChunkZ + z);
                }
            }

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

            this.renderer.render(this.scene, this.camera);
        };

        tick();
    }
}