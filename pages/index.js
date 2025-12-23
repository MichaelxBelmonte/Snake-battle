import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { io } from 'socket.io-client';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

// Snake skin definitions
const SNAKE_SKINS = [
  { id: 'classic', name: 'Classic', icon: '🟩', description: 'Stile classico' },
  { id: 'rainbow', name: 'Rainbow', icon: '🌈', description: 'Colori arcobaleno' },
  { id: 'neon', name: 'Neon', icon: '✨', description: 'Effetto luminoso' },
  { id: 'fire', name: 'Fire', icon: '🔥', description: 'Sfumatura fuoco' },
  { id: 'ice', name: 'Ice', icon: '❄️', description: 'Sfumatura ghiaccio' },
  { id: 'ghost', name: 'Ghost', icon: '👻', description: 'Semi-trasparente' },
  { id: 'electric', name: 'Electric', icon: '⚡', description: 'Effetto elettrico' },
  { id: 'ocean', name: 'Ocean', icon: '🌊', description: 'Sfumatura oceano' },
  { id: 'candy', name: 'Candy', icon: '🍬', description: 'Strisce colorate' },
  { id: 'diamond', name: 'Diamond', icon: '💎', description: 'Effetto cristallo' },
];

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

// Rainbow colors for rainbow skin
const RAINBOW_COLORS = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];

// Get segment color based on skin type
const getSegmentStyle = (skin, baseColor, index, totalLength, timestamp) => {
  const t = timestamp || Date.now();

  switch (skin) {
    case 'rainbow':
      const rainbowIndex = (index + Math.floor(t / 100)) % RAINBOW_COLORS.length;
      return { color: RAINBOW_COLORS[rainbowIndex], glow: false, alpha: 1 };

    case 'neon':
      return { color: baseColor, glow: true, glowColor: baseColor, glowBlur: 15, alpha: 1 };

    case 'fire':
      const fireColors = ['#ff4500', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00'];
      const fireIndex = Math.min(index, fireColors.length - 1);
      return { color: fireColors[fireIndex], glow: true, glowColor: '#ff4500', glowBlur: 10, alpha: 1 };

    case 'ice':
      const iceColors = ['#00ffff', '#40e0d0', '#7fffd4', '#afeeee', '#e0ffff'];
      const iceIndex = Math.min(index, iceColors.length - 1);
      return { color: iceColors[iceIndex], glow: true, glowColor: '#00ffff', glowBlur: 8, alpha: 1 };

    case 'ghost':
      return { color: baseColor, glow: false, alpha: 0.5 - (index * 0.03) };

    case 'electric':
      const flicker = Math.sin(t / 50 + index) > 0 ? 1 : 0.7;
      return { color: '#00ffff', glow: true, glowColor: '#00ffff', glowBlur: 12 * flicker, alpha: flicker };

    case 'ocean':
      const oceanColors = ['#0077be', '#0099cc', '#00b4d8', '#48cae4', '#90e0ef'];
      const oceanIndex = Math.min(index, oceanColors.length - 1);
      return { color: oceanColors[oceanIndex], glow: false, alpha: 1 };

    case 'candy':
      const candyIndex = index % 2;
      return { color: candyIndex === 0 ? baseColor : '#ffffff', glow: false, alpha: 1 };

    case 'diamond':
      const shimmer = 0.7 + Math.sin(t / 200 + index * 0.5) * 0.3;
      return { color: baseColor, glow: true, glowColor: '#ffffff', glowBlur: 8, alpha: shimmer };

    case 'classic':
    default:
      return { color: darkenColor(baseColor, index * 5), glow: false, alpha: 1 };
  }
};

// Draw a snake segment with skin effects
const drawSnakeSegment = (ctx, x, y, size, style, isHead) => {
  ctx.save();

  // Apply glow effect
  if (style.glow) {
    ctx.shadowColor = style.glowColor || style.color;
    ctx.shadowBlur = style.glowBlur || 10;
  }

  // Apply alpha
  ctx.globalAlpha = style.alpha || 1;

  // Draw segment
  ctx.fillStyle = style.color;

  if (isHead) {
    // Rounded head
    ctx.beginPath();
    ctx.roundRect(x, y, size - 1, size - 1, 4);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, size - 1, size - 1);
  }

  ctx.restore();
};

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#22c55e');
  const [playerSkin, setPlayerSkin] = useState('classic');
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
  const playerIdRef = useRef(null);
  const playerDataRef = useRef({ name: '', color: '#22c55e', skin: 'classic' });
  const gridSize = 20;

  // Interpolation refs for smooth rendering
  const prevStateRef = useRef({ players: [], food: [] });
  const targetStateRef = useRef({ players: [], food: [] });
  const lastUpdateTimeRef = useRef(Date.now());
  const interpolationFactorRef = useRef(0);

  const [isMobile, setIsMobile] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [personalBest, setPersonalBest] = useState(0);
  const lastScoreRef = useRef(0);

  // Fetch leaderboard from Supabase
  const fetchLeaderboard = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(10);

      if (error) throw error;
      setLeaderboard(data || []);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    }
  }, []);

  // Save score to Supabase
  const saveScore = useCallback(async (name, score, color, skin) => {
    console.log('saveScore called:', { name, score, color, skin, supabaseEnabled: !!supabase });
    if (!supabase) {
      console.warn('Supabase not configured');
      return;
    }
    if (score <= 0) {
      console.log('Score too low, not saving');
      return;
    }
    try {
      console.log('Inserting score to Supabase...');
      const { data, error } = await supabase
        .from('leaderboard')
        .insert([{
          player_name: name,
          score: score,
          snake_color: color,
          snake_skin: skin
        }])
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      console.log('Score saved successfully:', data);

      // Update personal best
      if (score > personalBest) {
        setPersonalBest(score);
      }

      // Refresh leaderboard
      fetchLeaderboard();
    } catch (err) {
      console.error('Error saving score:', err);
    }
  }, [personalBest, fetchLeaderboard]);

  // Fetch leaderboard on mount
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

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
    const SERVER_TICK = 100; // Must match server tick rate (10 FPS)

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

        // Draw snake segments with interpolation and skin effects
        const playerSkinType = player.skin || 'classic';
        const timestamp = Date.now();

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

          // Get skin style for this segment
          const segmentStyle = getSegmentStyle(playerSkinType, pColor, index, playerSnake.length, timestamp);

          if (index === 0) {
            // Head with border (thicker for own snake)
            ctx.fillStyle = '#FFFFFF';
            const border = isMe ? 2 : 1;
            ctx.fillRect(drawX - border, drawY - border, gridSize + border * 2, gridSize + border * 2);
          }

          // Draw segment with skin effect
          drawSnakeSegment(ctx, drawX, drawY, gridSize, segmentStyle, index === 0);

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

      // Show latency with quality color
      const pingColor = latency < 50 ? '#00FF00' : latency < 100 ? '#FFFF00' : latency < 150 ? '#FFA500' : '#FF0000';
      ctx.font = '12px Arial';
      ctx.fillStyle = pingColor;
      ctx.fillText(`Ping: ${latency}ms`, 780, 45);

      // Connection status indicator
      ctx.fillStyle = connectionStatus === 'connected' ? pingColor : '#FF0000';
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

  // Latency measurement with moving average
  const pingHistoryRef = useRef([]);

  useEffect(() => {
    if (!socketRef.current || connectionStatus !== 'connected') return;

    const measureLatency = () => {
      const start = Date.now();
      socketRef.current.emit('ping', start);
    };

    // Measure more frequently for smoother average
    const interval = setInterval(measureLatency, 1000);
    measureLatency(); // Immediate first measurement

    return () => clearInterval(interval);
  }, [connectionStatus]);

  // Start game - connect to Socket.IO server
  const handleStartGame = async (e) => {
    e.preventDefault();

    if (!playerName) {
      setError('Inserisci il tuo nome');
      return;
    }

    // Check if name is already taken in leaderboard
    const nameTaken = leaderboard.some(
      entry => entry.player_name.toLowerCase() === playerName.toLowerCase()
    );

    if (nameTaken) {
      setError('Nome già in uso! Scegli un altro nome.');
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

        // Store player data in refs for use in event handlers
        playerIdRef.current = socket.id;
        playerDataRef.current = { name: playerName, color: playerColor, skin: playerSkin };

        // Join the game
        socket.emit('join', {
          name: playerName,
          color: playerColor,
          skin: playerSkin
        });
      });

      socket.on('joined', (data) => {
        console.log('Joined game:', data);
        setPlayerId(data.id);
        playerIdRef.current = data.id;
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

        // Update direction ref from server state - use ref instead of state to avoid stale closure
        const myPlayer = state.players.find(p => p.id === playerIdRef.current);
        if (myPlayer) {
          directionRef.current = myPlayer.direction;

          // Detect death: score reset to 0 when previous score was > 0
          if (myPlayer.score === 0 && lastScoreRef.current > 0) {
            // Player died - save their score to leaderboard
            const pd = playerDataRef.current;
            console.log('Player died! Saving score:', lastScoreRef.current);
            saveScore(pd.name, lastScoreRef.current, pd.color, pd.skin);
          }
          lastScoreRef.current = myPlayer.score;
        }
      });

      socket.on('pong', (startTime) => {
        const lat = Date.now() - startTime;
        // Use moving average for stable ping display
        pingHistoryRef.current.push(lat);
        if (pingHistoryRef.current.length > 5) {
          pingHistoryRef.current.shift();
        }
        const sorted = [...pingHistoryRef.current].sort((a, b) => a - b);
        const trimmed = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
        const avg = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
        setLatency(avg);
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
          <div className="landing-container">
            {/* Hero Section - Compact */}
            <header className="hero">
              <div className="hero-content">
                <span className="logo-icon">🐍</span>
                <div className="hero-text">
                  <h1 className="title">SNAKE BATTLE</h1>
                  <p className="subtitle">Multiplayer Arena</p>
                </div>
              </div>
              <div className="online-badge">
                <span className="pulse"></span>
                <span>{onlinePlayers} online</span>
              </div>
            </header>

            {/* Main Content - Two Column Layout */}
            <div className="content-grid">
              {/* Left Column - Player Setup */}
              <div className="panel panel-setup">
                <div className="panel-header">
                  <h2>Crea il tuo Snake</h2>
                </div>

                <form onSubmit={handleStartGame} className="setup-form">
                  {/* Live Preview */}
                  <div className="preview-card">
                    <div className="preview-snake-row">
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                        const style = getSegmentStyle(playerSkin, playerColor, i, 7, Date.now());
                        return (
                          <div
                            key={i}
                            className="preview-segment"
                            style={{
                              backgroundColor: style.color,
                              opacity: style.alpha,
                              boxShadow: style.glow ? `0 0 ${style.glowBlur}px ${style.glowColor}` : 'none'
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="preview-info">
                      <span className="preview-name">{playerName || 'Player'}</span>
                      <span className="preview-skin-badge">
                        {SNAKE_SKINS.find(s => s.id === playerSkin)?.icon} {SNAKE_SKINS.find(s => s.id === playerSkin)?.name}
                      </span>
                    </div>
                  </div>

                  {/* Name Input */}
                  <div className="form-group">
                    <label className="form-label">Nome</label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      required
                      placeholder="Inserisci il tuo nome"
                      maxLength={15}
                      className="form-input"
                    />
                  </div>

                  {/* Color Selection */}
                  <div className="form-group">
                    <label className="form-label">Colore</label>
                    <div className="color-grid">
                      {['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#eab308', '#06b6d4', '#ec4899', '#ef4444'].map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-btn ${playerColor === color ? 'active' : ''}`}
                          style={{ '--btn-color': color }}
                          onClick={() => setPlayerColor(color)}
                        />
                      ))}
                      <label className="color-custom">
                        <input
                          type="color"
                          value={playerColor}
                          onChange={(e) => setPlayerColor(e.target.value)}
                        />
                        <span>+</span>
                      </label>
                    </div>
                  </div>

                  {/* Skin Selection */}
                  <div className="form-group">
                    <label className="form-label">Skin</label>
                    <div className="skin-grid">
                      {SNAKE_SKINS.map((skin) => (
                        <button
                          key={skin.id}
                          type="button"
                          className={`skin-btn ${playerSkin === skin.id ? 'active' : ''}`}
                          onClick={() => setPlayerSkin(skin.id)}
                          title={skin.description}
                        >
                          <span className="skin-icon">{skin.icon}</span>
                          <span className="skin-name">{skin.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Play Button */}
                  <button type="submit" disabled={isLoading} className="play-btn">
                    {isLoading ? (
                      <><span className="spinner"></span> Connessione...</>
                    ) : (
                      <><span className="play-icon">▶</span> GIOCA ORA</>
                    )}
                  </button>

                  {error && <p className="error-msg">{error}</p>}
                </form>
              </div>

              {/* Right Column - Leaderboard & Rules */}
              <div className="panel-stack">
                {/* Leaderboard */}
                <div className="panel panel-leaderboard">
                  <div className="panel-header">
                    <h2>🏆 Hall of Fame</h2>
                  </div>
                  <div className="leaderboard">
                    {leaderboard.length > 0 ? (
                      <>
                        {leaderboard.slice(0, 5).map((entry, index) => (
                          <div key={entry.id} className={`lb-row ${index < 3 ? `rank-${index + 1}` : ''}`}>
                            <span className="lb-rank">
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                            </span>
                            <span className="lb-name" style={{ color: entry.snake_color || '#22c55e' }}>
                              {entry.player_name}
                            </span>
                            <span className="lb-skin">{SNAKE_SKINS.find(s => s.id === entry.snake_skin)?.icon || '🟩'}</span>
                            <span className="lb-score">{entry.score}</span>
                          </div>
                        ))}
                        {personalBest > 0 && (
                          <div className="personal-best">
                            Il tuo record: <strong>{personalBest}</strong>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="lb-empty">
                        <span>🎮</span>
                        <p>Nessun record ancora!</p>
                        <p>Sii il primo!</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* How to Play */}
                <div className="panel panel-rules">
                  <div className="panel-header">
                    <h2>Come Giocare</h2>
                  </div>
                  <div className="rules-grid">
                    <div className="rule">
                      <span className="rule-icon">🎮</span>
                      <span>Frecce o WASD</span>
                    </div>
                    <div className="rule">
                      <span className="rule-icon">🍎</span>
                      <span>Mangia e cresci</span>
                    </div>
                    <div className="rule">
                      <span className="rule-icon">💀</span>
                      <span>Evita collisioni</span>
                    </div>
                    <div className="rule">
                      <span className="rule-icon">⚔️</span>
                      <span>Elimina nemici</span>
                    </div>
                  </div>
                  <div className="food-types">
                    <div className="food-type">
                      <span className="food-dot red"></span>
                      <span>+10</span>
                    </div>
                    <div className="food-type">
                      <span className="food-dot gold"></span>
                      <span>+25</span>
                    </div>
                    <div className="food-type">
                      <span className="food-dot purple"></span>
                      <span>+50</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="footer">
              Snake Battle v1.0 — Made with ❤️
            </footer>
          </div>
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
                <span className="stat" style={{ color: latency < 50 ? '#4CAF50' : latency < 100 ? '#FFEB3B' : latency < 150 ? '#FF9800' : '#f44336' }}>
                  <span className="stat-icon">{latency < 50 ? '🟢' : latency < 100 ? '🟡' : latency < 150 ? '🟠' : '🔴'}</span>
                  {latency}ms
                </span>
              </div>
            </div>

            {/* Game Area with Sidebar */}
            <div className="game-area">
              {/* Game Canvas */}
              <div className="game-container">
                <canvas
                  ref={canvasRef}
                  width="800"
                  height="600"
                  className="game-canvas"
                />
              </div>

              {/* Legend Sidebar */}
              {!isMobile && (
                <div className="game-sidebar">
                  <div className="sidebar-section">
                    <h3>🎮 Controlli</h3>
                    <div className="sidebar-item">
                      <span className="key-badge">↑↓←→</span>
                      <span>o</span>
                      <span className="key-badge">WASD</span>
                    </div>
                  </div>

                  <div className="sidebar-section">
                    <h3>🍎 Cibo & Punti</h3>
                    <div className="sidebar-item">
                      <span className="food-indicator red"></span>
                      <span>Normale: +10 pts</span>
                    </div>
                    <div className="sidebar-item">
                      <span className="food-indicator gold"></span>
                      <span>Bonus: +25 pts</span>
                    </div>
                    <div className="sidebar-item">
                      <span className="food-indicator purple"></span>
                      <span>Super: +50 pts</span>
                    </div>
                  </div>

                  <div className="sidebar-section">
                    <h3>📏 Crescita</h3>
                    <p className="sidebar-text">
                      Il serpente cresce di <strong>+1 segmento</strong> ogni <strong>50 punti</strong>
                    </p>
                  </div>

                  <div className="sidebar-section">
                    <h3>⚔️ Regole</h3>
                    <div className="sidebar-item">
                      <span>💀</span>
                      <span>Evita te stesso</span>
                    </div>
                    <div className="sidebar-item">
                      <span>🎯</span>
                      <span>Colpisci i nemici</span>
                    </div>
                    <div className="sidebar-item">
                      <span>🏆</span>
                      <span>Kill = +50 pts</span>
                    </div>
                  </div>
                </div>
              )}
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
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .main {
          position: relative;
          z-index: 1;
          min-height: 100vh;
        }

        /* ========== LANDING CONTAINER ========== */
        .landing-container {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          padding: 20px;
          max-width: 1000px;
          margin: 0 auto;
        }

        /* ========== HERO ========== */
        .hero {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 0;
          margin-bottom: 25px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .hero-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          font-size: 2.5rem;
          filter: drop-shadow(0 0 15px rgba(76, 175, 80, 0.5));
        }

        .hero-text {
          display: flex;
          flex-direction: column;
        }

        .title {
          font-size: 1.8rem;
          font-weight: 800;
          margin: 0;
          background: linear-gradient(135deg, #4CAF50, #8BC34A);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: 0.05em;
        }

        .subtitle {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin: 0;
        }

        .online-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(76, 175, 80, 0.15);
          border: 1px solid rgba(76, 175, 80, 0.3);
          border-radius: 50px;
          font-size: 0.85rem;
          color: #4CAF50;
        }

        .pulse {
          width: 8px;
          height: 8px;
          background: #4CAF50;
          border-radius: 50%;
          animation: pulse 2s ease infinite;
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
          50% { box-shadow: 0 0 0 8px rgba(76, 175, 80, 0); }
        }

        /* ========== CONTENT GRID ========== */
        .content-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25px;
          flex: 1;
        }

        /* ========== PANELS ========== */
        .panel {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          overflow: hidden;
        }

        .panel-header {
          padding: 16px 20px;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .panel-header h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .panel-setup {
          display: flex;
          flex-direction: column;
        }

        .panel-stack {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ========== SETUP FORM ========== */
        .setup-form {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex: 1;
        }

        /* Preview Card */
        .preview-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(0,0,0,0.3), rgba(0,0,0,0.2));
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.05);
        }

        .preview-snake-row {
          display: flex;
          gap: 4px;
        }

        .preview-segment {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .preview-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .preview-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: white;
        }

        .preview-skin-badge {
          font-size: 0.8rem;
          color: rgba(255,255,255,0.5);
          display: flex;
          align-items: center;
          gap: 5px;
        }

        /* Form Groups */
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: rgba(255,255,255,0.6);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .form-input {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: white;
          font-size: 1rem;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }

        .form-input:focus {
          outline: none;
          border-color: #4CAF50;
          background: rgba(255, 255, 255, 0.12);
        }

        .form-input::placeholder {
          color: rgba(255,255,255,0.3);
        }

        /* Color Grid */
        .color-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .color-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          padding: 0;
          background: var(--btn-color);
        }

        .color-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .color-btn.active {
          border-color: white;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.3), 0 4px 12px rgba(0,0,0,0.3);
          transform: scale(1.05);
        }

        .color-custom {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 2px dashed rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.05);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: all 0.2s ease;
        }

        .color-custom:hover {
          border-color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.1);
        }

        .color-custom input {
          position: absolute;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }

        .color-custom span {
          font-size: 1.2rem;
          color: rgba(255,255,255,0.5);
        }

        /* Skin Grid */
        .skin-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .skin-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 10px 4px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .skin-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-2px);
        }

        .skin-btn.active {
          background: rgba(76, 175, 80, 0.2);
          border-color: #4CAF50;
        }

        .skin-btn .skin-icon {
          font-size: 1.3rem;
        }

        .skin-btn .skin-name {
          font-size: 0.6rem;
          color: rgba(255,255,255,0.6);
          text-align: center;
        }

        .skin-btn.active .skin-name {
          color: #4CAF50;
        }

        /* Play Button */
        .play-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px;
          background: linear-gradient(135deg, #4CAF50, #43A047);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: auto;
        }

        .play-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(76, 175, 80, 0.4);
        }

        .play-btn:disabled {
          background: linear-gradient(135deg, #555, #444);
          cursor: not-allowed;
        }

        .play-icon {
          font-size: 1rem;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-msg {
          background: rgba(231, 76, 60, 0.15);
          border: 1px solid rgba(231, 76, 60, 0.3);
          padding: 10px 14px;
          border-radius: 8px;
          color: #ff6b6b;
          text-align: center;
          font-size: 0.9rem;
          margin: 0;
        }

        /* ========== LEADERBOARD ========== */
        .panel-leaderboard {
          flex: 1;
        }

        .leaderboard {
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .lb-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          transition: all 0.2s ease;
        }

        .lb-row:hover {
          background: rgba(0, 0, 0, 0.3);
        }

        .lb-row.rank-1 {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.08));
          border: 1px solid rgba(255, 215, 0, 0.2);
        }

        .lb-row.rank-2 {
          background: linear-gradient(135deg, rgba(192, 192, 192, 0.15), rgba(192, 192, 192, 0.08));
          border: 1px solid rgba(192, 192, 192, 0.2);
        }

        .lb-row.rank-3 {
          background: linear-gradient(135deg, rgba(205, 127, 50, 0.15), rgba(205, 127, 50, 0.08));
          border: 1px solid rgba(205, 127, 50, 0.2);
        }

        .lb-rank {
          font-size: 1.1rem;
          min-width: 28px;
          text-align: center;
        }

        .lb-name {
          flex: 1;
          font-weight: 600;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .lb-skin {
          font-size: 1rem;
        }

        .lb-score {
          font-weight: 700;
          font-size: 0.95rem;
          color: #4CAF50;
          min-width: 45px;
          text-align: right;
        }

        .lb-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px;
          color: rgba(255,255,255,0.4);
          text-align: center;
        }

        .lb-empty span {
          font-size: 2.5rem;
          margin-bottom: 10px;
        }

        .lb-empty p {
          margin: 2px 0;
          font-size: 0.9rem;
        }

        .personal-best {
          margin-top: 10px;
          padding: 10px;
          text-align: center;
          background: rgba(76, 175, 80, 0.1);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.85rem;
        }

        .personal-best strong {
          color: #4CAF50;
          font-weight: 700;
        }

        /* ========== RULES ========== */
        .panel-rules {
          flex-shrink: 0;
        }

        .rules-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          padding: 15px;
          padding-bottom: 10px;
        }

        .rule {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.15);
          border-radius: 8px;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.8);
        }

        .rule-icon {
          font-size: 1.1rem;
        }

        .food-types {
          display: flex;
          justify-content: center;
          gap: 20px;
          padding: 12px 15px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .food-type {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.7);
        }

        .food-dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
        }

        .food-dot.red { background: #FF6347; }
        .food-dot.gold { background: #FFD700; box-shadow: 0 0 6px #FFD700; }
        .food-dot.purple { background: #9932CC; box-shadow: 0 0 6px #9932CC; }

        /* ========== FOOTER ========== */
        .footer {
          padding: 20px;
          text-align: center;
          color: rgba(255, 255, 255, 0.3);
          font-size: 0.8rem;
        }

        /* ========== GAME WRAPPER ========== */
        .game-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px;
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
          max-width: 800px;
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

        .game-area {
          display: flex;
          gap: 20px;
          align-items: flex-start;
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

        /* ========== GAME SIDEBAR ========== */
        .game-sidebar {
          width: 200px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 12px;
          padding: 15px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .sidebar-section {
          margin-bottom: 18px;
        }

        .sidebar-section:last-child {
          margin-bottom: 0;
        }

        .sidebar-section h3 {
          font-size: 0.85rem;
          font-weight: 600;
          margin: 0 0 10px 0;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
        }

        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 6px;
        }

        .sidebar-item:last-child {
          margin-bottom: 0;
        }

        .sidebar-text {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.7);
          margin: 0;
          line-height: 1.4;
        }

        .sidebar-text strong {
          color: #4CAF50;
        }

        .key-badge {
          background: rgba(255, 255, 255, 0.15);
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-family: monospace;
        }

        .food-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .food-indicator.red { background: #FF6347; }
        .food-indicator.gold { background: #FFD700; box-shadow: 0 0 6px #FFD700; }
        .food-indicator.purple { background: #9932CC; box-shadow: 0 0 6px #9932CC; }

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
          .landing-container {
            padding: 15px;
          }

          .hero {
            flex-direction: column;
            gap: 15px;
            text-align: center;
          }

          .hero-content {
            justify-content: center;
          }

          .content-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .panel-stack {
            order: 2;
          }

          .panel-setup {
            order: 1;
          }

          .skin-grid {
            grid-template-columns: repeat(5, 1fr);
          }

          .rules-grid {
            grid-template-columns: 1fr;
          }

          .game-header {
            flex-direction: column;
            gap: 10px;
          }

          .ctrl-btn {
            width: 55px;
            height: 55px;
            font-size: 1.3rem;
          }

          .ctrl-row {
            gap: 40px;
          }
        }

        @media (max-width: 480px) {
          .logo-icon {
            font-size: 2rem;
          }

          .title {
            font-size: 1.4rem;
          }

          .preview-segment {
            width: 22px;
            height: 22px;
          }

          .skin-grid {
            grid-template-columns: repeat(5, 1fr);
            gap: 6px;
          }

          .skin-btn {
            padding: 8px 2px;
          }

          .skin-btn .skin-icon {
            font-size: 1.1rem;
          }

          .skin-btn .skin-name {
            font-size: 0.55rem;
          }

          .color-btn {
            width: 32px;
            height: 32px;
          }

          .color-custom {
            width: 32px;
            height: 32px;
          }
        }
      `}</style>
    </div>
  );
}
