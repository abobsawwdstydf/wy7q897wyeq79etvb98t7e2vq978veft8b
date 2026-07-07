export default {
  async fetch(request) {
    var url = new URL(request.url);
    var path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return j({ error: 'POST only' }, 405);
    var secret = request.headers.get('X-Proxy-Secret');
    if (secret !== SECRET) return j({ error: 'Unauthorized' }, 401);
    var body = await request.json();
    if (!body.messages && path.indexOf('/chat') === 0) return j({ error: 'messages required' }, 400);
    var msgs = [{ role: 'system', content: SYS }].concat(body.messages || []);

    if (path === '/chat/auto') {
      var err = '';
      for (var p = 0; p < ORDER.length; p++) {
        try { var r = await call(ORDER[p], msgs, false); var d = await r.json(); return j({ text: d.choices[0].message.content || '', provider: ORDER[p] }); } catch(e) { err = e.message; }
      }
      return j({ error: err || 'All failed' }, 503);
    }

    if (path === '/chat/auto/stream') {
      var err = '';
      for (var p = 0; p < ORDER.length; p++) {
        try { var r = await call(ORDER[p], msgs, true); return sse(r, ORDER[p]); } catch(e) { err = e.message; }
      }
      return j({ error: err || 'All failed' }, 503);
    }

    if (path.indexOf('/chat/prov/') === 0) {
      var pn = path.substring(11);
      var st = url.searchParams.get('stream') === '1';
      if (!PROV[pn]) return j({ error: 'Unknown: ' + pn }, 400);
      try { var r = await call(pn, msgs, st); if (st) return sse(r, pn); var d = await r.json(); return j({ text: d.choices[0].message.content || '', provider: pn }); } catch(e) { return j({ error: e.message }, 502); }
    }

    if (path === '/chat/prov') return j({ providers: Object.keys(PROV), order: ORDER });

    if (path === '/generate-image') {
      var prompt = (body.prompt || '').trim().slice(0, 500);
      if (!prompt) return j({ error: 'prompt required' }, 400);
      var img = await genImg(prompt);
      if (img) return j(img);
      var seed = Math.floor(Math.random() * 1000000);
      return j({ url: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=1024&height=1024&seed=' + seed + '&nologo=true&enhance=true', provider: 'Pollinations.ai' });
    }
    return j({ error: 'Not found' }, 404);
  }
};

var SECRET = 'anwenjawenjinaijowd78dhq239s7ds';
var SYS = 'You are Nexo AI. Reply in Russian briefly. Use markdown.';
var CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Proxy-Secret' };

var KEYS = {
  openrouter: ['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','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','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','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'],
  sambanova: ['e0946016-fe09-4a32-a4a4-0a4584268eac','dfe26ca7-82b3-4e0a-a5ee-de7af735c05e','3068375c-0f8c-49b2-8f53-fba490a5f16b','40e8a357-2656-4a91-944f-b6b0827bef7a'],
  groq: ['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','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','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','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'],
  cerebras: ['csk-mdxptrcxmm6wt3k8w35m8dfemy3yvhtmh43mmehkf4e9dyd9','csk-9dry9yjhf2cjxjcxev892vm5xfp84ncx4jetjdyytdc5cnwt','csk-39d2nt642fhh59m3f6x89cf5cxpdy9cewfxdkf9mr5hrk2c2','csk-mt45x9nd2cr3jnhwykw3teyhh8jf2vj4k2rch8tpd8mp3rc4'],
  fal: ['5a79038e-e1ad-4c77-83dd-28dff50bbb8a:8455c933455f253e07c260f86060dcce','80b31a2c-7d23-4b3a-9a8d-e098aec405e4:3485ecd5081d38e2472bf84d3607a475','21a981ec-5275-4778-9a0c-53f78124f3c9:cdc16c17c993a94213e91f8c9e5a25c8','9027e1ab-bd6f-42d8-ba7f-bc617ab77240:12f6301c1a1d7b18b0ea8fc2c8dfaca4']
};

var PROV = {
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', model: 'gpt-oss-120b' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  sambanova: { url: 'https://api.sambanova.ai/v1/chat/completions', model: 'Meta-Llama-3.3-70B-Instruct' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-oss-120b:free' }
};
var ORDER = ['cerebras', 'groq', 'sambanova', 'openrouter'];
var ki = {};

function getKey(n) { var k = KEYS[n] || []; if (!k.length) return null; var i = (ki[n] || 0) % k.length; ki[n] = i + 1; return k[i]; }
function j(d, s) { return new Response(JSON.stringify(d), { status: s || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) }); }

async function call(name, msgs, stream) {
  var c = PROV[name]; if (!c) throw new Error('No provider: ' + name);
  var key = getKey(name); if (!key) throw new Error('No key: ' + name);
  var body = { model: c.model, messages: msgs, stream: stream, temperature: 0.7, max_tokens: 2048 };
  if (name === 'cerebras') { body.max_completion_tokens = 2048; delete body.max_tokens; }
  var h = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
  if (name === 'openrouter') { h['HTTP-Referer'] = 'https://nexo.cloudpub.ru'; h['X-Title'] = 'Nexo AI'; }
  var ctrl = new AbortController(); var tid = setTimeout(function() { ctrl.abort(); }, 30000);
  var r = await fetch(c.url, { method: 'POST', headers: h, body: JSON.stringify(body), signal: ctrl.signal });
  clearTimeout(tid);
  if (!r.ok) { var t = ''; try { t = await r.text(); } catch(e) {} throw new Error(name + ' ' + r.status + ': ' + t.slice(0, 200)); }
  return r;
}

function sse(r, name) {
  var ts = new TransformStream(); var w = ts.writable.getWriter(); var d = new TextDecoder(); var rd = r.body.getReader();
  (async function() {
    try { while (true) { var res = await rd.read(); if (res.done) break; var lines = d.decode(res.value, { stream: true }).split('\n'); for (var k = 0; k < lines.length; k++) { if (lines[k].indexOf('data: ') === 0 && lines[k] !== 'data: [DONE]') { try { var o = JSON.parse(lines[k].substring(6)); if (o.choices && o.choices[0] && o.choices[0].delta && o.choices[0].delta.content) { await w.write(new TextEncoder().encode('data:' + JSON.stringify({ token: o.choices[0].delta.content }) + '\n\n')); } } catch(e) {} } } } await w.write(new TextEncoder().encode('data:' + JSON.stringify({ done: true, provider: name }) + '\n\n'));
    } catch(e) { await w.write(new TextEncoder().encode('data:' + JSON.stringify({ error: 'Stream error' }) + '\n\n')); }
    await w.close();
  })();
  return new Response(ts.readable, { headers: Object.assign({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }, CORS) });
}

async function genImg(prompt) {
  for (var i = 0; i < 4; i++) {
    var key = getKey('fal'); if (!key) break;
    try {
      var ctrl = new AbortController(); var tid = setTimeout(function() { ctrl.abort(); }, 60000);
      var r = await fetch('https://fal.run/fal-ai/flux/schnell', { method: 'POST', headers: { 'Authorization': 'Key ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt, image_size: 'landscape_16_9', num_inference_steps: 4, num_images: 1, enable_safety_checker: false }), signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) { var d = await r.json(); var imgs = d.images || d.data || []; if (imgs.length > 0) { var u = imgs[0].url || imgs[0]; if (u) return { url: u, provider: 'Fal.ai (Flux Schnell)' }; } }
    } catch(e) {}
  }
  return null;
}