// @ts-nocheck
// Supabase Edge Function: keywords
// Mirrors POST /api/keywords from server.js
// Request body: { resumeText: string, jobDetails: { title, description, skills } }
// Response: JSON per server's response

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';
const API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (!API_KEY) return new Response(JSON.stringify({ error: 'Server misconfiguration: missing GEMINI_API_KEY' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { resumeText, jobDetails } = await req.json();
    if (!resumeText || !jobDetails) return new Response(JSON.stringify({ error: 'Missing resumeText or jobDetails in request body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${API_KEY}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    let upstreamRaw: string | null = null;
    let data: any = null;
    if (!upstream.ok) {
      upstreamRaw = await upstream.text().catch(() => '');
      // fall back below
    } else {
      try {
        data = await upstream.json();
      } catch (e) {
        upstreamRaw = await upstream.text().catch(() => '');
      }
    }

    const candidate = data?.candidates?.[0];
    let candidateText: any = null;
    if (candidate) {
      candidateText = candidate.content?.parts?.[0]?.text ?? candidate.content?.parts?.[0] ?? null;
    }
    const rawString = candidateText ?? JSON.stringify(data ?? {});
    if (candidateText && typeof candidateText === 'object') {
      return new Response(JSON.stringify(candidateText), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const text = String(rawString).trim();
    try {
      const parsed = JSON.parse(text);
      return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch { /* ignore */ }

    const match = text.match(/{[\s\S]*}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch { /* ignore */ }
    }

    // Fallback heuristic
    try {
      const normalize = (s: string) => s.toString().trim();
      const jobSkillsList = (jobDetails.skills || '')
        .split(',')
        .map(normalize)
        .filter(Boolean);

      const tokenSet = new Set<string>();
      const tokenMatches = String(resumeText || '').match(/\b[A-Za-z0-9+.#\-]{2,}\b/g) || [];
      tokenMatches.forEach((t: string) => tokenSet.add(t.trim()));
      const resumeKeywords = Array.from(tokenSet).slice(0, 200);

      const matchedKeywords = resumeKeywords.filter((rk: string) =>
        jobSkillsList.some((js: string) => rk.toLowerCase() === js.toLowerCase())
      );

      const missingKeywords = jobSkillsList.filter((js: string) =>
        !matchedKeywords.some((mk: string) => mk.toLowerCase() === js.toLowerCase())
      );

      const fallbackResult = {
        resumeKeywords,
        jobKeywords: jobSkillsList,
        matchedKeywords,
        missingKeywords,
        fallback: true,
        note: 'Returned heuristic fallback because LLM response could not be parsed.'
      };

      return new Response(JSON.stringify(fallbackResult), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Keyword extraction failed', details: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Keyword extraction failed', details: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
