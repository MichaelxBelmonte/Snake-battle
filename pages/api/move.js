import Pusher from 'pusher';
import { players, foodItems, lastActivity } from './shared-state.js';

// Inizializza Pusher lato server
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

// Sistema di pulizia automatica dei giocatori inattivi
setInterval(() => {
  const now = Date.now();
  const inactiveTimeout = 30000; // 30 secondi
  let removedPlayers = false;
  
  // Verifica e rimuovi giocatori inattivi
  Object.keys(lastActivity).forEach(id => {
    if (now - lastActivity[id] > inactiveTimeout) {
      console.log(`Rimozione giocatore inattivo: ${id}`);
      delete players[id];
      delete lastActivity[id];
      removedPlayers = true;
    }
  });
  
  // Notifica tutti i giocatori se sono state fatte rimozioni
  if (removedPlayers) {
    const activePlayers = Object.values(players);
    pusher.trigger('snake-game', 'player-moved', {
      playerId: 'system',
      otherPlayers: activePlayers
    });
  }
}, 30000);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Metodo non consentito' });
  }
  
  const { playerId, direction, playerState } = req.body;
  
  if (!playerId || !playerState) {
    return res.status(400).json({ message: 'Dati mancanti' });
  }
  
  try {
    // Aggiorna timestamp dell'ultima attività
    lastActivity[playerId] = Date.now();
    
    // Controlla se i dati del giocatore sono nel formato ottimizzato
    const isOptimizedFormat = playerState.head && typeof playerState.length === 'number';
    
    // Ricostruisci snake completo dal formato ottimizzato se necessario
    let completePlayerState;
    if (isOptimizedFormat) {
      // Ottiene il giocatore esistente o crea un nuovo formato base
      const existingPlayer = players[playerId] || { 
        id: playerId, 
        snake: Array(playerState.length || 3).fill().map(() => ({ x: 0, y: 0 })),
        direction: direction || 'right',
        score: 0
      };
      
      // Ricostruisci il serpente usando la testa e la lunghezza
      const newSnake = [];
      newSnake.push(playerState.head); // La nuova testa
      
      // Per il resto del corpo, usa le posizioni precedenti o posizioni relative
      if (existingPlayer.snake && existingPlayer.snake.length > 0) {
        // Copia il corpo esistente (spostato di un elemento)
        for (let i = 0; i < playerState.length - 1; i++) {
          if (i < existingPlayer.snake.length) {
            newSnake.push(existingPlayer.snake[i]);
          } else {
            // Aggiungi segmenti aggiuntivi se il serpente è cresciuto
            const lastSegment = newSnake[newSnake.length - 1];
            newSnake.push({ ...lastSegment });
          }
        }
      } else {
        // Caso improbabile: nessun serpente esistente
        for (let i = 1; i < playerState.length; i++) {
          newSnake.push({ ...playerState.head });
        }
      }
      
      // Crea lo stato completo del giocatore
      completePlayerState = {
        id: playerId,
        name: playerState.name || 'Giocatore',
        color: playerState.color || '#00ff00',
        score: playerState.score || 0,
        snake: newSnake,
        direction: playerState.direction || direction || 'right'
      };
    } else {
      // Formato originale, usa direttamente
      completePlayerState = {
        ...playerState,
        id: playerId,
        direction: direction
      };
    }
    
    // Verifica collisioni con il cibo
    let scoreIncreased = false;
    
    if (completePlayerState.snake && completePlayerState.snake.length > 0) {
      const head = completePlayerState.snake[0];
      const gridSize = 20;
      
      foodItems.forEach((food, index) => {
        if (Math.abs(head.x - food.x) < gridSize && Math.abs(head.y - food.y) < gridSize) {
          // Mangia il cibo
          scoreIncreased = true;
          
          // Incrementa punteggio
          completePlayerState.score = (completePlayerState.score || 0) + 10;
          
          // Aumenta la lunghezza del serpente
          const tail = completePlayerState.snake[completePlayerState.snake.length - 1];
          completePlayerState.snake.push({ ...tail });
          
          // Rimuovi il cibo mangiato
          const newX = Math.floor(Math.random() * 40) * gridSize;
          const newY = Math.floor(Math.random() * 30) * gridSize;
          foodItems[index] = { x: newX, y: newY };
        }
      });
    }
    
    // Aggiorna lo stato del giocatore
    players[playerId] = completePlayerState;
    
    // Ottieni tutti gli altri giocatori
    const otherPlayers = Object.keys(players)
      .filter(id => id !== playerId)
      .map(id => players[id]);
    
    // Invia notifica tramite Pusher
    await pusher.trigger('snake-game', 'player-moved', {
      playerId,
      player: completePlayerState,
      foodItems,
      otherPlayers
    });
    
    // Rispondi al client
    return res.status(200).json({
      player: completePlayerState,
      foodItems,
      otherPlayers
    });
  } catch (error) {
    console.error('Errore:', error);
    return res.status(500).json({ message: 'Errore interno del server' });
  }
} 