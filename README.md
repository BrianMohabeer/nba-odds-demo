# NBA Odds Tracker 🏀

A real-time NBA odds tracking application that displays game odds, championship futures, award odds, and player props from multiple sportsbooks.

## Features ⚡

- **Game Odds**: Live odds for upcoming NBA games from multiple bookmakers
- **Championship Futures**: NBA championship winner odds
- **Award Odds**: MVP, DPOY, ROTY, Sixth Man, and Most Improved Player odds
- **Player Props**: Points, rebounds, assists, and other player performance betting lines
- **Multi-Bookmaker Support**: Compare odds across DraftKings, FanDuel, BetMGM, and more
- **Fast Loading**: Optimized with parallel API requests and caching (~1-5 seconds)
- **Responsive Design**: Works on desktop, tablet, and mobile

## Tech Stack 💻

### Frontend
- React 18
- JavaScript (ES6+)
- CSS3 with animations

### Backend
- Node.js + Express
- Puppeteer (web scraping)
- Cheerio (HTML parsing)
- The Odds API (sports betting data)

## Local Setup 🛠️

### Prerequisites
- Node.js 16+ installed
- npm or yarn
- API keys (see below)

### Get API Keys (Free)

1. **The Odds API**
   - Sign up at https://the-odds-api.com/
   - Free tier: 500 requests/month
   - Used for: Game Odds, Championship, Player Props

2. **SportsGameOdds API** (optional)
   - Sign up at https://sportsgameodds.com/
   - Used for: MVP odds fallback

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd nba-odds-demo
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```

3. **Create `.env` file in backend folder**
   ```bash
   cp .env.example .env
   ```

4. **Add your API keys to `.env`**
   ```
   ODDS_API_KEY=your_odds_api_key_here
   SPORTSGAMEODDS_API_KEY=your_sportsgameodds_api_key_here
   PORT=3001
   ```

5. **Start the backend**
   ```bash
   node server.js
   ```
   Backend runs on http://localhost:3001

6. **Frontend Setup** (new terminal)
   ```bash
   cd frontend
   npm install
   npm start
   ```
   Frontend runs on http://localhost:3000

## Deployment 🚀

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete deployment instructions to:
- **Backend:** Render.com (free)
- **Frontend:** Vercel (free)

## Performance ⚡

- **Page Load:** ~1 second for Game Odds
- **All Tabs Ready:** ~5 seconds (first load)
- **Cached Load:** ~2.5 seconds (with 30-min cache)
- **Player Props:** ~5-6 seconds (on-demand)

### Optimizations
- Parallel API requests
- 30-minute caching for award odds
- Shared Puppeteer browser instance
- Batched player props fetching

## API Usage 📊

### Per Page Load
- Game Odds: 1 API call
- Championship: 1 API call
- Awards: 0 API calls (web scraping)
- **Total: 2 API calls**

### Player Props (optional)
- Only loads when clicked
- 11 API calls per load (1 events + 10 games)

### Monthly Estimate
- Daily visits: ~10 page loads = 20 API calls
- Monthly: ~600 API calls
- **Well within free tier limit of 500/month** (if you skip Player Props occasionally)

## Project Structure 📁

```
nba-odds-demo/
├── backend/
│   ├── server.js           # Express server + API endpoints
│   ├── package.json        # Backend dependencies
│   └── .env                # API keys (not in git)
├── frontend/
│   ├── src/
│   │   └── App.jsx         # Main React component
│   ├── public/
│   └── package.json        # Frontend dependencies
├── .gitignore              # Git ignore rules
├── .env.example            # Example environment variables
├── DEPLOYMENT_GUIDE.md     # Deployment instructions
└── README.md               # This file
```

## Available Endpoints 🔌

### Backend API (http://localhost:3001)

- `GET /health` - Health check
- `GET /api/odds` - Game odds
- `GET /api/championship` - Championship futures
- `GET /api/awards/all` - All award odds (batch)
- `GET /api/awards/mvp` - MVP odds
- `GET /api/awards/dpoy` - Defensive Player of the Year
- `GET /api/awards/roty` - Rookie of the Year
- `GET /api/awards/sixth-man` - Sixth Man of the Year
- `GET /api/awards/mip` - Most Improved Player
- `GET /api/player-props/events` - List NBA events
- `GET /api/player-props/event/:eventId` - Props for specific event

## Team Collaboration 👥

### For New Team Members

1. **Install dependencies:**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
   *(Puppeteer installs automatically - no manual installation needed!)*

2. **Get your own API keys** from the links above

3. **Create `.env` file** with your API keys

4. **Run the app** (see Installation section)

### Making Changes

```bash
# Create a new branch
git checkout -b feature/your-feature

# Make your changes
# Test locally

# Commit and push
git add .
git commit -m "Description of changes"
git push origin feature/your-feature

# Create pull request on GitHub
```

## Troubleshooting 🔧

### Backend won't start
- Check if port 3001 is available
- Verify `.env` file exists with API keys
- Run `npm install` again

### Frontend can't connect to backend
- Make sure backend is running on port 3001
- Check browser console for errors (F12)
- Verify CORS is configured correctly

### Puppeteer errors
- Run: `npm install puppeteer --break-system-packages` (if on Linux)
- Make sure you have Chrome/Chromium installed

### "Too many requests" error
- You've exceeded 500 API calls/month
- Wait for next month or upgrade API plan
- Reduce Player Props usage (costs 11 calls per load)

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License 📄

This project is for educational purposes.

## Credits 👏

- **Data Sources:** The Odds API, Rotowire.com
- **Team:** CS499 Independent Study Group
- **Built with:** React, Node.js, Express, Puppeteer

---

**Made with ❤️ for CS499 Independent Study**
