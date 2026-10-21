# Ralex S.R.O — naše appky

Statický web pro GitHub Pages. Přehled appek → klik → stránka appky s fotkou z mobilu, z PC a videem.

## Struktura
```
index.html        přehled appek
app.html          detail appky (app.html?id=nazev)
style.css         vzhled
apps.json         seznam appek
apps/<id>/        soubory appky: logo.png, mobil.png, pc.png, video.mp4
```

## Přidání appky
1. Na webu klikni na **+**, vyplň a zkopíruj vygenerovaný blok.
2. Vlož ho do `apps.json` (oddělit čárkou od předchozí appky).
3. Vytvoř složku `apps/<id>/` a nahraj `logo.png`, `mobil.png`, `pc.png`, `video.mp4`.
4. Commit → za chvíli je to na webu.

## Tipy
- Fotka z mobilu: normální screenshot z iPhonu (na výšku).
- Fotka z PC: screenshot okna appky, ideálně poměr 16:10.
- Video: MP4 (H.264), GitHub bere max 100 MB na soubor — radši do 50 MB. Delší video dej na YouTube a do `"video"` vlož odkaz.
