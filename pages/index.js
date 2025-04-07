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
  
  const canvasRef = useRef(null);
  const joystickRef = useRef(null);
  const pusherRef = useRef(null);
  const renderLoopRef = useRef(null);
  const apiLoopRef = useRef(null);
  const directionRef = useRef('right');
  const lastDirectionRef = useRef('right');
  
  // Rileva dispositivo mobile al caricamento
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);
  
  // Inizializza Pusher
  useEffect(() => {
    if (gameStarted) {
      try {
        const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
          cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
        });
        
        const channel = pusher.subscribe('snake-game');
        
        console.log('Iscritto al canale Pusher:', channel.name);
        
        channel.bind('player-joined', (data) => {
          console.log('Evento player-joined ricevuto:', data);
          
          // Aggiorna l'elenco degli altri giocatori
          if (data.newPlayer && data.newPlayer.id !== playerId) {
            setOtherPlayers(prev => {
              // Verifica se il giocatore esiste già
              const exists = prev.some(p => p.id === data.newPlayer.id);
              if (!exists) {
                return [...prev, data.newPlayer];
              }
              return prev;
            });
          }
          
          // Aggiorna gli elementi cibo se necessario
          if (data.foodItems) {
            setFoodItems(data.foodItems);
          }
        });
        
        channel.bind('player-moved', (data) => {
          console.log('Evento player-moved ricevuto:', data);
          
          // Aggiorna la posizione degli altri giocatori
          if (data.playerId !== playerId && data.player) {
            setOtherPlayers(prev => {
              // Trova e aggiorna il giocatore specifico
              const updatedPlayers = prev.map(p => {
                if (p.id === data.playerId) {
                  return data.player;
                }
                return p;
              });
              
              // Se il giocatore non esiste ancora, aggiungilo
              if (!updatedPlayers.some(p => p.id === data.playerId)) {
                return [...updatedPlayers, data.player];
              }
              
              return updatedPlayers;
            });
          }
          
          // Aggiorna gli elementi cibo se necessario
          if (data.foodItems) {
            setFoodItems(data.foodItems);
          }
        });
        
        // Salva il riferimento a Pusher
        pusherRef.current = pusher;
        
        // Cleanup
        return () => {
          console.log('Chiusura connessione Pusher...');
          channel.unbind_all();
          pusher.unsubscribe('snake-game');
          pusher.disconnect();
        };
      } catch (err) {
        console.error('Errore nell\'inizializzazione di Pusher:', err);
        setError('Errore di connessione: ' + err.message);
      }
    }
  }, [gameStarted, playerId]);
  
  // Funzione di movimento locale predittivo (più fluido)
  const moveSnakeLocally = () => {
    if (!playerState || !playerState.snake || playerState.snake.length === 0) return;
    
    const gridSize = 20;
    const head = { ...playerState.snake[0] };
    const canvasWidth = 800; // Canvas più largo
    const canvasHeight = 600;
    
    // Aggiorna la posizione della testa in base alla direzione
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
    
    const newSnake = [head, ...playerState.snake.slice(0, -1)];
    
    // Verifica collisione con altri serpenti
    const hasCollision = checkCollision(head, newSnake, otherPlayers);
    if (hasCollision) {
      // Gestire la collisione (fine del gioco)
      console.log("Collisione rilevata!");
      return;
    }
    
    // Controlla se ha mangiato il cibo
    const eatenFoodIndex = foodItems.findIndex(food => head.x === food.x && head.y === food.y);
    
    if (eatenFoodIndex !== -1) {
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
  
  // Funzione per verificare le collisioni
  const checkCollision = (head, mySnake, others) => {
    // Collisione con se stesso (esclusa la testa)
    for (let i = 1; i < mySnake.length; i++) {
      if (head.x === mySnake[i].x && head.y === mySnake[i].y) {
        return true;
      }
    }
    
    // Collisione con altri serpenti
    for (const player of others) {
      if (!player.snake) continue;
      
      for (const segment of player.snake) {
        if (head.x === segment.x && head.y === segment.y) {
          return true;
        }
      }
    }
    
    return false;
  };
  
  // Loop di aggiornamento API
  const updateWithServer = async () => {
    if (!playerState || !playerId) return;
    
    try {
      const API_BASE_URL = window.location.origin;
      
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
          foodItems // Invia tutti gli elementi cibo
        }),
      });
      
      if (!res.ok) {
        throw new Error(`Errore API: ${res.status}`);
      }
      
      const data = await res.json();
      
      // Aggiorna lo stato locale con i dati dal server
      setPlayerState(data.player);
      if (data.foodItems) {
        setFoodItems(data.foodItems);
      }
      setScore(data.player.score);
      
      // Aggiorna la lista completa degli altri giocatori
      if (data.otherPlayers) {
        setOtherPlayers(data.otherPlayers);
      }
    } catch (err) {
      console.error('Errore di aggiornamento con il server:', err);
      setError('Errore di comunicazione: ' + err.message);
    }
  };
  
  // Gestisce il loop di gioco con rendering separato dalle API
  useEffect(() => {
    if (gameStarted && playerId && playerState) {
      try {
        console.log('Avvio loop di gioco...');
        
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error('Canvas non trovato');
        }
        
        const ctx = canvas.getContext('2d');
        const gridSize = 20;
        
        // Imposta le dimensioni del canvas più grandi
        canvas.width = 800;
        canvas.height = 600;
        
        console.log('Canvas inizializzato:', canvas.width, 'x', canvas.height);
        
        // Funzione principale per disegnare il gioco
        const drawGame = () => {
          // Pulisci lo schermo
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Sfondo gradiente
          const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
          gradient.addColorStop(0, '#121212');
          gradient.addColorStop(1, '#1e3a8a');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Disegna una griglia sottile
          drawGrid();
          
          // Disegna il cibo
          drawFood();
          
          // Disegna gli altri serpenti
          otherPlayers.forEach(player => {
            if (player && player.snake) {
              drawSnake(player.snake, player.color, player.name);
            }
          });
          
          // Disegna il serpente del giocatore
          if (playerState && playerState.snake) {
            drawSnake(playerState.snake, playerColor, playerName);
          }
          
          // Disegna le informazioni di gioco
          drawScore();
        };
        
        // Disegna una griglia sottile
        const drawGrid = () => {
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
        };
        
        // Funzione per disegnare il serpente
        const drawSnake = (snake, color, playerName) => {
          if (!snake || !snake.length) return;
          
          // Determina la direzione della testa
          let direction = 'right';
          if (snake.length > 1) {
            if (snake[0].x < snake[1].x) direction = 'left';
            else if (snake[0].x > snake[1].x) direction = 'right';
            else if (snake[0].y < snake[1].y) direction = 'up';
            else if (snake[0].y > snake[1].y) direction = 'down';
          }
          
          // Disegna il nome del giocatore sopra la testa del serpente
          ctx.fillStyle = 'white';
          ctx.font = '12px Poppins, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(playerName || 'Giocatore', snake[0].x + gridSize / 2, snake[0].y - 5);
          
          // Disegna ogni segmento del serpente
          snake.forEach((segment, index) => {
            const isHead = index === 0;
            
            // Colore base e colore più scuro per effetto 3D
            const baseColor = color;
            const darkColor = darkenColor(baseColor, 20);
            
            // Raggio per i cerchi
            const radius = isHead ? gridSize / 2 : gridSize / 2 - 1;
            
            // Disegna il corpo come cerchi
            ctx.fillStyle = baseColor;
            ctx.beginPath();
            ctx.arc(
              segment.x + gridSize / 2, 
              segment.y + gridSize / 2, 
              radius, 
              0, 
              Math.PI * 2
            );
            ctx.fill();
            
            // Effetto luminoso
            const grd = ctx.createRadialGradient(
              segment.x + gridSize / 2 - 3, 
              segment.y + gridSize / 2 - 3, 
              0, 
              segment.x + gridSize / 2,
              segment.y + gridSize / 2,
              radius
            );
            grd.addColorStop(0, adjustOpacity(baseColor, 0.7));
            grd.addColorStop(1, adjustOpacity(darkColor, 0.1));
            
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(
              segment.x + gridSize / 2, 
              segment.y + gridSize / 2, 
              radius, 
              0, 
              Math.PI * 2
            );
            ctx.fill();
            
            // Disegna gli occhi se è la testa
            if (isHead) {
              ctx.fillStyle = 'white';
              
              // Posizione degli occhi in base alla direzione
              let eyeX1, eyeY1, eyeX2, eyeY2;
              
              switch (direction) {
                case 'up':
                  eyeX1 = segment.x + gridSize / 3;
                  eyeY1 = segment.y + gridSize / 3;
                  eyeX2 = segment.x + gridSize * 2 / 3;
                  eyeY2 = segment.y + gridSize / 3;
                  break;
                case 'down':
                  eyeX1 = segment.x + gridSize / 3;
                  eyeY1 = segment.y + gridSize * 2 / 3;
                  eyeX2 = segment.x + gridSize * 2 / 3;
                  eyeY2 = segment.y + gridSize * 2 / 3;
                  break;
                case 'left':
                  eyeX1 = segment.x + gridSize / 3;
                  eyeY1 = segment.y + gridSize / 3;
                  eyeX2 = segment.x + gridSize / 3;
                  eyeY2 = segment.y + gridSize * 2 / 3;
                  break;
                case 'right':
                  eyeX1 = segment.x + gridSize * 2 / 3;
                  eyeY1 = segment.y + gridSize / 3;
                  eyeX2 = segment.x + gridSize * 2 / 3;
                  eyeY2 = segment.y + gridSize * 2 / 3;
                  break;
              }
              
              // Occhi
              ctx.beginPath();
              ctx.arc(eyeX1, eyeY1, 2, 0, Math.PI * 2);
              ctx.arc(eyeX2, eyeY2, 2, 0, Math.PI * 2);
              ctx.fill();
              
              // Pupille
              ctx.fillStyle = 'black';
              ctx.beginPath();
              ctx.arc(eyeX1, eyeY1, 1, 0, Math.PI * 2);
              ctx.arc(eyeX2, eyeY2, 1, 0, Math.PI * 2);
              ctx.fill();
            }
          });
        };
        
        // Funzione per disegnare il cibo con animazione
        const drawFood = () => {
          // Aggiorna l'animazione del cibo
          setFoodAnimation(prev => (prev + 0.05) % (Math.PI * 2));
          
          // Disegna tutti gli elementi cibo
          foodItems.forEach(food => {
            // Disegna una mela invece di un quadrato
            ctx.fillStyle = '#e73c3e';
            ctx.beginPath();
            
            // Dimensione oscillante per l'animazione
            const size = gridSize/2 + Math.sin(foodAnimation) * 2;
            
            ctx.arc(
              food.x + gridSize/2, 
              food.y + gridSize/2, 
              size, 
              0, 
              Math.PI * 2
            );
            ctx.fill();
            
            // Picciolo
            ctx.fillStyle = '#7d4e11';
            ctx.fillRect(
              food.x + gridSize/2 - 1, 
              food.y + 2, 
              2, 
              5
            );
            
            // Foglia
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.ellipse(
              food.x + gridSize/2 + 3, 
              food.y + 4, 
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
              food.x + gridSize/3, 
              food.y + gridSize/3, 
              gridSize/6, 
              0, 
              Math.PI * 2
            );
            ctx.fill();
          });
        };
        
        // Funzione per disegnare il punteggio
        const drawScore = () => {
          ctx.fillStyle = 'white';
          ctx.font = 'bold 16px Poppins, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`Punteggio: ${score}`, 10, 25);
          
          ctx.textAlign = 'right';
          ctx.fillText(`Giocatori: ${otherPlayers.length + 1}`, canvas.width - 10, 25);
        };
        
        // Esegui drawGame una volta subito all'inizio
        drawGame();
        
        // Loop di rendering a velocità ridotta
        renderLoopRef.current = setInterval(() => {
          moveSnakeLocally(); // Movimento locale predittivo
          drawGame();
        }, 1000 / 10); // ~10 FPS per il movimento locale (più lento)
        
        // Loop delle API
        apiLoopRef.current = setInterval(() => {
          updateWithServer();
        }, 600); // Aggiorna con il server ogni 600ms (più lento)
        
        return () => {
          console.log('Termine loop di gioco...');
          clearInterval(renderLoopRef.current);
          clearInterval(apiLoopRef.current);
        };
      } catch (err) {
        console.error('Errore nel loop di gioco:', err);
        setError('Errore di gioco: ' + err.message);
      }
    }
  }, [gameStarted, playerId, playerState, otherPlayers]);
  
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
  
  // Gestione dei touch per dispositivi mobili
  useEffect(() => {
    if (!isMobile || !gameStarted) return;
    
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
      
      // Determina la direzione del movimento in base al gesto swipe
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
      
      // Resetta le coordinate iniziali per il prossimo movimento
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    
    const handleTouchEnd = () => {
      startX = 0;
      startY = 0;
    };
    
    // Gestione del joystick virtuale
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
    
    // Aggiungi i listener di eventi per swipe e setup joystick
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Setup joystick dopo un piccolo ritardo per garantire che il DOM sia pronto
    setTimeout(setupJoystick, 500);
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, gameStarted]);
  
  const handleStartGame = async (e) => {
    e.preventDefault();
    console.clear();  // Pulisci la console per avere log puliti
    console.log('Tentativo di avvio gioco...');
    
    try {
      console.log('Invio richiesta join...');
      
      const apiUrl = `${API_BASE_URL}/api/join`;
      console.log('URL API join:', apiUrl);
      
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerName: playerName,
          playerColor: playerColor
        }),
      });
      
      console.log('Risposta ricevuta:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Errore API:', res.status, errorText);
        throw new Error(`Errore API: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Dati ricevuti:', data);
      
      // Imposta lo stato iniziale dal server
      setPlayerId(data.player.id);
      setPlayerState(data.player);
      if (data.foodItems) {
        setFoodItems(data.foodItems);
      } else if (data.food) {
        // Retrocompatibilità con il vecchio formato
        setFoodItems([data.food]);
      }
      setScore(data.player.score);
      
      // Imposta gli altri giocatori
      if (data.otherPlayers) {
        setOtherPlayers(data.otherPlayers);
      }
      
      setGameStarted(true);
      setError('');
      
      console.log('Gioco avviato con successo');
    } catch (err) {
      console.error('Errore durante l\'avvio del gioco:', err);
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
            <div className="stats">
              <div className="score">Punteggio: <span>{score}</span></div>
              <div className="player-count">Giocatori online: <span>{otherPlayers.length + 1}</span></div>
            </div>
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
      
      <style jsx>{`
        .container {
          max-width: 850px;
          margin: 0 auto;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
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
        }
        
        canvas {
          width: 800px;
          height: 600px;
          max-width: 100%;
          object-fit: contain;
        }
        
        .controls-container {
          width: 100%;
          display: flex;
          justify-content: center;
          margin-top: 1rem;
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 15px;
          padding: 15px;
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
          text-align: center;
          margin-top: 0.5rem;
        }
        
        /* Media query per dispositivi mobili */
        @media (max-width: 768px) {
          .container {
            padding: 1rem;
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