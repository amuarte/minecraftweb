// chunk.js - Generowanie i renderowanie chunków
import { CONFIG, BLOCKS } from './config.js';

function noise(x, z, seed = 0) {
    const n = Math.sin(x * 0.1 + seed) * Math.cos(z * 0.1 + seed) * 5 +
              Math.sin(x * 0.05 + seed) * Math.cos(z * 0.05 + seed) * 10;
    return Math.floor(n + CONFIG.CHUNK_HEIGHT / 2);
}

export class Chunk {
    constructor(x, z, scene, world, textureManager) {
        this.x = x;
        this.z = z;
        this.scene = scene;
        this.world = world;
        this.textureManager = textureManager;
        this.blocks = new Uint8Array(CONFIG.CHUNK_SIZE * CONFIG.CHUNK_HEIGHT * CONFIG.CHUNK_SIZE);
        this.meshes = [];
        this.generate();
        this.buildMesh();
    }

    generate() {
        for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
            for (let z = 0; z < CONFIG.CHUNK_SIZE; z++) {
                const worldX = this.x * CONFIG.CHUNK_SIZE + x;
                const worldZ = this.z * CONFIG.CHUNK_SIZE + z;
                const height = noise(worldX, worldZ, this.world.seed);

                for (let y = 0; y < CONFIG.CHUNK_HEIGHT; y++) {
                    const index = this.getIndex(x, y, z);
                    if (y < height - 5) {
                        this.blocks[index] = BLOCKS.STONE;
                    } else if (y < height - 1) {
                        this.blocks[index] = BLOCKS.DIRT;
                    } else if (y < height) {
                        this.blocks[index] = BLOCKS.GRASS;
                    } else {
                        this.blocks[index] = BLOCKS.AIR;
                    }
                }
            }
        }
    }

    getIndex(x, y, z) {
        return x + z * CONFIG.CHUNK_SIZE + y * CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE;
    }

    getBlock(x, y, z) {
        if (y < 0 || y >= CONFIG.CHUNK_HEIGHT) return BLOCKS.AIR;
        const lx = ((x % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        const lz = ((z % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        return this.blocks[this.getIndex(lx, y, lz)];
    }

    setBlock(x, y, z, type) {
        if (x < 0 || x >= CONFIG.CHUNK_SIZE || 
            y < 0 || y >= CONFIG.CHUNK_HEIGHT || 
            z < 0 || z >= CONFIG.CHUNK_SIZE) return;
        this.blocks[this.getIndex(x, y, z)] = type;
    }

    buildMesh() {
        if (!this.textureManager) return;

        // Wyczyść stare meshes
        this.meshes.forEach(m => {
            this.scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) m.material.dispose();
        });
        this.meshes = [];

        // Geometry dla każdego typu tekstury
        const geometries = {
            grass_top_biome_plains: { vertices: [], uvs: [], indices: [], count: 0 },
            grass_side_biome_plains: { vertices: [], uvs: [], indices: [], count: 0 },
            dirt: { vertices: [], uvs: [], indices: [], count: 0 },
            stone: { vertices: [], uvs: [], indices: [], count: 0 },
            log_oak: { vertices: [], uvs: [], indices: [], count: 0 },
            log_oak_top: { vertices: [], uvs: [], indices: [], count: 0 },
            leaves_oak_biome_plains: { vertices: [], uvs: [], indices: [], count: 0 }
        };

        for (let y = 0; y < CONFIG.CHUNK_HEIGHT; y++) {
            for (let z = 0; z < CONFIG.CHUNK_SIZE; z++) {
                for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
                    const block = this.blocks[this.getIndex(x, y, z)];
                    if (block === BLOCKS.AIR) continue;

                    const wx = this.x * CONFIG.CHUNK_SIZE + x;
                    const wy = y;
                    const wz = this.z * CONFIG.CHUNK_SIZE + z;

                    const checkBlock = (lx, ly, lz) => {
                        if (ly < 0 || ly >= CONFIG.CHUNK_HEIGHT) return BLOCKS.AIR;
                        const cx = Math.floor((this.x * CONFIG.CHUNK_SIZE + lx) / CONFIG.CHUNK_SIZE);
                        const cz = Math.floor((this.z * CONFIG.CHUNK_SIZE + lz) / CONFIG.CHUNK_SIZE);
                        const chunk = this.world.chunks.get(`${cx},${cz}`);
                        if (!chunk) return BLOCKS.AIR;
                        const localLx = ((this.x * CONFIG.CHUNK_SIZE + lx) % CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
                        const localLz = ((this.z * CONFIG.CHUNK_SIZE + lz) % CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
                        return chunk.blocks[chunk.getIndex(localLx, ly, localLz)];
                    };

                    // TOP
                    if (y + 1 >= CONFIG.CHUNK_HEIGHT || this.blocks[this.getIndex(x, y + 1, z)] === BLOCKS.AIR) {
                        const texName = this.getTextureForFace(block, 'top');
                        this.addQuad(geometries[texName], [wx, wy + 1, wz], [wx + 1, wy + 1, wz], 
                            [wx + 1, wy + 1, wz + 1], [wx, wy + 1, wz + 1]);
                    }
                    
                    // BOTTOM
                    if (y === 0 || this.blocks[this.getIndex(x, y - 1, z)] === BLOCKS.AIR) {
                        const texName = this.getTextureForFace(block, 'bottom');
                        this.addQuad(geometries[texName], [wx, wy, wz], [wx, wy, wz + 1], 
                            [wx + 1, wy, wz + 1], [wx + 1, wy, wz]);
                    }
                    
                    // NORTH
                    if (z === CONFIG.CHUNK_SIZE - 1) {
                        if (checkBlock(x, y, z + 1) === BLOCKS.AIR) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy + 1, wz + 1], 
                                [wx + 1, wy + 1, wz + 1], [wx + 1, wy, wz + 1], true);
                        }
                    } else if (this.blocks[this.getIndex(x, y, z + 1)] === BLOCKS.AIR) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy + 1, wz + 1], 
                            [wx + 1, wy + 1, wz + 1], [wx + 1, wy, wz + 1], true);
                    }
                    
                    // SOUTH
                    if (z === 0) {
                        if (checkBlock(x, y, z - 1) === BLOCKS.AIR) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy + 1, wz], 
                                [wx, wy + 1, wz], [wx, wy, wz], true);
                        }
                    } else if (this.blocks[this.getIndex(x, y, z - 1)] === BLOCKS.AIR) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy + 1, wz], 
                            [wx, wy + 1, wz], [wx, wy, wz], true);
                    }
                    
                    // EAST
                    if (x === CONFIG.CHUNK_SIZE - 1) {
                        if (checkBlock(x + 1, y, z) === BLOCKS.AIR) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy, wz + 1], 
                                [wx + 1, wy + 1, wz + 1], [wx + 1, wy + 1, wz]);
                        }
                    } else if (this.blocks[this.getIndex(x + 1, y, z)] === BLOCKS.AIR) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy, wz + 1], 
                            [wx + 1, wy + 1, wz + 1], [wx + 1, wy + 1, wz]);
                    }
                    
                    // WEST
                    if (x === 0) {
                        if (checkBlock(x - 1, y, z) === BLOCKS.AIR) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy, wz], 
                                [wx, wy + 1, wz], [wx, wy + 1, wz + 1]);
                        }
                    } else if (this.blocks[this.getIndex(x - 1, y, z)] === BLOCKS.AIR) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy, wz], 
                            [wx, wy + 1, wz], [wx, wy + 1, wz + 1]);
                    }
                }
            }
        }

        // Twórz meshes dla każdej tekstury
        for (const [texName, geo] of Object.entries(geometries)) {
            if (geo.vertices.length === 0) continue;

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(geo.vertices, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(geo.uvs, 2));
            geometry.setIndex(geo.indices);
            geometry.computeVertexNormals();

            const texture = this.textureManager.textures[texName];
            const material = new THREE.MeshLambertMaterial({ 
                map: texture,
                side: THREE.FrontSide
            });

            const mesh = new THREE.Mesh(geometry, material);
            this.scene.add(mesh);
            this.meshes.push(mesh);
        }
    }

    getTextureForFace(blockType, face) {
        switch(blockType) {
            case 1: // GRASS
                if (face === 'top') return 'grass_top_biome_plains';
                if (face === 'bottom') return 'dirt';
                return 'grass_side_biome_plains';
            case 2: // DIRT
                return 'dirt';
            case 3: // STONE
                return 'stone';
            case 4: // WOOD
                if (face === 'top' || face === 'bottom') return 'log_oak_top';
                return 'log_oak';
            case 5: // LEAVES
                return 'leaves_oak_biome_plains';
            default:
                return 'dirt';
        }
    }

    addQuad(geo, v0, v1, v2, v3, rotateUV = false) {
        const startIndex = geo.count;
        
        geo.vertices.push(...v0, ...v1, ...v2, ...v3);
        
        // UV: normalnie [0,0], [1,0], [1,1], [0,1]
        // Rotacja o -90st: [1,0], [1,1], [0,1], [0,0]
        if (rotateUV) {
            geo.uvs.push(1, 0, 1, 1, 0, 1, 0, 0);
        } else {
            geo.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        }
        
        geo.indices.push(
            startIndex, startIndex + 2, startIndex + 1,
            startIndex, startIndex + 3, startIndex + 2
        );
        
        geo.count += 4;
    }

    rebuildMesh() {
        this.buildMesh();
    }
}