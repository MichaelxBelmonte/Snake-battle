import React, { useState, useEffect, useRef } from 'react';

export default function SnakeGame() {
  // Stati di base del gioco
  const [snake, setSnake] = useState([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ]);
  const [food, setFood] = useState({ x: 15, y: 15 });
  const [direction, setDirection] = useState('right');
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#4CAF50');
  
  // Riferimenti
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  
  // Rileva se è un dispositivo mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Inizializza il gioco
  const startGame = (e) => {
    if (e) e.preventDefault();
    
    if (!playerName) {
      alert('Inserisci il tuo nome per iniziare');
      return;
    }
    
    // Imposta stato iniziale
    setSnake([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ]);
    setDirection('right');
    setGameOver(false);
    setScore(0);
    generateFood();
    setGameStarted(true);
  };
  
  // Genera cibo in posizione casuale
  const generateFood = () => {
    const gridSize = 20;
    const maxX = Math.floor((canvasRef.current?.width || 400) / gridSize) - 1;
    const maxY = Math.floor((canvasRef.current?.height || 400) / gridSize) - 1;
    
    // Posizione casuale che non sia occupata dal serpente
    let newFood;
    let isOnSnake;
    
    do {
      newFood = {
        x: Math.floor(Math.random() * maxX),
        y: Math.floor(Math.random() * maxY)
      };
      
      isOnSnake = snake.some(segment => 
        segment.x === newFood.x && segment.y === newFood.y
      );
    } while (isOnSnake);
    
    setFood(newFood);
  };
  
  // Gestisci input da tastiera
  useEffect(() => {
    if (!gameStarted) return;
    
    const handleKeyDown = (e) => {
      e.preventDefault();
      
      switch (e.key) {
        case 'ArrowUp':
          if (direction !== 'down') setDirection('up');
          break;
        case 'ArrowDown':
          if (direction !== 'up') setDirection('down');
          break;
        case 'ArrowLeft':
          if (direction !== 'right') setDirection('left');
          break;
        case 'ArrowRight':
          if (direction !== 'left') setDirection('right');
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStarted, direction]);
  
  // Loop principale del gioco
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    
    const moveSnake = () => {
      setSnake(prevSnake => {
        // Crea una copia del serpente
        const newSnake = [...prevSnake];
        const head = { ...newSnake[0] };
        
        // Muovi la testa nella direzione corrente
        switch (direction) {
          case 'up':
            head.y -= 1;
            break;
          case 'down':
            head.y += 1;
            break;
          case 'left':
            head.x -= 1;
            break;
          case 'right':
            head.x += 1;
            break;
        }
        
        // Controlla collisione con i bordi
        const gridSize = 20;
        const maxX = Math.floor((canvasRef.current?.width || 400) / gridSize) - 1;
        const maxY = Math.floor((canvasRef.current?.height || 400) / gridSize) - 1;
        
        if (head.x < 0 || head.x > maxX || head.y < 0 || head.y > maxY) {
          setGameOver(true);
          return prevSnake;
        }
        
        // Controlla collisione con se stesso
        if (newSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
          setGameOver(true);
          return prevSnake;
        }
        
        // Aggiungi la nuova testa
        newSnake.unshift(head);
        
        // Controlla se ha mangiato il cibo
        if (head.x === food.x && head.y === food.y) {
          setScore(prevScore => prevScore + 10);
          generateFood();
        } else {
          // Rimuovi l'ultimo segmento se non ha mangiato
          newSnake.pop();
        }
        
        return newSnake;
      });
    };
    
    // Imposta l'intervallo di movimento
    const gameLoop = setInterval(moveSnake, 200);
    gameLoopRef.current = gameLoop;
    
    // Pulisci l'intervallo quando il componente viene smontato
    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameStarted, gameOver, direction, food]);
  
  // Funzione per scurire un colore
  const darkenColor = (color, percent) => {
    // Converte il colore in RGB
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    
    // Applica l'oscuramento
    const dr = Math.floor(r * (100 - percent) / 100);
    const dg = Math.floor(g * (100 - percent) / 100);
    const db = Math.floor(b * (100 - percent) / 100);
    
    // Converte in esadecimale
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
  };
  
  // Rendering del canvas
  useEffect(() => {
    if (!canvasRef.current || !gameStarted) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const gridSize = 20;
    
    // Pulisci il canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Disegna la griglia
    ctx.strokeStyle = '#222';
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
    ctx.fillStyle = '#FF4136';
    ctx.fillRect(
      food.x * gridSize,
      food.y * gridSize,
      gridSize,
      gridSize
    );
    
    // Disegna il serpente
    snake.forEach((segment, index) => {
      // La testa ha un colore leggermente diverso
      if (index === 0) {
        ctx.fillStyle = playerColor;
      } else {
        // Usa una funzione più semplice per il colore del corpo
        ctx.fillStyle = darkenColor(playerColor, index * 5);
      }
      
      ctx.fillRect(
        segment.x * gridSize,
        segment.y * gridSize,
        gridSize - 1,
        gridSize - 1
      );
    });
    
    // Disegna il punteggio
    ctx.fillStyle = '#FFF';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Punteggio: ${score}`, 10, 30);
    
    // Mostra game over
    if (gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#FFF';
      ctx.font = '30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
      ctx.font = '20px Arial';
      ctx.fillText(`Punteggio finale: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
    }
  }, [snake, food, gameOver, score, gameStarted, playerColor]);
  
  return (
    <div className="container">
      <h1>Snake Game</h1>
      
      {!gameStarted ? (
        <div className="login-form">
          <form onSubmit={startGame}>
            <div className="form-group">
              <label htmlFor="name">Nome:</label>
              <input
                type="text"
                id="name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
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
            
            <button type="submit">Inizia Gioco</button>
          </form>
        </div>
      ) : (
        <div className="game-container">
          <canvas
            ref={canvasRef}
            width="400"
            height="400"
            style={{
              border: '4px solid #333',
              borderRadius: '8px'
            }}
          />
          
          {isMobile && (
            <div className="mobile-controls">
              <button onClick={() => direction !== 'down' && setDirection('up')}>↑</button>
              <div className="horizontal-controls">
                <button onClick={() => direction !== 'right' && setDirection('left')}>←</button>
                <button onClick={() => direction !== 'left' && setDirection('right')}>→</button>
              </div>
              <button onClick={() => direction !== 'up' && setDirection('down')}>↓</button>
            </div>
          )}
          
          {gameOver && (
            <button className="restart-button" onClick={() => startGame()}>
              Gioca Ancora
            </button>
          )}
        </div>
      )}
      
      <style jsx>{`
        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          font-family: Arial, sans-serif;
          min-height: 100vh;
          background-color: #282c34;
          color: white;
        }
        
        h1 {
          margin-bottom: 20px;
          color: #61dafb;
        }
        
        .login-form {
          background-color: #333;
          padding: 20px;
          border-radius: 8px;
          width: 100%;
          max-width: 400px;
        }
        
        .form-group {
          margin-bottom: 15px;
          display: flex;
          flex-direction: column;
        }
        
        label {
          margin-bottom: 5px;
        }
        
        input {
          padding: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          background-color: #222;
          color: white;
        }
        
        button {
          background-color: #4CAF50;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.3s;
        }
        
        button:hover {
          background-color: #45a049;
        }
        
        .game-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        
        .mobile-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-top: 20px;
        }
        
        .mobile-controls button {
          width: 60px;
          height: 60px;
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .horizontal-controls {
          display: flex;
          gap: 20px;
        }
        
        .restart-button {
          margin-top: 20px;
          background-color: #e74c3c;
        }
        
        .restart-button:hover {
          background-color: #c0392b;
        }
      `}</style>
    </div>
  );
}
