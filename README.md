# Campos Kosten

Web-App (PWA) zum schnellen Erfassen aller Kosten für das Haus in Campos – läuft auf dem Handy wie eine App.

## Funktionen
- **📷 Foto aufnehmen** – Rechnung fotografieren, Texterkennung (Spanisch/Deutsch/Englisch) füllt **Betrag, Datum, Firma, Rechnungsnr. und Kategorie** automatisch vor.
- **📎 Importieren** – PDF-Rechnungen, Bilder oder ganze **E-Mails (.eml)** inkl. Anhängen. Mehrere Dateien werden nacheinander abgearbeitet.
- **Teilen-Menü (Android)** – nach der Installation in Gmail/Outlook beim PDF-Anhang auf „Teilen → Campos Kosten“ tippen.
- **📧 E-Mail-Text einfügen** (Menü ⋯) – für Rechnungen, die nur im Mailtext stehen.
- **Kategorien**: Strom, Wasser, Installation, Reinigung, Hausbetreuung, Versicherung, Steuern & Gebühren, Internet/Telefon, Sonstiges – frei änderbar.
- **Übersicht** nach Jahr/Monat mit Summen und Anteil je Kategorie, Suche, Status „offen/bezahlt“.
- **Export als CSV** (öffnet direkt in Excel/Numbers) und **Backup/Wiederherstellen** inkl. Belegen.
- Funktioniert **offline**; alle Daten bleiben **lokal auf dem Gerät** (IndexedDB).

## Veröffentlichen (GitHub Pages)
1. Repository → *Settings* → *Pages* → *Deploy from a branch* → Branch wählen, Ordner `/ (root)`.
2. Die URL (`https://<name>.github.io/Campos/`) auf dem Handy öffnen.
3. **iPhone:** Safari → Teilen → „Zum Home-Bildschirm“. **Android:** Chrome → ⋮ → „App installieren“.

Lokal testen: `python3 -m http.server` und `http://localhost:8000` öffnen.

## Hinweise
- Die Texterkennung lädt beim ersten Mal ca. 10–15 MB Sprachdaten (danach zwischengespeichert).
- Outlook-Desktop speichert Mails als `.msg` – bitte stattdessen den PDF-Anhang importieren oder die Mail als `.eml` speichern.
- Daten werden **nicht** automatisch zwischen Geräten synchronisiert. Zum Übertragen: Menü → Backup speichern → auf dem anderen Gerät wiederherstellen.
