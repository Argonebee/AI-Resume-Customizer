// server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

app.post("/api/customize", async (req, res) => {
  const { resumeText, jobDetails } = req.body || {};
  if (!resumeText || !jobDetails) return res.status(400).json({ error: 'Missing resumeText or jobDetails' });
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY missing');
    return res.status(500).json({ error: 'Server misconfiguration: missing GEMINI_API_KEY' });
  }

  try {
    const prompt = `
You are an expert resume editor. Given the user's resume and job details, extract only relevant skills, experiences, and qualifications that match the job description. Enhance wording but do not invent new info.
Return only the customized resume in Markdown.

Resume:
${resumeText}

Job Title: ${jobDetails.title}
Job Description: ${jobDetails.description}
Key Skills/Requirements: ${jobDetails.skills}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      console.error('Customize endpoint LLM error', response.status, raw);
      return res.status(502).json({ error: 'Upstream LLM error', status: response.status, details: raw });
    }

    const data = await response.json();
    const customizedResume = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content?.parts?.[0] || '';
    return res.json({ customizedResume });
  } catch (err) {
    console.error('Customize endpoint error:', err);
    return res.status(500).json({ error: "AI request failed", details: err.message });
  }
});

// Keyword extraction endpoint (server-side so API key is not exposed)
app.post('/api/keywords', async (req, res) => {
  const { resumeText, jobDetails } = req.body || {};
  if (!resumeText || !jobDetails) {
    return res.status(400).json({ error: 'Missing resumeText or jobDetails in request body' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in environment');
    return res.status(500).json({ error: 'Server misconfiguration: missing GEMINI_API_KEY' });
  }

  try {
    const prompt = `
Extract keywords (skills, tools, certifications, technologies) from both the resume and the job description. Return ONLY a valid JSON object, with no explanation or markdown. Example format:
{
  "resumeKeywords": ["Java", "Spring Boot"],
  "jobKeywords": ["Java", "Spring Boot", "Microservices"],
  "matchedKeywords": ["Java", "Spring Boot"],
  "missingKeywords": ["Microservices"]
}
Resume:
${resumeText}
Job Description:
${jobDetails.description}
Key Skills/Requirements: ${jobDetails.skills}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    let upstreamRaw = null;
    let data = null;
    if (!response.ok) {
      upstreamRaw = await response.text().catch(() => '');
      console.error('Gemini API returned non-OK:', response.status, upstreamRaw);
      // don't return yet; we'll fall back to local extraction
    } else {
      try {
        data = await response.json();
      } catch (e) {
        upstreamRaw = await response.text().catch(() => '');
        console.error('Failed to parse JSON from LLM response:', e.message, upstreamRaw);
        // continue to fallback
      }
    }

    // Attempt to extract candidate text in multiple ways
    const candidate = data?.candidates?.[0];
    let candidateText = null;
    if (candidate) {
      candidateText = candidate.content?.parts?.[0]?.text ?? candidate.content?.parts?.[0] ?? null;
    }

    // If we didn't get anything, stringify the whole response as last resort
    const rawString = candidateText ?? JSON.stringify(data);

    // If candidateText is already an object, return it
    if (candidateText && typeof candidateText === 'object') {
      return res.json(candidateText);
    }

  const text = String(rawString).trim();

    // Try to parse the text as JSON directly
    try {
      const parsed = JSON.parse(text);
      return res.json(parsed);
    } catch (e) {
      // Continue to fallback extraction
    }

    // Fallback: extract first {...} block and parse
    const match = text.match(/{[\s\S]*}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return res.json(parsed);
      } catch (err) {
        console.error('Failed to parse JSON from matched block:', err.message, 'block:', match[0]);
        // fall through to local fallback
      }
    }

    // Local heuristic fallback: extract keywords from job skills and resume text
    try {
      const normalize = s => s.toString().trim();
      const jobSkillsList = (jobDetails.skills || '')
        .split(',')
        .map(normalize)
        .filter(Boolean);

      const tokenSet = new Set();
      const tokenMatches = String(resumeText || '').match(/\b[A-Za-z0-9+.#\-]{2,}\b/g) || [];
      tokenMatches.forEach(t => tokenSet.add(t.trim()));
      const resumeKeywords = Array.from(tokenSet).slice(0, 200);

      const matchedKeywords = resumeKeywords.filter(rk =>
        jobSkillsList.some(js => rk.toLowerCase() === js.toLowerCase())
      );

      const missingKeywords = jobSkillsList.filter(js =>
        !matchedKeywords.some(mk => mk.toLowerCase() === js.toLowerCase())
      );

      const fallbackResult = {
        resumeKeywords,
        jobKeywords: jobSkillsList,
        matchedKeywords,
        missingKeywords,
        fallback: true,
        note: 'Returned heuristic fallback because LLM response could not be parsed.'
      };

      console.warn('Using fallback keyword extractor for request');
      return res.json(fallbackResult);
    } catch (err) {
      console.error('Fallback keyword extraction failed:', err);
      return res.status(500).json({ error: 'Keyword extraction failed', details: err.message });
    }
  } catch (err) {
    console.error('Keyword extraction error:', err);
    return res.status(500).json({ error: 'Keyword extraction failed', details: err.message });
  }
});

// Suggestions endpoint (server-side)
app.post('/api/suggestions', async (req, res) => {
  const { resumeText, jobDetails } = req.body || {};
  if (!resumeText || !jobDetails) return res.status(400).json({ error: 'Missing resumeText or jobDetails' });
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY missing');
    return res.status(500).json({ error: 'Server misconfiguration: missing GEMINI_API_KEY' });
  }

  try {
    const prompt = `
Review the resume for ATS optimization and provide actionable enhancement suggestions to improve keyword match, formatting, and content. Output as a bullet-point list, only the list, no explanations.
Resume:
${resumeText}
Job Title: ${jobDetails.title}
Job Description: ${jobDetails.description}
Key Skills/Requirements: ${jobDetails.skills}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      console.error('Suggestions LLM error', response.status, raw);
      return res.status(502).json({ error: 'Upstream LLM error', status: response.status, details: raw });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content?.parts?.[0] || '';
    return res.json({ suggestions: String(text) });
  } catch (err) {
    console.error('Suggestions generation failed:', err);
    return res.status(500).json({ error: 'Suggestions generation failed', details: err.message });
  }
});

app.listen(3000, () =>
  console.log("🚀 Backend running on http://localhost:3000")
);
// To run the server, use: node server.js