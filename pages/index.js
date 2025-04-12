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

// Rileva se è un dispositivo mobile
const isMobileDevice = () => {
  return (typeof window !== "undefined" && 
    (navigator.userAgent.match(/Android/i) ||
     navigator.userAgent.match(/webOS/i) ||
     navigator.userAgent.match(/iPhone/i) ||
     navigator.userAgent.match(/iPad/i) ||
     navigator.userAgent.match(/iPod/i) ||
     navigator.userAgent.match(/BlackBerry/i) ||
     navigator.userAgent.match(/Windows Phone/i)));
};

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#ff0000');
  const [gameStarted, setGameStarted] = useState(false);
  const [error, setError] = useState('');
  
  // Stato locale del gioco
  const [playerState, setPlayerState] = useState(null);
  const [foodItems, setFoodItems] = useState([{ x: 0, y: 0 }]); 
  const [otherPlayers, setOtherPlayers] = useState([]);
  const [players, setPlayers] = useState({});
  const [interpolatedPlayers, setInterpolatedPlayers] = useState({});
  const [playerId, setPlayerId] = useState(null);
  const [score, setScore] = useState(0);
  const [foodAnimation, setFoodAnimation] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [scale, setScale] = useState(1); // Fattore di scala per il canvas
  
  const canvasRef = useRef(null);
  const joystickRef = useRef(null);
  const pusherRef = useRef(null);
  const renderLoopRef = useRef(null);
  const apiLoopRef = useRef(null);
  const directionRef = useRef('right');
  const lastDirectionRef = useRef('right');
  const gridSizeRef = useRef(20); // Dimensione della griglia costante
  
  // Canvas buffer per rendering offscreen
  const bufferCanvasRef = useRef(null);
  const staticElementsRef = useRef(null);
  const foodCanvasRef = useRef(null);
  const otherPlayersCanvasRef = useRef(null);

  // Aggiungo stato per tracciare la connessione e debug
  const [connectionStatus, setConnectionStatus] = useState('disconnesso');
  const [lastMessageTime, setLastMessageTime] = useState(null);
  const [debugMode, setDebugMode] = useState(process.env.NODE_ENV !== 'production');
  
  const lastInterpolationTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const fpsLastUpdateRef = useRef(0);
  const fpsRef = useRef(0);
  const snakeRef = useRef(null);
  const foodRef = useRef(null);
  const staticRenderCounterRef = useRef(0);
  const pingRef = useRef(0);
  const lastSocketMessageTimeRef = useRef(0);
  const animationIdRef = useRef(null);
  
  // Rileva dispositivo mobile al caricamento
  useEffect(() => {
    setIsMobile(isMobileDevice());
    
    // Inizializza i buffer canvas per il rendering ottimizzato
    bufferCanvasRef.current = document.createElement('canvas');
    bufferCanvasRef.current.width = 800;
    bufferCanvasRef.current.height = 600;
    
    staticElementsRef.current = document.createElement('canvas');
    staticElementsRef.current.width = 800;
    staticElementsRef.current.height = 600;
    
    foodCanvasRef.current = document.createElement('canvas');
    foodCanvasRef.current.width = 800;
    foodCanvasRef.current.height = 600;
    
    otherPlayersCanvasRef.current = document.createElement('canvas');
    otherPlayersCanvasRef.current.width = 800;
    otherPlayersCanvasRef.current.height = 600;
    
    // Pre-rendering degli elementi statici
    preRenderStaticElements();
  }, []);
  
  // Funzione per pre-renderizzare gli elementi statici in un canvas separato
  const preRenderStaticElements = () => {
    if (!canvasRef.current) return;
    
    // Crea un canvas offscreen per gli elementi statici se non esiste
    if (!staticElementsRef.current) {
      staticElementsRef.current = document.createElement('canvas');
      staticElementsRef.current.width = canvasRef.current.width;
      staticElementsRef.current.height = canvasRef.current.height;
    }
    
    // Ottieni il contesto 2D del canvas offscreen
    const staticCtx = staticElementsRef.current.getContext('2d');
    
    // Renderizza lo sfondo
    staticCtx.fillStyle = '#1a1a1a';
    staticCtx.fillRect(0, 0, staticElementsRef.current.width, staticElementsRef.current.height);
    
    // Renderizza la griglia
    staticCtx.strokeStyle = '#2a2a2a';
    staticCtx.lineWidth = 1;
    
    // Disegna linee orizzontali
    for (let y = 0; y < staticElementsRef.current.height; y += gridSizeRef.current) {
      staticCtx.beginPath();
      staticCtx.moveTo(0, y);
      staticCtx.lineTo(staticElementsRef.current.width, y);
      staticCtx.stroke();
    }
    
    // Disegna linee verticali
    for (let x = 0; x < staticElementsRef.current.width; x += gridSizeRef.current) {
      staticCtx.beginPath();
      staticCtx.moveTo(x, 0);
      staticCtx.lineTo(x, staticElementsRef.current.height);
      staticCtx.stroke();
    }
    
    console.log('Elementi statici pre-renderizzati');
  };
  
  // Loop di gioco con setInterval (più stabile)
  useEffect(() => {
    if (!gameStarted || !playerId || !playerState) return;

    console.log('Avvio loop di gioco con setInterval');
    
    // Piccolo ritardo prima di avviare i loop per garantire che lo stato sia aggiornato
    const startGameLoops = () => {
      // Pre-rendering degli elementi statici
      preRenderStaticElements();
      
      // Loop di rendering con requestAnimationFrame per migliori performance
      let lastRenderTime = 0;
      let frameId;
      let frameCount = 0;
      let lastFoodRenderTime = 0;
      let lastOtherPlayersRenderTime = 0;
      let lastInterpolationTime = 0;
      
      // Framerate ottimizzato per il dispositivo
      const fpsLimit = isMobile ? 40 : 60;
      const frameInterval = 1000 / fpsLimit;
      
      // Frequenza di aggiornamento ridotta per elementi non critici
      const foodUpdateInterval = 500; // Aggiorna il cibo ogni 500ms
      const otherPlayersUpdateInterval = isMobile ? 200 : 100; // Aggiorna altri giocatori con frequenza diversa
      const interpolationInterval = 1000 / 30; // Interpolazione a 30fps
      
      // Sistema di interpolazione per movimenti più fluidi
      const interpolatePositions = (timestamp) => {
        // Salta se non ci sono giocatori da interpolare
        if (Object.keys(players).length === 0) return;
        
        // Calcola il delta time dal precedente aggiornamento
        const deltaTime = lastInterpolationTimeRef.current ? (timestamp - lastInterpolationTimeRef.current) / 1000 : 0;
        lastInterpolationTimeRef.current = timestamp;
        
        // Clona lo stato attuale
        const newInterpolated = {...interpolatedPlayers};
        
        // Aggiorna le posizioni interpolate per ogni giocatore remoto
        Object.keys(players).forEach(pid => {
          // Salta il giocatore locale
          if (pid === playerId) return;
          
          const player = players[pid];
          
          // Salta se il giocatore non ha un serpente o direzione
          if (!player || !player.snake || !player.direction) return;
          
          // Inizializza se non esiste già
          if (!newInterpolated[pid]) {
            newInterpolated[pid] = {...player};
          } else {
            // Calcola la nuova posizione della testa in base alla direzione e velocità
            const head = [...player.snake[0]];
            const speed = player.speed || 5; // Pixels per second
            const distanceToMove = speed * deltaTime;
            
            // Calcola la nuova posizione in base alla direzione
            switch (player.direction) {
              case 'up':
                head[1] -= distanceToMove;
                break;
              case 'down':
                head[1] += distanceToMove;
                break;
              case 'left':
                head[0] -= distanceToMove;
                break;
              case 'right':
                head[0] += distanceToMove;
                break;
            }
            
            // Aggiorna la posizione interpolata
            const newSnake = [head, ...player.snake.slice(0, -1)];
            newInterpolated[pid] = {
              ...player,
              snake: newSnake
            };
          }
        });
        
        // Aggiorna lo stato con le nuove posizioni
        setInterpolatedPlayers(newInterpolated);
      };
      
      const renderLoop = (timestamp) => {
        if (!canvasRef.current) return;
        
        // Calcola FPS e il tempo tra i frame
        const deltaTime = lastFrameTimeRef.current ? timestamp - lastFrameTimeRef.current : 0;
        frameCountRef.current++;
        
        // Aggiorna FPS ogni secondo
        if (timestamp - fpsLastUpdateRef.current >= 1000) {
          fpsRef.current = Math.round((frameCountRef.current * 1000) / (timestamp - fpsLastUpdateRef.current));
          frameCountRef.current = 0;
          fpsLastUpdateRef.current = timestamp;
        }
        
        // Interpolazione posizioni dei giocatori remoti
        interpolatePositions(timestamp);
        
        // Usa il contesto del buffer canvas per il rendering offscreen
        const bufferCtx = bufferCanvasRef.current.getContext('2d');
        const mainCtx = canvasRef.current.getContext('2d');
        
        // Contatore per elementi statici che devono essere renderizzati con minore frequenza
        staticRenderCounterRef.current = (staticRenderCounterRef.current + 1) % 30;
        
        // Pulisci il buffer canvas
        bufferCtx.clearRect(0, 0, bufferCanvasRef.current.width, bufferCanvasRef.current.height);
        
        // Copia gli elementi statici sul buffer canvas ogni 30 frame o all'inizio
        if (staticRenderCounterRef.current === 0 || lastFrameTimeRef.current === 0) {
          bufferCtx.drawImage(staticElementsRef.current, 0, 0);
        } else {
          // Altrimenti, copia gli elementi statici e pulisci solo le aree che cambiano
          bufferCtx.drawImage(staticElementsRef.current, 0, 0);
          
          // Pulisci solo le aree che cambiano frequentemente
          const areasToUpdate = getAreasToUpdate();
          areasToUpdate.forEach(({x, y, width, height}) => {
            bufferCtx.clearRect(x, y, width, height);
            // Ridisegna lo sfondo in queste aree
            bufferCtx.drawImage(
              staticElementsRef.current, 
              x, y, width, height,
              x, y, width, height
            );
          });
        }
        
        // Renderizza il cibo nel buffer
        renderFood(bufferCtx);
        
        // Renderizza il giocatore locale e remoti nel buffer
        renderPlayer(bufferCtx);
        
        // Renderizza l'interfaccia utente nel buffer
        renderUI(bufferCtx);
        
        // Mostra informazioni di debug se la modalità debug è attiva
        if (debugMode) {
          bufferCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          bufferCtx.fillRect(10, canvasRef.current.height - 100, 300, 90);
          
          bufferCtx.fillStyle = 'white';
          bufferCtx.font = '12px monospace';
          bufferCtx.textAlign = 'left';
          
          // Mostra FPS, numero di giocatori, ping, direzione e ultimo messaggio socket
          bufferCtx.fillText(`FPS: ${fpsRef.current}`, 20, canvasRef.current.height - 80);
          bufferCtx.fillText(`Giocatori: ${Object.keys(players).length + 1}`, 20, canvasRef.current.height - 65);
          bufferCtx.fillText(`Ping: ${pingRef.current}ms`, 20, canvasRef.current.height - 50);
          bufferCtx.fillText(`Direzione: ${directionRef.current}`, 20, canvasRef.current.height - 35);
          bufferCtx.fillText(`Ultimo socket: ${Date.now() - lastSocketMessageTimeRef.current}ms fa`, 20, canvasRef.current.height - 20);
        }
        
        // Copia il buffer canvas sul canvas principale
        mainCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        mainCtx.drawImage(bufferCanvasRef.current, 0, 0);
        
        // Aggiorna il tempo dell'ultimo frame
        lastFrameTimeRef.current = timestamp;
        
        // Continua il loop di animazione
        animationIdRef.current = requestAnimationFrame(renderLoop);
      };
      
      // Avvia il loop di rendering
      frameId = requestAnimationFrame(renderLoop);
      
      // Loop di movimento locale - movimento più fluido con frequenza moderata
      const moveInterval = setInterval(() => {
        if (!playerState || !playerState.snake || playerState.snake.length === 0) return;
        
        const gridSize = gridSizeRef.current;
        const head = { ...playerState.snake[0] };
        const canvasWidth = 800;
        const canvasHeight = 600;
        
        // Movimento locale basato sulla direzione
        switch (directionRef.current) {
          case 'UP':
            head.y -= gridSize;
            if (head.y < 0) head.y = canvasHeight - gridSize;
            break;
          case 'DOWN':
            head.y += gridSize;
            if (head.y >= canvasHeight) head.y = 0;
            break;
          case 'LEFT':
            head.x -= gridSize;
            if (head.x < 0) head.x = canvasWidth - gridSize;
            break;
          case 'RIGHT':
            head.x += gridSize;
            if (head.x >= canvasWidth) head.x = 0;
            break;
        }
        
        // Aggiorna la posizione localmente (solo se lo stato è valido)
        setPlayerState(prev => {
          if (!prev || !prev.snake || prev.snake.length === 0) return prev;
          
          // Crea una copia profonda per evitare mutazioni
          return {
            ...prev,
            snake: [head, ...prev.snake.slice(0, -1)]
          };
        });
        
        lastDirectionRef.current = directionRef.current;
      }, 1000 / 10); // Velocità del serpente: 10 FPS (più veloce)
      
      // Comunicazione col server - frequenza adeguata ai requisiti
      // Intervallo più adatto al multiplayer che bilanciando latenza e performance
      const serverInterval = setInterval(() => {
        updateWithServer();
      }, 200); // 5 volte al secondo (200ms) - bilanciamento tra reattività e carico
      
      // Memorizza gli intervalli per la pulizia
      renderLoopRef.current = frameId;
      apiLoopRef.current = serverInterval;
      
      // Aggiungi una referenza per moveInterval
      window.moveInterval = moveInterval;
    };
    
    // Avvia i loop con un piccolo ritardo per evitare sfarfallio
    const timeoutId = setTimeout(startGameLoops, 200);
    
    // Pulizia
    return () => {
      clearTimeout(timeoutId);
      if (renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);
      if (apiLoopRef.current) clearInterval(apiLoopRef.current);
      if (window.moveInterval) clearInterval(window.moveInterval);
    };
  }, [gameStarted, playerId, playerState]);
  
  // Funzione di comunicazione con il server semplificata 
  const updateWithServer = async () => {
    if (!playerState || !gameStarted || !playerId) return;
    
    try {
      // Uso di AbortController per limitare il tempo di attesa della richiesta
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // Timeout più breve
      
      // Dati essenziali da inviare
      const minimizedData = {
        id: playerId,
        name: playerName,
        color: playerColor,
        score: score,
        headPos: playerState.snake[0],
        length: playerState.snake.length,
        direction: directionRef.current,
        timestamp: Date.now() // Aggiungi timestamp per debugging
      };
      
      const response = await fetch(`${API_BASE_URL}/api/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          direction: directionRef.current,
          playerState: minimizedData
        }),
        signal: controller.signal
      }).catch(err => {
        if (err.name === 'AbortError') {
          console.log('Richiesta annullata per timeout');
          return null;
        }
        throw err;
      });
      
      clearTimeout(timeoutId);
      
      if (!response || !response.ok) {
        return;
      }
      
      const data = await response.json();
      
      // Aggiorna il cibo
      if (data.foodItems) {
        setFoodItems(data.foodItems);
      }
      
      // Aggiorna gli altri giocatori - adatto per rendering frequente
      if (data.otherPlayers && Array.isArray(data.otherPlayers)) {
        // Filtro stretto e verifica esplicita che non ci siamo noi stessi
        const myId = playerId; // Esplicito per evitare problemi di closure
        const filteredPlayers = data.otherPlayers.filter(p => p && p.id && p.id !== myId);
        setOtherPlayers(filteredPlayers);
        
        // Debug log, solo occasionalmente
        if (debugMode && Math.random() < 0.05) {
          console.log(`Server: ${data.otherPlayers.length} giocatori, dopo filtro: ${filteredPlayers.length}`);
        }
      }
    } catch (error) {
      console.error('Errore comunicazione server:', error);
    }
  };
  
  // Inizializza Pusher - configurazione ottimizzata
  useEffect(() => {
    if (!gameStarted || !playerId) return;
    
    let pusherInstance = null;
    let channelInstance = null;
    let isCleaningUp = false;
    
    const initializePusher = () => {
      try {
        // Resetta lo stato degli other players
        setOtherPlayers([]);
        setConnectionStatus('connessione...');
        
        console.log('Inizializzazione nuova connessione Pusher');
        
        // Inizializza Pusher con opzioni ottimizzate
        pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
          enabledTransports: ['ws', 'wss'], // Preferisci WebSocket
          disableStats: true, // Disabilita statistiche per ridurre traffico
          pongTimeout: 10000, // Aumenta timeout
          activityTimeout: 30000, // Aumenta timeout attività
          authEndpoint: `${API_BASE_URL}/api/pusher/auth`,
          auth: {
            headers: {
              'X-Player-ID': playerId
            }
          },
        });
        
        // Sottoscrivi al canale
        channelInstance = pusherInstance.subscribe('snake-game');
        
        // Log dello stato della connessione
        pusherInstance.connection.bind('state_change', (states) => {
          if (isCleaningUp) return; // Ignora eventi durante pulizia
          
          console.log('Stato connessione Pusher:', states.current);
          setConnectionStatus(states.current);
          
          // Se la connessione è stata stabilita, aggiorna il timestamp
          if (states.current === 'connected') {
            setLastMessageTime(Date.now());
          } else if (states.current === 'disconnected' || states.current === 'failed') {
            // Tentativo di riconnessione dopo un breve ritardo
            console.log('Tentativo di riconnessione tra 3 secondi...');
            setTimeout(() => {
              if (!isCleaningUp && pusherInstance) {
                pusherInstance.connect();
              }
            }, 3000);
          }
        });
        
        // Gestisci l'errore di connessione
        pusherInstance.connection.bind('error', (err) => {
          if (isCleaningUp) return;
          console.error('Errore connessione Pusher:', err);
          setConnectionStatus('errore');
        });
        
        // Gestisci l'evento player-joined
        channelInstance.bind('player-joined', (data) => {
          if (isCleaningUp || !data) return;
          setLastMessageTime(Date.now());
          
          console.log('Ricevuto evento player-joined:', 
            data.player ? data.player.id : 'nessun player',
            'Altri giocatori:', data.otherPlayers ? data.otherPlayers.length : 0);
          
          // Aggiorna il cibo
          if (data.foodItems) {
            setFoodItems(data.foodItems);
          }
          
          // Aggiorna i giocatori - verifica esplicitamente che non siamo noi
          if (data.otherPlayers && Array.isArray(data.otherPlayers)) {
            const filtered = data.otherPlayers.filter(p => p && p.id && p.id !== playerId);
            console.log(`Filtrato ${data.otherPlayers.length} giocatori a ${filtered.length}`);
            
            // Aggiorna timestamp per ogni giocatore
            const timestampedPlayers = filtered.map(player => ({
              ...player,
              lastUpdate: Date.now(),
              // Imposta direzione per il movimento
              direction: player.direction || 'right'
            }));
            
            setOtherPlayers(timestampedPlayers);
          }
        });
        
        // Gestisci l'evento player-moved
        channelInstance.bind('player-moved', (data) => {
          if (isCleaningUp || !data) return;
          setLastMessageTime(Date.now());
          
          // Log meno frequente per non intasare la console
          if (debugMode && Math.random() < 0.1) {
            console.log('Ricevuto evento player-moved:', 
              data.playerId,
              'Altri giocatori:', data.otherPlayers ? data.otherPlayers.length : 0);
          }
          
          // Aggiorna il cibo
          if (data.foodItems) {
            setFoodItems(data.foodItems);
          }
          
          // Aggiorna giocatori - con controllo più stretto
          if (data.otherPlayers && Array.isArray(data.otherPlayers)) {
            const myId = playerId;
            const filtered = data.otherPlayers.filter(p => p && p.id && p.id !== myId);
            
            // Aggiorna timestamp per ogni giocatore
            const timestampedPlayers = filtered.map(player => ({
              ...player,
              lastUpdate: Date.now(),
              // Imposta direzione per il movimento
              direction: player.direction || 'right'
            }));
            
            // Solo in debug mode
            if (debugMode && Math.random() < 0.05) {
              console.log(`Filtrato ${data.otherPlayers.length} giocatori a ${filtered.length}`);
              if (filtered.length > 0) {
                console.log('Esempio serpente:', filtered[0].snake ? 
                  `${filtered[0].snake.length} segmenti` : 'nessun serpente');
              }
            }
            
            setOtherPlayers(timestampedPlayers);
          }
        });
        
        // Memorizza il riferimento a Pusher
        pusherRef.current = pusherInstance;
      } catch (error) {
        console.error('Errore inizializzazione Pusher:', error);
        setError('Errore di connessione: ricarica la pagina');
        setConnectionStatus('errore');
      }
    };
    
    // Ping/pong per verificare stato connessione
    const pingInterval = setInterval(() => {
      if (isCleaningUp) return;
      
      // Invia un piccolo ping al server per mantenere viva la connessione
      fetch(`${API_BASE_URL}/api/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerId })
      }).catch(err => console.log('Errore ping:', err));
      
      // Verifica quanto tempo è passato dall'ultimo messaggio
      if (lastMessageTime) {
        const now = Date.now();
        const elapsed = now - lastMessageTime;
        if (elapsed > 15000) { // 15 secondi senza messaggi
          setConnectionStatus('inattivo');
          
          // Tenta di riconnettere se la connessione è inattiva
          if (pusherInstance && pusherInstance.connection.state !== 'connected') {
            console.log('Tentativo di riconnessione per inattività...');
            pusherInstance.connect();
          }
        }
      }
    }, 5000);
    
    // Avvia l'inizializzazione
    initializePusher();
    
    // Disconnetti al termine
    return () => {
      isCleaningUp = true;
      console.log('Pulizia connessione Pusher...');
      clearInterval(pingInterval);
      
      // Disiscriviti dal canale prima di disconnettere
      if (channelInstance) {
        try {
          console.log('Disiscrivendo dal canale...');
          channelInstance.unbind_all();
          pusherInstance.unsubscribe('snake-game');
        } catch (error) {
          console.error('Errore durante disiscrivimento:', error);
        }
      }
      
      // Disconnetti Pusher dopo un breve ritardo per permettere al canale di disiscriversi
      setTimeout(() => {
        if (pusherInstance) {
          try {
            console.log('Disconnessione Pusher...');
            pusherInstance.disconnect();
            pusherInstance = null;
            channelInstance = null;
            pusherRef.current = null;
          } catch (error) {
            console.error('Errore durante disconnessione Pusher:', error);
          }
        }
        setConnectionStatus('disconnesso');
      }, 300);
    };
  }, [gameStarted, playerId, lastMessageTime, debugMode]);
  
  // Nuovo effetto per pulire i giocatori inattivi
  useEffect(() => {
    if (!gameStarted) return;
    
    // Controlla e rimuovi i giocatori inattivi ogni 10 secondi
    const cleanupInterval = setInterval(() => {
      setOtherPlayers(prev => {
        const now = Date.now();
        // Rimuovi giocatori che non hanno inviato aggiornamenti negli ultimi 15 secondi
        return prev.filter(player => {
          return player && player.lastUpdate && (now - player.lastUpdate) < 15000;
        });
      });
    }, 10000);
    
    return () => {
      clearInterval(cleanupInterval);
    };
  }, [gameStarted]);
  
  // Gestione input da tastiera
  useEffect(() => {
    if (!gameStarted) return;
    
    const handleKeyDown = (e) => {
      switch(e.key) {
        case 'ArrowUp':
          if (lastDirectionRef.current !== 'down') {
            directionRef.current = 'up';
          }
          break;
        case 'ArrowDown':
          if (lastDirectionRef.current !== 'up') {
            directionRef.current = 'down';
          }
          break;
        case 'ArrowLeft':
          if (lastDirectionRef.current !== 'right') {
            directionRef.current = 'left';
          }
          break;
        case 'ArrowRight':
          if (lastDirectionRef.current !== 'left') {
            directionRef.current = 'right';
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameStarted]);
  
  // Gestione joystick per mobile
  useEffect(() => {
    if (!gameStarted || !isMobile) return;
    
    // Gestione swipe
    let startX = 0;
    let startY = 0;
    
    const handleTouchStart = (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    
    const handleTouchMove = (e) => {
      if (!startX || !startY) return;
      
      const diffX = e.touches[0].clientX - startX;
      const diffY = e.touches[0].clientY - startY;
      
      // Determina la direzione del movimento
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Movimento orizzontale
        if (diffX > 0 && lastDirectionRef.current !== 'left') {
          directionRef.current = 'right';
        } else if (diffX < 0 && lastDirectionRef.current !== 'right') {
          directionRef.current = 'left';
        }
      } else {
        // Movimento verticale
        if (diffY > 0 && lastDirectionRef.current !== 'up') {
          directionRef.current = 'down';
        } else if (diffY < 0 && lastDirectionRef.current !== 'down') {
          directionRef.current = 'up';
        }
      }
      
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    
    const handleTouchEnd = () => {
      startX = 0;
      startY = 0;
    };
    
    // Setup joystick
    const setupJoystick = () => {
      if (!joystickRef.current) return;
      
      const joystickElement = joystickRef.current;
      const joystickBounds = joystickElement.getBoundingClientRect();
      const joystickCenterX = joystickBounds.width / 2;
      const joystickCenterY = joystickBounds.height / 2;
      
      let isDragging = false;
      let stick = joystickElement.querySelector('.joystick-stick');
      
      // Tocco iniziale
      joystickElement.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDragging = true;
        updateJoystickPosition(e);
      });
      
      // Movimento del joystick
      joystickElement.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isDragging) {
          updateJoystickPosition(e);
        }
      });
      
      // Fine del tocco
      joystickElement.addEventListener('touchend', () => {
        isDragging = false;
        // Riporta il joystick al centro
        stick.style.transform = `translate(0px, 0px)`;
      });
      
      // Aggiorna la posizione del joystick e la direzione
      function updateJoystickPosition(e) {
        const touch = e.touches[0];
        const rect = joystickElement.getBoundingClientRect();
        
        // Calcola la posizione relativa al centro del joystick
        let x = touch.clientX - rect.left - joystickCenterX;
        let y = touch.clientY - rect.top - joystickCenterY;
        
        // Limita il movimento entro il cerchio del joystick
        const distance = Math.sqrt(x * x + y * y);
        const maxDistance = joystickCenterX - 10; // Raggio massimo
        
        if (distance > maxDistance) {
          x = (x / distance) * maxDistance;
          y = (y / distance) * maxDistance;
        }
        
        // Muovi visivamente il joystick
        stick.style.transform = `translate(${x}px, ${y}px)`;
        
        // Determina la direzione in base all'angolo
        const angle = Math.atan2(y, x) * (180 / Math.PI);
        
        // Converti l'angolo nella direzione appropriata
        if (angle > -45 && angle <= 45 && lastDirectionRef.current !== 'left') {
          directionRef.current = 'right';
        } else if (angle > 45 && angle <= 135 && lastDirectionRef.current !== 'up') {
          directionRef.current = 'down';
        } else if ((angle > 135 || angle <= -135) && lastDirectionRef.current !== 'right') {
          directionRef.current = 'left';
        } else if (angle > -135 && angle <= -45 && lastDirectionRef.current !== 'down') {
          directionRef.current = 'up';
        }
      }
    };
    
    // Aggiungi eventi per swipe
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Setup joystick con leggero ritardo
    setTimeout(setupJoystick, 500);
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gameStarted, isMobile]);
  
  // Funzione per aggiustare la dimensione del canvas
  const resizeCanvas = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    
    // Dimensioni logiche del gioco
    const logicalWidth = 800;
    const logicalHeight = 600;
    
    // Ottieni le dimensioni del container
    const container = document.getElementById('game-container');
    if (!container) return;
    
    const containerWidth = container.clientWidth - 40; // Sottrai il padding
    const containerHeight = window.innerHeight * 0.7; // Usa al massimo il 70% dell'altezza della finestra
    
    // Calcola la scala per adattare il canvas al container mantenendo l'aspect ratio
    const scaleX = containerWidth / logicalWidth;
    const scaleY = containerHeight / logicalHeight;
    const newScale = Math.min(scaleX, scaleY, 1); // Non ingrandire oltre la dimensione originale
    
    // Imposta le dimensioni del canvas in pixel
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;
    
    // Imposta le dimensioni in CSS 
    canvas.style.width = `${logicalWidth * newScale}px`;
    canvas.style.height = `${logicalHeight * newScale}px`;
    
    // Memorizza la scala per il rendering
    setScale(newScale);
    
    console.log(`Canvas ridimensionato: scala ${newScale}, dimensioni ${logicalWidth * newScale}x${logicalHeight * newScale}`);
  };
  
  // Ridimensiona il canvas quando la finestra cambia dimensione
  useEffect(() => {
    if (!gameStarted) return;
    
    window.addEventListener('resize', resizeCanvas);
    // Imposta le dimensioni iniziali
    resizeCanvas();
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [gameStarted]);
  
  // Inizializzazione della partita
  const handleStartGame = async (e) => {
    e.preventDefault();
    
    try {
      console.log('Avvio partita...');
      
      // Mostra un indicatore di caricamento
      setError('Caricamento in corso...');
      
      const res = await fetch(`${API_BASE_URL}/api/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerName: playerName,
          playerColor: playerColor
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Errore API: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Dati ricevuti dal server:', data);
      console.log('Player:', data.player);
      console.log('Snake:', data.player.snake);
      console.log('Food items:', data.foodItems);
      
      if (!data.player || !data.player.snake || !data.player.snake.length) {
        throw new Error('Dati del serpente mancanti o non validi');
      }
      
      // Prepara il canvas prima di impostare i dati
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        
        // Imposta dimensioni fisiche del canvas
        canvas.width = 800;
        canvas.height = 600;
        
        // Pre-rendering del primo frame per evitare sfarfallio
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Disegna griglia
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.5;
        const gridSize = gridSizeRef.current;
        
        for (let x = 0; x <= canvas.width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        
        for (let y = 0; y <= canvas.height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }
      
      // Imposta i dati iniziali dopo aver preparato il canvas
      setPlayerId(data.player.id);
      setPlayerState(data.player);
      setFoodItems(data.foodItems || []);
      setScore(data.player.score || 0);
      setOtherPlayers(data.otherPlayers || []);
      
      // Breve ritardo prima di avviare il gioco per garantire che tutto sia pronto
      setTimeout(() => {
        // Prepara il canvas dopo aver impostato i dati ma prima di mostrare l'interfaccia
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          // Disegno debug del serpente iniziale per verifica
          const gridSize = gridSizeRef.current;
          
          // Disegna il serpente con colore luminoso e bordo bianco per renderlo più visibile
          if (data.player && data.player.snake) {
            data.player.snake.forEach((segment, i) => {
              if (!segment) return;
              
              // Disegna un cerchio più grande per rendere più visibile il serpente
              // Bordo bianco
              ctx.fillStyle = 'white';
              ctx.beginPath();
              ctx.arc(
                segment.x + gridSize/2,
                segment.y + gridSize/2,
                i === 0 ? gridSize/2 + 2 : gridSize/2,
                0,
                Math.PI * 2
              );
              ctx.fill();
              
              // Cerchio interno colorato
              ctx.fillStyle = playerColor;
              ctx.beginPath();
              ctx.arc(
                segment.x + gridSize/2,
                segment.y + gridSize/2,
                i === 0 ? gridSize/2 : gridSize/2 - 2,
                0,
                Math.PI * 2
              );
              ctx.fill();
              
              // Punto di debug per la testa
              if (i === 0) {
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(
                  segment.x + gridSize/2,
                  segment.y + gridSize/2,
                  3,
                  0,
                  Math.PI * 2
                );
                ctx.fill();
              }
            });
          }
          
          // Disegna il cibo
          if (data.foodItems && data.foodItems.length > 0) {
            data.foodItems.forEach(food => {
              if (!food) return;
              
              ctx.fillStyle = '#e73c3e';
              ctx.beginPath();
              ctx.arc(
                food.x + gridSize/2,
                food.y + gridSize/2,
                gridSize/2 - 2,
                0,
                Math.PI * 2
              );
              ctx.fill();
            });
          }
          
          // Disegna stats iniziali
          ctx.fillStyle = 'white';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'left';
          ctx.fillText(`Punteggio: ${data.player.score || 0}`, 10, 25);
          
          ctx.textAlign = 'right';
          ctx.fillText(`Giocatori: ${(data.otherPlayers?.length || 0) + 1}`, canvas.width - 10, 25);
        }
        
        // Impostiamo anche la direzione iniziale
        directionRef.current = 'right';
        lastDirectionRef.current = 'right';
        
        // Ridimensiona il canvas per adattarlo al container
        resizeCanvas();
        
        setError('');
        setGameStarted(true);
        
        console.log('Interfaccia di gioco attivata!');
      }, 500); // Aumento ulteriormente il ritardo per garantire che il canvas sia pronto
      
      console.log('Gioco avviato con successo, ID:', data.player.id);
    } catch (err) {
      console.error('Errore avvio gioco:', err);
      setError('Errore durante l\'avvio del gioco: ' + err.message);
    }
  };
  
  // Renderizza informazioni di debug nel canvas
  const renderDebugInfo = (bufferCtx, canvas, otherPlayers, visiblePlayers) => {
    if (!debugMode) return;
    
    const now = Date.now();
    const connectionAge = lastMessageTime ? Math.floor((now - lastMessageTime) / 1000) : 'N/A';
    
    bufferCtx.fillStyle = connectionStatus === 'connected' ? '#00ff00' : 
                         (connectionStatus === 'connecting' ? '#ffff00' : '#ff0000');
    bufferCtx.font = '12px monospace';
    bufferCtx.textAlign = 'left';
    bufferCtx.fillText(`Connessione: ${connectionStatus} (${connectionAge}s)`, 10, 65);
    bufferCtx.fillText(`ID: ${playerId?.substring(0,8)}`, 10, 80);
    bufferCtx.fillText(`Altri: ${otherPlayers?.length || 0} (visibili: ${visiblePlayers})`, 10, 95);
    
    // Visualizza le coordinate di alcuni giocatori per debug
    if (otherPlayers && otherPlayers.length > 0) {
      otherPlayers.slice(0, 2).forEach((player, idx) => {
        if (player && player.snake && player.snake.length > 0) {
          const head = player.snake[0];
          bufferCtx.fillText(
            `P${idx+1}: (${head.x},${head.y})`, 
            10, 110 + idx * 15
          );
        }
      });
    }
  };
  
  // Funzione per calcolare le aree da aggiornare
  const getAreasToUpdate = () => {
    const areas = [];
    const margin = gridSizeRef.current * 2; // Aggiungiamo un margine per sicurezza
    
    // Area attorno al serpente locale
    if (snakeRef.current && snakeRef.current.length > 0) {
      const head = snakeRef.current[0];
      areas.push({
        x: head.x - margin,
        y: head.y - margin,
        width: gridSizeRef.current * 2 + margin * 2,
        height: gridSizeRef.current * 2 + margin * 2
      });
    }
    
    // Aree attorno ai serpenti remoti
    Object.values(interpolatedPlayers).forEach(player => {
      if (!player.snake || player.snake.length === 0) return;
      
      const head = player.snake[0];
      areas.push({
        x: head.x - margin,
        y: head.y - margin,
        width: gridSizeRef.current * 2 + margin * 2,
        height: gridSizeRef.current * 2 + margin * 2
      });
    });
    
    // Aree attorno al cibo
    if (foodItems && foodItems.length > 0) {
      foodItems.forEach(food => {
        areas.push({
          x: food.x - margin / 2,
          y: food.y - margin / 2,
          width: gridSizeRef.current + margin,
          height: gridSizeRef.current + margin
        });
      });
    }
    
    return areas;
  };

  // Funzione per renderizzare il cibo
  const renderFood = (ctx) => {
    if (!foodItems || foodItems.length === 0) return;
    
    ctx.fillStyle = '#e74c3c'; // Rosso per il cibo
    foodItems.forEach(item => {
      ctx.beginPath();
      ctx.arc(
        item.x + gridSizeRef.current / 2,
        item.y + gridSizeRef.current / 2,
        gridSizeRef.current / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  };

  // Funzione per renderizzare i giocatori (locale e remoti)
  const renderPlayer = (ctx) => {
    // Renderizza il giocatore locale
    if (playerState && playerState.snake && playerState.snake.length > 0) {
      // Aggiorna la reference al serpente locale per l'area di aggiornamento
      snakeRef.current = playerState.snake;
      
      // Disegna il serpente locale in verde
      ctx.fillStyle = '#2ecc71'; // Verde per il giocatore locale
      playerState.snake.forEach((segment, index) => {
        // Testa leggermente più grande
        const size = index === 0 ? gridSizeRef.current : gridSizeRef.current - 2;
        ctx.fillRect(
          segment.x + (gridSizeRef.current - size) / 2,
          segment.y + (gridSizeRef.current - size) / 2,
          size,
          size
        );
      });

      // Disegna il nome del giocatore sopra la testa se disponibile
      if (playerName) {
        const head = playerState.snake[0];
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          playerName,
          head.x + gridSizeRef.current / 2,
          head.y - 5
        );
      }
    }

    // Renderizza i giocatori remoti interpolati
    Object.entries(interpolatedPlayers).forEach(([id, player]) => {
      if (!player.snake || player.snake.length === 0) return;
      
      // Disegna il serpente del giocatore remoto in rosso
      ctx.fillStyle = '#e67e22'; // Arancione per i giocatori remoti
      player.snake.forEach((segment, index) => {
        // Testa leggermente più grande
        const size = index === 0 ? gridSizeRef.current : gridSizeRef.current - 2;
        ctx.fillRect(
          segment.x + (gridSizeRef.current - size) / 2,
          segment.y + (gridSizeRef.current - size) / 2,
          size,
          size
        );
      });

      // Disegna il nome del giocatore sopra la testa
      if (player.name) {
        const head = player.snake[0];
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          player.name,
          head.x + gridSizeRef.current / 2,
          head.y - 5
        );
      }
    });
  };

  // Funzione per renderizzare l'interfaccia utente
  const renderUI = (ctx) => {
    if (!canvasRef.current) return;
    
    // Disegna il punteggio in alto a sinistra
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Punteggio: ${score}`, 20, 30);
    
    // Disegna il numero di giocatori connessi in alto a destra
    const playerCount = Object.keys(players).length + 1; // +1 per il giocatore locale
    ctx.textAlign = 'right';
    ctx.fillText(
      `Giocatori: ${playerCount}`,
      canvasRef.current.width - 20,
      30
    );
    
    // Mostra messaggi di connessione/disconnessione se presenti
    if (connectionStatus === 'disconnesso' && Date.now() - lastMessageTime > 3000) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Connessione persa',
        canvasRef.current.width / 2,
        60
      );
    }
  };
  
  // Funzione per renderizzare gli elementi statici
  const renderStaticElements = (ctx) => {
    if (!canvasRef.current) return;
    
    // Disegna lo sfondo
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
    // Disegna la griglia
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    
    // Disegna linee orizzontali
    for (let y = 0; y < canvasRef.current.height; y += gridSizeRef.current) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasRef.current.width, y);
      ctx.stroke();
    }
    
    // Disegna linee verticali
    for (let x = 0; x < canvasRef.current.width; x += gridSizeRef.current) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasRef.current.height);
      ctx.stroke();
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
              <li>Su <strong>dispositivi mobili</strong>, usa il joystick o fai swipe</li>
              <li>Raccogli il cibo per crescere e guadagnare punti</li>
              <li>Evita di scontrarti con gli altri serpenti</li>
              <li>Diventa il serpente più lungo della partita!</li>
            </ul>
          </div>
        </div>
      ) : (
        <div id="game-container">
          <canvas ref={canvasRef} id="gameCanvas"></canvas>
          
          {isMobile && (
            <div className="controls-container">
              <div className="joystick-container" ref={joystickRef}>
                <div className="joystick-base">
                  <div className="joystick-stick"></div>
                </div>
              </div>
            </div>
          )}
          
          <div className="game-info">
            <div className="controls">
              {isMobile ? (
                <p>Usa il joystick per muovere il serpente</p>
              ) : (
                <p>Usa le frecce direzionali ↑ ↓ ← → per muovere il serpente</p>
              )}
            </div>
            
            <div className="connection-status">
              <span className={`status-indicator ${connectionStatus}`}></span>
              <span>Stato: {connectionStatus}</span>
              <button 
                className="debug-button"
                onClick={() => setDebugMode(!debugMode)}
              >
                {debugMode ? 'Disattiva Debug' : 'Attiva Debug'}
              </button>
            </div>
            
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
      
      <style jsx global>{`
        :root {
          --primary-color: #4a90e2;
          --card-bg: #1a1a2e;
          --text-color: #ffffff;
          --text-secondary: #a0aec0;
          --border-radius: 10px;
        }
        
        body {
          margin: 0;
          padding: 0;
          font-family: 'Poppins', sans-serif;
          background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
          color: var(--text-color);
          min-height: 100vh;
          overscroll-behavior: none; /* Previene bounce effect su mobile */
        }
        
        * {
          box-sizing: border-box;
        }
        
        h1 {
          font-size: 2.5rem;
          margin-bottom: 2rem;
          text-align: center;
          color: var(--text-color);
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }
        
        input {
          padding: 0.5rem 1rem;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--border-radius);
          background-color: rgba(255, 255, 255, 0.05);
          color: var(--text-color);
          font-size: 1rem;
          transition: all 0.3s ease;
        }
        
        input:focus {
          outline: none;
          border-color: var(--primary-color);
          background-color: rgba(255, 255, 255, 0.1);
        }
        
        button {
          width: 100%;
          padding: 0.8rem;
          border: none;
          border-radius: var(--border-radius);
          background-color: var(--primary-color);
          color: white;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        button:hover {
          background-color: #357abd;
          transform: translateY(-1px);
        }
        
        .error {
          color: #e53e3e;
          margin-top: 0.5rem;
          text-align: center;
        }
      `}</style>
      
      <style jsx>{`
        .container {
          max-width: 850px;
          margin: 0 auto;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          overflow-x: hidden; /* Previene scroll orizzontale */
        }
        
        #game-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          background-color: var(--card-bg);
          border-radius: var(--border-radius);
          padding: 1.5rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          margin-top: 2rem;
          box-sizing: border-box;
        }
        
        canvas {
          display: block;
          margin: 0 auto;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
          border-radius: 4px;
          transform: translateZ(0); /* Attiva l'accelerazione hardware */
          will-change: transform; /* Suggerisce al browser di ottimizzare le trasformazioni */
        }
        
        .controls-container {
          width: 100%;
          display: flex;
          justify-content: center;
          margin-top: 1rem;
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 15px;
          padding: 15px;
          transform: translateZ(0); /* Attiva l'accelerazione hardware */
          will-change: transform; /* Suggerisce al browser di ottimizzare le trasformazioni */
        }
        
        .joystick-container {
          position: relative;
          margin: 0 auto;
          touch-action: none;
        }
        
        .joystick-base {
          width: 120px;
          height: 120px;
          background: rgba(255, 255, 255, 0.1);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .joystick-stick {
          width: 50px;
          height: 50px;
          background: var(--primary-color);
          border-radius: 50%;
          position: absolute;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
          transform: translateZ(0); /* Attiva l'accelerazione hardware */
          will-change: transform; /* Suggerisce al browser di ottimizzare le trasformazioni */
        }
        
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
          width: 100%;
        }
        
        .controls {
          font-size: 0.9rem;
          color: var(--text-secondary);
          text-align: center;
          margin-top: 0.5rem;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 10px;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }
        
        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        
        .status-indicator.connected {
          background-color: #22c55e;
          box-shadow: 0 0 5px #22c55e;
        }
        
        .status-indicator.connecting {
          background-color: #eab308;
          box-shadow: 0 0 5px #eab308;
        }
        
        .status-indicator.disconnesso, .status-indicator.errore, .status-indicator.inattivo {
          background-color: #ef4444;
          box-shadow: 0 0 5px #ef4444;
        }
        
        .debug-button {
          background-color: #333;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 0.8rem;
          cursor: pointer;
          margin-left: 10px;
        }
        
        .debug-button:hover {
          background-color: #555;
        }
        
        /* Media query per dispositivi mobili */
        @media (max-width: 768px) {
          .container {
            padding: 0.5rem;
          }
          
          h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
          }
          
          #game-container {
            padding: 1rem;
          }
          
          canvas {
            width: 100%;
            height: auto;
            max-height: 80vh;
            aspect-ratio: 4/3;
          }
          
          .controls-container {
            padding: 10px;
          }
          
          .joystick-base {
            width: 100px;
            height: 100px;
          }
          
          .joystick-stick {
            width: 40px;
            height: 40px;
          }
        }
      `}</style>
    </div>
  );
} 