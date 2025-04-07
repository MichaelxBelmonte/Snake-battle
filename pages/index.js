import { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

// URL dell'API da utilizzare in produzione o in sviluppo
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://snake-battle.vercel.app' 
  : '';

// Funzioni di utilità per i colori
const darkenColor = (hex, percent) => {
  // Converte esadecimale in RGB
  let r = parseInt(hex.substring(1, 3), 16);
  let g = parseInt(hex.substring(3, 5), 16);
  let b = parseInt(hex.substring(5, 7), 16);
  
  // Applica la percentuale di oscuramento
  r = Math.floor(r * (100 - percent) / 100);
  g = Math.floor(g * (100 - percent) / 100);
  b = Math.floor(b * (100 - percent) / 100);
  
  // Converte di nuovo in esadecimale
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Crea un colore con diversa opacità
const adjustOpacity = (hex, opacity) => {
  // Converte esadecimale in RGB
  let r = parseInt(hex.substring(1, 3), 16);
  let g = parseInt(hex.substring(3, 5), 16);
  let b = parseInt(hex.substring(5, 7), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#ff0000');
  const [gameStarted, setGameStarted] = useState(false);
  const [error, setError] = useState('');
  
  // Stato locale del gioco
  const [playerState, setPlayerState] = useState(null);
  const [foodState, setFoodState] = useState({ x: 0, y: 0 });
  const [otherPlayers, setOtherPlayers] = useState([]);
  const [playerId, setPlayerId] = useState(null);
  const [score, setScore] = useState(0);
  const [debugInfo, setDebugInfo] = useState('');
  const [lastApiUpdate, setLastApiUpdate] = useState(0);
  const [foodAnimation, setFoodAnimation] = useState(0);
  
  const canvasRef = useRef(null);
  const pusherRef = useRef(null);
  const renderLoopRef = useRef(null);
  const apiLoopRef = useRef(null);
  const directionRef = useRef('right');
  const lastDirectionRef = useRef('right');
  
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
          
          // Aggiungi il nuovo giocatore agli altri giocatori se non è l'utente corrente
          if (data.newPlayer && data.newPlayer.id !== playerId) {
            setOtherPlayers(prev => [...prev, data.newPlayer]);
          }
          
          // Aggiorna il cibo se necessario
          if (data.food) {
            setFoodState(data.food);
          }
        });
        
        channel.bind('player-moved', (data) => {
          console.log('Evento player-moved ricevuto:', data);
          
          // Aggiorna la posizione degli altri giocatori
          if (data.playerId && data.playerId !== playerId && data.player) {
            setOtherPlayers(prev => {
              const newPlayers = [...prev];
              const index = newPlayers.findIndex(p => p.id === data.playerId);
              if (index !== -1) {
                newPlayers[index] = data.player;
              } else {
                // Aggiungi il giocatore se non esiste
                newPlayers.push(data.player);
              }
              return newPlayers;
            });
          }
          
          // Aggiorna il cibo se necessario
          if (data.food) {
            setFoodState(data.food);
          }
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
  }, [gameStarted, playerId]);
  
  // Funzione di movimento locale predittivo (più fluido)
  const moveSnakeLocally = () => {
    if (!playerState || !playerState.snake || playerState.snake.length === 0) return;
    
    const gridSize = 20;
    const head = { ...playerState.snake[0] };
    
    // Aggiorna la posizione della testa in base alla direzione
    switch (directionRef.current) {
      case 'up':
        head.y -= gridSize;
        if (head.y < 0) head.y = 600 - gridSize;
        break;
      case 'down':
        head.y += gridSize;
        if (head.y >= 600) head.y = 0;
        break;
      case 'left':
        head.x -= gridSize;
        if (head.x < 0) head.x = 600 - gridSize;
        break;
      case 'right':
        head.x += gridSize;
        if (head.x >= 600) head.x = 0;
        break;
    }
    
    const newSnake = [head, ...playerState.snake.slice(0, -1)];
    
    // Controlla se ha mangiato il cibo (questo è solo visivo, il server farà la verifica effettiva)
    if (head.x === foodState.x && head.y === foodState.y) {
      setPlayerState(prev => ({
        ...prev,
        snake: [head, ...prev.snake], // Non rimuove l'ultimo segmento
        score: prev.score + 10
      }));
      setScore(prev => prev + 10);
    } else {
      setPlayerState(prev => ({
        ...prev,
        snake: newSnake
      }));
    }
    
    // Salva l'ultima direzione
    lastDirectionRef.current = directionRef.current;
  };
  
  // Loop di aggiornamento API
  const updateWithServer = async () => {
    if (!playerState || !playerId) return;
    
    try {
      console.log('Invio richiesta di movimento...');
      
      const apiUrl = `${API_BASE_URL}/api/move`;
      
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          direction: directionRef.current,
          playerState,
          foodState
        }),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Errore API:', res.status, errorText);
        setDebugInfo(prev => prev + `\nErrore API move: ${res.status} - ${errorText}`);
        throw new Error(`Errore API: ${res.status}`);
      }
      
      const data = await res.json();
      
      // Aggiorna lo stato locale con i dati dal server
      setPlayerState(data.player);
      setFoodState(data.food);
      setScore(data.player.score);
      setLastApiUpdate(Date.now());
      
    } catch (err) {
      console.error('Errore durante l\'aggiornamento:', err);
      setDebugInfo(prev => prev + '\nErrore aggiornamento: ' + err.message);
    }
  };
  
  // Gestisce il loop di gioco con rendering separato dalle API
  useEffect(() => {
    if (gameStarted && playerId && playerState) {
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
        
        // Funzione per disegnare il serpente migliorata
        const drawSnake = (snake, color) => {
          if (!snake || snake.length === 0) return;
          
          // Disegna il corpo
          for (let i = snake.length - 1; i >= 0; i--) {
            const segment = snake[i];
            const isHead = i === 0;
            
            if (isHead) {
              // Testa del serpente - più scura con occhi
              ctx.fillStyle = darkenColor(color, 15);
              ctx.beginPath();
              ctx.arc(segment.x + gridSize/2, segment.y + gridSize/2, gridSize/2, 0, Math.PI * 2);
              ctx.fill();
              
              // Direzione della testa (per gli occhi)
              let eyeX1 = 0, eyeY1 = 0, eyeX2 = 0, eyeY2 = 0;
              
              // Posiziona gli occhi in base alla direzione
              const direction = snake.length > 1 ? 
                getDirection(snake[0], snake[1]) : 
                lastDirectionRef.current;
                
              if (direction === 'right' || direction === 'left') {
                // Occhi orizzontali
                eyeX1 = segment.x + (direction === 'right' ? gridSize * 0.7 : gridSize * 0.3);
                eyeY1 = segment.y + gridSize * 0.3;
                eyeX2 = segment.x + (direction === 'right' ? gridSize * 0.7 : gridSize * 0.3);
                eyeY2 = segment.y + gridSize * 0.7;
              } else {
                // Occhi verticali
                eyeX1 = segment.x + gridSize * 0.3;
                eyeY1 = segment.y + (direction === 'down' ? gridSize * 0.7 : gridSize * 0.3);
                eyeX2 = segment.x + gridSize * 0.7;
                eyeY2 = segment.y + (direction === 'down' ? gridSize * 0.7 : gridSize * 0.3);
              }
              
              // Occhi bianchi
              ctx.fillStyle = 'white';
              ctx.beginPath();
              ctx.arc(eyeX1, eyeY1, gridSize/6, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(eyeX2, eyeY2, gridSize/6, 0, Math.PI * 2);
              ctx.fill();
              
              // Pupille nere
              ctx.fillStyle = 'black';
              ctx.beginPath();
              ctx.arc(eyeX1, eyeY1, gridSize/12, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              ctx.arc(eyeX2, eyeY2, gridSize/12, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Corpo del serpente con effetto gradiente
              const opacity = 1 - (i / snake.length) * 0.6;
              ctx.fillStyle = adjustOpacity(color, opacity);
              
              // Usa cerchi per segmenti del corpo
              ctx.beginPath();
              ctx.arc(segment.x + gridSize/2, segment.y + gridSize/2, (gridSize/2) - 1, 0, Math.PI * 2);
              ctx.fill();
              
              // Effetto highlight
              ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.beginPath();
              ctx.arc(segment.x + gridSize/2 - 2, segment.y + gridSize/2 - 2, gridSize/6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        };
        
        // Funzione per determinare la direzione tra due segmenti
        const getDirection = (segment1, segment2) => {
          if (segment1.x < segment2.x) return 'left';
          if (segment1.x > segment2.x) return 'right';
          if (segment1.y < segment2.y) return 'up';
          return 'down';
        };
        
        // Funzione per disegnare il cibo con animazione
        const drawFood = () => {
          // Aggiorna l'animazione del cibo
          setFoodAnimation(prev => (prev + 0.05) % (Math.PI * 2));
          
          // Disegna una mela invece di un quadrato
          ctx.fillStyle = '#e73c3e';
          ctx.beginPath();
          
          // Dimensione oscillante per l'animazione
          const size = gridSize/2 + Math.sin(foodAnimation) * 2;
          
          ctx.arc(
            foodState.x + gridSize/2, 
            foodState.y + gridSize/2, 
            size, 
            0, 
            Math.PI * 2
          );
          ctx.fill();
          
          // Picciolo
          ctx.fillStyle = '#7d4e11';
          ctx.fillRect(
            foodState.x + gridSize/2 - 1, 
            foodState.y + 2, 
            2, 
            5
          );
          
          // Foglia
          ctx.fillStyle = '#4CAF50';
          ctx.beginPath();
          ctx.ellipse(
            foodState.x + gridSize/2 + 3, 
            foodState.y + 4, 
            3, 
            2, 
            Math.PI/4, 
            0, 
            Math.PI * 2
          );
          ctx.fill();
          
          // Brillantezza
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.beginPath();
          ctx.arc(
            foodState.x + gridSize/3, 
            foodState.y + gridSize/3, 
            gridSize/6, 
            0, 
            Math.PI * 2
          );
          ctx.fill();
        };
        
        // Funzione per disegnare il punteggio
        const drawScore = () => {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 20px Poppins';
          ctx.textAlign = 'left';
          ctx.fillText(`Punteggio: ${score}`, 20, 30);
          
          // Nome del giocatore
          if (playerState && playerState.name) {
            ctx.fillStyle = playerState.color;
            ctx.textAlign = 'right';
            ctx.fillText(playerState.name, canvas.width - 20, 30);
          }
        };
        
        // Funzione per disegnare la griglia
        const drawGrid = () => {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
          
          // Righe orizzontali
          for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
          
          // Righe verticali
          for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
        };
        
        // Funzione per disegnare il gioco
        const drawGame = () => {
          // Pulisci il canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Disegna sfondo gradiente
          const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          grd.addColorStop(0, "#1e293b");
          grd.addColorStop(1, "#0f172a");
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Disegna la griglia
          drawGrid();
          
          // Disegna gli altri giocatori
          otherPlayers.forEach(player => {
            if (player && player.snake) {
              drawSnake(player.snake, player.color);
            }
          });
          
          // Disegna il giocatore corrente
          if (playerState && playerState.snake) {
            drawSnake(playerState.snake, playerState.color);
          }
          
          // Disegna il cibo
          drawFood();
          
          // Disegna il punteggio
          drawScore();
          
          // Disegna i nomi degli altri giocatori sopra le loro teste
          otherPlayers.forEach(player => {
            if (player && player.snake && player.snake.length > 0) {
              const head = player.snake[0];
              ctx.fillStyle = player.color;
              ctx.font = '14px Poppins';
              ctx.textAlign = 'center';
              ctx.fillText(player.name, head.x + gridSize/2, head.y - 5);
            }
          });
        };
        
        console.log('Avvio loop di gioco...');
        setDebugInfo(prev => prev + '\nAvvio loop di gioco...');
        
        // Esegui drawGame una volta subito all'inizio
        drawGame();
        
        // Loop di rendering a 60 FPS
        renderLoopRef.current = setInterval(() => {
          moveSnakeLocally(); // Movimento locale predittivo
          drawGame();
        }, 1000 / 15); // ~15 FPS per il movimento locale
        
        // Loop delle API molto più lento (sincronizzazione con server)
        apiLoopRef.current = setInterval(() => {
          updateWithServer();
        }, 500); // Aggiorna con il server ogni 500ms
        
        return () => {
          console.log('Termine loop di gioco...');
          clearInterval(renderLoopRef.current);
          clearInterval(apiLoopRef.current);
        };
      } catch (err) {
        console.error('Errore durante l\'inizializzazione del gioco:', err);
        setDebugInfo(prev => prev + '\nErrore inizializzazione: ' + err.message);
        setError('Errore durante l\'inizializzazione del gioco: ' + err.message);
      }
    }
  }, [gameStarted, playerId, playerState]);
  
  // Gestisce gli input da tastiera
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!gameStarted) return;
      
      switch (e.key) {
        case 'ArrowUp':
          if (lastDirectionRef.current !== 'down') directionRef.current = 'up';
          break;
        case 'ArrowDown':
          if (lastDirectionRef.current !== 'up') directionRef.current = 'down';
          break;
        case 'ArrowLeft':
          if (lastDirectionRef.current !== 'right') directionRef.current = 'left';
          break;
        case 'ArrowRight':
          if (lastDirectionRef.current !== 'left') directionRef.current = 'right';
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
      
      const apiUrl = `${API_BASE_URL}/api/join`;
      console.log('URL API join:', apiUrl);
      setDebugInfo(prev => prev + `\nURL API join: ${apiUrl}`);
      
      const res = await fetch(apiUrl, {
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
      
      // Imposta lo stato iniziale dal server
      setPlayerId(data.playerId);
      setPlayerState(data.player);
      setFoodState(data.food);
      setScore(data.player.score);
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
        <div className="login-container">
          <form onSubmit={handleStartGame}>
            <div className="form-group">
              <label htmlFor="name">Nome:</label>
              <input
                type="text"
                id="name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
                placeholder="Inserisci il tuo nome"
              />
            </div>
            
            <div className="form-group">
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
          
          <div className="instructions-card">
            <h2>Come giocare</h2>
            <ul>
              <li>Usa le <strong>frecce direzionali</strong> per muovere il serpente</li>
              <li>Raccogli il cibo per crescere e guadagnare punti</li>
              <li>Evita di scontrarti con gli altri serpenti</li>
              <li>Diventa il serpente più lungo della partita!</li>
            </ul>
          </div>
        </div>
      ) : (
        <div id="game-container">
          <canvas ref={canvasRef} id="gameCanvas"></canvas>
          <div className="game-info">
            <div className="stats">
              <div className="score">Punteggio: <span>{score}</span></div>
              <div className="player-count">Giocatori online: <span>{otherPlayers.length + 1}</span></div>
            </div>
            <div className="controls">
              <p>Usa le frecce direzionali ↑ ↓ ← → per muovere il serpente</p>
            </div>
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
        .login-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          margin-top: 2rem;
        }
        
        form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          width: 100%;
          max-width: 400px;
          padding: 2rem;
          background-color: var(--card-bg);
          border-radius: var(--border-radius);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        
        .form-group {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        label {
          font-weight: 500;
          color: var(--text-secondary);
        }
        
        button {
          margin-top: 1rem;
        }
        
        .instructions-card {
          width: 100%;
          max-width: 400px;
          padding: 1.5rem;
          background-color: var(--card-bg);
          border-radius: var(--border-radius);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          text-align: left;
        }
        
        .instructions-card h2 {
          margin-bottom: 1rem;
          font-size: 1.2rem;
          color: var(--text-color);
        }
        
        .instructions-card ul {
          padding-left: 1.2rem;
          color: var(--text-secondary);
        }
        
        .instructions-card li {
          margin-bottom: 0.5rem;
        }
        
        .instructions-card strong {
          color: var(--primary-color);
        }
        
        .game-info {
          margin-top: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .stats {
          display: flex;
          justify-content: space-between;
          font-size: 1.1rem;
        }
        
        .score, .player-count {
          padding: 0.5rem 1rem;
          background-color: rgba(255, 255, 255, 0.05);
          border-radius: 5px;
        }
        
        .score span, .player-count span {
          font-weight: 600;
          color: var(--primary-color);
        }
        
        .controls {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
} 