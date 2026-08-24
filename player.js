(() => {
  'use strict';

  const VERSION = '0.1.0';
  const selfSrc = (document.currentScript && document.currentScript.src) || globalThis.__RADIKO_PLAYER_URL || '';
  const BASE = globalThis.__RADIKO_PLAYER_BASE || (selfSrc ? new URL('.', selfSrc).href : '');
  if (!BASE) throw new Error('プレイヤーの配布元URLを判定できませんでした。');

  document.documentElement.lang = 'ja';
  document.title = 'Radiko Pages Player';
  const style = document.createElement('style');
  style.textContent = `
    :root{color-scheme:dark;--bg:#0b1020;--card:#151c32;--line:#293454;--text:#f4f7ff;--muted:#aeb8d4;--accent:#70a5ff;--ok:#5dd6a0;--warn:#ffc857;--bad:#ff718d}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#1c2850 0,#0b1020 48%);color:var(--text);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(680px,100%);margin:auto;padding:22px 16px 36px}.card{background:rgba(21,28,50,.96);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 18px 50px #0007}
    h1{font-size:24px;margin:0 0 4px}.sub{margin:0 0 18px;color:var(--muted);font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:540px){.grid{grid-template-columns:1fr}}
    label{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}select,button,input{font:inherit}select{width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:#0e1528;color:var(--text)}select:disabled{opacity:.58}
    .actions{display:flex;gap:10px;margin-top:16px}.primary,.secondary{border:0;border-radius:999px;padding:11px 20px;font-weight:700;cursor:pointer}.primary{background:var(--accent);color:#071226}.secondary{background:#2a3555;color:var(--text)}button:disabled{cursor:not-allowed;opacity:.5}
    .status{margin:16px 0 10px;padding:12px 14px;border-radius:12px;background:#0e1528;border:1px solid var(--line)}.status.ok{border-color:#276b53;color:var(--ok)}.status.warn{border-color:#77602b;color:var(--warn)}.status.bad{border-color:#7c3042;color:var(--bad)}
    .meter{display:flex;align-items:center;gap:10px;margin:12px 0}.meter input{width:100%}.small{font-size:12px;color:var(--muted)}
    details{margin-top:16px;border-top:1px solid var(--line);padding-top:12px}summary{cursor:pointer;color:var(--muted)}pre{white-space:pre-wrap;word-break:break-word;max-height:210px;overflow:auto;background:#090e1b;padding:10px;border-radius:10px;color:#c7d2ee;font-size:11px}
    .badge{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:4px 9px;border-radius:999px;background:#101a31;color:var(--muted);font-size:11px}.dot{width:7px;height:7px;border-radius:50%;background:var(--warn)}.playing .dot{background:var(--ok);box-shadow:0 0 10px var(--ok)}
  `;
  document.head.appendChild(style);
  document.body.innerHTML = `
    <main><section class="card">
      <h1>📻 Radiko Pages Player</h1>
      <p class="sub">バックエンドなし・変換なし。AACをブラウザ内のWASMで直接再生します。</p>
      <div class="grid">
        <div><label for="area">地域</label><select id="area" disabled><option>読込中…</option></select></div>
        <div><label for="station">放送局</label><select id="station" disabled><option>読込中…</option></select></div>
      </div>
      <div class="actions"><button id="play" class="primary" disabled>▶ 再生</button><button id="stop" class="secondary" disabled>■ 停止</button></div>
      <div id="status" class="status warn">プレイヤーを準備しています…</div>
      <div class="meter"><span>🔈</span><input id="volume" type="range" min="0" max="1" step="0.01" value="0.85" aria-label="音量"><span>🔊</span></div>
      <div id="badge" class="badge"><span class="dot"></span><span id="stats">WASM準備中</span></div>
      <p class="small">このウィンドウを閉じると再生は停止します。非公式・個人利用向けです。</p>
      <details><summary>技術ログ</summary><pre id="log"></pre></details>
    </section></main>`;

  const $ = (id) => document.getElementById(id);
  const areaEl = $('area');
  const stationEl = $('station');
  const playEl = $('play');
  const stopEl = $('stop');
  const statusEl = $('status');
  const volumeEl = $('volume');
  const statsEl = $('stats');
  const badgeEl = $('badge');
  const logEl = $('log');

  const debug = {
    version: VERSION, base: BASE, ready: false, active: false, status: 'loading',
    requestedArea: null, confirmedArea: null, station: null, authCount: 0,
    playlistFetches: 0, playlistErrors: 0, segmentsFetched: 0,
    segmentsDecoded: 0, pcmBytes: 0, scheduledBuffers: 0,
    scheduledSeconds: 0, scheduledAhead: 0, underruns: 0,
    lastSampleRate: 0, lastChannels: 0, lastRms: 0, lastSegment: null,
    decoderVersion: null, error: null
  };
  globalThis.__RADIKO_DEBUG = debug;

  const state = {
    data: null, runId: 0, active: false, controller: null,
    ctx: null, gain: null, decoder: null, decodeOutput: null,
    mediaUrl: null, queue: [], seen: new Set(), sources: new Set(),
    nextStart: 0, auth: new Map(), initialPlaylist: true
  };

  function setStatus(text, kind = 'warn') {
    statusEl.textContent = text;
    statusEl.className = `status ${kind}`;
    debug.status = text;
  }
  function log(message) {
    const stamp = new Date().toLocaleTimeString('ja-JP', {hour12:false});
    const lines = (`[${stamp}] ${message}\n` + logEl.textContent).split('\n').slice(0, 80);
    logEl.textContent = lines.join('\n');
    console.log('[Radiko Pages Player]', message);
  }
  function updateStats() {
    if (!debug.ready) { statsEl.textContent = 'WASM準備中'; return; }
    if (!state.active) { statsEl.textContent = `準備完了 · decoder ${debug.decoderVersion || ''}`; return; }
    const ahead = state.ctx ? Math.max(0, state.nextStart - state.ctx.currentTime) : 0;
    debug.scheduledAhead = Number(ahead.toFixed(2));
    statsEl.textContent = `${debug.segmentsDecoded} segment · buffer ${ahead.toFixed(1)}s · ${debug.lastSampleRate || '-'}Hz`;
  }
  const statsTimer = setInterval(updateStats, 500);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`読込失敗: ${src}`));
      document.head.appendChild(script);
    });
  }
  function storageGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }

  const readyPromise = (async () => {
    await loadScript(`${BASE}data.js?v=${VERSION}`);
    state.data = globalThis.RadikoStaticData;
    if (!state.data || !state.data.fullKey) throw new Error('静的データが不正です。');
    renderAreas();
    setStatus('AAC/WASMデコーダーを読み込んでいます…', 'warn');
    await loadScript(`${BASE}vendor/aac.js?v=${VERSION}`);
    if (!globalThis.Module || !Module.AAC_ADTS_DECODER) throw new Error('AACデコーダーを初期化できません。');
    await Module.AAC_ADTS_DECODER.prototype.ready;
    const probe = new Module.AAC_ADTS_DECODER({onDecode: () => {}});
    await probe.ready;
    debug.decoderVersion = probe.api.getDecoderVersion();
    probe.free();
    debug.ready = true;
    playEl.disabled = false;
    areaEl.disabled = false;
    stationEl.disabled = false;
    setStatus('準備完了。地域と放送局を選んで再生してください。', 'ok');
    updateStats();
    log(`準備完了: AAC decoder ${debug.decoderVersion}`);
  })().catch((error) => {
    debug.error = String(error && error.stack || error);
    setStatus(`準備に失敗しました: ${error.message || error}`, 'bad');
    log(debug.error);
    throw error;
  });

  function renderAreas() {
    const saved = storageGet('radiko-pages-player.area');
    areaEl.innerHTML = '';
    for (const area of state.data.areas) {
      const option = document.createElement('option');
      option.value = area.id;
      option.textContent = `${area.id} · ${area.name}`;
      areaEl.appendChild(option);
    }
    areaEl.value = state.data.areas.some((x) => x.id === saved) ? saved : 'JP13';
    renderStations();
  }
  function renderStations() {
    if (!state.data) return;
    const area = areaEl.value;
    const saved = storageGet(`radiko-pages-player.station.${area}`);
    const stations = state.data.stations.filter((s) => s.areas.includes(area));
    stationEl.innerHTML = '';
    for (const station of stations) {
      const option = document.createElement('option');
      option.value = station.id;
      option.textContent = `${station.name} (${station.id})`;
      stationEl.appendChild(option);
    }
    const fallback = area === 'JP13' && stations.some((s) => s.id === 'FMT') ? 'FMT' : stations[0]?.id;
    stationEl.value = stations.some((s) => s.id === saved) ? saved : fallback;
  }
  areaEl.addEventListener('change', () => {
    storageSet('radiko-pages-player.area', areaEl.value);
    renderStations();
  });
  stationEl.addEventListener('change', () => storageSet(`radiko-pages-player.station.${areaEl.value}`, stationEl.value));

  function randomHex(bytes) {
    const data = new Uint8Array(bytes); crypto.getRandomValues(data);
    return [...data].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  let decodedFullKey = null;
  function partialKey(offset, length) {
    if (decodedFullKey === null) decodedFullKey = atob(state.data.fullKey);
    return btoa(decodedFullKey.slice(offset, offset + length));
  }
  async function responseError(response) {
    try { return (await response.text()).slice(0, 300); } catch (_) { return ''; }
  }
  async function authenticate(areaId, force = false) {
    const cached = state.auth.get(areaId);
    if (!force && cached && cached.refreshAt > Date.now()) return cached;
    const area = state.data.areas.find((x) => x.id === areaId);
    if (!area) throw new Error(`地域が不正です: ${areaId}`);
    log(`${area.name}として認証を開始`);
    const auth1 = await fetch('https://api.radiko.jp/apparea/auth1', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({app_id:state.data.appId, app_version:state.data.appVersion, user_id:randomHex(8), device:'android'}),
      signal: state.controller?.signal,
      cache: 'no-store'
    });
    if (!auth1.ok) throw new Error(`auth1 HTTP ${auth1.status}: ${await responseError(auth1)}`);
    const one = await auth1.json();
    const token = one?.auth_token_info?.auth_token;
    if (!token) throw new Error('auth1にトークンがありません。');
    const key = partialKey(Number(one.key_offset), Number(one.key_length));
    const auth2 = await fetch('https://api.radiko.jp/apparea/auth2', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({auth_token:token, partial_key:key, connection:'wifi', location:{latitude:area.lat, longitude:area.lon}}),
      signal: state.controller?.signal,
      cache: 'no-store'
    });
    if (!auth2.ok) throw new Error(`auth2 HTTP ${auth2.status}: ${await responseError(auth2)}`);
    const two = await auth2.json();
    const confirmed = two?.areas?.[0]?.area_id;
    if (confirmed !== areaId) throw new Error(`地域認証の不一致: requested=${areaId}, returned=${confirmed || 'none'}`);
    const result = {token, area:areaId, refreshAt:Date.now() + 65 * 60 * 1000};
    state.auth.set(areaId, result);
    debug.authCount++;
    debug.confirmedArea = confirmed;
    log(`認証成功: ${confirmed} ${two.areas[0].area_name || ''}`);
    return result;
  }

  async function fetchAuthed(url, areaId, init = {}, retried = false) {
    const auth = await authenticate(areaId, retried);
    const response = await fetch(url, {
      ...init,
      headers: {...(init.headers || {}), 'X-Radiko-AuthToken':auth.token, 'X-Radiko-AreaId':areaId},
      signal: state.controller?.signal,
      cache: 'no-store'
    });
    if (!retried && (response.status === 401 || response.status === 403)) {
      log(`playlist HTTP ${response.status}; 再認証します`);
      return fetchAuthed(url, areaId, init, true);
    }
    return response;
  }
  function firstUri(text, base) {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line && !line.startsWith('#')) return new URL(line, base).href;
    }
    return null;
  }
  async function openStream(stationId, areaId) {
    const lsid = randomHex(16);
    const bases = [
      'https://si-f-radiko.smartstream.ne.jp/so/playlist.m3u8',
      'https://dr-wowza.radiko-cf.com/so/playlist.m3u8'
    ];
    let lastError;
    for (const base of bases) {
      try {
        const url = new URL(base);
        url.search = new URLSearchParams({station_id:stationId, l:'15', lsid, type:'b'}).toString();
        const response = await fetchAuthed(url.href, areaId);
        if (!response.ok) throw new Error(`master HTTP ${response.status}`);
        const text = await response.text();
        if (text.includes('#EXTINF:')) return {mediaUrl:url.href, initialText:text};
        const mediaUrl = firstUri(text, url.href);
        if (!mediaUrl) throw new Error('master playlistにURLがありません。');
        log(`playlist取得: ${new URL(mediaUrl).host}`);
        return {mediaUrl, initialText:null};
      } catch (error) {
        lastError = error;
        log(`playlist候補失敗: ${error.message || error}`);
      }
    }
    throw lastError || new Error('playlistを取得できません。');
  }
  function parseMedia(text, base) {
    const lines = text.split(/\r?\n/).map((x) => x.trim());
    let sequence = 0, index = 0, duration = 4.608, targetDuration = 5;
    const items = [];
    for (const line of lines) {
      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) sequence = Number(line.split(':')[1]) || 0;
      else if (line.startsWith('#EXT-X-TARGETDURATION:')) targetDuration = Number(line.split(':')[1]) || targetDuration;
      else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]) || duration;
      else if (line && !line.startsWith('#')) {
        const url = new URL(line, base).href;
        items.push({url, sequence:sequence + index, duration, retries:0});
        index++; duration = 4.608;
      }
    }
    return {items, targetDuration};
  }
  function enqueuePlaylist(parsed, initial) {
    const candidates = initial ? parsed.items.slice(-3) : parsed.items;
    if (initial) for (const item of parsed.items.slice(0, -3)) state.seen.add(item.url);
    for (const item of candidates) {
      if (state.seen.has(item.url)) continue;
      state.seen.add(item.url);
      state.queue.push(item);
    }
    if (state.seen.size > 2000) state.seen = new Set([...state.seen].slice(-1000));
  }
  async function refreshPlaylist(areaId, initialText = null, initial = false) {
    let text = initialText;
    if (text === null) {
      const response = await fetchAuthed(state.mediaUrl, areaId);
      if (!response.ok) throw new Error(`media playlist HTTP ${response.status}`);
      text = await response.text();
    }
    debug.playlistFetches++;
    const parsed = parseMedia(text, state.mediaUrl);
    if (!parsed.items.length) throw new Error('media playlistにsegmentがありません。');
    enqueuePlaylist(parsed, initial);
    return parsed.targetDuration;
  }

  function stripId3(bytes) {
    let offset = 0;
    while (offset + 10 <= bytes.length && bytes[offset] === 0x49 && bytes[offset+1] === 0x44 && bytes[offset+2] === 0x33) {
      const size = ((bytes[offset+6] & 0x7f) << 21) | ((bytes[offset+7] & 0x7f) << 14) | ((bytes[offset+8] & 0x7f) << 7) | (bytes[offset+9] & 0x7f);
      const footer = (bytes[offset+5] & 0x10) ? 10 : 0;
      offset += 10 + size + footer;
    }
    return bytes.subarray(offset);
  }
  function parseAdts(bytes) {
    const rates = [96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
    let i = 0, frames = 0, coreRate = 0, channels = 0;
    while (i + 7 <= bytes.length) {
      if (bytes[i] !== 0xff || (bytes[i+1] & 0xf6) !== 0xf0) throw new Error(`ADTS sync不一致 at ${i}`);
      const rateIndex = (bytes[i+2] & 0x3c) >> 2;
      const config = ((bytes[i+2] & 1) << 2) | ((bytes[i+3] & 0xc0) >> 6);
      const frameLength = ((bytes[i+3] & 3) << 11) | (bytes[i+4] << 3) | ((bytes[i+5] & 0xe0) >> 5);
      if (!frameLength || i + frameLength > bytes.length) throw new Error(`ADTS frame長が不正 at ${i}`);
      if (!coreRate) { coreRate = rates[rateIndex] || 0; channels = config || 2; }
      frames++; i += frameLength;
    }
    if (!frames || !coreRate) throw new Error('ADTS frameを検出できません。');
    return {frames, coreRate, channels};
  }
  function pcmToAudioBuffer(pcm, adtsInfo) {
    const channels = adtsInfo.channels || 2;
    const sampleValues = Math.floor(pcm.byteLength / 2);
    const frameCount = Math.floor(sampleValues / channels);
    const ratio = frameCount / (adtsInfo.frames * 1024);
    const sampleRate = adtsInfo.coreRate * (ratio > 1.45 ? 2 : 1);
    const buffer = state.ctx.createBuffer(channels, frameCount, sampleRate);
    const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
    const samples = littleEndian ? new Int16Array(pcm.buffer, pcm.byteOffset, sampleValues) : null;
    const view = littleEndian ? null : new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    let energy = 0, count = 0;
    const outputs = Array.from({length:channels}, (_, c) => buffer.getChannelData(c));
    for (let i = 0; i < frameCount; i++) {
      for (let c = 0; c < channels; c++) {
        const pos = i * channels + c;
        const value = (samples ? samples[pos] : view.getInt16(pos * 2, true)) / 32768;
        outputs[c][i] = value;
        if ((pos & 31) === 0) { energy += value * value; count++; }
      }
    }
    debug.lastSampleRate = sampleRate;
    debug.lastChannels = channels;
    debug.lastRms = Number(Math.sqrt(energy / Math.max(1, count)).toFixed(6));
    return buffer;
  }
  function schedule(buffer) {
    const now = state.ctx.currentTime;
    if (state.nextStart < now + 0.08) {
      if (debug.scheduledBuffers) debug.underruns++;
      state.nextStart = now + 0.12;
    }
    const source = state.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(state.gain);
    const start = state.nextStart;
    source.start(start);
    state.nextStart += buffer.duration;
    state.sources.add(source);
    source.onended = () => state.sources.delete(source);
    debug.scheduledBuffers++;
    debug.scheduledSeconds = Number((debug.scheduledSeconds + buffer.duration).toFixed(3));
    debug.scheduledAhead = Number((state.nextStart - now).toFixed(3));
  }
  async function consumeLoop(runId) {
    while (state.active && state.runId === runId) {
      if (!state.queue.length || (state.ctx && state.nextStart - state.ctx.currentTime > 20)) {
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }
      const item = state.queue.shift();
      try {
        const response = await fetch(item.url, {signal:state.controller.signal, cache:'no-store', credentials:'omit'});
        if (!response.ok) throw new Error(`segment HTTP ${response.status}`);
        const packed = new Uint8Array(await response.arrayBuffer());
        debug.segmentsFetched++;
        debug.lastSegment = item.url;
        const adts = stripId3(packed);
        const info = parseAdts(adts);
        state.decodeOutput = null;
        state.decoder.decode(adts);
        const decoded = state.decodeOutput;
        if (!decoded || !decoded.pcm || !decoded.pcm.byteLength) throw new Error('AAC decoderがPCMを返しませんでした。');
        const audioBuffer = pcmToAudioBuffer(decoded.pcm, info);
        schedule(audioBuffer);
        debug.segmentsDecoded++;
        debug.pcmBytes += decoded.pcm.byteLength;
        if (debug.segmentsDecoded === 1) {
          setStatus(`再生中: ${stationEl.options[stationEl.selectedIndex]?.textContent || stationEl.value}`, 'ok');
          badgeEl.classList.add('playing');
        }
        updateStats();
      } catch (error) {
        if (!state.active || error?.name === 'AbortError') break;
        item.retries = (item.retries || 0) + 1;
        log(`segment処理失敗 (${item.retries}): ${error.message || error}`);
        if (item.retries <= 2) state.queue.unshift(item);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  async function pollLoop(runId, areaId, stationId, intervalSeconds) {
    let failures = 0;
    while (state.active && state.runId === runId) {
      await new Promise((r) => setTimeout(r, Math.max(1200, intervalSeconds * 450)));
      if (!state.active || state.runId !== runId) break;
      try {
        await refreshPlaylist(areaId);
        failures = 0;
      } catch (error) {
        if (!state.active || error?.name === 'AbortError') break;
        failures++; debug.playlistErrors++;
        log(`playlist更新失敗 (${failures}): ${error.message || error}`);
        if (failures >= 3) {
          try {
            const reopened = await openStream(stationId, areaId);
            state.mediaUrl = reopened.mediaUrl;
            await refreshPlaylist(areaId, reopened.initialText, false);
            failures = 0;
          } catch (reopenError) { log(`playlist再接続失敗: ${reopenError.message || reopenError}`); }
        }
      }
    }
  }

  function resetDebug(areaId, stationId) {
    Object.assign(debug, {
      active:true, status:'starting', requestedArea:areaId, confirmedArea:null, station:stationId,
      playlistFetches:0, playlistErrors:0, segmentsFetched:0, segmentsDecoded:0,
      pcmBytes:0, scheduledBuffers:0, scheduledSeconds:0, scheduledAhead:0,
      underruns:0, lastSampleRate:0, lastChannels:0, lastRms:0, lastSegment:null, error:null
    });
  }
  async function start() {
    if (state.active) return;
    const areaId = areaEl.value;
    const stationId = stationEl.value;
    if (!areaId || !stationId) throw new Error('地域または放送局が未選択です。');

    state.runId++;
    const runId = state.runId;
    state.active = true;
    state.controller = new AbortController();
    state.queue = [];
    state.seen = new Set();
    state.sources = new Set();
    state.nextStart = 0;
    resetDebug(areaId, stationId);
    areaEl.disabled = true; stationEl.disabled = true; playEl.disabled = true; stopEl.disabled = false;
    storageSet('radiko-pages-player.area', areaId);
    storageSet(`radiko-pages-player.station.${areaId}`, stationId);
    setStatus('初期化しています…', 'warn');

    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio APIに対応していません。');
    state.ctx = new AudioCtx({latencyHint:'playback'});
    state.gain = state.ctx.createGain();
    state.gain.gain.value = Number(volumeEl.value);
    state.gain.connect(state.ctx.destination);
    await state.ctx.resume();
    await readyPromise;
    if (!state.active || state.runId !== runId) return;

    state.decodeOutput = null;
    state.decoder = new Module.AAC_ADTS_DECODER({onDecode:(value) => { state.decodeOutput = value; }});
    await state.decoder.ready;
    setStatus('地域認証中…', 'warn');
    await authenticate(areaId);
    if (!state.active || state.runId !== runId) return;
    setStatus('ライブ配信へ接続中…', 'warn');
    const opened = await openStream(stationId, areaId);
    state.mediaUrl = opened.mediaUrl;
    const interval = await refreshPlaylist(areaId, opened.initialText, true);
    if (!state.queue.length) throw new Error('再生待ちsegmentを取得できませんでした。');
    setStatus('AACをデコードしてバッファしています…', 'warn');
    consumeLoop(runId).catch((error) => fatal(error));
    pollLoop(runId, areaId, stationId, interval).catch((error) => fatal(error));
  }
  async function stop(message = '停止しました。', kind = 'warn') {
    if (!state.active && !state.ctx) return;
    state.active = false;
    debug.active = false;
    state.runId++;
    try { state.controller?.abort(); } catch (_) {}
    for (const source of state.sources) { try { source.stop(); } catch (_) {} }
    state.sources.clear();
    if (state.decoder) { try { state.decoder.free(); } catch (_) {} }
    state.decoder = null;
    if (state.ctx) { try { await state.ctx.close(); } catch (_) {} }
    state.ctx = null; state.gain = null; state.queue = []; state.mediaUrl = null; state.nextStart = 0;
    areaEl.disabled = !debug.ready; stationEl.disabled = !debug.ready; playEl.disabled = !debug.ready; stopEl.disabled = true;
    badgeEl.classList.remove('playing');
    setStatus(message, kind);
    updateStats();
    log(message);
  }
  async function fatal(error) {
    if (!state.active || error?.name === 'AbortError') return;
    debug.error = String(error && error.stack || error);
    log(debug.error);
    await stop(`エラー: ${error.message || error}`, 'bad');
  }

  playEl.addEventListener('click', () => start().catch(fatal));
  stopEl.addEventListener('click', () => stop());
  volumeEl.addEventListener('input', () => {
    if (state.gain && state.ctx) state.gain.gain.setTargetAtTime(Number(volumeEl.value), state.ctx.currentTime, 0.02);
  });
  addEventListener('beforeunload', () => {
    clearInterval(statsTimer);
    state.active = false; state.runId++;
    try { state.controller?.abort(); } catch (_) {}
    try { state.decoder?.free(); } catch (_) {}
    try { state.ctx?.close(); } catch (_) {}
  });
})();
