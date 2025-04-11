import { lastActivity, players } from './shared-state.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Metodo non consentito' });
  }
  
  const { playerId } = req.body;
  
  try {
    // Se l'ID è valido e esiste già, aggiornare il timestamp dell'ultima attività
    if (playerId && players[playerId]) {
      lastActivity[playerId] = Date.now();
      
      return res.status(200).json({ 
        success: true, 
        timestamp: Date.now(),
        activePlayerCount: Object.keys(players).length 
      });
    } 
    
    // Se il giocatore non esiste ma l'ID è valido, rispondi comunque positivamente
    if (playerId) {
      return res.status(200).json({ 
        success: true, 
        timestamp: Date.now(),
        activePlayerCount: Object.keys(players).length,
        message: 'Giocatore non trovato, ma connessione attiva'
      });
    }
    
    // Se non c'è un ID, rispondi con un messaggio di errore
    return res.status(400).json({ 
      success: false, 
      message: 'ID giocatore mancante' 
    });
  } catch (error) {
    console.error('Errore ping:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Errore interno del server' 
    });
  }
} 