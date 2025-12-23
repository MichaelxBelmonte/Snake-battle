# Snake Battle - Multiplayer Real-Time Game

A modern, real-time multiplayer Snake battle game built with Next.js, Socket.IO, and Supabase. Compete against other players in real-time, collect food and power-ups, customize your snake with unique skins, and climb the leaderboard!

## 🎮 Features

### Core Gameplay
- **Real-time Multiplayer**: Play against multiple players simultaneously with low-latency WebSocket communication
- **Smooth Animations**: Client-side interpolation for fluid 60 FPS gameplay despite 10 FPS server ticks
- **Multiple Food Types**: 
  - Normal food (10 points, 60% spawn rate)
  - Bonus food (25 points, 25% spawn rate)
  - Super food (50 points, 15% spawn rate)
- **Collision System**: Detect collisions with walls, other snakes, and yourself
- **Score System**: Earn points by eating food, with kills and deaths tracking

### Customization
- **10 Unique Snake Skins**: 
  - Classic, Rainbow, Neon, Fire, Ice, Ghost, Electric, Ocean, Candy, Diamond
- **Custom Colors**: Choose your snake's base color
- **Visual Effects**: Glow effects, transparency, and animated color transitions

### Social Features
- **Global Leaderboard**: View top players with Supabase integration
- **Personal Best Tracking**: Track your highest score
- **Player Statistics**: See kills, deaths, and scores for all players

### Technical Features
- **Responsive Design**: Works on desktop and mobile devices
- **Keyboard Controls**: WASD or Arrow keys for movement
- **Optimized Performance**: Cached grid rendering, memoized color calculations
- **Auto-reconnection**: Handles network disconnections gracefully

## 🛠️ Tech Stack

### Frontend
- **Next.js 13**: React framework with server-side rendering
- **React 18**: UI library with hooks
- **HTML5 Canvas**: Game rendering
- **Socket.IO Client**: Real-time communication

### Backend
- **Node.js**: Runtime environment
- **Express**: Web server framework
- **Socket.IO**: WebSocket server for real-time multiplayer
- **CORS**: Cross-origin resource sharing

### Database & Services
- **Supabase**: PostgreSQL database for leaderboard storage
- **Vercel**: Frontend deployment platform
- **Railway**: Backend server hosting (production)

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Supabase account (for leaderboard functionality)
- Railway account (for production server) or local development

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/snake-battle.git
cd snake-battle
```

### 2. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration (for leaderboard)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Server Configuration (optional, defaults to localhost:3001)
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
```

### 4. Supabase Setup

1. Create a new Supabase project
2. Create a `leaderboard` table with the following schema:

```sql
CREATE TABLE leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  snake_color TEXT,
  snake_skin TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC);
```

### 5. Run the Development Server

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - Backend Server:**
```bash
cd server
npm start
# or for development with auto-reload:
npm run dev
```

The game will be available at `http://localhost:3000`

## 🎯 How to Play

1. **Join the Game**: Enter your name, choose a color, and select a snake skin
2. **Move Your Snake**: Use WASD or Arrow keys to control direction
3. **Collect Food**: Eat food to grow and earn points
   - Red food: 10 points (normal)
   - Gold food: 25 points (bonus)
   - Purple food: 50 points (super)
4. **Avoid Collisions**: Don't hit walls, other snakes, or yourself
5. **Compete**: Try to achieve the highest score and climb the leaderboard!

## 🏗️ Project Structure

```
snake-battle/
├── pages/
│   ├── index.js          # Main game component
│   ├── _app.js           # Next.js app wrapper
│   └── api/              # API routes (if needed)
├── server/
│   ├── server.js         # Socket.IO game server
│   └── package.json      # Server dependencies
├── public/               # Static assets
├── css/                  # Stylesheets
├── package.json          # Frontend dependencies
├── next.config.js        # Next.js configuration
└── vercel.json           # Vercel deployment config
```

## 🔧 Configuration

### Game Constants (server/server.js)

```javascript
const GRID_SIZE = 20;           // Grid cell size in pixels
const GAME_WIDTH = 800;         // Game board width
const GAME_HEIGHT = 600;        // Game board height
const TICK_RATE = 100;          // Server update rate (ms)
const SNAKE_SPEED = 1;          // Movement per tick
const GROWTH_THRESHOLD = 50;    // Points needed per segment growth
```

### Client Rendering (pages/index.js)

- **Interpolation**: Smooth 60 FPS rendering with 10 FPS server updates
- **Grid Caching**: Pre-rendered grid for performance
- **Color Memoization**: Cached color calculations

## 🚢 Deployment

### Frontend (Vercel)

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically on push

### Backend (Railway)

1. Create a new Railway project
2. Connect your GitHub repository
3. Set the root directory to `/server`
4. Add environment variables (PORT, etc.)
5. Deploy and update `NEXT_PUBLIC_SERVER_URL` in frontend

### Alternative: Self-hosted

You can deploy the server on any Node.js hosting platform (Heroku, DigitalOcean, AWS, etc.)

## 🎨 Customization

### Adding New Snake Skins

Edit the `SNAKE_SKINS` array and `getSegmentStyle` function in `pages/index.js`:

```javascript
const SNAKE_SKINS = [
  // ... existing skins
  { id: 'custom', name: 'Custom', icon: '🎨', description: 'Your custom skin' }
];
```

### Modifying Game Rules

Edit constants in `server/server.js` to change:
- Game speed
- Food spawn rates
- Scoring system
- Collision behavior

## 🐛 Troubleshooting

### Connection Issues
- Ensure the backend server is running on port 3001
- Check CORS settings if accessing from different domains
- Verify Socket.IO connection in browser console

### Leaderboard Not Working
- Verify Supabase credentials in `.env.local`
- Check Supabase table schema matches the required structure
- Ensure RLS (Row Level Security) policies allow inserts/selects

### Performance Issues
- Reduce number of food items in `initFood()` function
- Lower client-side rendering FPS
- Optimize canvas rendering operations

## 📝 License

MIT License - feel free to use this project for learning or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🙏 Acknowledgments

- Built with Next.js and Socket.IO
- Inspired by classic Snake games
- Leaderboard powered by Supabase

---

**Enjoy the game and may the best snake win! 🐍**
