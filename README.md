# Supaplex 2.0 – Tuning Edition

Az eredeti Supaplex-klón (`../supaplex`) feltuningolt, modernizált változata.
Tiszta JavaScript, build nélkül fut: csak nyisd meg az `index.html`-t böngészőben.

## Újdonságok az 1.0-hoz képest

- **4 pálya** (1 eredeti + 3 új): Első lépések, Zonk-eső, Labirintus, A mélység
- **Pályaválasztó és feloldás**: a teljesített pálya feloldja a következőt,
  a haladás `localStorage`-ban mentődik (gombokkal vagy 1–4 billentyűkkel váltható)
- **Gördülő kamera**: a pályák nagyobbak a képernyőnél, a kamera simán követi Murphy-t
- **3×3-as robbanás** halálkor, mint az eredeti Supaplexben
- **Részecske-effektek**: ásás, infotron-gyűjtés, zonk-koppanás, robbanás, győzelmi konfetti
- **Képernyőrázás** koppanáskor és robbanáskor
- **Animált grafika**: lüktető infotronok körbejáró csillanással, pulzáló exit-portál,
  pislogó Murphy, lüktető hardver-lámpák, áramköri panel háttérminta, vignetta
- **Space + irány**: "kinyúlás" – base/infotron megevése helyben maradva (eredeti mechanika)
- **Modern HUD**: pályanév, játékidő, infotron progress bar, pályaváltó gombok
- **Mobil támogatás**: érintő D-pad érintőképernyős eszközökön
- Új hangok: robbanás, pályakezdő jingle; némítás-állapot mentése

## Irányítás

| Gomb | Funkció |
|---|---|
| Nyilak / WASD | mozgás |
| Space + irány | evés helyben maradva |
| R | pálya újraindítása |
| N | következő pálya (győzelem után) |
| 1–4 | pályaválasztás (csak feloldott) |
| M | némítás |

## Fejlesztői segédek

- `node validate-levels.js` – pályatérképek ellenőrzése (sorhossz, perem,
  pontosan 1 Murphy/exit, minden infotron elérhető)
- `node smoke-test.js` – headless füstpróba DOM-stubokkal

## Pályakészítés

Új pálya a `levels.js`-ben adható hozzá karaktertérképként
(`#` fal, `H` hardver, `=` föld, `.` üres, `M` Murphy, `I` infotron,
`Z` zonk, `E` kijárat). Hozzáadás után futtasd a validátort.
