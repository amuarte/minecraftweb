import { CONFIG } from './config.js';

export class Hotbar {
    constructor(defaultBlocks = null) {
        this.size = CONFIG.HOTBAR_SIZE;
        this.slots = new Array(this.size).fill(null);
        this.selectedSlot = 0;
        
        if (defaultBlocks && Array.isArray(defaultBlocks)) {
            defaultBlocks.forEach((blockId, idx) => {
                if (idx < this.size) {
                    this.slots[idx] = blockId;
                }
            });
        }
    }

    setBlock(slotIndex, blockId) {
        if (slotIndex >= 0 && slotIndex < this.size) {
            this.slots[slotIndex] = blockId;
        }
    }

    getBlock(slotIndex) {
        if (slotIndex >= 0 && slotIndex < this.size) {
            return this.slots[slotIndex];
        }
        return null;
    }

    getSelectedBlock() {
        return this.slots[this.selectedSlot];
    }

    selectSlot(slotIndex) {
        if (slotIndex >= 0 && slotIndex < this.size) {
            this.selectedSlot = slotIndex;
            return true;
        }
        return false;
    }

    nextSlot() {
        this.selectedSlot = (this.selectedSlot + 1) % this.size;
    }

    previousSlot() {
        this.selectedSlot = (this.selectedSlot - 1 + this.size) % this.size;
    }

    getSlots() {
        return [...this.slots];
    }

    toJSON() {
        return { slots: this.slots, selectedSlot: this.selectedSlot };
    }

    fromJSON(data) {
        if (data.slots && Array.isArray(data.slots)) this.slots = data.slots;
        if (typeof data.selectedSlot === 'number') this.selectedSlot = data.selectedSlot;
    }
}