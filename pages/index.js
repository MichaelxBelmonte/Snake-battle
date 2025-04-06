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
  
  const canvasRef = useRef(null);
  const pusherRef = useRef(null);
  const gameLoopRef = useRef(null);
  const directionRef = useRef('right');
  
  // Inizializza Pusher
  useEffect(() => {
    if (gameStarted) {
      pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER
      });
      
      const channel = pusherRef.current.subscribe('snake-game');
      
      channel.bind('player-joined', (data) => {
        setPlayers(data.players);
        setFood(data.food);
      });
      
      channel.bind('player-moved', (data) => {
        setPlayers(data.players);
        setFood(data.food);
      });
      
      return () => {
        channel.unbind_all();
        channel.unsubscribe();
        pusherRef.current.disconnect();
      };
    }
  }, [gameStarted]);
  
  // Gestisce il loop di gioco
  useEffect(() => {
    if (gameStarted && playerId) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const gridSize = 20;
      
      // Imposta le dimensioni del canvas
      canvas.width = 600;
      canvas.height = 600;
      
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
          
          if (!res.ok) {
            throw new Error('Errore durante l\'aggiornamento del gioco');
          }
          
          const data = await res.json();
          setPlayers(data.players);
          setFood(data.food);
          
          // Aggiorna il punteggio del giocatore corrente
          const currentPlayer = data.players.find(p => p.id === playerId);
          if (currentPlayer) {
            setScore(currentPlayer.score);
          }
        } catch (err) {
          console.error('Errore durante l\'aggiornamento:', err);
        }
      };
      
      // Funzione per disegnare il gioco
      const drawGame = () => {
        // Pulisci il canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Disegna tutti i serpenti
        players.forEach(player => {
          drawSnake(player.snake, player.color);
        });
        
        // Disegna il cibo
        drawFood();
        
        // Disegna il punteggio
        drawScore();
      };
      
      // Avvia il loop di gioco
      gameLoopRef.current = setInterval(() => {
        updateGame();
        drawGame();
      }, 100);
      
      return () => {
        clearInterval(gameLoopRef.current);
      };
    }
  }, [gameStarted, playerId, players, food, score]);
  
  // Gestisce gli input da tastiera
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!gameStarted) return;
      
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
    
    try {
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
      
      if (!res.ok) {
        throw new Error('Errore durante l\'accesso al gioco');
      }
      
      const data = await res.json();
      setPlayerId(data.playerId);
      setPlayers(data.players);
      setFood(data.food);
      setGameStarted(true);
      setError('');
    } catch (err) {
      setError(err.message);
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
        }
        
        #game-container {
          margin-top: 20px;
        }
        
        #gameCanvas {
          border: 1px solid #000;
        }
        
        .instructions {
          margin-top: 20px;
          font-size: 16px;
        }
      `}</style>
    </div>
  );
} 