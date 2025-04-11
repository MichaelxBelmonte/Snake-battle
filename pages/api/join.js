import Pusher from 'pusher';
import { v4 as uuidv4 } from 'uuid';

// Inizializza Pusher lato server
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.NEXT_PUBLIC_PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    useTLS: true
});

// Utilizzo lo stesso store di players e foodItems da move.js
import { players, foodItems, lastActivity } from './shared-state.js';

// Funzione per ottenere l'istanza di Pusher
const getPusherInstance = () => {
    return pusher;
};

// Genera una posizione casuale sulla griglia
const generateRandomPosition = (excludePositions = []) => {
    const gridSize = 20;
    const maxX = 800 - gridSize;
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
            if (Math.abs(pos.x - newPosition.x) < gridSize && 
                Math.abs(pos.y - newPosition.y) < gridSize) {
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
    // Genera 5 elementi cibo
    const foodCount = gameState.maxFood;
    for (let i = 0; i < foodCount; i++) {
        const occupiedPositions = [
            ...gameState.foodItems,
            ...gameState.players.flatMap(p => p.snake || [])
        ];
        gameState.foodItems.push(generateRandomPosition(occupiedPositions));
    }
}

// Funzione per ottimizzare l'invio dei dati (riduce la dimensione)
const preparePlayerData = (player) => {
    if (!player) return null;
    
    return {
        id: player.id,
        name: player.name,
        color: player.color,
        snake: player.snake,
        score: player.score
    };
};

// Genera un ID univoco per il giocatore
const generatePlayerId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 5);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Metodo non consentito' });
    }
    
    const { playerName, playerColor } = req.body;
    
    if (!playerName) {
        return res.status(400).json({ message: 'Nome giocatore mancante' });
    }
    
    try {
        // Genera ID univoco per il giocatore
        const playerId = uuidv4();
        
        // Imposta l'ultima attività
        lastActivity[playerId] = Date.now();
        
        // Ottieni le posizioni occupate da altri serpenti e cibo
        const occupiedPositions = [
            ...Object.values(foodItems),
            ...Object.values(players).flatMap(p => p.snake || [])
        ];
        
        // Genera posizione iniziale sicura
        const initialPosition = generateRandomPosition(occupiedPositions);
        const gridSize = 20;
        
        // Crea stato iniziale del serpente (3 segmenti orizzontali)
        const snake = [
            initialPosition,
            { x: initialPosition.x - gridSize, y: initialPosition.y },
            { x: initialPosition.x - (2 * gridSize), y: initialPosition.y }
        ];
        
        // Crea il nuovo giocatore
        const newPlayer = {
            id: playerId,
            name: playerName,
            color: playerColor || '#00ff00',
            snake: snake,
            score: 0,
            direction: 'right',
            lastUpdate: Date.now()
        };
        
        // Aggiungi il giocatore allo stato condiviso
        players[playerId] = newPlayer;
        
        // Assicurati che ci siano abbastanza elementi cibo
        if (foodItems.length < 5) {
            while (foodItems.length < 5) {
                const newFoodOccupiedPositions = [
                    ...foodItems,
                    ...Object.values(players).flatMap(p => p.snake || [])
                ];
                
                const newFoodPosition = generateRandomPosition(newFoodOccupiedPositions);
                foodItems.push(newFoodPosition);
            }
        }
        
        // Prepara la lista degli altri giocatori
        const otherPlayers = Object.values(players).filter(p => p.id !== playerId);
        
        // Notifica tutti i client del nuovo giocatore
        await pusher.trigger('snake-game', 'player-joined', {
            player: newPlayer,
            foodItems,
            otherPlayers
        });
        
        // Rispondi al client
        return res.status(200).json({
            player: newPlayer,
            foodItems,
            otherPlayers
        });
    } catch (error) {
        console.error('Errore:', error);
        return res.status(500).json({ message: 'Errore interno del server' });
    }
} 