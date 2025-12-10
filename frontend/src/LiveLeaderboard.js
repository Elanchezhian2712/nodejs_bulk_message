import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";

export default function LiveLeaderboard() {
  // Add timestamp to URL to force reload (Cache Busting)
  const [url, setUrl] = useState(`${API_BASE}/leaderboard.png?t=${Date.now()}`);

  useEffect(() => {
    const interval = setInterval(() => {
      setUrl(`${API_BASE}/leaderboard.png?t=${Date.now()}`);
    }, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-10 overflow-hidden">
      <div className="text-center w-full max-w-5xl">
        <h1 className="text-4xl font-bold text-pink-500 mb-6 tracking-wider uppercase drop-shadow-md">
          🏆 Live Voting Results
        </h1>
        
        <div className="relative inline-block border-4 border-gray-800 rounded-xl shadow-2xl bg-black p-2">
            <img 
                src={url} 
                alt="Leaderboard" 
                className="w-full h-auto rounded-lg"
                style={{ maxHeight: "85vh", objectFit: "contain" }} 
            />
        </div>
      </div>
    </div>
  );
}