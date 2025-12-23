import Pusher from 'pusher';
import { players, foodItems, lastActivity, gameConfig, removePlayer } from './shared-state.js';

// Memorizza le ultime connessioni
const activeConnections = new Map();

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
  const inactiveTimeout = gameConfig.inactiveTimeout; // 5 secondi
  let removedPlayers = false;

  // Verifica e rimuovi giocatori inattivi
  Object.keys(lastActivity).forEach(id => {
    if (now - lastActivity[id] > inactiveTimeout) {
      console.log(`Rimozione giocatore inattivo: ${id}`);
      removePlayer(id);
      activeConnections.delete(id);
      removedPlayers = true;
    }
  });

  // Notifica tutti i giocatori se sono state fatte rimozioni
  if (removedPlayers) {
    const activePlayers = Object.values(players).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
      snake: p.snake?.slice(0, 15) || [],
      direction: p.direction
    }));

    pusher.trigger('snake-game', 'players-updated', {
      players: activePlayers,
      foodItems
    }).catch(() => {});
  }
}, 3000); // Controlla ogni 3 secondi

// Funzione per gestire le collisioni con il cibo (ottimizzata - no sqrt)
function checkFoodCollision(head, gridSize = 20) {
  let scoreIncreased = false;
  let foodIndex = -1;

  // Pre-calcola il threshold al quadrato (evita sqrt ogni iterazione)
  const thresholdSq = (gridSize / 2) * (gridSize / 2);

  // Verifica collisione con il cibo usando distanza al quadrato
  for (let i = 0; i < foodItems.length; i++) {
    const food = foodItems[i];
    const dx = head.x - food.x;
    const dy = head.y - food.y;
    const distSq = dx * dx + dy * dy;

    // Confronta distanze al quadrato (evita Math.sqrt costoso)
    if (distSq < thresholdSq) {
      scoreIncreased = true;
      foodIndex = i;
      break;
    }
  }

  return { scoreIncreased, foodIndex };
}

// Funzione per generare nuove posizioni del cibo (iterativa - no ricorsione)
function generateNewFoodPosition(gridSize = 20) {
  const maxAttempts = 100; // Previene loop infiniti
  const minDistSq = (gridSize * 2) * (gridSize * 2); // Distanza minima al quadrato

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const newX = Math.floor(Math.random() * 40) * gridSize;
    const newY = Math.floor(Math.random() * 30) * gridSize;

    // Verifica se la posizione è troppo vicina a un giocatore
    let isTooClose = false;

    for (const player of Object.values(players)) {
      if (!player.snake || player.snake.length === 0) continue;

      // Controlla solo i primi 5 segmenti per performance
      const segmentsToCheck = Math.min(player.snake.length, 5);
      for (let i = 0; i < segmentsToCheck; i++) {
        const segment = player.snake[i];
        const dx = segment.x - newX;
        const dy = segment.y - newY;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistSq) {
          isTooClose = true;
          break;
        }
      }
      if (isTooClose) break;
    }

    if (!isTooClose) {
      return { x: newX, y: newY };
    }
  }

  // Fallback: posizione casuale anche se vicina a un giocatore
  return {
    x: Math.floor(Math.random() * 40) * gridSize,
    y: Math.floor(Math.random() * 30) * gridSize
  };
}

// Funzione di invio sicuro via Pusher con retry
async function safePusherTrigger(channel, event, data, retries = 3) {
  try {
    await pusher.trigger(channel, event, data);
    return true;
  } catch (error) {
    console.error(`Errore invio Pusher (tentativi rimasti: ${retries}):`, error);
    if (retries > 0) {
      // Attendi un po' e riprova
      await new Promise(resolve => setTimeout(resolve, 100));
      return safePusherTrigger(channel, event, data, retries - 1);
    }
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Metodo non consentito' });
  }
  
  const { playerId, direction, playerState } = req.body;
  
  if (!playerId || !playerState) {
    return res.status(400).json({ message: 'Dati mancanti' });
  }
  
  try {
    // Assegna un timestamp di connessione se è la prima volta
    if (!activeConnections.has(playerId)) {
      activeConnections.set(playerId, {
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        requests: 0
      });
    }
    
    // Aggiorna ultimo accesso
    const connection = activeConnections.get(playerId);
    connection.lastSeen = Date.now();
    connection.requests++;
    
    // Limita frequenza richieste (massimo 20 al secondo - più permissivo)
    if (connection.requests > 20) {
      const elapsed = connection.lastSeen - connection.firstSeen;
      if (elapsed < 1000) {
        // Non loggare per evitare spam, solo resetta
        connection.requests = 0;
        connection.firstSeen = Date.now();
        return res.status(429).json({ message: 'Troppe richieste' });
      }
      connection.requests = 0;
      connection.firstSeen = Date.now();
    }
    
    // Aggiorna timestamp dell'ultima attività
    lastActivity[playerId] = Date.now();
    
    // Ottieni parametri
    const gridSize = 20;
    const { headPos, name, color, score } = playerState;
    
    // Trova o crea uno stato per questo giocatore
    let player = players[playerId];
    let isNewPlayer = false;
    
    if (!player) {
      // Nuovo giocatore o riconnessione
      isNewPlayer = true;
      player = {
        id: playerId,
        name: name || 'Giocatore',
        color: color || '#00ff00',
        score: score || 0,
        snake: [
          headPos || { x: 400, y: 300 }, // Posizione di default al centro
          { x: 380, y: 300 },
          { x: 360, y: 300 }
        ],
        direction: direction || 'right'
      };
    }
    
    // Aggiorna la direzione
    player.direction = direction || player.direction;
    
    // Il client invia la posizione della testa, aggiorna il serpente
    if (headPos && !isNewPlayer) {
      player.snake.unshift(headPos); // Aggiungi la nuova testa
      player.snake = player.snake.slice(0, player.snake.length - 1); // Rimuovi la coda
    }
    
    // Verifica collisione con il cibo
    const head = player.snake[0];
    const { scoreIncreased, foodIndex } = checkFoodCollision(head, gridSize);
    
    if (scoreIncreased && foodIndex >= 0) {
      // Incrementa punteggio
      player.score += 10;
      
      // Aumenta la lunghezza del serpente
      const tail = player.snake[player.snake.length - 1];
      player.snake.push({ ...tail });
      
      // Sostituisci il cibo mangiato con uno nuovo
      foodItems[foodIndex] = generateNewFoodPosition(gridSize);
    }
    
    // Aggiorna lo stato del giocatore nel server
    players[playerId] = player;
    
    // Ottieni tutti gli altri giocatori - con snake completo (primi 15 segmenti)
    const otherPlayersData = Object.values(players)
      .filter(p => p.id !== playerId && p.snake && p.snake.length > 0)
      .map(p => ({
        id: p.id,
        name: p.name || 'Giocatore',
        color: p.color || '#00ff00',
        score: p.score || 0,
        snake: p.snake.slice(0, 15), // Primi 15 segmenti
        direction: p.direction || 'right'
      }));

    // Formato del player per broadcast (con snake completo)
    const playerData = {
      id: player.id,
      name: player.name,
      color: player.color,
      score: player.score,
      snake: player.snake.slice(0, 15),
      direction: player.direction
    };

    // Invia notifica tramite Pusher a tutti gli altri client
    const pusherSuccess = await safePusherTrigger('snake-game', 'player-moved', {
      playerId,
      player: playerData,
      foodItems,
      otherPlayers: otherPlayersData
    });

    if (!pusherSuccess) {
      console.warn(`Impossibile inviare notifica Pusher per ${playerId}`);
    }

    // Rispondi al client
    return res.status(200).json({
      player: playerData,
      foodItems,
      otherPlayers: otherPlayersData,
      serverScore: player.score // Score dal server
    });
  } catch (error) {
    console.error('Errore:', error);
    return res.status(500).json({ 
      message: 'Errore interno del server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
} 