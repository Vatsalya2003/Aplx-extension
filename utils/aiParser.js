// AI-powered resume parsing (OpenAI, Gemini, Claude). Optional; local parsing used when disabled or on failure.

const TIMEOUT_MS = 30000;

const SYSTEM_PROMPT = `You are a resume parser. Extract every detail from the resume text and return ONLY a valid JSON object with this exact structure. No markdown, no explanation, no code fences—just the raw JSON object.

{
  "personal": {
    "firstName": "", "lastName": "", "email": "", "phone": "", "countryCode": "", "phoneType": "",
    "address": "", "city": "", "state": "", "location": "", "country": "", "pincode": "",
    "linkedIn": "", "github": "", "portfolio": "", "website": ""
  },
  "education": [{ "school": "", "degree": "", "field": "", "gpa": "", "startDate": "", "endDate": "", "location": "" }],
  "experience": [{ "company": "", "title": "", "location": "", "startDate": "", "endDate": "", "description": "", "isCurrentRole": false }],
  "skills": { "technical": [], "languages": [], "tools": [] },
  "projects": [{ "name": "", "description": "", "technologies": [], "url": "", "startDate": "", "endDate": "" }],
  "certifications": [{ "name": "", "issuer": "", "date": "", "url": "" }]
}

Rules:
- Extract every detail from the resume.
- For phone numbers, put the country code (e.g. +1, +91) in countryCode and the rest in phone.
- For skills: programming languages in technical, spoken/human languages in languages, frameworks/tools/platforms in tools.
- Set isCurrentRole true only if the end date says Present, Current, or similar.
- Keep date formats as they appear in the resume.
- For experience descriptions, include all bullet points joined by newlines.
- Use empty strings or empty arrays where no data. Do not omit keys.`;

/**
 * @param {string} rawText
 * @param {string} provider - 'openai' | 'gemini' | 'claude'
 * @param {string} apiKey
 * @param {string} [model]
 * @returns {Promise<{
 *   personal: object;
 *   education: object[];
 *   experience: object[];
 *   skills: { technical: string[]; languages: string[]; tools: string[] };
 *   projects: object[];
 *   certifications: object[];
 * }>}
 */
export async function parseResumeWithAI(rawText, provider, apiKey, model) {
  const key = (apiKey || '').trim();
  if (!key) {
    throw new Error('Invalid API key');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let responseText = '';

    if (provider === 'openai') {
      responseText = await callOpenAI(rawText, key, model, controller.signal);
    } else if (provider === 'gemini') {
      responseText = await callGemini(rawText, key, model, controller.signal);
    } else if (provider === 'claude') {
      responseText = await callClaude(rawText, key, model, controller.signal);
    } else {
      throw new Error('Unknown AI provider');
    }

    return parseAIResponse(responseText);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    if (err instanceof SyntaxError) {
      throw new Error('AI returned invalid JSON');
    }
    if (err.message) {
      throw err;
    }
    throw new Error('AI parsing failed');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {string} rawText
 * @param {string} apiKey
 * @param {string} [model]
 * @param {AbortSignal} signal
 */
async function callOpenAI(rawText, apiKey, model, signal) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'Parse this resume:\n\n' + rawText },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
    signal,
  });

  if (res.status === 401) throw new Error('Invalid API key');
  if (res.status === 429) throw new Error('Rate limited');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `OpenAI error: ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('AI returned invalid response');
  return content;
}

/**
 * @param {string} rawText
 * @param {string} apiKey
 * @param {string} [model]
 * @param {AbortSignal} signal
 */
async function callGemini(rawText, apiKey, model, signal) {
  const modelId = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: SYSTEM_PROMPT + '\n\nParse this resume:\n\n' + rawText,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
    signal,
  });

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    if (body?.error?.message?.toLowerCase?.().includes('api key')) throw new Error('Invalid API key');
    throw new Error(body?.error?.message || 'Bad request');
  }
  if (res.status === 401) throw new Error('Invalid API key');
  if (res.status === 403) throw new Error('API not enabled – enable "Generative Language API" in Google Cloud Console for your project');
  if (res.status === 429) throw new Error('Rate limited – try again in a moment');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Gemini error: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('AI returned invalid response');
  return text;
}

/**
 * @param {string} rawText
 * @param {string} apiKey
 * @param {string} [model]
 * @param {AbortSignal} signal
 */
async function callClaude(rawText, apiKey, model, signal) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Parse this resume:\n\n' + rawText }],
      temperature: 0.1,
    }),
    signal,
  });

  if (res.status === 401) throw new Error('Invalid API key');
  if (res.status === 429) throw new Error('Rate limited');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Claude error: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('AI returned invalid response');
  return text;
}

/**
 * @param {string} responseText
 * @returns {{
 *   personal: object;
 *   education: object[];
 *   experience: object[];
 *   skills: { technical: string[]; languages: string[]; tools: string[] };
 *   projects: object[];
 *   certifications: object[];
 * }}
 */
function parseAIResponse(responseText) {
  let str = (responseText || '').trim();

  let parsed = tryParse(str);
  if (parsed) return normalizeAIResult(parsed);

  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  parsed = tryParse(str);
  if (parsed) return normalizeAIResult(parsed);

  const first = str.indexOf('{');
  const last = str.lastIndexOf('}');
  if (first !== -1 && last > first) {
    parsed = tryParse(str.slice(first, last + 1));
    if (parsed) return normalizeAIResult(parsed);
  }

  throw new Error('AI returned invalid JSON: ' + responseText.slice(0, 200));
}

/**
 * Test that the API key works with a minimal request.
 * @param {string} provider
 * @param {string} apiKey
 * @param {string} [model]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function testApiKey(provider, apiKey, model) {
  const key = (apiKey || '').trim();
  if (!key) return { ok: false, error: 'Invalid API key' };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
          max_tokens: 5,
        }),
        signal: controller.signal,
      });
      if (res.status === 401) return { ok: false, error: 'Invalid API key' };
      if (!res.ok) return { ok: false, error: `Error ${res.status}` };
      const data = await res.json();
      if (data?.choices?.[0]?.message?.content) return { ok: true };
      return { ok: false, error: 'Invalid response' };
    }
    if (provider === 'gemini') {
      const modelId = model || 'gemini-2.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with exactly: ok' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
          signal: controller.signal,
        }
      );
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body?.error?.message || 'Invalid API key or model' };
      }
      if (res.status === 401) return { ok: false, error: 'Invalid API key' };
      if (res.status === 403) return { ok: false, error: 'API not enabled – go to console.cloud.google.com → APIs & Services → Enable "Generative Language API"' };
      if (res.status === 429) return { ok: false, error: 'Rate limited – try again in a moment' };
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body?.error?.message || `Error ${res.status}` };
      }
      const data = await res.json();
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) return { ok: true };
      return { ok: false, error: 'Invalid response from Gemini' };
    }
    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        }),
        signal: controller.signal,
      });
      if (res.status === 401) return { ok: false, error: 'Invalid API key' };
      if (!res.ok) return { ok: false, error: `Error ${res.status}` };
      const data = await res.json();
      if (data?.content?.[0]?.text) return { ok: true };
      return { ok: false, error: 'Invalid response' };
    }
    return { ok: false, error: 'Unknown provider' };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: 'Timeout' };
    return { ok: false, error: e?.message || 'Request failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {string} str
 * @returns {Record<string, unknown> | null}
 */
function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} raw
 */
function normalizeAIResult(raw) {
  return {
    personal: raw.personal && typeof raw.personal === 'object' ? raw.personal : {},
    education: Array.isArray(raw.education) ? raw.education : [],
    experience: Array.isArray(raw.experience) ? raw.experience : [],
    skills:
      raw.skills && typeof raw.skills === 'object'
        ? {
            technical: Array.isArray(raw.skills.technical) ? raw.skills.technical : [],
            languages: Array.isArray(raw.skills.languages) ? raw.skills.languages : [],
            tools: Array.isArray(raw.skills.tools) ? raw.skills.tools : [],
          }
        : { technical: [], languages: [], tools: [] },
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    certifications: Array.isArray(raw.certifications) ? raw.certifications : [],
  };
}
