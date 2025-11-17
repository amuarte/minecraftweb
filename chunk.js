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

        // Bounding sphere dla frustum culling
        this.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(
                this.x * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE / 2,
                CONFIG.CHUNK_HEIGHT / 2,
                this.z * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE / 2
            ),
            Math.sqrt(CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_HEIGHT * CONFIG.CHUNK_HEIGHT) * 0.6
        );

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
            if (Array.isArray(m.material)) {
                m.material.forEach(mat => mat.dispose());
            } else {
                m.material.dispose();
            }
        });
        this.meshes = [];

        // Dwie główne geometrie: opaque i transparent
        // To zmniejszy draw calls z ~9 per chunk do ~2 per chunk!
        const opaqueGeo = { vertices: [], uvs: [], indices: [], count: 0, groups: [] };
        const transparentGeo = { vertices: [], uvs: [], indices: [], count: 0, groups: [] };

        // Mapowanie tekstur do indeksów materiałów
        const textureNames = [
            'grass_top_biome_plains', 'grass_side_biome_plains', 'dirt', 'stone',
            'log_oak', 'log_oak_top', 'planks_oak', 'leaves_oak_biome_plains', 'glass'
        ];
        const texNameToIndex = {};
        textureNames.forEach((name, idx) => { texNameToIndex[name] = idx; });

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

                    // Wybierz target geometry (opaque lub transparent)
                    const isTransparentBlock = block === BLOCKS.GLASS || block === BLOCKS.LEAVES;
                    const targetGeo = isTransparentBlock ? transparentGeo : opaqueGeo;

                    // TOP
                    if (y + 1 >= CONFIG.CHUNK_HEIGHT) {
                        const texName = this.getTextureForFace(block, 'top');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx, wy + 1, wz], [wx + 1, wy + 1, wz],
                            [wx + 1, wy + 1, wz + 1], [wx, wy + 1, wz + 1], false);
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y + 1, z)])) {
                        const texName = this.getTextureForFace(block, 'top');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx, wy + 1, wz], [wx + 1, wy + 1, wz],
                            [wx + 1, wy + 1, wz + 1], [wx, wy + 1, wz + 1], false);
                    }

                    // BOTTOM
                    if (y === 0) {
                        const texName = this.getTextureForFace(block, 'bottom');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx, wy, wz], [wx, wy, wz + 1],
                            [wx + 1, wy, wz + 1], [wx + 1, wy, wz], false);
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y - 1, z)])) {
                        const texName = this.getTextureForFace(block, 'bottom');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx, wy, wz], [wx, wy, wz + 1],
                            [wx + 1, wy, wz + 1], [wx + 1, wy, wz], false);
                    }

                    // NORTH
                    if (z === CONFIG.CHUNK_SIZE - 1) {
                        if (this.shouldRenderFace(block, checkBlock(x, y, z + 1))) {
                            const texName = this.getTextureForFace(block, 'side');
                            const matIndex = texNameToIndex[texName] || 0;
                            this.addQuadToMerged(targetGeo, matIndex, [wx, wy, wz + 1], [wx, wy + 1, wz + 1],
                                [wx + 1, wy + 1, wz + 1], [wx + 1, wy, wz + 1], true);
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y, z + 1)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx, wy, wz + 1], [wx, wy + 1, wz + 1],
                            [wx + 1, wy + 1, wz + 1], [wx + 1, wy, wz + 1], true);
                    }

                    // SOUTH
                    if (z === 0) {
                        if (this.shouldRenderFace(block, checkBlock(x, y, z - 1))) {
                            const texName = this.getTextureForFace(block, 'side');
                            const matIndex = texNameToIndex[texName] || 0;
                            this.addQuadToMerged(targetGeo, matIndex, [wx + 1, wy, wz], [wx + 1, wy + 1, wz],
                                [wx, wy + 1, wz], [wx, wy, wz], true);
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x, y, z - 1)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx + 1, wy, wz], [wx + 1, wy + 1, wz],
                            [wx, wy + 1, wz], [wx, wy, wz], true);
                    }

                    // EAST
                    if (x === CONFIG.CHUNK_SIZE - 1) {
                        if (this.shouldRenderFace(block, checkBlock(x + 1, y, z))) {
                            const texName = this.getTextureForFace(block, 'side');
                            const matIndex = texNameToIndex[texName] || 0;
                            this.addQuadToMerged(targetGeo, matIndex, [wx + 1, wy, wz], [wx + 1, wy, wz + 1],
                                [wx + 1, wy + 1, wz + 1], [wx + 1, wy + 1, wz], false);
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x + 1, y, z)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx + 1, wy, wz], [wx + 1, wy, wz + 1],
                            [wx + 1, wy + 1, wz + 1], [wx + 1, wy + 1, wz], false);
                    }

                    // WEST
                    if (x === 0) {
                        if (this.shouldRenderFace(block, checkBlock(x - 1, y, z))) {
                            const texName = this.getTextureForFace(block, 'side');
                            const matIndex = texNameToIndex[texName] || 0;
                            this.addQuadToMerged(targetGeo, matIndex, [wx, wy, wz + 1], [wx, wy, wz],
                                [wx, wy + 1, wz], [wx, wy + 1, wz + 1], false);
                        }
                    } else if (this.shouldRenderFace(block, this.blocks[this.getIndex(x - 1, y, z)])) {
                        const texName = this.getTextureForFace(block, 'side');
                        const matIndex = texNameToIndex[texName] || 0;
                        this.addQuadToMerged(targetGeo, matIndex, [wx, wy, wz + 1], [wx, wy, wz],
                            [wx, wy + 1, wz], [wx, wy + 1, wz + 1], false);
                    }
                }
            }
        }

        // Stwórz materiały dla wszystkich tekstur
        const materials = textureNames.map(texName => {
            const texture = this.textureManager.textures[texName];
            const isTransparent = texName === 'glass' || texName.includes('leaves');
            return new THREE.MeshLambertMaterial({
                map: texture,
                side: THREE.FrontSide,
                transparent: isTransparent,
                alphaTest: isTransparent ? 0.5 : 0
            });
        });

        // Stwórz mesh dla opaque bloków
        if (opaqueGeo.vertices.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(opaqueGeo.vertices, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(opaqueGeo.uvs, 2));
            geometry.setIndex(opaqueGeo.indices);

            // Dodaj groups dla multi-material
            opaqueGeo.groups.forEach(group => {
                geometry.addGroup(group.start, group.count, group.materialIndex);
            });

            geometry.computeVertexNormals();

            const mesh = new THREE.Mesh(geometry, materials);
            this.scene.add(mesh);
            this.meshes.push(mesh);
        }

        // Stwórz mesh dla transparent bloków
        if (transparentGeo.vertices.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(transparentGeo.vertices, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(transparentGeo.uvs, 2));
            geometry.setIndex(transparentGeo.indices);

            // Dodaj groups dla multi-material
            transparentGeo.groups.forEach(group => {
                geometry.addGroup(group.start, group.count, group.materialIndex);
            });

            geometry.computeVertexNormals();

            const mesh = new THREE.Mesh(geometry, materials);
            this.scene.add(mesh);
            this.meshes.push(mesh);
        }
    }

    getTextureForFace(blockType, face) {
        // Pobierz teksturę z rejestru bloków
        return getTextureForFace(blockType, face);
    }

    // Stara metoda - zostaje dla kompatybilności
    addQuad(geo, v0, v1, v2, v3, rotateUV = false, face = 'top') {
        const startIndex = geo.count;

        geo.vertices.push(...v0, ...v1, ...v2, ...v3);

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

    // Nowa metoda dla merged geometry z material groups
    addQuadToMerged(geo, materialIndex, v0, v1, v2, v3, rotateUV = false) {
        const startIndex = geo.count;
        const indexStart = geo.indices.length;

        geo.vertices.push(...v0, ...v1, ...v2, ...v3);

        if (rotateUV) {
            geo.uvs.push(1, 0, 1, 1, 0, 1, 0, 0);
        } else {
            geo.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        }

        geo.indices.push(
            startIndex, startIndex + 2, startIndex + 1,
            startIndex, startIndex + 3, startIndex + 2
        );

        // Dodaj lub zaktualizuj group dla tego materiału
        const lastGroup = geo.groups[geo.groups.length - 1];
        if (lastGroup && lastGroup.materialIndex === materialIndex) {
            // Rozszerz ostatnią grupę
            lastGroup.count += 6; // 6 indices per quad (2 triangles)
        } else {
            // Stwórz nową grupę
            geo.groups.push({
                start: indexStart,
                count: 6,
                materialIndex: materialIndex
            });
        }

        geo.count += 4;
    }

    rebuildMesh() {
        this.buildMesh();
    }

    // Sprawdź czy chunk jest widoczny w frustum kamery
    isVisibleInFrustum(frustum) {
        return frustum.intersectsSphere(this.boundingSphere);
    }

    // Ustaw widoczność wszystkich meshów chunka
    setVisible(visible) {
        this.meshes.forEach(mesh => {
            mesh.visible = visible;
        });
    }

    // Zwolnij zasoby chunka
    dispose() {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(mat => mat.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });
        this.meshes = [];
    }
}

export { TERRAIN_GENERATORS };