// config.js - Konfiguracja gry
export const CONFIG = {
    CHUNK_SIZE: 16,
    CHUNK_HEIGHT: 64,
    RENDER_DISTANCE: 3,
    BLOCK_SIZE: 1
};

export const BLOCKS = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5
};

export const BLOCK_TEXTURES = {
    1: { name: 'GRASS', uvs: [[0,0], [1,1], [2,0]] },
    2: { name: 'DIRT', uvs: [[2,0], [2,0], [2,0]] },
    3: { name: 'STONE', uvs: [[3,0], [3,0], [3,0]] },
    4: { name: 'WOOD', uvs: [[4,1], [4,0], [4,1]] },
    5: { name: 'LEAVES', uvs: [[5,0], [5,0], [5,0]] }
};

export const BLOCK_COLORS = {
    1: 0x7CFC00,
    2: 0x8B4513,
    3: 0x808080,
    4: 0xDEB887,
    5: 0x228B22
};