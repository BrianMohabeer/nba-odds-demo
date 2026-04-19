import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import * as cheerio from "cheerio"; // IMPORTANT: namespace import
import puppeteer from "puppeteer";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY =
  process.env.ODDS_API_KEY || "4621e9b9af5e0569a4c248fef1a10247";
const SPORTSGAMEODDS_API_KEY =
  process.env.SPORTSGAMEODDS_API_KEY || "f791946d4aef6350eca176a1386771e5";

// Shared Puppeteer browser instance
let sharedBrowser = null;
const browserLock = { inUse: false };

// Cache for scraped award data (30 minute TTL)
const awardCache = {
  dpoy: { data: null, timestamp: 0 },
  roty: { data: null, timestamp: 0 },
  sixthMan: { data: null, timestamp: 0 },
  mip: { data: null, timestamp: 0 },
};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Get or create shared browser
async function getSharedBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await puppeteer.launch({
      headless: "new",
      protocolTimeout: 180000, // 3 minutes for protocol commands
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return sharedBrowser;
}

// Middleware
// CORS configuration - allows requests from localhost and production frontend
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://nba-odds-tracker.vercel.app', // Update with your actual Vercel URL
    ];
    
    // Allow requests with no origin (like mobile apps or Postman) or from Vercel
    if (!origin || allowedOrigins.includes(origin) || (origin && origin.includes('.vercel.app'))) {
      callback(null, true);
    } else {
      callback(null, true); // For development, allow all origins
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "Backend is running!",
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

// =================== MAIN GAME ODDS ===================
app.get("/api/odds", async (req, res) => {
  try {
    const baseUrl =
      "https://api.the-odds-api.com/v4/sports/basketball_nba/odds/";
    const params = new URLSearchParams({
      apiKey: API_KEY,
      regions: "us",
      markets: "h2h",
      oddsFormat: "american",
      dateFormat: "iso",
    });

    const fullUrl = `${baseUrl}?${params}`;

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "NBA-Odds-Tracker/1.0",
      },
    });

    // Log API usage
    console.log("📊 The Odds API Usage (Game Odds):", {
      "requests-remaining": response.headers.get("x-requests-remaining"),
      "requests-used": response.headers.get("x-requests-used"),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error Response:", errorText);

      if (response.status === 401) {
        throw new Error("Invalid API key");
      } else if (response.status === 429) {
        throw new Error("API rate limit exceeded");
      } else if (response.status === 422) {
        throw new Error("Invalid request parameters");
      } else {
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching odds:", err.message);

    res.status(500).json({
      error: "Failed to fetch odds",
      details: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// =================== CHAMPIONSHIP ODDS ===================
app.get("/api/championship", async (req, res) => {
  try {
    const baseUrl =
      "https://api.the-odds-api.com/v4/sports/basketball_nba_championship_winner/odds";
    const params = new URLSearchParams({
      apiKey: API_KEY,
      regions: "us",
      oddsFormat: "american",
      dateFormat: "iso",
    });

    const fullUrl = `${baseUrl}?${params}`;

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "NBA-Odds-Tracker/1.0",
      },
    });

    // Log API usage
    console.log("📊 The Odds API Usage (Championship):", {
      "requests-remaining": response.headers.get("x-requests-remaining"),
      "requests-used": response.headers.get("x-requests-used"),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Championship API Error Response:", errorText);

      if (response.status === 401) {
        throw new Error("Invalid API key");
      } else if (response.status === 429) {
        throw new Error("API rate limit exceeded");
      } else if (response.status === 422) {
        throw new Error("Invalid request parameters");
      } else {
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching championship odds:", err.message);

    res.status(500).json({
      error: "Failed to fetch championship odds",
      details: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});


// =================== SPORTS LIST (DEBUG) ===================
app.get("/api/sports", async (req, res) => {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/?apiKey=${API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Sports API responded with status ${response.status}`);
    }

    const sports = await response.json();

    const basketballSports = sports.filter(
      (sport) =>
        sport.key.includes("basketball") || sport.title.includes("NBA")
    );

    res.json({
      all_sports: sports,
      basketball_sports: basketballSports,
    });
  } catch (err) {
    console.error("Error fetching sports:", err.message);
    res.status(500).json({
      error: "Failed to fetch sports",
      details: err.message,
    });
  }
});

// =================== PLAYER PROPS (THE ODDS API) ===================

// Get list of NBA games/events for player props
app.get("/api/player-props/events", async (req, res) => {
  try {
    const baseUrl = "https://api.the-odds-api.com/v4/sports/basketball_nba/events";
    const params = new URLSearchParams({
      apiKey: API_KEY,
      dateFormat: "iso",
    });

    const fullUrl = `${baseUrl}?${params}`;

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "NBA-Odds-Tracker/1.0",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Events API Error Response:", errorText);
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const events = await response.json();

    // Return simplified event list with IDs for player props
    const simplifiedEvents = events.map(event => ({
      id: event.id,
      sport_key: event.sport_key,
      commence_time: event.commence_time,
      home_team: event.home_team,
      away_team: event.away_team,
    }));

    res.json(simplifiedEvents);
  } catch (err) {
    console.error("❌ Error fetching events:", err.message);
    res.status(500).json({
      error: "Failed to fetch events",
      details: err.message,
    });
  }
});

// Get player props for a specific event
app.get("/api/player-props/event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    // Available player prop markets for NBA
    const playerPropMarkets = [
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes",
      "player_blocks",
      "player_steals",
      "player_turnovers",
      "player_points_rebounds_assists",
      "player_points_rebounds",
      "player_points_assists",
      "player_rebounds_assists"
    ];

    const baseUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds`;
    const params = new URLSearchParams({
      apiKey: API_KEY,
      regions: "us",
      markets: playerPropMarkets.join(","),
      oddsFormat: "american",
      dateFormat: "iso",
    });

    const fullUrl = `${baseUrl}?${params}`;

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "NBA-Odds-Tracker/1.0",
      },
    });

    // Log API usage
    console.log(`📊 The Odds API Usage (Player Props - Event ${eventId}):`, {
      "requests-remaining": response.headers.get("x-requests-remaining"),
      "requests-used": response.headers.get("x-requests-used"),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Player Props API Error Response:", errorText);
      
      if (response.status === 404) {
        throw new Error("Event not found or no player props available");
      }
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching player props:", err.message);
    res.status(500).json({
      error: "Failed to fetch player props",
      details: err.message,
    });
  }
});

// Get specific player prop market for an event
app.get("/api/player-props/event/:eventId/:market", async (req, res) => {
  try {
    const { eventId, market } = req.params;

    const baseUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds`;
    const params = new URLSearchParams({
      apiKey: API_KEY,
      regions: "us",
      markets: market,
      oddsFormat: "american",
      dateFormat: "iso",
    });

    const fullUrl = `${baseUrl}?${params}`;

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "NBA-Odds-Tracker/1.0",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Market API Error Response:", errorText);
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching specific market:", err.message);
    res.status(500).json({
      error: "Failed to fetch market",
      details: err.message,
    });
  }
});

// Get all player props for all current NBA games (WARNING: Uses many API calls)
app.get("/api/player-props/all", async (req, res) => {
  try {
    // First, get all events
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/events?apiKey=${API_KEY}&dateFormat=iso`;
    const eventsResponse = await fetch(eventsUrl);
    
    if (!eventsResponse.ok) {
      throw new Error(`Failed to fetch events: ${eventsResponse.status}`);
    }

    const events = await eventsResponse.json();

    if (events.length === 0) {
      return res.json({ message: "No current NBA games", data: [] });
    }

    // Limit to prevent excessive API usage
    const maxGames = 5;
    const limitedEvents = events.slice(0, maxGames);

    // Fetch player props for each event
    const allPlayerProps = [];
    
    for (const event of limitedEvents) {
      try {
        const propsUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${event.id}/odds?apiKey=${API_KEY}&regions=us&markets=player_points,player_rebounds,player_assists&oddsFormat=american`;
        
        const propsResponse = await fetch(propsUrl);
        
        if (propsResponse.ok) {
          const propsData = await propsResponse.json();
          allPlayerProps.push({
            event_id: event.id,
            home_team: event.home_team,
            away_team: event.away_team,
            commence_time: event.commence_time,
            player_props: propsData,
          });
        }
        
        // Small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        console.error(`Error fetching props for event ${event.id}:`, err.message);
      }
    }

    res.json({
      total_events: events.length,
      fetched_events: allPlayerProps.length,
      limited_to: maxGames,
      data: allPlayerProps,
    });

  } catch (err) {
    console.error("❌ Error fetching all player props:", err.message);
    res.status(500).json({
      error: "Failed to fetch all player props",
      details: err.message,
    });
  }
});

// =================== PLAYER PROPS (SPORTSGAMEODDS API - LEGACY) ===================

// Get all available games with their IDs
app.get("/api/player-props/games", async (req, res) => {
  try {
    const url = `https://api.sportsgameodds.com/v1/events/sport/2?apiKey=${SPORTSGAMEODDS_API_KEY}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`SportsGameOdds API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Return simplified game list with IDs
    const games = data.map(game => ({
      id: game.event_id,
      home_team: game.home_team,
      away_team: game.away_team,
      commence_time: game.start_time,
      league: game.league
    }));
    
    res.json(games);
  } catch (err) {
    console.error("❌ Error fetching player props games:", err.message);
    res.status(500).json({
      error: "Failed to fetch player props games",
      details: err.message,
    });
  }
});

// Get player props for a specific game (SportsGameOdds)
app.get("/api/player-props/game/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const url = `https://api.sportsgameodds.com/v1/events/${eventId}?apiKey=${SPORTSGAMEODDS_API_KEY}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`SportsGameOdds API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract and organize player props
    const playerProps = [];
    
    if (data.odds && data.odds.length > 0) {
      for (const bookmaker of data.odds) {
        if (bookmaker.player_props) {
          for (const prop of bookmaker.player_props) {
            playerProps.push({
              player_name: prop.player_name,
              market: prop.market,
              line: prop.line,
              over_odds: prop.over_odds,
              under_odds: prop.under_odds,
              bookmaker: bookmaker.bookmaker,
            });
          }
        }
      }
    }
    
    res.json({
      event_id: eventId,
      game_info: {
        home_team: data.home_team,
        away_team: data.away_team,
        start_time: data.start_time,
      },
      player_props: playerProps,
    });
  } catch (err) {
    console.error("❌ Error fetching player props for game:", err.message);
    res.status(500).json({
      error: "Failed to fetch player props for game",
      details: err.message,
    });
  }
});

// Get featured player props across all games (SportsGameOdds)
app.get("/api/player-props/featured", async (req, res) => {
  try {
    // First get all games
    const gamesUrl = `https://api.sportsgameodds.com/v1/events/sport/2?apiKey=${SPORTSGAMEODDS_API_KEY}`;
    const gamesResponse = await fetch(gamesUrl);
    
    if (!gamesResponse.ok) {
      throw new Error(`Failed to fetch games: ${gamesResponse.status}`);
    }
    
    const games = await gamesResponse.json();
    
    const featuredProps = [];
    
    // Fetch props for each game (limit to first 10 to avoid rate limits)
    for (const game of games.slice(0, 10)) {
      try {
        const propsUrl = `https://api.sportsgameodds.com/v1/events/${game.event_id}?apiKey=${SPORTSGAMEODDS_API_KEY}`;
        const propsResponse = await fetch(propsUrl);
        
        if (propsResponse.ok) {
          const propsData = await propsResponse.json();
          
          if (propsData.odds && propsData.odds.length > 0) {
            for (const bookmaker of propsData.odds) {
              if (bookmaker.player_props && bookmaker.player_props.length > 0) {
                // Get top 3 props from this bookmaker
                const topProps = bookmaker.player_props.slice(0, 3);
                
                for (const prop of topProps) {
                  featuredProps.push({
                    game: `${game.away_team} @ ${game.home_team}`,
                    player_name: prop.player_name,
                    market: prop.market,
                    line: prop.line,
                    over_odds: prop.over_odds,
                    under_odds: prop.under_odds,
                    bookmaker: bookmaker.bookmaker,
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.log(`Skipping game ${game.event_id}:`, err.message);
      }
    }
    
    res.json(featuredProps);
  } catch (err) {
    console.error("❌ Error fetching featured props:", err.message);
    res.status(500).json({
      error: "Failed to fetch featured props",
      details: err.message,
    });
  }
});

// =============================================================
// ================ ROTOWIRE SCRAPERS ==========================
// =============================================================

// (1) Table-based scraper (used for MVP dedicated page)
async function scrapeRotowireAwardTable(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "Rotowire table response error:",
        response.status,
        text.slice(0, 200)
      );
      throw new Error(`Rotowire responded with status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const table = $("table").first();
    const headers = [];
    table.find("thead tr th").each((i, el) => {
      headers.push($(el).text().trim());
    });

    let dkIndex = headers.findIndex((h) =>
      h.toLowerCase().includes("draftk")
    );
    if (dkIndex === -1) {
      dkIndex = 1;
    }
    const sportsbookName = headers[dkIndex] || "DraftKings";

    const results = [];
    table.find("tbody tr").each((i, row) => {
      const tds = $(row).find("td");
      if (tds.length === 0) return;

      const player = $(tds[0]).text().trim();
      const odds = $(tds[dkIndex] || tds[1] || tds[0]).text().trim();

      if (player && odds) {
        results.push({
          player,
          odds,
          sportsbook: sportsbookName,
        });
      }
    });

    return results.slice(0, 20);
  } catch (err) {
    console.error("Error scraping Rotowire table odds:", err.message);
    return [];
  }
}

// (2) Text-based scraper for the "player-futures" page sections
async function scrapeRotowireFutures(sectionLabel) {
  try {
    const url = "https://www.rotowire.com/betting/nba/player-futures.php";
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "Rotowire futures response error:",
        response.status,
        text.slice(0, 200)
      );
      throw new Error(`Rotowire responded with status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const bodyText = $("body").text().replace(/\r/g, "");
    const normalized = bodyText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");

    const startIndex = normalized.indexOf(sectionLabel);
    if (startIndex === -1) {
      console.error(
        `Section "${sectionLabel}" not found in player-futures page`
      );
      return [];
    }

    // These must match actual headings on the page
    const sectionNames = [
      "MVP",
      "Most Improved Player",
      "Defensive Player",
      "Rookie",
      "Sixth Man",
    ];

    const after = normalized.slice(startIndex);
    let endIndex = after.length;
    for (const name of sectionNames) {
      if (name === sectionLabel) continue;
      const idx = after.indexOf(name);
      if (idx !== -1 && idx < endIndex) {
        endIndex = idx;
      }
    }

    const chunk = after.slice(0, endIndex);
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const results = [];
    let currentPlayer = null;

    for (const line of lines) {
      if (line === sectionLabel || line === "DraftKings") {
        continue;
      }

      // Odds like +600, -150, etc
      if (/^[+-]\d+/.test(line)) {
        if (currentPlayer) {
          results.push({
            player: currentPlayer.replace(/^\*\s*/, "").trim(),
            odds: line,
            sportsbook: "DraftKings",
          });
          currentPlayer = null;
        }
        continue;
      }

      // Lines starting with "* " are often player names
      if (line.startsWith("* ")) {
        currentPlayer = line.replace(/^\*\s*/, "");
        continue;
      }

      // Fallback: short-ish lines that look like names
      if (!currentPlayer && /[A-Za-z]/.test(line) && line.length < 40) {
        currentPlayer = line;
      }
    }

    console.log(
      `Scraped ${results.length} rows for section "${sectionLabel}" from player-futures`
    );
    return results.slice(0, 15);
  } catch (err) {
    console.error(
      `Error scraping Rotowire futures for ${sectionLabel}:`,
      err.message
    );
    return [];
  }
}

// =================== AWARD ROUTES ===================

// MVP – use dedicated MVP page first, then fallback to futures page if needed
app.get("/api/awards/mvp", async (req, res) => {
  const url = "https://www.rotowire.com/betting/nba/mvp-odds.php";

  let data = await scrapeRotowireAwardTable(url);
  if (!data.length) {
    data = await scrapeRotowireFutures("MVP");
  }

  if (!data.length) {
    return res.status(500).json({ error: "Failed to load MVP odds" });
  }

  res.json(data);
});

// Rookie of the Year – Puppeteer scrape of dedicated Rotowire page
app.get("/api/awards/roty", async (req, res) => {
  // Check cache
  const now = Date.now();
  if (awardCache.roty.data && (now - awardCache.roty.timestamp) < CACHE_TTL) {
    return res.json(awardCache.roty.data);
  }

  const url = "https://www.rotowire.com/betting/nba/rookie-odds.php";
  const data = await scrapeRotowireAwardTablePuppeteer(url);
  if (!data.length) {
    return res.status(500).json({ error: "Failed to load ROTY odds" });
  }

  // Update cache
  awardCache.roty = { data, timestamp: now };
  res.json(data);
});

// Sixth Man of the Year – Puppeteer scrape of dedicated Rotowire page
app.get("/api/awards/sixth-man", async (req, res) => {
  // Check cache
  const now = Date.now();
  if (awardCache.sixthMan.data && (now - awardCache.sixthMan.timestamp) < CACHE_TTL) {
    return res.json(awardCache.sixthMan.data);
  }

  const url = "https://www.rotowire.com/betting/nba/sixth-man-odds.php";
  const data = await scrapeRotowireAwardTablePuppeteer(url);
  if (!data.length) {
    return res.status(500).json({ error: "Failed to load Sixth Man odds" });
  }

  // Update cache
  awardCache.sixthMan = { data, timestamp: now };
  res.json(data);
});

// Most Improved Player – Puppeteer scrape of dedicated Rotowire page
app.get("/api/awards/mip", async (req, res) => {
  // Check cache
  const now = Date.now();
  if (awardCache.mip.data && (now - awardCache.mip.timestamp) < CACHE_TTL) {
    return res.json(awardCache.mip.data);
  }

  const url = "https://www.rotowire.com/betting/nba/improved-player-odds.php";
  const data = await scrapeRotowireAwardTablePuppeteer(url);
  if (!data.length) {
    return res.status(500).json({ error: "Failed to load MIP odds" });
  }

  // Update cache
  awardCache.mip = { data, timestamp: now };
  res.json(data);
});

// =================== BATCH AWARDS ENDPOINT (PARALLEL SCRAPING) ===================
// Fetch all awards at once in parallel - MUCH faster!
app.get("/api/awards/all", async (req, res) => {
  console.log('🎯 /api/awards/all endpoint called');
  try {
    const now = Date.now();
    
    // Build response object
    const response = {};
    
    // MVP first (fast cheerio scraper - no RAM issues)
    console.log('📊 Starting MVP scrape...');
    const mvpUrl = "https://www.rotowire.com/betting/nba/mvp-odds.php";
    const mvpData = await scrapeRotowireAwardTable(mvpUrl)
      .then(data => data.length ? data : scrapeRotowireFutures("MVP"));
    response.mvp = mvpData;
    console.log('✅ MVP scraped:', mvpData.length, 'players');
    
    // SEQUENTIAL SCRAPING - One at a time to minimize RAM usage (< 512 MB)
    // This is slower but more reliable on Render's free tier
    
    // DPOY (1 of 4)
    console.log('📊 Starting DPOY scrape (1/4)...');
    if (awardCache.dpoy.data && (now - awardCache.dpoy.timestamp) < CACHE_TTL) {
      response.dpoy = awardCache.dpoy.data;
      console.log('✅ DPOY from cache:', awardCache.dpoy.data.length, 'players');
    } else {
      try {
        const dpoyData = await scrapeRotowireAwardTablePuppeteer("https://www.rotowire.com/betting/nba/defensive-player-odds.php");
        response.dpoy = dpoyData;
        awardCache.dpoy = { data: dpoyData, timestamp: now };
        console.log('✅ DPOY scraped successfully:', dpoyData.length, 'players');
      } catch (err) {
        console.error('❌ DPOY scrape failed:', err.message);
        response.dpoy = [];
      }
    }
    
    // ROTY (2 of 4)
    console.log('📊 Starting ROTY scrape (2/4)...');
    if (awardCache.roty.data && (now - awardCache.roty.timestamp) < CACHE_TTL) {
      response.roty = awardCache.roty.data;
      console.log('✅ ROTY from cache:', awardCache.roty.data.length, 'players');
    } else {
      try {
        const rotyData = await scrapeRotowireAwardTablePuppeteer("https://www.rotowire.com/betting/nba/rookie-odds.php");
        response.roty = rotyData;
        awardCache.roty = { data: rotyData, timestamp: now };
        console.log('✅ ROTY scraped successfully:', rotyData.length, 'players');
      } catch (err) {
        console.error('❌ ROTY scrape failed:', err.message);
        response.roty = [];
      }
    }
    
    // Sixth Man (3 of 4)
    console.log('📊 Starting Sixth Man scrape (3/4)...');
    if (awardCache.sixthMan.data && (now - awardCache.sixthMan.timestamp) < CACHE_TTL) {
      response.sixthMan = awardCache.sixthMan.data;
      console.log('✅ Sixth Man from cache:', awardCache.sixthMan.data.length, 'players');
    } else {
      try {
        const sixthManData = await scrapeRotowireAwardTablePuppeteer("https://www.rotowire.com/betting/nba/sixth-man-odds.php");
        response.sixthMan = sixthManData;
        awardCache.sixthMan = { data: sixthManData, timestamp: now };
        console.log('✅ Sixth Man scraped successfully:', sixthManData.length, 'players');
      } catch (err) {
        console.error('❌ Sixth Man scrape failed:', err.message);
        response.sixthMan = [];
      }
    }
    
    // MIP (4 of 4)
    console.log('📊 Starting MIP scrape (4/4)...');
    if (awardCache.mip.data && (now - awardCache.mip.timestamp) < CACHE_TTL) {
      response.mip = awardCache.mip.data;
      console.log('✅ MIP from cache:', awardCache.mip.data.length, 'players');
    } else {
      try {
        const mipData = await scrapeRotowireAwardTablePuppeteer("https://www.rotowire.com/betting/nba/improved-player-odds.php");
        response.mip = mipData;
        awardCache.mip = { data: mipData, timestamp: now };
        console.log('✅ MIP scraped successfully:', mipData.length, 'players');
      } catch (err) {
        console.error('❌ MIP scrape failed:', err.message);
        response.mip = [];
      }
    }
    
    console.log('🎉 All awards complete, sending response');
    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching all awards:", err.message);
    res.status(500).json({
      error: "Failed to fetch awards",
      details: err.message,
    });
  }
});

// (3) Puppeteer scraper for Rotowire's Webix-rendered award pages
async function scrapeRotowireAwardTablePuppeteer(url) {
  console.log('🔧 scrapeRotowireAwardTablePuppeteer called for:', url);
  try {
    console.log('🔧 Getting shared browser...');
    const browser = await getSharedBrowser();
    console.log('🔧 Browser obtained, creating new page...');
    const page = await browser.newPage();
    console.log('🔧 New page created');
    
    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      );
      await page.setViewport({ width: 2400, height: 900 });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await new Promise(r => setTimeout(r, 5000)); // Wait 5s for Webix to render (Render is slower than localhost)
      
      console.log('🔧 Page loaded, checking for Webix elements...');
      const elementCheck = await page.evaluate(() => {
        const nameElements = document.querySelectorAll("[column='0'] [role='gridcell']").length;
        const headerElements = document.querySelectorAll(".webix_hcell").length;
        return { nameElements, headerElements };
      });
      console.log('🔧 Found elements:', elementCheck);

    const results = await page.evaluate(() => {
      // --- Player names from column 0 ---
      const namesByRow = {};
      document.querySelectorAll("[column='0'] [role='gridcell']").forEach(cell => {
        const rowIndex = cell.getAttribute("aria-rowindex");
        const span = cell.querySelector("span.hide-until-md");
        if (rowIndex && span) namesByRow[rowIndex] = span.textContent.trim();
      });

      // --- Map column attr -> bookmaker name ---
      const skipHeaders = new Set(["name", "best odds", "odds by book", "odds", "$20 bet", ""]);
      const bookColumns = {}; // colAttr -> bookName
      document.querySelectorAll(".webix_hcell").forEach(el => {
        const text = el.textContent.trim();
        if (!text || skipHeaders.has(text.toLowerCase())) return;
        let ancestor = el.parentElement;
        while (ancestor && !ancestor.hasAttribute("column")) {
          ancestor = ancestor.parentElement;
        }
        if (ancestor) {
          const colAttr = ancestor.getAttribute("column");
          if (colAttr && !bookColumns[colAttr]) bookColumns[colAttr] = text;
        }
      });

      // --- Read all bookmaker columns ---
      const oddsGrid = {}; // rowIndex -> { bookName: rawOdds }
      for (const [colAttr, bookName] of Object.entries(bookColumns)) {
        document.querySelectorAll(`[column='${colAttr}'] [role='gridcell']`).forEach(cell => {
          const rowIndex = cell.getAttribute("aria-rowindex");
          const text = cell.textContent.trim();
          if (!rowIndex || !text || text === "-") return;
          if (!oddsGrid[rowIndex]) oddsGrid[rowIndex] = {};
          oddsGrid[rowIndex][bookName] = text;
        });
      }

      // --- Best odds column (column 1) ---
      const bestOddsByRow = {};
      document.querySelectorAll("[column='1'] [role='gridcell']").forEach(cell => {
        const rowIndex = cell.getAttribute("aria-rowindex");
        const text = cell.textContent.trim();
        if (rowIndex && text) bestOddsByRow[rowIndex] = text;
      });

      // --- Merge ---
      const output = [];
      for (const [rowIndex, player] of Object.entries(namesByRow)) {
        const bestRaw = bestOddsByRow[rowIndex];
        if (!player || !bestRaw || bestRaw === "-") continue;

        const odds = bestRaw.startsWith("-") ? bestRaw : `+${bestRaw}`;
        const bookOdds = oddsGrid[rowIndex] || {};

        let sportsbook = null;
        const booksWithOdds = Object.keys(bookOdds);
        if (booksWithOdds.length === 1) {
          sportsbook = booksWithOdds[0];
        } else {
          for (const [book, val] of Object.entries(bookOdds)) {
            if (val === bestRaw) { sportsbook = book; break; }
          }
        }
        if (!sportsbook) sportsbook = booksWithOdds[0] || "Unknown";

        output.push({ player, odds, sportsbook });
      }

      return output;
    });

      return results.slice(0, 20);
    } finally {
      await page.close(); // Close page but keep browser open
    }
  } catch (err) {
    console.error("Puppeteer scrape error:", err.message);
    return [];
  }
}

// Defensive Player of the Year – Puppeteer scrape of dedicated Rotowire page
app.get("/api/awards/dpoy", async (req, res) => {
  // Check cache
  const now = Date.now();
  if (awardCache.dpoy.data && (now - awardCache.dpoy.timestamp) < CACHE_TTL) {
    return res.json(awardCache.dpoy.data);
  }

  const url = "https://www.rotowire.com/betting/nba/defensive-player-odds.php";
  const data = await scrapeRotowireAwardTablePuppeteer(url);
  if (!data.length) {
    return res.status(500).json({ error: "Failed to load DPOY odds" });
  }

  // Update cache
  awardCache.dpoy = { data, timestamp: now };
  res.json(data);
});

// =================== ERROR HANDLER ===================
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
  });
});

// =================== START SERVER ===================
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 NBA Odds Tracker Backend Started!");
  console.log(`📍 Server running on port: ${PORT}`);
  console.log(`🏥 Health check: /health`);
  console.log(`🏀 NBA odds: /api/odds`);
  console.log(`🏆 NBA championship: /api/championship`);
  console.log(`🔧 Available sports: /api/sports`);
  console.log("\n=== PLAYER PROPS (The Odds API) ===");
  console.log(`📋 Get NBA events: /api/player-props/events`);
  console.log(`🎯 Get props for event: /api/player-props/event/{eventId}`);
  console.log(`📊 Get specific market: /api/player-props/event/{eventId}/{market}`);
  console.log(`⚡ Get all props (limited): http://localhost:${PORT}/api/player-props/all`);
  console.log("================================");

  // Quick self-test
  fetch(`http://localhost:${PORT}/health`)
    .then((res) => res.json())
    .then((data) => console.log("✅ Server self-test passed:", data))
    .catch((err) =>
      console.log("❌ Server self-test failed:", err.message)
    );
});