const express = require('express');
const Pusher = require('pusher');
const cors = require('cors');
const bodyParser = require('body-parser');

// Configurazione Pusher
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '1970487',
    key: process.env.PUSHER_KEY || 'e8c4c5037257e24d1134',
    secret: process.env.PUSHER_SECRET || '7ea70124ffd933139ab7',
    cluster: process.env.PUSHER_CLUSTER || 'eu',
    encrypted: true
});

// Costanti del gioco
const GRID_SIZE = 20;
const GAME_SPEED = 100;
const POWER_UP_SPAWN_INTERVAL = 10000;
const POWER_UP_DURATION = 5000;

// Stato del gioco
let gameState = {
    players: {},
    powerUps: {},
    food: {},
    lastUpdate: Date.now()
};

// Funzioni di utilità
function getRandomPosition() {
    return {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
    };
}

function spawnPowerUp() {
    const position = getRandomPosition();
    const powerUp = {
        id: Date.now().toString(),
        position,
        type: Math.random() < 0.5 ? 'speed' : 'size',
        createdAt: Date.now()
    };
    gameState.powerUps[powerUp.id] = powerUp;
    pusher.trigger('game-channel', 'powerUpSpawned', powerUp);
    
    setTimeout(() => {
        if (gameState.powerUps[powerUp.id]) {
            delete gameState.powerUps[powerUp.id];
            pusher.trigger('game-channel', 'powerUpCollected', powerUp.id);
        }
    }, POWER_UP_DURATION);
}

function spawnFood() {
    const position = getRandomPosition();
    const food = {
        id: Date.now().toString(),
        position,
        value: Math.floor(Math.random() * 3) + 1
    };
    gameState.food[food.id] = food;
    pusher.trigger('game-channel', 'foodSpawned', food);
}

// Classe Snake
class Snake {
    constructor(id, name, color, position) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.segments = [position];
        this.direction = 'right';
        this.nextDirection = 'right';
        this.score = 0;
        this.powerUps = {
            speed: false,
            size: false
        };
    }
    
    move() {
        this.direction = this.nextDirection;
        const head = { ...this.segments[0] };
        
        switch (this.direction) {
            case 'up':
                head.y = (head.y - 1 + GRID_SIZE) % GRID_SIZE;
                break;
            case 'down':
                head.y = (head.y + 1) % GRID_SIZE;
                break;
            case 'left':
                head.x = (head.x - 1 + GRID_SIZE) % GRID_SIZE;
                break;
            case 'right':
                head.x = (head.x + 1) % GRID_SIZE;
                break;
        }
        
        this.segments.unshift(head);
        
        // Controlla collisioni con il cibo
        const foodId = Object.keys(gameState.food).find(id => {
            const food = gameState.food[id];
            return food.position.x === head.x && food.position.y === head.y;
        });
        
        if (foodId) {
            const food = gameState.food[foodId];
            this.score += food.value;
            this.grow(food.value - 1);
            delete gameState.food[foodId];
            pusher.trigger('game-channel', 'foodEaten', foodId);
            spawnFood();
        } else {
            this.segments.pop();
        }
        
        // Controlla collisioni con i power-up
        const powerUpId = Object.keys(gameState.powerUps).find(id => {
            const powerUp = gameState.powerUps[id];
            return powerUp.position.x === head.x && powerUp.position.y === head.y;
        });
        
        if (powerUpId) {
            const powerUp = gameState.powerUps[powerUpId];
            this.powerUps[powerUp.type] = true;
            delete gameState.powerUps[powerUpId];
            pusher.trigger('game-channel', 'powerUpCollected', powerUpId);
            
            setTimeout(() => {
                this.powerUps[powerUp.type] = false;
            }, POWER_UP_DURATION);
        }
        
        // Controlla collisioni con altri serpenti
        const collision = Object.values(gameState.players).some(player => {
            if (player.id === this.id) return false;
            return player.segments.some(segment => 
                segment.x === head.x && segment.y === head.y
            );
        });
        
        if (collision) {
            this.gameOver();
        }
    }
    
    grow(amount) {
        for (let i = 0; i < amount; i++) {
            const tail = this.segments[this.segments.length - 1];
            this.segments.push({ ...tail });
        }
    }
    
    gameOver() {
        pusher.trigger('game-channel', 'gameOver', {
            playerId: this.id,
            score: this.score
        });
        delete gameState.players[this.id];
    }
}

// Configurazione Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Middleware per gestire gli errori
app.use((err, req, res, next) => {
    console.error('Errore:', err);
    res.status(500).json({ error: 'Errore interno del server' });
});

// Route per l'autenticazione Pusher
app.post('/pusher/auth', (req, res) => {
    try {
        const socketId = req.body.socket_id;
        const channel = req.body.channel_name;
        
        if (!socketId || !channel) {
            return res.status(400).json({ error: 'Parametri mancanti' });
        }
        
        const auth = pusher.authorizeChannel(socketId, channel);
        res.json(auth);
    } catch (error) {
        console.error('Errore di autenticazione Pusher:', error);
        res.status(500).json({ error: 'Errore di autenticazione' });
    }
});

// Route per il join del giocatore
app.post('/join', (req, res) => {
    try {
        const { name, color } = req.body;
        
        if (!name || !color) {
            return res.status(400).json({ error: 'Nome e colore sono richiesti' });
        }
        
        const id = Date.now().toString();
        const position = getRandomPosition();
        
        const snake = new Snake(id, name, color, position);
        gameState.players[id] = snake;
        
        pusher.trigger('game-channel', 'playerJoined', snake);
        res.json({ id });
    } catch (error) {
        console.error('Errore durante il join:', error);
        res.status(500).json({ error: 'Errore durante il join' });
    }
});

// Route per il movimento del serpente
app.post('/move', (req, res) => {
    try {
        const { playerId, direction } = req.body;
        
        if (!playerId || !direction) {
            return res.status(400).json({ error: 'ID giocatore e direzione sono richiesti' });
        }
        
        const snake = gameState.players[playerId];
        if (!snake) {
            return res.status(404).json({ error: 'Giocatore non trovato' });
        }
        
        snake.nextDirection = direction;
        res.json({ success: true });
    } catch (error) {
        console.error('Errore durante il movimento:', error);
        res.status(500).json({ error: 'Errore durante il movimento' });
    }
});

// Route per ottenere lo stato del gioco
app.get('/gameState', (req, res) => {
    try {
        res.json(gameState);
    } catch (error) {
        console.error('Errore durante il recupero dello stato:', error);
        res.status(500).json({ error: 'Errore durante il recupero dello stato' });
    }
});

// Route per il controllo dello stato del server
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Avvia il server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log(`Server in esecuzione sulla porta ${port}`);
    
    // Spawn iniziale del cibo
    for (let i = 0; i < 5; i++) {
        spawnFood();
    }
    
    // Spawn periodico dei power-up
    setInterval(spawnPowerUp, POWER_UP_SPAWN_INTERVAL);
    
    // Loop di gioco
    setInterval(() => {
        Object.values(gameState.players).forEach(snake => snake.move());
        pusher.trigger('game-channel', 'gameState', gameState);
    }, GAME_SPEED);
});

// Gestione degli errori non catturati
process.on('uncaughtException', (error) => {
    console.error('Errore non catturato:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Promise rejection non gestita:', error);
});

module.exports = app; 