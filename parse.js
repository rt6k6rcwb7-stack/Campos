// Belegerkennung: E-Mail (.eml) zerlegen, PDF-Text lesen, OCR für Fotos,
// und aus dem Text Betrag, Datum, Firma, Rechnungsnr. und Kategorie erraten.
const Parse = (() => {
  // ---------- Kategorien-Schlüsselwörter (DE / ES / EN) ----------
  const KEYWORDS = {
    strom: ['endesa', 'iberdrola', 'naturgy', 'repsol luz', 'holaluz', 'octopus', 'totalenergies', 'electricidad', 'energía eléctrica',
      'energia electrica', 'kwh', 'potencia contratada', 'luz', 'strom', 'electricity', 'som energia', 'factura de luz'],
    wasser: ['agua', 'aqualia', 'emaya', 'aigües', 'aigues', 'aguas', 'canon de saneamiento', 'alcantarillado', 'wasser', 'water', 'm3', 'm³',
      'abastecimiento', 'camión cisterna', 'cuba de agua', 'pozo'],
    installation: ['fontaner', 'electricista', 'instalaci', 'reparaci', 'montaje', 'climatizaci', 'aire acondicionado', 'calefacci',
      'caldera', 'installation', 'installateur', 'elektriker', 'klempner', 'sanitär', 'heizung', 'material', 'ferreter', 'bricolaje',
      'leroy merlin', 'bauhaus', 'handwerker', 'plumber'],
    reinigung: ['limpieza', 'limpiezas', 'cleaning', 'reinigung', 'putz', 'lavander', 'jardiner', 'piscina', 'pool', 'mantenimiento piscina'],
    hausbetreuung: ['hausbetreuung', 'property care', 'property management', 'gestión de propiedad', 'gestion de propiedad', 'conserje',
      'vigilancia', 'servicio de llaves', 'key holding', 'hausmeister', 'caretaker', 'administración de fincas', 'house care'],
    versicherung: ['seguro', 'mapfre', 'allianz', 'axa', 'versicherung', 'insurance', 'póliza', 'poliza'],
    steuern: ['ibi', 'ajuntament', 'ayuntamiento', 'impuesto', 'tasa de basura', 'residuos', 'grundsteuer', 'agencia tributaria', 'atib'],
    internet: ['movistar', 'vodafone', 'orange', 'digi', 'fibra', 'internet', 'telefon', 'router', 'masmovil', 'telecable'],
  };

  // ---------- Hilfsfunktionen ----------
  function parseNumber(s) {
    s = s.replace(/\s/g, '').replace(/[€$]|eur/gi, '');
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) {
      s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lc > -1) {
      s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (ld > -1) {
      if (!/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  const AMOUNT_RE = /(?:€\s*)?(-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|-?\d+(?:[.,]\d{2}))(?:\s*(?:€|eur(?:os?)?))?/gi;
  const TOTAL_KW = /(total\s*(a\s*pagar|factura|importe|amount|due)?|importe\s*(total|a\s*pagar)?|a\s*pagar|gesamt(betrag|summe)?|rechnungsbetrag|endbetrag|zu\s*zahlen|summe|amount\s*due|grand\s*total|betrag)/i;
  const NOT_TOTAL = /(subtotal|base\s*imponible|zwischensumme|netto|iva\s*\d|mwst\s*\d|descuento|rabatt)/i;

  function findAmount(text) {
    const lines = text.split(/\r?\n/);
    let best = null;
    lines.forEach((line, i) => {
      if (!TOTAL_KW.test(line) || NOT_TOTAL.test(line)) return;
      // Betrag in derselben oder der nächsten Zeile
      const scope = line + ' ' + (lines[i + 1] || '');
      for (const m of scope.matchAll(AMOUNT_RE)) {
        const n = parseNumber(m[1]);
        if (n == null || n <= 0 || n > 1e6) continue;
        const score = (/total|gesamt|a\s*pagar|zu\s*zahlen|amount\s*due/i.test(line) ? 2 : 1);
        if (!best || score > best.score || (score === best.score && n > best.n)) best = { n, score };
      }
    });
    if (best) return best.n;
    // Fallback: größter Betrag mit €-Zeichen
    let max = null;
    for (const m of text.matchAll(AMOUNT_RE)) {
      if (!/€|eur/i.test(m[0])) continue;
      const n = parseNumber(m[1]);
      if (n && n > 0 && n < 1e6 && (max == null || n > max)) max = n;
    }
    return max;
  }

  const MONTHS = { ene: 1, enero: 1, jan: 1, januar: 1, january: 1, feb: 2, febrero: 2, februar: 2, february: 2, mar: 3, marzo: 3, märz: 3, maerz: 3, march: 3,
    abr: 4, abril: 4, apr: 4, april: 4, may: 5, mayo: 5, mai: 5, jun: 6, junio: 6, juni: 6, june: 6, jul: 7, julio: 7, juli: 7, july: 7,
    ago: 8, agosto: 8, aug: 8, august: 8, sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9, oct: 10, octubre: 10, okt: 10, oktober: 10, october: 10,
    nov: 11, noviembre: 11, november: 11, dic: 12, diciembre: 12, dez: 12, dezember: 12, dec: 12, december: 12 };

  function iso(y, m, d) {
    y = +y; m = +m; d = +d;
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCDate() !== d) return null;
    if (dt - Date.now() > 90 * 864e5) return null; // nicht weit in der Zukunft
    return dt.toISOString().slice(0, 10);
  }

  function datesIn(s) {
    const out = [];
    for (const m of s.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g)) { const d = iso(m[3], m[2], m[1]); if (d) out.push([m.index, d]); }
    for (const m of s.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) { const d = iso(m[1], m[2], m[3]); if (d) out.push([m.index, d]); }
    for (const m of s.matchAll(/\b(\d{1,2})\.?\s*(?:de\s+)?([a-zäéñ]{3,10})\.?\s*(?:de\s+)?(20\d{2})\b/gi)) {
      const mo = MONTHS[m[2].toLowerCase()]; if (mo) { const d = iso(m[3], mo, m[1]); if (d) out.push([m.index, d]); }
    }
    return out.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }

  function findDate(text) {
    const kw = /(fecha\s*(de\s*)?(factura|emisi[oó]n|expedici[oó]n)|rechnungsdatum|invoice\s*date|datum|fecha)/i;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (kw.test(lines[i])) {
        const d = datesIn(lines[i] + ' ' + (lines[i + 1] || ''));
        if (d.length) return d[0];
      }
    }
    return datesIn(text)[0] || null;
  }

  function findInvoiceNo(text) {
    const m = text.match(/(?:n[º°o.]?\s*(?:de\s*)?factura|factura\s*n[º°o.]?|n[úu]mero\s*(?:de\s*)?factura|rechnungs?-?\s*n(?:r|ummer)\.?|invoice\s*(?:no|number|#)\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,24})/i);
    return m ? m[1].replace(/[.]$/, '') : '';
  }

  // Treffer nur am Wortanfang (Stämme wie "fontaner" erlaubt, aber "luz" nicht in "aluzinio")
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasWord = (t, k) => new RegExp('(^|[^a-z0-9äöüßáéíóúñ])' + reEsc(k), 'i').test(t);

  function guessCategory(text, cats) {
    const t = text.toLowerCase();
    let best = null, bestScore = 0;
    for (const c of cats) {
      const kws = (KEYWORDS[c.id] || []).concat(c.keywords || [], [c.name.toLowerCase()]);
      let score = 0;
      for (const k of kws) if (k && hasWord(t, k.toLowerCase())) score += k.length > 4 ? 2 : 1;
      if (score > bestScore) { best = c.id; bestScore = score; }
    }
    return best;
  }

  const KNOWN_VENDORS = ['Endesa', 'Iberdrola', 'Naturgy', 'Holaluz', 'Repsol', 'Aqualia', 'Emaya', 'Movistar', 'Vodafone', 'Orange', 'Digi',
    'Mapfre', 'Allianz', 'AXA', 'Leroy Merlin', 'Bauhaus', 'Ajuntament de Campos', 'Ayuntamiento de Campos', 'Som Energia', 'Octopus'];

  function findVendor(text, hint) {
    const t = text.toLowerCase();
    const k = KNOWN_VENDORS.find((v) => new RegExp('\\b' + reEsc(v.toLowerCase()) + '\\b').test(t));
    if (k) return k;
    if (hint) return hint;
    // Erste "sinnvolle" Zeile (oft Firmenname im Briefkopf)
    const line = text.split(/\r?\n/).map((l) => l.trim())
      .find((l) => l.length > 3 && l.length < 50 && /[a-z]{3}/i.test(l) && !/factura|rechnung|invoice|fecha|datum|^\d/i.test(l));
    return line || '';
  }

  function extract(text, cats, vendorHint) {
    return {
      amount: findAmount(text),
      date: findDate(text),
      invoice: findInvoiceNo(text),
      vendor: findVendor(text, vendorHint),
      category: guessCategory(text + ' ' + (vendorHint || ''), cats),
    };
  }

  // ---------- Externe Bibliotheken bei Bedarf laden ----------
  const loaded = {};
  function loadScript(src) {
    return loaded[src] ||= new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Laden fehlgeschlagen: ' + src));
      document.head.appendChild(s);
    });
  }
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  async function ocr(imageSource, onProgress) {
    await loadScript(TESSERACT);
    const worker = await Tesseract.createWorker(['spa', 'deu', 'eng'], 1, {
      logger: (m) => m.status === 'recognizing text' && onProgress && onProgress(Math.round(m.progress * 100)),
    });
    try {
      const { data } = await worker.recognize(imageSource);
      return data.text || '';
    } finally { await worker.terminate(); }
  }

  async function pdfText(blob, onProgress) {
    await loadScript(PDFJS);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
    let text = '';
    const pages = Math.min(pdf.numPages, 4);
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      // Zeilen anhand der y-Position rekonstruieren
      let lastY = null;
      for (const it of tc.items) {
        const y = Math.round(it.transform[5]);
        text += (lastY !== null && Math.abs(y - lastY) > 3 ? '\n' : ' ') + it.str;
        lastY = y;
      }
      text += '\n';
    }
    // Gescanntes PDF ohne Text → erste Seite rendern und OCR
    if (text.replace(/\s/g, '').length < 30) {
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 2.5 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      text = await ocr(c, onProgress);
    }
    return text;
  }

  // Foto verkleinern (spart Speicher, OCR wird schneller)
  async function shrinkImage(file, max = 2000) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5e6) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      return new File([blob], (file.name || 'beleg').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch { return file; }
  }

  // ---------- E-Mail (.eml / RFC 822) ----------
  function decodeWords(s) {
    return s.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, cs, enc, data) => {
      try {
        const bytes = enc.toUpperCase() === 'B'
          ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
          : qpBytes(data.replace(/_/g, ' '));
        return new TextDecoder(cs).decode(bytes);
      } catch { return data; }
    });
  }
  function qpBytes(s) {
    s = s.replace(/=\r?\n/g, '');
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '=' && /[0-9A-F]{2}/i.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else out.push(s.charCodeAt(i) & 255);
    }
    return new Uint8Array(out);
  }
  function parseHeaders(raw) {
    const h = {};
    raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((l) => {
      const i = l.indexOf(':'); if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    });
    return h;
  }
  function param(header, name) {
    const m = (header || '').match(new RegExp(name + '\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))', 'i'));
    if (!m) return '';
    let v = m[1] ?? m[2];
    if (/^[\w-]+''/.test(v)) { try { v = decodeURIComponent(v.replace(/^[\w-]+''/, '')); } catch {} }
    return decodeWords(v);
  }
  function walk(part, out) {
    const split = part.search(/\r?\n\r?\n/);
    const head = parseHeaders(split < 0 ? part : part.slice(0, split));
    const body = split < 0 ? '' : part.slice(split).replace(/^\r?\n\r?\n/, '');
    const ct = head['content-type'] || 'text/plain';
    const type = ct.split(';')[0].trim().toLowerCase();
    const enc = (head['content-transfer-encoding'] || '').toLowerCase();
    if (type.startsWith('multipart/')) {
      const b = param(ct, 'boundary');
      body.split('--' + b).slice(1).forEach((p) => { if (!p.startsWith('--')) walk(p.replace(/^\r?\n/, ''), out); });
      return;
    }
    let bytes;
    if (enc === 'base64') bytes = Uint8Array.from(atob(body.replace(/[^A-Za-z0-9+/=]/g, '')), (c) => c.charCodeAt(0));
    else if (enc === 'quoted-printable') bytes = qpBytes(body);
    else bytes = Uint8Array.from(body, (c) => c.charCodeAt(0) & 255);
    const name = param(head['content-disposition'], 'filename') || param(ct, 'name');
    const isAttach = name || /attachment/i.test(head['content-disposition'] || '') || !type.startsWith('text/');
    if (isAttach) {
      out.attachments.push(new File([bytes], name || 'anhang', { type }));
    } else {
      let txt; try { txt = new TextDecoder(param(ct, 'charset') || 'utf-8').decode(bytes); } catch { txt = new TextDecoder().decode(bytes); }
      if (type === 'text/html') {
        const doc = new DOMParser().parseFromString(txt, 'text/html');
        doc.querySelectorAll('br,p,div,tr,li,h1,h2,h3').forEach((el) => el.append('\n'));
        txt = doc.body ? doc.body.textContent : txt;
        if (!out.text) out.html = txt; // nur nutzen, wenn kein Klartext vorhanden
      } else out.text += txt + '\n';
    }
  }
  async function parseEml(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let raw = ''; for (let i = 0; i < buf.length; i += 8192) raw += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    const split = raw.search(/\r?\n\r?\n/);
    const head = parseHeaders(raw.slice(0, split));
    const out = { text: '', html: '', attachments: [] };
    walk(raw, out);
    const from = decodeWords(head.from || '');
    const fromName = (from.match(/^"?([^"<]+?)"?\s*</) || [])[1] || from.replace(/<.*>/, '').trim();
    const d = head.date ? new Date(head.date) : null;
    return {
      subject: decodeWords(head.subject || ''),
      from, fromName,
      date: d && !isNaN(d) ? d.toISOString().slice(0, 10) : null,
      text: (out.text || out.html || '').trim(),
      attachments: out.attachments.filter((a) => /pdf|image\//i.test(a.type) || /\.(pdf|jpe?g|png|heic)$/i.test(a.name)),
    };
  }

  return { extract, ocr, pdfText, parseEml, shrinkImage, parseNumber };
})();
