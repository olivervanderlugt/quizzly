# Ontwerpvoorstel — app-chrome van Quizzly

**Status: voorstel. Er is met dit document niets toegepast.**

Dit document beschrijft drie mogelijke richtingen voor de *app-chrome* van
Quizzly (dashboard, editor, formulieren, instellingen) en beveelt er één aan.
Het wijzigt geen enkele regel applicatiecode. Het daadwerkelijk doorvoeren van
een gekozen richting is een aparte taak (`quizzly-design-pass-toepassen`), die
wacht op Ollie's smaakoordeel.

De token-namen, CSS-klassen en codecommentaren in dit document blijven Engels,
omdat de repo dat overal doet. De toelichting is Nederlands.

---

## 1. Wat er nu staat

### 1.1 De feitelijke palet-definitie

Alle chrome-kleuren komen uit één `@theme`-blok in `src/app/globals.css`
(regels 18–38). Er is geen tweede CSS-bestand; `src/app/globals.css` is de enige
`.css` in `src/`.

| Token | Hex | Token | Hex |
| --- | --- | --- | --- |
| `--color-ink-50` | `#f6f7fb` | `--color-ink-600` | `#454a73` |
| `--color-ink-100` | `#eceef6` | `--color-ink-700` | `#343858` |
| `--color-ink-200` | `#d9dced` | `--color-ink-800` | `#22243c` |
| `--color-ink-300` | `#b4bad4` | `--color-ink-900` | `#14152a` |
| `--color-ink-400` | `#838bb0` | `--color-ink-950` | `#0b0c18` |
| `--color-ink-500` | `#5d6490` | | |
| `--color-brand-400` | `#818cf8` | `--color-brand-600` | `#4f46e5` |
| `--color-brand-500` | `#6366f1` | `--color-brand-700` | `#4338ca` |

`body` staat op `background: var(--color-ink-950)` = **`#0b0c18`**, met
`color: var(--color-ink-100)` = `#eceef6` (globals.css regels 50–56). `#0b0c18`
is bijna-zwart: relatieve luminantie `0.0043`, oftewel 19,4:1 tegen wit. De hele
app zit dus op een vrijwel zwarte ondergrond.

De `ink`-ramp is niet neutraal grijs maar **blauwviolet getint**: `ink-500`
`#5d6490` heeft een merkbaar blauwe component (B 144 tegen R 93), en de brand-ramp
is indigo (`#6366f1`). Chrome én accent trekken dus dezelfde kant op. Dat is
samenhangend, maar het maakt het geheel koel en een beetje "nachtelijk
dashboard".

### 1.2 Belangrijk: dit is géén opruimklus

Ik heb hier expliciet op gecontroleerd, omdat het de aard van de taak bepaalt.

Een zoekopdracht over heel `src/` naar Tailwind-standaardneutralen
(`gray-`, `slate-`, `zinc-`, `neutral-`, `stone-`, in elke utility-vorm en ook
als losse tekst) levert **nul treffers**. De kleurfamilies die daadwerkelijk in
`src/` voorkomen zijn:

| Familie | Aantal voorkomens | Rol |
| --- | --- | --- |
| `ink` | 166 | chrome-neutralen |
| `red` | 42 | fouten / gevaar |
| `brand` | 30 | accent |
| `amber` | 17 | waarschuwing |
| `emerald` | 12 | succes / publiek |

De chrome is vandaag dus **al visueel consistent**. Er zijn geen zwerfklassen op
te ruimen. Wat hier voorligt is daarom een echte richtingkeuze — een smaak- en
toonbeslissing — en niet een opruimactie die zichzelf rechtvaardigt. Als Ollie
het huidige donkere beeld mooi vindt, is "niets doen" een volwaardige,
verdedigbare uitkomst.

### 1.3 Wat er wél aantoonbaar misgaat

Drie concrete, narekenbare problemen. Deze staan los van de richtingkeuze en
zouden in élke richting meegenomen moeten worden.

**(a) `text-ink-500` haalt AA niet.** `ink-500` `#5d6490` op `ink-950` `#0b0c18`
geeft **3,42:1**; op een `.app-card` (`ink-900` `#14152a`) **3,15:1**. De eis is
4,5:1 voor normale tekst. Het gaat niet om een randgeval: `text-ink-500` komt
**44 keer voor, in 16 bestanden**, en vrijwel altijd op `text-xs` — dus kleine
tekst, waar 3:1 (de grens voor grote tekst) sowieso niet geldt. Voorbeelden:
`src/components/editor/QuestionEditor.tsx` (hulpteksten onder velden, o.a.
regels 99, 155, 305, 336), `src/components/editor/EditorClient.tsx` (regels 352,
384, 402), `src/components/collab/ContributeClient.tsx` (regels 90, 97). Dit is
de meest voorkomende AA-overtreding in de chrome.

**(b) De hover-staat van de primaire knop zakt onder AA.** `.btn-primary` is
`brand-600` `#4f46e5` met witte tekst = 6,29:1 ✅. Maar
`.btn-primary:not(:disabled):hover` gaat naar `brand-500` `#6366f1` (globals.css
regels 248–250) en wit daarop is **4,47:1** — net onder 4,5:1. De oorzaak is
structureel: de hover maakt de knop *lichter*, terwijl de tekst al wit is. Elke
richting hieronder laat hover daarom juist *donkerder* worden (of keert de knop
om naar donkere tekst op een lichte vlak).

**(c) De rand van invoervelden haalt 1.4.11 niet.** `.app-input` heeft
`background: var(--color-ink-950)` — precies dezelfde kleur als `body` — met
`border: 1px solid var(--color-ink-700)` (globals.css regels 194–202). Het veld
is dus *uitsluitend* aan die rand te herkennen, en `ink-700` `#343858` op
`ink-950` `#0b0c18` is **1,72:1**, tegen een eis van 3:1 voor
gebruikersinterface-componenten. Ter vergelijking: de rand van `.app-card`
(`ink-800` op `ink-950`, 1,28:1) is wél verdedigbaar als decoratief, want een
kaart is geen bedienbaar element en heeft ook een eigen vlak — maar een
invoerveld is dat wel.

**(d) Losse vondst — vijf `brand`-tinten bestaan niet.** `@theme` definieert
alleen `brand-400` t/m `brand-700`. In `src/` worden echter ook
`brand-200`, `brand-300`, `brand-800`, `brand-900` en `brand-950` gebruikt. In
Tailwind v4 genereert een niet-gedefinieerde tint géén CSS. Ik heb dat
nagemeten in de gebouwde stylesheet (`.next/static/css/*.css` na `npm run
build`): `bg-brand-900`, `text-brand-300`, `bg-brand-950`, `text-brand-200` en
`border-brand-800` komen daar **0 keer** in voor, terwijl `bg-brand-600`,
`text-brand-400` en `bg-emerald-900` er wél in staan.

Zichtbaar gevolg op het dashboard (`src/app/dashboard/page.tsx` regel 143): het
`group · collecting`-label heeft `bg-brand-900 … text-brand-300` en krijgt dus
**geen achtergrond en geen eigen tekstkleur** — het erft gewoon de bodykleur.
Het `public`-label ernaast (regel 148) gebruikt wél bestaande tinten
(`bg-emerald-900 text-emerald-300`) en ziet er dus als enige uit als een echt
badge. Dezelfde fout staat in `src/app/collab/[id]/page.tsx` (regels 78–79).
Alle drie de richtingen hieronder leveren daarom een **complete** brand-ramp van
300 t/m 950.

---

## 2. Randvoorwaarden — wat in geen enkele richting verandert

Deze grenzen gelden voor alle drie de voorstellen en worden per richting in §4
nog eens expliciet herbevestigd.

1. **De quiz-surface blijft volledig ongemoeid.** Geen wijziging aan
   `.quiz-surface`, `.quiz-display`, `.quiz-card`, `.answer-tile` (inclusief alle
   `data-state`-varianten) of aan welke `--q-*`-variabele dan ook. Die worden
   geschreven door `themeToCssVars()` in `src/lib/theme.ts` en voeden de tien
   quizthema's. De scheiding tussen chrome en quiz-surface is precies wat het
   commentaar bovenaan `globals.css` beschrijft, en dat blijft intact.
2. **De enige aanraking tussen beide systemen blijft de fallback.**
   `.quiz-surface` valt terug op `var(--q-bg, var(--color-ink-950))` en
   `.quiz-card` op `--q-surface`. Zodra een thema geladen is, is `--q-bg` gezet
   en doet de fallback niets. Verandert `ink-950` van waarde, dan verandert
   alleen die ene ongebruikte noodwaarde mee. Wie dat óók niet wil, vervangt de
   fallback door de letterlijke `#0b0c18` — dat is een wijziging van één regel,
   maar hij hoort bij de *toepas*-taak, niet hier.
3. **De minimale aanraakoppervlakte van 44px blijft.** `.btn` houdt zijn
   `padding: 0.6rem 1.1rem` en de expliciete `h-11 w-11` (44px) knoppen in
   `src/components/play/AnswerInput.tsx` (regels 537, 546) blijven zoals ze zijn.
   Geen enkele richting raakt afmetingen, padding of regelhoogte aan — het gaat
   uitsluitend om kleurwaarden.
4. **De `:focus-visible`-ring blijft zichtbaar.** De regel blijft
   `outline: 2px solid …; outline-offset: 2px` (globals.css regels 61–65).
   Alleen de *kleur* van de ring schuift mee met de richting, en per richting is
   uitgerekend dat hij ≥3:1 haalt op élke ondergrond waarop hij kan landen
   (paginavlak én kaartvlak).
5. **Geen nieuwe afhankelijkheden en geen nieuwe bouwstap.** Elke richting is
   uit te voeren door waarden in het bestaande `@theme`-blok te wijzigen, plus
   — alleen bij richting C — één `@media`-blok toe te voegen.

---

## 3. Hoe de contrastcijfers berekend zijn

Alle verhoudingen in dit document zijn *berekend*, niet geschat, met de
WCAG 2.1-formule.

Per kanaal wordt `c = waarde / 255` gelineariseerd:

```
c ≤ 0,03928  →  c / 12,92
c > 0,03928  →  ((c + 0,055) / 1,055) ^ 2,4
```

Daarna de relatieve luminantie `L = 0,2126·R + 0,7152·G + 0,0722·B`, en de
verhouding `(L_licht + 0,05) / (L_donker + 0,05)`.

Drempels: **4,5:1** voor normale tekst (1.4.3), **3:1** voor grote tekst en voor
gebruikersinterface-componenten en hun grenzen (1.4.11). Randen die puur
decoratief zijn — een kaartrand waar de kaart ook een eigen vlak heeft — vallen
buiten 1.4.11; die staan in de tabellen als *(deco)* met het cijfer erbij, zodat
het zichtbaar blijft, maar zonder ze als zakker te tellen.

Het rekenscript staat in bijlage A, zodat de cijfers navolgbaar zijn.

---

## 4. De drie richtingen

### Richting A — "Daglicht": lichter en witter

**Idee.** De chrome wordt een lichte werkomgeving: paginavlak bijna-wit, kaarten
zuiver wit, tekst donker. Het indigo-accent blijft, maar verschuift naar de
donkere tinten van de ramp, want op wit heeft indigo diepte nodig.

**Waarom.** Quizzly's chrome is gereedschap: je zit er lang in te typen. Lange
leestaken op licht papier zijn voor veel mensen rustiger, en — belangrijker voor
dit product — het maakt het **contrast met de quiz-surface maximaal**. Een neon-
op-zwart thema knalt straks los van een lichte editor; nu lopen editor en quiz
allebei richting zwart en vloeien ze in elkaar over. Dit is de enige richting die
de gebruiker fysiek laat voelen dat hij van "bouwen" naar "spelen" schakelt.

**Nadeel, eerlijk gezegd.** Het is de grootste breuk met hoe Quizzly er nu
uitziet, en een lichte app in een verduisterd klaslokaal of een avondsessie is
feller dan wat er nu staat.

De ramp behoudt de bestaande betekenis (`50` = lichtst, `950` = donkerst); wat
verandert is welke treden de chrome gebruikt.

```css
@theme {
  /* Richting A — koel-neutraal, licht gebruikt */
  --color-ink-50:  #ffffff;
  --color-ink-100: #f6f7fb;
  --color-ink-200: #eaecf4;
  --color-ink-300: #d6dae8;
  --color-ink-400: #b0b6cb;
  --color-ink-500: #7d849f;
  --color-ink-600: #5b6280;
  --color-ink-700: #414761;
  --color-ink-800: #2d3145;
  --color-ink-900: #1c1f2e;
  --color-ink-950: #0f111b;

  /* indigo behouden, ramp compleet gemaakt (zie §1.3d) */
  --color-brand-300: #a5b4fc;
  --color-brand-400: #818cf8;
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-brand-700: #4338ca;
  --color-brand-800: #3730a3;
  --color-brand-900: #312e81;
  --color-brand-950: #1e1b4b;
}
```

Rolverdeling: `body` = `ink-100`, kaarten = `ink-50`, koptekst = `ink-950`,
lopende tekst = `ink-900`, gedempte tekst = `ink-600`, veldrand = `ink-500`,
accent en focusring = `brand-600`/`brand-700`.

| Combinatie | Voor / achter | Ratio | Eis | |
| --- | --- | --- | --- | --- |
| Lopende tekst | `ink-900` `#1c1f2e` / `ink-100` `#f6f7fb` | **15,27:1** | 4,5 | ✅ |
| Koptekst | `ink-950` `#0f111b` / `ink-100` | **17,57:1** | 4,5 | ✅ |
| Tekst op kaart | `ink-900` / `ink-50` `#ffffff` | **16,34:1** | 4,5 | ✅ |
| Gedempte tekst | `ink-600` `#5b6280` / `ink-100` | **5,60:1** | 4,5 | ✅ |
| Gedempte tekst op kaart | `ink-600` / `ink-50` | **5,99:1** | 4,5 | ✅ |
| Veldlabel | `ink-700` `#414761` / `ink-50` | **9,14:1** | 4,5 | ✅ |
| Placeholder | `ink-600` / `ink-50` | **5,99:1** | 4,5 | ✅ |
| `.btn-ghost` tekst | `ink-800` `#2d3145` / `ink-100` | **11,98:1** | 4,5 | ✅ |
| `.btn-primary` | `#ffffff` / `brand-600` `#4f46e5` | **6,29:1** | 4,5 | ✅ |
| `.btn-primary:hover` | `#ffffff` / `brand-700` `#4338ca` | **7,90:1** | 4,5 | ✅ |
| `.btn-danger` | `#ffffff` / `#b91c1c` | **6,47:1** | 4,5 | ✅ |
| Veldrand (1.4.11) | `ink-500` `#7d849f` / `ink-50` | **3,70:1** | 3,0 | ✅ |
| `.btn-ghost`-rand (1.4.11) | `ink-500` / `ink-100` | **3,46:1** | 3,0 | ✅ |
| Focusring op pagina | `brand-600` / `ink-100` | **5,87:1** | 3,0 | ✅ |
| Focusring op kaart | `brand-600` / `ink-50` | **6,29:1** | 3,0 | ✅ |
| Accentlink | `brand-700` / `ink-100` | **7,38:1** | 4,5 | ✅ |
| Accentlink op kaart | `brand-700` / `ink-50` | **7,90:1** | 4,5 | ✅ |
| Kaartrand *(deco)* | `ink-300` / `ink-100` | 1,30:1 | — | n.v.t. |

Alle genormeerde paren halen AA. Let op dat de hover hier *donkerder* wordt —
dat repareert probleem (b) uit §1.3.

**Herbevestiging richting A.** Geen wijziging aan `.quiz-surface`, `.quiz-card`,
`.answer-tile` of enige `--q-*`-variabele; de tien quizthema's blijven exact
werken. De 44px-aanraakoppervlakte blijft ongewijzigd (geen enkele
afmetingsregel wordt aangeraakt). De `:focus-visible`-ring blijft staan, met
`brand-600` als kleur: 5,87:1 op het paginavlak en 6,29:1 op een kaart, beide
ruim boven de 3:1.

---

### Richting B — "Haard": donker, maar warm en minder blauw

**Idee.** Blijf donker, maar haal het blauw uit de neutralen. De ramp wordt een
warme taupe/steengrijs, en het accent schuift van indigo naar een zachte violet —
warm genoeg om niet te vloeken met de neutralen, en ver genoeg van rood, amber en
emerald om niet met de semantische kleuren te botsen.

**Waarom.** Dit is de kleinste stap: wie het donkere Quizzly nu mooi vindt,
herkent het nog steeds, maar het voelt minder als een serverdashboard en meer als
iets waar je vrijwilligers en docenten in laat werken. Warme neutralen ogen bij
gelijke luminantie doorgaans zachter dan koude.

**Nadeel, eerlijk gezegd.** Het lost het "editor en quiz lopen visueel in elkaar
over"-probleem niet op, want de chrome blijft bijna-zwart. En een violet accent
op een warme ondergrond is een smaakoordeel waar redelijke mensen over
verschillen.

```css
@theme {
  /* Richting B — warme neutralen, donker gebruikt */
  --color-ink-50:  #faf8f6;
  --color-ink-100: #f0edea;
  --color-ink-200: #e0dbd6;
  --color-ink-300: #c0b9b2;
  --color-ink-400: #9c948c;
  --color-ink-500: #7a716a;
  --color-ink-600: #5a534d;
  --color-ink-700: #423c37;
  --color-ink-800: #2b2724;
  --color-ink-900: #1c1917;
  --color-ink-950: #12100f;

  /* indigo → violet; naam blijft `brand`, dus geen hernoemingen in src/ */
  --color-brand-300: #d8c2ff;
  --color-brand-400: #c1a0fb;
  --color-brand-500: #a97ef5;
  --color-brand-600: #8f5ce8;
  --color-brand-700: #7642cc;
  --color-brand-800: #5d33a3;
  --color-brand-900: #3f2470;
  --color-brand-950: #271548;
}
```

Rolverdeling: `body` = `ink-950`, kaarten = `ink-900`, koptekst = `ink-50`,
lopende tekst = `ink-100`, gedempte tekst = `ink-400` (níét meer `ink-500`, zie
§1.3a), veldvlak = `ink-900` met rand `ink-500`. De primaire knop draait om:
donkere tekst op een lichte accentvlak, wat op een donkere achtergrond meer
gewicht geeft dan wit-op-paars.

| Combinatie | Voor / achter | Ratio | Eis | |
| --- | --- | --- | --- | --- |
| Lopende tekst | `ink-100` `#f0edea` / `ink-950` `#12100f` | **16,27:1** | 4,5 | ✅ |
| Koptekst | `ink-50` `#faf8f6` / `ink-950` | **17,91:1** | 4,5 | ✅ |
| Tekst op kaart | `ink-100` / `ink-900` `#1c1917` | **15,00:1** | 4,5 | ✅ |
| Gedempte tekst | `ink-400` `#9c948c` / `ink-950` | **6,35:1** | 4,5 | ✅ |
| Gedempte tekst op kaart | `ink-400` / `ink-900` | **5,85:1** | 4,5 | ✅ |
| Veldlabel | `ink-300` `#c0b9b2` / `ink-950` | **9,78:1** | 4,5 | ✅ |
| Placeholder | `ink-400` / `ink-900` | **5,85:1** | 4,5 | ✅ |
| `.btn-ghost` tekst | `ink-200` `#e0dbd6` / `ink-950` | **13,80:1** | 4,5 | ✅ |
| `.btn-primary` | `ink-950` / `brand-400` `#c1a0fb` | **8,75:1** | 4,5 | ✅ |
| `.btn-primary:hover` | `ink-950` / `brand-300` `#d8c2ff` | **11,82:1** | 4,5 | ✅ |
| `.btn-danger` | `#ffffff` / `#b91c1c` | **6,47:1** | 4,5 | ✅ |
| Veldrand (1.4.11) | `ink-500` `#7a716a` / `ink-900` | **3,66:1** | 3,0 | ✅ |
| `.btn-ghost`-rand (1.4.11) | `ink-500` / `ink-950` | **3,97:1** | 3,0 | ✅ |
| Focusring op pagina | `brand-400` / `ink-950` | **8,75:1** | 3,0 | ✅ |
| Focusring op kaart | `brand-400` / `ink-900` | **8,07:1** | 3,0 | ✅ |
| Accentlink | `brand-400` / `ink-950` | **8,75:1** | 4,5 | ✅ |
| Accentlink op kaart | `brand-400` / `ink-900` | **8,07:1** | 4,5 | ✅ |
| Kaartrand *(deco)* | `ink-800` / `ink-950` | 1,28:1 | — | n.v.t. |

Alle genormeerde paren halen AA, met ruime marges. Het veldvlak schuift naar
`ink-900` zodat het veld óók zonder rand van de pagina te onderscheiden is —
dat repareert probleem (c) uit §1.3 twee keer: door het vlak én door de rand.

**Herbevestiging richting B.** Geen wijziging aan `.quiz-surface`, `.quiz-card`,
`.answer-tile` of enige `--q-*`-variabele; de tien quizthema's blijven exact
werken. De 44px-aanraakoppervlakte blijft ongewijzigd. De `:focus-visible`-ring
blijft staan, met `brand-400`: 8,75:1 op het paginavlak en 8,07:1 op een kaart.

---

### Richting C — "Twee standen": licht als optie náást donker

**Idee.** Eén ramp, twee standen. Donker blijft het uitgangspunt; wie zijn
besturingssysteem op licht heeft staan, krijgt automatisch een lichte chrome.
Dat vraagt één extra laag: de componenten mogen dan niet langer rechtstreeks naar
een ramp-trede wijzen, maar naar *semantische* tokens die per stand omklappen.

**Waarom.** Het is de enige richting die de vraag niet hoeft te beantwoorden.
Ollie kiest niet tussen licht en donker; het apparaat kiest. Voor een tool die op
een beamer in een lokaal én op een laptop 's avonds gebruikt wordt, is dat
inhoudelijk het sterkste antwoord.

**Nadeel, eerlijk gezegd.** Het is verreweg het meeste werk, en het werk zit
níét in de kleuren maar in de 166 `ink`-utilities in `src/`: die moeten
stuk voor stuk van `text-ink-400` naar iets als `text-muted` verhuizen, anders
klapt de helft niet mee. Het is ook de enige richting die de belofte "de chrome
is vast en verandert niet" uit het commentaar in `globals.css` iets afzwakt —
niet per quiz, wel per apparaat. En elke toekomstige UI moet voortaan in twee
standen nagekeken worden.

```css
@theme {
  /* Richting C — neutraal-koel, bruikbaar van beide kanten */
  --color-ink-50:  #f8f9fc;
  --color-ink-100: #eef0f6;
  --color-ink-200: #dde0eb;
  --color-ink-300: #c2c7da;
  --color-ink-400: #9aa1bd;
  --color-ink-500: #767d9c;
  --color-ink-600: #545a76;
  --color-ink-700: #3d425c;
  --color-ink-800: #282c41;
  --color-ink-900: #191c2d;
  --color-ink-950: #0d0f1b;

  --color-brand-300: #a5b4fc;
  --color-brand-400: #818cf8;
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-brand-700: #4338ca;
  --color-brand-800: #3730a3;
  --color-brand-900: #312e81;
  --color-brand-950: #1e1b4b;
}

/* Semantische laag: dit is wat de componenten voortaan gebruiken. */
:root {
  --surface-page:   var(--color-ink-950);
  --surface-raised: var(--color-ink-900);
  --text-strong:    #ffffff;
  --text-body:      var(--color-ink-100);
  --text-muted:     var(--color-ink-400);
  --text-label:     var(--color-ink-300);
  --border-field:   var(--color-ink-500);
  --accent-text:    var(--color-brand-400);
  --accent-ring:    var(--color-brand-400);
}

@media (prefers-color-scheme: light) {
  :root {
    --surface-page:   var(--color-ink-100);
    --surface-raised: var(--color-ink-50);
    --text-strong:    var(--color-ink-950);
    --text-body:      var(--color-ink-900);
    --text-muted:     var(--color-ink-600);
    --text-label:     var(--color-ink-700);
    --border-field:   var(--color-ink-500);
    --accent-text:    var(--color-brand-700);
    --accent-ring:    var(--color-brand-600);
  }
}
```

**Donkere stand**

| Combinatie | Voor / achter | Ratio | Eis | |
| --- | --- | --- | --- | --- |
| Lopende tekst | `ink-100` `#eef0f6` / `ink-950` `#0d0f1b` | **16,74:1** | 4,5 | ✅ |
| Tekst op kaart | `ink-100` / `ink-900` `#191c2d` | **14,80:1** | 4,5 | ✅ |
| Gedempte tekst | `ink-400` `#9aa1bd` / `ink-950` | **7,45:1** | 4,5 | ✅ |
| Gedempte tekst op kaart | `ink-400` / `ink-900` | **6,59:1** | 4,5 | ✅ |
| Veldlabel | `ink-300` `#c2c7da` / `ink-950` | **11,33:1** | 4,5 | ✅ |
| Placeholder | `ink-400` / `ink-900` | **6,59:1** | 4,5 | ✅ |
| `.btn-primary` | `#ffffff` / `brand-600` | **6,29:1** | 4,5 | ✅ |
| `.btn-primary:hover` | `#ffffff` / `brand-700` | **7,90:1** | 4,5 | ✅ |
| Veldrand (1.4.11) | `ink-500` `#767d9c` / `ink-900` | **4,16:1** | 3,0 | ✅ |
| Focusring op pagina | `brand-400` / `ink-950` | **6,39:1** | 3,0 | ✅ |
| Focusring op kaart | `brand-400` / `ink-900` | **5,65:1** | 3,0 | ✅ |
| Accentlink | `brand-400` / `ink-950` | **6,39:1** | 4,5 | ✅ |
| Kaartrand *(deco)* | `ink-800` / `ink-950` | 1,39:1 | — | n.v.t. |

**Lichte stand**

| Combinatie | Voor / achter | Ratio | Eis | |
| --- | --- | --- | --- | --- |
| Lopende tekst | `ink-900` `#191c2d` / `ink-100` `#eef0f6` | **14,80:1** | 4,5 | ✅ |
| Tekst op kaart | `ink-900` / `ink-50` `#f8f9fc` | **16,02:1** | 4,5 | ✅ |
| Gedempte tekst | `ink-600` `#545a76` / `ink-100` | **5,94:1** | 4,5 | ✅ |
| Gedempte tekst op kaart | `ink-600` / `ink-50` | **6,43:1** | 4,5 | ✅ |
| Veldlabel | `ink-700` `#3d425c` / `ink-50` | **9,36:1** | 4,5 | ✅ |
| Placeholder | `ink-600` / `ink-50` | **6,43:1** | 4,5 | ✅ |
| `.btn-primary` | `#ffffff` / `brand-600` | **6,29:1** | 4,5 | ✅ |
| `.btn-primary:hover` | `#ffffff` / `brand-700` | **7,90:1** | 4,5 | ✅ |
| Veldrand (1.4.11) | `ink-500` `#767d9c` / `ink-50` | **3,85:1** | 3,0 | ✅ |
| Focusring op pagina | `brand-600` / `ink-100` | **5,52:1** | 3,0 | ✅ |
| Focusring op kaart | `brand-600` / `ink-50` | **5,97:1** | 3,0 | ✅ |
| Accentlink | `brand-700` / `ink-100` | **6,94:1** | 4,5 | ✅ |
| Kaartrand *(deco)* | `ink-300` / `ink-100` | 1,48:1 | — | n.v.t. |

`.btn-danger` (`#ffffff` op `#b91c1c`, **6,47:1**) haalt AA in beide standen en
hoeft niet om te klappen.

**Herbevestiging richting C.** Geen wijziging aan `.quiz-surface`,
`.quiz-card`, `.answer-tile` of enige `--q-*`-variabele; de tien quizthema's
blijven exact werken — en nadrukkelijk óók in de lichte stand, want de
quiz-surface leest `--q-*`, niet de semantische chrome-tokens, en `--q-bg` is
altijd gezet zodra een thema geladen is. De 44px-aanraakoppervlakte blijft
ongewijzigd. De `:focus-visible`-ring blijft staan en gebruikt `--accent-ring`,
die per stand omklapt: donker 6,39:1 (pagina) / 5,65:1 (kaart), licht 5,52:1
(pagina) / 5,97:1 (kaart).

---

## 5. Voor en na — de twee drukst bezochte chrome-schermen

Geen mockups; een token-vergelijking is preciezer en veroudert niet.

### 5.1 Dashboard (`src/app/dashboard/page.tsx`)

| Element | Nu | A "Daglicht" | B "Haard" | C, lichte stand |
| --- | --- | --- | --- | --- |
| Paginavlak | `ink-950` `#0b0c18` | `ink-100` `#f6f7fb` | `ink-950` `#12100f` | `ink-100` `#eef0f6` |
| Kopbalk-onderrand | `ink-800` | `ink-300` | `ink-800` (warm) | `ink-300` |
| Woordmerk "Quiz**zly**" | wit + `brand-400` | `ink-950` + `brand-700` | `ink-50` + `brand-400` | `ink-950` + `brand-700` |
| Gebruikersnaam | `ink-400`, 5,82:1 | `ink-600`, 5,60:1 | `ink-400`, 6,35:1 | `ink-600`, 5,94:1 |
| `.app-card` (quizkaart) | `ink-900` op `ink-950` — 1,08:1 verschil, praktisch alleen aan de rand te zien | wit op `ink-100` + schaduw: de kaart wordt een echt object | `ink-900` warm op `ink-950` | `ink-50` op `ink-100` + schaduw |
| Quiztitel | wit, 19,44:1 | `ink-900`, 16,34:1 | `ink-50`, 17,91:1 | `ink-900`, 16,02:1 |
| Regel "3 questions · played 2 times" | `ink-400`, 5,37:1 op kaart | `ink-600`, 5,99:1 | `ink-400`, 5,85:1 | `ink-600`, 6,43:1 |
| Badge `group · collecting` | **kapot**: `bg-brand-900`/`text-brand-300` bestaan niet, dus geen vlak en geërfde tekstkleur (§1.3d) | `brand-300`-vlak met `brand-800`-tekst, 4,98:1 — ziet er eindelijk uit als het `public`-badge ernaast | `brand-900`-vlak met `brand-300`-tekst, 7,70:1, nu wél gedefinieerd | licht 4,98:1 / donker 5,73:1 |
| `Host`-knop | `brand-600` + wit, 6,29:1; hover 4,47:1 ✗ | `brand-600`, hover `brand-700` 7,90:1 ✅ | `brand-400`-vlak + donkere tekst, 8,75:1 ✅ | `brand-600`, hover `brand-700` ✅ |
| `Edit` / `Export` (ghost) | `ink-200`-tekst, rand `ink-700` 1,72:1 | `ink-800`-tekst, rand `ink-500` 3,46:1 ✅ | `ink-200`-tekst, rand `ink-500` 3,97:1 ✅ | klapt mee |
| Titelveld nieuwe quiz | vlak = paginavlak, alleen 1,72:1-rand | wit vlak op `ink-100` + 3,70:1-rand | `ink-900`-vlak op `ink-950` + 3,66:1-rand | vlak + 3,85:1-rand |

**In woorden.** Nu is het dashboard één donker vlak waarin de kaarten nauwelijks
loskomen: het verschil tussen kaart en pagina is 1,08:1, dus de kaart bestaat
eigenlijk alleen door zijn rand, en die rand haalt 1,28:1. In A worden de
quizkaarten witte objecten op een grijzig vlak en wordt de lijst meteen
scanbaar. In B verandert de opbouw niet, maar wordt het geheel warmer en verliest
het de blauwzweem; de winst zit er vooral in dat de kapotte badge, de te lichte
hover en de onzichtbare veldranden gerepareerd worden. In C hangt het beeld van
het apparaat af, met dezelfde reparaties in beide standen.

### 5.2 Vrageneditor (`src/app/quiz/[id]/edit`, `src/components/editor/`)

| Element | Nu | A "Daglicht" | B "Haard" | C, lichte stand |
| --- | --- | --- | --- | --- |
| Tabbalk-onderrand (`EditorClient.tsx` r. 299) | `ink-800` | `ink-300` | `ink-800` warm | `ink-300` |
| Actieve tab | `border-brand-500` + witte tekst | `brand-600` + `ink-950` | `brand-400` + `ink-50` | `brand-600` + `ink-950` |
| Inactieve tab | `ink-400`, hover `ink-200` | `ink-600`, hover `ink-900` | `ink-400`, hover `ink-200` | `ink-600`, hover `ink-900` |
| Autosave-status (r. 323) | `ink-500` — **3,42:1 ✗** | `ink-600`, 5,60:1 ✅ | `ink-400`, 6,35:1 ✅ | `ink-600`, 5,94:1 ✅ |
| Vraagnummer in lijst (r. 352) | `ink-500` — **3,15:1 ✗** op kaart | `ink-600`, 5,99:1 ✅ | `ink-400`, 5,85:1 ✅ | `ink-600`, 6,43:1 ✅ |
| Kopje "vraagtype toevoegen" (r. 384) | `ink-500` — **3,42:1 ✗** | `ink-600` ✅ | `ink-400` ✅ | `ink-600` ✅ |
| Hulptekst onder velden (`QuestionEditor.tsx` r. 99, 155, 305, 336) | `ink-500` op `text-xs` — **3,15:1 ✗**, en dit is precies de tekst die uitlegt wát een vraagtype doet | `ink-600`, 5,99:1 ✅ | `ink-400`, 5,85:1 ✅ | `ink-600`, 6,43:1 ✅ |
| `(optional)` achter "Explanation" (r. 165) | `ink-500` ✗ | `ink-600` ✅ | `ink-400` ✅ | `ink-600` ✅ |
| Hover in typekiezer (r. 393) | `hover:bg-ink-800` | `hover:bg-ink-200` | `hover:bg-ink-800` warm | klapt mee |
| Antwoordvelden | `ink-950`-vlak, 1,72:1-rand | wit vlak, 3,70:1-rand | `ink-900`-vlak, 3,66:1-rand | 3,85:1-rand |
| Focusring bij tabben | `brand-400`, 6,52:1 | `brand-600`, 5,87–6,29:1 | `brand-400`, 8,07–8,75:1 | 5,52–5,97:1 |

**In woorden.** De editor is het scherm waar de huidige `ink-500`-keuze het
meeste pijn doet: van de 44 voorkomens zitten de meeste hier, en het gaat
uitsluitend om kleine, uitleggende tekst — hulpteksten onder velden, het
`(optional)`-label, de autosave-melding, de vraagnummers. Dat is precies de
tekst die je nodig hebt wanneer je een vraagtype voor het eerst gebruikt, en
juist die is nu het slechtst leesbaar (3,15–3,42:1). Alle drie de richtingen
tillen die naar 5,6–6,4:1. Verder is de editor een dicht formulier met veel
invoervelden naast elkaar; dat die velden nu alleen aan een 1,72:1-randje te
herkennen zijn is hier hinderlijker dan waar dan ook. A geeft ze een wit vlak,
B en C geven ze een eigen vlaktoon plus een rand die 1.4.11 haalt.

---

## 6. Aanbeveling

**Richting B — "Haard".**

De redenering, kort. Het probleem dat feitelijk is aangetoond is niet dat de
chrome donker is, maar dat er vier concrete dingen niet kloppen: te lichte
hulptekst, een hover die onder AA zakt, invoervelden zonder waarneembare grens,
en vijf brand-tinten die geen CSS opleveren. Geen daarvan vraagt om een lichte
app. B repareert ze alle vier, houdt Quizzly herkenbaar, en haalt tegelijk het
blauw uit de neutralen — de enige puur esthetische klacht die uit §1.1 volgt.
Het is bovendien de goedkoopste ingreep: alleen waarden in `@theme`, plus het
vervangen van `text-ink-500` door `text-ink-400` en `.app-input`'s vlak van
`ink-950` naar `ink-900`. Geen nieuwe laag, geen 166 utilities herschrijven.

Waarom niet A: A is inhoudelijk het sterkst — de scheiding tussen "bouwen" en
"spelen" wordt er fysiek voelbaar door, en dat is voor uitgerekend dit product
een echt argument. Maar het is ook de grootste breuk met hoe Quizzly er nu
uitziet, en dat is een smaakoordeel dat Ollie hoort te maken, niet ik. Als hij
bij het zien van deze twee tabellen denkt "ja, licht", dan is A de betere keuze
en is dit voorstel daar niet minder om.

Waarom niet C: C is het juiste eindpunt maar de verkeerde volgende stap. De 166
`ink`-utilities in `src/` moeten dan eerst naar een semantische laag, en dat is
een refactor die je niet wilt combineren met een smaakwijziging — dan weet je bij
een regressie niet welke van de twee het deed. C wordt goedkoop zodra B (of A)
er ligt, omdat de rolverdeling in §4 dan al uitgeschreven is. Ik zou het als
losse vervolgtaak inplannen, niet als deze.

Los van welke richting gekozen wordt zou ik de vier reparaties uit §1.3
sowieso meenemen; die staan niet ter discussie en zijn met of zonder
herontwerp verdedigbaar.

**Dit document past niets toe.** Het toepassen van de gekozen richting gebeurt in
`quizzly-design-pass-toepassen`, na Ollie's keuze.

---

## Bijlage A — het rekenscript

Hiermee zijn alle verhoudingen in dit document berekend. Uitvoeren met
`node contrast.mjs`; het bevat geen afhankelijkheden.

```js
// WCAG 2.1 relatieve luminantie + contrastverhouding.
const hexToRgb = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const la = lum(a), lb = lum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

// Voorbeeld: de twee zakkers uit §1.3
console.log(ratio("#5d6490", "#0b0c18").toFixed(2)); // 3.42  ink-500 op ink-950
console.log(ratio("#ffffff", "#6366f1").toFixed(2)); // 4.47  wit op brand-500
```

## Bijlage B — hoe de bevindingen uit §1 nagemeten zijn

Zodat een lezer ze niet hoeft te geloven:

- **Geen zwerfneutralen.** `rg -n '\b(gray|slate|zinc|neutral|stone)-[0-9]' src/`
  → nul treffers. Idem voor de utility-vorm
  (`(bg|text|border|ring|from|to|via|outline|divide|placeholder|fill|stroke)-(gray|slate|zinc|neutral|stone)-[0-9]{2,3}`).
- **Welke families er wél zijn.** Dezelfde zoekopdracht met een open
  kleurnaam, geteld: `ink` 166, `red` 42, `brand` 30, `amber` 17, `emerald` 12.
- **`text-ink-500` telling.** `rg -c 'text-ink-500' src/` → 44 voorkomens in
  16 bestanden.
- **Ontbrekende brand-tinten.** Na `npm run build`: de klassen `bg-brand-900`,
  `text-brand-300`, `bg-brand-950`, `text-brand-200` en `border-brand-800`
  komen 0 keer voor in `.next/static/css/*.css`, terwijl `bg-brand-600`,
  `text-brand-400` en `bg-emerald-900` er wél in staan.
