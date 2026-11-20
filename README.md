# SSS.sk — Atlas a databáza najdlhších a najhlbších jaskýň Slovenska

[![TypeScript](https://img.shields.io/badge/TypeScript-ES2022-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-1a1e23?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-OCR_%26_Semantic_Search-fbbc05?style=flat-square)](https://ai.google.dev/)

Moderný informačný portál, historický archív a analytický nástroj pre **Slovenskú speleologickú spoločnosť ([sss.sk](https://sss.sk/))**. Aplikácia automatizovane spracúva oficiálne rebríčky najdlhších a najhlbších jaskýň Slovenska z HTML stránok `sss.sk` a PDF vydaní časopisu **Spravodaj SSS** (ročníky 2005–2026), vizualizuje ich vývoj na interaktívnej mape a spája ich s odbornou bibliografiou na [`bibliografia.sss.sk`](https://bibliografia.sss.sk/).

**English:** [README in English](README.en.md)

---

## Aktuálne ukážky z nasadeného webu (20. 11. 2026)

Tieto snímky obrazovky boli zachytené v prehliadači z [verejne nasadenej stránky](https://jaskyne.sss.sk/).

### Úvodná stránka a štatistiky
![Živá úvodná stránka archívu slovenských jaskýň](docs/screenshots/live-home.png)

### Najdlhšie a najhlbšie jaskyne
![Živý rebríček najdlhších jaskýň](docs/screenshots/live-rankings.png)
![Živý rebríček najhlbších jaskýň](docs/screenshots/live-deepest.png)

### Nastavenie zdieľania a iframe
![Živý panel na konfiguráciu zdieľaného rebríčka a iframe](docs/screenshots/live-share-embed.png)

### Historická prezentácia
![Živá animovaná prezentácia vývoja najdlhších jaskýň](docs/screenshots/live-presentations.png)

---

## Kompletný prehľad funkcií

### 1. Rebríček a mapa krasových oblastí (`CaveAtlasMap`)
- **Východisková stránka:** Po otvorení sa zobrazí rebríček s filtrami a exportmi CSV/PDF.
- **Mapa v hlavnom menu:** Detailný kartografický prehľad zobrazuje hranice ôsmich krajov, vybrané mestá, hlavné rieky a orientačné názvy krasových oblastí; nezobrazuje polohy jaskýň, vchodov, GPS súradnice ani nadmorskú výšku. Hranice krajov vychádzajú z Eurostat GISCO NUTS 2024.
- **Prezentácie:** Historický vývoj dĺžok a hĺbok je dostupný samostatne v menu.

### 2. Oficiálne rebríčky SSS a reporty (`RankingsTable`, `exportReports`)
- **Prepínanie metriky a ročníka:** Zobrazenie rebríčka **Najdlhších** alebo **Najhlbších** jaskýň Slovenska pre ľubovoľný spracovaný rok (predvolene `2026`).
- **Typografická konvencia SSS:**
  - **Tučné písmo (`bold`)** automaticky označuje lokality, na ktorých nastala zmena dĺžky alebo hĺbky oproti predchádzajúcemu ročníku.
  - **Hviezdička (`*`)** označuje nepotvrdené údaje alebo pokračujúce revízne merania stabilizovaného polygónu (napr. *Mesačný tieň* `31 840 (9031)*`).
- **Filtrovanie a radenie:** Fulltextové vyhľadávanie podľa názvu jaskyne, filter krasovej oblasti, zobrazenie iba zmenených položiek a klikateľné radenie stĺpcov.
- **Živá synchronizácia:** Administrátori môžu synchronizovať aktuálne HTML tabuľky z [`sss.sk/category/rebricky-jaskyn/`](https://sss.sk/category/rebricky-jaskyn/).
- **Exporty do CSV a PDF:**
  - **CSV (UTF-8 s BOM):** Priame otvorenie v Exceli / LibreOffice bez poškodenia slovenskej diakritiky.
  - **PDF (`jsPDF` + `jspdf-autotable`):** Profesionálna tlačová zostava v štýle SSS vrátane tučných riadkov zmien a poznámok pod čiarou pre `*`.

### Zdieľanie a vloženie rebríčka
- **Zdieľateľné odkazy:** Odkaz zachová vybranú metriku a konkrétny ročník alebo vždy najnovší ročník.
- **Vlastný iframe:** Panel „Zdieľať a vložiť“ umožňuje vybrať stĺpce, zvýraznenie zmien a prírastkov, dátum uloženia databázy a výšku. Rebríček najdlhších a najhlbších jaskýň možno vložiť samostatne.
- **Automatická výška:** Pri voľbe automatickej výšky vygenerovaný kód obsahuje `embed-resize.js`; rodičovská stránka musí povoľovať skripty. Ak ich editor blokuje, zvoľte pevnú výšku v pixeloch a použite iba iframe.
- **Verejné stránky:** [Najdlhšie jaskyne](https://jaskyne.sss.sk/najdlhsie-jaskyne.html), [najhlbšie jaskyne](https://jaskyne.sss.sk/najhlbsie-jaskyne.html) a [sitemap](https://jaskyne.sss.sk/sitemap.xml).

### 3. Detail lokality a analytické grafy (`CaveDetailDrawer`, `EvolutionCharts`)
- **Výsuvný detail jaskyne:** Základné parametre, krasová oblasť a podcelok, interaktívna SVG krivka vývoja zameraných metrov naprieč rokmi, kompletná tabuľka histórie meraní so zdrojovým vydaním *Spravodaja* a priamymi odkazmi na PDF a bibliografiu.
- **Vývojové grafy:** GSAP-animované stĺpcové porovnania top jaskynných systémov a súhrnné štatistiky podľa jednotlivých krasových oblastí Slovenska.

### 4. AI/OCR extrakcia PDF vydaní Spravodaja SSS — iba administrátor (`SpravodajOcrPanel`)
- **Index vydaní zo `sss.sk/spravodaj/`:** Automaticky načítava zoznam dostupných PDF čísel *Spravodaja SSS* so zvýraznením čísel 1 a 2, ktoré tradične obsahujú tabuľky najdlhších a najhlbších jaskýň.
- **Multimodálne AI/OCR spracovanie (Gemini):**
  - Podporuje spracovanie cez **URL PDF súboru**, **nahratie lokálneho PDF** (vrátane starších naskenovaných ročníkov) alebo **vloženie surového textu** z PDF.
  - Využíva `@google/genai` (`gemini-4-hydrogen`) s vynútenou JSON schémou (`responseSchema`) na extrakciu poradia, názvu, krasovej oblasti, podcelku, metrov, tučných zmien (`isBoldChanged`), hviezdičiek (`*`) a poznámok pod čiarou.
- **Kontrola pred zápisom:** Zobrazuje náhľad extrahovaných riadkov s možnosťou jednorazového uloženia do perzistentnej databázy.

### 5. Sémantické vyhľadávanie a prepojená bibliografia (`SemanticBibliographyPanel`, `biblioUrl`)
- **Živá integrácia s `bibliografia.sss.sk`:** Napojenie na centrálny index `https://bibliografia.sss.sk/data/articles.json` (5 900+ článkov).
- **Sémantické dopyty cez Gemini:** Vyhľadávanie v prirodzenom jazyku (napr. *"hlboké priepasti v Slovenskom krase so zmenami po roku 2018"*) s odborným zhrnutím a relevantnými jaskyňami aj článkami.
- **Presný formát odkazov:** Všetky odkazy na články a témy sa generujú v kanonickom vyhľadávacom tvare `bibliografia.sss.sk/?q=...` (malé písmená, bez diakritiky, medzery nahradené `+`, napr. `https://bibliografia.sss.sk/?q=kunia+priepast` alebo `https://bibliografia.sss.sk/?q=brazda`).

### 6. Admin rozhranie pre tvorbu budúcich rebríčkov — iba administrátor (`AdminRankingEditor`)
- **Rýchle založenie ročníka (napr. `2027`):** Jedným kliknutím predvyplní kompletnú tabuľku z ľubovoľného existujúceho ročníka (dĺžky alebo hĺbky).
- **Automatická detekcia zmien:** Pri úprave číselnej hodnoty sa okamžite vypočíta rozdiel (`delta`) oproti referenčnému roku a automaticky sa aktivuje **tučné písmo** (`bold`) s možnosťou ručného doladenia.
- **Správa nepotvrdených údajov (`*`):** Rýchly prepínač hviezdičky a textová poznámka (napr. `(9031)*`) pre každý riadok.
- **Klasický náhľad tlače:** Prepínateľný režim **Náhľad tlače Spravodaja** zobrazí rebríček v tradičnej bodkovanej úprave známej zo *Spravodaja SSS*.
- **Okamžité uloženie a export:** Priame uloženie ročníka do databázy (`POST /api/admin/save-year`) a okamžitý export zostavy do **CSV** a **PDF**.

---

## Dávkové spracovanie archívu Spravodajov (`scripts/process_spravodaje.ts`)

Pre jednorazové alebo periodické hromadné naplnenie databázy priamo z oficiálnych archívov je pripravený dávkový skript:

```bash
npx tsx scripts/process_spravodaje.ts
```

**Čo skript robí:**
1. Stiahne a zparsuje aktuálne HTML tabuľky zo `sss.sk/tabulka-najdlhsich-jaskyn-na-slovensku/` a `sss.sk/tabulka-najhlbsich-jaskyn-na-slovensku/`.
2. Získa presné URL a čísla strán tabuľkových článkov z `https://bibliografia.sss.sk/data/articles.json` pre ročníky **2012–2026**.
3. Pomocou `pdfjs-dist` načíta textové vrstvy jednotlivých PDF (s lokálnou cache v `/tmp/sss_pdfs`) a spracuje oba historické formáty tabuliek:
   - **Formát 2012–2024:** riadky s bodkovými vodiacimi čiarami (`1. Demänovský jaskynný systém, Nízke Tatry, Demänovské vrchy .......... 46 896`).
   - **Formát 2025–2026:** modernizované riadky s evidenčným číslom (`..., č. NDJ 5280   51 873`).
4. Zjednotí kánonické kľúče a ID jaskýň (odstráni koncové poznámkové indexy ako `Suchá jaskyňa 1`, normalizuje interpunkciu a aliasy), vypočíta medziročné rozdiely (`deltaLengthM`, `deltaDepthM`), vyznačí tučné zmeny a uloží čistý výsledok do `data/caves-db.json` (**117 unikátnych jaskýň**, ročníky **2005–2026**, bez duplicitných ID).

---

## Štruktúra projektu

```text
.
├── data/
│   └── caves-db.json                 # Perzistentná JSON databáza jaskýň a ročných záznamov
├── docs/
│   └── screenshots/                  # Ukážky UI pre dokumentáciu (GitHub README)
├── scripts/
│   └── process_spravodaje.ts         # Dávkový crawler a PDF parser (2012–2026)
├── src/
│   ├── assets/images/                # Vizuálne podklady aplikácie
│   ├── components/
│   │   ├── AdminRankingEditor.tsx    # Admin editor pre nové ročníky + náhľad tlače
│   │   ├── CaveAtlasMap.tsx          # Mapa krajov, miest, riek a orientačných krasových oblastí
│   │   ├── CaveDetailDrawer.tsx      # Detail jaskyne, SVG graf vývoja a bibliografia
│   │   ├── EvolutionCharts.tsx       # Súhrnné grafy prírastkov a krasových oblastí
│   │   ├── RankingsTable.tsx         # Oficiálny rebríček s filtrami, bold a * značkami
│   │   ├── SemanticBibliographyPanel.tsx # Sémantické vyhľadávanie + bibliografia.sss.sk
│   │   ├── SpravodajOcrPanel.tsx     # AI/OCR extraktor PDF čísel Spravodaja
│   │   └── TopBar.tsx                # Navigačná hlavička portálu
│   ├── data/
│   │   └── seedCaves.ts              # Základný štartovací dataset
│   ├── types/
│   │   └── caves.ts                  # Zdieľané TypeScript rozhrania
│   ├── utils/
│   │   ├── biblioUrl.ts              # Generátor kanonických odkazov ?q=pre+bibliografiu
│   │   └── exportReports.ts          # Generovanie CSV (BOM) a PDF reportov (jsPDF)
│   ├── App.tsx                       # Hlavná aplikácia a správa stavu
│   ├── index.css                     # Tailwind CSS v4 + typografia + farebné premenné SSS
│   └── main.tsx                      # Vstupný bod React aplikácie
├── server.ts                         # Express backend + Vite middleware + Gemini API
├── metadata.json                     # Metadata portálu
├── package.json                      # Skripty a závislosti
└── vite.config.ts                    # Konfigurácia Vite
```

---

## API dokumentácia

Lokálny Express backend (`server.ts`) beží na porte `3000` (alebo na porte nastavenom cez `PORT`). Produkčný build obsahuje aj PHP implementáciu pre bežný webhosting; podrobnosti a požiadavky sú v [php/README.md](php/README.md).

| Metóda | Endpoint | Popis |
| :--- | :--- | :--- |
| `GET` | `/api/auth/session` | Vráti stav prihlásenia administrátora (`{ authenticated, username? }`). |
| `POST` | `/api/auth/login` | Prihlásenie cez `{ username, password }`; nastaví `HttpOnly`, `SameSite=Strict` session cookie. |
| `POST` | `/api/auth/logout` | Zruší session cookie administrátora. |
| `GET` | `/api/caves` | Vráti zoznam jaskýň (`{ caves, updatedAt }`) bez súradníc a nadmorskej výšky. `updatedAt` je čas posledného uloženia databázového súboru v ISO 8601 (UTC), prípadne `null`, ak nie je dostupný. |
| `GET` | `/api/sss/issues` | Stiahne aktuálny zoznam PDF vydaní z `sss.sk/spravodaj/` (s fallback cache zoznamom). |
| `POST` | `/api/sss/sync-rankings` | Iba admin: zosynchronizuje HTML tabuľky z `sss.sk` a zlúči ich s databázou. |
| `GET` | `/api/bibliography?q=...&limit=40` | Proxy a fulltextový filter nad `bibliografia.sss.sk/data/articles.json`. |
| `POST` | `/api/search/semantic` | Sémantické AI vyhľadávanie (Gemini) cez jaskyne aj bibliografické články (`{ query }`). |
| `POST` | `/api/extract/pdf` | Iba admin: AI/OCR extrakcia tabuľky z `pdfUrl`, `pdfBase64` alebo `rawText` pomocou Gemini. |
| `POST` | `/api/caves/import-extraction` | Iba admin: zápis potvrdenej AI/OCR extrakcie do databázy a prepočet medziročných delt. |
| `POST` | `/api/admin/save-year` | Iba admin: uloženie alebo aktualizácia celého ročníka rebríčka z Admin editora. |

Neprihlásené požiadavky na chránené operácie dostanú HTTP `401`. Lokálny Express používa neprodukčné predvolené prihlasovanie; produkcia vyžaduje vlastné `ADMIN_USERNAME`, `ADMIN_PASSWORD`, HTTPS `APP_URL` a `SESSION_SECRET`. PHP nasadenie používa samostatnú súkromnú konfiguráciu s hashom hesla podľa [php/README.md](php/README.md).

### Príklad požiadavky na `POST /api/admin/save-year`
```json
{
  "year": 2027,
  "metric": "length",
  "statusDate": "1. 3. 2027",
  "author": "Ján Tencer",
  "footnote": "* Údaj z pokračujúceho revízneho merania polygónu.",
  "rows": [
    {
      "rank": 1,
      "caveId": "demanovsky-jaskynny-system",
      "name": "Demänovský jaskynný systém",
      "karstRegion": "Nízke Tatry",
      "subUnit": "Demänovské vrchy",
      "valueM": 52140,
      "isBoldChanged": true,
      "isUnverified": false
    }
  ]
}
```

---

## Inštalácia a spustenie

### 1. Požiadavky
- **Node.js** `>= 20.x`
- **npm**
- Voliteľne **GEMINI_API_KEY** (pre AI/OCR extrakciu PDF a sémantické vyhľadávanie; bez kľúča funguje lexikálny fallback vyhľadávania a plné prehliadanie, exporty aj Admin editor)
- **SESSION_SECRET** (povinný v produkcii; vytvorte ho príkazom `openssl rand -hex 32`)

### 2. Konfigurácia prostredia
Skopírujte `.env.example` na `.env` a nastavte váš kľúč na serverovej strane:
```bash
cp .env.example .env
```
Obsah `.env`:
```env
GEMINI_API_KEY="vas_gemini_api_kluc"
ADMIN_USERNAME="vlastne-admin-meno"
ADMIN_PASSWORD="vlastne-dlhe-nahodne-heslo"
SESSION_SECRET="hodnota-z-openssl-rand-hex-32"
PORT="3000"
APP_URL="https://domena-aplikacie.example"
```
V lokálnom vývojovom režime sa pri prázdnom `SESSION_SECRET` vygeneruje náhodný kľúč pre aktuálny beh servera. Hodnota `APP_URL` musí pri produkčnom nasadení zodpovedať verejnej HTTPS doméne; z nej sa generuje sitemap.
Tieto premenné prihlasovania platia pre Express backend. PHP hosting používa samostatné nastavenie mimo webrootu a skript `php/setup.php`; nepoužívajte v dokumentácii ani konfigurácii reálne heslá.

### 3. Inštalácia závislostí a vývojový server
```bash
npm install
npm run dev
```
Aplikácia bude dostupná na `http://localhost:3000`.

### 4. Produkčný build a spustenie
```bash
npm run build
npm start
```

`npm run build` vytvorí PHP API, Apache pravidlo a sanitizovanú snímku `dist/data/caves.json` bez súradníc. Administrácia vyžaduje PHP, presmerovanie `/api/*` a samostatne pripravenú súkromnú databázu a konfiguráciu mimo webrootu. Samotné nahratie `dist/` nestačí; postup je v [php/README.md](php/README.md).

### 5. Kontrola typov a obnova dát z archívu
```bash
npm run lint
node --import tsx --test src/utils/share.test.ts
php php/tests/integration.php
php php/tests/setup.php
npx tsx scripts/process_spravodaje.ts
```

---

## Metodika dát a ochrana prírody

- **Ochrana lokalít:** Web nezobrazuje polohy jaskýň, vchodov, GPS súradnice ani nadmorskú výšku. Mapa zobrazuje krajské hranice a širšie orientačné krasové oblasti, nie polohy jednotlivých jaskýň.
- **Zdroje:** Oficiálne štatistiky zostavovateľa Jána Tencera publikované v *Spravodaji SSS*, webové tabuľky na [`sss.sk`](https://sss.sk/category/rebricky-jaskyn/) a archív [`bibliografia.sss.sk`](https://bibliografia.sss.sk/).
