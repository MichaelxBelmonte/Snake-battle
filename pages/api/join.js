import Pusher from 'pusher';

// Inizializza Pusher
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

// Genera una posizione casuale per il cibo
function generateFood() {
    const gridSize = 20;
    const maxX = 30;
    const maxY = 30;
    
    return {
        x: Math.floor(Math.random() * maxX) * gridSize,
        y: Math.floor(Math.random() * maxY) * gridSize
    };
}

// Stato del gioco condiviso utilizzando Pusher per la sincronizzazione
const gameState = {
    players: [],
    food: generateFood()
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

    // Verifica che sia una richiesta POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Metodo non consentito' });
        return;
    }

    try {
        console.log('Richiesta join ricevuta:', req.body);
        
        const { name, color } = req.body;
        
        if (!name || !color) {
            res.status(400).json({ error: 'Nome e colore sono richiesti' });
            return;
        }
        
        // Genera una posizione iniziale casuale per il nuovo giocatore
        const gridSize = 20;
        const maxX = 30;
        const maxY = 30;
        
        const newPlayer = {
            id: Date.now().toString(), // ID univoco basato sul timestamp
            name,
            color,
            snake: [
                {
                    x: Math.floor(Math.random() * maxX) * gridSize,
                    y: Math.floor(Math.random() * maxY) * gridSize
                }
            ],
            direction: 'right',
            score: 0
        };
        
        console.log('Nuovo giocatore creato:', newPlayer);
        
        // Invia lo stato iniziale al client
        const initialState = {
            playerId: newPlayer.id,
            player: newPlayer,
            food: gameState.food
        };
        
        console.log('Invio stato iniziale:', initialState);
        
        // Notifica tutti i client del nuovo giocatore tramite Pusher
        await pusher.trigger('snake-game', 'player-joined', {
            newPlayer: newPlayer,
            food: gameState.food
        });
        
        return res.status(200).json(initialState);
    } catch (error) {
        console.error('Errore durante il join:', error);
        return res.status(500).json({ error: 'Errore del server' });
    }
} 