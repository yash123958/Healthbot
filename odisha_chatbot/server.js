// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch'); // node-fetch@2
const nlp = require('compromise');
const nodemailer = require('nodemailer');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Gemini API
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

// --- System prompt ---
const systemPrompt = `
You are a friendly healthcare assistant for Odisha, acting as a guide for citizens. 
Answer ONLY questions related to:

- Symptoms, diseases, and their prevention  
- Vaccines and immunization  
- How to stop bad habits (e.g., smoking, alcohol, chewing tobacco, junk food, late sleep)  
- Building good habits and daily routines (e.g., exercise, hygiene, sleep cycle)  
- Dietary and nutrition plans for healthy living  

Do NOT answer unrelated questions.  

Use simple, natural language suitable for rural areas and easy for ASHA workers to explain to villagers.  

Format answers clearly with headings or bullet points if necessary. Always give **practical tips** and **easy-to-follow advice** that villagers can apply in daily life.
`;

// --- Nodemailer transporter ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,  // sender email (bot)
    pass: process.env.EMAIL_PASS   // Gmail app password
  }
});

// --- Route: AI response ---
app.post('/get-ai-response', async (req, res) => {
  const { query, lang } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'Query missing' });
  if (!geminiApiKey) return res.status(500).json({ success: false, error: 'Gemini API key missing' });

  const prompt = `[${lang}] ${query}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  try {
    const response = await fetch(geminiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    let answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No answer received";
    answer = nlp(answer).terms().out('text');
    res.json({ success: true, answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to call Gemini API' });
  }
});

// --- Route: Send chat transcript ---
app.post('/send-chat', async (req, res) => {
  const { chatHistory, toEmail } = req.body;
  if (!chatHistory || !toEmail) return res.status(400).json({ success: false, error: 'Missing chatHistory or toEmail' });

  const chatHtml = chatHistory.map(msg => {
    const color = msg.role === "user" ? "#22C55E" : "#F97316";
    return `<p><b style="color:${color}">${msg.role.toUpperCase()}:</b> ${msg.content}</p>`;
  }).join("");

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Your Odisha Healthcare AI Chat Transcript",
    html: `
      <h2>🧾 Odisha Healthcare AI Chat Transcript</h2>
      <div style="font-family:Arial, sans-serif; line-height:1.6;">${chatHtml}</div>
      <p style="margin-top:20px; font-size:12px; color:#555;">Sent by Odisha Healthcare AI Bot</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Chat transcript sent to ' + toEmail });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// --- Test route ---
app.get('/', (req, res) => res.send('Odisha Healthcare AI Server running'));

// --- Export app for Vercel ---
module.exports = app;
