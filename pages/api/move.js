import Pusher from 'pusher';
import { players, foodItems, lastActivity } from './shared-state.js';

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
  const inactiveTimeout = 10000; // 10 secondi (più aggressivo per mantenere il gioco pulito)
  let removedPlayers = false;
  
  // Verifica e rimuovi giocatori inattivi
  Object.keys(lastActivity).forEach(id => {
    if (now - lastActivity[id] > inactiveTimeout) {
      console.log(`Rimozione giocatore inattivo: ${id}`);
      delete players[id];
      delete lastActivity[id];
      activeConnections.delete(id);
      removedPlayers = true;
    }
  });
  
  // Notifica tutti i giocatori se sono state fatte rimozioni
  if (removedPlayers) {
    try {
      const activePlayers = Object.values(players);
      pusher.trigger('snake-game', 'player-moved', {
        playerId: 'system',
        otherPlayers: activePlayers,
        foodItems
      }).catch(err => console.error('Errore pulizia giocatori:', err));
    } catch (error) {
      console.error('Errore durante notifica rimozione giocatori:', error);
    }
  }
}, 10000); // Esegui ogni 10 secondi

// Funzione per gestire le collisioni con il cibo
function checkFoodCollision(head, gridSize = 20) {
  let scoreIncreased = false;
  let foodIndex = -1;
  
  // Verifica collisione con il cibo (usa threshold più accurato)
  for (let i = 0; i < foodItems.length; i++) {
    const food = foodItems[i];
    const distance = Math.sqrt(
      Math.pow(head.x - food.x, 2) + 
      Math.pow(head.y - food.y, 2)
    );
    
    // Se la distanza è minore del raggio del serpente, c'è collisione
    if (distance < gridSize / 2) {
      scoreIncreased = true;
      foodIndex = i;
      break;
    }
  }
  
  return { scoreIncreased, foodIndex };
}

// Funzione per generare nuove posizioni del cibo
function generateNewFoodPosition(gridSize = 20) {
  const newX = Math.floor(Math.random() * 40) * gridSize;
  const newY = Math.floor(Math.random() * 30) * gridSize;
  
  // Verifica se la posizione è troppo vicina a un giocatore
  const isTooClose = Object.values(players).some(player => {
    if (!player.snake || player.snake.length === 0) return false;
    
    // Controlla la distanza dalla testa di ogni serpente
    return player.snake.some(segment => {
      const distance = Math.sqrt(
        Math.pow(segment.x - newX, 2) + 
        Math.pow(segment.y - newY, 2)
      );
      return distance < gridSize * 2;
    });
  });
  
  // Se troppo vicino, genera una nuova posizione
  if (isTooClose) {
    return generateNewFoodPosition(gridSize);
  }
  
  return { x: newX, y: newY };
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
    
    // Limita frequenza richieste (massimo 10 al secondo)
    if (connection.requests > 10) {
      const elapsed = connection.lastSeen - connection.firstSeen;
      if (elapsed < 1000) {
        console.warn(`Troppe richieste da ${playerId}: ${connection.requests} in ${elapsed}ms`);
        connection.requests = 0;
        connection.firstSeen = Date.now();
        return res.status(429).json({ message: 'Troppe richieste, rallenta' });
      }
      connection.requests = 0;
      connection.firstSeen = Date.now();
    }
    
    // Aggiorna timestamp dell'ultima attività
    lastActivity[playerId] = Date.now();
    
    // Ottieni parametri
    const gridSize = 20;
    const { headPos, length, name, color, score } = playerState;
    
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
    
    // Ottieni tutti gli altri giocatori
    const otherPlayers = Object.values(players)
      .filter(p => p.id !== playerId)
      // Assicurati che i dati siano validi per evitare errori
      .map(p => ({
        id: p.id,
        name: p.name || 'Giocatore',
        color: p.color || '#00ff00',
        score: p.score || 0,
        snake: p.snake || [],
        direction: p.direction || 'right'
      }));
    
    // Limita la dimensione dei dati inviati
    const compactOtherPlayers = otherPlayers.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
      // Invia solo i primi 10 segmenti per ridurre dimensione dati
      snake: p.snake.slice(0, 10),
      direction: p.direction
    }));
    
    // Invia notifica tramite Pusher a tutti gli altri client
    const pusherSuccess = await safePusherTrigger('snake-game', 'player-moved', {
      playerId,
      player,
      foodItems,
      otherPlayers: compactOtherPlayers
    });
    
    if (!pusherSuccess) {
      console.warn(`Impossibile inviare notifica Pusher per ${playerId}`);
    }
    
    // Rispondi al client
    return res.status(200).json({
      player,
      foodItems,
      otherPlayers: compactOtherPlayers
    });
  } catch (error) {
    console.error('Errore:', error);
    return res.status(500).json({ 
      message: 'Errore interno del server',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
} 