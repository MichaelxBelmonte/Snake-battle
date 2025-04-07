import { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#ff0000');
  const [gameStarted, setGameStarted] = useState(false);
  const [error, setError] = useState('');
  const [players, setPlayers] = useState([]);
  const [food, setFood] = useState({ x: 0, y: 0 });
  const [playerId, setPlayerId] = useState(null);
  const [score, setScore] = useState(0);
  const [debugInfo, setDebugInfo] = useState('');
  
  const canvasRef = useRef(null);
  const pusherRef = useRef(null);
  const gameLoopRef = useRef(null);
  const directionRef = useRef('right');
  
  // Inizializza Pusher
  useEffect(() => {
    if (gameStarted) {
      try {
        console.log('Tentativo di connessione a Pusher...');
        setDebugInfo(prev => prev + '\nTentativo di connessione a Pusher...');
        
        // Log delle variabili d'ambiente (solo per debug)
        console.log('NEXT_PUBLIC_PUSHER_KEY:', process.env.NEXT_PUBLIC_PUSHER_KEY);
        console.log('NEXT_PUBLIC_PUSHER_CLUSTER:', process.env.NEXT_PUBLIC_PUSHER_CLUSTER);
        
        if (!process.env.NEXT_PUBLIC_PUSHER_KEY || !process.env.NEXT_PUBLIC_PUSHER_CLUSTER) {
          throw new Error('Variabili d\'ambiente Pusher mancanti');
        }
        
        pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER
        });
        
        const channel = pusherRef.current.subscribe('snake-game');
        
        console.log('Connessione a Pusher riuscita, in ascolto di eventi...');
        setDebugInfo(prev => prev + '\nConnessione a Pusher riuscita, in ascolto di eventi...');
        
        channel.bind('player-joined', (data) => {
          console.log('Evento player-joined ricevuto:', data);
          setDebugInfo(prev => prev + '\nEvento player-joined ricevuto');
          setPlayers(data.players);
          setFood(data.food);
        });
        
        channel.bind('player-moved', (data) => {
          console.log('Evento player-moved ricevuto:', data);
          setPlayers(data.players);
          setFood(data.food);
        });
        
        return () => {
          console.log('Disconnessione da Pusher...');
          channel.unbind_all();
          channel.unsubscribe();
          pusherRef.current.disconnect();
        };
      } catch (err) {
        console.error('Errore durante l\'inizializzazione di Pusher:', err);
        setDebugInfo(prev => prev + '\nErrore Pusher: ' + err.message);
        setError('Errore durante l\'inizializzazione di Pusher: ' + err.message);
      }
    }
  }, [gameStarted]);
  
  // Gestisce il loop di gioco
  useEffect(() => {
    if (gameStarted && playerId) {
      try {
        console.log('Inizializzazione del canvas...');
        setDebugInfo(prev => prev + '\nInizializzazione del canvas...');
        
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error('Canvas non trovato');
        }
        
        const ctx = canvas.getContext('2d');
        const gridSize = 20;
        
        // Imposta le dimensioni del canvas
        canvas.width = 600;
        canvas.height = 600;
        
        console.log('Canvas inizializzato:', canvas.width, 'x', canvas.height);
        setDebugInfo(prev => prev + `\nCanvas inizializzato: ${canvas.width}x${canvas.height}`);
        
        // Funzione per disegnare il serpente
        const drawSnake = (snake, color) => {
          ctx.fillStyle = color;
          snake.forEach(segment => {
            ctx.fillRect(segment.x, segment.y, gridSize, gridSize);
          });
        };
        
        // Funzione per disegnare il cibo
        const drawFood = () => {
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(food.x, food.y, gridSize, gridSize);
        };
        
        // Funzione per disegnare il punteggio
        const drawScore = () => {
          ctx.fillStyle = '#000';
          ctx.font = '20px Arial';
          ctx.fillText(`Punteggio: ${score}`, 10, 30);
        };
        
        // Funzione per aggiornare il gioco
        const updateGame = async () => {
          try {
            console.log('Invio richiesta di movimento...');
            
            const res = await fetch('/api/move', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                playerId,
                direction: directionRef.current
              }),
            });
            
            console.log('Risposta ricevuta:', res.status);
            
            if (!res.ok) {
              const errorText = await res.text();
              console.error('Errore API:', res.status, errorText);
              setDebugInfo(prev => prev + `\nErrore API move: ${res.status} - ${errorText}`);
              throw new Error(`Errore API: ${res.status}`);
            }
            
            const data = await res.json();
            console.log('Dati ricevuti:', data);
            setPlayers(data.players);
            setFood(data.food);
            
            // Aggiorna il punteggio del giocatore corrente
            const currentPlayer = data.players.find(p => p.id === playerId);
            if (currentPlayer) {
              setScore(currentPlayer.score);
            }
          } catch (err) {
            console.error('Errore durante l\'aggiornamento:', err);
            setDebugInfo(prev => prev + '\nErrore aggiornamento: ' + err.message);
          }
        };
        
        // Funzione per disegnare il gioco
        const drawGame = () => {
          // Pulisci il canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Disegna una griglia leggera di sfondo
          ctx.strokeStyle = '#eee';
          for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
          for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
          
          // Disegna tutti i serpenti
          players.forEach(player => {
            console.log(`Disegno serpente di ${player.name}:`, player.snake);
            drawSnake(player.snake, player.color);
          });
          
          // Disegna il cibo
          console.log('Disegno cibo:', food);
          drawFood();
          
          // Disegna il punteggio
          drawScore();
        };
        
        // Avvia il loop di gioco
        console.log('Avvio loop di gioco...');
        setDebugInfo(prev => prev + '\nAvvio loop di gioco...');
        
        // Esegui drawGame una volta subito all'inizio
        drawGame();
        
        gameLoopRef.current = setInterval(() => {
          updateGame();
          drawGame();
        }, 200);  // Riduco la velocità per meglio diagnosticare
        
        return () => {
          console.log('Termine loop di gioco...');
          clearInterval(gameLoopRef.current);
        };
      } catch (err) {
        console.error('Errore durante l\'inizializzazione del gioco:', err);
        setDebugInfo(prev => prev + '\nErrore inizializzazione: ' + err.message);
        setError('Errore durante l\'inizializzazione del gioco: ' + err.message);
      }
    }
  }, [gameStarted, playerId, players, food, score]);
  
  // Gestisce gli input da tastiera
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!gameStarted) return;
      
      console.log('Tasto premuto:', e.key);
      
      switch (e.key) {
        case 'ArrowUp':
          if (directionRef.current !== 'down') directionRef.current = 'up';
          break;
        case 'ArrowDown':
          if (directionRef.current !== 'up') directionRef.current = 'down';
          break;
        case 'ArrowLeft':
          if (directionRef.current !== 'right') directionRef.current = 'left';
          break;
        case 'ArrowRight':
          if (directionRef.current !== 'left') directionRef.current = 'right';
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameStarted]);
  
  const handleStartGame = async (e) => {
    e.preventDefault();
    console.clear();  // Pulisci la console per avere log puliti
    console.log('Tentativo di avvio gioco...');
    setDebugInfo('Tentativo di avvio gioco...');
    
    try {
      console.log('Invio richiesta join...');
      setDebugInfo(prev => prev + '\nInvio richiesta join...');
      
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: playerName,
          color: playerColor
        }),
      });
      
      console.log('Risposta ricevuta:', res.status);
      setDebugInfo(prev => prev + `\nRisposta ricevuta: ${res.status}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Errore API:', res.status, errorText);
        setDebugInfo(prev => prev + `\nErrore API join: ${res.status} - ${errorText}`);
        throw new Error(`Errore API: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Dati ricevuti:', data);
      setDebugInfo(prev => prev + '\nDati ricevuti con successo');
      
      setPlayerId(data.playerId);
      setPlayers(data.players);
      setFood(data.food);
      setGameStarted(true);
      setError('');
      
      console.log('Gioco avviato con successo');
      setDebugInfo(prev => prev + '\nGioco avviato con successo');
    } catch (err) {
      console.error('Errore durante l\'avvio del gioco:', err);
      setDebugInfo(prev => prev + '\nErrore avvio: ' + err.message);
      setError('Errore durante l\'avvio del gioco: ' + err.message);
    }
  };
  
  return (
    <div className="container">
      <h1>Snake Battle</h1>
      
      {!gameStarted ? (
        <form onSubmit={handleStartGame}>
          <div>
            <label htmlFor="name">Nome:</label>
            <input
              type="text"
              id="name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
            />
          </div>
          
          <div>
            <label htmlFor="color">Colore:</label>
            <input
              type="color"
              id="color"
              value={playerColor}
              onChange={(e) => setPlayerColor(e.target.value)}
            />
          </div>
          
          <button type="submit">Inizia Partita</button>
          
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <div id="game-container">
          <canvas ref={canvasRef} id="gameCanvas"></canvas>
          <div className="instructions">
            <p>Usa le frecce direzionali per muovere il serpente</p>
            <p>Punteggio: {score}</p>
            {error && <p className="error">{error}</p>}
          </div>
          
          {/* Debug panel */}
          <div className="debug-panel">
            <h3>Debug Info</h3>
            <pre>{debugInfo}</pre>
          </div>
        </div>
      )}
      
      <style jsx>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          text-align: center;
        }
        
        form {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 300px;
          margin: 0 auto;
        }
        
        form div {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        input {
          margin-left: 10px;
        }
        
        button {
          padding: 10px 20px;
          background-color: #0070f3;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
        }
        
        button:hover {
          background-color: #0051a2;
        }
        
        .error {
          color: red;
          font-weight: bold;
        }
        
        #game-container {
          margin-top: 20px;
        }
        
        #gameCanvas {
          border: 1px solid #000;
          background-color: #fff;
        }
        
        .instructions {
          margin-top: 20px;
          font-size: 16px;
        }
        
        .debug-panel {
          margin-top: 20px;
          text-align: left;
          border: 1px solid #ccc;
          padding: 10px;
          background-color: #f9f9f9;
          border-radius: 5px;
        }
        
        .debug-panel pre {
          white-space: pre-wrap;
          font-family: monospace;
          font-size: 12px;
          max-height: 200px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
} 