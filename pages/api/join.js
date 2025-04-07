import Pusher from 'pusher';

// Inizializza Pusher
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

// Genera una posizione casuale sulla griglia
const generateRandomPosition = (excludePositions = []) => {
    const gridSize = 20;
    const maxX = 800 - gridSize; // Aumentato a 800px
    const maxY = 600 - gridSize;
    
    let newPosition;
    let isColliding;
    
    do {
        isColliding = false;
        newPosition = {
            x: Math.floor(Math.random() * (maxX / gridSize)) * gridSize,
            y: Math.floor(Math.random() * (maxY / gridSize)) * gridSize
        };
        
        // Verifica collisioni con posizioni da escludere
        for (const pos of excludePositions) {
            if (pos.x === newPosition.x && pos.y === newPosition.y) {
                isColliding = true;
                break;
            }
        }
    } while (isColliding);
    
    return newPosition;
};

// Genera un serpente iniziale con una posizione casuale
const generateInitialSnake = (players = []) => {
    // Raccogli tutte le posizioni occupate
    const occupiedPositions = [];
    players.forEach(player => {
        if (player.snake) {
            player.snake.forEach(segment => {
                occupiedPositions.push(segment);
            });
        }
    });
    
    // Genera posizione iniziale per la testa del serpente
    const headPosition = generateRandomPosition(occupiedPositions);
    const gridSize = 20;
    
    // Crea un serpente con 3 segmenti
    return [
        headPosition,
        { x: headPosition.x - gridSize, y: headPosition.y },
        { x: headPosition.x - (2 * gridSize), y: headPosition.y }
    ];
};

// Mantieni lo stato globale del gioco
let gameState = {
    players: [],
    foodItems: [], // Array di elementi cibo invece di un singolo elemento
    maxPlayers: 10, // Limite di 10 giocatori simultanei
    maxFood: 5,     // Massimo 5 cibi contemporaneamente
};

// Genera cibo iniziale
if (gameState.foodItems.length === 0) {
    // Genera da 3 a 5 elementi cibo
    const foodCount = gameState.maxFood;
    for (let i = 0; i < foodCount; i++) {
        const occupiedPositions = [
            ...gameState.foodItems,
            ...gameState.players.flatMap(p => p.snake || [])
        ];
        gameState.foodItems.push(generateRandomPosition(occupiedPositions));
    }
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
        
        // Verifica se abbiamo raggiunto il limite di giocatori
        if (gameState.players.length >= gameState.maxPlayers) {
            res.status(429).json({ error: 'Numero massimo di giocatori raggiunto. Riprova più tardi.' });
            return;
        }
        
        // Genera un ID per il nuovo giocatore
        const playerId = Date.now().toString();
        
        // Crea il serpente iniziale per il nuovo giocatore
        const initialSnake = generateInitialSnake(gameState.players);
        
        // Crea lo stato del nuovo giocatore
        const newPlayer = {
            id: playerId,
            name,
            color,
            snake: initialSnake,
            score: 0,
            lastUpdate: Date.now()
        };
        
        // Aggiungi il nuovo giocatore allo stato del gioco
        gameState.players.push(newPlayer);
        
        // Controlla se è necessario generare altro cibo
        if (gameState.foodItems.length < gameState.maxFood) {
            const numToAdd = gameState.maxFood - gameState.foodItems.length;
            for (let i = 0; i < numToAdd; i++) {
                const occupiedPositions = [
                    ...gameState.foodItems,
                    ...gameState.players.flatMap(p => p.snake || [])
                ];
                gameState.foodItems.push(generateRandomPosition(occupiedPositions));
            }
        }
        
        // Configura Pusher
        const pusher = getPusherInstance();
        
        // Notifica a tutti che un nuovo giocatore è entrato
        await pusher.trigger('snake-game', 'player-joined', {
            newPlayer,
            foodItems: gameState.foodItems
        });
        
        // Rispondi con i dati iniziali del gioco
        return res.status(200).json({
            playerId,
            player: newPlayer,
            foodItems: gameState.foodItems
        });
    } catch (error) {
        console.error('Errore durante l\'elaborazione:', error);
        return res.status(500).json({ error: 'Errore del server' });
    }
} 