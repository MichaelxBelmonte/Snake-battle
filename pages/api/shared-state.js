// Stato condiviso tra le API del gioco
export const players = {};
export const lastActivity = {};

// Posizioni iniziali del cibo
export const foodItems = [
  { x: 400, y: 300 }, // Centro
  { x: 200, y: 200 }, // Sopra a sinistra
  { x: 600, y: 200 }, // Sopra a destra
  { x: 200, y: 400 }, // Sotto a sinistra
  { x: 600, y: 400 }, // Sotto a destra
]; 