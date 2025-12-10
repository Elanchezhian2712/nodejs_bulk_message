import React, { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import LiveLeaderboard from "./LiveLeaderboard";

const API_BASE = "http://localhost:8000";

export default function App() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get("quiz") === "true" ? "viewer" : "admin";

  return (
    <Routes>
      <Route path="/live" element={<LiveLeaderboard />} />
      <Route
        path="/*"
        element={mode === "admin" ? <AdminPanel /> : <VotingPage />}
      />
    </Routes>
  );
}

/* ================== ADMIN PANEL ================== */
function AdminPanel() {
  const [contacts, setContacts] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/contacts`).then(r => r.json()).then(setContacts);
    fetch(`${API_BASE}/questions`).then(r => r.json()).then(setQuestions);
  }, []);

  const uploadExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Use xlsx library to parse
    const buffer = await file.arrayBuffer();
    const XLSX = await import("xlsx"); 
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const parsed = rows.map((row, i) => ({
      id: `emp_${i}`,
      name: row.Name,
      number: row.Number,
      employeeId: row["Employee ID"]
    }));

    const res = await fetch(`${API_BASE}/import-contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: parsed }),
    });

    const out = await res.json();
    setStatus(`Uploaded ${out.count} contacts`);
    
    // Refresh list
    fetch(`${API_BASE}/contacts`).then(r => r.json()).then(setContacts);
  };

  const addQuestion = () => {
    setQuestions([{ id: "q1", text: "Who is the Employee of the Month?", type: "vote" }]);
  };

  const saveQuestions = async () => {
    await fetch(`${API_BASE}/save-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions }),
    });
    setStatus("Questions Saved");
  };

  const startCampaign = async () => {
    setStatus("Sending WhatsApp...");
    const res = await fetch(`${API_BASE}/start-campaign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCount: 200, baseUrl: window.location.origin })
    });
    const data = await res.json();
    setStatus(`Sent to ${data.results.length} people`);
  };

  const clearVotes = async () => {
    await fetch(`${API_BASE}/clear-votes`, { method: "POST" });
    setStatus("Votes Cleared");
  };

  return (
    <div className="min-h-screen bg-[#0f1624] text-white p-10">
      <h1 className="text-4xl font-bold mb-6">Admin Panel</h1>
      
      <div className="section-box">
        <h2 className="text-xl font-bold mb-4">1. Upload Excel</h2>
        <input type="file" onChange={uploadExcel} className="mb-4" />
        <p className="text-green-400 mb-2">{status}</p>
        <p className="text-gray-400 text-sm">Contacts Loaded: {contacts.length}</p>
      </div>

      <div className="section-box">
        <h2 className="text-xl font-bold mb-4">2. Manage Question</h2>
        <div className="flex-gap mb-4">
            <button className="btn-indigo" onClick={addQuestion}>Set Voting Question</button>
            <button className="btn-green" onClick={saveQuestions}>Save</button>
            <button className="btn-red" onClick={() => setQuestions([])}>Clear</button>
        </div>
        {questions.map((q, i) => (
            <input key={i} className="input-box" value={q.text} onChange={e => {
                const newQ = [...questions];
                newQ[i].text = e.target.value;
                setQuestions(newQ);
            }} />
        ))}
      </div>

      <div className="section-box">
        <h2 className="text-xl font-bold mb-4">3. Actions</h2>
        <button className="btn-indigo" onClick={startCampaign}>Bulk Send WhatsApp</button>
        <button className="btn-yellow" onClick={clearVotes}>Clear Votes</button>
        <div className="mt-4">
            <a href="/live" target="_blank" className="text-blue-400 underline">Open Live Leaderboard</a>
        </div>
      </div>
    </div>
  );
}

/* ================== VOTING PAGE ================== */
function VotingPage() {
  const [question, setQuestion] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [formData, setFormData] = useState({ employeeId: "", selectedName: "" });
  const [status, setStatus] = useState("idle"); // idle, submitting, success, error
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/questions`).then(r => r.json()).then(q => setQuestion(q[0]));
    fetch(`${API_BASE}/contacts`).then(r => r.json()).then(setEmployees);
  }, []);

  const submit = async () => {
    if (!formData.employeeId || !formData.selectedName) {
      setMsg("Please fill all fields");
      return;
    }
    
    setStatus("submitting");
    
    try {
        const res = await fetch(`${API_BASE}/submit-vote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                employeeId: formData.employeeId.trim(),
                voteFor: formData.selectedName
            })
        });
        const out = await res.json();
        
        if (out.error) {
            setStatus("error");
            setMsg(out.error);
        } else {
            setStatus("success");
        }
    } catch (err) {
        setStatus("error");
        setMsg("Network Error");
    }
  };

  if (status === "success") {
    return (
        <div className="min-h-screen bg-[#0f1624] flex items-center justify-center text-white">
            <div className="text-center">
                <h1 className="text-5xl mb-4">✅</h1>
                <h2 className="text-3xl font-bold text-green-400">Vote Submitted!</h2>
                <p className="mt-2 text-gray-300">Thank you for participating.</p>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1624] text-white p-8 flex items-center justify-center">
      <div className="max-w-md w-full bg-[#1c2436] p-8 rounded-xl border border-[#2e3b55]">
        <h1 className="text-2xl font-bold mb-6 text-center">Employee Voting</h1>
        
        {question && <p className="text-lg mb-4 text-center text-blue-300">{question.text}</p>}

        <label className="block mb-2 text-gray-400">Your Employee ID</label>
        <input 
            className="input-box" 
            placeholder="e.g. EMP001"
            value={formData.employeeId}
            onChange={e => setFormData({...formData, employeeId: e.target.value})}
        />

        <label className="block mb-2 text-gray-400 mt-4">Select Employee</label>
        <select 
            className="input-box"
            value={formData.selectedName}
            onChange={e => setFormData({...formData, selectedName: e.target.value})}
        >
            <option value="">-- Choose --</option>
            {employees.map(emp => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
            ))}
        </select>

        {msg && <p className="text-red-400 mt-4 text-center">{msg}</p>}

        <button 
            className="btn-indigo w-full mt-6" 
            onClick={submit}
            disabled={status === "submitting"}
        >
            {status === "submitting" ? "Submitting..." : "Submit Vote"}
        </button>
      </div>
    </div>
  );
}