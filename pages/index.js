import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { io } from 'socket.io-client';

// Server URL - Socket.IO server
const getServerUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:3001';

  const hostname = window.location.hostname;

  // Production: use Railway server
  if (hostname.includes('vercel.app') || hostname.includes('snake-battle')) {
    return 'https://snake-battle-production.up.railway.app';
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
    const SERVER_TICK = 100; // Must match server tick rate

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

      // Draw food with different colors based on type
      const currentFood = targetStateRef.current.food || [];
      currentFood.forEach(foodItem => {
        const foodColor = foodItem.color || '#FF6347';
        const foodSize = foodItem.type === 'super' ? gridSize/2 + 3 :
                        foodItem.type === 'bonus' ? gridSize/2 + 1 : gridSize/2;

        // Glow effect for special food
        if (foodItem.type === 'super' || foodItem.type === 'bonus') {
          ctx.shadowColor = foodColor;
          ctx.shadowBlur = 10;
        }

        ctx.fillStyle = foodColor;
        ctx.beginPath();
        ctx.arc(foodItem.x + gridSize/2, foodItem.y + gridSize/2, foodSize, 0, Math.PI * 2);
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Shine effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(foodItem.x + gridSize/3, foodItem.y + gridSize/3, gridSize/6, 0, Math.PI * 2);
        ctx.fill();
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

      // Leaderboard - improved UI
      const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score).slice(0, 5);
      const lbHeight = sortedPlayers.length * 22 + 35;

      // Background with gradient effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.roundRect(5, 600 - lbHeight - 5, 180, lbHeight, 8);
      ctx.fill();

      // Border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Title
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('LEADERBOARD', 12, 600 - lbHeight + 15);

      // Players
      ctx.font = '12px Arial';
      sortedPlayers.forEach((p, i) => {
        const yPos = 600 - lbHeight + 35 + i * 22;
        const displayName = p.name.length > 8 ? p.name.substring(0, 8) + '..' : p.name;
        const isMe = p.id === playerId;

        // Highlight current player
        if (isMe) {
          ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
          ctx.fillRect(8, yPos - 12, 172, 18);
        }

        // Rank medal
        if (i === 0) ctx.fillStyle = '#FFD700'; // Gold
        else if (i === 1) ctx.fillStyle = '#C0C0C0'; // Silver
        else if (i === 2) ctx.fillStyle = '#CD7F32'; // Bronze
        else ctx.fillStyle = '#FFFFFF';

        ctx.fillText(`${i + 1}.`, 12, yPos);

        // Name
        ctx.fillStyle = isMe ? '#FFD700' : '#FFFFFF';
        ctx.fillText(displayName, 30, yPos);

        // Score
        ctx.fillStyle = '#4CAF50';
        ctx.fillText(`${p.score}`, 100, yPos);

        // Kills
        ctx.fillStyle = '#FF6347';
        ctx.font = '10px Arial';
        ctx.fillText(`K:${p.kills || 0}`, 145, yPos);
        ctx.font = '12px Arial';
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

  // Fetch online player count
  const [onlinePlayers, setOnlinePlayers] = useState(0);

  useEffect(() => {
    if (gameStarted) return;
    const fetchPlayers = async () => {
      try {
        const res = await fetch(`${getServerUrl()}/health`);
        const data = await res.json();
        setOnlinePlayers(data.players || 0);
      } catch (e) {
        setOnlinePlayers(0);
      }
    };
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 5000);
    return () => clearInterval(interval);
  }, [gameStarted]);

  return (
    <div className="container">
      <Head>
        <title>Snake Battle - Multiplayer Online</title>
        <meta name="description" content="Play Snake Battle - The ultimate multiplayer snake game. Compete against players worldwide!" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐍</text></svg>" />
      </Head>

      {/* Animated background */}
      <div className="bg-animation">
        <div className="bg-gradient"></div>
        <div className="bg-grid"></div>
      </div>

      <main className="main">
        {!gameStarted ? (
          <>
            {/* Hero Section */}
            <div className="hero">
              <div className="logo">
                <span className="logo-icon">🐍</span>
                <h1 className="title">
                  <span className="title-snake">SNAKE</span>
                  <span className="title-battle">BATTLE</span>
                </h1>
              </div>
              <p className="subtitle">Multiplayer Arena</p>

              {/* Online indicator */}
              <div className="online-badge">
                <span className="pulse"></span>
                <span>{onlinePlayers} {onlinePlayers === 1 ? 'giocatore' : 'giocatori'} online</span>
              </div>
            </div>

            {/* Main Card */}
            <div className="card">
              <form onSubmit={handleStartGame} className="form">
                {/* Snake Preview */}
                <div className="snake-preview">
                  <div className="preview-snake">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="preview-segment"
                        style={{
                          backgroundColor: playerColor,
                          opacity: 1 - i * 0.15,
                          transform: `scale(${1 - i * 0.08})`
                        }}
                      />
                    ))}
                  </div>
                  <span className="preview-name">{playerName || 'Il tuo nome'}</span>
                </div>

                <div className="input-group">
                  <input
                    type="text"
                    id="name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    required
                    placeholder=" "
                    maxLength={15}
                    className="input"
                  />
                  <label htmlFor="name" className="input-label">Nome Giocatore</label>
                  <span className="input-icon">👤</span>
                </div>

                <div className="color-group">
                  <label className="color-label">Colore Snake</label>
                  <div className="color-options">
                    {['#4CAF50', '#2196F3', '#FF5722', '#9C27B0', '#FFEB3B', '#00BCD4', '#E91E63', '#FF9800'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-btn ${playerColor === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setPlayerColor(color)}
                      />
                    ))}
                    <input
                      type="color"
                      value={playerColor}
                      onChange={(e) => setPlayerColor(e.target.value)}
                      className="color-custom"
                      title="Colore personalizzato"
                    />
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className="play-btn">
                  {isLoading ? (
                    <>
                      <span className="spinner"></span>
                      Connessione...
                    </>
                  ) : (
                    <>
                      <span className="play-icon">▶</span>
                      GIOCA ORA
                    </>
                  )}
                </button>

                {error && <p className="error">{error}</p>}
              </form>
            </div>

            {/* Instructions */}
            <div className="instructions">
              <h3>Come Giocare</h3>
              <div className="instruction-grid">
                <div className="instruction-item">
                  <span className="instruction-icon">🎮</span>
                  <span>Frecce o WASD per muoverti</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-icon">🍎</span>
                  <span>Mangia il cibo per crescere</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-icon">💀</span>
                  <span>Evita collisioni (score reset!)</span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-icon">🏆</span>
                  <span>Uccidi altri per +50 punti</span>
                </div>
              </div>

              {/* Food Types */}
              <div className="food-legend">
                <span className="food-item"><span className="food-dot normal"></span> +10</span>
                <span className="food-item"><span className="food-dot bonus"></span> +25</span>
                <span className="food-item"><span className="food-dot super"></span> +50</span>
              </div>
            </div>

            {/* Footer */}
            <footer className="footer">
              <p>Snake Battle v1.0 - Made with ❤️</p>
            </footer>
          </>
        ) : (
          <div className="game-wrapper">
            {/* Game Header */}
            <div className="game-header">
              <div className="game-title">
                <span>🐍</span> SNAKE BATTLE
              </div>
              <div className="game-stats">
                <span className="stat">
                  <span className="stat-icon">👥</span>
                  {gameState.players.length}
                </span>
                <span className="stat">
                  <span className="stat-icon">📶</span>
                  {latency}ms
                </span>
              </div>
            </div>

            {/* Game Canvas */}
            <div className="game-container">
              <canvas
                ref={canvasRef}
                width="800"
                height="600"
                className="game-canvas"
              />
            </div>

            {/* Mobile Controls */}
            {isMobile && (
              <div className="mobile-controls">
                <button className="ctrl-btn up" onClick={() => handleMobileDirection('up')}>
                  <span>▲</span>
                </button>
                <div className="ctrl-row">
                  <button className="ctrl-btn left" onClick={() => handleMobileDirection('left')}>
                    <span>◀</span>
                  </button>
                  <button className="ctrl-btn right" onClick={() => handleMobileDirection('right')}>
                    <span>▶</span>
                  </button>
                </div>
                <button className="ctrl-btn down" onClick={() => handleMobileDirection('down')}>
                  <span>▼</span>
                </button>
              </div>
            )}

            {/* Exit Button */}
            <button className="exit-btn" onClick={() => window.location.reload()}>
              <span>✕</span> Esci dal Gioco
            </button>
          </div>
        )}
      </main>

      <style jsx>{`
        /* ========== BASE & BACKGROUND ========== */
        .container {
          position: relative;
          min-height: 100vh;
          overflow-x: hidden;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          color: white;
        }

        .bg-animation {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          overflow: hidden;
        }

        .bg-gradient {
          position: absolute;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
          animation: gradientShift 15s ease infinite;
        }

        @keyframes gradientShift {
          0%, 100% { filter: hue-rotate(0deg); }
          50% { filter: hue-rotate(30deg); }
        }

        .bg-grid {
          position: absolute;
          width: 100%;
          height: 100%;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: gridMove 20s linear infinite;
        }

        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }

        .main {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          min-height: 100vh;
        }

        /* ========== HERO SECTION ========== */
        .hero {
          text-align: center;
          margin-bottom: 30px;
          animation: fadeInDown 0.8s ease;
        }

        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          margin-bottom: 10px;
        }

        .logo-icon {
          font-size: 4rem;
          animation: bounce 2s ease infinite;
          filter: drop-shadow(0 0 20px rgba(76, 175, 80, 0.5));
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .title {
          display: flex;
          flex-direction: column;
          margin: 0;
          line-height: 1;
        }

        .title-snake {
          font-size: 3.5rem;
          font-weight: 900;
          background: linear-gradient(135deg, #4CAF50, #8BC34A);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 40px rgba(76, 175, 80, 0.3);
        }

        .title-battle {
          font-size: 2rem;
          font-weight: 300;
          letter-spacing: 0.5em;
          color: #fff;
          text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
        }

        .subtitle {
          font-size: 1.1rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 0;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .online-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 15px;
          padding: 8px 16px;
          background: rgba(76, 175, 80, 0.2);
          border: 1px solid rgba(76, 175, 80, 0.4);
          border-radius: 50px;
          font-size: 0.9rem;
        }

        .pulse {
          width: 10px;
          height: 10px;
          background: #4CAF50;
          border-radius: 50%;
          animation: pulse 2s ease infinite;
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
          50% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
        }

        /* ========== CARD ========== */
        .card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 30px;
          width: 100%;
          max-width: 420px;
          animation: fadeInUp 0.8s ease 0.2s both;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Snake Preview */
        .snake-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 16px;
          margin-bottom: 10px;
        }

        .preview-snake {
          display: flex;
          gap: 4px;
          margin-bottom: 10px;
        }

        .preview-segment {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          transition: all 0.3s ease;
        }

        .preview-name {
          font-size: 1rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.8);
        }

        /* Input Group */
        .input-group {
          position: relative;
        }

        .input {
          width: 100%;
          padding: 16px 16px 16px 45px;
          background: rgba(255, 255, 255, 0.1);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
        }

        .input:focus {
          outline: none;
          border-color: #4CAF50;
          background: rgba(255, 255, 255, 0.15);
        }

        .input-label {
          position: absolute;
          left: 45px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.5);
          transition: all 0.3s ease;
          pointer-events: none;
        }

        .input:focus + .input-label,
        .input:not(:placeholder-shown) + .input-label {
          top: 0;
          left: 12px;
          font-size: 0.75rem;
          background: #302b63;
          padding: 0 8px;
          border-radius: 4px;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 1.2rem;
        }

        /* Color Group */
        .color-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .color-label {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .color-options {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .color-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 3px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .color-btn:hover {
          transform: scale(1.1);
        }

        .color-btn.selected {
          border-color: white;
          box-shadow: 0 0 15px currentColor;
        }

        .color-custom {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px dashed rgba(255, 255, 255, 0.3);
          cursor: pointer;
          background: transparent;
          padding: 0;
        }

        .color-custom::-webkit-color-swatch-wrapper {
          padding: 2px;
        }

        .color-custom::-webkit-color-swatch {
          border-radius: 50%;
          border: none;
        }

        /* Play Button */
        .play-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px 32px;
          background: linear-gradient(135deg, #4CAF50, #45a049);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .play-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(76, 175, 80, 0.4);
        }

        .play-btn:disabled {
          background: linear-gradient(135deg, #666, #555);
          cursor: not-allowed;
        }

        .play-icon {
          font-size: 1.2rem;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error {
          background: rgba(231, 76, 60, 0.2);
          border: 1px solid rgba(231, 76, 60, 0.4);
          padding: 10px 15px;
          border-radius: 8px;
          color: #ff6b6b;
          text-align: center;
          margin: 0;
        }

        /* ========== INSTRUCTIONS ========== */
        .instructions {
          margin-top: 30px;
          text-align: center;
          animation: fadeInUp 0.8s ease 0.4s both;
          max-width: 500px;
        }

        .instructions h3 {
          font-size: 1.2rem;
          margin-bottom: 15px;
          color: rgba(255, 255, 255, 0.9);
        }

        .instruction-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .instruction-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 15px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.8);
        }

        .instruction-icon {
          font-size: 1.3rem;
        }

        .food-legend {
          display: flex;
          justify-content: center;
          gap: 20px;
          padding: 15px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }

        .food-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
        }

        .food-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
        }

        .food-dot.normal { background: #FF6347; }
        .food-dot.bonus { background: #FFD700; box-shadow: 0 0 8px #FFD700; }
        .food-dot.super { background: #9932CC; box-shadow: 0 0 8px #9932CC; }

        /* ========== FOOTER ========== */
        .footer {
          margin-top: auto;
          padding: 20px;
          text-align: center;
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.85rem;
          animation: fadeInUp 0.8s ease 0.6s both;
        }

        .footer p {
          margin: 0;
        }

        /* ========== GAME WRAPPER ========== */
        .game-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 850px;
          animation: fadeIn 0.5s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .game-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 15px 20px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 12px 12px 0 0;
          backdrop-filter: blur(10px);
        }

        .game-title {
          font-size: 1.3rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .game-stats {
          display: flex;
          gap: 15px;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          font-size: 0.9rem;
        }

        .stat-icon {
          font-size: 1rem;
        }

        .game-container {
          background: #000;
          border-radius: 0 0 12px 12px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .game-canvas {
          display: block;
          max-width: 100%;
          height: auto;
        }

        /* ========== MOBILE CONTROLS ========== */
        .mobile-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 20px;
          gap: 5px;
        }

        .ctrl-row {
          display: flex;
          gap: 60px;
        }

        .ctrl-btn {
          width: 65px;
          height: 65px;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05));
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 1.5rem;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(5px);
        }

        .ctrl-btn:active {
          transform: scale(0.95);
          background: linear-gradient(135deg, rgba(76, 175, 80, 0.4), rgba(76, 175, 80, 0.2));
          border-color: #4CAF50;
        }

        /* ========== EXIT BUTTON ========== */
        .exit-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 20px;
          padding: 12px 24px;
          background: rgba(231, 76, 60, 0.2);
          border: 1px solid rgba(231, 76, 60, 0.4);
          border-radius: 10px;
          color: #ff6b6b;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .exit-btn:hover {
          background: rgba(231, 76, 60, 0.3);
          transform: translateY(-2px);
        }

        /* ========== RESPONSIVE ========== */
        @media (max-width: 768px) {
          .logo-icon { font-size: 3rem; }
          .title-snake { font-size: 2.5rem; }
          .title-battle { font-size: 1.5rem; letter-spacing: 0.3em; }
          .subtitle { font-size: 0.9rem; }
          .card { padding: 20px; margin: 0 10px; }
          .instruction-grid { grid-template-columns: 1fr; }
          .food-legend { flex-direction: column; gap: 10px; }
          .game-header { flex-direction: column; gap: 10px; }
          .ctrl-btn { width: 55px; height: 55px; font-size: 1.3rem; }
          .ctrl-row { gap: 40px; }
        }

        @media (max-width: 480px) {
          .main { padding: 10px; }
          .logo-icon { font-size: 2.5rem; }
          .title-snake { font-size: 2rem; }
          .title-battle { font-size: 1.2rem; }
          .preview-segment { width: 18px; height: 18px; }
        }
      `}</style>
    </div>
  );
}
