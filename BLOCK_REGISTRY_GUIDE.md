# Adding New Blocks - Quick Reference Guide

After the refactoring, adding new blocks to your Minecraft web project is **super simple and quick** (mega proste i szybkie)!

## How to Add a New Block

You only need to modify **ONE file**: `config.js`

### Step 1: Add Block Entry to BLOCKS_REGISTRY

Open `config.js` and add a new entry to the `BLOCKS_REGISTRY` object:

```javascript
7: {
    id: 7,
    name: 'SAND',
    displayName: 'SAND',
    color: 0xF4A460,
    sound: 'sand',
    textures: {
        top: 'sand',
        side: 'sand',
        bottom: 'sand'
    },
    isometric: './assets/minecraft/textures/isometric/sand.png'
}
```

### What Each Property Means:

- **id**: Unique block ID number (increment from the highest existing ID)
- **name**: Internal block name (used in code, uppercase, no spaces)
- **displayName**: Display name shown in UI (can have spaces)
- **color**: Hex color code for the block (used in some rendering contexts)
- **sound**: Material sound type - one of: `'grass'`, `'dirt'`, `'stone'`, `'wood'`, `'leaves'`, or `null`
- **textures**: Object with three faces:
  - **top**: Texture name for top face
  - **side**: Texture name for side faces
  - **bottom**: Texture name for bottom face
- **isometric**: Path to isometric (3D-looking) PNG image for hotbar display

### Step 2: Add Texture Files

Make sure you have the required texture files:

1. **Block texture**: `./assets/minecraft/textures/blocks/{textureName}.png`
2. **Isometric icon**: `./assets/minecraft/textures/isometric/{blockName}.png`

### Example: Adding SAND Block

1. Add entry to `BLOCKS_REGISTRY` in config.js (as shown above)
2. Create texture file: `./assets/minecraft/textures/blocks/sand.png`
3. Create isometric file: `./assets/minecraft/textures/isometric/sand.png`
4. Done! ✓

The following is now automatic:
- ✓ Block will appear in hotbar
- ✓ Texture will be loaded and rendered
- ✓ Step sounds will use the specified material
- ✓ Block name will display in UI
- ✓ Block can be placed in the world

## How the Refactoring Works

### Old System (Before Refactoring)

Adding a block required editing **6+ files**:
1. config.js - Add BLOCKS, BLOCK_TEXTURES, BLOCK_COLORS
2. chunk.js - Add getTextureForFace case
3. guiManager.js - Add blockData entry
4. textures.js - Add texture loading
5. soundManager.js - Add sound mapping
6. ui.js - Add block name

### New System (After Refactoring)

- **Single source of truth**: `BLOCKS_REGISTRY` in config.js
- **Automatic generation**: All other systems read from the registry
- **Helper functions**: Centralized functions for querying block properties:
  - `getBlockInfo(blockId)` - Get entire block object
  - `getBlockName(blockId)` - Get block name
  - `getBlockColor(blockId)` - Get block color
  - `getBlockSound(blockId)` - Get sound material
  - `getBlockTextures(blockId)` - Get texture object
  - `getBlockIsometricPath(blockId)` - Get isometric path
  - `getTextureForFace(blockId, face)` - Get specific texture for a face
  - `getMaterialFromBlockId(blockId)` - Get step sound material

## Files Updated

1. **config.js**
   - Added `BLOCKS_REGISTRY` with all block definitions
   - Auto-generates BLOCKS, BLOCK_TEXTURES, BLOCK_COLORS
   - Added helper functions for querying block properties

2. **soundManager.js**
   - Now uses `getMaterialFromBlockId()` from config

3. **chunk.js**
   - Now uses `getTextureForFace()` from config

4. **textures.js**
   - Dynamically generates texture list from BLOCKS_REGISTRY

5. **guiManager.js**
   - Dynamically generates blockData from BLOCKS_REGISTRY

6. **ui.js**
   - Uses BLOCKS_REGISTRY for block name display

## Benefits

✓ **Simple**: Add blocks with ONE entry in ONE file
✓ **Quick**: No need to edit 6+ files
✓ **Maintainable**: Single source of truth
✓ **Scalable**: Easy to add 50+ blocks without complexity
✓ **Error-free**: No forgotten edits across multiple files

---

## Lighting System - Minecraft 1.8.8 Java Edition

### Jak Działa Oświetlenie

Projekt ma **identyczne oświetlenie jak Minecraft 1.8.8 Java**:

#### Sky Light (0-15)
- Rozprzestrzenia się z góry na dół przy użyciu flood fill algorithm
- Świecące bloki (SKY = 15) rozprzestrzeniają do sąsiednich bloków AIR
- Światło zmniejsza się o 1 na każdą sąsiednią pozycję
- Nieprzezroczyste bloki zatrzymują sky light

#### Smooth Lighting
- Każdy wierzchołek ma osobne brightness value
- Oblicza się na podstawie sky light w danej pozycji
- Daje efekt "miękkich" oświetlenia zamiast płaskiego (Ambient Occlusion effect)

#### Vertex Colors (Mega Wydajne)
- Vertex coloring zamiast lightmap texture
- Mnożymy teksturę przez brightness vertex colors
- Brak shader overhead - pure geometry colors
- Identyczne jak Minecraft - vertex luminosity multiplication

### Jak Działa Implementacja

```javascript
// Light data w chunku
skyLightData = new Uint8Array(...)   // 0-15 dla każdego voxela
blockLightData = new Uint8Array(...) // 0-15 dla każdego voxela

// Flood fill rozprzestrzenia światło
floodFillLight(lightType) {
    while (queue.length > 0) {
        // Rozprzestrzeniaj do sąsiednich AIR bloków
        // Zmniejszaj wartość o 1 na każdy blok
    }
}

// Vertex colors w mesh
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
material.vertexColors = true;
```

### Wydajność - Mega Szybko!

✓ **Uint8Array** - 4 bity per voxel (0-15 wartości)
✓ **Vertex colors** - Brak shader computations w runtime
✓ **Flood fill** - Jedna pass initialization (linear time)
✓ **Cached light values** - Brak rekomputacji per frame

**Result**: Light calculations cost je prawie zero! Same jak Minecraft.

---

**Mega proste i szybkie!** 🎮