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
        const { playerId, direction } = req.body;
        
        if (!playerId || !direction) {
            res.status(400).json({ error: 'ID giocatore e direzione sono richiesti' });
            return;
        }

        const player = gameState.players[playerId];
        if (!player) {
            res.status(404).json({ error: 'Giocatore non trovato' });
            return;
        }

        // Aggiorna la direzione del serpente
        player.direction = direction;
        
        // Calcola la nuova posizione della testa
        const head = { ...player.segments[0] };
        switch (direction) {
            case 'up': head.y--; break;
            case 'down': head.y++; break;
            case 'left': head.x--; break;
            case 'right': head.x++; break;
        }
        
        // Aggiungi la nuova testa e rimuovi l'ultima parte della coda
        player.segments.unshift(head);
        player.segments.pop();

        // Invia lo stato aggiornato a tutti i giocatori
        await pusher.trigger('game-channel', 'gameState', gameState);

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Errore durante il movimento:', error);
        res.status(500).json({ error: 'Errore interno del server' });
    }
} 