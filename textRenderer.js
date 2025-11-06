// textRenderer.js - Uniwersalny renderer tekstu dla całej gry
// Używany przez: liczby bloków (hotbar/inventory), chat, etc.

export class TextRenderer {
    constructor() {
        this.fontAtlas = null; // ascii.png atlas
        this.charMap = this.createCharacterMap(); // Mapa znaków
        this.canvasCache = {}; // Cache scaled textów
        this.fontLoaded = false;

        // Promise that resolves when font is loaded
        this.loadingPromise = this.loadFontAtlas();
    }

    createCharacterMap() {
        // Wszystkie znaki ASCII 0-255 w siatce 16x16
        const charMap = {};

        for (let charIndex = 0; charIndex < 256; charIndex++) {
            const gridX = charIndex % 16;
            const gridY = Math.floor(charIndex / 16);
            const x = gridX * 8;
            const y = gridY * 8;

            if (charIndex >= 32 && charIndex < 127) {
                const char = String.fromCharCode(charIndex);
                charMap[char] = { x, y, width: 8 };
            } else if (charIndex < 256) {
                charMap[charIndex] = { x, y, width: 8 };
            }
        }

        return charMap;
    }

    loadFontAtlas() {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.fontAtlas = img;
                this.fontLoaded = true;
                console.log('✓ TextRenderer font atlas loaded');

                // Zmierz szerokości znaków
                if (this.charMap) {
                    this.measureCharacterWidths();
                }

                resolve();
            };
            img.onerror = () => {
                console.warn('✗ Failed to load font atlas');
                resolve();
            };
            img.src = './assets/minecraft/textures/font/ascii.png';
        });
    }

    measureCharacterWidths() {
        if (!this.fontAtlas) return;

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 8;
            canvas.height = 8;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            for (const [key, charData] of Object.entries(this.charMap)) {
                ctx.clearRect(0, 0, 8, 8);
                ctx.drawImage(
                    this.fontAtlas,
                    charData.x, charData.y, 8, 8,
                    0, 0, 8, 8
                );

                const imgData = ctx.getImageData(0, 0, 8, 8);
                const data = imgData.data;

                let maxX = 0;
                for (let x = 7; x >= 0; x--) {
                    let hasPixel = false;
                    for (let y = 0; y < 8; y++) {
                        const index = (y * 8 + x) * 4 + 3;
                        if (data[index] > 0) {
                            hasPixel = true;
                            break;
                        }
                    }
                    if (hasPixel) {
                        maxX = x + 1;
                        break;
                    }
                }

                charData.width = Math.max(1, maxX);
            }
        } catch (e) {
            console.warn('Could not measure character widths:', e);
        }
    }

    // Rysuj tekst na canvas context (DOKŁADNIE JAK LICZBY!)
    drawText(ctx, text, x, y, scale = 1, shadowConfig = null) {
        if (!this.fontAtlas || !this.fontLoaded) {
            console.warn('Font atlas not ready');
            return;
        }

        x = Math.round(x);
        y = Math.round(y);

        const digitSize = 8;
        let currentX = x;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charData = this.charMap[char];

            if (!charData) continue;

            // Jeśli jest shadow config - rysuj cień (IDENTYCZNIE JAK LICZBY!)
            if (shadowConfig) {
                // Stwórz temp canvas z shadow kolorem (DOKŁADNIE JAK W LICZBACH!)
                const shadowCanvas = document.createElement('canvas');
                shadowCanvas.width = digitSize;
                shadowCanvas.height = digitSize;
                const shadowCtx = shadowCanvas.getContext('2d');
                shadowCtx.imageSmoothingEnabled = false;

                // Narysuj znaki na tymczasowym canvasie
                shadowCtx.drawImage(
                    this.fontAtlas,
                    charData.x, charData.y, digitSize, digitSize,
                    0, 0, digitSize, digitSize
                );

                // Zmień kolor na kolor cienia (IDENTYCZNIE JAK W LICZBACH!)
                const imgData = shadowCtx.getImageData(0, 0, digitSize, digitSize);
                const data = imgData.data;
                const shadowR = (shadowConfig.color >> 16) & 0xff;
                const shadowG = (shadowConfig.color >> 8) & 0xff;
                const shadowB = shadowConfig.color & 0xff;

                for (let j = 0; j < data.length; j += 4) {
                    if (data[j + 3] > 0) {
                        data[j] = shadowR;
                        data[j + 1] = shadowG;
                        data[j + 2] = shadowB;
                    }
                }
                shadowCtx.putImageData(imgData, 0, 0);

                // Rysuj cień na głównym canvasie (IDENTYCZNIE JAK W LICZBACH!)
                ctx.drawImage(
                    shadowCanvas,
                    Math.round(currentX + shadowConfig.offsetX * scale),
                    Math.round(y + shadowConfig.offsetY * scale),
                    digitSize * scale,
                    digitSize * scale
                );
            }

            // Rysuj białą znak (IDENTYCZNIE JAK W LICZBACH!)
            ctx.drawImage(
                this.fontAtlas,
                charData.x, charData.y, digitSize, digitSize,
                Math.round(currentX),
                y,
                digitSize * scale,
                digitSize * scale
            );

            // Przejdź do następnego znaku
            const charWidth = charData.width || digitSize;
            currentX += (charWidth + 1) * scale;
        }
    }

    // Pobierz główny canvas (biały tekst) z cache
    getMainCanvas(charData, scale = 1) {
        const cacheKey = `main_${charData.x}_${charData.y}_${scale}`;

        if (this.canvasCache[cacheKey]) {
            return this.canvasCache[cacheKey];
        }

        const digitSize = 8;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = digitSize;
        tempCanvas.height = digitSize;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = false;

        // Wyciągnij znak z atlasu
        tempCtx.drawImage(
            this.fontAtlas,
            charData.x, charData.y, digitSize, digitSize,
            0, 0, digitSize, digitSize
        );

        // Stwórz scaled canvas
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = digitSize * scale;
        scaledCanvas.height = digitSize * scale;
        const scaledCtx = scaledCanvas.getContext('2d');
        scaledCtx.imageSmoothingEnabled = false;

        // Rysuj scaled (drawImage - jak liczby!)
        scaledCtx.drawImage(
            tempCanvas,
            0, 0, digitSize, digitSize,
            0, 0, digitSize * scale, digitSize * scale
        );

        this.canvasCache[cacheKey] = scaledCanvas;
        return scaledCanvas;
    }

    // Pobierz shadow canvas z cache
    getShadowCanvas(charData, scale = 1, shadowColor = 0x3f3f3f) {
        const cacheKey = `shadow_${charData.x}_${charData.y}_${scale}_${shadowColor}`;

        if (this.canvasCache[cacheKey]) {
            return this.canvasCache[cacheKey];
        }

        const digitSize = 8;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = digitSize;
        tempCanvas.height = digitSize;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = false;

        // Wyciągnij znak z atlasu
        tempCtx.drawImage(
            this.fontAtlas,
            charData.x, charData.y, digitSize, digitSize,
            0, 0, digitSize, digitSize
        );

        // Zmień kolor na shadow
        const imgData = tempCtx.getImageData(0, 0, digitSize, digitSize);
        const data = imgData.data;
        const shadowR = (shadowColor >> 16) & 0xff;
        const shadowG = (shadowColor >> 8) & 0xff;
        const shadowB = shadowColor & 0xff;

        for (let j = 0; j < data.length; j += 4) {
            if (data[j + 3] > 0) {
                data[j] = shadowR;
                data[j + 1] = shadowG;
                data[j + 2] = shadowB;
            }
        }
        tempCtx.putImageData(imgData, 0, 0);

        // Stwórz scaled canvas
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = digitSize * scale;
        scaledCanvas.height = digitSize * scale;
        const scaledCtx = scaledCanvas.getContext('2d');
        scaledCtx.imageSmoothingEnabled = false;

        // Rysuj scaled (drawImage - jak liczby!)
        scaledCtx.drawImage(
            tempCanvas,
            0, 0, digitSize, digitSize,
            0, 0, digitSize * scale, digitSize * scale
        );

        this.canvasCache[cacheKey] = scaledCanvas;
        return scaledCanvas;
    }

    // Oczyść cache
    clearCache() {
        this.canvasCache = {};
    }
}
