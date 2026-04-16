import React, { useState, useEffect } from "react";

function App() {
  // ---- API URL Configuration ----
  // For deployment: Replace this URL with your backend URL
  // Example: const API_URL = 'https://nba-odds-backend.onrender.com';
  const API_URL = 'http://localhost:3001';

  // ---- State ----
  const [odds, setOdds] = useState([]);
  const [championship, setChampionship] = useState(null);
  const [mvpOdds, setMvpOdds] = useState([]);
  const [dpoyOdds, setDpoyOdds] = useState([]);
  const [rotyOdds, setRotyOdds] = useState([]);
  const [sixthManOdds, setSixthManOdds] = useState([]);
  const [mipOdds, setMipOdds] = useState([]);
  const [playerProps, setPlayerProps] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState("games");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedBookmakers, setSelectedBookmakers] = useState([]);
  const [isBookmakerDropdownOpen, setIsBookmakerDropdownOpen] = useState(false);

  // Player props filters
  const [selectedStatType, setSelectedStatType] = useState("all");
  const [propsLoading, setPropsLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState("all");
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");

  // ---- Team logos mapping ----
  const teamLogos = {
    "Atlanta Hawks": "ATL",
    "Boston Celtics": "BOS",
    "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI",
    "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL",
    "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW",
    "Houston Rockets": "HOU",
    "Indiana Pacers": "IND",
    "Los Angeles Clippers": "LAC",
    "Los Angeles Lakers": "LAL",
    "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN",
    "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK",
    "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
  };

  const getTeamAbbreviation = (teamName) => {
    if (teamLogos[teamName]) return teamLogos[teamName];
    const words = teamName.split(" ");
    if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
    const initials = words.map((w) => w[0]).join("");
    return initials.substring(0, 3).toUpperCase();
  };

  // ---- Fetch data from backend on mount ----
  useEffect(() => {
    const fetchData = async () => {
      try {
        // START ALL REQUESTS IN PARALLEL - DON'T WAIT!
        const oddsPromise = fetch(`${API_URL}/api/odds`);
        const champPromise = fetch(`${API_URL}/api/championship`);
        const awardsPromise = fetch(`${API_URL}/api/awards/all`);

        // Process Game Odds (display as soon as it arrives)
        const oddsRes = await oddsPromise;
        
        if (!oddsRes.ok) {
          const errorText = await oddsRes.text();
          console.error("Backend error (odds):", errorText);
          throw new Error(`Failed to fetch odds: ${oddsRes.status}`);
        }

        const oddsData = await oddsRes.json();

        // Sort games by time
        const sortedOdds = [...oddsData].sort((a, b) => {
          const dateA = new Date(a.commence_time);
          const dateB = new Date(b.commence_time);
          return dateA - dateB;
        });

        // Filter to today's games
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todaysGames = sortedOdds.filter((game) => {
          const gameDate = new Date(game.commence_time);
          return gameDate >= today && gameDate < tomorrow;
        });

        setOdds(todaysGames);
        setLoading(false); // User can see Game Odds immediately!

        // Process Championship odds (when ready)
        champPromise
          .then(champRes => {
            if (champRes.ok) {
              return champRes.json();
            }
            return null;
          })
          .then(champData => {
            if (champData) setChampionship(champData);
          })
          .catch(champErr => {
            console.warn("Championship fetch failed:", champErr.message);
          });

        // Process Awards (when ready)
        awardsPromise
          .then(awardsRes => {
            if (awardsRes.ok) {
              return awardsRes.json();
            }
            return null;
          })
          .then(allAwards => {
            if (allAwards) {
              if (allAwards.mvp) setMvpOdds(allAwards.mvp);
              if (allAwards.dpoy) setDpoyOdds(allAwards.dpoy);
              if (allAwards.roty) setRotyOdds(allAwards.roty);
              if (allAwards.sixthMan) setSixthManOdds(allAwards.sixthMan);
              if (allAwards.mip) setMipOdds(allAwards.mip);
            }
          })
          .catch(err => {
            console.warn("Batch awards fetch failed:", err.message);
          });

      } catch (err) {
        console.error("Frontend error:", err);
        setError(
          `Could not load data: ${err.message}. Make sure backend is running on port 3001.`
        );
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ---- Fetch Player Props FAST (batched parallel) - only when tab is clicked ----
  const fetchPlayerPropsFast = async () => {
    setPropsLoading(true);
    try {
      // Get events list
      const eventsResponse = await fetch(`${API_URL}/api/player-props/events`);
      if (!eventsResponse.ok) {
        setPropsLoading(false);
        return;
      }
      
      const events = await eventsResponse.json();
      if (events.length === 0) {
        setPlayerProps([]);
        setPropsLoading(false);
        return;
      }
      
      const allProps = [];
      const maxEvents = Math.min(events.length, 10);
      
      // Fetch in batches of 3 to avoid rate limits (3 parallel, then next 3, etc.)
      const batchSize = 3;
      for (let i = 0; i < maxEvents; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        
        const batchFetches = batch.map(event =>
          fetch(`${API_URL}/api/player-props/event/${event.id}`)
            .then(res => res.ok ? res.json() : null)
            .catch(err => {
              console.warn(`Error fetching props for event ${event.id}:`, err);
              return null;
            })
        );
        
        const batchResults = await Promise.all(batchFetches);
        
        // Process batch results
        for (const propsData of batchResults) {
          if (!propsData || !propsData.bookmakers) continue;
          
          const gameLabel = `${propsData.away_team} @ ${propsData.home_team}`;
          
          for (const bookmaker of propsData.bookmakers) {
            if (!bookmaker.markets) continue;
            
            for (const market of bookmaker.markets) {
              if (!market.outcomes) continue;
              
              const playerMap = {};
              
              for (const outcome of market.outcomes) {
                const playerName = outcome.description || outcome.name;
                const point = outcome.point;
                
                if (!playerMap[playerName]) {
                  playerMap[playerName] = {
                    game: gameLabel,
                    player_name: playerName,
                    market: market.key.replace(/_/g, ' ').replace(/player /i, '').toUpperCase(),
                    line: point,
                    bookmaker: bookmaker.title,
                  };
                }
                
                if (outcome.name.toLowerCase().includes('over') || !outcome.name.toLowerCase().includes('under')) {
                  playerMap[playerName].over_odds = outcome.price;
                } else {
                  playerMap[playerName].under_odds = outcome.price;
                }
              }
              
              Object.values(playerMap).forEach(prop => {
                if (prop.over_odds && prop.under_odds) {
                  allProps.push(prop);
                }
              });
            }
          }
        }
        
        // Small delay between batches (only if there are more batches)
        if (i + batchSize < maxEvents) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      setPlayerProps(allProps);
    } catch (err) {
      console.warn("Player props fetch failed:", err.message);
    } finally {
      setPropsLoading(false);
    }
  };

  // ---- Lazy load MVP odds when tab is clicked (fallback if preload failed) ----
  useEffect(() => {
    if (activeTab === "mvp" && mvpOdds.length === 0) {
      const fetchMvp = async () => {
        try {
          const mvpRes = await fetch(`${API_URL}/api/awards/mvp`);
          if (mvpRes.ok) {
            const mvpData = await mvpRes.json();
            setMvpOdds(mvpData);
          }
        } catch (err) {
          console.warn("MVP fetch failed:", err.message);
        }
      };
      fetchMvp();
    }
  }, [activeTab]);

  // ---- Lazy load DPOY odds when tab is clicked ----
  useEffect(() => {
    if (activeTab === "dpoy" && dpoyOdds.length === 0) {
      const fetchDpoy = async () => {
        try {
          const dpoyRes = await fetch(`${API_URL}/api/awards/dpoy`);
          if (dpoyRes.ok) {
            const dpoyData = await dpoyRes.json();
            setDpoyOdds(dpoyData);
          }
        } catch (err) {
          console.warn("DPOY fetch failed:", err.message);
        }
      };
      fetchDpoy();
    }
  }, [activeTab]);

  // ---- Lazy load ROTY odds when tab is clicked ----
  useEffect(() => {
    if (activeTab === "roty" && rotyOdds.length === 0) {
      const fetchRoty = async () => {
        try {
          const rotyRes = await fetch(`${API_URL}/api/awards/roty`);
          if (rotyRes.ok) {
            const rotyData = await rotyRes.json();
            setRotyOdds(rotyData);
          }
        } catch (err) {
          console.warn("ROTY fetch failed:", err.message);
        }
      };
      fetchRoty();
    }
  }, [activeTab]);

  // ---- Lazy load Sixth Man odds when tab is clicked ----
  useEffect(() => {
    if (activeTab === "sixth-man" && sixthManOdds.length === 0) {
      const fetchSixthMan = async () => {
        try {
          const sixthManRes = await fetch(`${API_URL}/api/awards/sixth-man`);
          if (sixthManRes.ok) {
            const sixthManData = await sixthManRes.json();
            setSixthManOdds(sixthManData);
          }
        } catch (err) {
          console.warn("Sixth Man fetch failed:", err.message);
        }
      };
      fetchSixthMan();
    }
  }, [activeTab]);

  // ---- Lazy load MIP odds when tab is clicked ----
  useEffect(() => {
    if (activeTab === "mip" && mipOdds.length === 0) {
      const fetchMip = async () => {
        try {
          const mipRes = await fetch(`${API_URL}/api/awards/mip`);
          if (mipRes.ok) {
            const mipData = await mipRes.json();
            setMipOdds(mipData);
          }
        } catch (err) {
          console.warn("MIP fetch failed:", err.message);
        }
      };
      fetchMip();
    }
  }, [activeTab]);

  // Fetch player props when switching to props tab (uses fast batched parallel method)
  useEffect(() => {
    if (activeTab === "props" && playerProps.length === 0) {
      fetchPlayerPropsFast();
    }
  }, [activeTab]);

  // ---- Derived data ----
  const uniqueTeams = Array.from(
    new Set(
      odds.flatMap((game) => [game.home_team || "", game.away_team || ""])
    )
  ).filter(Boolean);

  const uniqueBookmakers = Array.from(
    new Set(
      odds.flatMap((game) =>
        (game.bookmakers || []).map((b) => b.title || "")
      )
    )
  ).filter(Boolean);

  const filteredOdds = odds.filter((game) => {
    const matchesTeam =
      selectedTeam === "all" ||
      game.home_team === selectedTeam ||
      game.away_team === selectedTeam;

    const matchesBookmaker =
      selectedBookmakers.length === 0 ||
      (game.bookmakers || []).some((b) =>
        selectedBookmakers.includes(b.title)
      );

    return matchesTeam && matchesBookmaker;
  });

  // Clean MVP list: remove heading / junk rows so #1 is first real player
  const cleanedMvpOdds = (mvpOdds || []).filter((row) => {
    if (!row || !row.player) return false;
    const p = row.player.toLowerCase();
    if (p.includes("mvp") || p.includes("contender")) return false;
    if (p.includes("best available")) return false;
    if (p.includes("odds")) return false;
    return true;
  });

  const cleanedDpoyOdds = (dpoyOdds || []).filter((row) => {
    if (!row || !row.player) return false;
    const p = row.player.toLowerCase();
    if (p.includes("defensive player") || p.includes("dpoy")) return false;
    if (p.includes("best available") || p.includes("odds")) return false;
    return true;
  });

  const cleanedRotyOdds = (rotyOdds || []).filter((row) => {
    if (!row || !row.player) return false;
    const p = row.player.toLowerCase();
    if (p.includes("rookie") || p.includes("roty")) return false;
    if (p.includes("best available") || p.includes("odds")) return false;
    return true;
  });

  const cleanedSixthManOdds = (sixthManOdds || []).filter((row) => {
    if (!row || !row.player) return false;
    const p = row.player.toLowerCase();
    if (p.includes("sixth man") || p.includes("6th man")) return false;
    if (p.includes("best available") || p.includes("odds")) return false;
    return true;
  });

  const cleanedMipOdds = (mipOdds || []).filter((row) => {
    if (!row || !row.player) return false;
    const p = row.player.toLowerCase();
    if (p.includes("most improved") || p.includes("mip")) return false;
    if (p.includes("best available") || p.includes("odds")) return false;
    return true;
  });

  // Get unique games from player props
  const uniqueGames = Array.from(
    new Set(playerProps.map(prop => prop.game))
  ).filter(Boolean).sort();

  // Filter player props by stat type (market) and game
  const filteredPropsByStatType = selectedStatType === "all" 
    ? playerProps 
    : playerProps.filter(prop => {
        const market = (prop.market || '').toLowerCase();
        const filterType = selectedStatType.toLowerCase();
        
        console.log(`Filtering: market="${market}", filter="${filterType}"`);
        
        // Handle combo stats - check if market contains the filter keywords
        if (filterType === 'points+rebounds') {
          return (market.includes('points') && market.includes('rebounds') && !market.includes('assists'));
        } else if (filterType === 'points+assists') {
          return (market.includes('points') && market.includes('assists') && !market.includes('rebounds'));
        } else if (filterType === 'rebounds+assists') {
          return (market.includes('rebounds') && market.includes('assists') && !market.includes('points'));
        } else if (filterType === 'points+rebounds+assists') {
          return (market.includes('points') && market.includes('rebounds') && market.includes('assists'));
        } else if (filterType === 'points') {
          // Only show points, exclude any combo stats with rebounds or assists
          return (market.includes('points') && !market.includes('rebounds') && !market.includes('assists'));
        } else if (filterType === 'rebounds') {
          // Only show rebounds, exclude any combo stats with points or assists
          return (market.includes('rebounds') && !market.includes('points') && !market.includes('assists'));
        } else if (filterType === 'assists') {
          // Only show assists, exclude any combo stats with points or rebounds
          return (market.includes('assists') && !market.includes('points') && !market.includes('rebounds'));
        } else {
          // For other stats (threes, blocks, steals, etc.), just check if market contains the stat name
          return market.includes(filterType);
        }
      });

  // Then filter by selected game
  const filteredPropsByGame = selectedGame === "all"
    ? filteredPropsByStatType
    : filteredPropsByStatType.filter(prop => prop.game === selectedGame);

  // Finally filter by player search query
  const filteredProps = playerSearchQuery.trim() === ""
    ? filteredPropsByGame
    : filteredPropsByGame.filter(prop => 
        (prop.player_name || '').toLowerCase().includes(playerSearchQuery.toLowerCase())
      );

  console.log(`Total props: ${playerProps.length}, Filtered props: ${filteredProps.length}, Filter: ${selectedStatType}, Game: ${selectedGame}, Search: ${playerSearchQuery}`);
  // ---- Styles ----
  const containerStyle = {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, #1a365d, #020617)",
    color: "#0F172A",
    fontFamily:
      "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "20px",
  };

  const cardStyle = {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.4)",
    marginBottom: "16px",
  };

  const headerStyle = {
    textAlign: "center",
    marginBottom: "24px",
    color: "white",
  };

  const titleStyle = {
    fontSize: "28px",
    fontWeight: 800,
    marginBottom: "6px",
    letterSpacing: "0.04em",
  };

  const subtitleStyle = {
    fontSize: "14px",
    opacity: 0.9,
  };

  const tagStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 12px",
    borderRadius: "9999px",
    background: "rgba(15, 23, 42, 0.8)",
    color: "white",
    fontSize: "12px",
    marginTop: "8px",
  };

  const tabContainerStyle = {
    display: "flex",
    justifyContent: "center",
    gap: "12px",
    marginBottom: "30px",
    flexWrap: "wrap",
  };

  const tabBaseStyle = {
    padding: "10px 26px",
    borderRadius: "9999px",
    fontWeight: 600,
    fontSize: "16px",
    cursor: "pointer",
    transition: "0.25s",
    border: "2px solid white",
  };

  const tabStyle = (active) => ({
    ...tabBaseStyle,
    backgroundColor: active ? "white" : "transparent",
    color: active ? "#0F172A" : "white",
    boxShadow: active
      ? "0 12px 25px rgba(15,23,42,0.35)"
      : "0 0 0 rgba(0,0,0,0)",
    transform: active ? "translateY(-1px)" : "translateY(0)",
  });

  const gameCardStyle = {
    ...cardStyle,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  const gameRowStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  };

  const teamBlockStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "120px",
  };

  const teamNameStyle = {
    fontWeight: 700,
    fontSize: "18px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const teamAbbrevStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #0F172A, #1D4ED8)",
    color: "white",
    fontSize: "14px",
    fontWeight: 700,
  };

  const kickoffStyle = {
    textAlign: "center",
    fontSize: "14px",
    color: "#64748B",
  };

  const oddsTableStyle = {
    marginTop: "10px",
    borderTop: "1px solid #E5E7EB",
    paddingTop: "10px",
  };

  const oddsRowStyle = {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "8px",
    flexWrap: "wrap",
  };

  const oddsBoxStyle = (isFavorite) => ({
    padding: "6px 12px",
    borderRadius: "999px",
    backgroundColor: isFavorite ? "rgba(34, 197, 94, 0.1)" : "#F9FAFB",
    border: isFavorite
      ? "1px solid rgba(34, 197, 94, 0.6)"
      : "1px solid #E5E7EB",
    fontSize: "13px",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });

  const bookmakerHeaderStyle = {
    fontSize: "13px",
    fontWeight: 700,
    color: "#111827",
  };

  const filterContainerStyle = {
    ...cardStyle,
    marginBottom: "24px",
  };

  const selectStyle = {
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #E5E7EB",
    fontSize: "14px",
  };

  const labelStyle = {
    fontSize: "13px",
    fontWeight: 600,
    color: "#4B5563",
    marginBottom: "4px",
  };

  const multiSelectBadge = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 8px",
    borderRadius: "999px",
    backgroundColor: "#E5E7EB",
    fontSize: "12px",
    cursor: "pointer",
  };

  const dropdownMenuStyle = {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: "8px",
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 20px 35px rgba(15,23,42,0.2)",
    padding: "10px",
    zIndex: 50,
    minWidth: "220px",
  };

  const formatTipoffTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const isLoading = loading;
  const hasError = !!error;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={tagStyle}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              backgroundColor: "#22C55E",
            }}
          ></span>
          LIVE NBA BETTING DASHBOARD
        </div>
        <h1 style={titleStyle}>BasketBets – NBA Odds Hub</h1>
        <p style={subtitleStyle}>
          Real-time NBA moneyline odds, championship futures, and MVP race.
        </p>
      </div>

      {/* Tabs */}
      <div style={tabContainerStyle}>
        <button
          onClick={() => setActiveTab("games")}
          style={tabStyle(activeTab === "games")}
        >
          Game Odds ({odds.length})
        </button>
        <button
          onClick={() => setActiveTab("championship")}
          style={tabStyle(activeTab === "championship")}
        >
          Championship Odds 🏆
        </button>
        <button
          onClick={() => setActiveTab("mvp")}
          style={tabStyle(activeTab === "mvp")}
        >
          MVP Race 🌟
        </button>
        <button
          onClick={() => setActiveTab("dpoy")}
          style={tabStyle(activeTab === "dpoy")}
        >
          DPOY 🛡️
        </button>
        <button
          onClick={() => setActiveTab("roty")}
          style={tabStyle(activeTab === "roty")}
        >
          ROTY 🌱
        </button>
        <button
          onClick={() => setActiveTab("sixth-man")}
          style={tabStyle(activeTab === "sixth-man")}
        >
          Sixth Man 6️⃣
        </button>
        <button
          onClick={() => setActiveTab("mip")}
          style={tabStyle(activeTab === "mip")}
        >
          MIP 📈
        </button>
        <button
          onClick={() => setActiveTab("props")}
          style={tabStyle(activeTab === "props")}
        >
          Player Props 📊
        </button>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div
          style={{
            ...cardStyle,
            textAlign: "center",
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
          <p>Loading NBA odds...</p>
        </div>
      )}

      {hasError && (
        <div
          style={{
            ...cardStyle,
            backgroundColor: "#FEE2E2",
            border: "1px solid #FCA5A5",
            maxWidth: "700px",
            margin: "0 auto 20px auto",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Error loading data</h3>
          <p style={{ fontSize: "14px" }}>{error}</p>
        </div>
      )}

      {/* GAMES TAB */}
      {activeTab === "games" && !isLoading && !hasError && (
        <>
          {/* Filters */}
          <div style={filterContainerStyle}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                alignItems: "flex-end",
              }}
            >
              {/* Team filter */}
              <div style={{ minWidth: "200px" }}>
                <div style={labelStyle}>Filter by Team</div>
                <select
                  style={selectStyle}
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                >
                  <option value="all">All Teams</option>
                  {uniqueTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bookmaker filter */}
              <div style={{ position: "relative", minWidth: "220px" }}>
                <div style={labelStyle}>Filter by Sportsbook</div>
                <div
                  style={{
                    ...selectStyle,
                    backgroundColor: "white",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() =>
                    setIsBookmakerDropdownOpen((prev) => !prev)
                  }
                >
                  <span>
                    {selectedBookmakers.length === 0
                      ? "All Sportsbooks"
                      : `${selectedBookmakers.length} selected`}
                  </span>
                  <span style={{ fontSize: "18px" }}>
                    {isBookmakerDropdownOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isBookmakerDropdownOpen && (
                  <div style={dropdownMenuStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#6B7280",
                        }}
                      >
                        Select Sportsbooks
                      </span>
                      <button
                        style={{
                          border: "none",
                          background: "none",
                          fontSize: "12px",
                          color: "#2563EB",
                          cursor: "pointer",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBookmakers([]);
                        }}
                      >
                        Clear all
                      </button>
                    </div>
                    <div
                      style={{
                        maxHeight: "220px",
                        overflowY: "auto",
                        paddingRight: "4px",
                      }}
                    >
                      {uniqueBookmakers.map((book) => {
                        const isSelected =
                          selectedBookmakers.includes(book);
                        return (
                          <label
                            key={book}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              fontSize: "13px",
                              padding: "5px 4px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              backgroundColor: isSelected
                                ? "#EEF2FF"
                                : "transparent",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedBookmakers((prev) =>
                                  isSelected
                                    ? prev.filter((b) => b !== book)
                                    : [...prev, book]
                                );
                              }}
                            />
                            <span>{book}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Active filters */}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={labelStyle}>Active Filters</div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  {selectedTeam !== "all" && (
                    <span
                      style={multiSelectBadge}
                      onClick={() => setSelectedTeam("all")}
                    >
                      {selectedTeam} ✕
                    </span>
                  )}
                  {selectedBookmakers.map((book) => (
                    <span
                      key={book}
                      style={multiSelectBadge}
                      onClick={() =>
                        setSelectedBookmakers((prev) =>
                          prev.filter((b) => b !== book)
                        )
                      }
                    >
                      {book} ✕
                    </span>
                  ))}
                  {selectedTeam === "all" &&
                    selectedBookmakers.length === 0 && (
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#9CA3AF",
                        }}
                      >
                        No filters applied
                      </span>
                    )}
                </div>
              </div>
            </div>
          </div>

          {/* Game cards */}
          {filteredOdds.length === 0 ? (
            <div
              style={{
                ...cardStyle,
                textAlign: "center",
                maxWidth: "900px",
                margin: "0 auto",
              }}
            >
              <h2>No games match your filters</h2>
            </div>
          ) : (
            <div style={{ maxWidth: "900px", margin: "0 auto" }}>
              {filteredOdds.map((game) => (
                <div key={game.id} style={gameCardStyle}>
                  <div style={gameRowStyle}>
                    {/* Away team */}
                    <div style={teamBlockStyle}>
                      <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
                        AWAY
                      </div>
                      <div style={teamNameStyle}>
                        <div style={teamAbbrevStyle}>
                          {getTeamAbbreviation(game.away_team)}
                        </div>
                        <span>{game.away_team}</span>
                      </div>
                    </div>

                    {/* Time */}
                    <div style={kickoffStyle}>
                      <div
                        style={{
                          fontSize: "12px",
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          color: "#9CA3AF",
                          marginBottom: "3px",
                        }}
                      >
                        TIP-OFF
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {formatTipoffTime(game.commence_time)}
                      </div>
                    </div>

                    {/* Home team */}
                    <div
                      style={{ ...teamBlockStyle, textAlign: "right" }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#9CA3AF",
                        }}
                      >
                        HOME
                      </div>
                      <div
                        style={{
                          ...teamNameStyle,
                          justifyContent: "flex-end",
                        }}
                      >
                        <span>{game.home_team}</span>
                        <div style={teamAbbrevStyle}>
                          {getTeamAbbreviation(game.home_team)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Odds */}
                  <div style={oddsTableStyle}>
                    {(game.bookmakers || []).length === 0 ? (
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#9CA3AF",
                          textAlign: "center",
                          padding: "8px 0",
                        }}
                      >
                        No odds data available for this game.
                      </div>
                    ) : (
                      (game.bookmakers || [])
                        // Filter bookmakers based on selection
                        .filter((bookmaker) =>
                          selectedBookmakers.length === 0 ||
                          selectedBookmakers.includes(bookmaker.title)
                        )
                        .map((bookmaker) => {
                        const h2hMarket = (bookmaker.markets || []).find(
                          (m) => m.key === "h2h"
                        );
                        if (!h2hMarket || !h2hMarket.outcomes) return null;

                        const homeOutcome = h2hMarket.outcomes.find(
                          (o) => o.name === game.home_team
                        );
                        const awayOutcome = h2hMarket.outcomes.find(
                          (o) => o.name === game.away_team
                        );

                        if (!homeOutcome || !awayOutcome) return null;

                        const isHomeFavorite =
                          (homeOutcome.price || 0) <
                          (awayOutcome.price || 0);

                        return (
                          <div
                            key={bookmaker.key}
                            style={{
                              ...oddsRowStyle,
                              alignItems: "center",
                            }}
                          >
                            <div style={{ minWidth: "120px" }}>
                              <div style={bookmakerHeaderStyle}>
                                {bookmaker.title}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#9CA3AF",
                                }}
                              >
                                Moneyline
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <div
                                style={oddsBoxStyle(!isHomeFavorite)}
                              >
                                <span
                                  style={{
                                    fontSize: "11px",
                                    textTransform: "uppercase",
                                    color: "#6B7280",
                                  }}
                                >
                                  AWAY
                                </span>
                                <span>
                                  {awayOutcome.price > 0
                                    ? `+${awayOutcome.price}`
                                    : awayOutcome.price}
                                </span>
                                {!isHomeFavorite && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "#16A34A",
                                    }}
                                  >
                                    Fav
                                  </span>
                                )}
                              </div>

                              <div
                                style={oddsBoxStyle(isHomeFavorite)}
                              >
                                <span
                                  style={{
                                    fontSize: "11px",
                                    textTransform: "uppercase",
                                    color: "#6B7280",
                                  }}
                                >
                                  HOME
                                </span>
                                <span>
                                  {homeOutcome.price > 0
                                    ? `+${homeOutcome.price}`
                                    : homeOutcome.price}
                                </span>
                                {isHomeFavorite && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "#16A34A",
                                    }}
                                  >
                                    Fav
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* CHAMPIONSHIP TAB */}
      {activeTab === "championship" && (
        <>
          {!championship || championship.length === 0 ? (
            <div
              style={{
                ...cardStyle,
                textAlign: "center",
                maxWidth: "900px",
                margin: "0 auto",
              }}
            >
              <h2>No Championship Odds Available</h2>
              <p>Championship odds could not be loaded at this time.</p>
            </div>
          ) : (
            <>
              <div
                style={{
                  textAlign: "center",
                  marginBottom: "20px",
                  color: "white",
                }}
              >
                <h2 style={{ margin: "0 0 10px 0" }}>
                  NBA Championship Futures
                </h2>
                <p style={{ margin: 0, fontSize: "14px" }}>
                  Outright winner odds (most recent data from The Odds
                  API).
                </p>
              </div>

              <div
                style={{
                  maxWidth: "900px",
                  margin: "0 auto",
                }}
              >
                <div
                  style={{
                    ...cardStyle,
                    padding: "24px",
                  }}
                >
                  {(championship[0]?.bookmakers || []).length === 0 ? (
                    <p style={{ textAlign: "center", margin: 0 }}>
                      No bookmaker odds available for championship market.
                    </p>
                  ) : (
                    (championship[0].bookmakers || []).map(
                      (bookmaker) => {
                        const market =
                          (bookmaker.markets || [])[0] || null;
                        if (!market || !market.outcomes) return null;

                        const sortedOutcomes = [...market.outcomes].sort(
                          (a, b) => a.price - b.price
                        );

                        return (
                          <div
                            key={bookmaker.key}
                            style={{
                              marginBottom: "24px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                marginBottom: "8px",
                              }}
                            >
                              <h3
                                style={{
                                  margin: 0,
                                  fontSize: "16px",
                                }}
                              >
                                {bookmaker.title}
                              </h3>
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "#9CA3AF",
                                }}
                              >
                                Updated:{" "}
                                {bookmaker.last_update
                                  ? new Date(
                                      bookmaker.last_update
                                    ).toLocaleString()
                                  : "Unknown"}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: "12px",
                              }}
                            >
                              {sortedOutcomes.map(
                                (outcome, idx) => (
                                  <div
                                    key={outcome.name}
                                    style={{
                                      borderRadius: "12px",
                                      border: idx === 0
                                        ? "2px solid rgba(34,197,94,0.7)"
                                        : "1px solid #E5E7EB",
                                      padding: "10px 12px",
                                      backgroundColor: idx === 0
                                        ? "rgba(220,252,231,0.7)"
                                        : "#F9FAFB",
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      fontSize: "13px",
                                    }}
                                  >
                                    <div>
                                      <div
                                        style={{ fontWeight: 600 }}
                                      >
                                        {outcome.name}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "11px",
                                          color: "#6B7280",
                                        }}
                                      >
                                        {outcome.price > 0
                                          ? `+${outcome.price}`
                                          : outcome.price}
                                      </div>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#666",
                                        marginTop: "5px",
                                      }}
                                    >
                                      {idx === 0
                                        ? "Favorite"
                                        : `#${idx + 1}`}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        );
                      }
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* MVP TAB */}
      {activeTab === "mvp" && (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div
            style={{
              textAlign: "center",
              marginBottom: "20px",
              color: "white",
            }}
          >
            <h2 style={{ margin: 0 }}>🌟 NBA MVP Race</h2>
            <p>Odds scraped from Rotowire (DraftKings or best available).</p>
          </div>

          {!cleanedMvpOdds || cleanedMvpOdds.length === 0 ? (
            <div
              style={{
                ...cardStyle,
                textAlign: "center",
              }}
            >
              <h3>No MVP odds available right now.</h3>
              <p>Try again later or check the backend logs.</p>
            </div>
          ) : (
            <div
              style={{
                ...cardStyle,
                padding: "20px",
              }}
            >
              {cleanedMvpOdds.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: "20px",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom:
                      idx < cleanedMvpOdds.length - 1
                        ? "1px solid #eee"
                        : "none",
                  }}
                >
                  <div style={{ fontWeight: "bold" }}>
                    #{idx + 1} {row.player}
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      color: "#f97316",
                      textAlign: "right",
                    }}
                  >
                    {row.odds}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      textAlign: "right",
                    }}
                  >
                    {row.sportsbook}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DPOY TAB */}
      {activeTab === "dpoy" && (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "20px", color: "white" }}>
            <h2 style={{ margin: 0 }}>🛡️ Defensive Player of the Year Race</h2>
            <p>Odds scraped from Rotowire (best available).</p>
          </div>
          {!cleanedDpoyOdds || cleanedDpoyOdds.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <h3>No DPOY odds available right now.</h3>
              <p>Try again later or check the backend logs.</p>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: "20px" }}>
              {cleanedDpoyOdds.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "20px", alignItems: "center", padding: "10px 0", borderBottom: idx < cleanedDpoyOdds.length - 1 ? "1px solid #eee" : "none" }}>
                  <div style={{ fontWeight: "bold" }}>#{idx + 1} {row.player}</div>
                  <div style={{ fontFamily: "monospace", color: "#f97316", textAlign: "right" }}>{row.odds}</div>
                  <div style={{ fontSize: "12px", color: "#666", textAlign: "right" }}>{row.sportsbook}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ROTY TAB */}
      {activeTab === "roty" && (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "20px", color: "white" }}>
            <h2 style={{ margin: 0 }}>🌱 Rookie of the Year Race</h2>
            <p>Odds scraped from Rotowire (best available).</p>
          </div>
          {!cleanedRotyOdds || cleanedRotyOdds.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <h3>No ROTY odds available right now.</h3>
              <p>Try again later or check the backend logs.</p>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: "20px" }}>
              {cleanedRotyOdds.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "20px", alignItems: "center", padding: "10px 0", borderBottom: idx < cleanedRotyOdds.length - 1 ? "1px solid #eee" : "none" }}>
                  <div style={{ fontWeight: "bold" }}>#{idx + 1} {row.player}</div>
                  <div style={{ fontFamily: "monospace", color: "#f97316", textAlign: "right" }}>{row.odds}</div>
                  <div style={{ fontSize: "12px", color: "#666", textAlign: "right" }}>{row.sportsbook}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SIXTH MAN TAB */}
      {activeTab === "sixth-man" && (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "20px", color: "white" }}>
            <h2 style={{ margin: 0 }}>6️⃣ Sixth Man of the Year Race</h2>
            <p>Odds scraped from Rotowire (best available).</p>
          </div>
          {!cleanedSixthManOdds || cleanedSixthManOdds.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <h3>No Sixth Man odds available right now.</h3>
              <p>Try again later or check the backend logs.</p>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: "20px" }}>
              {cleanedSixthManOdds.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "20px", alignItems: "center", padding: "10px 0", borderBottom: idx < cleanedSixthManOdds.length - 1 ? "1px solid #eee" : "none" }}>
                  <div style={{ fontWeight: "bold" }}>#{idx + 1} {row.player}</div>
                  <div style={{ fontFamily: "monospace", color: "#f97316", textAlign: "right" }}>{row.odds}</div>
                  <div style={{ fontSize: "12px", color: "#666", textAlign: "right" }}>{row.sportsbook}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MIP TAB */}
      {activeTab === "mip" && (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "20px", color: "white" }}>
            <h2 style={{ margin: 0 }}>📈 Most Improved Player Race</h2>
            <p>Odds scraped from Rotowire (best available).</p>
          </div>
          {!cleanedMipOdds || cleanedMipOdds.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <h3>No MIP odds available right now.</h3>
              <p>Try again later or check the backend logs.</p>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: "20px" }}>
              {cleanedMipOdds.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "20px", alignItems: "center", padding: "10px 0", borderBottom: idx < cleanedMipOdds.length - 1 ? "1px solid #eee" : "none" }}>
                  <div style={{ fontWeight: "bold" }}>#{idx + 1} {row.player}</div>
                  <div style={{ fontFamily: "monospace", color: "#f97316", textAlign: "right" }}>{row.odds}</div>
                  <div style={{ fontSize: "12px", color: "#666", textAlign: "right" }}>{row.sportsbook}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PLAYER PROPS TAB */}
      {activeTab === "props" && (
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div
            style={{
              textAlign: "center",
              marginBottom: "20px",
              color: "white",
            }}
          >
            <h2 style={{ margin: "0 0 10px 0" }}>📊 Player Props</h2>
            <p style={{ margin: 0, fontSize: "14px" }}>
              Today's player props from The Odds API (US Bookmakers)
            </p>
          </div>

          {/* Filter by Team Label */}
          <div
            style={{
              textAlign: "center",
              color: "white",
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "8px",
            }}
          >
            Filter by Team
          </div>

          {/* Game Matchup Filter and Player Search */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "12px",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                backgroundColor: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px",
                cursor: "pointer",
                minWidth: "250px",
              }}
            >
              <option value="all">All Games</option>
              {uniqueGames.map((game) => (
                <option key={game} value={game}>
                  {game}
                </option>
              ))}
            </select>
            
            <input
              type="text"
              placeholder="Search player name..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                backgroundColor: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px",
                minWidth: "250px",
              }}
            />
          </div>

          {/* Stat Type Filter */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "20px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {["all", "points", "rebounds", "assists", "threes", "blocks", "steals", "points+rebounds", "points+assists", "rebounds+assists", "points+rebounds+assists"].map((stat) => (
              <button
                key={stat}
                onClick={() => setSelectedStatType(stat)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    selectedStatType === stat
                      ? "white"
                      : "rgba(255, 255, 255, 0.15)",
                  color: selectedStatType === stat ? "#1e40af" : "white",
                  fontWeight: selectedStatType === stat ? 700 : 500,
                  cursor: "pointer",
                  fontSize: "14px",
                  textTransform: "capitalize",
                }}
              >
                {stat === "points+rebounds" ? "PTS+REB" :
                 stat === "points+assists" ? "PTS+AST" :
                 stat === "rebounds+assists" ? "REB+AST" :
                 stat === "points+rebounds+assists" ? "PTS+REB+AST" :
                 stat}
              </button>
            ))}
            <button
              onClick={fetchPlayerPropsFast}
              disabled={propsLoading}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "rgba(34, 197, 94, 0.2)",
                color: "white",
                cursor: propsLoading ? "not-allowed" : "pointer",
                fontSize: "14px",
              }}
            >
              {propsLoading ? "Refreshing..." : "🔄 Refresh"}
            </button>
          </div>

          {propsLoading ? (
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <p>Loading player props...</p>
            </div>
          ) : filteredProps.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <h3>No player props available</h3>
              <p>Try refreshing or check back later.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
                gap: "16px",
              }}
            >
              {filteredProps.map((prop, idx) => (
                <div key={idx} style={{ ...cardStyle, padding: "16px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginBottom: "8px",
                    }}
                  >
                    {prop.game}
                  </div>
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      marginBottom: "4px",
                    }}
                  >
                    {prop.player_name}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#374151",
                      marginBottom: "12px",
                    }}
                  >
                    {prop.market}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        padding: "8px",
                        backgroundColor: "#dcfce7",
                        borderRadius: "6px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "#166534" }}>
                        Over {prop.line}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#15803d",
                        }}
                      >
                        {prop.over_odds > 0 ? "+" : ""}
                        {prop.over_odds}
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        padding: "8px",
                        backgroundColor: "#fee2e2",
                        borderRadius: "6px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "#991b1b" }}>
                        Under {prop.line}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#dc2626",
                        }}
                      >
                        {prop.under_odds > 0 ? "+" : ""}
                        {prop.under_odds}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#9ca3af",
                      textAlign: "right",
                    }}
                  >
                    {prop.bookmaker}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          textAlign: "center",
          marginTop: "30px",
          color: "white",
          fontSize: "12px",
        }}
      >
        <p>
          Data provided by The Odds API &amp; Rotowire (scraped) | Refreshed:{" "}
          {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default App;
