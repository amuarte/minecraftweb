// worldSaver.js - Zapis i wczytywanie świata
import { BLOCKS } from './config.js';

export class WorldSaver {
    static createSeed() {
        return Math.floor(Math.random() * 1000000);
    }

    static saveWorld(world, player) {
        console.log('saveWorld called with:', {world: !!world, player: !!player});
        
        if (!player) {
            throw new Error('Player is undefined in saveWorld');
        }
        
        const data = {
            seed: world.seed,
            timestamp: new Date().toISOString(),
            version: 1,
            player: {
                position: {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z
                },
                rotation: {
                    x: player.rotation.x,
                    y: player.rotation.y,
                    z: player.rotation.z
                },
                selectedBlock: player.selectedBlock,
                flying: player.flying
            },
            changes: {}
        };

        // Zapisz tylko zmienione bloki
        world.chunks.forEach((chunk, key) => {
            const [cx, cz] = key.split(',').map(Number);
            
            for (let i = 0; i < chunk.blocks.length; i++) {
                const block = chunk.blocks[i];
                
                // Regeneruj jaki powinien być blok
                const x = i % 16;
                const z = Math.floor((i % (16 * 16)) / 16);
                const y = Math.floor(i / (16 * 16));
                
                const expectedBlock = this.getExpectedBlock(cx * 16 + x, y, cz * 16 + z, world.seed);
                
                // Jeśli się różni, zapisz zmianę
                if (block !== expectedBlock) {
                    data.changes[`${cx},${cz},${x},${y},${z}`] = block;
                }
            }
        });

        return JSON.stringify(data, null, 2);
    }

    static getExpectedBlock(x, y, z, seed) {
        const n = Math.sin(x * 0.1 + seed) * Math.cos(z * 0.1 + seed) * 5 +
                  Math.sin(x * 0.05 + seed) * Math.cos(z * 0.05 + seed) * 10;
        const height = Math.floor(n + 32);

        if (y < height - 5) return BLOCKS.STONE;
        if (y < height - 1) return BLOCKS.DIRT;
        if (y < height) return BLOCKS.GRASS;
        return BLOCKS.AIR;
    }

    static loadWorld(jsonString, world, player) {
        const data = JSON.parse(jsonString);
        
        world.seed = data.seed;
        
        // Wczytaj pozycję gracza
        if (data.player) {
            player.position.set(data.player.position.x, data.player.position.y, data.player.position.z);
            player.rotation.set(data.player.rotation.x, data.player.rotation.y, data.player.rotation.z);
            player.selectedBlock = data.player.selectedBlock;
            player.flying = data.player.flying;
            document.getElementById('flying').textContent = player.flying ? 'YES' : 'NO';
        }
        
        // Wczytaj zmiany
        Object.entries(data.changes).forEach(([key, blockType]) => {
            const [cx, cz, x, y, z] = key.split(',').map(Number);
            
            // Stwórz chunk jeśli nie istnieje
            world.createChunk(cx, cz);
            
            // Ustaw blok
            const chunk = world.getChunk(cx, cz);
            chunk.setBlock(x, y, z, blockType);
            chunk.buildMesh();
        });
        
        return data.seed;
    }

    static downloadWorld(world, player) {
        const data = this.saveWorld(world, player);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `world_${new Date().getTime()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    static uploadWorld(file, world, player) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const seed = this.loadWorld(e.target.result, world, player);
                    resolve(seed);
                } catch (err) {
                    reject(err);
                }
            };
            
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }
}