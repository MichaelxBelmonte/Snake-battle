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

// Genera una posizione casuale sulla griglia
const generateRandomPosition = (excludePositions = []) => {
  const gridSize = 20;
  const maxX = 800 - gridSize; // Aumentato a 800px per match con il client
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

// Mantieni lo stato globale del gioco
let gameState = {
  players: [],
  foodItems: [],
  maxFood: 5, // Massimo 5 cibi contemporaneamente
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
      return res.status(400).json({ error: 'Dati richiesti mancanti' });
    }
    
    // Recupera il giocatore dallo stato di gioco globale
    let player = gameState.players.find(p => p.id === playerId);
    
    // Se il giocatore non esiste nello stato globale, aggiungilo
    if (!player) {
      player = {
        ...playerState,
        id: playerId,
        lastUpdate: Date.now()
      };
      console.log(`Nuovo giocatore: ${playerState.name || playerId}`);
      gameState.players.push(player);
    } else {
      // Aggiorna lo stato del giocatore esistente
      player.snake = playerState.snake;
      player.score = playerState.score;
      player.lastUpdate = Date.now();
      player.name = playerState.name || player.name;
      player.color = playerState.color || player.color;
    }
    
    // Stato locale per il client
    let hasEatenFood = false;
    let eatenFoodIndex = -1;
    
    // Calcola la nuova posizione della testa
    const gridSize = 20;
    const head = { ...player.snake[0] };
    const canvasWidth = 800;
    const canvasHeight = 600;
    
    // Aggiorna la posizione della testa in base alla direzione
    switch (direction) {
      case 'up':
        head.y -= gridSize;
        if (head.y < 0) head.y = canvasHeight - gridSize;
        break;
      case 'down':
        head.y += gridSize;
        if (head.y >= canvasHeight) head.y = 0;
        break;
      case 'left':
        head.x -= gridSize;
        if (head.x < 0) head.x = canvasWidth - gridSize;
        break;
      case 'right':
        head.x += gridSize;
        if (head.x >= canvasWidth) head.x = 0;
        break;
      default:
        return res.status(400).json({ error: 'Direzione non valida' });
    }
    
    // Funzione semplificata per verificare le collisioni
    const checkCollision = (head, allPlayers, currentPlayerId) => {
      for (const p of allPlayers) {
        // Salta se stesso
        if (p.id === currentPlayerId) {
          // Ma controlla collisione con se stesso (esclusa la testa)
          for (let i = 1; i < p.snake.length; i++) {
            if (head.x === p.snake[i].x && head.y === p.snake[i].y) {
              return true;
            }
          }
        } else if (p.snake) {
          // Controlla collisione con altri serpenti
          for (const segment of p.snake) {
            if (head.x === segment.x && head.y === segment.y) {
              return true;
            }
          }
        }
      }
      return false;
    };
    
    // Controlla collisione
    if (checkCollision(head, gameState.players, playerId)) {
      console.log(`Collisione: ${player.name || playerId}`);
      // Reset del serpente in caso di collisione (perdita)
      const randomPos = generateRandomPosition(
        gameState.players.flatMap(p => p.snake || []).concat(gameState.foodItems)
      );
      
      player.snake = [
        randomPos,
        { x: randomPos.x - gridSize, y: randomPos.y },
        { x: randomPos.x - (2 * gridSize), y: randomPos.y }
      ];
      player.score = 0;
    } else {
      // Controlla se il serpente ha mangiato del cibo
      eatenFoodIndex = gameState.foodItems.findIndex(food => 
        food.x === head.x && food.y === head.y
      );
      
      if (eatenFoodIndex !== -1) {
        // Il serpente ha mangiato del cibo
        hasEatenFood = true;
        player.score += 10;
        
        // Aggiunge un nuovo segmento al serpente (non rimuove l'ultimo)
        player.snake = [head, ...player.snake];
        
        // Rimuove il cibo mangiato
        gameState.foodItems.splice(eatenFoodIndex, 1);
        
        // Genera nuovo cibo
        const occupiedPositions = [
          ...gameState.foodItems,
          ...gameState.players.flatMap(p => p.snake || [])
        ];
        const newFood = generateRandomPosition(occupiedPositions);
        gameState.foodItems.push(newFood);
      } else {
        // Il serpente si muove normalmente
        player.snake = [head, ...player.snake.slice(0, -1)];
      }
    }
    
    // Pulisce giocatori inattivi (più di 15 secondi senza aggiornamenti)
    const now = Date.now();
    const playersBeforeCleanup = gameState.players.length;
    gameState.players = gameState.players.filter(p => now - p.lastUpdate < 15000);
    
    if (playersBeforeCleanup !== gameState.players.length) {
      console.log(`Rimossi ${playersBeforeCleanup - gameState.players.length} giocatori inattivi`);
    }
    
    // Assicura che ci siano sempre abbastanza elementi cibo
    while (gameState.foodItems.length < gameState.maxFood) {
      const occupiedPositions = [
        ...gameState.foodItems,
        ...gameState.players.flatMap(p => p.snake || [])
      ];
      gameState.foodItems.push(generateRandomPosition(occupiedPositions));
    }
    
    // Ottieni gli altri giocatori (escludi il giocatore corrente)
    const otherPlayers = gameState.players.filter(p => p.id !== playerId);
    
    // Configura Pusher
    const pusher = getPusherInstance();
    
    // Invia l'aggiornamento a tutti i client
    await pusher.trigger('snake-game', 'player-moved', {
      playerId,
      player,
      foodItems: gameState.foodItems,
      hasEatenFood,
      otherPlayers: gameState.players.filter(p => p.id !== playerId)
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