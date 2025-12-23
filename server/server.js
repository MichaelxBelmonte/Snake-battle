const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Configurazione
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Costanti di gioco
const GRID_SIZE = 20;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const TICK_RATE = 100; // ms - il server aggiorna ogni 100ms (10 FPS) - velocità bilanciata

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO con CORS aperto per sviluppo
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 10000,
  pingInterval: 5000
});

// ==================== GAME STATE ====================
const gameState = {
  players: {},
  food: []
};

// Genera posizione casuale sulla griglia
function randomPosition() {
  return {
    x: Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE,
    y: Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE)) * GRID_SIZE
  };
}

// Genera cibo con tipo casuale
function generateFood() {
  const rand = Math.random();
  let type, points, color;

  if (rand < 0.6) {
    // 60% - Cibo normale (rosso)
    type = 'normal';
    points = 10;
    color = '#FF6347';
  } else if (rand < 0.85) {
    // 25% - Cibo bonus (oro)
    type = 'bonus';
    points = 25;
    color = '#FFD700';
  } else {
    // 15% - Super cibo (viola)
    type = 'super';
    points = 50;
    color = '#9932CC';
  }

  return {
    ...randomPosition(),
    type,
    points,
    color
  };
}

// Genera posizione iniziale per nuovo serpente (evita sovrapposizioni)
function generateSpawnPosition() {
  const margin = GRID_SIZE * 5;
  return {
    x: margin + Math.floor(Math.random() * ((GAME_WIDTH - margin * 2) / GRID_SIZE)) * GRID_SIZE,
    y: margin + Math.floor(Math.random() * ((GAME_HEIGHT - margin * 2) / GRID_SIZE)) * GRID_SIZE
  };
}

// Inizializza cibo
function initFood() {
  gameState.food = [];
  for (let i = 0; i < 8; i++) {
    gameState.food.push(generateFood());
  }
}

// Muovi un serpente in base alla direzione
function moveSnake(player) {
  if (!player.snake || player.snake.length === 0) return;

  const head = { ...player.snake[0] };

  // Muovi in base alla direzione
  switch (player.direction) {
    case 'up': head.y -= GRID_SIZE; break;
    case 'down': head.y += GRID_SIZE; break;
    case 'left': head.x -= GRID_SIZE; break;
    case 'right': head.x += GRID_SIZE; break;
  }

  // Wraparound
  if (head.x < 0) head.x = GAME_WIDTH - GRID_SIZE;
  if (head.x >= GAME_WIDTH) head.x = 0;
  if (head.y < 0) head.y = GAME_HEIGHT - GRID_SIZE;
  if (head.y >= GAME_HEIGHT) head.y = 0;

  // Aggiungi nuova testa
  player.snake.unshift(head);

  // Controlla collisione con cibo
  let ate = false;
  for (let i = 0; i < gameState.food.length; i++) {
    const food = gameState.food[i];
    if (head.x === food.x && head.y === food.y) {
      ate = true;
      player.score += food.points || 10;
      // Rigenera il cibo in nuova posizione con nuovo tipo
      gameState.food[i] = generateFood();
      break;
    }
  }

  // Se non ha mangiato, rimuovi la coda
  if (!ate) {
    player.snake.pop();
  }
}

// Controlla collisioni tra serpenti
function checkCollisions() {
  const players = Object.values(gameState.players);

  for (const player of players) {
    if (!player.snake || player.snake.length === 0) continue;

    const head = player.snake[0];

    // Collisione con se stesso
    for (let i = 1; i < player.snake.length; i++) {
      if (head.x === player.snake[i].x && head.y === player.snake[i].y) {
        // Reset del serpente
        respawnPlayer(player);
        break;
      }
    }

    // Collisione con altri serpenti
    for (const other of players) {
      if (other.id === player.id) continue;
      if (!other.snake) continue;

      for (const segment of other.snake) {
        if (head.x === segment.x && head.y === segment.y) {
          // Il giocatore che collide muore
          respawnPlayer(player);
          // L'altro guadagna punti e una kill
          other.score += 50;
          other.kills = (other.kills || 0) + 1;
          break;
        }
      }
    }
  }
}

// Respawn di un giocatore
function respawnPlayer(player) {
  const spawn = generateSpawnPosition();
  player.snake = [
    spawn,
    { x: spawn.x - GRID_SIZE, y: spawn.y },
    { x: spawn.x - GRID_SIZE * 2, y: spawn.y }
  ];
  player.direction = 'right';
  player.score = 0; // Reset score to zero on death
  player.deaths = (player.deaths || 0) + 1; // Track deaths
}

// ==================== GAME LOOP ====================
function gameTick() {
  // Muovi tutti i serpenti
  for (const player of Object.values(gameState.players)) {
    moveSnake(player);
  }

  // Controlla collisioni
  checkCollisions();

  // Broadcast stato a tutti i client
  const state = {
    players: Object.values(gameState.players).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      snake: p.snake,
      direction: p.direction,
      score: p.score,
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      length: p.snake ? p.snake.length : 0
    })),
    food: gameState.food,
    timestamp: Date.now()
  };

  io.emit('gameState', state);
}

// Avvia il game loop
let gameLoop = null;
function startGameLoop() {
  if (gameLoop) return;
  gameLoop = setInterval(gameTick, TICK_RATE);
  console.log(`Game loop avviato (${1000/TICK_RATE} FPS)`);
}

function stopGameLoop() {
  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
    console.log('Game loop fermato');
  }
}

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log(`Client connesso: ${socket.id}`);

  // Giocatore si unisce
  socket.on('join', (data) => {
    const spawn = generateSpawnPosition();

    gameState.players[socket.id] = {
      id: socket.id,
      name: data.name || 'Player',
      color: data.color || '#4CAF50',
      snake: [
        spawn,
        { x: spawn.x - GRID_SIZE, y: spawn.y },
        { x: spawn.x - GRID_SIZE * 2, y: spawn.y }
      ],
      direction: 'right',
      score: 0
    };

    console.log(`Giocatore ${data.name} (${socket.id}) si è unito`);

    // Invia conferma al giocatore
    socket.emit('joined', {
      id: socket.id,
      player: gameState.players[socket.id]
    });

    // Avvia game loop se c'è almeno un giocatore
    if (Object.keys(gameState.players).length >= 1) {
      startGameLoop();
    }
  });

  // Giocatore cambia direzione
  socket.on('direction', (dir) => {
    const player = gameState.players[socket.id];
    if (!player) return;

    // Previeni inversione (non puoi andare nella direzione opposta)
    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposites[dir] !== player.direction) {
      player.direction = dir;
    }
  });

  // Ping per latenza
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });

  // Disconnessione
  socket.on('disconnect', () => {
    console.log(`Client disconnesso: ${socket.id}`);

    if (gameState.players[socket.id]) {
      const name = gameState.players[socket.id].name;
      delete gameState.players[socket.id];
      console.log(`Giocatore ${name} rimosso`);

      // Notifica altri giocatori
      io.emit('playerLeft', socket.id);
    }

    // Ferma game loop se non ci sono più giocatori
    if (Object.keys(gameState.players).length === 0) {
      stopGameLoop();
    }
  });
});

// ==================== HTTP ENDPOINTS ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    players: Object.keys(gameState.players).length,
    uptime: process.uptime()
  });
});

app.get('/state', (req, res) => {
  res.json(gameState);
});

// ==================== STARTUP ====================
initFood();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
========================================
   SNAKE BATTLE - SERVER AUTHORITATIVE
========================================
   Server: http://localhost:${PORT}
   Network: http://0.0.0.0:${PORT}
   Tick Rate: ${1000/TICK_RATE} FPS
========================================
  `);
});
