import Pusher from 'pusher';
import { players, lastActivity } from '../shared-state.js';

// Inizializza Pusher lato server
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

export default async function handler(req, res) {
  // Verifica che sia una richiesta POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Metodo non consentito' });
  }
  
  // Ottieni i dati dalla richiesta Pusher
  const { socket_id, channel_name } = req.body;
  
  try {
    // Ottieni l'ID giocatore dall'header
    const playerId = req.headers['x-player-id'];
    
    // Log per debugging
    console.log(`Richiesta autenticazione Pusher - Socket ID: ${socket_id}, Canale: ${channel_name}, Giocatore: ${playerId || 'sconosciuto'}`);
    
    // Se abbiamo un ID giocatore valido, aggiorna l'ultimo timestamp di attività
    if (playerId) {
      lastActivity[playerId] = Date.now();
      
      // Se il giocatore non esiste ancora, lo registriamo (dovrebbe già esistere tramite /api/join)
      if (!players[playerId]) {
        console.log(`Giocatore ${playerId} non trovato, ma autenticato`);
      }
    }
    
    // Genera l'autenticazione standard (senza autenticazione a livello utente)
    const auth = pusher.authorizeChannel(socket_id, channel_name);
    
    // Aggiungi dati personalizzati all'autenticazione
    auth.custom_data = {
      user_id: playerId || 'guest',
      timestamp: Date.now()
    };
    
    return res.status(200).json(auth);
  } catch (error) {
    console.error('Errore autenticazione Pusher:', error);
    return res.status(500).json({ 
      message: 'Errore interno del server durante l\'autenticazione' 
    });
  }
} 