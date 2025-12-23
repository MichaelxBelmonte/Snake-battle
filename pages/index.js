import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { io } from 'socket.io-client';

// Server URL - Socket.IO server
const getServerUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:3001';

  const hostname = window.location.hostname;

  // Production: use Railway server
  if (hostname.includes('vercel.app') || hostname.includes('snake-battle')) {
    // Replace with your Railway URL after deployment
    return process.env.NEXT_PUBLIC_SOCKET_SERVER || 'https://snake-battle-server-production.up.railway.app';
  }

  // Development: use local server
  return `http://${hostname}:3001`;
};

// Cache per i colori calcolati (memoization)
const colorCache = new Map();

const darkenColor = (hex, percent) => {
  if (!hex || typeof hex !== 'string') return '#000000';
  const cacheKey = `${hex}-${percent}`;
  if (colorCache.has(cacheKey)) return colorCache.get(cacheKey);

  try {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    r = Math.floor(r * (100 - percent) / 100);
    g = Math.floor(g * (100 - percent) / 100);
    b = Math.floor(b * (100 - percent) / 100);
    const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    colorCache.set(cacheKey, result);
    return result;
  } catch {
    return '#000000';
  }
};

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#4CAF50');
  const [gameStarted, setGameStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [latency, setLatency] = useState(0);

  // Game state - received from server
  const [gameState, setGameState] = useState({ players: [], food: [] });

  // Refs
  const canvasRef = useRef(null);
  const gridCanvasRef = useRef(null);
  const socketRef = useRef(null);
  const directionRef = useRef('right');
  const gridSize = 20;

  // Interpolation refs for smooth rendering
  const prevStateRef = useRef({ players: [], food: [] });
  const targetStateRef = useRef({ players: [], food: [] });
  const lastUpdateTimeRef = useRef(Date.now());
  const interpolationFactorRef = useRef(0);

  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => window.innerWidth < 768;
    setIsMobile(checkMobile());
    const handleResize = () => setIsMobile(checkMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard controls - send direction to server
  useEffect(() => {
    if (!gameStarted || !socketRef.current) return;

    const handleKeyPress = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
        e.preventDefault();
      }

      const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const keyMap = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
        W: 'up', S: 'down', A: 'left', D: 'right'
      };

      const newDir = keyMap[e.key];
      if (newDir && directionRef.current !== opposites[newDir]) {
        directionRef.current = newDir;
        // Send direction to server - server handles movement
        socketRef.current.emit('direction', newDir);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameStarted]);

  // Create cached grid
  useEffect(() => {
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 800;
    gridCanvas.height = 600;
    const gridCtx = gridCanvas.getContext('2d');

    gridCtx.fillStyle = '#121212';
    gridCtx.fillRect(0, 0, 800, 600);

    gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    gridCtx.lineWidth = 0.5;
    gridCtx.beginPath();
    for (let y = 0; y <= 600; y += gridSize) {
      gridCtx.moveTo(0, y);
      gridCtx.lineTo(800, y);
    }
    for (let x = 0; x <= 800; x += gridSize) {
      gridCtx.moveTo(x, 0);
      gridCtx.lineTo(x, 600);
    }
    gridCtx.stroke();

    gridCanvasRef.current = gridCanvas;
  }, []);

  // Interpolation helper function
  const lerp = (start, end, t) => start + (end - start) * t;

  // Rendering loop with interpolation
  useEffect(() => {
    if (!gameStarted || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const SERVER_TICK = 50; // Must match server tick rate

    const draw = () => {
      // Calculate interpolation factor (0 to 1)
      const elapsed = Date.now() - lastUpdateTimeRef.current;
      const t = Math.min(elapsed / SERVER_TICK, 1);

      // Draw cached grid
      if (gridCanvasRef.current) {
        ctx.drawImage(gridCanvasRef.current, 0, 0);
      } else {
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, 800, 600);
      }

      // Draw all players with interpolation
      const currentPlayers = targetStateRef.current.players || [];
      const prevPlayers = prevStateRef.current.players || [];

      currentPlayers.forEach(player => {
        const playerSnake = player.snake || [];
        if (playerSnake.length === 0) return;

        const isMe = player.id === playerId;
        const pColor = player.color || '#888888';

        // Find previous state for this player
        const prevPlayer = prevPlayers.find(p => p.id === player.id);
        const prevSnake = prevPlayer?.snake || playerSnake;

        // Draw snake segments with interpolation
        playerSnake.forEach((segment, index) => {
          // Interpolate position if we have previous data
          let drawX = segment.x;
          let drawY = segment.y;

          if (prevSnake[index] && !isMe) {
            // Only interpolate other players (own snake should be responsive)
            const prevSeg = prevSnake[index];
            // Handle wraparound - don't interpolate across screen edges
            const dx = Math.abs(segment.x - prevSeg.x);
            const dy = Math.abs(segment.y - prevSeg.y);
            if (dx < 100 && dy < 100) {
              drawX = lerp(prevSeg.x, segment.x, t);
              drawY = lerp(prevSeg.y, segment.y, t);
            }
          }

          if (index === 0) {
            // Head with border (thicker for own snake)
            ctx.fillStyle = '#FFFFFF';
            const border = isMe ? 2 : 1;
            ctx.fillRect(drawX - border, drawY - border, gridSize + border * 2, gridSize + border * 2);
            ctx.fillStyle = pColor;
          } else {
            ctx.fillStyle = darkenColor(pColor, index * 5);
          }
          ctx.fillRect(drawX, drawY, gridSize - 1, gridSize - 1);

          // Eyes on head (only for own snake)
          if (index === 0 && isMe) {
            ctx.fillStyle = '#000000';
            let eyeX1, eyeY1, eyeX2, eyeY2;
            const dir = player.direction || 'right';

            switch (dir) {
              case 'up':
                eyeX1 = drawX + gridSize * 0.25; eyeY1 = drawY + gridSize * 0.25;
                eyeX2 = drawX + gridSize * 0.75; eyeY2 = drawY + gridSize * 0.25;
                break;
              case 'down':
                eyeX1 = drawX + gridSize * 0.25; eyeY1 = drawY + gridSize * 0.75;
                eyeX2 = drawX + gridSize * 0.75; eyeY2 = drawY + gridSize * 0.75;
                break;
              case 'left':
                eyeX1 = drawX + gridSize * 0.25; eyeY1 = drawY + gridSize * 0.25;
                eyeX2 = drawX + gridSize * 0.25; eyeY2 = drawY + gridSize * 0.75;
                break;
              default: // right
                eyeX1 = drawX + gridSize * 0.75; eyeY1 = drawY + gridSize * 0.25;
                eyeX2 = drawX + gridSize * 0.75; eyeY2 = drawY + gridSize * 0.75;
            }

            ctx.beginPath();
            ctx.arc(eyeX1, eyeY1, 3, 0, Math.PI * 2);
            ctx.arc(eyeX2, eyeY2, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // Draw name above head
        const head = playerSnake[0];
        const prevHead = prevSnake[0] || head;
        let nameX = head.x;
        let nameY = head.y;
        if (!isMe && Math.abs(head.x - prevHead.x) < 100) {
          nameX = lerp(prevHead.x, head.x, t);
          nameY = lerp(prevHead.y, head.y, t);
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = isMe ? 'bold 14px Arial' : 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name || 'Player', nameX + gridSize/2, nameY - 8);
      });

      // Draw food
      const currentFood = targetStateRef.current.food || [];
      ctx.fillStyle = '#FF6347';
      currentFood.forEach(foodItem => {
        ctx.beginPath();
        ctx.arc(foodItem.x + gridSize/2, foodItem.y + gridSize/2, gridSize/2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(foodItem.x + gridSize/3, foodItem.y + gridSize/3, gridSize/6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FF6347';
      });

      // Draw UI - Scores
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';

      // Find my score
      const myPlayer = gameState.players.find(p => p.id === playerId);
      const myScore = myPlayer?.score || 0;
      ctx.fillText(`${playerName}: ${myScore}`, 20, 25);

      // Show player count
      ctx.textAlign = 'right';
      ctx.fillText(`Giocatori: ${gameState.players.length}`, 780, 25);

      // Show latency
      ctx.font = '12px Arial';
      ctx.fillText(`Ping: ${latency}ms`, 780, 45);

      // Connection status indicator
      ctx.fillStyle = connectionStatus === 'connected' ? '#00FF00' : '#FF0000';
      ctx.beginPath();
      ctx.arc(770, 60, 6, 0, Math.PI * 2);
      ctx.fill();

      // Leaderboard
      const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score).slice(0, 5);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(5, 560, 150, sortedPlayers.length * 18 + 25);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Classifica:', 10, 575);

      ctx.font = '11px Arial';
      sortedPlayers.forEach((p, i) => {
        const displayName = p.name.length > 10 ? p.name.substring(0, 10) + '...' : p.name;
        ctx.fillStyle = p.id === playerId ? '#FFD700' : '#FFFFFF';
        ctx.fillText(`${i + 1}. ${displayName}: ${p.score}`, 10, 590 + i * 15);
      });

      requestAnimationFrame(draw);
    };

    const animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [gameStarted, gameState, playerId, playerName, latency, connectionStatus]);

  // Latency measurement
  useEffect(() => {
    if (!socketRef.current || connectionStatus !== 'connected') return;

    const measureLatency = () => {
      const start = Date.now();
      socketRef.current.emit('ping', start);
    };

    const interval = setInterval(measureLatency, 2000);
    return () => clearInterval(interval);
  }, [connectionStatus]);

  // Start game - connect to Socket.IO server
  const handleStartGame = async (e) => {
    e.preventDefault();

    if (!playerName) {
      setError('Inserisci il tuo nome');
      return;
    }

    if (isLoading) return;

    setError('');
    setIsLoading(true);

    try {
      const serverUrl = getServerUrl();
      console.log('Connecting to:', serverUrl);

      // Connect to Socket.IO server
      const socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Connected to server:', socket.id);
        setConnectionStatus('connected');

        // Join the game
        socket.emit('join', {
          name: playerName,
          color: playerColor
        });
      });

      socket.on('joined', (data) => {
        console.log('Joined game:', data);
        setPlayerId(data.id);
        setGameStarted(true);
        setIsLoading(false);
      });

      socket.on('gameState', (state) => {
        // Store previous state for interpolation
        prevStateRef.current = targetStateRef.current;
        targetStateRef.current = state;
        lastUpdateTimeRef.current = Date.now();
        interpolationFactorRef.current = 0;

        setGameState(state);

        // Update direction ref from server state
        const myPlayer = state.players.find(p => p.id === playerId);
        if (myPlayer) {
          directionRef.current = myPlayer.direction;
        }
      });

      socket.on('pong', (startTime) => {
        const lat = Date.now() - startTime;
        setLatency(lat);
      });

      socket.on('playerLeft', (leftPlayerId) => {
        console.log('Player left:', leftPlayerId);
      });

      socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        setError(`Errore di connessione: ${err.message}`);
        setConnectionStatus('error');
        setIsLoading(false);
      });

      socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        setConnectionStatus('disconnected');
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          socket.connect();
        }
      });

      // Canvas setup
      if (canvasRef.current) {
        canvasRef.current.width = 800;
        canvasRef.current.height = 600;
      }

    } catch (err) {
      console.error('Error connecting:', err);
      setError('Errore di connessione al server');
      setIsLoading(false);
    }
  };

  // Handle direction change for mobile
  const handleMobileDirection = (newDir) => {
    if (!socketRef.current) return;

    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (directionRef.current !== opposites[newDir]) {
      directionRef.current = newDir;
      socketRef.current.emit('direction', newDir);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="container">
      <Head>
        <title>Snake Battle - Multiplayer</title>
        <meta name="description" content="Snake Multiplayer Battle" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <main className="main">
        <h1 className="title">Snake Battle</h1>

        {!gameStarted ? (
          <div className="loginContainer">
            <form onSubmit={handleStartGame} className="loginForm">
              <div className="form-group">
                <label htmlFor="name">Nome:</label>
                <input
                  type="text"
                  id="name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  required
                  placeholder="Inserisci il tuo nome"
                  maxLength={20}
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

              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Connessione...' : 'Gioca Online'}
              </button>

              {error && <p className="error">{error}</p>}
            </form>

            <div className="instructions-card">
              <h2>Come giocare</h2>
              <ul>
                <li>Usa le <strong>frecce direzionali</strong> o <strong>WASD</strong> per muovere</li>
                <li>Raccogli il <strong>cibo</strong> per crescere (+10 punti)</li>
                <li>Evita di collidere con te stesso o altri giocatori</li>
                <li>Se colpisci un altro giocatore, lui guadagna 50 punti!</li>
              </ul>
              <p className="server-info" suppressHydrationWarning>
                Server: {typeof window !== 'undefined' ? getServerUrl() : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="game-container">
            <canvas
              ref={canvasRef}
              width="800"
              height="600"
              style={{
                display: 'block',
                margin: '0 auto',
                border: '4px solid #333',
                borderRadius: '8px',
                backgroundColor: '#121212',
                maxWidth: '100%',
                height: 'auto'
              }}
            />

            {isMobile && (
              <div className="mobile-controls">
                <div className="control-button up" onClick={() => handleMobileDirection('up')}>▲</div>
                <div className="controls-row">
                  <div className="control-button left" onClick={() => handleMobileDirection('left')}>◀</div>
                  <div className="control-button right" onClick={() => handleMobileDirection('right')}>▶</div>
                </div>
                <div className="control-button down" onClick={() => handleMobileDirection('down')}>▼</div>
              </div>
            )}

            <button className="restart-button" onClick={() => window.location.reload()}>
              Esci
            </button>
          </div>
        )}
      </main>

      <style jsx>{`
        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 100vh;
          padding: 20px;
          background-color: #191970;
          color: white;
          font-family: Arial, sans-serif;
        }

        h1 {
          margin-bottom: 20px;
          font-size: 2.5rem;
          background: linear-gradient(45deg, #2196F3, #e91e63);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-align: center;
        }

        .loginContainer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          width: 100%;
          max-width: 500px;
          padding: 20px;
          background-color: #2c3e50;
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        form {
          display: flex;
          flex-direction: column;
          width: 100%;
          gap: 15px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        label {
          font-weight: bold;
        }

        input {
          padding: 10px;
          border-radius: 4px;
          border: 1px solid #ccc;
          font-size: 16px;
        }

        button {
          padding: 12px;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        button:hover {
          background-color: #2980b9;
        }

        button:disabled {
          background-color: #7f8c8d;
          cursor: not-allowed;
        }

        .error {
          color: #e74c3c;
          font-weight: bold;
        }

        .instructions-card {
          width: 100%;
          padding: 15px;
          background-color: #34495e;
          border-radius: 8px;
        }

        .instructions-card h2 {
          margin-top: 0;
          margin-bottom: 10px;
          color: #3498db;
        }

        .instructions-card ul {
          margin: 0;
          padding-left: 20px;
          line-height: 1.6;
        }

        .server-info {
          margin-top: 15px;
          padding-top: 10px;
          border-top: 1px solid #4a6278;
          font-size: 12px;
          color: #95a5a6;
        }

        .game-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          margin-top: 20px;
          width: 100%;
          max-width: 840px;
        }

        .mobile-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 20px;
        }

        .controls-row {
          display: flex;
          gap: 50px;
        }

        .control-button {
          width: 60px;
          height: 60px;
          background-color: rgba(255, 255, 255, 0.2);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 24px;
          margin: 5px;
          user-select: none;
          cursor: pointer;
        }

        .control-button:active {
          background-color: rgba(255, 255, 255, 0.3);
        }

        .restart-button {
          margin-top: 20px;
          background-color: #e74c3c;
        }

        .restart-button:hover {
          background-color: #c0392b;
        }

        @media (max-width: 768px) {
          .container {
            padding: 10px;
          }

          h1 {
            font-size: 2rem;
          }

          .control-button {
            width: 50px;
            height: 50px;
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}
