# Snake Battle Multiplayer

Un gioco Snake multiplayer in tempo reale utilizzando Pusher e Vercel.

## Caratteristiche

- Gioco multiplayer in tempo reale
- Power-up speciali (velocità e dimensione)
- Classifica dei giocatori
- Interfaccia utente moderna e reattiva

## Tecnologie utilizzate

- Node.js
- Express
- Pusher per la comunicazione in tempo reale
- Vercel per il deployment
- HTML5 Canvas per il rendering del gioco

## Configurazione

1. Clona il repository
2. Installa le dipendenze con `npm install`
3. Crea un file `.env` con le seguenti variabili:
   ```
   PUSHER_APP_ID=your_app_id
   PUSHER_KEY=your_key
   PUSHER_SECRET=your_secret
   PUSHER_CLUSTER=your_cluster
   ```
4. Avvia il server di sviluppo con `npm run dev`

## Come giocare

1. Apri il gioco nel browser
2. Inserisci il tuo nome e scegli un colore
3. Usa le frecce direzionali o WASD per muoverti
4. Raccogli il cibo per crescere
5. Evita le collisioni con altri serpenti
6. Raccogli power-up per vantaggi speciali

## Deployment

Il gioco è configurato per essere deployato su Vercel. Basta pushare le modifiche sul repository e Vercel si occuperà del deployment automatico.

## Licenza

MIT 