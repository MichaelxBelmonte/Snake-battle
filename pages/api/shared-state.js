// Stato condiviso tra le API del gioco - singleton per mantenere lo stato consistente
export const players = {};
export const lastActivity = {};

// Posizioni iniziali del cibo con valori predefiniti
export const foodItems = [
  { x: 400, y: 300 }, // Centro
  { x: 200, y: 200 }, // Sopra a sinistra
  { x: 600, y: 200 }, // Sopra a destra
  { x: 200, y: 400 }, // Sotto a sinistra
  { x: 600, y: 400 }, // Sotto a destra
];

// Configurazione globale
export const gameConfig = {
  gridSize: 20,
  canvasWidth: 800,
  canvasHeight: 600,
  // Timeout per rimozione giocatori inattivi (in ms) - 5 secondi
  inactiveTimeout: 5000
};

// Funzione per resettare lo stato
export function resetGameState() {
  Object.keys(players).forEach(key => delete players[key]);
  Object.keys(lastActivity).forEach(key => delete lastActivity[key]);

  // Reset food positions
  foodItems.length = 0;
  foodItems.push(
    { x: 400, y: 300 },
    { x: 200, y: 200 },
    { x: 600, y: 200 },
    { x: 200, y: 400 },
    { x: 600, y: 400 }
  );
}

// Funzione per rimuovere un giocatore
export function removePlayer(playerId) {
  delete players[playerId];
  delete lastActivity[playerId];
} 