const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Configurazione base
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Stato del gioco
const gameState = {
  players: {},
  foodItems: []
};

// Dimensioni del campo di gioco
const GRID_SIZE = 20;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Genera posizione casuale sulla griglia
const generateRandomPosition = () => {
  return {
    x: Math.floor(Math.random() * (GAME_WIDTH / GRID_SIZE)) * GRID_SIZE,
    y: Math.floor(Math.random() * (GAME_HEIGHT / GRID_SIZE)) * GRID_SIZE
  };
};

// Genera cibo all'inizio
for (let i = 0; i < 5; i++) {
  gameState.foodItems.push(generateRandomPosition());
}

// Gestione connessioni Socket.io
io.on('connection', (socket) => {
  console.log('Nuovo client connesso:', socket.id);
  
  // Gestione di un nuovo giocatore
  socket.on('join', (data) => {
    // Crea posizione iniziale per il serpente
    const initialSnake = [
      { x: 100, y: 100 },
      { x: 80, y: 100 },
      { x: 60, y: 100 }
    ];
    
    // Registra il nuovo giocatore
    gameState.players[socket.id] = {
      id: socket.id,
      name: data.playerName || 'Giocatore',
      color: data.playerColor || '#4CAF50',
      snake: initialSnake,
      direction: 'right',
      score: 0,
      lastUpdate: Date.now()
    };
    
    // Invia stato iniziale al giocatore
    socket.emit('gameState', {
      player: gameState.players[socket.id],
      foodItems: gameState.foodItems,
      otherPlayers: Object.values(gameState.players).filter(p => p.id !== socket.id)
    });
    
    // Notifica tutti gli altri giocatori
    socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
  });
  
  // Aggiornamento della posizione del giocatore
  socket.on('updatePlayer', (playerData) => {
    if (!gameState.players[socket.id]) return;
    
    gameState.players[socket.id] = {
      ...gameState.players[socket.id],
      ...playerData,
      lastUpdate: Date.now()
    };
    
    // Invia l'aggiornamento a tutti gli altri
    socket.broadcast.emit('playerMoved', gameState.players[socket.id]);
  });
  
  // Ping per mantenere la connessione attiva
  socket.on('ping', () => {
    socket.emit('pong', { time: Date.now() });
  });
  
  // Gestione disconnessione
  socket.on('disconnect', () => {
    console.log('Client disconnesso:', socket.id);
    
    if (gameState.players[socket.id]) {
      // Notifica tutti gli altri giocatori
      socket.broadcast.emit('playerLeft', socket.id);
      
      // Rimuovi il giocatore
      delete gameState.players[socket.id];
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    players: Object.keys(gameState.players).length,
    foodItems: gameState.foodItems.length
  });
});

// API per ottenere lo stato attuale del gioco
app.get('/api/state', (req, res) => {
  res.json({
    players: gameState.players,
    foodItems: gameState.foodItems
  });
});

// API per unirsi al gioco
app.post('/api/join', (req, res) => {
  const { playerName, playerColor } = req.body;
  
  if (!playerName) {
    return res.status(400).json({ error: 'Nome giocatore richiesto' });
  }
  
  // Genera un ID casuale (normalmente gestito da socket.io)
  const playerId = 'api-' + Math.random().toString(36).substring(2, 9);
  
  // Crea posizione iniziale per il serpente
  const initialSnake = [
    { x: 100, y: 100 },
    { x: 80, y: 100 },
    { x: 60, y: 100 }
  ];
  
  // Registra il nuovo giocatore
  gameState.players[playerId] = {
    id: playerId,
    name: playerName,
    color: playerColor || '#4CAF50',
    snake: initialSnake,
    direction: 'right',
    score: 0,
    lastUpdate: Date.now()
  };
  
  // Ritorna i dati al client
  res.json({
    player: gameState.players[playerId],
    foodItems: gameState.foodItems,
    otherPlayers: Object.values(gameState.players).filter(p => p.id !== playerId)
  });
});

// Gestione degli errori non catturati
process.on('uncaughtException', (err) => {
  console.error('ERRORE NON CATTURATO:', err);
  // Continua l'esecuzione senza crash
});

// Avvio del server
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server in esecuzione su porta ${PORT}`);
  });
}

// Esportazione per l'uso con Vercel
module.exports = app; 