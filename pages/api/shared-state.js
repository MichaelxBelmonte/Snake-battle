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
  // Timeout per rimoziooe giocatori inattivi (in ms)
  inactiveTimeout: 10000
}; 