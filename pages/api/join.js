import Pusher from 'pusher';

// Inizializza Pusher
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

// Funzione per ottenere l'istanza di Pusher
const getPusherInstance = () => {
    return pusher;
};

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
export const gameState = {
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

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metodo non consentito' });
    }

    try {
        const { playerName, playerColor } = req.body;
        
        if (!playerName || !playerColor) {
            return res.status(400).json({ error: 'Nome e colore del giocatore sono richiesti' });
        }
        
        // Pulisci i giocatori inattivi (non aggiornati negli ultimi 30 secondi)
        const now = Date.now();
        gameState.players = gameState.players.filter(player => {
            const isActive = now - player.lastUpdate < 30000;
            if (!isActive) {
                console.log(`Rimuovo giocatore inattivo: ${player.id}`);
            }
            return isActive;
        });
        
        // Verifica se il giocatore esiste già
        let player = gameState.players.find(p => p.name === playerName);
        
        if (player) {
            // Aggiorna il colore se è cambiato
            player.color = playerColor;
            player.lastUpdate = Date.now();
        } else {
            // Verifica se è stato raggiunto il limite massimo di giocatori
            if (gameState.players.length >= gameState.maxPlayers) {
                return res.status(400).json({ error: 'Numero massimo di giocatori raggiunto' });
            }
            
            // Genera una posizione iniziale casuale
            const initialPosition = generateRandomPosition(
                gameState.players.flatMap(p => p.snake || []).concat(gameState.foodItems)
            );
            
            // Crea un nuovo giocatore
            player = {
                id: Date.now().toString(),
                name: playerName,
                color: playerColor,
                snake: [
                    initialPosition,
                    { x: initialPosition.x - 20, y: initialPosition.y },
                    { x: initialPosition.x - 40, y: initialPosition.y }
                ],
                score: 0,
                lastUpdate: Date.now()
            };
            
            // Aggiungi il nuovo giocatore allo stato di gioco
            gameState.players.push(player);
            
            // Assicurati che ci siano abbastanza elementi cibo
            while (gameState.foodItems.length < gameState.maxFood) {
                const occupiedPositions = [
                    ...gameState.foodItems,
                    ...gameState.players.flatMap(p => p.snake || [])
                ];
                gameState.foodItems.push(generateRandomPosition(occupiedPositions));
            }
        }
        
        // Prepara i dati per gli altri giocatori (escluso il giocatore corrente)
        const otherPlayers = gameState.players
            .filter(p => p.id !== player.id)
            .map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                snake: p.snake,
                score: p.score
            }));
        
        // Configura Pusher
        const pusher = getPusherInstance();
        
        // Notifica tutti i client che un nuovo giocatore si è unito
        await pusher.trigger('snake-game', 'player-joined', {
            player,
            foodItems: gameState.foodItems,
            otherPlayers // Includi tutti gli altri giocatori nell'evento
        });
        
        return res.status(200).json({
            player,
            foodItems: gameState.foodItems,
            otherPlayers // Includi tutti gli altri giocatori nella risposta
        });
        
    } catch (error) {
        console.error('Errore durante l\'elaborazione:', error);
        return res.status(500).json({ error: 'Errore del server' });
    }
} 