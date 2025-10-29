// textures.js - Zarządzanie teksturami i colormapą
import { BLOCKS } from './config.js';

export class TextureManager {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.textures = {};
        this.colormaps = {};
        this.canvases = {};
        this.loadingPromise = this.loadTextures();
    }

    async loadTextures() {
        const textureList = {
            stone: './assets/minecraft/textures/blocks/stone.png',
            dirt: './assets/minecraft/textures/blocks/dirt.png',
            leaves_oak_biome_plains: './assets/minecraft/textures/blocks/leaves_oak_biome_plains.png',
            log_oak: './assets/minecraft/textures/blocks/log_oak.png',
            log_oak_top: './assets/minecraft/textures/blocks/log_oak_top.png',
            grass_side_biome_plains: './assets/minecraft/textures/blocks/grass_side_biome_plains.png',
            grass_top_biome_plains: './assets/minecraft/textures/blocks/grass_top_biome_plains.png'
        };

        const promises = [];

        for (const [key, path] of Object.entries(textureList)) {
            promises.push(
                new Promise((resolve) => {
                    this.textureLoader.load(path, (texture) => {
                        texture.magFilter = THREE.NearestFilter;
                        texture.minFilter = THREE.NearestFilter;
                        this.textures[key] = texture;
                        resolve();
                    }, undefined, (err) => {
                        console.warn(`Failed to load texture: ${path}`, err);
                        resolve();
                    });
                })
            );
        }

        promises.push(
            new Promise((resolve) => {
                this.textureLoader.load('./assets/minecraft/textures/colormap/grass.png', (texture) => {
                    this.colormaps.grass = texture;
                    resolve();
                }, undefined, (err) => {
                    console.warn('Failed to load grass colormap', err);
                    resolve();
                });
            })
        );

        await Promise.all(promises);
    }

    getBlockTextures(blockType) {
        console.log('Getting textures for block:', blockType, 'Textures loaded:', Object.keys(this.textures));
        
        const textures = {
            top: this.textures.dirt || null,
            side: this.textures.dirt || null,
            bottom: this.textures.dirt || null
        };

        switch(blockType) {
            case 1: // GRASS
                textures.top = this.textures.grass_top_biome_plains || this.textures.dirt;
                textures.side = this.textures.grass_side_biome_plains || this.textures.dirt;
                textures.bottom = this.textures.dirt;
                break;
            case 2: // DIRT
                textures.top = this.textures.dirt;
                textures.side = this.textures.dirt;
                textures.bottom = this.textures.dirt;
                break;
            case 3: // STONE
                textures.top = this.textures.stone || this.textures.dirt;
                textures.side = this.textures.stone || this.textures.dirt;
                textures.bottom = this.textures.stone || this.textures.dirt;
                break;
            case 4: // WOOD
                textures.top = this.textures.log_oak_top || this.textures.dirt;
                textures.side = this.textures.log_oak || this.textures.dirt;
                textures.bottom = this.textures.log_oak_top || this.textures.dirt;
                break;
            case 5: // LEAVES
                textures.top = this.textures.leaves_oak_biome_plains || this.textures.dirt;
                textures.side = this.textures.leaves_oak_biome_plains || this.textures.dirt;
                textures.bottom = this.textures.leaves_oak_biome_plains || this.textures.dirt;
                break;
        }

        console.log('Returning textures:', textures);
        return textures;
    }

    getColoredTexture(textureName, colormapName, chunkX = 0, chunkZ = 0) {
        // Jeśli colormap nie załadowana, zwróć zwykłą teksturę
        if (!this.colormaps[colormapName]) {
            return this.textures[textureName];
        }

        const key = `${textureName}_${colormapName}_${chunkX}_${chunkZ}`;
        
        if (this.canvases[key]) {
            return this.canvases[key];
        }

        // Stwórz canvas dla kolorowanej tekstury
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');

        const baseTexture = this.textures[textureName];
        const colormap = this.colormaps[colormapName];

        if (!baseTexture || !colormap) {
            return this.textures[textureName];
        }

        // Rysuj bazową teksturę
        const baseCanvas = document.createElement('canvas');
        baseCanvas.width = baseTexture.image.width;
        baseCanvas.height = baseTexture.image.height;
        baseCanvas.getContext('2d').drawImage(baseTexture.image, 0, 0);

        // Pobierz kolor z colormappy
        const colormapCanvas = document.createElement('canvas');
        colormapCanvas.width = colormap.image.width;
        colormapCanvas.height = colormap.image.height;
        colormapCanvas.getContext('2d').drawImage(colormap.image, 0, 0);

        const colormapCtx = colormapCanvas.getContext('2d');
        
        // Normalizuj współrzędne (0-1 zamiast świata)
        const x = Math.abs(chunkX) % colormapCanvas.width;
        const z = Math.abs(chunkZ) % colormapCanvas.height;
        
        const colorData = colormapCtx.getImageData(x, z, 1, 1).data;
        const colorMultiplier = {
            r: colorData[0] / 255,
            g: colorData[1] / 255,
            b: colorData[2] / 255
        };

        // Aplikuj kolor do tekstury
        const baseData = baseCanvas.getContext('2d').getImageData(0, 0, baseCanvas.width, baseCanvas.height);
        const data = baseData.data;

        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] * colorMultiplier.r;     // R
            data[i + 1] = data[i + 1] * colorMultiplier.g; // G
            data[i + 2] = data[i + 2] * colorMultiplier.b; // B
            // A bez zmian
        }

        ctx.putImageData(baseData, 0, 0);
        ctx.drawImage(baseCanvas, 0, 0);

        // Konwertuj canvas na THREE.Texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        this.canvases[key] = texture;
        return texture;
    }
}