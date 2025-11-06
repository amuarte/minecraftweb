// soundManager.js - Zarządzanie dźwiękami kroków dla różnych materiałów
import { CONFIG, BLOCKS, getMaterialFromBlockId } from './config.js';

export class SoundManager {
    constructor(world) {
        this.world = world;
        this.stepSounds = {
            grass: [],
            leaves: [],
            stone: [],
            wood: [],
            dirt: []
        };
        this.lastStepTime = 0;
        this.lastPosition = { x: 0, y: 0, z: 0 };
        this.loadStepSounds();
    }

    loadStepSounds() {
        // Ładuj dźwięki trawy (grass1-6)
        for (let i = 1; i <= 6; i++) {
            const audio = new Audio(`./assets/minecraft/sounds/step/grass${i}.ogg`);
            audio.volume = 0.5;
            this.stepSounds.grass.push(audio);
        }

        // Ładuj dźwięki liści (leaves - assuming grass sounds dla liści)
        for (let i = 1; i <= 6; i++) {
            const audio = new Audio(`./assets/minecraft/sounds/step/grass${i}.ogg`);
            audio.volume = 0.5;
            this.stepSounds.leaves.push(audio);
        }

        // Ładuj dźwięki kamienia (stone1-6)
        for (let i = 1; i <= 6; i++) {
            const audio = new Audio(`./assets/minecraft/sounds/step/stone${i}.ogg`);
            audio.volume = 0.5;
            this.stepSounds.stone.push(audio);
        }

        // Ładuj dźwięki drewna (wood1-6)
        for (let i = 1; i <= 6; i++) {
            const audio = new Audio(`./assets/minecraft/sounds/step/wood${i}.ogg`);
            audio.volume = 0.5;
            this.stepSounds.wood.push(audio);
        }

        // Ładuj dźwięki piasku/żwiru (gravel1-4)
        for (let i = 1; i <= 4; i++) {
            const audio = new Audio(`./assets/minecraft/sounds/step/gravel${i}.ogg`);
            audio.volume = 0.5;
            this.stepSounds.dirt.push(audio);
        }

        console.log('✓ Dźwięki kroków załadowane');
    }

    getBlockUnderPlayer(position) {
        // Sprawdź czy world istnieje
        if (!this.world || !this.world.getBlock) {
            return 0; // AIR
        }
        
        // Sprawdź blok pod gracza (1 blok poniżej)
        const blockY = Math.floor(position.y) - 1;
        const blockX = Math.floor(position.x);
        const blockZ = Math.floor(position.z);

        const block = this.world.getBlock(blockX, blockY, blockZ);
        return block;
    }

    getMaterialFromBlock(blockType) {
        // Pobierz material z rejestru bloków
        return getMaterialFromBlockId(blockType);
    }

    playStepSound(currentPosition, velocity) {
        const now = performance.now();
        
        // Oblicz dystans przebytej drogi (horyzontalnie)
        const dx = currentPosition.x - this.lastPosition.x;
        const dz = currentPosition.z - this.lastPosition.z;
        const distanceMoved = Math.sqrt(dx * dx + dz * dz);
        
        // Oblicz prędkość ruchu (horyzontalnie)
        const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        
        // Im szybciej się porusza, tym krótsza przerwa między krokami
        const baseStepInterval = 0.95;
        const speedMultiplier = horizontalSpeed < 1 ? 1.0 : 1.8 / horizontalSpeed;
        const stepInterval = baseStepInterval * speedMultiplier;
        
        // Graj dźwięk tylko jeśli gracz faktycznie się ruszył i wystarczy czasu
        if (distanceMoved > 0.01 && now - this.lastStepTime > stepInterval * 1000) {
            this.lastStepTime = now;
            this.lastPosition = {
                x: currentPosition.x,
                y: currentPosition.y,
                z: currentPosition.z
            };
            
            // Sprawdź jaki materiał jest pod graczem
            const blockType = this.getBlockUnderPlayer(currentPosition);
            const material = this.getMaterialFromBlock(blockType);
            
            // Jeśli nie na odpowiednim materiale, nie graj dźwięku
            if (!material || !this.stepSounds[material]) {
                return;
            }
            
            const soundArray = this.stepSounds[material];
            const randomIndex = Math.floor(Math.random() * soundArray.length);
            const audio = soundArray[randomIndex];
            
            // Restartuj dźwięk jeśli się już gra
            audio.currentTime = 0;
            audio.play().catch(err => {
                console.log('Audio play failed:', err);
            });
        }
    }

    setVolume(volume) {
        Object.values(this.stepSounds).forEach(soundArray => {
            soundArray.forEach(audio => {
                audio.volume = Math.max(0, Math.min(1, volume));
            });
        });
    }
}