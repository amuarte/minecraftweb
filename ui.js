// ui.js - Obsługa UI i hotbar
export class UI {
    constructor(worldSaver, world, player) {
        this.worldSaver = worldSaver;
        this.world = world;
        this.player = player;
        
        this.saveWorld = this.saveWorld.bind(this);
        this.loadWorld = this.loadWorld.bind(this);
        this.handleFileUpload = this.handleFileUpload.bind(this);
        this.updateHotbarSelection = this.updateHotbarSelection.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
    }

    setupUI() {
        console.log('Setting up UI');
        
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.hideInstructions());
        }

        const loadBtn = document.getElementById('loadBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.loadWorld());
        }

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveWorld());
        }

        this.fileInput = document.getElementById('fileInput');
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }

        // Scroll na hotbar
        document.addEventListener('wheel', (e) => this.handleScroll(e), { passive: false });

        // Ustaw początkowy stan hotbara
        this.updateHotbarSelection();
    }

    hideInstructions() {
        const instructions = document.getElementById('instructions');
        if (instructions) {
            instructions.classList.add('hidden');
        }
    }

    updateStats(stats) {
        const fpsEl = document.getElementById('fps');
        if (fpsEl) fpsEl.textContent = stats.fps;
        
        const posEl = document.getElementById('pos');
        if (posEl) {
            posEl.textContent = `${stats.position.x}, ${stats.position.y}, ${stats.position.z}`;
        }
        
        const chunksEl = document.getElementById('chunks');
        if (chunksEl) chunksEl.textContent = stats.chunks;
    }

    updateHotbarSelection() {
        const selection = document.getElementById('hotbar-selection');
        const hotbarImg = document.getElementById('hotbar-img');
        if (!selection || !hotbarImg) return;

        // Każdy slot: szerokość hotbara / 9 slotów
        const slotWidth = hotbarImg.offsetWidth / 9;
        const slotIndex = this.player.selectedBlock - 1;
        const offsetX = slotIndex * slotWidth;

        selection.style.left = offsetX + 'px';
        selection.style.display = 'block';
    }

    handleScroll(e) {
        if (!this.player.pointerLocked) return;
        
        e.preventDefault();
        
        if (e.deltaY < 0) {
            // Scroll up - poprzedni slot
            this.player.selectedBlock--;
            if (this.player.selectedBlock < 1) this.player.selectedBlock = 9;
        } else {
            // Scroll down - następny slot
            this.player.selectedBlock++;
            if (this.player.selectedBlock > 9) this.player.selectedBlock = 1;
        }
        
        this.updateBlockDisplay();
        this.updateHotbarSelection();
    }

    updateBlockDisplay() {
        const blockNames = ['', 'GRASS', 'DIRT', 'STONE', 'WOOD', 'LEAVES', '', '', ''];
        document.getElementById('block').textContent = blockNames[this.player.selectedBlock] || 'EMPTY';
    }

    handleHotbarClick(e) {
        const hotbarImg = document.getElementById('hotbar-img');
        const rect = hotbarImg.getBoundingClientRect();
        const x = e.clientX - rect.left;

        const slotWidth = hotbarImg.offsetWidth / 9;
        const slotIndex = Math.floor(x / slotWidth);

        if (slotIndex >= 0 && slotIndex < 9) {
            this.player.selectedBlock = slotIndex + 1;
            this.updateBlockDisplay();
            this.updateHotbarSelection();
        }
    }

    saveWorld() {
        if (!this.player || !this.world || !this.worldSaver) {
            alert('Gracz, świat lub saver nie jest gotowy!');
            return;
        }
        try {
            this.worldSaver.downloadWorld(this.world, this.player);
            alert('Świat zapisany!');
        } catch (err) {
            alert('Błąd przy zapisywaniu: ' + err.message);
            console.error('Save error:', err);
        }
    }

    loadWorld() {
        this.fileInput.click();
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.player) return;
        this.worldSaver.uploadWorld(file, this.world, this.player).then(() => {
            alert('Świat załadowany!');
        }).catch((err) => {
            alert('Błąd przy wczytywaniu: ' + err.message);
        });
    }
}