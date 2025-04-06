import Pusher from 'pusher';

// Inizializza Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

// Stato del gioco (in memoria)
let gameState = {
  players: [],
  food: { x: 0, y: 0 }
};

// Genera una posizione casuale per il cibo
function generateFood() {
  const gridSize = 20;
  const maxX = 30;
  const maxY = 30;
  
  return {
    x: Math.floor(Math.random() * maxX) * gridSize,
    y: Math.floor(Math.random() * maxY) * gridSize
  };
}

// Aggiorna la posizione del serpente
function updateSnakePosition(player, direction) {
  const gridSize = 20;
  const head = { ...player.snake[0] };
  
  // Aggiorna la posizione della testa in base alla direzione
  switch (direction) {
    case 'up':
      head.y -= gridSize;
      break;
    case 'down':
      head.y += gridSize;
      break;
    case 'left':
      head.x -= gridSize;
      break;
    case 'right':
      head.x += gridSize;
      break;
    default:
      return player;
  }
  
  // Crea una nuova testa
  const newSnake = [head, ...player.snake];
  
  // Controlla se il serpente ha mangiato il cibo
  if (head.x === gameState.food.x && head.y === gameState.food.y) {
    // Aumenta il punteggio
    player.score += 10;
    
    // Genera nuovo cibo
    gameState.food = generateFood();
  } else {
    // Rimuovi l'ultimo segmento se non ha mangiato
    newSnake.pop();
  }
  
  // Aggiorna il serpente del giocatore
  player.snake = newSnake;
  player.direction = direction;
  
  return player;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  try {
    const { playerId, direction } = req.body;
    
    if (!playerId || !direction) {
      return res.status(400).json({ error: 'ID giocatore e direzione sono richiesti' });
    }
    
    // Trova il giocatore
    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
    
    if (playerIndex === -1) {
      return res.status(404).json({ error: 'Giocatore non trovato' });
    }
    
    // Aggiorna la posizione del serpente
    const updatedPlayer = updateSnakePosition(gameState.players[playerIndex], direction);
    gameState.players[playerIndex] = updatedPlayer;
    
    // Notifica tutti i client del movimento
    await pusher.trigger('snake-game', 'player-moved', {
      players: gameState.players,
      food: gameState.food
    });
    
    return res.status(200).json({
      players: gameState.players,
      food: gameState.food
    });
  } catch (error) {
    console.error('Errore durante il movimento:', error);
    return res.status(500).json({ error: 'Errore del server' });
  }
} 