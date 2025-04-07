import Pusher from 'pusher';

// Inizializza Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

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
function updateSnakePosition(player, direction, food) {
  console.log('Aggiornamento posizione serpente per:', player.id);
  
  const gridSize = 20;
  const head = { ...player.snake[0] };
  
  // Aggiorna la posizione della testa in base alla direzione
  switch (direction) {
    case 'up':
      head.y -= gridSize;
      // Gestisce il wrapping dell'area di gioco
      if (head.y < 0) head.y = 600 - gridSize;
      break;
    case 'down':
      head.y += gridSize;
      // Gestisce il wrapping dell'area di gioco
      if (head.y >= 600) head.y = 0;
      break;
    case 'left':
      head.x -= gridSize;
      // Gestisce il wrapping dell'area di gioco
      if (head.x < 0) head.x = 600 - gridSize;
      break;
    case 'right':
      head.x += gridSize;
      // Gestisce il wrapping dell'area di gioco
      if (head.x >= 600) head.x = 0;
      break;
    default:
      return { player, food };
  }
  
  // Crea una nuova testa
  const newSnake = [head, ...player.snake];
  let newFood = food;
  
  // Controlla se il serpente ha mangiato il cibo
  if (head.x === food.x && head.y === food.y) {
    // Aumenta il punteggio
    player.score += 10;
    
    // Genera nuovo cibo
    newFood = generateFood();
    console.log('Cibo mangiato! Nuovo cibo:', newFood);
  } else {
    // Rimuovi l'ultimo segmento se non ha mangiato
    newSnake.pop();
  }
  
  // Aggiorna il serpente del giocatore
  player.snake = newSnake;
  player.direction = direction;
  
  return { player, food: newFood };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  try {
    console.log('Richiesta move ricevuta:', req.body);
    
    const { playerId, direction, playerState, foodState } = req.body;
    
    if (!playerId || !direction || !playerState || !foodState) {
      return res.status(400).json({ error: 'Dati insufficienti per aggiornare il gioco' });
    }
    
    console.log('Stato attuale ricevuto dal client:', { player: playerState, food: foodState });
    
    // Aggiorna la posizione del serpente
    const { player: updatedPlayer, food: updatedFood } = updateSnakePosition(
      playerState, 
      direction, 
      foodState
    );
    
    console.log('Stato aggiornato:', { player: updatedPlayer, food: updatedFood });
    
    // Notifica tutti i client del movimento
    await pusher.trigger('snake-game', 'player-moved', {
      playerId: playerId,
      player: updatedPlayer,
      food: updatedFood
    });
    
    return res.status(200).json({
      player: updatedPlayer,
      food: updatedFood
    });
  } catch (error) {
    console.error('Errore durante il movimento:', error);
    return res.status(500).json({ error: 'Errore del server' });
  }
} 