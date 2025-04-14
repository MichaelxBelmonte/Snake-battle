import React, { useState, useEffect, useRef } from 'react';

// Funzione per rendere un colore più scuro
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

export default function SnakeGame() {
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#4CAF50');
  const [gameStarted, setGameStarted] = useState(false);
  const [error, setError] = useState('');
  
  // Stati fondamentali ridotti al minimo
  const [snake, setSnake] = useState([
    { x: 100, y: 100 },
    { x: 80, y: 100 },
    { x: 60, y: 100 }
  ]);
  const [food, setFood] = useState([{ x: 300, y: 300 }]);
  const [direction, setDirection] = useState('right');
  const [score, setScore] = useState(0);
  
  // Riferimenti essenziali
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const gridSize = 20; // Dimensione della cella costante
  
  // Rilevamento mobile semplificato
  const [isMobile, setIsMobile] = useState(false);
  
  // Rileva dispositivo mobile all'avvio
  useEffect(() => {
    const checkMobile = () => {
      return (typeof window !== "undefined" && window.innerWidth < 768);
    };
    
    setIsMobile(checkMobile());
    
    const handleResize = () => {
      setIsMobile(checkMobile());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Gestione input da tastiera - semplificata
  useEffect(() => {
    if (!gameStarted) return;
    
    console.log('Inizializzazione controlli tastiera');
    
    const handleKeyPress = (e) => {
      // Previeni lo scroll della pagina con le frecce
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      
      switch (e.key) {
        case 'ArrowUp':
          if (direction !== 'down') {
            setDirection('up');
          }
          break;
        case 'ArrowDown':
          if (direction !== 'up') {
            setDirection('down');
          }
          break;
        case 'ArrowLeft':
          if (direction !== 'right') {
            setDirection('left');
          }
          break;
        case 'ArrowRight':
          if (direction !== 'left') {
            setDirection('right');
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameStarted, direction]);
  
  // Logica di movimento basilare
  useEffect(() => {
    if (!gameStarted) return;
    
    // Funzione di movimento
    const moveSnake = () => {
      setSnake(prevSnake => {
        // Clona il serpente attuale
        const newSnake = [...prevSnake];
        const head = { ...newSnake[0] };
        
        // Calcola la nuova posizione della testa
        switch (direction) {
          case 'up':
            head.y -= gridSize;
            if (head.y < 0) head.y = 580;
            break;
          case 'down':
            head.y += gridSize;
            if (head.y >= 600) head.y = 0;
            break;
          case 'left':
            head.x -= gridSize;
            if (head.x < 0) head.x = 780;
            break;
          case 'right':
            head.x += gridSize;
            if (head.x >= 800) head.x = 0;
            break;
        }
        
        // Inserisci la nuova testa all'inizio dell'array
        newSnake.unshift(head);
        
        // Controlla collisione con il cibo
        let ate = false;
        food.forEach((foodItem, index) => {
          if (head.x === foodItem.x && head.y === foodItem.y) {
            ate = true;
            setScore(prevScore => prevScore + 10);
            
            // Genera nuovo cibo
            setFood(prevFood => {
              const newFood = [...prevFood];
              newFood[index] = {
                x: Math.floor(Math.random() * (800 / gridSize)) * gridSize,
                y: Math.floor(Math.random() * (600 / gridSize)) * gridSize
              };
              return newFood;
            });
          }
        });
        
        // Se non ha mangiato, rimuovi l'ultimo segmento
        if (!ate) {
          newSnake.pop();
        }
        
        return newSnake;
      });
    };
    
    // Imposta un intervallo per il movimento
    const gameInterval = setInterval(moveSnake, 200);
    gameLoopRef.current = gameInterval;
    
    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameStarted, direction, food]);
  
  // Rendering basilare
  useEffect(() => {
    if (!gameStarted || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const draw = () => {
      // Pulisci il canvas
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Disegna la griglia
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      
      // Griglia orizzontale
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      
      // Griglia verticale
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      // Disegna il serpente
      snake.forEach((segment, index) => {
        // La testa è di colore diverso
        if (index === 0) {
          ctx.fillStyle = '#FFFFFF'; // Bianco per il contorno
          ctx.fillRect(segment.x - 2, segment.y - 2, gridSize + 4, gridSize + 4);
          ctx.fillStyle = playerColor; // Colore giocatore
        } else {
          ctx.fillStyle = darkenColor(playerColor, index * 5);
        }
        
        ctx.fillRect(segment.x, segment.y, gridSize - 1, gridSize - 1);
        
        // Disegna gli occhi sulla testa
        if (index === 0) {
          ctx.fillStyle = '#000000';
          
          // Posizione occhi in base alla direzione
          let eyeX1, eyeY1, eyeX2, eyeY2;
          
          switch (direction) {
            case 'up':
              eyeX1 = segment.x + gridSize * 0.25;
              eyeY1 = segment.y + gridSize * 0.25;
              eyeX2 = segment.x + gridSize * 0.75;
              eyeY2 = segment.y + gridSize * 0.25;
              break;
            case 'down':
              eyeX1 = segment.x + gridSize * 0.25;
              eyeY1 = segment.y + gridSize * 0.75;
              eyeX2 = segment.x + gridSize * 0.75;
              eyeY2 = segment.y + gridSize * 0.75;
              break;
            case 'left':
              eyeX1 = segment.x + gridSize * 0.25;
              eyeY1 = segment.y + gridSize * 0.25;
              eyeX2 = segment.x + gridSize * 0.25;
              eyeY2 = segment.y + gridSize * 0.75;
              break;
            case 'right':
              eyeX1 = segment.x + gridSize * 0.75;
              eyeY1 = segment.y + gridSize * 0.25;
              eyeX2 = segment.x + gridSize * 0.75;
              eyeY2 = segment.y + gridSize * 0.75;
              break;
          }
          
          ctx.beginPath();
          ctx.arc(eyeX1, eyeY1, 3, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(eyeX2, eyeY2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      
      // Disegna il cibo
      ctx.fillStyle = '#FF6347';
      food.forEach(foodItem => {
        ctx.beginPath();
        ctx.arc(
          foodItem.x + gridSize / 2,
          foodItem.y + gridSize / 2,
          gridSize / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        // Riflesso sul cibo
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(
          foodItem.x + gridSize / 3,
          foodItem.y + gridSize / 3,
          gridSize / 6,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        ctx.fillStyle = '#FF6347';
      });
      
      // Disegna il punteggio
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Punteggio: ${score}`, 20, 30);
      
      // Richiedi il prossimo frame
      requestAnimationFrame(draw);
    };
    
    // Avvia il loop di disegno
    const animationId = requestAnimationFrame(draw);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameStarted, snake, food, direction, score, playerColor]);
  
  // Funzione per avviare una nuova partita
  const handleStartGame = (e) => {
    e.preventDefault();
    
    if (!playerName) {
      setError('Inserisci il tuo nome');
      return;
    }
    
    // Imposta le dimensioni del canvas
    if (canvasRef.current) {
      canvasRef.current.width = 800;
      canvasRef.current.height = 600;
    }
    
    // Genera cibo in posizione casuale
    setFood([{
      x: Math.floor(Math.random() * (800 / gridSize)) * gridSize,
      y: Math.floor(Math.random() * (600 / gridSize)) * gridSize
    }]);
    
    // Reimposta il serpente
    setSnake([
      { x: 100, y: 100 },
      { x: 80, y: 100 },
      { x: 60, y: 100 }
    ]);
    
    // Reimposta direzione e punteggio
    setDirection('right');
    setScore(0);
    
    // Avvia il gioco
    setGameStarted(true);
  };
  
  return (
    <div className="container">
      <h1>Snake Game</h1>
      
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
              <li>Usa le frecce direzionali per muovere il serpente</li>
              <li>Raccogli il cibo per crescere e aumentare il punteggio</li>
              <li>Evita di colpire il tuo serpente o i bordi</li>
            </ul>
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
              <div className="control-button up" onClick={() => direction !== 'down' && setDirection('up')}>▲</div>
              <div className="controls-row">
                <div className="control-button left" onClick={() => direction !== 'right' && setDirection('left')}>◄</div>
                <div className="control-button right" onClick={() => direction !== 'left' && setDirection('right')}>►</div>
              </div>
              <div className="control-button down" onClick={() => direction !== 'up' && setDirection('down')}>▼</div>
            </div>
          )}
          
          <button 
            className="restart-button"
            onClick={() => setGameStarted(false)}
          >
            Ricomincia
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
          
          .game-container {
            margin-top: 10px;
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
