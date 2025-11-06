// hotbarRenderer.js - Renderowanie bloków 3D w hotbarze bez zależności od PNG-ów
import { BLOCKS_REGISTRY } from './config.js';

export class HotbarRenderer {
    constructor(textureManager) {
        this.textureManager = textureManager;
        this.blockCanvases = {}; // Cache renderowanych bloków

        // Zmienne do testowania obrotu - domyślnie PERFECT ISOMETRIC
        // OrthographicCamera + kamera position (1,1,1) + rotacja 0 0 0 = idealne!
        this.rotationX = 0; // 0°
        this.rotationY = 0; // 0°
        this.rotationZ = 0; // 0°
        this.rotationOrder = 'XYZ';

        // Ustawienia z globalnego scope'u jeśli istnieją
        if (typeof window !== 'undefined') {
            window.blockRotation = {
                x: this.rotationX,
                y: this.rotationY,
                z: this.rotationZ,
                order: this.rotationOrder
            };
        }
    }

    /**
     * Synchronicznie renderuje blok 3D do canvas-a
     * @param {number} blockId - ID bloku
     * @param {number} canvasWidth - Szerokość canvas-a
     * @param {number} canvasHeight - Wysokość canvas-a
     * @returns {HTMLCanvasElement} Canvas
     */
    renderBlockToCanvas(blockId, canvasWidth = 48, canvasHeight = 48) {
        const cacheKey = `${blockId}_${canvasWidth}x${canvasHeight}`;

        // Jeśli już renderowaliśmy, zwróć cache
        if (this.blockCanvases[cacheKey]) {
            return this.blockCanvases[cacheKey];
        }

        try {
            const canvas = this._renderBlock(blockId, canvasWidth, canvasHeight);
            this.blockCanvases[cacheKey] = canvas;
            return canvas;
        } catch (err) {
            console.error(`Błąd przy renderowaniu bloku ${blockId}:`, err);
            // Zwróć pusty canvas
            const fallbackCanvas = document.createElement('canvas');
            fallbackCanvas.width = canvasWidth;
            fallbackCanvas.height = canvasHeight;
            return fallbackCanvas;
        }
    }

    /**
     * Wewnętrzna metoda do renderowania bloku (synchronicznie)
     * @private
     */
    _renderBlock(blockId, canvasWidth, canvasHeight) {
        // Utwórz scene, camera i renderer dla tego bloku
        const scene = new THREE.Scene();
        scene.background = null; // Przezroczysty background

        // Camera - OrthographicCamera dla prawdziwego izometrycznego widoku
        // Wszystkie krawędzie będą równe i symetryczne!
        const aspect = canvasWidth / canvasHeight;
        const zoom = 0.8; // Zmniejszony zoom aby bloki były większe
        const camera = new THREE.OrthographicCamera(
            -1 * aspect * zoom,
            1 * aspect * zoom,
            1 * zoom,
            -1 * zoom,
            0.1,
            1000
        );
        // Pozycja dla izometrycznego widoku
        camera.position.set(1, 1, 1);
        camera.lookAt(0, 0, 0);

        // Lights - oświetlenie jak w Minecraft (zmniejszony kontrast)
        // Lewa ściana: przyciemniona
        // Prawa ściana: średnio przyciemniona
        // Górna ściana: najjaśniejsza (ale nie zbyt mocno)

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        // Główne oświetlenie z góry (trochę mniej jasne)
        const topLight = new THREE.DirectionalLight(0xffffff, 0.6);
        topLight.position.set(0, 2, 0);
        scene.add(topLight);

        // Prawe oświetlenie (średnie)
        const rightLight = new THREE.DirectionalLight(0xffffff, 0.4);
        rightLight.position.set(1.5, 0.5, 0);
        scene.add(rightLight);

        // Lewe oświetlenie (przyciemnione, ale nie zbyt mocno)
        const leftLight = new THREE.DirectionalLight(0xffffff, 0.3);
        leftLight.position.set(-1.5, 0.5, 0);
        scene.add(leftLight);

        // Stwórz mesh bloku
        const blockMesh = this.createBlockMesh(blockId);
        if (blockMesh) {
            scene.add(blockMesh);
        }

        // Renderer na canvas-ie
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: false,
            alpha: true,
            preserveDrawingBuffer: true
        });
        renderer.setSize(canvasWidth, canvasHeight);
        renderer.setClearColor(0x000000, 0);
        renderer.render(scene, camera);

        // Czyszczenie zasobów
        if (blockMesh) {
            blockMesh.geometry.dispose();
            if (Array.isArray(blockMesh.material)) {
                blockMesh.material.forEach(mat => mat.dispose());
            } else {
                blockMesh.material.dispose();
            }
        }
        renderer.dispose();

        return canvas;
    }

    /**
     * Tworzy mesh bloku 3D
     * @param {number} blockId - ID bloku
     * @returns {THREE.Mesh} Mesh bloku
     */
    createBlockMesh(blockId) {
        const block = BLOCKS_REGISTRY[blockId];
        if (!block || blockId === 0) return null;

        const geometry = new THREE.BoxGeometry(1, 1, 1);

        // Pobierz tekstury dla każdej ściany
        const textures = block.textures;
        const materials = [];

        const faces = ['side', 'side', 'top', 'bottom', 'side', 'side']; // px, nx, py, ny, pz, nz

        faces.forEach((faceName) => {
            const textureName = textures[faceName];
            const texture = this.textureManager.textures[textureName];

            let material;
            if (texture) {
                // Minecraft tekstury - całkowicie matte (brak błysku)
                material = new THREE.MeshLambertMaterial({
                    map: texture
                });
            } else {
                // Fallback - kolor bloku jeśli brakuje tekstury
                const color = block.color || 0x888888;
                material = new THREE.MeshLambertMaterial({
                    color: color
                });
            }
            materials.push(material);
        });

        const mesh = new THREE.Mesh(geometry, materials);

        // Obrót - używa zmiennych z window.blockRotation jeśli dostępne
        const rotation = (typeof window !== 'undefined' && window.blockRotation)
            ? window.blockRotation
            : {
                x: this.rotationX,
                y: this.rotationY,
                z: this.rotationZ,
                order: this.rotationOrder
            };

        mesh.rotation.order = rotation.order;
        mesh.rotation.x = rotation.x;
        mesh.rotation.y = rotation.y;
        mesh.rotation.z = rotation.z;

        return mesh;
    }

    /**
     * Otrzymuje canvas dla wyrenderowanego bloku
     * @param {number} blockId - ID bloku
     * @returns {HTMLCanvasElement} Canvas
     */
    getBlockCanvas(blockId) {
        return this.renderBlockToCanvas(blockId, 48, 48);
    }

    /**
     * Czyści cache
     */
    clearCache() {
        this.blockCanvases = {};
    }

    /**
     * Aktualizuje rotację wszystkich bloków
     * @param {number} x - Rotacja X w radianach
     * @param {number} y - Rotacja Y w radianach
     * @param {number} z - Rotacja Z w radianach
     * @param {string} order - Kolejność obrotów (XYZ, YXZ, ZYX, itp)
     */
    updateRotation(x, y, z, order = 'XYZ') {
        this.rotationX = x;
        this.rotationY = y;
        this.rotationZ = z;
        this.rotationOrder = order;

        // Aktualizuj globalny obiekt
        if (typeof window !== 'undefined') {
            window.blockRotation = { x, y, z, order };
        }

        // Wyczyść cache aby bloki się przerendrowały
        this.clearCache();
    }
}
