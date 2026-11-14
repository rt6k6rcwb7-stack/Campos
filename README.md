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
- **🔄 Gemeinsamer Abgleich** zwischen mehreren Handys über ein privates GitHub-Repository (inkl. Belege, „erfasst von“).
- Funktioniert **offline**; Änderungen werden abgeglichen, sobald wieder Internet da ist.

## Veröffentlichen (GitHub Pages)
1. Repository → *Settings* → *Pages* → *Deploy from a branch* → Branch wählen, Ordner `/ (root)`.
2. Die URL (`https://<name>.github.io/Campos/`) auf dem Handy öffnen.
3. **iPhone:** Safari → Teilen → „Zum Home-Bildschirm“. **Android:** Chrome → ⋮ → „App installieren“.

Lokal testen: `python3 -m http.server` und `http://localhost:8000` öffnen.

## Hinweise
- Die Texterkennung lädt beim ersten Mal ca. 10–15 MB Sprachdaten (danach zwischengespeichert).
- Outlook-Desktop speichert Mails als `.msg` – bitte stattdessen den PDF-Anhang importieren oder die Mail als `.eml` speichern.

## Gemeinsamer Abgleich einrichten (einmalig, ca. 5 Minuten)
Die Daten liegen in einem **eigenen, privaten** Repository – nicht in diesem (das für GitHub Pages ggf. öffentlich ist).

1. **Privates Repository anlegen:** github.com → **New repository** → Name `campos-daten` → **Private** → „Add a README file“ anhaken → *Create*.
2. **Zugriffstoken erstellen** (für jede Person bzw. jedes Gerät, oder ein gemeinsamer):
   github.com → Profilbild → *Settings* → *Developer settings* → *Personal access tokens* → **Fine-grained tokens** → *Generate new token*
   - *Expiration*: z. B. 1 Jahr
   - *Repository access*: **Only select repositories** → `campos-daten`
   - *Permissions* → *Repository permissions* → **Contents: Read and write**
   - Token (`github_pat_…`) kopieren.
   - Gehört das Repo einem anderen Konto, muss die zweite Person dort als *Collaborator* eingeladen sein (Repo → *Settings* → *Collaborators*) und das Repo beim Token-Erstellen auswählen.
3. **In der App:** Menü ⋯ → **Gemeinsamer Abgleich** → Name, GitHub-Konto (Besitzer des Repos), `campos-daten`, Token → *Verbinden*.
4. Auf dem zweiten Handy dasselbe – fertig. Bereits erfasste Einträge werden beim ersten Verbinden hochgeladen.

**So funktioniert es:** Abgleich automatisch nach jeder Änderung, beim Öffnen der App und alle 2 Minuten; manuell über das ☁️-Symbol oben.
Jeder Eintrag ist eine eigene Datei, gleichzeitige Änderungen an verschiedenen Einträgen stören sich nicht. Ändern zwei Personen *denselben*
Eintrag, gewinnt die zuletzt gemachte Änderung. Belege anderer Geräte werden erst beim Öffnen des Eintrags geladen.
Im Daten-Repo ist jede Änderung als Commit mit Namen nachvollziehbar.

**Sicherheit:** Der Token wird nur auf dem jeweiligen Gerät gespeichert (nicht im Backup). Er erlaubt ausschließlich Zugriff auf `campos-daten`.
Bei Verlust des Handys den Token auf GitHub löschen.
