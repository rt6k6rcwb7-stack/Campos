// Import aus Microsoft 365 / Outlook über Microsoft Graph.
// Anmeldung: OAuth 2.0 Authorization Code + PKCE direkt im Browser (kein Server nötig).
// Gelesen wird ein Ordner (Standard „Campos“); erfasste Mails wandern nach „Campos/Erledigt“.
const Mail = (() => {
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const SCOPES = 'offline_access User.Read Mail.ReadWrite';
  let cfg = null;

  const redirectUri = () => new URL('./', location.href).href;
  async function loadConfig() { const r = await DB.get('meta', 'mail'); cfg = r ? r.value : null; return cfg; }
  async function saveConfig(c) { cfg = c; if (c) await DB.put('meta', { key: 'mail', value: c }); else await DB.del('meta', 'mail'); }
  const configured = () => !!(cfg && cfg.clientId);
  const signedIn = () => !!(cfg && cfg.refreshToken);
  const authBase = () => `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant || 'organizations')}/oauth2/v2.0`;

  // ---------- PKCE ----------
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randomStr = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function login() {
    const verifier = randomStr(48), st = randomStr(16);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    await DB.put('meta', { key: 'mailAuth', verifier, state: st });
    const p = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES,
      response_mode: 'query', code_challenge: challenge, code_challenge_method: 'S256', state: st, prompt: 'select_account' });
    location.href = `${authBase()}/authorize?${p}`;
  }

  async function tokenRequest(params) {
    const res = await fetch(`${authBase()}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, scope: SCOPES, ...params }) });
    const j = await res.json();
    if (!res.ok) { const e = new Error(j.error_description || j.error || 'Anmeldung fehlgeschlagen'); e.code = j.error; throw e; }
    cfg.accessToken = j.access_token; cfg.expiresAt = Date.now() + (j.expires_in - 120) * 1000;
    if (j.refresh_token) cfg.refreshToken = j.refresh_token;
    await saveConfig(cfg);
  }

  // Rückkehr von der Microsoft-Anmeldung (?code=…&state=…)
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return null;
    history.replaceState(null, '', location.pathname);
    await loadConfig();
    const auth = await DB.get('meta', 'mailAuth');
    await DB.del('meta', 'mailAuth');
    if (q.has('error')) throw new Error(q.get('error_description') || q.get('error'));
    if (!cfg || !auth || auth.state !== q.get('state')) throw new Error('Anmeldung abgelaufen – bitte erneut versuchen.');
    await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: auth.verifier });
    const me = await graph('/me?$select=displayName,mail,userPrincipalName');
    cfg.account = me.mail || me.userPrincipalName; cfg.accountName = me.displayName;
    delete cfg.folderId; delete cfg.doneId;
    await saveConfig(cfg);
    return cfg.account;
  }

  async function accessToken() {
    if (cfg.accessToken && Date.now() < cfg.expiresAt) return cfg.accessToken;
    if (!cfg.refreshToken) { const e = new Error('Bitte bei Microsoft anmelden'); e.code = 'login_required'; throw e; }
    try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: cfg.refreshToken }); }
    catch (e) { cfg.refreshToken = null; cfg.accessToken = null; await saveConfig(cfg); e.code = 'login_required'; throw e; }
    return cfg.accessToken;
  }

  async function graph(path, opts = {}) {
    const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
      ...opts, headers: { Authorization: 'Bearer ' + (await accessToken()), ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    if (res.status === 401) { cfg.accessToken = null; const e = new Error('Sitzung abgelaufen'); e.code = 'login_required'; throw e; }
    if (!res.ok) { let m = ''; try { m = (await res.json()).error.message; } catch {} throw new Error(`Outlook ${res.status}: ${m}`); }
    return res.status === 204 ? null : res.json();
  }

  // ---------- Ordner ----------
  const q = (s) => s.replace(/'/g, "''");
  async function findChild(parent, name) {
    const r = await graph(`${parent}?$filter=${encodeURIComponent(`displayName eq '${q(name)}'`)}&$select=id,displayName`);
    return r.value[0] ? r.value[0].id : null;
  }
  // Nur eine Ordnersuche gleichzeitig (sonst würde „Erledigt“ doppelt angelegt)
  let folderP = null;
  function folders() {
    if (cfg.folderId && cfg.doneId) return Promise.resolve({ folderId: cfg.folderId, doneId: cfg.doneId });
    return (folderP ||= findFolders().finally(() => { folderP = null; }));
  }
  async function findFolders() {
    const name = cfg.folder || 'Campos';
    // Ordner auf oberster Ebene oder unterhalb des Posteingangs suchen
    const folderId = (await findChild('/me/mailFolders', name)) || (await findChild('/me/mailFolders/inbox/childFolders', name));
    if (!folderId) { const e = new Error(`Ordner „${name}“ nicht gefunden – bitte in Outlook anlegen.`); e.code = 'no_folder'; throw e; }
    let doneId = await findChild(`/me/mailFolders/${folderId}/childFolders`, 'Erledigt');
    if (!doneId) doneId = (await graph(`/me/mailFolders/${folderId}/childFolders`, { method: 'POST', body: JSON.stringify({ displayName: 'Erledigt' }) })).id;
    Object.assign(cfg, { folderId, doneId }); await saveConfig(cfg);
    return { folderId, doneId };
  }

  // Hauptordner + alle Unterordner (außer „Erledigt“); Unterordner werden jedes Mal neu gelesen,
  // damit in Outlook neu angelegte Ordner sofort mitgelesen werden.
  async function sources() {
    const { folderId, doneId } = await folders();
    const root = await graph(`/me/mailFolders/${folderId}?$select=id,displayName,totalItemCount`);
    const kids = await graph(`/me/mailFolders/${folderId}/childFolders?$top=100&$select=id,displayName,totalItemCount`);
    return [{ id: folderId, name: '', count: root.totalItemCount },
      ...kids.value.filter((f) => f.id !== doneId).map((f) => ({ id: f.id, name: f.displayName, count: f.totalItemCount }))];
  }

  // ---------- Mails ----------
  async function list() {
    const out = [];
    for (const src of await sources()) {
      if (!src.count) continue;
      const r = await graph(`/me/mailFolders/${src.id}/messages?$top=50&$orderby=receivedDateTime desc` +
        '&$select=id,subject,from,receivedDateTime,hasAttachments,bodyPreview');
      out.push(...r.value.map((m) => ({ id: m.id, folder: src.name, subject: m.subject || '(kein Betreff)', fromName: m.from?.emailAddress?.name || '',
        from: m.from?.emailAddress?.address || '', date: (m.receivedDateTime || '').slice(0, 10), hasAttachments: m.hasAttachments, preview: m.bodyPreview || '' })));
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }
  async function count() { return (await sources()).reduce((s, f) => s + (f.count || 0), 0); }

  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  async function load(id) {
    const m = await graph(`/me/messages/${id}?$select=subject,from,receivedDateTime,body`, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    const att = (await graph(`/me/messages/${id}/attachments`)).value
      .filter((a) => a['@odata.type'] === '#microsoft.graph.fileAttachment' && a.contentBytes)
      .filter((a) => /pdf/i.test(a.contentType) || /\.pdf$/i.test(a.name) || (/^image\//i.test(a.contentType) && !(a.isInline && a.size < 40000)))
      .map((a) => new File([b64ToBytes(a.contentBytes)], a.name || 'anhang', { type: /\.pdf$/i.test(a.name) ? 'application/pdf' : a.contentType }));
    return { id, subject: m.subject || '', fromName: m.from?.emailAddress?.name || '', from: m.from?.emailAddress?.address || '',
      date: (m.receivedDateTime || '').slice(0, 10), text: m.body?.content || '', attachments: att };
  }
  async function markDone(id) { const { doneId } = await folders(); await graph(`/me/messages/${id}/move`, { method: 'POST', body: JSON.stringify({ destinationId: doneId }) }); }

  return { loadConfig, saveConfig, configured, signedIn, login, handleRedirect, list, count, load, markDone, redirectUri, get config() { return cfg; } };
})();
