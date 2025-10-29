// world.js - Zarządzanie światem i chunkami
import { CONFIG, BLOCKS } from './config.js';
import { Chunk } from './chunk.js';

export class World {
    constructor(scene, textureManager) {
        this.chunks = new Map();
        this.scene = scene;
        this.textureManager = textureManager;
        this.seed = Math.floor(Math.random() * 1000000);
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

        chunk.buildMesh();
        if (localX === 0) this.getChunk(chunkX - 1, chunkZ)?.buildMesh();
        if (localX === CONFIG.CHUNK_SIZE - 1) this.getChunk(chunkX + 1, chunkZ)?.buildMesh();
        if (localZ === 0) this.getChunk(chunkX, chunkZ - 1)?.buildMesh();
        if (localZ === CONFIG.CHUNK_SIZE - 1) this.getChunk(chunkX, chunkZ + 1)?.buildMesh();
    }
}