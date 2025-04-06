const Pusher = require('pusher');

const pusher = new Pusher({
    appId: '1970487',
    key: 'e8c4c5037257e24d1134',
    secret: '7ea70124ffd933139ab7',
    cluster: 'eu',
    useTLS: true
});

const gameState = {
    players: {},
    food: {},
    powerUps: {}
};

// Genera una posizione casuale sulla griglia
function getRandomPosition(gridSize = 30) {
    return {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize)
    };
}

// Inizializza un nuovo serpente
function createSnake(color) {
    const pos = getRandomPosition();
    return {
        segments: [
            pos,
            { x: pos.x - 1, y: pos.y },
            { x: pos.x - 2, y: pos.y }
        ],
        direction: 'right',
        color: color
    };
}

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
        res.status(405).json({ error: 'Metodo non permesso' });
        return;
    }

    try {
        const { name, color } = req.body;
        
        if (!name || !color) {
            res.status(400).json({ error: 'Nome e colore sono richiesti' });
            return;
        }

        const playerId = Date.now().toString();
        const player = {
            id: playerId,
            name: name,
            color: color,
            score: 0,
            ...createSnake(color)
        };

        // Aggiungi il giocatore allo stato del gioco
        gameState.players[playerId] = player;

        // Invia l'evento playerJoined
        await pusher.trigger('game-channel', 'playerJoined', player);
        
        // Invia lo stato del gioco aggiornato a tutti
        await pusher.trigger('game-channel', 'gameState', gameState);

        res.status(200).json({ id: playerId });
    } catch (error) {
        console.error('Errore durante il join:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
} 