// guiManager.js - GUI Minecraft'owy z ikonami bloków w hotbarze
export class GUIManager {
    constructor(world, player, textureManager) {
        this.world = world;
        this.player = player;
        this.textureManager = textureManager;
        this.blockIcons = {};
        this.hotbarSelectionTexture = null;
        this.loadFont();
        this.loadBlockIcons();
        this.loadHotbarSelection();
        this.createHotbarContainer();
        this.styleButtons();
    }

    loadFont() {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Minecraft&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }

    async loadBlockIcons() {
        const blockData = [
            { id: 1, name: 'grass', path: './assets/minecraft/textures/isometric/grass.png' },
            { id: 2, name: 'dirt', path: './assets/minecraft/textures/isometric/dirt.png' },
            { id: 3, name: 'stone', path: './assets/minecraft/textures/isometric/stone.png' },
            { id: 4, name: 'log_oak', path: './assets/minecraft/textures/isometric/log_oak.png' },
            { id: 5, name: 'leaves_oak', path: './assets/minecraft/textures/isometric/leaves_oak.png' }
        ];

        const promises = blockData.map(block => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    console.log(`✓ Załadowana: ${block.name}`);
                    this.blockIcons[block.id] = img;
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`✗ Błąd: ${block.path}`);
                    resolve();
                };
                img.src = block.path;
            });
        });

        await Promise.all(promises);
        console.log('Ikony bloków załadowane:', Object.keys(this.blockIcons));
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
            left: 50%;
            transform: translateX(-50%);
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
    }

    drawHotbar() {
        const ctx = this.hotbarCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        // Wyczyść canvas
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 546, 66);
        
        // Rysuj tło hotbaru (skaluj 3x)
        if (this.hotbarTexture && this.hotbarTexture.complete) {
            ctx.drawImage(this.hotbarTexture, 0, 0, 546, 66);
        }
        
        // Rysuj ikony bloków w slotach
        const slots = [
            { slotNum: 1, x: 9, y: 9 },
            { slotNum: 2, x: 69, y: 9 },
            { slotNum: 3, x: 129, y: 9 },
            { slotNum: 4, x: 189, y: 9 },
            { slotNum: 5, x: 249, y: 9 },
            { slotNum: 6, x: 309, y: 9 },
            { slotNum: 7, x: 369, y: 9 },
            { slotNum: 8, x: 429, y: 9 },
            { slotNum: 9, x: 489, y: 9 }
        ];

        slots.forEach(slot => {
            const icon = this.blockIcons[slot.slotNum];
            if (icon && icon.complete) {
                // Blok: wysokość 48px, szerokość proporcjonalna (isometric)
                const blockHeight = 48;
                const aspectRatio = icon.width / icon.height;
                const blockWidth = blockHeight * aspectRatio;
                const offsetX = (48 - blockWidth) / 2;
                ctx.drawImage(
                    icon,
                    slot.x + offsetX,
                    slot.y,
                    blockWidth,
                    blockHeight
                );
            }
        });
        
        // Rysuj obramowanie wybranego slotu
        const selectedIndex = this.player.selectedBlock - 1;
        const selectedSlot = slots[selectedIndex];
        
        if (selectedSlot && this.hotbarSelectionTexture && this.hotbarSelectionTexture.complete) {
            // hotbar-selected 24x24 skalowany 3x = 72x72, wycentrowany na slocie
            const selectionSize = 72;
            const offsetX = (48 - selectionSize) / 2;
            const offsetY = (48 - selectionSize) / 2;
            ctx.drawImage(
                this.hotbarSelectionTexture,
                selectedSlot.x + offsetX,
                selectedSlot.y + offsetY,
                selectionSize,
                selectionSize
            );
        }
    }

    onHotbarClick(e) {
        const rect = this.hotbarCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const slots = [
            { slotNum: 1, x: 9, y: 9 },
            { slotNum: 2, x: 69, y: 9 },
            { slotNum: 3, x: 129, y: 9 },
            { slotNum: 4, x: 189, y: 9 },
            { slotNum: 5, x: 249, y: 9 },
            { slotNum: 6, x: 309, y: 9 },
            { slotNum: 7, x: 369, y: 9 },
            { slotNum: 8, x: 429, y: 9 },
            { slotNum: 9, x: 489, y: 9 }
        ];

        for (const slot of slots) {
            if (x >= slot.x && x <= slot.x + 48 &&
                y >= slot.y && y <= slot.y + 48) {
                this.player.selectedBlock = slot.slotNum;
                const blockNames = ['', 'GRASS', 'DIRT', 'STONE', 'WOOD', 'LEAVES', '', '', ''];
                document.getElementById('block').textContent = blockNames[this.player.selectedBlock] || 'EMPTY';
                this.drawHotbar();
                break;
            }
        }
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

    update() {
        this.drawHotbar();
    }
}