    // config.js - Konfiguracja gry
    export const CONFIG = {
        CHUNK_SIZE: 16,
        CHUNK_HEIGHT: 64,
        RENDER_DISTANCE: 3,
        BLOCK_SIZE: 1,
        HOTBAR_SIZE: 9
    };

    // Dynamiczny hotbar + inventory - łatwo dodawaj nowe bloki!
    // Zmień to po prostu na array ID bloków jakie mają być w hotbarze
    // Elementy 0-8 = hotbar (na dole)
    // Elementy 9-35 = inventory (27 slotów na górze w 9x3)
    // 0 = pusty slot
    // Struktura: { id: blockID, count: liczba } lub null (pusty slot)
    export const HOTBAR_BLOCKS = [
        // Hotbar (9 slotów na dole)
        { id: 1, count: 1 }, { id: 2, count: 1 }, { id: 3, count: 1 }, { id: 4, count: 1 }, { id: 5, count: 1 }, { id: 6, count: 1 }, { id: 7, count: 1 }, null, null,
        // Inventory (27 slotów na górze: 9 kolumn × 3 rzędy)
        null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null, null
    ];

    // Centralny rejestr bloków - WSZYSTKIE WŁAŚCIWOŚCI W JEDNYM MIEJSCU!
    // Aby dodać nowy blok, wystarczy dodać tu JEDEN wpis
    const BLOCKS_REGISTRY = {
        0: {
            id: 0,
            name: 'AIR',
            displayName: 'AIR',
            color: 0x000000,
            sound: null,
            textures: { top: null, side: null, bottom: null },
            isometric: null
        },
        1: {
            id: 1,
            name: 'GRASS',
            displayName: 'GRASS',
            color: 0x7CFC00,
            sound: 'grass',
            textures: {
                top: 'grass_top_biome_plains',
                side: 'grass_side_biome_plains',
                bottom: 'dirt'
            },
            isometric: './assets/minecraft/textures/isometric/grass.png'
        },
        2: {
            id: 2,
            name: 'DIRT',
            displayName: 'DIRT',
            color: 0x8B4513,
            sound: 'dirt',
            textures: {
                top: 'dirt',
                side: 'dirt',
                bottom: 'dirt'
            },
            isometric: './assets/minecraft/textures/isometric/dirt.png'
        },
        3: {
            id: 3,
            name: 'STONE',
            displayName: 'STONE',
            color: 0x808080,
            sound: 'stone',
            textures: {
                top: 'stone',
                side: 'stone',
                bottom: 'stone'
            },
            isometric: './assets/minecraft/textures/isometric/stone.png'
        },
        4: {
            id: 4,
            name: 'WOOD',
            displayName: 'WOOD',
            color: 0xDEB887,
            sound: 'wood',
            textures: {
                top: 'log_oak_top',
                side: 'log_oak',
                bottom: 'log_oak_top'
            },
            isometric: './assets/minecraft/textures/isometric/log_oak.png'
        },
        5: {
            id: 5,
            name: 'LEAVES',
            displayName: 'LEAVES',
            color: 0x228B22,
            sound: 'leaves',
            textures: {
                top: 'leaves_oak_biome_plains',
                side: 'leaves_oak_biome_plains',
                bottom: 'leaves_oak_biome_plains'
            },
            isometric: './assets/minecraft/textures/isometric/leaves_oak.png'
        },
        6: {
            id: 6,
            name: 'PLANKS',
            displayName: 'PLANKS',
            color: 0xC19A6B,
            sound: 'wood',
            textures: {
                top: 'planks_oak',
                side: 'planks_oak',
                bottom: 'planks_oak'
            },
            isometric: './assets/minecraft/textures/isometric/planks_oak.png'
        },
        7: {
            id: 7,
            name: 'GLASS',
            displayName: 'GLASS',
            color: 0xB4E7FF,
            sound: 'stone',
            textures: {
                top: 'glass',
                side: 'glass',
                bottom: 'glass'
            },
            isometric: './assets/minecraft/textures/isometric/glass.png'
        }
    };

    // Generuj BLOCKS z rejestru
    export const BLOCKS = {};
    for (const block of Object.values(BLOCKS_REGISTRY)) {
        BLOCKS[block.name] = block.id;
    }

    // Generuj BLOCK_TEXTURES z rejestru
    export const BLOCK_TEXTURES = {};
    for (const block of Object.values(BLOCKS_REGISTRY)) {
        if (block.id > 0) {
            BLOCK_TEXTURES[block.id] = {
                name: block.name,
                textures: block.textures
            };
        }
    }

    // Generuj BLOCK_COLORS z rejestru
    export const BLOCK_COLORS = {};
    for (const block of Object.values(BLOCKS_REGISTRY)) {
        if (block.id > 0) {
            BLOCK_COLORS[block.id] = block.color;
        }
    }

    // Eksportuj rejestr dla dostępu w innych modułach
    export { BLOCKS_REGISTRY };

    // === HELPER FUNCTIONS - Zapytania do rejestru bloków ===
    export function getBlockInfo(blockId) {
        return BLOCKS_REGISTRY[blockId] || null;
    }

    export function getBlockName(blockId) {
        return BLOCKS_REGISTRY[blockId]?.name || 'AIR';
    }

    export function getBlockColor(blockId) {
        return BLOCKS_REGISTRY[blockId]?.color || 0x000000;
    }

    export function getBlockSound(blockId) {
        return BLOCKS_REGISTRY[blockId]?.sound || null;
    }

    export function getBlockTextures(blockId) {
        return BLOCKS_REGISTRY[blockId]?.textures || null;
    }

    export function getBlockIsometricPath(blockId) {
        return BLOCKS_REGISTRY[blockId]?.isometric || null;
    }

    // Pobierz teksturę dla konkretnej ściany bloku
    export function getTextureForFace(blockId, face) {
        const textures = getBlockTextures(blockId);
        if (!textures) return 'dirt';
        return textures[face] || 'dirt';
    }

    // Zwróć material dla kroku (do soundManagera)
    export function getMaterialFromBlockId(blockId) {
        const sound = getBlockSound(blockId);
        if (sound === 'grass') return 'grass';
        if (sound === 'dirt') return 'dirt';
        if (sound === 'stone') return 'stone';
        if (sound === 'wood') return 'wood';
        if (sound === 'leaves') return 'leaves';
        return null;
    }