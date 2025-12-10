/**
 * WhatsApp Employee Voting Backend – ALL NAMES INCLUDED
 * - Shows ALL employees from Excel (even with 0 votes)
 * - Winners get bigger text
 * - Spiral Word Cloud style
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { createCanvas, registerFont } = require("canvas");

// Optional: Register custom font
try {
  registerFont(path.join(__dirname, "fonts", "Inter-Regular.ttf"), { family: "Inter" });
} catch {
  console.log("ℹ Using system fonts.");
}

// ---------------------------
// 1. CONFIG & UTILS
// ---------------------------
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const CONTACTS_FILE = path.join(DATA_DIR, "contacts.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const VOTES_FILE = path.join(DATA_DIR, "votes.json");
const LEADERBOARD_IMG = path.join(DATA_DIR, "leaderboard.png");

// Red/Pink Palette
const WORD_CLOUD_COLORS = [
  "#E91E63", "#F06292", "#EC407A", "#D81B60", "#FF5252",
  "#FF1744", "#C2185B", "#AD1457", "#F48FB1", "#FF80AB",
  "#AAAAAA", "#CCCCCC", "#999999", "#DDDDDD", "#FFFFFF",
];

const ensure = (file, init) => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(init, null, 2));
};
ensure(CONTACTS_FILE, []);
ensure(QUESTIONS_FILE, []);
ensure(VOTES_FILE, {});

const readJSON = (file) => JSON.parse(fs.readFileSync(file));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ---------------------------
// 2. EXPRESS & WA CLIENT
// ---------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("data"));

const waClient = new Client({
  authStrategy: new LocalAuth({ clientId: "voting-bot" }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

waClient.on("qr", (qr) => qrcode.generate(qr, { small: true }));
waClient.on("ready", () => console.log("\n✅ WhatsApp Client is READY!"));
waClient.initialize();

/* ============================================================
   API ROUTES
============================================================ */

app.post("/import-contacts", (req, res) => {
  const arr = req.body.contacts;
  if (!Array.isArray(arr)) return res.status(400).json({ error: "Invalid data" });
  
  const cleaned = arr.map((c, i) => ({
    id: c.id || `emp_${Date.now()}_${i}`,
    name: c.name || "Unknown",
    number: String(c.number || "").replace(/[^\d]/g, ""),
    employeeId: c.employeeId || "",
  })).filter(x => x.number.length > 5 && x.name);

  writeJSON(CONTACTS_FILE, cleaned);
  // Regenerate immediately so new names appear on leaderboard
  generateWordCloudLeaderboard(); 
  res.json({ status: "ok", count: cleaned.length });
});

app.post("/save-questions", (req, res) => {
  writeJSON(QUESTIONS_FILE, req.body.questions || []);
  res.json({ status: "ok" });
});

app.post("/start-campaign", async (req, res) => {
  const { testCount = 200, baseUrl = "http://localhost:3000" } = req.body;
  const contacts = readJSON(CONTACTS_FILE);
  const sendList = contacts.slice(0, testCount);

  if (!waClient.info) return res.status(500).json({ error: "WhatsApp not ready" });

  const quizUrl = `${baseUrl}/?quiz=true`;
  const results = [];

  for (const c of sendList) {
    const chatId = `${c.number}@c.us`;
    const message = `Hello ${c.name} 👋\n\nVote now:\n🔗 ${quizUrl}`;
    try {
      await waClient.sendMessage(chatId, message);
      results.push({ number: c.number, status: "sent" });
      await new Promise(r => setTimeout(r, 1000)); 
    } catch (e) {
      results.push({ number: c.number, status: "error" });
    }
  }
  res.json({ status: "ok", results });
});

app.post("/submit-vote", (req, res) => {
  const { employeeId, voteFor } = req.body;
  if (!employeeId || !voteFor) return res.status(400).json({ error: "Missing fields" });

  const votes = readJSON(VOTES_FILE);
  const contacts = readJSON(CONTACTS_FILE);
  const inputId = String(employeeId).trim().toLowerCase();

  const validEmp = contacts.find((c) => String(c.employeeId).trim().toLowerCase() === inputId);
  if (!validEmp) return res.json({ error: "Invalid Employee ID" });

  const storedId = validEmp.employeeId;
  if (votes[storedId]) return res.json({ error: "You have already voted." });

  votes[storedId] = { votedFor: voteFor, timestamp: Date.now() };
  writeJSON(VOTES_FILE, votes);
  
  // Refresh Leaderboard
  generateWordCloudLeaderboard();
  
  res.json({ status: "ok" });
});

app.post("/clear-votes", (req, res) => {
  writeJSON(VOTES_FILE, {});
  generateWordCloudLeaderboard();
  res.json({ status: "cleared" });
});

app.get("/contacts", (req, res) => res.json(readJSON(CONTACTS_FILE)));
app.get("/questions", (req, res) => res.json(readJSON(QUESTIONS_FILE)));
app.get("/votes-summary", (req, res) => {
  const votes = readJSON(VOTES_FILE);
  res.json({ totalVotes: Object.keys(votes).length });
});
app.get("/leaderboard.png", (req, res) => {
  if (!fs.existsSync(LEADERBOARD_IMG)) generateWordCloudLeaderboard();
  res.sendFile(LEADERBOARD_IMG);
});

/* ============================================================
   🔥 WORD CLOUD GENERATOR (ALL EMPLOYEES)
============================================================ */

function getRotatedBBox(x, y, w, h, angleDeg) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const corners = [
    { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
  ];
  const rotated = corners.map((p) => ({
    x: x + (p.x * cos - p.y * sin),
    y: y + (p.x * sin + p.y * cos),
  }));
  const xs = rotated.map((p) => p.x);
  const ys = rotated.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

function checkCollision(candidate, placedBoxes, margin = 5) {
  const c = { x1: candidate.x1 - margin, y1: candidate.y1 - margin, x2: candidate.x2 + margin, y2: candidate.y2 + margin };
  for (const p of placedBoxes) {
    if (!(c.x2 < p.x1 || c.x1 > p.x2 || c.y2 < p.y1 || c.y1 > p.y2)) return true;
  }
  return false;
}

function generateWordCloudLeaderboard() {
  const votes = readJSON(VOTES_FILE);
  const contacts = readJSON(CONTACTS_FILE);
  
  // 1. Initialize Score Map with ALL contacts (default 0)
  const scoreMap = {};
  contacts.forEach(c => {
    // Key by Name (assuming names are mostly unique for display)
    scoreMap[c.name] = 0; 
  });

  // 2. Add Votes
  Object.values(votes).forEach((v) => {
    if (scoreMap[v.votedFor] !== undefined) {
      scoreMap[v.votedFor]++;
    } else {
      // Handle edge case where name might be manually typed or not in list
      scoreMap[v.votedFor] = 1; 
    }
  });

  // 3. Convert to Array and Sort
  let scores = Object.keys(scoreMap)
    .map((name) => ({ name: name, score: scoreMap[name] }))
    .sort((a, b) => b.score - a.score);

  // Canvas Setup
  const size = 2000; // Bigger canvas to fit everyone
  const center = size / 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Black Background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);

  if (scores.length === 0) {
    fs.writeFileSync(LEADERBOARD_IMG, canvas.toBuffer("image/png"));
    return;
  }

  const placedBoxes = [];

  // --- DRAW WINNER (CENTER) ---
  const winner = scores[0];
  const winnerFontSize = 180; // Huge text for winner
  ctx.font = `${winnerFontSize}px Inter, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  const wText = winner.name.toLowerCase();
  const wMetrics = ctx.measureText(wText);
  const wWidth = wMetrics.width;
  const wHeight = winnerFontSize * 0.8;

  // Winner color (Hot Pink)
  ctx.fillStyle = "#E91E63"; 
  ctx.fillText(wText, center, center);

  placedBoxes.push({
    x1: center - wWidth / 2 - 30, y1: center - wHeight / 2 - 30,
    x2: center + wWidth / 2 + 30, y2: center + wHeight / 2 + 30,
  });

  // --- DRAW OTHERS (Including 0 votes) ---
  const others = scores.slice(1);
  if (others.length === 0) {
    fs.writeFileSync(LEADERBOARD_IMG, canvas.toBuffer("image/png"));
    return;
  }

  // Calculate range for sizing
  const maxScore = others[0].score;
  const minScore = others[others.length - 1].score;
  const scoreRange = (maxScore - minScore) || 1;

  const items = others.map((item) => {
    // Normalization: 0 to 1
    const normalized = (item.score - minScore) / scoreRange;
    
    // Size Logic:
    // Minimum 22px (so 0 votes are visible). Max 100px.
    const fontSize = Math.floor(22 + (normalized * 78)); 
    
    ctx.font = `${fontSize}px Inter, Arial`;
    const label = item.name.toLowerCase();
    const m = ctx.measureText(label);
    
    // Color Logic: 0 votes get Grey/White, High votes get Pink/Red
    let color;
    if (item.score === 0) {
        // Random grey/white for non-voters
        const greys = ["#888888", "#AAAAAA", "#CCCCCC", "#666666"];
        color = greys[Math.floor(Math.random() * greys.length)];
    } else {
        // Pinks for voters
        color = WORD_CLOUD_COLORS[Math.floor(Math.random() * 10)]; 
    }

    return {
      text: label,
      size: fontSize,
      width: m.width,
      height: fontSize * 0.8,
      color: color,
    };
  });

  // Sort by size (big ones first)
  items.sort((a, b) => b.size - a.size);

  // Spiral Logic
  const spiralTightness = 0.6;
  const startRadius = 300; 
  
  items.forEach((item) => {
    let placed = false;
    let angle = 0;
    let radius = startRadius;

    // Increased attempts for many names
    for (let i = 0; i < 800; i++) {
      angle += 0.25; 
      radius += spiralTightness; 

      const noiseAngle = angle + (Math.random() * 0.5 - 0.25);
      // More randomness for 0-vote items to scatter them
      const scatter = item.size < 30 ? 40 : 15;
      const noiseRadius = radius + (Math.random() * scatter - (scatter/2));

      const x = center + noiseRadius * Math.cos(noiseAngle);
      const y = center + noiseRadius * Math.sin(noiseAngle);

      let rotationDeg = Math.random() * 140 - 70;
      if (Math.random() > 0.7) rotationDeg = Math.random() > 0.5 ? 0 : 90;

      const bbox = getRotatedBBox(x, y, item.width, item.height, rotationDeg);
      
      if (bbox.x1 < 20 || bbox.y1 < 20 || bbox.x2 > size - 20 || bbox.y2 > size - 20) continue;

      // Small margin for tight fit
      if (!checkCollision(bbox, placedBoxes, 5)) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((rotationDeg * Math.PI) / 180);
        ctx.fillStyle = item.color;
        ctx.font = `${item.size}px Inter, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.text, 0, 0);
        ctx.restore();

        placedBoxes.push(bbox);
        placed = true;
        break;
      }
    }
  });

  fs.writeFileSync(LEADERBOARD_IMG, canvas.toBuffer("image/png"));
  console.log(`📸 Cloud Generated: ${scores.length} names processed.`);
}

const PORT = 8000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));