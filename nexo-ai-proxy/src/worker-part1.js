export default {
  async fetch(request) {
    var url = new URL(request.url);
    var path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Secret' } });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    var secret = request.headers.get('X-Proxy-Secret');
    if (secret !== SECRET) return json({ error: 'Unauthorized' }, 401);

    var body = await request.json();
    if (!body.messages && path.indexOf('/chat') === 0) return json({ error: 'messages required' }, 400);
    var msgs = [{ role: 'system', content: SYSTEM_PROMPT }].concat(body.messages || []);

    if (path === '/chat/auto') {
      var lastErr = '';
      for (var p = 0; p < PROVIDER_ORDER.length; p++) {
        var name = PROVIDER_ORDER[p];
        try {
          var r = await callProvider(name, msgs, false);
          var data = await r.json();
          var text = (data.choices && data.choices[0] && data.choices[0].message) ? (data.choices[0].message.content || '') : '';
          return json({ text: text, provider: name });
        } catch(e) { lastErr = e.message || String(e); }
      }
      return json({ error: lastErr || 'All providers failed' }, 503);
    }

    if (path === '/chat/auto/stream') {
      var lastErr = '';
      for (var p = 0; p < PROVIDER_ORDER.length; p++) {
        var name = PROVIDER_ORDER[p];
        try {
          var r = await callProvider(name, msgs, true);
          return streamResponse(r, name);
        } catch(e) { lastErr = e.message || String(e); }
      }
      return json({ error: lastErr || 'All providers failed' }, 503);
    }

    if (path.indexOf('/chat/prov/') === 0) {
      var provName = path.substring('/chat/prov/'.length);
      var isStream = url.searchParams.get('stream') === '1';
      if (!PROVIDERS[provName]) return json({ error: 'Unknown: ' + provName }, 400);
      try {
        var r = await callProvider(provName, msgs, isStream);
        if (isStream) return streamResponse(r, provName);
        var data = await r.json();
        var text = (data.choices && data.choices[0] && data.choices[0].message) ? (data.choices[0].message.content || '') : '';
        return json({ text: text, provider: provName });
      } catch(e) {
        return json({ error: e.message || String(e) }, 502);
      }
    }

    if (path === '/chat/prov') {
      return json({ providers: PROVIDERS, order: PROVIDER_ORDER });
    }

    if (path === '/generate-image') {
      var prompt = (body.prompt || '').trim().slice(0, 500);
      if (!prompt) return json({ error: 'prompt required' }, 400);
      var result = await generateImage(prompt);
      if (result) return json(result);
      var seed = Math.floor(Math.random() * 1000000);
      return json({ url: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&seed=' + seed + '&nologo=true&enhance=true', provider: 'Pollinations.ai' });
    }

    return json({ error: 'Not found' }, 404);
  }
};
