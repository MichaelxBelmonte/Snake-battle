import Pusher from 'pusher';

// Inizializza Pusher
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

// Stato del gioco (in memoria)
let gameState = {
    players: [],
    food: { x: 0, y: 0 }
};

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

// Inizializza il cibo
gameState.food = generateFood();

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
            id: Date.now().toString(),
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
        
        // Aggiungi il giocatore allo stato del gioco
        gameState.players.push(newPlayer);
        
        // Notifica tutti i client del nuovo giocatore
        await pusher.trigger('snake-game', 'player-joined', {
            players: gameState.players,
            food: gameState.food
        });
        
        return res.status(200).json({
            playerId: newPlayer.id,
            players: gameState.players,
            food: gameState.food
        });
    } catch (error) {
        console.error('Errore durante il join:', error);
        return res.status(500).json({ error: 'Errore del server' });
    }
} 