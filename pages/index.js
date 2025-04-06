import { useState, useEffect } from 'react';
import Pusher from 'pusher-js';

export default function Home() {
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#ff0000');
  const [gameStarted, setGameStarted] = useState(false);
  const [error, setError] = useState('');

  const handleStartGame = async (e) => {
    e.preventDefault();
    
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: playerName,
          color: playerColor
        }),
      });

      if (!res.ok) {
        throw new Error('Errore durante l\'accesso al gioco');
      }

      setGameStarted(true);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <h1>Snake Battle</h1>
      
      {!gameStarted ? (
        <form onSubmit={handleStartGame}>
          <div>
            <label htmlFor="name">Nome:</label>
            <input
              type="text"
              id="name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
            />
          </div>
          
          <div>
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
      ) : (
        <div id="game-container">
          <canvas id="gameCanvas"></canvas>
        </div>
      )}

      <style jsx>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          text-align: center;
        }

        form {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 300px;
          margin: 0 auto;
        }

        form div {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        input {
          margin-left: 10px;
        }

        button {
          padding: 10px 20px;
          background-color: #0070f3;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
        }

        button:hover {
          background-color: #0051a2;
        }

        .error {
          color: red;
        }

        #game-container {
          margin-top: 20px;
        }

        #gameCanvas {
          border: 1px solid #000;
        }
      `}</style>
    </div>
  );
} 