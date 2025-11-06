// guiManager.js - GUI Minecraft'owy z renderowaniem 3D bloków w hotbarze
import { BLOCKS_REGISTRY, HOTBAR_BLOCKS } from './config.js';
import { HotbarRenderer } from './hotbarRenderer.js';
import { ChatManager } from './chatManager.js';
import { TextRenderer } from './textRenderer.js';

export class GUIManager {
    constructor(world, player, textureManager) {
        this.world = world;
        this.player = player;
        this.textureManager = textureManager;
        this.hotbarRenderer = new HotbarRenderer(textureManager);
        this.textRenderer = new TextRenderer(); // Uniwersalny renderer tekstu!

        this.blockCanvases = {}; // Cache wyrenderowanych canvas-ów
        this.isReady = false;

        // === KONFIGURACJA LICZB - CENTRALNE ZARZĄDZANIE ===
        // Zarządzaj wyglądem liczb bloków w hotbarze i inventory z jednego miejsca
        // Zmień wartości tutaj, aby zaktualizować wszystkie lokalizacje jednocześnie
        this.itemCountConfig = {
            scale: 3,        // Rozmiar liczb (1 = normalny, 3 = 3x większy)
            offsetX: 15,     // Odlegość od prawej krawędzi slotu
            offsetY: 9      // Odlegość od dolnej krawędzi slotu
        };

        // === KONFIGURACJA CIENIA LICZB ===
        // Ustawienia dla cienia/odbicia tekstu liczb
        this.numberShadowConfig = {
            offsetX: 1,      // Przesunięcie cienia w prawo (pixele)
            offsetY: 1,      // Przesunięcie cienia w dół (pixele)
            color: 0x3f3f3f  // Kolor cienia (#3f3f3f = ciemnoszary)
        };

        // Hotbar editing - click-based system
        this.editingHotbar = false;
        this.activeBlockIndex = null; // Który blok porusza się za kursorem
        this.currentMouseX = 0;
        this.currentMouseY = 0;

        // Cache dla hotbaru - sprawdzaj czy coś się zmieniło
        this.lastHotbarState = JSON.stringify(HOTBAR_BLOCKS);
        this.lastSelectedIndex = -1;

        // Hover state dla inventory GUI
        this.hoveredSlotIndex = null; // Index sloту nad którym jest kursor
        this.hoveredTrashBin = false; // Czy kursor jest nad koshem

        // Wrapper dla HOTBAR_BLOCKS dostępu
        this._createHotbarProxy();

        // Font is now loaded by TextRenderer - no need to duplicate
        this.loadHotbarSelection();
        this.createHotbarContainer();
        this.createDraggingBlockElement();
        this.styleButtons();
        this.setupGlobalMouseTracking();
    }

    _createHotbarProxy() {
        // Proxy dla HOTBAR_BLOCKS - automatyczne konwertowanie
        this.getBlockId = (index) => {
            const slot = HOTBAR_BLOCKS[index];
            return ChatManager.getBlockId(slot);
        };

        this.setBlock = (index, slot) => {
            HOTBAR_BLOCKS[index] = slot;
        };
    }

    createDraggingBlockElement() {
        // Stwórz floating canvas dla poruszającego się bloku
        this.draggingBlockCanvas = document.createElement('canvas');
        this.draggingBlockCanvas.id = 'dragging-block-canvas';
        this.draggingBlockCanvas.width = 48;
        this.draggingBlockCanvas.height = 48;
        this.draggingBlockCanvas.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 10001;
            display: none;
            image-rendering: crisp-edges;
        `;
        document.body.appendChild(this.draggingBlockCanvas);

        // Stwórz GUI overlay container - wyśrodkowany flexbox
        this.guiOverlay = document.createElement('div');
        this.guiOverlay.id = 'creative-inventory-overlay';
        this.guiOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            display: none;
            justify-content: center;
            align-items: center;
            background: rgba(0, 0, 0, 0.5);
        `;
        document.body.appendChild(this.guiOverlay);

        // Załaduj GUI texture - przetnij element_0 (0, 0, 195x136)
        this.guiCanvas = document.createElement('canvas');
        this.guiCanvas.id = 'creative-inventory-canvas';
        this.guiCanvas.style.cssText = `
            display: block;
            image-rendering: crisp-edges;
            image-rendering: pixelated;
            margin: 0;
            padding: 0;
        `;

        this.guiTexture = new Image();
        this.guiTexture.onload = () => {
            // Element_0: pozycja (0,0) rozmiar 195x136
            this.elementX = 0;
            this.elementY = 0;
            this.elementWidth = 195;
            this.elementHeight = 136;
            this.guiScale = 3;

            // Ustaw canvas na rozmiar przycięcia skalowany
            this.guiCanvas.width = this.elementWidth * this.guiScale;
            this.guiCanvas.height = this.elementHeight * this.guiScale;

            console.log('✓ GUI texture loaded - element_0:', this.elementWidth, 'x', this.elementHeight, '→', this.elementWidth * this.guiScale, 'x', this.elementHeight * this.guiScale);

            // Narysuj inventory z blokami
            this.drawInventoryGUI();
        };
        this.guiTexture.src = './assets/minecraft/textures/gui/container/creative_inventory/tab_inventory.png';
        this.guiOverlay.appendChild(this.guiCanvas);

        // Dodaj listener dla kliknięć na inventory GUI hotbar
        this.guiCanvas.addEventListener('click', (e) => this.onInventoryHotbarClick(e));

        // Dodaj listener dla hovera na slotach
        this.guiCanvas.addEventListener('mousemove', (e) => this.onInventoryHover(e));
        this.guiCanvas.addEventListener('mouseleave', () => {
            this.hoveredSlotIndex = null;
            this.hoveredTrashBin = false;
            this.drawInventoryGUI();
        });
    }

    drawInventoryGUI() {
        // Rysuj GUI background + bloki z hotbaru i inventory
        const ctx = this.guiCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Narysuj GUI background (element_0)
        ctx.drawImage(
            this.guiTexture,
            this.elementX, this.elementY, this.elementWidth, this.elementHeight,
            0, 0, this.elementWidth * this.guiScale, this.elementHeight * this.guiScale
        );

        // === INVENTORY SLOTY (górna część) ===
        // Pattern: 9 kolumn (X: 9, 27, 45, 63, 81, 99, 117, 135, 153) × 3 rzędy (Y: 54, 72, 90)
        const invColPositions = [9, 27, 45, 63, 81, 99, 117, 135, 153]; // 9 kolumn
        const invRowPositions = [54, 72, 90]; // 3 rzędy
        const slotWidth = 16;

        let drawnCount = 0;

        // Rysuj inventory sloty (indeksy 9-35, czyli 27 slotów)
        for (let i = 0; i < 27; i++) {
            const slot = HOTBAR_BLOCKS[9 + i]; // Inventory to indeksy 9-35
            const blockId = ChatManager.getBlockId(slot);

            // Pomiń puste sloty
            if (blockId === 0) continue;

            const blockCanvas = this.blockCanvases[blockId];
            if (!blockCanvas) continue;

            // Jeśli ten blok jest aktywny, pomiń go
            if (this.editingHotbar && (9 + i) === this.activeBlockIndex) {
                continue;
            }

            const col = i % 9; // 9 kolumn
            const row = Math.floor(i / 9); // 3 rzędy

            const guiX = invColPositions[col];
            const guiY = invRowPositions[row];

            const canvasX = guiX * this.guiScale;
            const canvasY = guiY * this.guiScale;
            const drawSize = slotWidth * this.guiScale;

            ctx.drawImage(blockCanvas, canvasX, canvasY, drawSize, drawSize);

            // Rysuj liczę bloków w slocie (jeśli > 1)
            const count = ChatManager.getBlockCount(slot);
            if (count > 1) {
                this.drawNumberFromAtlas(ctx, count, canvasX + drawSize - this.itemCountConfig.offsetX, canvasY + drawSize - this.itemCountConfig.offsetY, this.itemCountConfig.scale);
            }

            drawnCount++;
        }

        // === HOTBAR SLOTY (dolna część) ===
        // Pozycje hotbaru w inventory GUI: (9,112) 16x16 dla każdego slotu
        const hotbarStartX = 9;
        const hotbarStartY = 112;
        const slotSpacing = 18;

        // Rysuj hotbar sloty (indeksy 0-8)
        HOTBAR_BLOCKS.slice(0, 9).forEach((slot, index) => {
            const blockId = ChatManager.getBlockId(slot);
            // Pomiń puste sloty
            if (blockId === 0) return;

            const blockCanvas = this.blockCanvases[blockId];
            if (!blockCanvas) return;

            // Jeśli ten blok jest aktywny, pomiń go
            if (this.editingHotbar && index === this.activeBlockIndex) {
                return;
            }

            const guiX = hotbarStartX + (index * slotSpacing);
            const guiY = hotbarStartY;

            const canvasX = guiX * this.guiScale;
            const canvasY = guiY * this.guiScale;
            const drawSize = slotWidth * this.guiScale;

            ctx.drawImage(blockCanvas, canvasX, canvasY, drawSize, drawSize);

            // Rysuj liczę bloków w slocie (jeśli > 1)
            const count = ChatManager.getBlockCount(slot);
            if (count > 1) {
                this.drawNumberFromAtlas(ctx, count, canvasX + drawSize - this.itemCountConfig.offsetX, canvasY + drawSize - this.itemCountConfig.offsetY, this.itemCountConfig.scale);
            }

            drawnCount++;
        });

        // === RYSUJ HOVER EFFECT ===
        if (this.hoveredSlotIndex !== null) {
            // Sprawdź czy to inventory slot czy hotbar slot
            if (this.hoveredSlotIndex < 27) {
                // Inventory slot (górna część)
                const invColPositions = [9, 27, 45, 63, 81, 99, 117, 135, 153];
                const invRowPositions = [54, 72, 90];
                const col = this.hoveredSlotIndex % 9;
                const row = Math.floor(this.hoveredSlotIndex / 9);

                const guiX = invColPositions[col];
                const guiY = invRowPositions[row];
                const canvasX = guiX * this.guiScale;
                const canvasY = guiY * this.guiScale;
                const slotSize = 16 * this.guiScale;

                // Rysuj białą nakładkę z alpha 41.7% (około 0.417 lub 106/255)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.417)';
                ctx.fillRect(canvasX, canvasY, slotSize, slotSize);
            } else {
                // Hotbar slot (dolna część)
                const hotbarIndex = this.hoveredSlotIndex - 27;
                if (hotbarIndex >= 0 && hotbarIndex < 9) {
                    const hotbarStartX = 9 * this.guiScale;
                    const hotbarStartY = 112 * this.guiScale;
                    const slotSpacing = 18 * this.guiScale;
                    const slotSize = 16 * this.guiScale;

                    const canvasX = hotbarStartX + (hotbarIndex * slotSpacing);
                    const canvasY = hotbarStartY;

                    // Rysuj białą nakładkę z alpha 41.7%
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.417)';
                    ctx.fillRect(canvasX, canvasY, slotSize, slotSize);
                }
            }
        }

        // === RYSUJ HOVER EFFECT NA KOSZU ===
        if (this.hoveredTrashBin) {
            const trashX = 173 * this.guiScale;
            const trashY = 112 * this.guiScale;
            const trashSize = 16 * this.guiScale;

            // Rysuj białą nakładkę z alpha 41.7%
            ctx.fillStyle = 'rgba(255, 255, 255, 0.417)';
            ctx.fillRect(trashX, trashY, trashSize, trashSize);
        }

        console.log(`✓ Inventory GUI drawn - ${drawnCount} blocks rendered`);
    }

    setupGlobalMouseTracking() {
        // Trackuj pozycję myszki
        document.addEventListener('mousemove', (e) => {
            this.currentMouseX = e.clientX;
            this.currentMouseY = e.clientY;

            // Aktualizuj pozycję poruszającego się bloku
            if (this.editingHotbar && this.activeBlockIndex !== null) {
                // Sprawdź czy activeBlockIndex wskazuje na pusty slot - jeśli tak, resetuj
                const slot = HOTBAR_BLOCKS[this.activeBlockIndex];
                const blockId = ChatManager.getBlockId(slot);
                if (blockId === 0) {
                    this.activeBlockIndex = null;
                    // Wyczyść canvas żeby nie pokazywał stary blok
                    const ctx = this.draggingBlockCanvas.getContext('2d');
                    ctx.clearRect(0, 0, 48, 48);
                    this.draggingBlockCanvas.style.display = 'none';
                    return;
                }
                this.updateDraggingBlockPosition();
            }
        });
    }

    updateDraggingBlockPosition() {
        if (this.activeBlockIndex === null) return;

        const slot = HOTBAR_BLOCKS[this.activeBlockIndex];
        const blockId = ChatManager.getBlockId(slot);

        // Sprawdź czy slot jest pusty
        if (blockId === 0) {
            console.warn('Cannot drag empty slot');
            // Wyczyść canvas żeby nie pokazywał stary blok
            const ctx = this.draggingBlockCanvas.getContext('2d');
            ctx.clearRect(0, 0, 48, 48);
            this.draggingBlockCanvas.style.display = 'none';
            return;
        }

        // Jeśli blockCanvas nie istnieje, renderuj go teraz
        if (!this.blockCanvases[blockId]) {
            console.log(`⚠️ BlockCanvas for blockId ${blockId} not found, rendering now...`);
            const block = BLOCKS_REGISTRY[blockId];
            if (block && block.id > 0) {
                try {
                    const canvas = this.hotbarRenderer.getBlockCanvas(block.id);
                    this.blockCanvases[block.id] = canvas;
                    console.log(`✓ Dynamically rendered block: ${block.name}`);
                } catch (err) {
                    console.error(`Error rendering block ${block.id}:`, err);
                    return;
                }
            }
        }

        const blockCanvas = this.blockCanvases[blockId];
        if (!blockCanvas) {
            console.warn(`Still no blockCanvas for blockId ${blockId}`);
            return;
        }

        // Upewnij się że floating canvas jest widoczny
        if (this.draggingBlockCanvas.style.display !== 'block') {
            this.draggingBlockCanvas.style.display = 'block';
        }

        // Ustaw pozycję floating canvasu
        this.draggingBlockCanvas.style.left = (this.currentMouseX - 24) + 'px';
        this.draggingBlockCanvas.style.top = (this.currentMouseY - 24) + 'px';

        // Renderuj blok do floating canvasu
        const ctx = this.draggingBlockCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 48, 48);
        ctx.drawImage(blockCanvas, 0, 0, 48, 48);

        // Rysuj liczę bloków (jeśli > 1)
        const count = ChatManager.getBlockCount(slot);
        if (count > 1) {
            this.drawNumberFromAtlas(ctx, count, 48 - this.itemCountConfig.offsetX, 48 - this.itemCountConfig.offsetY, this.itemCountConfig.scale);
        }
    }

    // Musi być wywoływane po załadowaniu tekstur!
    async initializeHotbar() {
        if (this.isReady) return;

        // Czekaj aż font będzie załadowany
        await document.fonts.ready;

        this.renderBlockIcons();
        this.isReady = true;
    }

    // Aktualizuj rotację i ponownie renderuj bloki
    updateHotbarRotation(x, y, z, order = 'XYZ') {
        if (!this.isReady) {
            console.warn('Hotbar nie jest gotowy');
            return;
        }

        // Wyczyść cache
        this.hotbarRenderer.updateRotation(x, y, z, order);
        this.blockCanvases = {};

        // Ponownie renderuj wszystkie bloki
        this.renderBlockIcons();
    }


    drawNumberFromAtlas(ctx, number, x, y, scale = 1) {
        // Użyj uniwersalnego TextRenderer!
        if (!this.textRenderer || !this.textRenderer.fontLoaded) return;

        const numStr = number.toString();
        const digitSize = 8;
        const digitSpacing = 6;
        const adjustedY = y - 4 * scale; // Przesuń całą liczbę 4px w górę

        // Oblicz startową pozycję X (ostatnia cyfra ma być na x, y)
        const totalWidth = (numStr.length - 1) * digitSpacing * scale;
        let currentX = x - totalWidth;

        // Renderuj tekst z shadow
        this.textRenderer.drawText(
            ctx,
            numStr,
            currentX,
            adjustedY,
            scale,
            this.numberShadowConfig
        );
    }

    renderBlockIcons() {
        // Renderuj tylko bloki z hotbaru (dynamicznie z HOTBAR_BLOCKS)
        for (const slot of HOTBAR_BLOCKS) {
            const blockId = ChatManager.getBlockId(slot);
            // Pomiń puste sloty (0 = AIR)
            if (blockId === 0) continue;

            const block = BLOCKS_REGISTRY[blockId];
            if (block && block.id > 0) {
                try {
                    const canvas = this.hotbarRenderer.getBlockCanvas(block.id);
                    this.blockCanvases[block.id] = canvas;
                    console.log(`✓ Wyrenderowany blok: ${block.name}`);
                } catch (err) {
                    console.error(`Błąd przy renderowaniu bloku ${block.id}:`, err);
                }
            }
        }
        console.log('Bloki wyrenderowane:', Object.keys(this.blockCanvases).length);
        // Odrysuj hotbar po wyrenderowaniu wszystkich bloków
        this.drawHotbar();

        // Jeśli inventory jest otwarte, narysuj GUI z blokami
        if (this.editingHotbar && this.guiCanvas && this.guiTexture && this.guiTexture.complete) {
            console.log('Updating inventory GUI with rendered blocks...');
            this.drawInventoryGUI();
        }
    }

    loadHotbarSelection() {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                console.log('✓ Załadowana: hotbar-selected');
                this.hotbarSelectionTexture = img;
                resolve();
            };
            img.onerror = () => {
                console.warn('✗ Błąd: hotbar-selected');
                resolve();
            };
            img.src = './assets/minecraft/textures/gui/hotbar/hotbar-selected.png';
        });
    }

    createHotbarContainer() {
        const container = document.getElementById('hotbar-container');
        
        // Canvas - 3x większy (546x66) aby uniknąć rozpikselizowania
        this.hotbarCanvas = document.createElement('canvas');
        this.hotbarCanvas.width = 546;
        this.hotbarCanvas.height = 66;
        this.hotbarCanvas.style.cssText = `
            position: fixed;
            bottom: 0;
            left: calc(50% - 273px);
            image-rendering: crisp-edges;
            z-index: 100;
            width: 546px;
            height: 66px;
        `;
        
        // Załaduj texture paska
        const img = new Image();
        img.onload = () => {
            this.drawHotbar();
        };
        img.onerror = () => {
            console.warn('Nie można załadować hotbaru');
        };
        img.src = './assets/minecraft/textures/gui/hotbar/hotbar.png';
        this.hotbarTexture = img;
        
        container.appendChild(this.hotbarCanvas);
        this.hotbarCanvas.addEventListener('click', (e) => this.onHotbarClick(e));
        this.hotbarCanvas.addEventListener('mousemove', (e) => this.onHotbarHover(e));
    }


    drawHotbar() {
        const ctx = this.hotbarCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Wyczyść canvas - clearRect zachowuje przezroczystość
        ctx.clearRect(0, 0, 546, 66);

        // Rysuj tło hotbaru (skaluj 3x)
        if (this.hotbarTexture && this.hotbarTexture.complete) {
            ctx.drawImage(this.hotbarTexture, 0, 0, 546, 66);
        }

        // Dynamiczne sloty na podstawie HOTBAR_BLOCKS
        const slotPositions = [
            { x: 9, y: 9 },
            { x: 69, y: 9 },
            { x: 129, y: 9 },
            { x: 189, y: 9 },
            { x: 249, y: 9 },
            { x: 309, y: 9 },
            { x: 369, y: 9 },
            { x: 429, y: 9 },
            { x: 489, y: 9 }
        ];

        // Rysuj wyrenderowane bloki w slotach
        HOTBAR_BLOCKS.forEach((slot, index) => {
            if (index < slotPositions.length) {
                const blockId = ChatManager.getBlockId(slot);
                // Pomiń puste sloty (0 = AIR)
                if (blockId === 0) return;

                const blockCanvas = this.blockCanvases[blockId];
                const pos = slotPositions[index];
                if (blockCanvas) {
                    // Jeśli ten blok jest aktywny, pomiń go teraz (renderuj go potem na pozycji kursora)
                    if (this.editingHotbar && index === this.activeBlockIndex) {
                        return;
                    }

                    // Wyrenderowany blok: 48x48 wycentrowany
                    ctx.drawImage(
                        blockCanvas,
                        pos.x,
                        pos.y,
                        48,
                        48
                    );
                }
            }
        });

        // Rysuj obramowanie wybranego slotu
        const selectedIndex = this.player.selectedSlotIndex;
        if (selectedIndex >= 0 && selectedIndex < slotPositions.length) {
            const selectedPos = slotPositions[selectedIndex];

            if (this.hotbarSelectionTexture && this.hotbarSelectionTexture.complete) {
                // hotbar-selected 24x24 skalowany 3x = 72x72, wycentrowany na slocie
                const selectionSize = 72;
                const offsetX = (48 - selectionSize) / 2;
                const offsetY = (48 - selectionSize) / 2;
                ctx.drawImage(
                    this.hotbarSelectionTexture,
                    selectedPos.x + offsetX,
                    selectedPos.y + offsetY,
                    selectionSize,
                    selectionSize
                );
            }
        }

        // Rysuj liczby nad hotbar-selected (ostatnia warstwa)
        HOTBAR_BLOCKS.forEach((slot, index) => {
            if (index < slotPositions.length) {
                const blockId = ChatManager.getBlockId(slot);
                // Pomiń puste sloty
                if (blockId === 0) return;

                const blockCanvas = this.blockCanvases[blockId];
                const pos = slotPositions[index];
                if (blockCanvas) {
                    // Jeśli ten blok jest aktywny, pomiń go
                    if (this.editingHotbar && index === this.activeBlockIndex) {
                        return;
                    }

                    // Rysuj liczę bloków w slocie (jeśli > 1)
                    const count = ChatManager.getBlockCount(slot);
                    if (count > 1) {
                        this.drawNumberFromAtlas(ctx, count, pos.x + 48 - this.itemCountConfig.offsetX, pos.y + 48 - this.itemCountConfig.offsetY, this.itemCountConfig.scale);
                    }
                }
            }
        });

        // Aktywny blok renderuje się na oddzielnym div element (floatingu)
        // nie tutaj na canvas!
    }

    onHotbarHover(e) {
        // Aktualizuj wybranego bloku na hover (nie edytuj, tylko preview)
        if (this.editingHotbar) return; // Nie rób nic gdy edytujesz

        const rect = this.hotbarCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const hoveredIndex = this.getBlockIndexAtPosition(x, y);
        if (hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < 9) {
            // Zaktualizuj UI preview
            const slot = HOTBAR_BLOCKS[hoveredIndex];
            const blockId = ChatManager.getBlockId(slot);
            const block = BLOCKS_REGISTRY[blockId];
            const blockName = block ? block.displayName : 'EMPTY';
            document.getElementById('block').textContent = blockName;
        }
    }

    onHotbarClick(e) {
        const rect = this.hotbarCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const clickedIndex = this.getBlockIndexAtPosition(x, y);
        if (clickedIndex === null) return;

        if (!this.editingHotbar) {
            // Normalny click - zaznacz slot
            this.player.selectedSlotIndex = clickedIndex; // Ustaw index slotu (0-8)
            const slot = HOTBAR_BLOCKS[clickedIndex];
            const blockId = ChatManager.getBlockId(slot);
            const block = BLOCKS_REGISTRY[blockId];
            const blockName = block ? block.displayName : 'EMPTY';
            document.getElementById('block').textContent = blockName;
            this.drawHotbar();
            return;
        }

        // W trybie edycji - toggle aktywny blok
        if (this.activeBlockIndex === null) {
            // Nie ma aktywnego bloku - sprawdź czy slot jest pusty
            const clickedSlot = HOTBAR_BLOCKS[clickedIndex];
            const clickedBlockId = ChatManager.getBlockId(clickedSlot);
            if (clickedBlockId === 0) {
                // Kliknęliśmy na pusty slot - nic się nie dzieje
                console.log('⚠️ Empty slot, cannot pick up');
                return;
            }
            // Zaznacz ten blok
            this.activeBlockIndex = clickedIndex;
            this.draggingBlockCanvas.style.display = 'block'; // Pokaż floating canvas
            this.updateDraggingBlockPosition(); // Aktualizuj pozycję
            console.log('🎯 Active block picked up at index:', clickedIndex, 'BlockID:', clickedBlockId);
        } else if (this.activeBlockIndex === clickedIndex) {
            // Kliknąłeś na ten sam blok - deaktywuj
            console.log('✓ Deactivated block at index:', clickedIndex);
            this.activeBlockIndex = null;
            // Wyczyść canvas żeby nie pokazywał stary blok
            const ctx = this.draggingBlockCanvas.getContext('2d');
            ctx.clearRect(0, 0, 48, 48);
            this.draggingBlockCanvas.style.display = 'none'; // Schowaj floating canvas
            this.drawHotbar(); // Aktualizuj GUI
            if (this.editingHotbar && this.guiCanvas && this.guiTexture && this.guiTexture.complete) {
                this.drawInventoryGUI();
            }
        } else {
            // Kliknąłeś na inny slot
            const targetSlot = HOTBAR_BLOCKS[clickedIndex];
            const targetBlockId = ChatManager.getBlockId(targetSlot);
            const activeSlot = HOTBAR_BLOCKS[this.activeBlockIndex];
            const activeBlockId = ChatManager.getBlockId(activeSlot);

            if (targetBlockId === 0) {
                // Pusty slot - przenieś tam blok zamiast robić swap
                console.log('📦 Moving block to empty slot:', this.activeBlockIndex, '→', clickedIndex);
                HOTBAR_BLOCKS[clickedIndex] = HOTBAR_BLOCKS[this.activeBlockIndex];
                HOTBAR_BLOCKS[this.activeBlockIndex] = null; // Opróżnij poprzedni slot
                this.activeBlockIndex = null; // PUSZCZAMY BLOK!
                // Wyczyść canvas żeby nie pokazywał stary blok
                const ctx = this.draggingBlockCanvas.getContext('2d');
                ctx.clearRect(0, 0, 48, 48);
                this.draggingBlockCanvas.style.display = 'none';
            } else if (targetBlockId === activeBlockId) {
                // SAME ID - stackuj bloki!
                console.log('📚 Stacking blocks:', this.activeBlockIndex, '→', clickedIndex, `(${activeSlot.count} + ${targetSlot.count})`);
                const MAX_STACK = 64;
                const totalCount = activeSlot.count + targetSlot.count;

                if (totalCount <= MAX_STACK) {
                    // Wszystkie bloki się zmieszczą w jednym slocie
                    targetSlot.count = totalCount;
                    HOTBAR_BLOCKS[this.activeBlockIndex] = null; // Opróżnij źródłowy slot
                    this.activeBlockIndex = null; // PUSZCZAMY BLOK!
                    console.log(`✓ Stacked: ${totalCount} blocks in slot ${clickedIndex}`);
                } else {
                    // Część zostaje w celu, część w źródle
                    targetSlot.count = MAX_STACK;
                    activeSlot.count = totalCount - MAX_STACK;
                    this.activeBlockIndex = null; // PUSZCZAMY BLOK!
                    console.log(`✓ Stacked (overflow): ${MAX_STACK} in slot ${clickedIndex}, ${activeSlot.count} remaining in slot ${this.activeBlockIndex}`);
                }
                // Wyczyść canvas żeby nie pokazywał stary blok
                const ctx = this.draggingBlockCanvas.getContext('2d');
                ctx.clearRect(0, 0, 48, 48);
                this.draggingBlockCanvas.style.display = 'none';
            } else {
                // RÓŻNE ID - REVERSE SWAP!
                console.log('🔄 Reverse swap:', this.activeBlockIndex, '↔', clickedIndex);
                const temp = HOTBAR_BLOCKS[clickedIndex];
                HOTBAR_BLOCKS[clickedIndex] = HOTBAR_BLOCKS[this.activeBlockIndex];
                HOTBAR_BLOCKS[this.activeBlockIndex] = temp;
                // activeBlockIndex pozostaje taki sam - wskazuje na nowy blok w tym slocie
                this.updateDraggingBlockPosition(); // Aktualizuj pozycję i zawartość
            }

            console.log('After move/swap - activeBlockIndex:', this.activeBlockIndex);
            this.drawHotbar(); // Aktualizuj GUI od razu
            if (this.editingHotbar && this.guiCanvas && this.guiTexture && this.guiTexture.complete) {
                this.drawInventoryGUI();
            }
        }

        // Upewnij się że activeBlockIndex nigdy nie wskazuje na pusty slot
        if (this.activeBlockIndex !== null) {
            const activeSlot = HOTBAR_BLOCKS[this.activeBlockIndex];
            const activeBlockId = ChatManager.getBlockId(activeSlot);
            if (activeBlockId === 0) {
                console.warn('⚠️ activeBlockIndex pointed to empty slot, resetting...');
                this.activeBlockIndex = null;
                // Wyczyść canvas żeby nie pokazywał stary blok
                const ctx = this.draggingBlockCanvas.getContext('2d');
                ctx.clearRect(0, 0, 48, 48);
                this.draggingBlockCanvas.style.display = 'none';
            }
        }
    }

    onInventoryHover(e) {
        // Śledzenie hovera na slotach inventory
        const rect = this.guiCanvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Sprawdź trash bin
        if (this.getTrashBinAtPosition(canvasX, canvasY)) {
            this.hoveredTrashBin = true;
            this.hoveredSlotIndex = null;
            this.drawInventoryGUI();
            return;
        }

        this.hoveredTrashBin = false;

        // Sprawdź inventory sloty
        let inventorySlotIndex = this.getInventorySlotAtPosition(canvasX, canvasY);
        if (inventorySlotIndex !== null) {
            this.hoveredSlotIndex = inventorySlotIndex;
            this.drawInventoryGUI();
            return;
        }

        // Sprawdź hotbar sloty
        const hotbarIndex = this.getInventoryHotbarSlotAtPosition(canvasX, canvasY);
        if (hotbarIndex !== null) {
            this.hoveredSlotIndex = 27 + hotbarIndex; // 27 = liczba inventory slotów
            this.drawInventoryGUI();
            return;
        }

        // Nie jesteśmy na żadnym slocie
        this.hoveredSlotIndex = null;
        this.drawInventoryGUI();
    }

    onInventoryHotbarClick(e) {
        // Mapuj kliknięcie w inventory GUI na slot (hotbar lub inventory)
        const rect = this.guiCanvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Sprawdź czy klikniemy na inventory sloty (górna część)
        let inventorySlotIndex = this.getInventorySlotAtPosition(canvasX, canvasY);
        if (inventorySlotIndex !== null) {
            // Konwertuj do indeksu HOTBAR_BLOCKS (9-35)
            const blockIndex = 9 + inventorySlotIndex;
            console.log('🎮 Inventory slot click at index:', blockIndex);
            this.handleBlockSlotClick(blockIndex);
            return;
        }

        // Sprawdź czy klikniemy na hotbar sloty (dolna część)
        const hotbarIndex = this.getInventoryHotbarSlotAtPosition(canvasX, canvasY);
        if (hotbarIndex !== null) {
            console.log('🎮 Hotbar click at index:', hotbarIndex);
            this.handleBlockSlotClick(hotbarIndex);
            return;
        }

        // Sprawdź czy klikniemy na trash bin (kosz)
        if (this.getTrashBinAtPosition(canvasX, canvasY)) {
            if (this.activeBlockIndex !== null) {
                // Wyrzuć blok do kosza - usuń go z hotbaru
                console.log('🗑️ Throwing block into trash:', this.activeBlockIndex);
                HOTBAR_BLOCKS[this.activeBlockIndex] = 0;
                this.activeBlockIndex = null;
                // Wyczyść canvas
                const ctx = this.draggingBlockCanvas.getContext('2d');
                ctx.clearRect(0, 0, 48, 48);
                this.draggingBlockCanvas.style.display = 'none';
                // Aktualizuj GUI
                this.drawInventoryGUI();
                this.drawHotbar();
            }
            return;
        }
    }

    handleBlockSlotClick(clickedIndex) {
        // Obsługuj klikanie na dowolny slot (hotbar lub inventory)

        if (this.activeBlockIndex === null) {
            // Nie ma aktywnego bloku - sprawdź czy slot jest pusty
            const clickedSlot = HOTBAR_BLOCKS[clickedIndex];
            const clickedBlockId = ChatManager.getBlockId(clickedSlot);
            if (clickedBlockId === 0) {
                // Kliknęliśmy na pusty slot - nic się nie dzieje
                console.log('⚠️ Empty slot, cannot pick up');
                return;
            }
            // Zaznacz ten blok
            this.activeBlockIndex = clickedIndex;
            this.draggingBlockCanvas.style.display = 'block'; // Pokaż floating canvas
            this.updateDraggingBlockPosition(); // Aktualizuj pozycję
            console.log('🎯 Picked up block from inventory at index:', clickedIndex, 'BlockID:', clickedBlockId);
        } else if (this.activeBlockIndex === clickedIndex) {
            // Kliknąłeś na ten sam blok - deaktywuj
            console.log('✓ Dropped block back at inventory index:', clickedIndex);
            this.activeBlockIndex = null;
            // Wyczyść canvas żeby nie pokazywał stary blok
            const ctx = this.draggingBlockCanvas.getContext('2d');
            ctx.clearRect(0, 0, 48, 48);
            this.draggingBlockCanvas.style.display = 'none'; // Schowaj floating canvas
            this.drawInventoryGUI(); // Przerenduj inventory
            this.drawHotbar(); // Przerenduj hotbar (może się zmienić)
        } else {
            // Kliknąłeś na inny slot
            const targetSlot = HOTBAR_BLOCKS[clickedIndex];
            const targetBlockId = ChatManager.getBlockId(targetSlot);
            const activeSlot = HOTBAR_BLOCKS[this.activeBlockIndex];
            const activeBlockId = ChatManager.getBlockId(activeSlot);

            if (targetBlockId === 0) {
                // Pusty slot - przenieś tam blok zamiast robić swap
                console.log('📦 Moving block to empty slot in inventory:', this.activeBlockIndex, '→', clickedIndex);
                HOTBAR_BLOCKS[clickedIndex] = HOTBAR_BLOCKS[this.activeBlockIndex];
                HOTBAR_BLOCKS[this.activeBlockIndex] = null; // Opróżnij poprzedni slot
                this.activeBlockIndex = null; // PUSZCZAMY BLOK!
                // Wyczyść canvas żeby nie pokazywał stary blok
                const ctx = this.draggingBlockCanvas.getContext('2d');
                ctx.clearRect(0, 0, 48, 48);
                this.draggingBlockCanvas.style.display = 'none';
            } else if (targetBlockId === activeBlockId) {
                // SAME ID - stackuj bloki!
                console.log('📚 Stacking blocks in inventory:', this.activeBlockIndex, '→', clickedIndex, `(${activeSlot.count} + ${targetSlot.count})`);
                const MAX_STACK = 64;
                const totalCount = activeSlot.count + targetSlot.count;

                if (totalCount <= MAX_STACK) {
                    // Wszystkie bloki się zmieszczą w jednym slocie
                    targetSlot.count = totalCount;
                    HOTBAR_BLOCKS[this.activeBlockIndex] = null; // Opróżnij źródłowy slot
                    this.activeBlockIndex = null; // PUSZCZAMY BLOK!
                    console.log(`✓ Stacked: ${totalCount} blocks in slot ${clickedIndex}`);
                } else {
                    // Część zostaje w celu, część w źródle
                    targetSlot.count = MAX_STACK;
                    activeSlot.count = totalCount - MAX_STACK;
                    this.activeBlockIndex = null; // PUSZCZAMY BLOK!
                    console.log(`✓ Stacked (overflow): ${MAX_STACK} in slot ${clickedIndex}, ${activeSlot.count} remaining in slot ${this.activeBlockIndex}`);
                }
                // Wyczyść canvas żeby nie pokazywał stary blok
                const ctx = this.draggingBlockCanvas.getContext('2d');
                ctx.clearRect(0, 0, 48, 48);
                this.draggingBlockCanvas.style.display = 'none';
            } else {
                // RÓŻNE ID - REVERSE SWAP!
                console.log('🔄 Inventory reverse swap:', this.activeBlockIndex, '↔', clickedIndex);
                const temp = HOTBAR_BLOCKS[clickedIndex];
                HOTBAR_BLOCKS[clickedIndex] = HOTBAR_BLOCKS[this.activeBlockIndex];
                HOTBAR_BLOCKS[this.activeBlockIndex] = temp;
                // activeBlockIndex pozostaje taki sam - wskazuje na nowy blok w tym slocie
                this.updateDraggingBlockPosition(); // Aktualizuj floating block
            }

            console.log('After move/swap in inventory - activeBlockIndex:', this.activeBlockIndex);

            this.drawInventoryGUI(); // Przerenduj inventory
            this.drawHotbar(); // Przerenduj hotbar
        }

        // Upewnij się że activeBlockIndex nigdy nie wskazuje na pusty slot
        if (this.activeBlockIndex !== null) {
            const activeSlot = HOTBAR_BLOCKS[this.activeBlockIndex];
            const activeBlockId = ChatManager.getBlockId(activeSlot);
            if (activeBlockId === 0) {
                console.warn('⚠️ activeBlockIndex pointed to empty slot, resetting...');
                this.activeBlockIndex = null;
                // Wyczyść canvas żeby nie pokazywał stary blok
                const ctx = this.draggingBlockCanvas.getContext('2d');
                ctx.clearRect(0, 0, 48, 48);
                this.draggingBlockCanvas.style.display = 'none';
            }
        }
    }

    getInventorySlotAtPosition(canvasX, canvasY) {
        // Inventory sloty (górna część): 9 kolumn (X: 9, 27, 45, 63, 81, 99, 117, 135, 153) × 3 rzędy (Y: 54, 72, 90)
        const colPositions = [9, 27, 45, 63, 81, 99, 117, 135, 153];
        const startY = 54;
        const rowHeight = 18;
        const slotSize = 16;

        // Skaluj pozycje
        const scaledColPositions = colPositions.map(x => x * this.guiScale);
        const scaledStartY = startY * this.guiScale;
        const scaledRowHeight = rowHeight * this.guiScale;
        const scaledSlotSize = slotSize * this.guiScale;

        // Znajdź kolumnę
        let col = -1;
        for (let i = 0; i < scaledColPositions.length; i++) {
            const slotX = scaledColPositions[i];
            if (canvasX >= slotX && canvasX < slotX + scaledSlotSize) {
                col = i;
                break;
            }
        }

        if (col === -1) return null;

        // Znajdź rząd
        if (canvasY < scaledStartY) return null;

        const relativeY = canvasY - scaledStartY;
        const row = Math.floor(relativeY / scaledRowHeight);

        if (row < 0 || row >= 3) return null;

        // Sprawdź czy jesteśmy dokładnie na slocie
        const slotY = scaledStartY + (row * scaledRowHeight);
        if (canvasY >= slotY && canvasY < slotY + scaledSlotSize) {
            // Konwertuj col + row na slot index (0-26) - 9 kolumn × 3 rzędy
            return row * 9 + col;
        }

        return null;
    }

    getInventoryHotbarSlotAtPosition(canvasX, canvasY) {
        // Hotbar w inventory GUI: Y = 112*3 = 336
        // X = (9 + index*18)*3
        // Rozmiar slotu: 16*3 = 48x48

        const hotbarStartX = 9 * this.guiScale; // 27
        const hotbarStartY = 112 * this.guiScale; // 336
        const slotWidth = 16 * this.guiScale; // 48
        const slotSpacing = 18 * this.guiScale; // 54

        // Sprawdź czy kliknięcie jest na Y hotbaru
        if (canvasY < hotbarStartY || canvasY >= hotbarStartY + slotWidth) {
            return null;
        }

        // Znajdź slot na X (tylko pierwsze 9 slotów hotbaru)
        for (let i = 0; i < 9; i++) {
            const slotX = hotbarStartX + (i * slotSpacing);
            if (canvasX >= slotX && canvasX < slotX + slotWidth) {
                return i;
            }
        }

        return null;
    }

    getTrashBinAtPosition(canvasX, canvasY) {
        // Trash bin (kosz): pozycja (173, 112), rozmiar 16x16
        const trashX = 173 * this.guiScale; // 519
        const trashY = 112 * this.guiScale; // 336
        const trashSize = 16 * this.guiScale; // 48

        // Sprawdź czy kliknięcie jest na koszu
        if (canvasX >= trashX && canvasX < trashX + trashSize &&
            canvasY >= trashY && canvasY < trashY + trashSize) {
            return true;
        }

        return false;
    }

    styleButtons() {
        const saveBtn = document.getElementById('saveBtn');

        if (saveBtn) {
            saveBtn.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 8px 16px;
                background: linear-gradient(180deg, #9C6C47 0%, #6B4423 100%);
                color: #FFFAFA;
                border: 3px outset #8B5A3C;
                cursor: pointer;
                z-index: 101;
                font-family: 'Minecraft', monospace;
                font-size: 12px;
                font-weight: bold;
                box-shadow: inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.3);
            `;

            saveBtn.addEventListener('mouseover', () => {
                saveBtn.style.background = 'linear-gradient(180deg, #A67C52 0%, #7B5A2F 100%)';
            });
            saveBtn.addEventListener('mouseout', () => {
                saveBtn.style.background = 'linear-gradient(180deg, #9C6C47 0%, #6B4423 100%)';
            });
        }

        const loadBtn = document.getElementById('loadBtn');
        if (loadBtn) {
            loadBtn.style.cssText = `
                margin-left: 10px;
                padding: 10px 30px;
                background: linear-gradient(180deg, #8B8B8B 0%, #5A5A5A 100%);
                color: #FFFAFA;
                border: 3px outset #A9A9A9;
                cursor: pointer;
                font-family: 'Minecraft', monospace;
                font-size: 14px;
                font-weight: bold;
                box-shadow: inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.5);
            `;

            loadBtn.addEventListener('mouseover', () => {
                loadBtn.style.background = 'linear-gradient(180deg, #9B9B9B 0%, #6A6A6A 100%)';
            });
            loadBtn.addEventListener('mouseout', () => {
                loadBtn.style.background = 'linear-gradient(180deg, #8B8B8B 0%, #5A5A5A 100%)';
            });
        }
    }

    toggleHotbarEditMode(editing) {
        this.editingHotbar = editing;
        if (editing) {
            console.log('🔧 Hotbar edit mode ENABLED - creative inventory GUI');
            this.guiOverlay.style.display = 'flex'; // FLEX dla wyśrodkowania!
            this.activeBlockIndex = null;
            this.draggingBlockCanvas.style.display = 'none';

            // Zresetuj klawisze sterowania aby nie latał/skakał gdy inventory jest otwarte
            if (this.player) {
                this.player.keys[' '] = false;
                this.player.keys['shift'] = false;
            }

            // Wyrenderuj bloki jeśli nie zostały wyrenderowane
            if (Object.keys(this.blockCanvases).length === 0) {
                console.log('Rendering block icons for inventory...');
                this.renderBlockIcons();
            } else {
                // Aktualizuj GUI z istniejącymi blokami
                if (this.guiCanvas && this.guiTexture && this.guiTexture.complete) {
                    this.drawInventoryGUI();
                }
            }
        } else {
            console.log('✓ Hotbar edit mode disabled');
            this.guiOverlay.style.display = 'none';
            this.activeBlockIndex = null;
            // Wyczyść canvas żeby nie pokazywał stary blok
            const ctx = this.draggingBlockCanvas.getContext('2d');
            ctx.clearRect(0, 0, 48, 48);
            this.draggingBlockCanvas.style.display = 'none';
        }
    }

    getBlockIndexAtPosition(x, y) {
        const slotPositions = [
            { x: 9, y: 9 },
            { x: 69, y: 9 },
            { x: 129, y: 9 },
            { x: 189, y: 9 },
            { x: 249, y: 9 },
            { x: 309, y: 9 },
            { x: 369, y: 9 },
            { x: 429, y: 9 },
            { x: 489, y: 9 }
        ];

        // Sprawdź dokładny hit na slotach
        for (let i = 0; i < HOTBAR_BLOCKS.length && i < slotPositions.length; i++) {
            const pos = slotPositions[i];
            if (x >= pos.x && x <= pos.x + 48 &&
                y >= pos.y && y <= pos.y + 48) {
                return i;
            }
        }
        return null;
    }

    swapBlocksInHotbar(fromIndex, toIndex) {
        if (fromIndex === null || toIndex === null || fromIndex === toIndex) {
            return;
        }

        // Zamień bloki w HOTBAR_BLOCKS
        const temp = HOTBAR_BLOCKS[fromIndex];
        HOTBAR_BLOCKS[fromIndex] = HOTBAR_BLOCKS[toIndex];
        HOTBAR_BLOCKS[toIndex] = temp;

        console.log('Swapped blocks:', `[${fromIndex}] <-> [${toIndex}]`);

        // Wyczyść cache i przerenduj
        this.blockCanvases = {};
        this.renderBlockIcons();

        // Aktualizuj GUI inventory
        if (this.guiCanvas && this.guiTexture && this.guiTexture.complete) {
            this.drawInventoryGUI();
        }
    }

    update() {
        // Sprawdź czy coś się zmieniło w hotbarze
        const currentHotbarState = JSON.stringify(HOTBAR_BLOCKS);
        const selectedIndexChanged = this.player.selectedSlotIndex !== this.lastSelectedIndex;
        const hotbarChanged = currentHotbarState !== this.lastHotbarState;

        if (hotbarChanged || selectedIndexChanged || this.editingHotbar) {
            this.drawHotbar();
            this.lastHotbarState = currentHotbarState;
            this.lastSelectedIndex = this.player.selectedSlotIndex;
        }

        // Jeśli inventory jest otwarte, przerenduj GUI co frame
        if (this.editingHotbar && this.guiCanvas && this.guiTexture && this.guiTexture.complete) {
            this.drawInventoryGUI();
        }
    }
}