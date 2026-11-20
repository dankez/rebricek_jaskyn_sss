# PHP a Apache

`npm run build` lokálne zostaví frontend aj PHP API do `dist/`. Na hostingu
nie sú potrebné Node.js ani npm. Potrebné sú PHP 8.1 alebo novšie, rozšírenia
`curl`, `mbstring`, `iconv`, `json` a `session` a Apache s `mod_rewrite` a
povoleným `.htaccess`. Pri inom webovom serveri je potrebné ekvivalentné
presmerovanie `/api/*` na `/api/index.php`.
Na Websupporte sa PHP verzia pre web nastavuje v službe subdomény vo
Webadmine; verzia `php -v` v SSH nemusí byť totožná s verziou webu.

## Nasadenie

1. Zálohujte web a aktuálnu databázu. Pred kopírovaním databázy zastavte
   zápisy v starom backendu. Starý a nový backend nesmú súčasne zapisovať.
2. Nahrajte celý `dist/` vrátane skrytého `.htaccess` do webrootu subdomény.
3. Vytvorte súkromný adresár mimo všetkých verejne prístupných webrootov, napr.
   v domovskom adresári SSH účtu **mimo priečinka `sss.sk`**. Nepoužívajte
   súrodenecký priečinok v `sub/`: na Websupporte môže byť verejnou
   subdoménou. Adresár musí
   byť zapisovateľný používateľom PHP. Nahrajte tam mimo webrootu aj zdrojovú
   databázu `data/caves-db.json` pod iným menom (napr. `source.json`) a
   `php/setup.php`. Surová databáza obsahuje súradnice; **nikdy ju nenahrávajte
   do `dist/` ani verejného webrootu**.
4. V SSH spustite nasledujúce príkazy s vlastnými absolútnymi cestami. Heslo
   sa nezobrazí na obrazovke ani nevkladá do príkazového riadka. PHP proces a
   SSH používateľ musia mať právo pristupovať k vytvoreným súkromným súborom.

   ```sh
   read -r -p 'Admin meno: ' SSS_USER
   read -r -s -p 'Admin heslo (aspoň 12 znakov): ' SSS_PASSWORD; echo
   printf '%s\n%s\n' "$SSS_USER" "$SSS_PASSWORD" | php /cesta/sss-private/setup.php /cesta/webroot /cesta/sss-private /cesta/sss-private/source.json
   unset SSS_USER SSS_PASSWORD
   ```

   Skript existujúcu databázu ani konfiguráciu neprepisuje. Vytvorí aj
   `api/private-path.php`, ktorý obsahuje iba cestu k súkromnému adresáru;
   pri nahrávaní nového buildu ho zachovajte. Ak ho nahrávanie odstráni,
   vytvorte ho znova v tvare `<?php return '/absolutna/cesta/mimo/webu';`.
   Alternatívne možno cestu
   nastaviť v prostredí PHP pomocou `SSS_PRIVATE_DIR`. Cesta musí byť mimo
   všetkých verejných webov, nielen tejto subdomény.
5. Ak používate Gemini, bezpečne doplňte `gemini_api_key` do súkromného
   `config.php`; bez kľúča funguje textové vyhľadávanie, ale nie AI/OCR.
   Pri PDF do 24 MB nastavte primerane PHP `memory_limit`, `post_max_size`
   a limit veľkosti požiadavky hostingu. URL PDF na extrakciu sú z bezpečnostných
   dôvodov obmedzené na `sss.sk/wp-content/uploads/`.
6. Overte cez HTTPS verejné `/api/caves`, prihlásenie a uloženie skúšobného
   ročníka. Skontrolujte aj neprístupnosť súkromnej databázy z webu.

Synchronizácia dopĺňa iba chýbajúce hodnoty; existujúce údaje a korekcie
neprepisuje. Obnovenie pôvodnej verzie vyžaduje zastaviť PHP zápisy, zálohovať
novú databázu a nasadiť starý frontend a Node backend.

Lokálne skúšky: `php php/tests/integration.php` a `php php/tests/setup.php`.
