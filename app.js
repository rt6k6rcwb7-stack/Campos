// Campos Kosten – App-Logik
const $ = (s) => document.querySelector(s);
const DEFAULT_CATS = [
  { id: 'strom', name: 'Strom', icon: '⚡', color: '#eab308' },
  { id: 'wasser', name: 'Wasser', icon: '💧', color: '#0ea5e9' },
  { id: 'installation', name: 'Installation', icon: '🔧', color: '#f97316' },
  { id: 'reinigung', name: 'Reinigung', icon: '🧽', color: '#a855f7' },
  { id: 'hausbetreuung', name: 'Hausbetreuung', icon: '🏡', color: '#10b981' },
  { id: 'versicherung', name: 'Versicherung', icon: '🛡️', color: '#6366f1' },
  { id: 'steuern', name: 'Steuern & Gebühren', icon: '🏛️', color: '#64748b' },
  { id: 'internet', name: 'Internet / Telefon', icon: '📶', color: '#ec4899' },
  { id: 'sonstiges', name: 'Sonstiges', icon: '📦', color: '#94a3b8' },
];

const state = { expenses: [], cats: [], editing: null, files: [], touched: new Set(), queue: [], selCat: '' };
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtDate = (d) => new Date(d + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const catById = (id) => state.cats.find((c) => c.id === id) || { id, name: id || '—', icon: '❔', color: '#999' };

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------- Laden ----------------
async function load() {
  const meta = await DB.get('meta', 'categories');
  state.cats = meta ? meta.value : DEFAULT_CATS;
  state.expenses = await DB.all('expenses');
  fillFilters(); render();
}
async function saveCats() { await DB.put('meta', { key: 'categories', value: state.cats }); fillFilters(); render(); }

function fillFilters() {
  const years = new Set([new Date().getFullYear(), ...state.expenses.map((e) => +e.date.slice(0, 4))]);
  const fy = $('#fYear'), cur = fy.value || String(new Date().getFullYear());
  fy.innerHTML = '<option value="">Alle Jahre</option>' + [...years].sort((a, b) => b - a).map((y) => `<option>${y}</option>`).join('');
  fy.value = cur;
  const fc = $('#fCat'), cc = fc.value;
  fc.innerHTML = '<option value="">Alle Kategorien</option>' + state.cats.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
  fc.value = cc;
  $('#vendors').innerHTML = [...new Set(state.expenses.map((e) => e.vendor).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('');
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Übersicht ----------------
function filtered(ignoreCat) {
  const y = $('#fYear').value, m = $('#fMonth').value, c = $('#fCat').value, q = $('#fSearch').value.trim().toLowerCase();
  return state.expenses.filter((e) =>
    (!y || e.date.startsWith(y)) && (!m || e.date.slice(5, 7) === m) && (ignoreCat || !c || e.category === c) &&
    (!q || [e.vendor, e.note, e.invoice, catById(e.category).name].join(' ').toLowerCase().includes(q)));
}

function render() {
  const base = filtered(true);
  const total = base.reduce((s, e) => s + e.amount, 0);
  $('#sumTotal').textContent = eur.format(total);
  const per = {};
  base.forEach((e) => (per[e.category] = (per[e.category] || 0) + e.amount));
  const max = Math.max(1, ...Object.values(per));
  const sel = $('#fCat').value;
  $('#catBars').innerHTML = state.cats.filter((c) => per[c.id]).sort((a, b) => per[b.id] - per[a.id]).map((c) => `
    <div class="cat-bar ${sel === c.id ? 'sel' : ''}" data-cat="${c.id}">
      <span>${c.icon} ${esc(c.name)}</span><span>${eur.format(per[c.id])} · ${Math.round(per[c.id] / total * 100)}%</span>
      <div class="track"><div class="fill" style="width:${per[c.id] / max * 100}%;background:${c.color}"></div></div>
    </div>`).join('');

  const list = filtered().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  let lastMonth = '', html = '';
  for (const e of list) {
    const mon = e.date.slice(0, 7);
    if (mon !== lastMonth) {
      lastMonth = mon;
      html += `<li class="month-sep">${new Date(mon + '-01T00:00').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</li>`;
    }
    const c = catById(e.category);
    html += `<li class="item" data-id="${e.id}">
      <div class="dot" style="background:${c.color}22">${c.icon}</div>
      <div class="mid"><div class="t">${esc(e.vendor || c.name)}</div>
        <div class="s">${fmtDate(e.date)} · ${esc(c.name)}${e.hasFile ? ' · 📎' : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
      <div class="amt">${eur.format(e.amount)}${e.paid ? '' : '<small>offen</small>'}</div></li>`;
  }
  $('#list').innerHTML = html;
  $('#empty').hidden = list.length > 0;
}

// ---------------- Formular ----------------
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  document.body.classList.toggle('editing', name === 'edit');
  window.scrollTo(0, 0);
}

function renderCatPicker() {
  $('#catPicker').innerHTML = state.cats.map((c) =>
    `<button type="button" class="cat-chip ${state.selCat === c.id ? 'sel' : ''}" style="--c:${c.color}" data-cat="${c.id}"><span>${c.icon}</span>${esc(c.name)}</button>`).join('');
}

async function openEdit(exp, files = []) {
  state.editing = exp || null;
  state.touched = new Set();
  state.files = files;
  const e = exp || {};
  $('#iAmount').value = e.amount != null ? String(e.amount.toFixed(2)).replace('.', ',') : '';
  $('#iDate').value = e.date || today();
  $('#iVendor').value = e.vendor || '';
  $('#iInvoice').value = e.invoice || '';
  $('#iNote').value = e.note || '';
  $('#iPaid').checked = e.paid ?? true;
  state.selCat = e.category || '';
  renderCatPicker();
  $('#btnDelete').hidden = !exp;
  $('#ocrStatus').hidden = true;
  $('#ocrTextBox').hidden = true;
  if (exp && exp.hasFile) {
    const rec = await DB.get('files', exp.id);
    state.files = rec ? rec.items : [];
  }
  renderPreview();
  if (location.hash !== '#edit') history.pushState({ edit: 1 }, '', '#edit');
  showView('edit');
}

function renderPreview() {
  const p = $('#preview');
  p.innerHTML = '';
  state.files.forEach((f, i) => {
    if (f.type.startsWith('image/')) {
      const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.dataset.i = i; p.appendChild(img);
    } else {
      const d = document.createElement('div'); d.className = 'file'; d.dataset.i = i; d.textContent = '📄 ' + (f.name || 'Beleg'); p.appendChild(d);
    }
  });
}

function setField(id, val) {
  if (val == null || val === '' || state.touched.has(id)) return;
  const el = $('#' + id);
  if (el.value && id !== 'iDate') return; // nichts überschreiben, was schon drinsteht
  el.value = val;
}

function applyExtract(x) {
  if (x.amount != null) setField('iAmount', x.amount.toFixed(2).replace('.', ','));
  if (x.date && !state.touched.has('iDate')) $('#iDate').value = x.date;
  setField('iVendor', x.vendor);
  setField('iInvoice', x.invoice);
  if (x.category && !state.touched.has('cat') && !state.selCat) { state.selCat = x.category; renderCatPicker(); }
}

function status(msg) { const s = $('#ocrStatus'); s.hidden = !msg; s.textContent = msg || ''; }

// Text aus Datei lesen und Felder vorbefüllen
async function analyze(file, extraText = '', vendorHint = '') {
  let text = extraText;
  try {
    if (file && file.type === 'application/pdf') {
      status('📄 PDF wird gelesen …');
      text += '\n' + await Parse.pdfText(file, (p) => status(`🔍 Texterkennung … ${p}%`));
    } else if (file && file.type.startsWith('image/')) {
      status('🔍 Texterkennung startet … (beim ersten Mal etwas länger)');
      text += '\n' + await Parse.ocr(file, (p) => status(`🔍 Texterkennung … ${p}%`));
    }
  } catch (err) {
    console.error(err);
    status('⚠️ Automatische Erkennung nicht möglich (offline?). Bitte Felder manuell ausfüllen.');
  }
  if (!text.trim()) { if (!$('#ocrStatus').textContent.startsWith('⚠️')) status(''); return; }
  const x = Parse.extract(text, state.cats, vendorHint);
  applyExtract(x);
  $('#ocrText').textContent = text.trim();
  $('#ocrTextBox').hidden = false;
  const found = [x.amount != null && 'Betrag', x.date && 'Datum', x.category && 'Kategorie'].filter(Boolean);
  status(found.length ? `✅ Erkannt: ${found.join(', ')} – bitte kurz prüfen.` : 'ℹ️ Nichts Eindeutiges erkannt – bitte manuell ausfüllen.');
}

// ---------------- Dateien / Kamera / E-Mail ----------------
async function handleFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  state.queue.push(...files);
  if (!document.body.classList.contains('editing')) nextFromQueue();
  else toast(`${files.length} Beleg(e) in der Warteschlange`);
}

async function nextFromQueue() {
  const f = state.queue.shift();
  if (!f) return;
  const isEml = /\.eml$/i.test(f.name) || f.type === 'message/rfc822';
  if (isEml) {
    let mail;
    try { mail = await Parse.parseEml(f); } catch (e) { console.error(e); toast('E-Mail konnte nicht gelesen werden'); return nextFromQueue(); }
    const att = mail.attachments;
    // Weitere Anhänge (mehrere Rechnungen) kommen in die Warteschlange
    if (att.length > 1) state.queue.unshift(...att.slice(1));
    await openEdit(null, att.slice(0, 1));
    if (mail.date) $('#iDate').value = mail.date;
    $('#iNote').value = mail.subject.slice(0, 120);
    const mailText = `${mail.subject}\n${mail.from}\n${mail.text}`;
    const first = att[0];
    return analyze(first, mailText, mail.fromName);
  }
  if (/\.txt$/i.test(f.name) || f.type === 'text/plain') {
    await openEdit(null, []);
    return analyze(null, await f.text());
  }
  const file = f.type.startsWith('image/') ? await Parse.shrinkImage(f) : f;
  await openEdit(null, [file]);
  analyze(file);
}

async function save(ev) {
  ev.preventDefault();
  const amount = Parse.parseNumber($('#iAmount').value || '');
  if (amount == null) { toast('Bitte einen gültigen Betrag eingeben'); $('#iAmount').focus(); return; }
  if (!state.selCat) { toast('Bitte eine Kategorie wählen'); return; }
  const old = state.editing;
  const e = {
    id: old ? old.id : uid(),
    createdAt: old ? old.createdAt : Date.now(),
    amount: Math.round(amount * 100) / 100,
    category: state.selCat,
    date: $('#iDate').value || today(),
    vendor: $('#iVendor').value.trim(),
    invoice: $('#iInvoice').value.trim(),
    note: $('#iNote').value.trim(),
    paid: $('#iPaid').checked,
    hasFile: state.files.length > 0,
  };
  await DB.put('expenses', e);
  if (e.hasFile) await DB.put('files', { id: e.id, items: state.files });
  else if (old && old.hasFile) await DB.del('files', e.id);
  const i = state.expenses.findIndex((x) => x.id === e.id);
  if (i > -1) state.expenses[i] = e; else state.expenses.push(e);
  toast(`Gespeichert: ${eur.format(e.amount)} · ${catById(e.category).name}`);
  closeEdit();
}

function closeEdit(fromPop) {
  state.editing = null; state.files = [];
  fillFilters(); render(); showView('list');
  if (!fromPop && location.hash === '#edit') history.back();
  if (state.queue.length) setTimeout(nextFromQueue, 300);
}

async function del() {
  if (!state.editing || !confirm('Diesen Eintrag wirklich löschen?')) return;
  const id = state.editing.id;
  await DB.del('expenses', id); await DB.del('files', id);
  state.expenses = state.expenses.filter((e) => e.id !== id);
  toast('Gelöscht'); closeEdit();
}

// ---------------- Export / Backup ----------------
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportCsv() {
  const rows = [['Datum', 'Kategorie', 'Firma', 'Rechnungsnr', 'Betrag', 'Bezahlt', 'Notiz']];
  filtered().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => rows.push([
    fmtDate(e.date), catById(e.category).name, e.vendor, e.invoice, e.amount.toFixed(2).replace('.', ','), e.paid ? 'ja' : 'nein', e.note]));
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const y = $('#fYear').value || 'alle', m = $('#fMonth').value;
  download(`campos-kosten-${y}${m ? '-' + m : ''}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

const toDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
async function backup() {
  toast('Backup wird erstellt …');
  const files = await DB.all('files');
  const out = { app: 'campos-kosten', version: 1, created: new Date().toISOString(), categories: state.cats, expenses: state.expenses, files: [] };
  for (const f of files) out.files.push({ id: f.id, items: await Promise.all(f.items.map(async (it) => ({ name: it.name, type: it.type, data: await toDataUrl(it) }))) });
  download(`campos-kosten-backup-${today()}.json`, new Blob([JSON.stringify(out)], { type: 'application/json' }));
}
async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'campos-kosten') throw new Error('Kein Campos-Backup');
    if (!confirm(`Backup vom ${data.created.slice(0, 10)} mit ${data.expenses.length} Einträgen einspielen? Vorhandene Einträge mit gleicher ID werden ersetzt, andere bleiben erhalten.`)) return;
    for (const e of data.expenses) await DB.put('expenses', e);
    for (const f of data.files || []) {
      const items = await Promise.all(f.items.map(async (it) => new File([await (await fetch(it.data)).blob()], it.name, { type: it.type })));
      await DB.put('files', { id: f.id, items });
    }
    if (data.categories) { const ids = new Set(state.cats.map((c) => c.id)); state.cats.push(...data.categories.filter((c) => !ids.has(c.id))); await saveCats(); }
    await load(); toast('Backup eingespielt ✔');
  } catch (e) { alert('Wiederherstellen fehlgeschlagen: ' + e.message); }
}

// ---------------- Kategorien verwalten ----------------
function renderCatEdit() {
  $('#catEditList').innerHTML = state.cats.map((c, i) => `<li data-i="${i}">
    <input class="emoji" value="${esc(c.icon)}" data-k="icon"><input value="${esc(c.name)}" data-k="name">
    <input type="color" value="${c.color}" data-k="color"><button data-del="${i}" title="Entfernen">✕</button></li>`).join('');
}

// ---------------- Events ----------------
$('#btnCamera').onclick = () => $('#camInput').click();
$('#btnImport').onclick = () => $('#fileInput').click();
$('#btnManual').onclick = () => openEdit(null, []);
$('#camInput').onchange = (e) => { handleFiles(e.target.files); e.target.value = ''; };
$('#fileInput').onchange = (e) => { handleFiles(e.target.files); e.target.value = ''; };
$('#restoreInput').onchange = (e) => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };
$('#form').onsubmit = save;
$('#btnCancel').onclick = () => { state.queue = []; closeEdit(); };
$('#btnDelete').onclick = del;
['iAmount', 'iDate', 'iVendor', 'iInvoice'].forEach((id) => $('#' + id).addEventListener('input', () => state.touched.add(id)));
$('#catPicker').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; state.selCat = b.dataset.cat; state.touched.add('cat'); renderCatPicker(); };
$('#list').onclick = (e) => { const li = e.target.closest('.item'); if (li) openEdit(state.expenses.find((x) => x.id === li.dataset.id)); };
$('#catBars').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; $('#fCat').value = $('#fCat').value === b.dataset.cat ? '' : b.dataset.cat; render(); };
['#fYear', '#fMonth', '#fCat'].forEach((s) => ($(s).onchange = render));
$('#fSearch').oninput = render;
$('#preview').onclick = (e) => {
  const el = e.target.closest('[data-i]'); if (!el) return;
  const f = state.files[+el.dataset.i], url = URL.createObjectURL(f);
  $('#viewerBody').innerHTML = f.type.startsWith('image/') ? `<img src="${url}">` : f.type === 'application/pdf'
    ? `<iframe src="${url}"></iframe><p><a href="${url}" target="_blank" download="${esc(f.name)}">PDF öffnen</a></p>` : `<a href="${url}" download="${esc(f.name)}">Datei herunterladen</a>`;
  $('#viewer').showModal();
};
window.addEventListener('popstate', () => { if (document.body.classList.contains('editing')) { state.queue = []; closeEdit(true); } });

$('#btnMenu').onclick = () => $('#menu').showModal();
$('#menu').onclick = (e) => {
  const act = e.target.dataset.act; if (!act) return;
  $('#menu').close();
  if (act === 'csv') exportCsv();
  if (act === 'backup') backup();
  if (act === 'restore') $('#restoreInput').click();
  if (act === 'paste') { $('#pasteText').value = ''; $('#pasteDlg').showModal(); }
  if (act === 'cats') { renderCatEdit(); $('#catsDlg').showModal(); }
};
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]') || e.target === d) d.close();
}));
$('#pasteGo').onclick = async () => {
  const t = $('#pasteText').value; $('#pasteDlg').close();
  if (t.trim()) { await openEdit(null, []); analyze(null, t); }
};
$('#catEditList').oninput = (e) => {
  const li = e.target.closest('li'); const k = e.target.dataset.k; if (!li || !k) return;
  state.cats[+li.dataset.i][k] = e.target.value; saveCats();
};
$('#catEditList').onclick = (e) => {
  const i = e.target.dataset.del; if (i == null) return;
  const c = state.cats[+i];
  const n = state.expenses.filter((x) => x.category === c.id).length;
  if (n && !confirm(`${n} Einträge nutzen „${c.name}“. Trotzdem entfernen? (Einträge bleiben, Kategorie wird als „—“ angezeigt)`)) return;
  state.cats.splice(+i, 1); saveCats(); renderCatEdit();
};
$('#addCat').onclick = () => {
  const name = $('#newCatName').value.trim(); if (!name) return;
  state.cats.push({ id: 'c_' + uid(), name, icon: '🏷️', color: '#0f766e' });
  $('#newCatName').value = ''; saveCats(); renderCatEdit();
};

// Drag & Drop am Computer (z. B. E-Mail aus Outlook/Thunderbird oder PDF hineinziehen)
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

// Geteilte Dateien (Android: „Teilen“ → Campos Kosten) abholen
async function checkShared() {
  const rec = await DB.get('meta', 'shared');
  if (!rec || (!(rec.files && rec.files.length) && !rec.text)) return;
  rec.files = rec.files || [];
  await DB.del('meta', 'shared');
  if (rec.text) rec.files.push(new File([rec.text], 'geteilt.txt', { type: 'text/plain' }));
  handleFiles(rec.files);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
if (location.hash === '#edit') history.replaceState(null, '', location.pathname);
load().then(checkShared);
