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
  
  // Rileva dispositivo mobile al caricamento
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);
  
  // Loop di gioco con setInterval (più stabile)
  useEffect(() => {
    if (!gameStarted || !playerId || !playerState) return;

    console.log('Avvio loop di gioco con setInterval');
    
    // Piccolo ritardo prima di avviare i loop per garantire che lo stato sia aggiornato
    const startGameLoops = () => {
      // Loop di rendering con requestAnimationFrame per migliori performance
      let lastRenderTime = 0;
      let frameId;
      const fpsLimit = isMobile ? 20 : 30; // Meno FPS su mobile per migliorare performance
      const frameInterval = 1000 / fpsLimit;
      
      const renderLoop = (timestamp) => {
        frameId = requestAnimationFrame(renderLoop);
        const elapsed = timestamp - lastRenderTime;
        
        // Limita gli FPS per migliorare le performance
        if (elapsed < frameInterval) return;
        
        lastRenderTime = timestamp - (elapsed % frameInterval);
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Ridurre la qualità visiva per migliorare le prestazioni su mobile
        if (isMobile) {
          ctx.imageSmoothingEnabled = false; // Disabilita antialiasing per migliorare performance
        }
        
        // Verifica che playerState.snake sia disponibile
        if (!playerState || !playerState.snake || playerState.snake.length === 0) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Dimensione della griglia costante per il rendering
        const gridSize = gridSizeRef.current;
        
        // Sfondo
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#121212');
        gradient.addColorStop(1, '#1e3a8a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Disegna griglia
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.5;
        
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
        
        // Disegna il cibo
        if (foodItems && foodItems.length > 0) {
          foodItems.forEach(food => {
            if (!food) return;
            
            ctx.fillStyle = '#e73c3e'; // Rosso per il cibo
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
        
        // Disegna gli altri serpenti
        if (otherPlayers && otherPlayers.length > 0) {
          console.log(`Rendering ${otherPlayers.length} altri giocatori`);
          
          otherPlayers.forEach(player => {
            // Verifica più rigorosa degli altri giocatori
            if (player && player.id && player.snake && player.snake.length > 0) {
              // Disegna il nome
              ctx.fillStyle = 'white';
              ctx.font = '12px Arial';
              ctx.textAlign = 'center';
              ctx.fillText(player.name || 'Giocatore', player.snake[0].x + gridSize/2, player.snake[0].y - 5);
              
              // Disegna il serpente con contorno più visibile
              player.snake.forEach((segment, i) => {
                if (!segment) return;
                
                // Bordo più grande e visibile
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'white';
                ctx.beginPath();
                ctx.arc(
                  segment.x + gridSize/2,
                  segment.y + gridSize/2,
                  i === 0 ? gridSize/2 + 3 : gridSize/2 + 1,
                  0,
                  Math.PI * 2
                );
                ctx.stroke();
                
                // Colore interno
                ctx.fillStyle = player.color || '#00ff00';
                ctx.beginPath();
                ctx.arc(
                  segment.x + gridSize/2,
                  segment.y + gridSize/2,
                  i === 0 ? gridSize/2 : gridSize/2 - 2,
                  0,
                  Math.PI * 2
                );
                ctx.fill();
              });
            }
          });
        } else if (isMobile) {
          // Debug info su mobile per verificare la visibilità
          console.log('Mobile: nessun altro giocatore da renderizzare');
        }
        
        // Disegna il proprio serpente
        if (playerState && playerState.snake && playerState.snake.length > 0) {
          // Disegna il nome
          ctx.fillStyle = 'white';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(playerName || 'Tu', playerState.snake[0].x + gridSize/2, playerState.snake[0].y - 5);
          
          // Disegna il serpente con colore più luminoso per renderlo più visibile
          playerState.snake.forEach((segment, i) => {
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
            
            // Per la testa, usa un effetto speciale
            if (i === 0) {
              ctx.shadowColor = playerColor;
              ctx.shadowBlur = 10;
            }
            
            ctx.beginPath();
            ctx.arc(
              segment.x + gridSize/2,
              segment.y + gridSize/2,
              i === 0 ? gridSize/2 : gridSize/2 - 2,
              0,
              Math.PI * 2
            );
            ctx.fill();
            
            // Resetta l'effetto shadow
            ctx.shadowBlur = 0;
          });
        }
        
        // Disegna stats
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Punteggio: ${score}`, 10, 25);
        
        ctx.textAlign = 'right';
        ctx.fillText(`Giocatori: ${otherPlayers.length + 1}`, canvas.width - 10, 25);
      };
      
      // Avvia il loop di rendering
      frameId = requestAnimationFrame(renderLoop);
      
      // Loop di movimento locale
      const moveInterval = setInterval(() => {
        if (!playerState || !playerState.snake || playerState.snake.length === 0) return;
        
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
      }, 1000 / 5); // 5 FPS (più lento e stabile)
      
      // Comunicazione col server - più lento per ridurre il carico
      const serverInterval = setInterval(() => {
        updateWithServer();
      }, 1500); // Una volta ogni 1.5 secondi
      
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
  
  // Inizializza Pusher e sottoscrizione agli eventi
  useEffect(() => {
    if (!gameStarted || !playerId) return;
    
    console.log('Inizializzazione Pusher per:', playerId);
    
    try {
      // Resetta lo stato degli other players
      setOtherPlayers([]);
      
      // Inizializza Pusher
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      });
      
      // Sottoscrivi al canale
      const channel = pusher.subscribe('snake-game');
      
      // Gestisci l'evento player-joined
      channel.bind('player-joined', (data) => {
        if (!data) return;
        
        console.log(`Ricevuto aggiornamento nuovo giocatore`);
        
        // Aggiorna il cibo
        if (data.foodItems) {
          setFoodItems(data.foodItems);
        }
        
        // Aggiungi il nuovo giocatore allo stato
        if (data.player && data.player.id !== playerId) {
          console.log('Nuovo giocatore:', data.player.id);
          
          setOtherPlayers(prev => {
            // Usa un Map per una riconciliazione più efficiente
            const playersMap = new Map(prev.map(p => [p.id, p]));
            
            // Verifica se il giocatore ha dati validi
            if (data.player && data.player.snake && data.player.snake.length > 0) {
              playersMap.set(data.player.id, data.player);
            }
            
            // Ritorna l'array aggiornato
            return Array.from(playersMap.values());
          });
        }
        
        // Aggiorna tutti gli altri giocatori quando arrivano i dati completi
        if (data.otherPlayers && Array.isArray(data.otherPlayers)) {
          console.log(`Aggiornamento lista completa: ${data.otherPlayers.length} giocatori`);
          setOtherPlayers(data.otherPlayers);
        }
      });
      
      // Gestisci l'evento player-moved
      channel.bind('player-moved', (data) => {
        if (!data) return;
        
        // Aggiungi logging per debug
        console.log(`Ricevuto aggiornamento giocatore: ${data.playerId}`);
        
        // Aggiorna SEMPRE il cibo, non solo quando c'è un altro giocatore
        if (data.foodItems) {
          setFoodItems(data.foodItems);
        }
        
        // Aggiorna dati altri giocatori anche quando non riconosci l'ID
        if (data.playerId !== playerId) {
          setOtherPlayers(prev => {
            // Usa un Map per una riconciliazione più efficiente
            const playersMap = new Map(prev.map(p => [p.id, p]));
            
            // Verifica se il giocatore ha dati validi
            if (data.player && data.player.snake && data.player.snake.length > 0) {
              playersMap.set(data.playerId, data.player);
            }
            
            // Ritorna l'array aggiornato
            return Array.from(playersMap.values());
          });
        }
        
        // Aggiorna anche tutti gli altri giocatori quando arrivano i dati completi
        if (data.otherPlayers && Array.isArray(data.otherPlayers)) {
          console.log(`Aggiornamento lista completa: ${data.otherPlayers.length} giocatori`);
          setOtherPlayers(data.otherPlayers);
        }
      });
      
      // Memorizza il riferimento a Pusher
      pusherRef.current = pusher;
      
      // Disconnetti al termine
      return () => {
        console.log('Disconnessione Pusher');
        channel.unbind_all();
        channel.unsubscribe();
        pusher.disconnect();
      };
    } catch (error) {
      console.error('Errore inizializzazione Pusher:', error);
      setError('Errore di connessione: ricarica la pagina');
    }
  }, [gameStarted, playerId]);
  
  // Funzione di comunicazione con il server
  const updateWithServer = async () => {
    if (!playerState || !gameStarted || !playerId) return;
    
    try {
      // Uso di AbortController per limitare il tempo di attesa della richiesta
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${API_BASE_URL}/api/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId,
          direction: directionRef.current,
          playerState: {
            ...playerState,
            name: playerName,
            color: playerColor
          }
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
        console.error(`Errore API: ${response?.status || 'Timeout'}`);
        return;
      }
      
      const data = await response.json();
      
      // Aggiorna solo se ci sono dati validi
      if (data && data.player && data.player.snake) {
        // Ottimizzazione: aggiorna solo se ci sono cambiamenti significativi
        const currentSnakeHead = playerState.snake[0];
        const newSnakeHead = data.player.snake[0];
        
        // Calcola se il punteggio è cambiato o se la posizione della testa è cambiata di più di un segmento
        const scoreChanged = data.player.score !== playerState.score;
        const positionChanged = !currentSnakeHead || !newSnakeHead ||
          Math.abs(currentSnakeHead.x - newSnakeHead.x) > gridSizeRef.current ||
          Math.abs(currentSnakeHead.y - newSnakeHead.y) > gridSizeRef.current;
        
        if (scoreChanged || positionChanged) {
          setPlayerState(data.player);
          if (scoreChanged) setScore(data.player.score);
        }
      }
      
      // Aggiorna il cibo solo se è cambiato
      if (data.foodItems && JSON.stringify(data.foodItems) !== JSON.stringify(foodItems)) {
        setFoodItems(data.foodItems);
      }
      
      // Aggiorna gli altri giocatori con un approccio più efficiente
      if (data.otherPlayers) {
        // Usa una funzione di reconciliation per aggiornare solo quello che è cambiato
        setOtherPlayers(prevPlayers => {
          // Mappa per tenere traccia dei giocatori attuali
          const currentPlayers = new Map();
          prevPlayers.forEach(player => {
            if (player && player.id) {
              currentPlayers.set(player.id, player);
            }
          });
          
          // Aggiorna o aggiungi giocatori dalla risposta del server
          data.otherPlayers.forEach(player => {
            if (player && player.id) {
              currentPlayers.set(player.id, player);
            }
          });
          
          // Filtra via i giocatori che non sono più attivi
          const activePlayerIds = new Set(data.otherPlayers.map(p => p.id));
          const result = Array.from(currentPlayers.values())
            .filter(p => activePlayerIds.has(p.id));
          
          return result;
        });
      }
    } catch (error) {
      console.error('Errore comunicazione server:', error);
    }
  };
  
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