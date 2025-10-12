// @ts-nocheck
// Supabase Edge Function: diag
// Mirrors GET /api/diag from server.js

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (!API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY is missing from environment (.env)', env: { GEMINI_API_KEY: false } }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const prompt = 'health-check: respond with OK';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${API_KEY}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    let bodyText: string | null = null;
    let bodyJson: any = null;
    try {
      bodyJson = await upstream.clone().json();
    } catch {
      bodyText = await upstream.text().catch(() => null);
    }

    return new Response(JSON.stringify({ ok: upstream.ok, status: upstream.status, body: bodyJson ?? bodyText, env: { GEMINI_API_KEY: true } }), { status: upstream.ok ? 200 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
