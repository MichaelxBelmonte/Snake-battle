import React, { useState, useEffect, useRef } from 'react';

export default function SnakeGame() {
  // Stati di base
  const [snake, setSnake] = useState([{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}]);
  const [food, setFood] = useState({x: 15, y: 15});
  const [direction, setDirection] = useState('right');
  const [score, setScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Riferimenti
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  
  // Controlla se e' mobile
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMobile(window.innerWidth < 768);
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  
  // Input da tastiera
  useEffect(() => {
    if (!gameStarted) return;
    
    const handleKeyPress = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      
      switch (e.key) {
        case 'ArrowUp': if (direction !== 'down') setDirection('up'); break;
        case 'ArrowDown': if (direction !== 'up') setDirection('down'); break;
        case 'ArrowLeft': if (direction !== 'right') setDirection('left'); break;
        case 'ArrowRight': if (direction !== 'left') setDirection('right'); break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameStarted, direction]);
  
  // Movimento
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    
    const moveSnake = () => {
      setSnake(prevSnake => {
        const head = {...prevSnake[0]};
        
        switch (direction) {
          case 'up': head.y -= 1; break;
          case 'down': head.y += 1; break;
          case 'left': head.x -= 1; break;
          case 'right': head.x += 1; break;
        }
        
        // Collisione con i bordi
        if (head.x < 0 || head.x > 19 || head.y < 0 || head.y > 19) {
          setGameOver(true);
          return prevSnake;
        }
        
        // Collisione con se stesso
        if (prevSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
          setGameOver(true);
          return prevSnake;
        }
        
        const newSnake = [head, ...prevSnake];
        
        // Collisione con il cibo
        if (head.x === food.x && head.y === food.y) {
          setScore(prev => prev + 10);
          
          // Nuovo cibo
          const newFood = {
            x: Math.floor(Math.random() * 20),
            y: Math.floor(Math.random() * 20)
          };
          setFood(newFood);
        } else {
          newSnake.pop();
        }
        
        return newSnake;
      });
    };
    
    intervalRef.current = setInterval(moveSnake, 200);
    return () => clearInterval(intervalRef.current);
  }, [gameStarted, gameOver, direction, food]);
  
  // Rendering
  useEffect(() => {
    if (!canvasRef.current || !gameStarted) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const cellSize = 20;
    
    // Pulisci canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Disegna griglia
    ctx.strokeStyle = '#333';
    for (let x = 0; x <= canvas.width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    for (let y = 0; y <= canvas.height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Disegna serpente
    snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? 'limegreen' : 'green';
      ctx.fillRect(segment.x * cellSize, segment.y * cellSize, cellSize - 1, cellSize - 1);
    });
    
    // Disegna cibo
    ctx.fillStyle = 'red';
    ctx.fillRect(food.x * cellSize, food.y * cellSize, cellSize - 1, cellSize - 1);
    
    // Punteggio
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText('Punteggio: ' + score, 10, 30);
    
    // Game over
    if (gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'white';
      ctx.font = '30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', canvas.width/2, canvas.height/2);
      ctx.font = '20px Arial';
      ctx.fillText('Punteggio: ' + score, canvas.width/2, canvas.height/2 + 40);
    }
  }, [snake, food, score, gameOver, gameStarted]);
  
  // Inizia gioco
  const startGame = () => {
    setSnake([{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}]);
    setFood({x: 15, y: 15});
    setDirection('right');
    setScore(0);
    setGameOver(false);
    setGameStarted(true);
  };
  
  return (
    <div style={{
      textAlign: 'center',
      padding: '20px',
      backgroundColor: '#222',
      color: 'white',
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>Snake Game</h1>
      
      {!gameStarted ? (
        <div>
          <p>Premi il pulsante per iniziare il gioco</p>
          <button
            onClick={startGame}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: 'green',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Inizia Gioco
          </button>
        </div>
      ) : (
        <div>
          <canvas
            ref={canvasRef}
            width="400"
            height="400"
            style={{
              border: '2px solid #444',
              marginBottom: '20px'
            }}
          />
          
          {isMobile && (
            <div style={{ marginTop: '20px' }}>
              <div>
                <button 
                  onClick={() => direction !== 'down' && setDirection('up')}
                  style={{
                    width: '50px',
                    height: '50px',
                    margin: '5px',
                    fontSize: '20px'
                  }}
                >
                  Su
                </button>
              </div>
              <div>
                <button 
                  onClick={() => direction !== 'right' && setDirection('left')}
                  style={{
                    width: '50px',
                    height: '50px',
                    margin: '5px',
                    fontSize: '20px'
                  }}
                >
                  Sx
                </button>
                <button 
                  onClick={() => direction !== 'left' && setDirection('right')}
                  style={{
                    width: '50px',
                    height: '50px',
                    margin: '5px',
                    fontSize: '20px'
                  }}
                >
                  Dx
                </button>
              </div>
              <div>
                <button 
                  onClick={() => direction !== 'up' && setDirection('down')}
                  style={{
                    width: '50px',
                    height: '50px',
                    margin: '5px',
                    fontSize: '20px'
                  }}
                >
                  Giu
                </button>
              </div>
            </div>
          )}
          
          {gameOver && (
            <button
              onClick={startGame}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: 'red',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                marginTop: '20px'
              }}
            >
              Gioca ancora
            </button>
          )}
        </div>
      )}
    </div>
  );
}
