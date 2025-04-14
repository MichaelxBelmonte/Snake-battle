import { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

// URL dell'API da utilizzare in produzione o in sviluppo
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://snake-battle.vercel.app' 
  : '';  // In sviluppo, usa URL relativo

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
  
  // Aggiungo un ref per tracciare lo stato di avvio del game loop
  const gameLoopActiveRef = useRef(false);
  
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
  
  // Gestione input da tastiera
  useEffect(() => {
    if (!gameStarted) return;
    
    console.log('Attivazione gestione input da tastiera');
    
    const handleKeyDown = (e) => {
      console.log('Tasto premuto:', e.key);
      
      // Previeni lo scroll della pagina con le frecce
      if(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      
      let newDirection = directionRef.current;
      
      switch(e.key) {
        case 'ArrowUp':
          if (lastDirectionRef.current !== 'down') {
            newDirection = 'up';
            console.log('Direzione cambiata a: up');
          }
          break;
        case 'ArrowDown':
          if (lastDirectionRef.current !== 'up') {
            newDirection = 'down';
            console.log('Direzione cambiata a: down');
          }
          break;
        case 'ArrowLeft':
          if (lastDirectionRef.current !== 'right') {
            newDirection = 'left';
            console.log('Direzione cambiata a: left');
          }
          break;
        case 'ArrowRight':
          if (lastDirectionRef.current !== 'left') {
            newDirection = 'right';
            console.log('Direzione cambiata a: right');
          }
          break;
      }
      
      // Aggiorna la direzione immediatamente
      if (newDirection !== directionRef.current) {
        console.log(`Nuova direzione: ${newDirection} (da ${directionRef.current})`);
        directionRef.current = newDirection;
      }
    };
    
    // Aggiungi event listener con priorità
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    
    // Forza un input iniziale per far muovere il serpente
    setTimeout(() => {
      console.log('Simulazione input iniziale per far muovere il serpente');
      // Forza la direzione iniziale
      directionRef.current = 'right';
      lastDirectionRef.current = 'right';
    }, 1000);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gameStarted]);
  
  // Loop di gioco con setInterval (più stabile)
  useEffect(() => {
    if (!gameStarted || !playerId || gameLoopActiveRef.current) return;

    console.log('Avvio loop di gioco con setInterval');
    gameLoopActiveRef.current = true; // Marca il game loop come avviato
    
    // Riferimenti alle variabili locali che verranno chiuse nel cleanup
    let gameLoopActive = true;
    let moveIntervalId = null;
    let serverIntervalId = null;
    let animFrameId = null;
    
    // Piccolo ritardo prima di avviare i loop per garantire che lo stato sia aggiornato
    const startGameLoops = () => {
      if (!gameLoopActive) return; // Evita avvio se già in pulizia
      
      // Loop di movimento locale - movimento più fluido con frequenza moderata
      moveIntervalId = setInterval(() => {
        if (!gameLoopActive) return;
        
        // Forza il movimento anche se playerState non è disponibile
        if (!playerState || !playerState.snake || playerState.snake.length === 0) {
          console.log('ERRORE: PlayerState non disponibile per il movimento');
          return;
        }
        
        console.log('Esecuzione ciclo di movimento, direzione:', directionRef.current);
        
        const gridSize = gridSizeRef.current;
        const head = { ...playerState.snake[0] };
        const canvasWidth = 800;
        const canvasHeight = 600;
        
        // Movimento locale basato sulla direzione
        switch (directionRef.current) {
          case 'up':
            head.y -= gridSize;
            if (head.y < 0) head.y = canvasHeight - gridSize;
            break;
          case 'down':
            head.y += gridSize;
            if (head.y >= canvasHeight) head.y = 0;
            break;
          case 'left':
            head.x -= gridSize;
            if (head.x < 0) head.x = canvasWidth - gridSize;
            break;
          case 'right':
            head.x += gridSize;
            if (head.x >= canvasWidth) head.x = 0;
            break;
        }
        
        // DEBUG - Stampa informazioni sulla posizione
        console.log(`Movimento serpente: ${directionRef.current}, nuova posizione: (${head.x}, ${head.y})`);
        
        // Aggiorna la posizione localmente
        setPlayerState(prev => {
          if (!prev || !prev.snake || prev.snake.length === 0) {
            console.log('ERRORE: playerState non valido durante aggiornamento');
            return prev;
          }
          
          const newSnake = [head, ...prev.snake.slice(0, -1)];
          
          // Log della nuova posizione della testa
          console.log(`Nuova posizione testa serpente: (${head.x}, ${head.y}), lunghezza: ${newSnake.length}`);
          
          // Crea una copia profonda per evitare mutazioni
          return {
            ...prev,
            snake: newSnake
          };
        });
        
        lastDirectionRef.current = directionRef.current;
      }, 300); // 300ms = più lento (3.3 FPS) per debug e facile visualizzazione
      
      // VERSIONE SEMPLIFICATA DEL RENDER LOOP
      const simplifiedRenderLoop = () => {
        if (!canvasRef.current || !gameLoopActive) return;
        
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) {
          console.error('Context non disponibile');
          return;
        }
        
        // Pulisci il canvas
        ctx.fillStyle = '#004400';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Disegna una griglia semplice
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        const gridSize = gridSizeRef.current;
        
        for (let x = 0; x <= canvasRef.current.width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvasRef.current.height);
          ctx.stroke();
        }
        
        for (let y = 0; y <= canvasRef.current.height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvasRef.current.width, y);
          ctx.stroke();
        }
        
        // Disegna il cibo in modo MOLTO visibile
        if (foodItems && foodItems.length > 0) {
          foodItems.forEach(food => {
            // Disegna un cerchio giallo più grande per il cibo
            ctx.fillStyle = '#ffff00'; // Giallo brillante
            ctx.beginPath();
            ctx.arc(
              food.x + gridSize/2,
              food.y + gridSize/2,
              gridSize/2 + 2, // Più grande
              0,
              Math.PI * 2
            );
            ctx.fill();
            
            // Aggiungi un contorno rosso
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(
              food.x + gridSize/2,
              food.y + gridSize/2,
              gridSize/2 + 2,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          });
        } else {
          // Se non c'è cibo, disegna del cibo di test
          ctx.fillStyle = '#ffff00'; // Giallo brillante
          ctx.beginPath();
          ctx.arc(
            400,
            300,
            gridSize,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        
        // MOLTO SEMPLICE: Disegna il serpente locale
        if (playerState && playerState.snake && playerState.snake.length > 0) {
          // Disegna il serpente
          ctx.fillStyle = '#00ff00'; // Verde brillante
          playerState.snake.forEach((segment, index) => {
            // Disegna segmenti più grandi per maggiore visibilità
            ctx.fillRect(
              segment.x,
              segment.y,
              gridSize,  // Usa l'intera dimensione della griglia
              gridSize   // Usa l'intera dimensione della griglia
            );
            
            // Aggiungi un bordo per ogni segmento
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(
              segment.x,
              segment.y,
              gridSize,
              gridSize
            );
          });
          
          // Testa del serpente MOLTO evidente
          if (playerState.snake.length > 0) {
            const head = playerState.snake[0];
            
            // Disegna un contorno bianco intorno alla testa
            ctx.fillStyle = 'white';
            ctx.fillRect(
              head.x - 2,
              head.y - 2,
              gridSize + 4,
              gridSize + 4
            );
            
            // Disegna la testa in verde brillante
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(
              head.x,
              head.y,
              gridSize,
              gridSize
            );
            
            // Aggiungi occhi alla testa per maggiore visibilità
            ctx.fillStyle = 'black';
            // Occhio sinistro
            ctx.beginPath();
            ctx.arc(
              head.x + gridSize/4,
              head.y + gridSize/3,
              3,
              0,
              Math.PI * 2
            );
            ctx.fill();
            // Occhio destro
            ctx.beginPath();
            ctx.arc(
              head.x + gridSize*3/4,
              head.y + gridSize/3,
              3,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        } else {
          // Se non c'è un serpente utente, disegna un serpente di test
          ctx.fillStyle = '#ff00ff'; // Fucsia per alta visibilità
          for (let i = 0; i < 5; i++) {
            ctx.fillRect(
              200 + i * gridSize, 
              200, 
              gridSize, 
              gridSize
            );
          }
        }
        
        // Informazioni di debug
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Punteggio: ${score}`, 20, 30);
        ctx.fillText(`Direzione: ${directionRef.current}`, 20, 60);
        
        // Disegna le coordinate del serpente
        if (playerState && playerState.snake && playerState.snake.length > 0) {
          const head = playerState.snake[0];
          ctx.fillText(`Posizione: (${head.x}, ${head.y})`, 20, 90);
          ctx.fillText(`Frame: ${frameCountRef.current}`, 20, 120);
        }
        
        // Incremento contatore frame per debug
        frameCountRef.current++;
        
        // Continua il loop
        animFrameId = requestAnimationFrame(simplifiedRenderLoop);
      };
      
      // Reset contatore frame
      frameCountRef.current = 0;
      
      // Avvia il loop di rendering semplificato
      animFrameId = requestAnimationFrame(simplifiedRenderLoop);
      
      // Comunicazione col server - frequenza adeguata ai requisiti
      serverIntervalId = setInterval(() => {
        if (gameLoopActive) {
          updateWithServer();
        }
      }, 1000); // Più lento per debug (1 volta al secondo)
      
      // Memorizza gli intervalli per la pulizia
      renderLoopRef.current = animFrameId;
      apiLoopRef.current = serverIntervalId;
    };
    
    // Avvia i loops con un piccolo ritardo per evitare sfarfallio
    const timeoutId = setTimeout(startGameLoops, 500);
    
    // Debug: movimento automatico per test
    const autoMoveTimeoutId = setTimeout(() => {
      // Sequenza di movimenti automatici per test
      console.log('Avvio movimento automatico per test');
      
      // Movimento automatico ogni 2 secondi
      const autoMoveIntervalId = setInterval(() => {
        console.log('Movimento automatico');
        
        // Cambia direzione in sequenza
        const directions = ['right', 'down', 'left', 'up'];
        const currentIndex = directions.indexOf(directionRef.current);
        const nextIndex = (currentIndex + 1) % directions.length;
        directionRef.current = directions[nextIndex];
        
        console.log('Direzione automatica:', directionRef.current);
      }, 2000);
      
      // Aggiungi l'intervallo alla pulizia
      return () => clearInterval(autoMoveIntervalId);
    }, 3000);
    
    // Pulizia
    return () => {
      console.log('Pulizia game loop...');
      gameLoopActive = false; // Imposta flag di pulizia
      gameLoopActiveRef.current = false; // Marca il game loop come non attivo per consentire un riavvio futuro
      
      clearTimeout(timeoutId);
      clearTimeout(autoMoveTimeoutId);
      
      // Pulisci tutti gli interval e timeout
      if (moveIntervalId) clearInterval(moveIntervalId);
      if (serverIntervalId) clearInterval(serverIntervalId);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      
      // Pulisci anche i riferimenti globali
      if (renderLoopRef.current) {
        cancelAnimationFrame(renderLoopRef.current);
        renderLoopRef.current = null;
      }
      if (apiLoopRef.current) {
        clearInterval(apiLoopRef.current);
        apiLoopRef.current = null;
      }
    };
  }, [gameStarted, playerId]);
  
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
        
        // Aggiorna timestamp per ogni giocatore
        const timestampedPlayers = filteredPlayers.map(player => ({
          ...player,
          lastUpdate: Date.now(),
          // Imposta direzione per il movimento
          direction: player.direction || 'right'
        }));
        
        setOtherPlayers(timestampedPlayers);
        
        // IMPORTANTE: Aggiorna anche il sistema di players per l'interpolazione
        const updatedPlayers = {};
        timestampedPlayers.forEach(player => {
          updatedPlayers[player.id] = player;
        });
        setPlayers(updatedPlayers);
        
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
    
    console.log("Inizializzazione Pusher con ID:", playerId);
    
    // Preveniamo reinizializzazioni inutili
    if (pusherRef.current) {
      console.log("Pusher già inizializzato, salto reinizializzazione");
      return;
    }
    
    let pusherInstance = null;
    let channelInstance = null;
    let isCleaningUp = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    const initializePusher = () => {
      try {
        // Resetta lo stato degli other players se è una nuova connessione, non una riconnessione
        if (reconnectAttempts === 0) {
          setOtherPlayers([]);
        }
        setConnectionStatus('connessione...');
        
        console.log('Inizializzazione connessione Pusher (tentativo ' + (reconnectAttempts + 1) + ')');
        
        // Inizializza Pusher con opzioni ottimizzate
        pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
          enabledTransports: ['ws', 'wss'], // Preferisci WebSocket
          disableStats: true, // Disabilita statistiche per ridurre traffico
          pongTimeout: 10000, // Aumenta timeout
          activityTimeout: 30000, // Aumenta timeout attività
        });
        
        // Memorizza il riferimento a Pusher subito per evitare doppia inizializzazione
        pusherRef.current = pusherInstance;
        
        // Sottoscrivi al canale
        channelInstance = pusherInstance.subscribe('snake-game');
        
        // Log dello stato della connessione
        pusherInstance.connection.bind('state_change', (states) => {
          if (isCleaningUp) return; // Ignora eventi durante pulizia
          
          console.log('Stato connessione Pusher:', states.current);
          setConnectionStatus(states.current);
          
          // Se la connessione è stata stabilita, aggiorna il timestamp e resetta i tentativi
          if (states.current === 'connected') {
            setLastMessageTime(Date.now());
            lastSocketMessageTimeRef.current = Date.now();
            reconnectAttempts = 0; // Reset dei tentativi quando connesso con successo
            
            // Forza un aggiornamento immediato per recuperare lo stato attuale
            updateWithServer();
          } else if (states.current === 'disconnected' || states.current === 'failed') {
            // Tentativo di riconnessione dopo un breve ritardo, con backoff esponenziale
            const reconnectDelay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), 15000);
            
            console.log(`Tentativo di riconnessione ${reconnectAttempts + 1}/${maxReconnectAttempts} tra ${reconnectDelay/1000}s...`);
            
            if (reconnectAttempts < maxReconnectAttempts) {
              setTimeout(() => {
                if (!isCleaningUp) {
                  reconnectAttempts++;
                  
                  // Disconnetti completamente prima di riconnetterti
                  if (pusherInstance) {
                    try {
                      if (channelInstance) {
                        pusherInstance.unsubscribe('snake-game');
                      }
                      pusherInstance.disconnect();
                    } catch (error) {
                      console.error('Errore durante reset connessione:', error);
                    }
                  }
                  
                  // Inizializza una nuova connessione
                  initializePusher();
                }
              }, reconnectDelay);
            } else {
              console.error('Numero massimo di tentativi di riconnessione raggiunto');
              setConnectionStatus('errore');
              setError('Impossibile connettersi al server dopo multipli tentativi. Ricarica la pagina.');
            }
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
          lastSocketMessageTimeRef.current = Date.now();
          
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
            
            // Aggiorna entrambi gli stati per garantire coerenza
            setOtherPlayers(timestampedPlayers);
            
            // IMPORTANTE: Aggiorna anche il sistema di players per l'interpolazione
            const updatedPlayers = {};
            timestampedPlayers.forEach(player => {
              updatedPlayers[player.id] = player;
            });
            setPlayers(updatedPlayers);
          }
          
          // Aggiorna anche quando un singolo giocatore si unisce
          if (data.player && data.player.id !== playerId) {
            console.log('Nuovo giocatore unito:', data.player.id, data.player.name);
            setOtherPlayers(prev => {
              const newPlayer = {
                ...data.player,
                lastUpdate: Date.now(),
                direction: data.player.direction || 'right'
              };
              return [...prev.filter(p => p.id !== data.player.id), newPlayer];
            });
            
            // Aggiorna anche il sistema di players
            setPlayers(prev => {
              const newPlayers = {...prev};
              newPlayers[data.player.id] = {
                ...data.player,
                lastUpdate: Date.now(),
                direction: data.player.direction || 'right'
              };
              return newPlayers;
            });
          }
        });
        
        // Gestisci l'evento player-moved
        channelInstance.bind('player-moved', (data) => {
          if (isCleaningUp || !data) return;
          setLastMessageTime(Date.now());
          lastSocketMessageTimeRef.current = Date.now();
          
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
            
            // Aggiorna entrambi gli stati per garantire coerenza
            setOtherPlayers(timestampedPlayers);
            
            // IMPORTANTE: Aggiorna anche il sistema di players per l'interpolazione
            const updatedPlayers = {};
            timestampedPlayers.forEach(player => {
              updatedPlayers[player.id] = player;
            });
            setPlayers(updatedPlayers);
            
            // Solo in debug mode
            if (debugMode && Math.random() < 0.05) {
              console.log(`Filtrato ${data.otherPlayers.length} giocatori a ${filtered.length}`);
              if (filtered.length > 0) {
                console.log('Esempio serpente:', filtered[0].snake ? 
                  `${filtered[0].snake.length} segmenti` : 'nessun serpente');
              }
            }
          }
        });
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
      console.log('Pulizia componente con gameStarted=' + gameStarted + ' e playerId=' + playerId);
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
            // Importante: reimposta il riferimento a null per consentire future reinizializzazioni
            pusherRef.current = null;
          } catch (error) {
            console.error('Errore durante disconnessione Pusher:', error);
          }
        }
        setConnectionStatus('disconnesso');
      }, 300);
    };
  }, [gameStarted, playerId]); // Rimuoviamo le dipendenze che potrebbero causare reinizializzazioni
  
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
    console.log('RESIZE: Regolando le dimensioni del canvas');
    
    // Dimensioni logiche del gioco
    const logicalWidth = 800;
    const logicalHeight = 600;
    
    // Ottieni le dimensioni del container
    const container = document.getElementById('game-container');
    if (!container) {
      console.error('ERRORE: Container del gioco non trovato!');
      return;
    }
    
    // Imposta dimensioni fisiche del canvas (NON MODIFICARE QUESTE)
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;
    
    console.log(`Canvas dimensioni fisiche impostate a ${canvas.width}x${canvas.height}`);
    
    // IMPORTANTE: Non ridimensionare il canvas con CSS, ma usalo a dimensione piena
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    
    // Memorizza la scala per il rendering
    setScale(1.0);
    
    console.log(`Canvas dimensioni CSS impostate a ${canvas.style.width}x${canvas.style.height}`);
    
    // Forza un render immediato con un serpente di test
    setTimeout(() => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          // Pulisci canvas
          ctx.fillStyle = '#004400';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Disegna serpente di test
          ctx.fillStyle = '#ff00ff'; // Fucsia per alta visibilità
          
          const gridSize = gridSizeRef.current;
          
          // Disegna un grande serpente di test
          for (let i = 0; i < 5; i++) {
            ctx.fillRect(
              200 + i * gridSize, 
              200, 
              gridSize - 1, 
              gridSize - 1
            );
          }
          
          // Disegna un cibo di test
          ctx.fillStyle = '#ffff00'; // Giallo brillante
          ctx.beginPath();
          ctx.arc(
            400,
            300,
            gridSize,
            0,
            Math.PI * 2
          );
          ctx.fill();
          
          console.log('TEST RENDER: Disegnato serpente e cibo di test');
        }
      }
    }, 100);
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
      
      // Fix eventuali coordinate non valide nel serpente
      if (data.player && data.player.snake) {
        data.player.snake = data.player.snake.map(segment => {
          // Assicurati che le coordinate siano numeri e non stringhe
          return {
            x: parseInt(segment.x, 10),
            y: parseInt(segment.y, 10)
          };
        });
        console.log('Serpente con coordinate corrette:', data.player.snake);
      }
      
      // Fix eventuali coordinate non valide nel cibo
      if (data.foodItems) {
        data.foodItems = data.foodItems.map(food => {
          // Assicurati che le coordinate siano numeri e non stringhe
          return {
            x: parseInt(food.x, 10),
            y: parseInt(food.y, 10)
          };
        });
        console.log('Cibo con coordinate corrette:', data.foodItems);
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
      // Crea un serpente di base se i dati dal server sono insufficienti
      const defaultSnake = [
        { x: 100, y: 100 },
        { x: 80, y: 100 },
        { x: 60, y: 100 },
      ];
      
      setPlayerId(data.player.id);
      setPlayerState({
        ...data.player,
        snake: data.player.snake && data.player.snake.length > 0 ? data.player.snake : defaultSnake
      });
      setFoodItems(data.foodItems && data.foodItems.length > 0 ? data.foodItems : [{ x: 300, y: 300 }]);
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
          
          // TEST: log per verificare lo stato dello snake
          console.log('INIT: Stato del serpente prima del render:', playerState?.snake);
          
          // Disegna il serpente con colore luminoso e bordo bianco per renderlo più visibile
          const snakeToRender = data.player && data.player.snake && data.player.snake.length > 0 
            ? data.player.snake 
            : defaultSnake;
            
          console.log('INIT: Serpente da renderizzare:', snakeToRender);
          
          snakeToRender.forEach((segment, i) => {
            if (!segment) return;
            
            console.log(`INIT: Rendering segmento ${i} a (${segment.x}, ${segment.y})`);
            
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
          
          // Disegna il cibo
          const foodToRender = data.foodItems && data.foodItems.length > 0 
            ? data.foodItems 
            : [{ x: 300, y: 300 }];
            
          console.log('INIT: Cibo da renderizzare:', foodToRender);
            
          foodToRender.forEach(food => {
            if (!food) return;
            
            console.log(`INIT: Rendering cibo a (${food.x}, ${food.y})`);
            
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
    const lastMessageTimeVal = lastMessageTime || now;
    const connectionAge = Math.floor((now - lastMessageTimeVal) / 1000);
    
    bufferCtx.fillStyle = connectionStatus === 'connected' ? '#00ff00' : 
                         (connectionStatus === 'connecting' ? '#ffff00' : '#ff0000');
    bufferCtx.font = '12px monospace';
    bufferCtx.textAlign = 'left';
    bufferCtx.fillText(`Connessione: ${connectionStatus} (${connectionAge}s)`, 10, 65);
    bufferCtx.fillText(`ID: ${playerId?.substring(0,8) || 'N/A'}`, 10, 80);
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
      // Consideriamo solo testa e coda per ridurre le aree da aggiornare
      const head = snakeRef.current[0];
      const tail = snakeRef.current[snakeRef.current.length - 1];
      
      // Area per la testa
      areas.push({
        x: head.x - margin,
        y: head.y - margin,
        width: gridSizeRef.current + margin * 2,
        height: gridSizeRef.current + margin * 2
      });
      
      // Area per la coda
      areas.push({
        x: tail.x - margin,
        y: tail.y - margin,
        width: gridSizeRef.current + margin * 2,
        height: gridSizeRef.current + margin * 2
      });
    }
    
    // Aree attorno ai serpenti remoti - con priorità basata sulla distanza
    Object.values(interpolatedPlayers).forEach(player => {
      if (!player.snake || player.snake.length === 0) return;
      
      // Consideriamo solo testa e coda per ridurre le aree da aggiornare
      const head = player.snake[0];
      const tail = player.snake[player.snake.length - 1];
      
      // Area per la testa
      areas.push({
        x: head.x - margin,
        y: head.y - margin,
        width: gridSizeRef.current + margin * 2,
        height: gridSizeRef.current + margin * 2
      });
      
      // Area per la coda
      areas.push({
        x: tail.x - margin,
        y: tail.y - margin,
        width: gridSizeRef.current + margin * 2,
        height: gridSizeRef.current + margin * 2
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
    
    // Ottimizza le aree combinando quelle che si sovrappongono
    const optimizedAreas = [];
    areas.forEach(area => {
      let merged = false;
      
      // Verifica se l'area può essere unita con un'area già esistente
      for (let i = 0; i < optimizedAreas.length; i++) {
        const existingArea = optimizedAreas[i];
        
        // Calcola l'area di intersezione
        const x1 = Math.max(area.x, existingArea.x);
        const y1 = Math.max(area.y, existingArea.y);
        const x2 = Math.min(area.x + area.width, existingArea.x + existingArea.width);
        const y2 = Math.min(area.y + area.height, existingArea.y + existingArea.height);
        
        // Se c'è intersezione, unisci le aree
        if (x1 < x2 && y1 < y2) {
          // Calcola le nuove coordinate dell'area unita
          const newX = Math.min(area.x, existingArea.x);
          const newY = Math.min(area.y, existingArea.y);
          const newWidth = Math.max(area.x + area.width, existingArea.x + existingArea.width) - newX;
          const newHeight = Math.max(area.y + area.height, existingArea.y + existingArea.height) - newY;
          
          // Aggiorna l'area esistente
          existingArea.x = newX;
          existingArea.y = newY;
          existingArea.width = newWidth;
          existingArea.height = newHeight;
          
          merged = true;
          break;
        }
      }
      
      // Se l'area non è stata unita, aggiungila alla lista
      if (!merged) {
        optimizedAreas.push({...area});
      }
    });
    
    return optimizedAreas;
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
              <li>Raccogli il <strong>cibo</strong> per crescere e aumentare il punteggio</li>
              <li>Evita di colpire il tuo serpente o i bordi</li>
              <li>Competi con altri giocatori in tempo reale!</li>
            </ul>
          </div>
        </div>
      ) : (
        <div id="game-container" className="game-container" style={{ 
          border: '5px solid yellow', 
          padding: '20px', 
          position: 'relative', 
          minHeight: '700px', 
          backgroundColor: '#111',
          margin: '0 auto',
          maxWidth: '900px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div className="game-info" style={{ marginBottom: '20px', width: '100%', textAlign: 'center' }}>
            <p style={{ fontWeight: 'bold', fontSize: '18px' }}>Usa le frecce direzionali ↑ ← ↓ → per muovere il serpente</p>
            <div className="connection-status" style={{ margin: '10px 0' }}>
              <span className={`status-indicator ${connectionStatus === 'connected' ? 'connected' : 'disconnected'}`}
                    style={{ display: 'inline-block', width: '15px', height: '15px', borderRadius: '50%', backgroundColor: connectionStatus === 'connected' ? '#2ecc71' : '#e74c3c', marginRight: '10px' }}></span>
              Stato: <strong>{connectionStatus}</strong>
            </div>
          </div>
          
          <canvas 
            ref={canvasRef} 
            width="800" 
            height="600" 
            style={{
              display: 'block',
              margin: '0 auto',
              border: '5px solid red',
              borderRadius: '4px',
              backgroundColor: '#004400',
              boxShadow: '0 0 30px rgba(255, 0, 0, 0.5)',
              position: 'relative',
              zIndex: 10
            }}
          />
          
          {isMobile && (
            <div className="mobile-controls">
              <div 
                ref={joystickRef} 
                className="joystick"
                style={{
                  position: 'fixed',
                  bottom: '50px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '150px',
                  height: '150px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  zIndex: 100
                }}
              >
                <div 
                  className="joystick-stick"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    border: '2px solid rgba(255, 255, 255, 0.7)',
                  }}
                ></div>
              </div>
            </div>
          )}
          
          <button 
            className="debug-button"
            onClick={() => setDebugMode(!debugMode)}
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              padding: '12px 20px',
              backgroundColor: debugMode ? '#3498db' : '#2c3e50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              zIndex: 20,
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            {debugMode ? 'Disattiva Debug' : 'Attiva Debug'}
          </button>
        </div>
      )}
      
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
        
        .login-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          width: 100%;
          max-width: 600px;
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
          line-height: 1.5;
        }
        
        .game-container {
          width: 100%;
          max-width: 840px;
          padding: 20px;
          background-color: #2c3e50;
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
        }
        
        .game-info {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          display: inline-block;
        }
        
        .connected {
          background-color: #2ecc71;
        }
        
        .disconnected {
          background-color: #e74c3c;
        }
        
        @media (max-width: 768px) {
          .game-container {
            padding: 10px;
          }
          
          .game-info {
            flex-direction: column;
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
} 