const KEYS: Record<string, string[]> = {
  openrouter: [
    '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',
    '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',
    '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',
    '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',
  ],
  sambanova: [
    'e0946016-fe09-4a32-a4a4-0a4584268eac',
    'dfe26ca7-82b3-4e0a-a5ee-de7af735c05e',
    '3068375c-0f8c-49b2-8f53-fba490a5f16b',
    '40e8a357-2656-4a91-944f-b6b0827bef7a',
  ],
  groq: [
    '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',
    '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',
    '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',
    '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',
  ],
  cerebras: [
    'csk-mdxptrcxmm6wt3k8w35m8dfemy3yvhtmh43mmehkf4e9dyd9',
    'csk-9dry9yjhf2cjxjcxev892vm5xfp84ncx4jetjdyytdc5cnwt',
    'csk-39d2nt642fhh59m3f6x89cf5cxpdy9cewfxdkf9mr5hrk2c2',
    'csk-mt45x9nd2cr3jnhwykw3teyhh8jf2vj4k2rch8tpd8mp3rc4',
  ],
};

const SECRET = 'anwenjawenjinaijowd78dhq239s7ds';

const SYSTEM_PROMPT = `Ты — Нексо AI, умный и дружелюбный ассистент мессенджера Нексо.

Правила:
- Отвечай кратко и по делу
- Если пользователь пишет "ну ты понял" или подобное — отвечай с юмором
- Пиши на русском языке, если пользователь не указал другой язык
- Используй markdown для форматирования (жирный, курсив, списки, код)
- Для блоков кода используй тройные кавычки с указанием языка`;

const PROVIDERS: Record<string, { url: string; model: string; modelSimple?: string }> = {
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', model: 'qwen-3-235b-a22b-instruct-2507', modelSimple: 'llama3.1-8b' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  sambanova: { url: 'https://api.sambanova.ai/v1/chat/completions', model: 'Meta-Llama-3.1-70B-Instruct' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'mistralai/mistral-7b-instruct:free' },
};

const keyIdx: Record<string, number> = {};
function getKey(name: string): string | null {
  const keys = KEYS[name] || [];
  if (!keys.length) return null;
  const i = (keyIdx[name] || 0) % keys.length;
  keyIdx[name] = i + 1;
  return keys[i];
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Secret',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST')
      return json({ error: 'POST only' }, 405);

    const secret = request.headers.get('X-Proxy-Secret');
    if (secret !== SECRET)
      return json({ error: 'Unauthorized' }, 401);

    // === CHAT ===
    if (url.pathname === '/chat' || url.pathname === '/chat/stream') {
      const body: { messages?: Array<{ role: string; content: string }> } = await request.json();
      if (!body.messages) return json({ error: 'messages required' }, 400);

      const stream = url.pathname === '/chat/stream';
      const isSimple = (body.messages[body.messages.length - 1]?.content || '').length < 100;
      const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...body.messages];
      const order = ['cerebras', 'groq', 'sambanova', 'openrouter'];
      let lastErr = '';

      for (const name of order) {
        const cfg = PROVIDERS[name];
        const key = getKey(name);
        if (!key) continue;

        const model = isSimple && cfg.modelSimple ? cfg.modelSimple : cfg.model;
        const reqBody: Record<string, unknown> = { model, messages: msgs, stream, temperature: 0.7, max_tokens: 2048 };
        if (name === 'cerebras') { reqBody.max_completion_tokens = 2048; delete reqBody.max_tokens; }

        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
        if (name === 'openrouter') { headers['HTTP-Referer'] = 'https://nexo.cloudpub.ru'; headers['X-Title'] = 'Нексо AI'; }

        try {
          const r = await fetch(cfg.url, { method: 'POST', headers, body: JSON.stringify(reqBody), signal: AbortSignal.timeout(45000) });

          if (!r.ok) {
            lastErr = name + ' ' + r.status;
            if (r.status === 429 || r.status >= 500) continue;
            return json({ error: lastErr }, r.status);
          }

          if (stream) {
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const dec = new TextDecoder();
            const reader = r.body!.getReader();
            (async () => {
              let full = '';
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  for (const line of dec.decode(value, { stream: true }).split('\n')) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                      try {
                        const j: { choices?: Array<{ delta?: { content?: string } }> } = JSON.parse(line.slice(6));
                        const c = j.choices?.[0]?.delta?.content;
                        if (c) { full += c; await writer.write(new TextEncoder().encode('data:' + JSON.stringify({ token: c }) + '\n\n')); }
                      } catch {}
                    }
                  }
                }
                await writer.write(new TextEncoder().encode('data:' + JSON.stringify({ done: true, text: full }) + '\n\n'));
              } catch { await writer.write(new TextEncoder().encode('data:' + JSON.stringify({ error: 'Stream error' }) + '\n\n')); }
              await writer.close();
            })();
            return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...CORS } });
          }

          const data: { choices?: Array<{ message?: { content?: string } }> } = await r.json();
          return json({ text: data.choices?.[0]?.message?.content || '' });
        } catch (e: unknown) { lastErr = name + ': ' + (e instanceof Error ? e.message : String(e)); }
      }
      return json({ error: lastErr || 'All providers failed' }, 503);
    }

    // === IMAGE ===
    if (url.pathname === '/generate-image') {
      const body: { prompt?: string } = await request.json();
      const prompt = (body.prompt || '').trim().slice(0, 500);
      if (!prompt) return json({ error: 'prompt required' }, 400);

      const falKey = getKey('fal');
      if (falKey) {
        try {
          const r = await fetch('https://fal.run/fal-ai/flux/schnell', {
            method: 'POST',
            headers: { 'Authorization': 'Key ' + falKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, image_size: 'square_hd', num_inference_steps: 4, num_images: 1 }),
            signal: AbortSignal.timeout(60000),
          });
          if (r.ok) {
            const d: { images?: Array<{ url?: string }> } = await r.json();
            const u = d.images?.[0]?.url;
            if (u) return json({ url: u, provider: 'Fal.ai' });
          }
        } catch {}
      }

      const seed = Math.floor(Math.random() * 1000000);
      return json({ url: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&seed=' + seed + '&nologo=true', provider: 'Pollinations.ai' });
    }

    return json({ error: 'Not found' }, 404);
  },
};
