// commandSystem.js - Prosty system komend w grze
export class CommandSystem {
    constructor(game) {
        this.game = game;
        this.isOpen = false;
        this.commandInput = '';
        this.setupUI();
        this.setupListeners();
    }

    setupUI() {
        // Pasek do wpisywania komend jak w Minecraft - na dole po lewej
        const container = document.createElement('div');
        container.id = 'command-system';
        container.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #888;
            color: #fff;
            padding: 4px 6px;
            font-family: monospace;
            font-size: 13px;
            z-index: 99;
            display: none;
            width: 320px;
        `;

        // Input - minimalistyczny jak w Minecraft
        const input = document.createElement('input');
        input.id = 'command-input';
        input.type = 'text';
        input.placeholder = 'Wpisz komendę (/)...';
        input.style.cssText = `
            background: rgba(0, 0, 0, 0.6);
            border: 1px solid #666;
            color: #fff;
            font-family: monospace;
            font-size: 13px;
            outline: none;
            width: 100%;
            padding: 4px 6px;
            box-sizing: border-box;
        `;
        input.addEventListener('focus', () => {
            input.style.borderColor = '#aaa';
        });
        input.addEventListener('blur', () => {
            input.style.borderColor = '#666';
        });

        container.appendChild(input);
        document.body.appendChild(container);

        this.container = container;
        this.input = input;
    }

    setupListeners() {
        document.addEventListener('keydown', (e) => {
            // `/` aktywuje system komend
            if (e.key === '/' && !this.isOpen) {
                e.preventDefault();
                this.open();
                return;
            }

            // Gdy panel jest otwarty
            if (this.isOpen) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const cmd = this.input.value.trim();
                    if (cmd) {
                        this.executeCommand(cmd);
                    }
                    this.input.value = '';
                    this.close();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.input.value = '';
                    this.close();
                }
            }
        });
    }

    open() {
        this.isOpen = true;
        this.container.style.display = 'block';
        this.input.focus();
        this.input.value = '/';
        this.input.setSelectionRange(1, 1); // Kursor po `/`
    }

    close() {
        this.isOpen = false;
        this.container.style.display = 'none';
        this.input.blur();
    }

    executeCommand(cmd) {
        const parts = cmd.trim().split(/\s+/);
        const command = parts[0].toLowerCase();

        if (!command) return;

        console.log(`Command: ${cmd}`);

        switch (command) {
            case '/rot':
                this.cmdRotation(parts);
                break;
            case '/rotset':
                this.cmdRotationSet();
                break;
            case '/rotdefault':
                this.cmdRotationDefault();
                break;
            case '/help':
                this.cmdHelp();
                break;
            default:
                this.showNotification(`❌ Nieznana komenda: ${command}`, 3000);
        }
    }

    showNotification(text, duration = 2000) {
        // Pokaż tymczasowe powiadomienie
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            bottom: 120px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #888;
            color: #fff;
            padding: 6px 10px;
            font-family: monospace;
            font-size: 12px;
            z-index: 98;
        `;
        notif.textContent = text;
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.remove();
        }, duration);
    }

    cmdRotation(parts) {
        if (parts.length < 4) {
            this.showNotification('❌ Użycie: /rot <x> <y> <z> [order]', 3000);
            console.log('Przykład: /rot 25 45 0 XYZ');
            return;
        }

        try {
            const x = parseInt(parts[1]);
            const y = parseInt(parts[2]);
            const z = parseInt(parts[3]);
            const order = parts[4] || 'XYZ';

            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                this.showNotification('❌ X, Y, Z muszą być liczbami', 2000);
                return;
            }

            const xRad = (x * Math.PI) / 180;
            const yRad = (y * Math.PI) / 180;
            const zRad = (z * Math.PI) / 180;

            console.log('Updating rotation:', { x, y, z, order });

            if (this.game.guiManager) {
                this.game.guiManager.updateHotbarRotation(xRad, yRad, zRad, order);
                this.showNotification(`✅ Rotacja: X=${x}° Y=${y}° Z=${z}° (${order})`, 2000);
                console.log('✅ Rotation updated successfully');
            } else {
                this.showNotification('❌ GUIManager niedostępny', 2000);
                console.error('❌ guiManager not available');
            }
        } catch (err) {
            this.showNotification(`❌ Błąd: ${err.message}`, 3000);
            console.error('Command error:', err);
        }
    }

    cmdRotationSet() {
        const rot = window.blockRotation || {
            x: -Math.PI / 4,
            y: Math.PI / 4,
            z: 0,
            order: 'XYZ'
        };

        const xDeg = Math.round((rot.x * 180) / Math.PI);
        const yDeg = Math.round((rot.y * 180) / Math.PI);
        const zDeg = Math.round((rot.z * 180) / Math.PI);

        const msg = `Rotacja: X=${xDeg}° Y=${yDeg}° Z=${zDeg}° Order=${rot.order}`;
        this.showNotification(msg, 3000);
        console.log(msg);
    }

    cmdRotationDefault() {
        if (this.game.guiManager) {
            this.game.guiManager.updateHotbarRotation(0, 0, 0, 'XYZ');
            this.showNotification('✅ PERFECT ISOMETRIC! Domyślna rotacja (0° 0° 0°)', 2000);
            console.log('✅ Reset to perfect isometric (0° 0° 0° XYZ)');
        } else {
            this.showNotification('❌ GUIManager niedostępny', 2000);
        }
    }

    cmdHelp() {
        console.log('=== DOSTĘPNE KOMENDY ===');
        console.log('');
        console.log('/rot <x> <y> <z> [order] - Zmień rotację bloków w hotbarze');
        console.log('  Przykład: /rot 25 45 0 XYZ');
        console.log('');
        console.log('/rotset - Pokaż aktualne ustawienia rotacji');
        console.log('');
        console.log('/rotdefault - Resetuj na idealne ustawienia (0° 0° 0° XYZ) ⭐');
        console.log('');
        console.log('/help - Wyświetl tę pomoc');
        this.showNotification('ℹ️ Wyświetlone komendy w konsoli (F12)', 2000);
    }
}
