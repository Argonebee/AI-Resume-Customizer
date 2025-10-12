// @ts-nocheck
// Supabase Edge Function: customize
// Mirrors POST /api/customize from server.js
// Request body: { resumeText: string, jobDetails: { title, description, skills } }
// Response: { customizedResume: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';
const API_KEY = Deno.env.get('GEMINI_API_KEY');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: missing GEMINI_API_KEY' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { resumeText, jobDetails } = await req.json();
    if (!resumeText || !jobDetails) {
      return new Response(JSON.stringify({ error: 'Missing resumeText or jobDetails' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const prompt = `
You are an expert resume editor. Given the user's resume and job details, extract only relevant skills, experiences, and qualifications that match the job description. Enhance wording but do not invent new info.
Return only the customized resume in Markdown.

Resume:
${resumeText}

Job Title: ${jobDetails.title}
Job Description: ${jobDetails.description}
Key Skills/Requirements: ${jobDetails.skills}
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${API_KEY}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!upstream.ok) {
      const raw = await upstream.text().catch(() => '');
      return new Response(JSON.stringify({ error: 'Upstream LLM error', status: upstream.status, details: raw }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await upstream.json();
    const customizedResume = data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content?.parts?.[0] || '';
    return new Response(JSON.stringify({ customizedResume }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'AI request failed', details: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
