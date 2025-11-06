// world.js - Zarządzanie światem i chunkami
import { CONFIG, BLOCKS } from './config.js';
import { Chunk } from './chunk.js';

// === SUPER PROSTY TEMPORARY LIGHTING - tylko na przyszłość ===
class LightingSystem {
    constructor(world) {
        this.world = world;
    }

    // Zwróć brightness na podstawie wysokości (0.5 - 1.0)
    // Im wyżej, tym jaśniej. Super proste!
    calculateBrightness(x, y, z) {
        // Liniowy gradient: dół = 0.5, góra = 1.0
        return 0.5 + (y / CONFIG.CHUNK_HEIGHT) * 0.5;
    }
}

export class World {
    constructor(scene, textureManager, generatorType = 'classic') {
        this.chunks = new Map();
        this.scene = scene;
        this.textureManager = textureManager;
        this.seed = Math.floor(Math.random() * 1000000);
        this.generatorType = generatorType; // 'classic' lub 'hilly'
        this.lightingSystem = new LightingSystem(this);

        // Mesh delta updates - zamiast rebuild od razu, zbieraj dirty chunks
        this.dirtyChunks = new Set();
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    getChunk(x, z) {
        return this.chunks.get(this.getChunkKey(x, z));
    }

    createChunk(x, z) {
        const key = this.getChunkKey(x, z);
        if (!this.chunks.has(key)) {
            console.log('Creating chunk:', x, z, 'TextureManager:', !!this.textureManager);
            const chunk = new Chunk(x, z, this.scene, this, this.textureManager);
            this.chunks.set(key, chunk);
        }
    }

    getBlock(x, y, z) {
        const chunkX = Math.floor(x / CONFIG.CHUNK_SIZE);
        const chunkZ = Math.floor(z / CONFIG.CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) return BLOCKS.AIR;

        const localX = ((x % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        const localZ = ((z % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        return chunk.getBlock(localX, y, localZ);
    }

    setBlock(x, y, z, type) {
        const chunkX = Math.floor(x / CONFIG.CHUNK_SIZE);
        const chunkZ = Math.floor(z / CONFIG.CHUNK_SIZE);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) return;

        const localX = ((x % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        const localZ = ((z % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        chunk.setBlock(localX, y, localZ, type);

        // Mesh delta updates - zaznacz zarówno główny chunk jak i sąsiadów jako dirty
        // Rebuilda incrementally żeby uniknąć lag spike'ów
        this.markChunkDirty(chunkX, chunkZ);
        if (localX === 0) this.markChunkDirty(chunkX - 1, chunkZ);
        if (localX === CONFIG.CHUNK_SIZE - 1) this.markChunkDirty(chunkX + 1, chunkZ);
        if (localZ === 0) this.markChunkDirty(chunkX, chunkZ - 1);
        if (localZ === CONFIG.CHUNK_SIZE - 1) this.markChunkDirty(chunkX, chunkZ + 1);
    }

    // Zaznacz chunk jako dirty (będzie przebudowany na koniec frame'a)
    markChunkDirty(chunkX, chunkZ) {
        const key = this.getChunkKey(chunkX, chunkZ);
        this.dirtyChunks.add(key);
    }

    // Przebuduj 1-2 dirty chunks per frame (incremental) - zapobiega lag spike'om
    rebuildDirtyChunks() {
        if (this.dirtyChunks.size === 0) return;

        // Rebuild max 2 chunki per frame - rozprowadza mesh building ale jest dość szybko
        let count = 0;
        for (const key of this.dirtyChunks) {
            if (count >= 2) break; // Max 2 per frame
            const chunk = this.chunks.get(key);
            if (chunk) {
                chunk.buildMesh();
            }
            this.dirtyChunks.delete(key);
            count++;
        }
    }

}