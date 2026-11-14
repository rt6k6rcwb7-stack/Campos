// Gemeinsamer Datenabgleich über ein privates GitHub-Repository.
// Aufbau im Daten-Repo:
//   expenses/<id>.json      ein Eintrag pro Datei (gelöschte als {deleted:true})
//   files/<id>/<n>-<name>   Belege (Fotos/PDFs)
//   categories.json         Kategorien
// Konflikte: pro Eintrag gewinnt die neuere Änderung (updatedAt).
const Sync = (() => {
  let cfg = null, running = false, again = false, timer = null, listeners = [];
  const API = 'https://api.github.com';

  const emit = (s, msg) => listeners.forEach((f) => f(s, msg));
  const onStatus = (f) => listeners.push(f);

  async function loadConfig() { const r = await DB.get('meta', 'sync'); cfg = r ? r.value : null; return cfg; }
  async function saveConfig(c) { cfg = c; if (c) await DB.put('meta', { key: 'sync', value: c }); else await DB.del('meta', 'sync'); }
  const enabled = () => !!(cfg && cfg.token && cfg.owner && cfg.repo);
  const user = () => (cfg && cfg.name) || '';

  // ---------- GitHub-API ----------
  async function gh(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = ''; try { msg = (await res.json()).message; } catch {}
      const e = new Error(`GitHub ${res.status}: ${msg}`); e.status = res.status; throw e;
    }
    return res.status === 204 ? null : res.json();
  }
  const repoPath = () => `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  function bytesToB64(bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(s);
  }
  const b64ToBytes = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
  const jsonB64 = (obj) => bytesToB64(new TextEncoder().encode(JSON.stringify(obj, null, 1)));

  async function tree() {
    try {
      const t = await gh(`${repoPath()}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`);
      const map = {}; t.tree.forEach((n) => n.type === 'blob' && (map[n.path] = n.sha));
      return map;
    } catch (e) {
      if (e.status === 409 || e.status === 404) return {}; // leeres Repo / Branch noch nicht da
      throw e;
    }
  }
  async function blob(sha) { const b = await gh(`${repoPath()}/git/blobs/${sha}`); return b64ToBytes(b.content); }
  async function blobJson(sha) { return JSON.parse(new TextDecoder().decode(await blob(sha))); }
  async function put(path, b64, sha, message) {
    const body = { message, content: b64, branch: cfg.branch }; if (sha) body.sha = sha;
    const r = await gh(`${repoPath()}/contents/${encPath(path)}`, { method: 'PUT', body: JSON.stringify(body) });
    return r.content.sha;
  }
  async function remove(path, sha, message) {
    try { await gh(`${repoPath()}/contents/${encPath(path)}`, { method: 'DELETE', body: JSON.stringify({ message, sha, branch: cfg.branch }) }); }
    catch (e) { if (e.status !== 404) throw e; }
  }

  // Verbindung prüfen
  async function test(c) {
    const old = cfg; cfg = c;
    try {
      const r = await gh(repoPath());
      if (!r.permissions || !r.permissions.push) throw new Error('Der Token hat keine Schreibrechte für dieses Repository.');
      if (!c.branch) c.branch = r.default_branch || 'main';
      return { private: r.private, branch: c.branch };
    } finally { cfg = old; }
  }

  async function fetchFile(meta) {
    const bytes = await blob(meta.sha);
    return new File([bytes], meta.name, { type: meta.type });
  }

  // ---------- Abgleich ----------
  const strip = (e) => { const o = { ...e }; delete o._sha; delete o._dirty; return o; };
  const who = () => (user() ? ' (' + user() + ')' : '');

  async function run() {
    const remote = await tree();
    const locals = await DB.all('expenses');
    const byId = Object.fromEntries(locals.map((e) => [e.id, e]));
    let changed = false;

    // 1) Holen
    for (const [path, sha] of Object.entries(remote)) {
      const m = path.match(/^expenses\/(.+)\.json$/); if (!m) continue;
      const local = byId[m[1]];
      if (local && local._sha === sha) continue;
      const r = await blobJson(sha);
      if (local && (local._dirty || !local._sha) && (local.updatedAt || 0) > (r.updatedAt || 0)) {
        local._sha = sha; await DB.put('expenses', local); continue; // lokale Änderung ist neuer → wird gleich hochgeladen
      }
      const keepFiles = local && local.hasFile && !r.deleted && JSON.stringify(local.remoteFiles) === JSON.stringify(r.remoteFiles);
      if (!keepFiles) await DB.del('files', r.id);
      const rec = { ...r, _sha: sha, _dirty: false };
      await DB.put('expenses', rec); byId[r.id] = rec; changed = true;
    }
    // Kategorien
    const catMeta = await DB.get('meta', 'categories');
    if (remote['categories.json'] && (!catMeta || catMeta._sha !== remote['categories.json'])) {
      const r = await blobJson(remote['categories.json']);
      if (catMeta && catMeta._dirty && (catMeta.updatedAt || 0) > (r.updatedAt || 0)) {
        catMeta._sha = remote['categories.json']; await DB.put('meta', catMeta);
      } else {
        await DB.put('meta', { key: 'categories', value: r.value, updatedAt: r.updatedAt, _sha: remote['categories.json'], _dirty: false });
        changed = true;
      }
    }

    // 2) Hochladen
    for (const e of Object.values(byId)) {
      if (!e._dirty && e._sha) continue;
      if (e.deleted) {
        for (const f of e.remoteFiles || []) if (remote[f.path]) await remove(f.path, remote[f.path], 'Beleg gelöscht' + who());
        e.remoteFiles = [];
      } else if (e.hasFile && !(e.remoteFiles && e.remoteFiles.length)) {
        const rec = await DB.get('files', e.id);
        if (rec) {
          e.remoteFiles = [];
          for (let i = 0; i < rec.items.length; i++) {
            const f = rec.items[i];
            const path = `files/${e.id}/${i + 1}-${(f.name || 'beleg').replace(/[^\w.\-]+/g, '_').slice(-60)}`;
            const sha = await put(path, bytesToB64(new Uint8Array(await f.arrayBuffer())), remote[path], `Beleg ${e.vendor || ''}${who()}`.trim());
            e.remoteFiles.push({ path, sha, name: f.name, type: f.type });
          }
        }
      }
      const path = `expenses/${e.id}.json`;
      const msg = e.deleted ? `Gelöscht: ${e.id}${who()}` : `${e.date} ${e.vendor || ''} ${Number(e.amount).toFixed(2)} €${who()}`;
      try {
        e._sha = await put(path, jsonB64(strip(e)), remote[path] || e._sha, msg);
      } catch (err) {
        if (err.status === 409 || err.status === 422) { again = true; continue; } // Remote hat sich geändert → neue Runde
        throw err;
      }
      e._dirty = false;
      await DB.put('expenses', e);
    }
    const cm = await DB.get('meta', 'categories');
    if (cm && (cm._dirty || !cm._sha)) {
      cm._sha = await put('categories.json', jsonB64({ updatedAt: cm.updatedAt || Date.now(), value: cm.value }),
        remote['categories.json'] || cm._sha, 'Kategorien geändert' + who());
      cm._dirty = false; await DB.put('meta', cm);
    }
    return changed;
  }

  async function sync() {
    if (!enabled()) return false;
    if (!navigator.onLine) { emit('offline'); return false; }
    if (running) { again = true; return false; }
    running = true; emit('busy');
    let changed = false;
    try {
      let rounds = 0;
      do { again = false; changed = (await run()) || changed; } while (again && ++rounds < 3);
      cfg.lastSync = Date.now(); await saveConfig(cfg);
      emit('ok');
    } catch (e) {
      console.error(e);
      emit('error', e.status === 401 ? 'Token ungültig oder abgelaufen' : e.message);
    } finally { running = false; }
    return changed;
  }

  // Nach Änderungen kurz warten und dann abgleichen
  function schedule(ms = 1500) { if (!enabled()) return; clearTimeout(timer); timer = setTimeout(() => Sync.sync().then((c) => c && Sync.onChange && Sync.onChange()), ms); }

  return { loadConfig, saveConfig, enabled, user, test, sync, schedule, fetchFile, onStatus, get config() { return cfg; }, onChange: null };
})();
