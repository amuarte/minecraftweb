// chatManager.js - Minecraft chat system
import { HOTBAR_BLOCKS } from './config.js';
import { TextRenderer } from './textRenderer.js';

export class ChatManager {
    constructor(rendererCanvas) {
        this.isOpen = false;
        this.messages = []; // Chat history
        this.inputText = ''; // Input text
        this.cursorBlink = true;
        this.cursorBlinkTimer = 0;
        this.cursorBlinkInterval = 0.5; // 500ms

        // Canvas for chat rendering
        this.textCanvas = document.createElement('canvas');
        this.textCtx = null;
        this.rendererCanvas = rendererCanvas;

        // Universal text renderer (shared with numbers)
        this.textRenderer = new TextRenderer();

        // Chat layout configuration
        this.chatConfig = {
            width: 320,          // Chat width in pixels
            lineHeight: 8,       // Height per line (8px at scale 1, becomes 24px with scale=3)
            maxLines: 10,        // Max visible message lines
            inputHeight: 8,      // Input line height
            padding: 2,          // Padding around text
            textScale: 3         // Scale factor for text rendering
        };

        // Message history visible on screen
        this.messageScroll = 0;

        // Keyboard handling
        this.keyStates = {};
        this.pendingChars = [];

        this.initCanvas();
        this.setupEventListeners();
    }

    initCanvas() {
        // Setup canvas (no DPI scaling, draw at 1:1)
        this.textCanvas.width = this.chatConfig.width;
        this.textCanvas.height =
            (this.chatConfig.maxLines * this.chatConfig.lineHeight) +
            this.chatConfig.inputHeight +
            (this.chatConfig.padding * 3);

        this.textCtx = this.textCanvas.getContext('2d');
        this.textCtx.imageSmoothingEnabled = false;
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();

            // Quick Find (/) prevention
            if (e.key === '/' || e.code === 'Slash') {
                e.preventDefault();
                this.keyStates['/'] = true;
                return;
            }

            // Collect characters when chat is open
            if (this.isOpen) {
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    this.pendingChars.push(e.key);
                } else {
                    this.keyStates[key] = true;
                }
            } else {
                // Only collect special keys when chat is closed
                if (e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey) {
                    this.keyStates[key] = true;
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (e.key === '/' || e.code === 'Slash') {
                delete this.keyStates['/'];
            } else {
                delete this.keyStates[key];
            }
        });
    }

    open() {
        this.isOpen = true;
        this.inputText = '';
        this.messageScroll = 0;
        this.draw();
    }

    close() {
        this.isOpen = false;
        this.inputText = '';
        this.pendingChars = [];
    }

    toggleOpen() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    addMessage(text, type = 'message') {
        this.messages.push({
            text: text,
            timestamp: new Date(),
            type: type // 'message', 'command', 'system'
        });
        this.messageScroll = 0; // Scroll to latest
    }

    sendMessage() {
        const text = this.inputText.trim();
        if (text === '') {
            this.close();
            return;
        }

        // Add to history
        this.addMessage(text, text.startsWith('/') ? 'command' : 'message');

        // Process commands
        if (text.startsWith('/')) {
            this.processCommand(text);
        }

        this.inputText = '';
        this.close();
    }

    processCommand(commandStr) {
        const parts = commandStr.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (cmd === '/give') {
            this.cmdGive(parts);
        } else {
            this.addMessage('Unknown command: ' + cmd, 'system');
        }
    }

    cmdGive(parts) {
        if (parts.length < 3) {
            this.addMessage('Usage: /give @s <block> [count]', 'system');
            return;
        }

        const target = parts[1];
        const blockName = parts[2].toUpperCase();
        let count = 1;

        if (parts.length > 3) {
            count = parseInt(parts[3]);
            if (isNaN(count) || count < 1) {
                this.addMessage('Count must be a positive number', 'system');
                return;
            }
            if (count > 2496) {
                count = 2496;
                this.addMessage('Count limited to max (36 x 64)', 'system');
            }
        }

        if (target !== '@s') {
            this.addMessage('Only @s target is supported', 'system');
            return;
        }

        const blockId = this.getBlockIdByName(blockName);
        if (blockId === null) {
            this.addMessage('Unknown block: ' + blockName, 'system');
            return;
        }

        const addedSlot = this.addBlockToHotbar(blockId, count);
        if (addedSlot !== -1) {
            this.addMessage('Gave ' + count + 'x ' + blockName + ' to player', 'system');
        } else {
            this.addMessage('Inventory full!', 'system');
        }
    }

    getBlockIdByName(blockName) {
        // Simple block registry
        const blocks = {
            'GRASS': 1,
            'DIRT': 2,
            'STONE': 3,
            'WOOD': 4,
            'LEAVES': 5,
            'PLANKS': 6,
            'GLASS': 7
        };
        return blocks[blockName] || null;
    }

    addBlockToHotbar(blockId, count = 1) {
        const MAX_STACK = 64;

        // Try to stack in existing slots
        for (let i = 0; i < 36; i++) {
            const slot = HOTBAR_BLOCKS[i];
            if (slot && slot.id === blockId && slot.count < MAX_STACK) {
                const canAdd = Math.min(count, MAX_STACK - slot.count);
                slot.count += canAdd;
                if (canAdd === count) return i;
                count -= canAdd;
            }
        }

        // Add to empty slots
        while (count > 0) {
            // Hotbar (0-8)
            for (let i = 0; i < 9; i++) {
                if (HOTBAR_BLOCKS[i] === null) {
                    const toAdd = Math.min(count, MAX_STACK);
                    HOTBAR_BLOCKS[i] = { id: blockId, count: toAdd };
                    count -= toAdd;
                    if (count === 0) return i;
                }
            }

            // Inventory (9-35)
            for (let i = 9; i < 36; i++) {
                if (HOTBAR_BLOCKS[i] === null) {
                    const toAdd = Math.min(count, MAX_STACK);
                    HOTBAR_BLOCKS[i] = { id: blockId, count: toAdd };
                    count -= toAdd;
                    if (count === 0) return i;
                }
            }

            if (count > 0) return -1;
        }

        return 0;
    }

    update(delta) {
        // Update cursor blink
        this.cursorBlinkTimer += delta;
        if (this.cursorBlinkTimer >= this.cursorBlinkInterval) {
            this.cursorBlink = !this.cursorBlink;
            this.cursorBlinkTimer = 0;
        }

        // Process pending characters
        for (const char of this.pendingChars) {
            this.inputText += char;
        }
        this.pendingChars = [];

        // Process key states
        if (this.keyStates['backspace']) {
            this.inputText = this.inputText.slice(0, -1);
            delete this.keyStates['backspace'];
        }

        if (this.keyStates['enter']) {
            this.sendMessage();
            delete this.keyStates['enter'];
        }

        if (this.isOpen) {
            this.draw();
        }
    }

    draw() {
        if (!this.textCtx) return;

        const ctx = this.textCtx;
        const config = this.chatConfig;

        // Clear canvas
        ctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);

        let yPos = config.padding;

        // Draw message history
        const visibleStart = Math.max(0, this.messages.length - config.maxLines - this.messageScroll);
        const visibleEnd = Math.min(this.messages.length, this.messages.length - this.messageScroll);

        for (let i = visibleStart; i < visibleEnd; i++) {
            const msg = this.messages[i];

            // Message color based on type
            let color = 0xFFFFFF; // White
            if (msg.type === 'command') {
                color = 0x55FF55; // Green
            } else if (msg.type === 'system') {
                color = 0xFFFF55; // Yellow
            }

            // Draw message text with shadow (identical to item counts!)
            this.drawTextLine(msg.text, config.padding, yPos, color);
            yPos += config.lineHeight;
        }

        // Draw input box if chat is open
        if (this.isOpen) {
            yPos = config.padding + (config.maxLines * config.lineHeight) + config.padding;

            // Input background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, yPos - 2, config.width, config.inputHeight + 4);

            // Draw prompt
            const promptText = '> ';
            this.drawTextLine(promptText, config.padding, yPos, 0xFFFFFF);

            // Calculate prompt width
            let promptWidth = 0;
            for (let i = 0; i < promptText.length; i++) {
                const char = promptText[i];
                const charData = this.textRenderer.charMap[char];
                if (charData) {
                    promptWidth += (charData.width + 1) * config.textScale;
                }
            }

            // Draw input text
            const inputX = config.padding + promptWidth;
            this.drawTextLine(this.inputText, inputX, yPos, 0xFFFFFF);

            // Draw cursor if blinking
            if (this.cursorBlink) {
                let inputWidth = 0;
                for (let i = 0; i < this.inputText.length; i++) {
                    const char = this.inputText[i];
                    const charData = this.textRenderer.charMap[char];
                    if (charData) {
                        inputWidth += (charData.width + 1) * config.textScale;
                    }
                }

                const cursorX = Math.round(inputX + inputWidth);
                const cursorY = Math.round(yPos);

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(cursorX, cursorY, 1, config.inputHeight);
            }
        }
    }

    drawTextLine(text, x, y, colorHex) {
        if (!this.textRenderer) {
            return; // No renderer
        }

        // Use universal TextRenderer with shadow (IDENTICAL to item counts!)
        // Font will load asynchronously, text appears when ready
        this.textRenderer.drawText(
            this.textCtx,
            text,
            x,
            y,
            this.chatConfig.textScale, // scale=3
            {
                offsetX: 1,
                offsetY: 1,
                color: 0x3f3f3f
            }
        );
    }

    getTextCanvas() {
        return this.textCanvas;
    }

    // === STATIC HELPER METHODS ===
    // Used by Player and other systems for hotbar management

    static getBlockId(slot) {
        if (slot === null) return 0;
        if (typeof slot === 'object' && slot.id) return slot.id;
        return slot; // backward compatibility
    }

    static getBlockCount(slot) {
        if (slot === null) return 0;
        if (typeof slot === 'object' && slot.count) return slot.count;
        return 1; // backward compatibility
    }
}
