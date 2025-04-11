import Pusher from 'pusher';

// Inizializza Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true
});

// Funzione per ottenere l'istanza di Pusher
const getPusherInstance = () => {
  return pusher;
};

// Importa lo stato globale dal file join.js
import { gameState } from './join.js';

// Genera una posizione casuale sulla griglia
const generateRandomPosition = (excludePositions = []) => {
  const gridSize = 20;
  const maxX = 800 - gridSize;
  const maxY = 600 - gridSize;
  
  let newPosition;
  let isColliding;
  
  do {
    isColliding = false;
    newPosition = {
      x: Math.floor(Math.random() * (maxX / gridSize)) * gridSize,
      y: Math.floor(Math.random() * (maxY / gridSize)) * gridSize
    };
    
    // Verifica collisioni con posizioni da escludere
    for (const pos of excludePositions) {
      if (pos.x === newPosition.x && pos.y === newPosition.y) {
        isColliding = true;
        break;
      }
    }
  } while (isColliding);
  
  return newPosition;
};

// Verifica collisione con cibo
const checkFoodCollision = (head, foodItems) => {
  for (let i = 0; i < foodItems.length; i++) {
    if (head.x === foodItems[i].x && head.y === foodItems[i].y) {
      return i; // Restituisce l'indice del cibo colliso
    }
  }
  return -1; // Nessuna collisione
};

// Verifica collisione con serpenti (incluso se stesso)
const checkSnakeCollision = (head, snake, otherSnakes, ignoreHead = false) => {
  // Controlla collisione con se stesso (esclusa la testa)
  for (let i = ignoreHead ? 1 : 0; i < snake.length; i++) {
    if (head.x === snake[i].x && head.y === snake[i].y) {
      return true;
    }
  }
  
  // Controlla collisione con altri serpenti
  for (const otherSnake of otherSnakes) {
    for (const segment of otherSnake) {
      if (head.x === segment.x && head.y === segment.y) {
        return true;
      }
    }
  }
  
  return false;
};

export default async function handler(req, res) {
  // Abilita CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Gestisci la richiesta OPTIONS per CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }
  
  try {
    const { playerId, direction, playerState } = req.body;
    
    if (!playerId || !direction || !playerState) {
      return res.status(400).json({ error: 'Dati mancanti nella richiesta' });
    }
    
    // Pulisci i giocatori inattivi (non aggiornati negli ultimi 30 secondi)
    const now = Date.now();
    gameState.players = gameState.players.filter(player => {
      const isActive = now - player.lastUpdate < 30000;
      if (!isActive) {
        console.log(`Rimuovo giocatore inattivo: ${player.id}`);
      }
      return isActive;
    });
    
    // Cerca il giocatore nello stato del gioco
    let player = gameState.players.find(p => p.id === playerId);
    
    if (!player) {
      // Aggiungi giocatore se non esiste (potrebbe accadere se il server viene riavviato)
      player = playerState;
      gameState.players.push(player);
    } else {
      // Aggiorna lo stato del giocatore con i nuovi dati
      player.snake = playerState.snake;
      player.score = playerState.score;
      player.name = playerState.name;
      player.color = playerState.color;
    }
    
    // Ottieni la posizione della testa e movimento precedente
    const head = { ...player.snake[0] };
    const gridSize = 20;
    let newHead;
    
    // Calcola la nuova posizione della testa
    switch (direction) {
      case 'up':
        newHead = { x: head.x, y: head.y - gridSize };
        break;
      case 'down':
        newHead = { x: head.x, y: head.y + gridSize };
        break;
      case 'left':
        newHead = { x: head.x - gridSize, y: head.y };
        break;
      case 'right':
        newHead = { x: head.x + gridSize, y: head.y };
        break;
      default:
        newHead = { ...head };
    }
    
    // Gestisci il movimento oltre i bordi (effetto tunnel)
    if (newHead.x < 0) newHead.x = 800 - gridSize;
    if (newHead.x >= 800) newHead.x = 0;
    if (newHead.y < 0) newHead.y = 600 - gridSize;
    if (newHead.y >= 600) newHead.y = 0;
    
    // Ottieni gli altri serpenti per il controllo delle collisioni
    const otherSnakes = gameState.players
      .filter(p => p.id !== playerId)
      .map(p => p.snake || []);
    
    // Controlla collisione con altri serpenti
    const collidesWithSnake = checkSnakeCollision(newHead, player.snake, otherSnakes, true);
    
    if (collidesWithSnake) {
      // Game over - reimposta il serpente
      console.log(`Game over per il giocatore ${playerId}`);
      
      // Genera una nuova posizione sicura per ricominciare
      const allPositions = [
        ...gameState.foodItems,
        ...gameState.players.flatMap(p => p.snake || [])
      ];
      const safePosition = generateRandomPosition(allPositions);
      
      // Ricrea il serpente
      player.snake = [
        safePosition,
        { x: safePosition.x - gridSize, y: safePosition.y },
        { x: safePosition.x - (2 * gridSize), y: safePosition.y }
      ];
      player.score = 0; // Reimposta il punteggio
    } else {
      // Controlla collisione con cibo
      const foodIndex = checkFoodCollision(newHead, gameState.foodItems);
      
      if (foodIndex >= 0) {
        // Rimuovi il cibo consumato
        gameState.foodItems.splice(foodIndex, 1);
        
        // Aumenta il punteggio
        player.score += 10;
        
        // Genera nuovo cibo
        const occupiedPositions = [
          ...gameState.foodItems,
          ...gameState.players.flatMap(p => p.snake || [])
        ];
        gameState.foodItems.push(generateRandomPosition(occupiedPositions));
        
        // Aggiorna il serpente (aggiunge un nuovo segmento senza rimuovere l'ultimo)
        player.snake = [newHead, ...player.snake];
      } else {
        // Movimento normale (togli l'ultimo segmento)
        player.snake = [newHead, ...player.snake.slice(0, -1)];
      }
    }
    
    // Aggiorna il timestamp
    player.lastUpdate = Date.now();
    
    // Assicurati che ci siano abbastanza elementi cibo
    while (gameState.foodItems.length < gameState.maxFood) {
      const occupiedPositions = [
        ...gameState.foodItems,
        ...gameState.players.flatMap(p => p.snake || [])
      ];
      gameState.foodItems.push(generateRandomPosition(occupiedPositions));
    }
    
    // Prepara i dati per gli altri giocatori (escluso il giocatore corrente)
    const otherPlayers = gameState.players
      .filter(p => p.id !== playerId)
      .map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        snake: p.snake,
        score: p.score
      }));
    
    // Configura Pusher
    const pusher = getPusherInstance();
    
    // Notifica tutti i client con la mossa del giocatore
    await pusher.trigger('snake-game', 'player-moved', {
      playerId,
      player,
      foodItems: gameState.foodItems,
      otherPlayers
    });
    
    return res.status(200).json({
      player,
      foodItems: gameState.foodItems,
      otherPlayers
    });
    
  } catch (error) {
    console.error('Errore durante l\'elaborazione:', error);
    return res.status(500).json({ error: 'Errore del server' });
  }
} 