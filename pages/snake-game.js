import React, { useState, useEffect, useRef } from 'react';

export default function SnakeGame() {
  // Stato di base
  const [snake, setSnake] = useState([{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}]);
  const [food, setFood] = useState({x: 15, y: 15});
  const [direction, setDirection] = useState('right');
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Riferimenti
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  
  // Controlla se è mobile
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMobile(window.innerWidth < 768);
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  
  // Funzione per avviare il gioco
  const startGame = () => {
    setSnake([{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}]);
    setFood({x: 15, y: 15});
    setDirection('right');
    setScore(0);
    setGameOver(false);
    setGameStarted(true);
  };
  
  // Input da tastiera
  useEffect(() => {
    if (!gameStarted) return;
    
    const handleKeyDown = (e) => {
      switch(e.key) {
        case 'ArrowUp': if (direction !== 'down') setDirection('up'); break;
        case 'ArrowDown': if (direction !== 'up') setDirection('down'); break;
        case 'ArrowLeft': if (direction !== 'right') setDirection('left'); break;
        case 'ArrowRight': if (direction !== 'left') setDirection('right'); break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStarted, direction]);
  
  // Loop principale del gioco
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    
    const gameInterval = setInterval(() => {
      setSnake(prevSnake => {
        const head = {...prevSnake[0]};
        
        // Muovi la testa
        switch (direction) {
          case 'up': head.y -= 1; break;
          case 'down': head.y += 1; break;
          case 'left': head.x -= 1; break;
          case 'right': head.x += 1; break;
        }
        
        // Controlla collisione con i bordi
        if (head.x < 0 || head.x > 19 || head.y < 0 || head.y > 19) {
          setGameOver(true);
          return prevSnake;
        }
        
        // Controlla collisione con se stesso
        if (prevSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
          setGameOver(true);
          return prevSnake;
        }
        
        // Crea nuovo serpente
        const newSnake = [head, ...prevSnake];
        
        // Controlla se ha mangiato
        if (head.x === food.x && head.y === food.y) {
          setScore(prev => prev + 10);
          
          // Genera nuovo cibo
          const newFood = {
            x: Math.floor(Math.random() * 20),
            y: Math.floor(Math.random() * 20)
          };
          setFood(newFood);
        } else {
          // Rimuovi l'ultimo segmento
          newSnake.pop();
        }
        
        return newSnake;
      });
    }, 200);
    
    gameLoopRef.current = gameInterval;
    
    return () => clearInterval(gameInterval);
  }, [gameStarted, gameOver, direction, food]);
  
  // Rendering del gioco
  useEffect(() => {
    if (!canvasRef.current || !gameStarted) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const gridSize = 20;
    
    // Pulisci canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Disegna serpente
    snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? '#00ff00' : '#009900';
      ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 1, gridSize - 1);
    });
    
    // Disegna cibo
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 1, gridSize - 1);
    
    // Disegna punteggio
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText(`Punteggio: ${score}`, 10, 25);
    
    // Disegna Game Over
    if (gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '30px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', canvas.width/2, canvas.height/2);
      ctx.font = '20px Arial';
      ctx.fillText(`Punteggio: ${score}`, canvas.width/2, canvas.height/2 + 40);
    }
  }, [snake, food, score, gameOver, gameStarted]);
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '20px',
      backgroundColor: '#282c34',
      color: '#fff',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{color: '#61dafb', marginBottom: '20px'}}>Snake Game</h1>
      
      {!gameStarted ? (
        <div style={{
          backgroundColor: '#333',
          padding: '20px',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <p>Premi il pulsante per iniziare a giocare!</p>
          <button 
            onClick={startGame}
            style={{
              backgroundColor: '#4caf50',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Inizia Gioco
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            style={{
              border: '4px solid #333',
              borderRadius: '8px'
            }}
          />
          
          {isMobile && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: '20px'
            }}>
              <button 
                onClick={() => direction !== 'down' && setDirection('up')}
                style={{
                  width: '60px',
                  height: '60px',
                  margin: '5px',
                  fontSize: '24px'
                }}
              >↑</button>
              <div style={{display: 'flex'}}>
                <button 
                  onClick={() => direction !== 'right' && setDirection('left')}
                  style={{
                    width: '60px',
                    height: '60px',
                    margin: '5px',
                    fontSize: '24px'
                  }}
                >←</button>
                <button 
                  onClick={() => direction !== 'left' && setDirection('right')}
                  style={{
                    width: '60px',
                    height: '60px',
                    margin: '5px',
                    fontSize: '24px'
                  }}
                >→</button>
              </div>
              <button 
                onClick={() => direction !== 'up' && setDirection('down')}
                style={{
                  width: '60px',
                  height: '60px',
                  margin: '5px',
                  fontSize: '24px'
                }}
              >↓</button>
            </div>
          )}
          
          {gameOver && (
            <button 
              onClick={startGame}
              style={{
                backgroundColor: '#e74c3c',
                color: 'white',
                padding: '10px 20px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                marginTop: '20px'
              }}
            >
              Riprova
            </button>
          )}
        </div>
      )}
    </div>
  );
}
