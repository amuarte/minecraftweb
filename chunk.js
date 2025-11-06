// chunk.js - Generowanie i renderowanie chunków
import { CONFIG, BLOCKS, getTextureForFace } from './config.js';

// System generatorów światów - dla kompatybilności wstecz
const TERRAIN_GENERATORS = {
    // Generator "classic" - pierwotny, płaski świat
    classic: (x, z, seed) => {
        const n = Math.sin(x * 0.1 + seed) * Math.cos(z * 0.1 + seed) * 5 +
                  Math.sin(x * 0.05 + seed) * Math.cos(z * 0.05 + seed) * 10;
        return Math.floor(n + CONFIG.CHUNK_HEIGHT / 2);
    },

    // Generator "hilly" - dramatyczne wzgórza i doliny
    hilly: (x, z, seed) => {
        const n1 = Math.sin(x * 0.05 + seed) * Math.cos(z * 0.05 + seed) * 15;
        const n2 = Math.sin(x * 0.02 + seed) * Math.cos(z * 0.02 + seed) * 20;
        const n3 = Math.sin(x * 0.15 + seed) * Math.cos(z * 0.15 + seed) * 8;
        const total = n1 + n2 + n3;
        return Math.floor(total + CONFIG.CHUNK_HEIGHT / 2);
    }
};

// Alias dla kompatybilności wstecz - "noise" mapuje na "classic"
function noise(x, z, seed = 0) {
    return TERRAIN_GENERATORS.classic(x, z, seed);
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
                const generator = TERRAIN_GENERATORS[this.world.generatorType] || TERRAIN_GENERATORS.classic;
                const height = generator(worldX, worldZ, this.world.seed);

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
                    // Light data (skyLightData, blockLightData) będzie ustawiana przez lighting system
                }
            }
        }
    }

    getIndex(x, y, z) {
        return x + z * CONFIG.CHUNK_SIZE + y * CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE;
    }

    // Sprawdź czy blok jest przezroczysty dla cullingu
    // AIR i GLASS są transparent dla cullingu
    // LEAVES mogą być przezroczyste
    isTransparentBlock(blockType) {
        return blockType === BLOCKS.AIR || blockType === BLOCKS.GLASS || blockType === BLOCKS.LEAVES;
    }

    // Sprawdź czy należy renderować ścianę
    // Renderuj jeśli sąsiad jest transparent dla cullingu
    // CHYBA ŻE to GLASS obok GLASS - wtedy nie renderuj
    shouldRenderFace(currentBlock, adjacentBlock) {
        // Glass obok glass: nie renderuj (specjalna reguła dla glass)
        if (currentBlock === BLOCKS.GLASS && adjacentBlock === BLOCKS.GLASS) {
            return false;
        }
        // Renderuj jeśli sąsiad jest transparent (AIR, GLASS, lub LEAVES)
        return this.isTransparentBlock(adjacentBlock);
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
            leaves_oak_biome_plains: { vertices: [], uvs: [], indices: [], count: 0 },
            planks_oak: { vertices: [], uvs: [], indices: [], count: 0 },
            glass: { vertices: [], uvs: [], indices: [], count: 0 }
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
                    if (y + 1 >= CONFIG.CHUNK_HEIGHT) {
                        const texName = this.getTextureForFace(block, 'top');
                        this.addQuad(geometries[texName], [wx, wy + 1, wz], [wx + 1, wy + 1, wz],
                            [wx + 1, wy + 1, wz + 1], [wx, wy + 1, wz + 1], false, 'top');
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y + 1, z)])) {
                        const texName = this.getTextureForFace(block, 'top');
                        this.addQuad(geometries[texName], [wx, wy + 1, wz], [wx + 1, wy + 1, wz],
                            [wx + 1, wy + 1, wz + 1], [wx, wy + 1, wz + 1], false, 'top');
                    }

                    // BOTTOM
                    if (y === 0) {
                        const texName = this.getTextureForFace(block, 'bottom');
                        this.addQuad(geometries[texName], [wx, wy, wz], [wx, wy, wz + 1],
                            [wx + 1, wy, wz + 1], [wx + 1, wy, wz], false, 'bottom');
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y - 1, z)])) {
                        const texName = this.getTextureForFace(block, 'bottom');
                        this.addQuad(geometries[texName], [wx, wy, wz], [wx, wy, wz + 1],
                            [wx + 1, wy, wz + 1], [wx + 1, wy, wz], false, 'bottom');
                    }

                    // NORTH
                    if (z === CONFIG.CHUNK_SIZE - 1) {
                        if (this.shouldRenderFace(block, checkBlock(x, y, z + 1))) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy + 1, wz + 1],
                                [wx + 1, wy + 1, wz + 1], [wx + 1, wy, wz + 1], true, 'north');
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y, z + 1)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy + 1, wz + 1],
                            [wx + 1, wy + 1, wz + 1], [wx + 1, wy, wz + 1], true, 'north');
                    }

                    // SOUTH
                    if (z === 0) {
                        if (this.shouldRenderFace(block, checkBlock(x, y, z - 1))) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy + 1, wz],
                                [wx, wy + 1, wz], [wx, wy, wz], true, 'south');
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y, z - 1)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy + 1, wz],
                            [wx, wy + 1, wz], [wx, wy, wz], true, 'south');
                    }

                    // EAST
                    if (x === CONFIG.CHUNK_SIZE - 1) {
                        if (this.shouldRenderFace(block, checkBlock(x + 1, y, z))) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy, wz + 1],
                                [wx + 1, wy + 1, wz + 1], [wx + 1, wy + 1, wz], false, 'east');
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x + 1, y, z)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx + 1, wy, wz], [wx + 1, wy, wz + 1],
                            [wx + 1, wy + 1, wz + 1], [wx + 1, wy + 1, wz], false, 'east');
                    }

                    // WEST
                    if (x === 0) {
                        if (this.shouldRenderFace(block, checkBlock(x - 1, y, z))) {
                            const texName = this.getTextureForFace(block, 'side');
                            this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy, wz],
                                [wx, wy + 1, wz], [wx, wy + 1, wz + 1], false, 'west');
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x - 1, y, z)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        this.addQuad(geometries[texName], [wx, wy, wz + 1], [wx, wy, wz],
                            [wx, wy + 1, wz], [wx, wy + 1, wz + 1], false, 'west');
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

            // Glass i leaves mają alpha channel - transparent material
            const isTransparent = texName === 'glass' || texName.includes('leaves');
            const isGlass = texName === 'glass';

            const material = new THREE.MeshLambertMaterial({
                map: texture,
                side: THREE.FrontSide, // Wszystkie bloki: tylko front side
                transparent: isTransparent,
                alphaTest: isTransparent ? 0.5 : 0
            });

            const mesh = new THREE.Mesh(geometry, material);
            this.scene.add(mesh);
            this.meshes.push(mesh);
        }
    }

    getTextureForFace(blockType, face) {
        // Pobierz teksturę z rejestru bloków
        return getTextureForFace(blockType, face);
    }

    addQuad(geo, v0, v1, v2, v3, rotateUV = false, face = 'top') {
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

export { TERRAIN_GENERATORS };