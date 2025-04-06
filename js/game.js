class Game {
    constructor() {
        this.playerId = null;
        this.gameState = {
            players: {},
            powerUps: {},
            food: {}
        };
        
        // URL base per le API
        this.apiUrl = 'https://snake-battle.vercel.app/api';
        
        // Inizializza Pusher
        try {
            this.pusher = new Pusher('e8c4c5037257e24d1134', {
                cluster: 'eu',
                encrypted: true
            });
            
            this.channel = this.pusher.subscribe('game-channel');
            this.setupEventListeners();
            console.log('Pusher inizializzato con successo');
        } catch (error) {
            console.error('Errore durante l\'inizializzazione di Pusher:', error);
            alert('Errore di connessione al server. Riprova più tardi.');
        }
    }
    
    setupEventListeners() {
        // Eventi UI
        const startButton = document.getElementById('startButton');
        const restartButton = document.getElementById('restartButton');
        
        if (startButton) {
            startButton.addEventListener('click', () => this.joinGame());
        } else {
            console.error('Pulsante start non trovato!');
        }
        
        if (restartButton) {
            restartButton.addEventListener('click', () => this.restartGame());
        } else {
            console.error('Pulsante restart non trovato!');
        }
        
        // Eventi tastiera
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        // Eventi Pusher
        if (this.channel) {
            this.channel.bind('playerJoined', (data) => this.onPlayerJoined(data));
            this.channel.bind('gameState', (data) => this.onGameStateUpdate(data));
            this.channel.bind('powerUpSpawned', (data) => this.onPowerUpSpawned(data));
            this.channel.bind('powerUpCollected', (data) => this.onPowerUpCollected(data));
            this.channel.bind('foodSpawned', (data) => this.onFoodSpawned(data));
            this.channel.bind('foodEaten', (data) => this.onFoodEaten(data));
            this.channel.bind('gameOver', (data) => this.onGameOver(data));
        }
    }
    
    async joinGame() {
        const nameInput = document.getElementById('playerName');
        const colorInput = document.getElementById('playerColor');
        const name = nameInput.value.trim();
        const color = colorInput.value;
        
        if (!name) {
            alert('Inserisci un nome per iniziare!');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, color })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.id) {
                this.playerId = data.id;
                document.getElementById('nameInput').style.display = 'none';
                document.getElementById('leaderboard').style.display = 'block';
            }
        } catch (error) {
            console.error('Errore durante il join:', error);
            alert('Errore durante il join. Riprova.');
        }
    }
    
    async handleKeyPress(e) {
        if (!this.playerId) return;
        
        let direction = null;
        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                direction = 'up';
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                direction = 'down';
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                direction = 'left';
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                direction = 'right';
                break;
        }
        
        if (direction) {
            try {
                const response = await fetch(`${this.apiUrl}/move`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        playerId: this.playerId,
                        direction
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            } catch (error) {
                console.error('Errore durante il movimento:', error);
            }
        }
    }
    
    onPlayerJoined(player) {
        this.gameState.players[player.id] = player;
        this.updateLeaderboard();
    }
    
    onGameStateUpdate(newState) {
        this.gameState = newState;
        this.render();
        this.updateLeaderboard();
    }
    
    onPowerUpSpawned(powerUp) {
        this.gameState.powerUps[powerUp.id] = powerUp;
        this.render();
    }
    
    onPowerUpCollected(powerUpId) {
        delete this.gameState.powerUps[powerUpId];
        this.render();
    }
    
    onFoodSpawned(food) {
        this.gameState.food[food.id] = food;
        this.render();
    }
    
    onFoodEaten(foodId) {
        delete this.gameState.food[foodId];
        this.render();
    }
    
    onGameOver(data) {
        if (data.playerId === this.playerId) {
            document.getElementById('finalScore').textContent = data.score;
            document.getElementById('gameOver').style.display = 'block';
        }
        delete this.gameState.players[data.playerId];
        this.updateLeaderboard();
    }
    
    restartGame() {
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('nameInput').style.display = 'block';
        this.playerId = null;
    }
    
    updateLeaderboard() {
        const playerList = document.getElementById('playerList');
        playerList.innerHTML = '';
        
        const players = Object.values(this.gameState.players)
            .sort((a, b) => b.score - a.score);
        
        players.forEach(player => {
            const div = document.createElement('div');
            div.innerHTML = `
                <span style="color: ${player.color}">${player.name}</span>
                <span>${player.score}</span>
            `;
            playerList.appendChild(div);
        });
    }
    
    render() {
        if (!window.gameCore) {
            console.error('GameCore non inizializzato!');
            return;
        }
        
        try {
            window.gameCore.clear();
            window.gameCore.drawGrid();
            
            // Disegna il cibo
            Object.values(this.gameState.food).forEach(food => {
                window.gameCore.drawFood(food);
            });
            
            // Disegna i power-up
            Object.values(this.gameState.powerUps).forEach(powerUp => {
                window.gameCore.drawPowerUp(powerUp);
            });
            
            // Disegna i serpenti
            Object.values(this.gameState.players).forEach(player => {
                window.gameCore.drawSnake(player);
            });
        } catch (error) {
            console.error('Errore durante il rendering:', error);
        }
    }
}

// Inizializza il gioco quando la pagina è caricata
window.addEventListener('load', () => {
    try {
        window.game = new Game();
        console.log('Gioco inizializzato con successo');
    } catch (error) {
        console.error('Errore durante l\'inizializzazione del gioco:', error);
        alert('Errore durante l\'inizializzazione del gioco. Ricarica la pagina.');
    }
}); 