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
  const inactiveTimeout = 10000; // 10 secondi (più aggressivo per mantenere il gioco pulito)
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
      otherPlayers: activePlayers,
      foodItems
    }).catch(err => console.error('Errore pulizia giocatori:', err));
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
    const otherPlayers = Object.values(players).filter(p => p.id !== playerId);
    
    // Verifica la collisione del giocatore con altri serpenti
    // Questo è disabilitato per ora, ma potrebbe essere abilitato per aggiungere game over
    /*
    const hasCollision = otherPlayers.some(otherPlayer => {
      if (!otherPlayer.snake) return false;
      return otherPlayer.snake.some((segment, i) => {
        // Ignora la testa degli altri serpenti
        if (i === 0) return false;
        const distance = Math.sqrt(
          Math.pow(head.x - segment.x, 2) + 
          Math.pow(head.y - segment.y, 2)
        );
        return distance < gridSize / 2;
      });
    });
    
    if (hasCollision) {
      // Reset del giocatore (per ora, potrebbe essere un game over)
      player.score = 0;
      // Posiziona il serpente in un punto casuale
      const startX = Math.floor(Math.random() * 40) * gridSize;
      const startY = Math.floor(Math.random() * 30) * gridSize;
      player.snake = [
        { x: startX, y: startY },
        { x: startX - gridSize, y: startY },
        { x: startX - gridSize * 2, y: startY }
      ];
    }
    */
    
    // Invia notifica tramite Pusher a tutti gli altri client
    await pusher.trigger('snake-game', 'player-moved', {
      playerId,
      player,
      foodItems,
      otherPlayers
    }).catch(err => {
      console.error('Errore Pusher:', err);
    });
    
    // Rispondi al client
    return res.status(200).json({
      player,
      foodItems,
      otherPlayers
    });
  } catch (error) {
    console.error('Errore:', error);
    return res.status(500).json({ message: 'Errore interno del server' });
  }
} 