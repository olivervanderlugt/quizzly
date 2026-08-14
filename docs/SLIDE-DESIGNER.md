# Slide-designer — verkenning en gefaseerde roadmap

**Status: verkenning. Er is met dit document niets toegepast.** Geen regel in
`src/`, geen migratie, geen dependency. Het bouwen van een gekozen fase is een
aparte taak (`quizzly-slide-designer-bouwen`), die wacht op een keuze van Ollie.

Dit document beantwoordt één vraag: *wat zou een host per dia moeten kunnen
ontwerpen, en wat kost elk van die dingen in déze codebase?* Elke bewering over
de architectuur is nagemeten in de code van deze branch en heeft een
`bestand:regel` bij zich. Bijlage A staat het commando erbij waarmee het is
nagemeten. Waar ik iets **niet** heb kunnen verifiëren — dat geldt vooral voor
de juridische kant in §5 — staat dat er met zoveel woorden bij, want een
juridische bewering die ik niet gelezen heb is erger dan een open vraag.

Codenamen, veldnamen en codecommentaar blijven Engels, zoals overal in de repo.
De toelichting is Nederlands, net als `docs/DESIGN.md`.

---

## 1. Drie aannames die niet klopten

De opdracht voor dit onderzoek bevatte drie aannames over de architectuur. Ik
heb ze alle drie gecontroleerd voordat ik iets anders deed, omdat ze de aard van
het werk bepalen. Eén klopt half, twee kloppen niet — en dat maakt het werk
zowel kleiner als op één punt gevaarlijker dan gedacht.

### 1.1 "Theming is één `Theme` per `Quiz`, dus per-slide design bestaat nog niet"

**Half waar.** De `Theme` is inderdaad één per quiz: `theme Json` staat op de
`Quiz`-rij (`prisma/schema.prisma:98`), gevalideerd door `themeSchema`
(`src/lib/theme.ts:108`), en er is geen `theme`-veld op `Question`.

Maar er ís al een per-vraag opmaaklaag, en die heet alleen anders. `Question`
heeft een eigen JSON-kolom `presentation` (`prisma/schema.prisma:154`),
gevalideerd door `presentationSchema` (`src/lib/theme.ts:441`), met vandaag vier
velden:

| Veld | Regel | Wat het doet |
| --- | --- | --- |
| `layout` | `theme.ts:442` | Eén van zes composities, zie `LAYOUTS` (`theme.ts:412`) |
| `media` | `theme.ts:451` | Een afbeelding: geplakte URL of eigen upload |
| `mediaAlt` | `theme.ts:453` | Alt-tekst, verplicht zodra `media` gezet is |
| `accentOverride` | `theme.ts:455` | Overschrijft de theme-accentkleur voor déze vraag |
| `hideTimer` | `theme.ts:457` | Verbergt de aftelbalk |

`accentOverride` is het bewijs dat het principe al bestaat: een vraag mag
vandaag al afwijken van het quiz-thema. Een per-dia achtergrond is dus **geen
nieuw concept**, maar een vijfde veld in een schema dat er precies voor gemaakt
is. Dat verandert de kostenraming aanzienlijk: geen nieuwe kolom, geen nieuwe
migratie, geen nieuw begrip in de UI.

De achtergrondtaal zelf bestaat ook al. `backgroundSchema`
(`src/lib/theme.ts:25`) kent zes soorten — `solid`, `gradient`, `mesh`, `grid`,
`dots`, `rays` — en `backgroundCss()` (`theme.ts:326`) vertaalt ze naar CSS.
Vandaag wordt dat resultaat één keer per spel gebruikt, in `themeToCssVars()`
(`theme.ts:379`), dat er `--q-bg` en `--q-bg-size` van maakt.

### 1.2 "`toPublicPayload()` is de enige weg naar de speler, dus nieuwe mediavelden moeten daar doorheen"

**Dit klopt niet, en het is de belangrijkste correctie in dit document.**

`toPublicPayload()` (`src/lib/question-schema.ts:447`) filtert uitsluitend
`Question.payload` — de antwoordopties en de goede antwoorden. Het raakt
`presentation` niet aan en weet niet dat het bestaat; het retourneert een
`PublicPayload` (`question-schema.ts:409`), een union die alleen
antwoordvelden kent.

`presentation` gaat langs een heel andere route naar de speler, en die route
filtert niets:

```ts
// server/realtime/engine.ts:336-354
const base = {
  index: this.currentIndex,
  ...
  payload: toPublicPayload(question.payload, { ... }),   // regel 341: gefilterd
  presentation: question.presentation,                    // regel 345: ONGEFILTERD
  ...
};
this.emitter.toAll("question:show", base);                // regel 354: naar iedereen
```

`presentation` wordt **letterlijk, als geheel object, naar elke speler in de
kamer gestuurd**. De wire-contract bevestigt dat: `PlayerQuestionView` heeft
`presentation: Presentation` (`src/types/realtime.ts:42`) — het volledige type,
niet een uitgeklede variant zoals `PublicPayload`.

Dat draait het risico precies om ten opzichte van wat de opdracht veronderstelde:

- **Niet** "je vergeet het door `toPublicPayload` te halen en er komt niets aan".
- **Wél** "alles wat je in `presentation` zet staat automatisch op de telefoon
  van elke speler". Er is geen filterstap die je kunt vergeten, omdat er geen
  filterstap ís.

Voor achtergronden en emoji is dat precies wat je wilt. Voor álles wat een auteur
zelf invult is het een ontwerpregel die je expliciet moet opschrijven: **zet
nooit iets in `presentation` wat de speler niet mag zien.** Een notitieveld voor
de host, een GIPHY-zoekterm, een interne asset-id, een soundboard-cue die de
host geheim wil houden — dat hoort in een apart veld dat de host-route neemt
(`toHost`, `engine.ts:355`), niet in `presentation`.

Er is één plek waar `presentation` wél gefilterd wordt, maar niet op inhoud:
`presentationSchema.parse()` in `parseSnapshot` (`server/realtime/gameServer.ts:149`).
Zod strípt onbekende sleutels. Zie §1.3, want dat is een val op zich.

### 1.3 "Elke per-slide-wijziging moet door de snapshot-copy heen"

**Dit klopt, en er zit een scherpe rand aan die de opdracht niet noemde.**

De keten is:

1. Bij het starten van een spel wordt de quiz bevroren in
   `src/app/actions/quiz.ts:609-634`. Elke vraag wordt gekopieerd inclusief
   `presentation: q.presentation` (regel 614) — de ruwe JSON, ongeparsed.
2. Dat gaat als `quizSnapshot` de `Game`-rij in (`quiz.ts:647`,
   `prisma/schema.prisma:216`).
3. De realtime-server leest uitsluitend die snapshot, nooit de live quiz —
   `loadRoom()` selecteert alleen `quizSnapshot` (`server/realtime/gameServer.ts:84`).
4. `parseSnapshot()` haalt elke vraag door `presentationSchema.parse()`
   (`gameServer.ts:149`).

Stap 4 is de val. Ik heb drie gedragingen van die `parse()` nagemeten (Bijlage A):

| Scenario | Uitkomst | Gevolg |
| --- | --- | --- |
| Nieuw veld in de snapshot, níét in het schema | Sleutel wordt **stilzwijgend weggegooid** | Auteur ziet het in de editor, speler ziet het nooit |
| Oude snapshot, nieuw veld is `.optional()` of `.default()` | Parst prima | Veilig |
| Oude snapshot, nieuw veld is **verplicht** | **Gooit een `Required`-fout** | Zie hieronder |

Dat laatste geval is niet theoretisch. `parseSnapshot()` vangt de fout en
retourneert `null` (`gameServer.ts:156-158`). `loadRoom()` geeft dan `null`
terug, en alle drie de aanroepers vertalen dat naar een eindstation:

- de host krijgt `"Game not found."` (`gameServer.ts:255`);
- elke speler die probeert te joinen krijgt `"That game has finished."`
  (`gameServer.ts:331`);
- elke speler die probeert te herverbinden krijgt hetzelfde (`gameServer.ts:363`).

Met andere woorden: **een verplicht nieuw veld in `presentationSchema` maakt elk
op dat moment lopend spel onbereikbaar**, met een foutmelding die liegt over de
oorzaak. Deploy je midden op een schooldag, dan is dat een klaslokaal dat
halverwege een quiz stilvalt.

De regel die daaruit volgt, en die in elke fase hieronder terugkomt:

> **Elk nieuw veld in `presentationSchema` is `.optional()` of heeft een
> `.default()`. Zonder uitzondering.** Dat is niet netjesheid, het is wat een
> deploy tijdens een lopend spel overleefbaar maakt.

Het "editen tijdens een lopend spel raakt het spel niet"-contract blijft
overigens gewoon overeind bij álle voorstellen in dit document, en wel gratis:
de snapshot is een diepe kopie van de JSON, dus een auteur die tijdens het spel
de achtergrond van vraag 4 verandert, verandert de snapshot niet. Er is niets
extra's voor nodig — alleen: niets in dit document mag ooit tijdens een spel de
live `Question`-rij lezen.

### 1.4 De vijf plekken waar een nieuw `presentation`-veld doorheen moet

Volledigheidshalve, want dit is de checklist voor elke fase hieronder. Een veld
dat één van deze mist, werkt half:

| # | Plek | Bestand:regel | Wat er gebeurt als je het vergeet |
| --- | --- | --- | --- |
| 1 | Schema | `src/lib/theme.ts:441` | Overal weggestript; niets werkt |
| 2 | Editor-UI | `src/components/editor/QuestionEditor.tsx:720-840` | Niet in te stellen |
| 3 | Opslaan | `src/app/actions/quiz.ts:425-437` | Parst via het schema; werkt automatisch mee |
| 4 | Renderen | `src/components/play/QuestionFrame.tsx:23` | Speler ziet het niet |
| 5 | Hostscherm | `src/components/host/HostClient.tsx:366-372` | Grootbeeld wijkt af van de telefoons |

Twee paden werken automatisch mee zodra #1 klopt, wat het goedkoper maakt dan
het lijkt: export/import (`src/lib/quiz-transfer.ts:35` gebruikt hetzelfde
`presentationSchema.optional()`) en groepsquizzen
(`src/lib/collab.ts:287-295` idem).

### 1.5 Van audio bestaat vandaag exact niets

Een zoekopdracht over `src/`, `server/` en `docs/` naar `sound`, `music` en
`audio` — hoofdletterongevoelig — levert **nul treffers** (Bijlage A). Het
commentaar op `prisma/schema.prisma:100` noemt "music" als onderdeel van
`settings`, maar `quizSettingsSchema` (`src/lib/scoring.ts:46-62`) heeft acht
velden en geen daarvan gaat over geluid. Dat commentaar is een overblijfsel.

Er is dus geen `<audio>`-element, geen volumeknop, geen "geluid aan/uit" in de
instellingen, en geen enkel besluit over autoplay of over spelers met
koptelefoons. Alles in §4 wat over geluid gaat begint bij nul — dat is de
grootste enkele reden dat de audio-items in de roadmap achteraan staan.

### 1.6 De CSP is een harde grens, en hij zit al goed voor plaatjes

De Content-Security-Policy wordt per request gezet in `src/middleware.ts:34-53`.
Vier regels bepalen wat een slide-designer met externe media kan:

| Directive | Regel | Gevolg voor dit document |
| --- | --- | --- |
| `img-src 'self' blob: data: https:` | `middleware.ts:41` | Een GIF van GIPHY **laadt gewoon**. Geen CSP-wijziging nodig |
| `media-src 'self' https:` | `middleware.ts:45` | Externe audio **laadt gewoon**. Idem |
| `connect-src 'self' wss:` | `middleware.ts:44` | Een `fetch()` naar `api.giphy.com` **wordt geblokkeerd** |
| `style-src 'self' 'unsafe-inline'` | `middleware.ts:38` | Inline `style`-attributen mogen; zo komen de `--q-*` variabelen binnen |

De derde is de belangrijkste ontwerpconsequentie in het hele document: **een
GIF-zoekfunctie kán niet vanuit de browser met GIPHY praten.** Elke zoekopdracht
moet via een eigen route op onze origin (`/api/giphy/search`) die de aanroep
server-side doet. Dat is geen tegenslag — het is precies wat je toch al wilt,
want alleen zo blijft de API-sleutel geheim, is er één plek om het contentfilter
af te dwingen (§5.1) en één plek om rate-limits te bewaken. Maar het betekent
wel dat "even een GIPHY-picker inbouwen" een server-route is, geen frontend-klus.

Voor het uploaden van eigen media bestaat de infrastructuur al
(`src/app/api/media/route.ts`), maar met twee grenzen die er direct toe doen:
`ACCEPTED_UPLOAD_TYPES` is `jpeg`/`png`/`webp` (`src/lib/media/ref.ts:55`) — GIF
staat er bewust níét op, want de pijplijn hercodeert naar een stilstaand beeld
en zou de animatie stil weggooien (`ref.ts:50-51`) — en `MEDIA_KEY_PATTERN`
accepteert alleen `[0-9a-f]{32}.webp` (`ref.ts:24`), wat volgens `CLAUDE.md` de
hele traversal-verdediging is. **Animatie en audio passen geen van beide door
die pijplijn heen zonder er een tweede, apart gevalideerd type naast te zetten.**

---

## 2. De mogelijkhedenruimte

Negen dingen die een host per dia zou kunnen willen. Ze zijn hier los van elkaar
beschreven; §3 en §4 zeggen wat elk kost.

1. **Per-dia achtergrond** — deze vraag heeft een andere achtergrond dan de rest
   van de quiz. De ronde "aardrijkskunde" krijgt een kaartachtige achtergrond,
   de bonusvraag wordt goud.
2. **Emoji** — een emoji als accent bij de vraag: 🎬 boven een filmronde, 🔥 bij
   de tiebreak. Vandaag kan een auteur emoji al gewoon in de vraagtekst typen;
   dit gaat over een emoji als *element*, met een eigen plek en formaat.
3. **Stickers** — een kleine, herbruikbare grafische marker op de dia. In de
   praktijk: ofwel een emoji op een vrij te kiezen positie, ofwel een plaatje uit
   een vaste set.
4. **GIF's** — een bewegend beeld bij de vraag, gezocht in een externe
   bibliotheek (GIPHY, Tenor) of geüpload.
5. **Geluid per vraag** — een kort geluidje bij het tonen van de vraag, bij de
   reveal, of muziek die tijdens het aftellen speelt.
6. **Transitions tussen vragen** — hoe de ene dia in de andere overgaat: fade,
   slide, "flip". Vandaag is er één vaste animatie (`animate-pop-in`,
   `QuestionFrame.tsx:61`) en een globale aan/uit via `theme.animations`
   (`theme.ts:128`), die als `--q-motion` naar buiten komt (`theme.ts:401`).
7. **Soundboard voor de host** — knoppen op het hostscherm om tijdens het spel
   handmatig een geluid af te spelen: tromgeroffel, applaus, een sadtrombone.
   Los van de vraag, bediend door een mens.
8. **Interactieve live slide-preview** — terwijl de host bouwt, ziet hij rechts
   de dia zoals de speler hem straks krijgt, direct meebewegend.
9. **Per-dia typografie en tempo** — dezelfde gedachte als 1, maar voor het
   lettertype (`FONT_PAIRS`, `theme.ts:56`) en de antwoordvorm (`ANSWER_SHAPES`,
   `theme.ts:97`). Genoemd voor de volledigheid; zie §3 waarom ik hier tegen ben.

---

## 3. Technische haalbaarheid per item

Samenvattend, daarna per item de onderbouwing.

| # | Item | Schema | Extern | Nieuw juridisch oppervlak | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | Per-dia achtergrond | 1 optioneel veld | nee | nee | **Klein** |
| 2 | Emoji | 1 optioneel veld | nee | nee | **Klein** |
| 8 | Live preview | geen | nee | nee | **Klein** |
| 6 | Transitions | 1 optioneel veld | nee | nee | **Middel** |
| 3 | Stickers | 1 optioneel array | nee/ja | alleen bij eigen set | **Middel** |
| 4 | GIF's | 1 optioneel veld + route | **ja** | **ja** (§5.1) | **Groot** |
| 5 | Geluid per vraag | 1 optioneel veld + pijplijn | ja | **ja** (§5.3) | **Groot** |
| 7 | Soundboard | quiz- of gebruikersniveau | ja | **ja** (§5.3) | **Groot** |
| 9 | Per-dia typografie | 2 optionele velden | nee | nee | **Klein, maar afgeraden** |

### 3.1 Per-dia achtergrond — klein

Alles wat nodig is bestaat al. `backgroundSchema` (`theme.ts:25`) definieert de
zes soorten, `backgroundCss()` (`theme.ts:326`) rendert ze. Het enige nieuwe:

```ts
// in presentationSchema, src/lib/theme.ts:441
background: backgroundSchema.optional(),   // optioneel — zie §1.3
```

En in de renderroute één regel die, als het veld gezet is, `--q-bg` en
`--q-bg-size` op de vraagcontainer overschrijft. Dat werkt zonder aanpassing aan
`themeToCssVars()`, omdat CSS custom properties overerven: een `style` op een
kind-element wint van dezelfde variabele op de ouder. De quiz-surface krijgt zijn
variabelen vandaag op één plek (`PlayClient.tsx:217`, `HostClient.tsx:147`); een
per-vraag override is een tweede, dieper `style`-object.

Dat past ook binnen de CSP: `style-src` staat `'unsafe-inline'` toe
(`middleware.ts:38`), en het commentaar erboven zegt waarom dat verdedigbaar is —
elke waarde die daar terechtkomt is een hex-kleur, gevalideerd door
`hexColor` (`theme.ts:19`). Een per-dia achtergrond erft die eigenschap
ongewijzigd, want hij gebruikt hetzelfde `backgroundSchema`.

**Risico:** een auteur kiest een achtergrond die de leesbaarheid van de
antwoordtegels sloopt, want die houden hun kleuren uit `theme.palette.answers`.
`docs/DESIGN.md` §1.3 laat zien dat contrast in deze codebase een reëel en
meetbaar probleem is. Voor fase 1 los ik dat op door **geen vrije kleurkiezer te
geven maar een vast palet** van vooraf gecontroleerde achtergronden (§6).

### 3.2 Emoji — klein

Emoji zijn tekst. Ze reizen vandaag al probleemloos: `prompt` is een gewone
`String` (`prisma/schema.prisma:146`), Postgres slaat UTF-8 op, en er zit nergens
in de schrijfroute een sanitizer die niet-ASCII wegpoetst — `quiz.ts:397-437`
valideert lengte en vorm, niet tekens. De codebase gebruikt zelf al non-ASCII
symbolen in de UI (`TILE_SHAPES` in `AnswerInput.tsx:34`, de `icon`-velden in
`QUESTION_TYPES`, `question-schema.ts:567` e.v.).

Emoji als *element* is dus één optioneel stringveld met een strakke maximum­lengte,
plus een kiezer in de editor. **Geen dependency nodig**: de kiezer kan een vast
raster van 60–100 emoji zijn, uitgeschreven in een constante naast `LAYOUTS`.
Dat is dezelfde ontwerpkeuze die `FONT_PAIRS` al maakt — een vaste lijst in
plaats van vrije invoer — en `theme.ts:49-55` legt uit waarom: het houdt de CSP
strak en voorkomt dat een auteur iets onleesbaars kiest.

**Let op één ding:** als het emoji-veld vrije tekst is, kan een auteur er
willekeurige tekst in zetten die dan via `presentation` (§1.2) op elk
spelersscherm belandt. Een `z.string().max(8)` is geen contentfilter. Voor een
vaste kiezer is dat een non-issue; voor een vrij invoerveld hoort er een
`.refine()` bij die controleert dat de inhoud daadwerkelijk uit emoji-codepoints
bestaat.

### 3.3 Live preview — klein, en verrassend goedkoop

Dit is het item waar het verschil tussen "voelt groot" en "is groot" het grootst
is. Twee helften bestaan al en hoeven alleen aan elkaar geknoopt te worden.

**Helft één: er is al een live preview in de editor.** `ThemeEditor.tsx:227-261`
rendert een `quiz-surface` met `themeToCssVars(theme)` erop, die direct meebeweegt
met de themekeuze. Maar het is een **hardgecodeerde nepvraag**: "Which planet is
closest to the Sun?" met Mercury/Venus/Mars/Neptune. Hij toont het thema, niet de
dia die je aan het bouwen bent, en hij staat op het theme-tabblad, niet bij de
vraag.

**Helft twee: `QuestionFrame` is al aantoonbaar buiten het spel te renderen.**
Het component neemt precies twee props — `view: PlayerQuestionView` en
`children` (`QuestionFrame.tsx:16-22`) — en heeft geen socket, geen fetch en geen
context. Dat is geen inschatting: `src/components/play/QuestionFrame.test.tsx:17-42`
bouwt een `PlayerQuestionView` met de hand en gooit hem door
`renderToStaticMarkup()`. Die test staat in de zeven tests die vandaag groen zijn.

Een echte preview is dus: bouw in de editor een `PlayerQuestionView` uit de vraag
waar je in staat, en render `<QuestionFrame view={fake}><AnswerInput …/></QuestionFrame>`
in een `quiz-surface`-div met `themeToCssVars(theme)`. `AnswerInput` neemt ook
alleen data en callbacks (`AnswerInput.tsx:19-25`), dus de preview kan zelfs
*klikbaar* zijn zonder dat er iets verzonden wordt.

Twee dingen om op te lossen, allebei klein:

- De editor heeft de volledige `QuestionPayload`, de preview wil een
  `PublicPayload`. Dat is precies wat `toPublicPayload()` doet, en dat is
  client-veilig: `question-schema.ts` importeert alleen `zod`, geen
  `server-only` (nagemeten, Bijlage A). Bijkomend voordeel: de auteur ziet
  meteen dat de opties geschud worden.
- `TimerBar` wil `endsAt` en `serverNow` (`QuestionFrame.tsx:55`). In een preview
  geef je `serverNow = Date.now()` en `endsAt = Date.now() + timeLimitSec*1000`,
  of je zet `hideTimer` in het preview-object.

**Dit item is de grootste winst per geïnvesteerd uur in het hele document**, en
het is het enige dat élk ander item hieronder goedkoper maakt: een achtergrond
kiezen zonder te zien wat je kiest is raden.

### 3.4 Transitions — middel

Technisch geen probleem: één optioneel enum-veld met een handvol vaste namen, en
een CSS-klasse per naam. `QuestionFrame.tsx:61` heeft al `animate-pop-in`, dus
het patroon staat er.

Wat het naar "middel" tilt, is niet de code maar de zorgvuldigheid:

- **`--q-motion` moet gerespecteerd worden.** `theme.animations`
  (`theme.ts:128`) komt als `--q-motion` naar buiten (`theme.ts:401`), en het
  commentaar op regel 127 zegt: *"Respect the OS reduce motion setting on top of
  this."* Een transition die daar niet naar luistert, breekt een belofte die het
  themasysteem al doet.
- **Bewegende overgangen op een projector met 30 leerlingen ervoor zijn een
  toegankelijkheidsvraag,** geen smaakvraag. `prefers-reduced-motion` is het
  minimum.
- **Timing zit vast aan de statemachine.** De overgang tussen twee vragen loopt
  via `question:show` (`engine.ts:354`) en de countdown uit
  `settings.countdownSeconds` (`scoring.ts:61`). Een transition van 800ms bovenop
  een countdown van 3s betekent dat de speler de vraag 800ms later ziet dan de
  server denkt — en de klok is server-authoritatief (`CLAUDE.md`). Speler en
  server moeten het dus eens blijven over wanneer de tijd loopt, anders verliest
  iedereen systematisch snelheidspunten aan de animatie.

Dat laatste punt is de reden dat dit item niet in fase 1 hoort: het raakt aan de
scoring, en scoring is het enige in deze codebase waar een subtiele fout pas
zichtbaar wordt als iemand zich benadeeld voelt.

### 3.5 Stickers — middel

Er zijn twee heel verschillende invullingen, met heel verschillende kosten:

- **Sticker = emoji op een positie.** Dan is het item 2 plus twee getallen (x, y
  in procenten) en een schaal, en valt het samen met §3.2. Klein.
- **Sticker = plaatje uit een set die wij leveren.** Dan hebben we een set nodig
  die we mogen distribueren, en dat is een licentievraag (§5.4), plus assets die
  mee moeten in het Docker-image.

De tweede variant heeft ook een architectuurgevolg: een sticker als
`/api/media/...`-verwijzing kan niet, want `MEDIA_KEY_PATTERN` (`ref.ts:24`)
accepteert alleen geüploade sleutels. Een meegeleverde set is een pad onder
`/public`, en dat is een derde soort media-verwijzing naast de twee die
`mediaReferenceSchema` (`ref.ts:93`) nu kent. Dat schema is bewust smal —
het commentaar erboven zegt dat het "exactly the shape `mediaPathForKey`
produces and nothing else" accepteert, "so loosening this field has not turned it
into 'any string'". Er een derde alternatief in wrikken moet met dezelfde
strakheid gebeuren, niet met een `startsWith("/")`.

### 3.6 GIF's — groot

Het rendert vanzelf. `img-src ... https:` (`middleware.ts:41`) laat een
`giphy.com`-URL gewoon door, en `mediaReferenceSchema` (`ref.ts:93`) accepteert
elke absolute URL — een auteur kán vandáág al een GIF-URL in het media-veld
plakken en die werkt. Dat is het einde van het goede nieuws.

Wat er níét vanzelf gaat:

1. **Zoeken kan niet vanuit de browser.** `connect-src 'self' wss:`
   (`middleware.ts:44`) blokkeert `fetch("https://api.giphy.com/...")`. Er moet
   een server-route komen. Zie §1.6.
2. **Cachen mag waarschijnlijk niet.** Zie §5.1 — en dat botst frontaal met de
   bestaande media-architectuur, die alles juist wél lokaal opslaat en
   hercodeert.
3. **De upload-pijplijn is geen alternatief.** GIF staat bewust niet in
   `ACCEPTED_UPLOAD_TYPES` (`ref.ts:55`), omdat `processImageUpload()` naar een
   stilstaande WebP hercodeert. "Dan zetten we GIF erbij" is precies de wijziging
   die `CLAUDE.md` verbiedt ("do not add a 'just store the original' fast path"),
   want de hercodering *is* hoe EXIF gestript wordt.
4. **Een contentfilter is verplicht.** Zie §5.1. Dit is het item waar Quizzly's
   minderjarige gebruikers het meest direct geraakt worden.

**Verdict: buiten scope tot Ollie een provider en een risiconiveau kiest.**

### 3.7 Geluid per vraag — groot

Afspelen kan technisch: `media-src 'self' https:` (`middleware.ts:45`) staat het
al toe. Daarna houdt het op, want zoals §1.5 vaststelt bestaat er verder niets.

Wat er ontbreekt, in volgorde van hoe vervelend het is:

- **Wie hoort het?** Alle spelers op hun eigen telefoon (dertig telefoons die
  net niet synchroon een applausje spelen — een ramp), of alleen het hostscherm
  dat op de beamer staat? Ik zie maar één verdedigbaar antwoord: **alleen de
  host**. Dat is ook goedkoper: het geluid hoeft dan niet door `presentation`
  (§1.2) en hoeft dus nooit naar de spelers.
- **Autoplay-beleid.** Browsers blokkeren geluid zonder gebruikersinteractie. Het
  hostscherm heeft die interactie (de host klikt "start"), een spelerstelefoon
  niet noodzakelijk. Nog een reden voor "alleen de host".
- **Opslag.** Zie punt 3 in §3.6: de media-pijplijn is voor stilstaande beelden
  gebouwd, van magic-byte-sniffing tot `MEDIA_KEY_PATTERN` (`ref.ts:24`). Audio
  vraagt een tweede pijplijn met eigen typecontrole, eigen groottelimiet en een
  eigen sleutelpatroon. Dat is geen uitbreiding van tien regels.
- **Rechten.** §5.3. Dit is de echte blokkade.

### 3.8 Soundboard voor de host — groot

Zelfde afhankelijkheden als §3.7, met één architectonisch voordeel en één
architectonisch nadeel.

**Voordeel:** een soundboard hoort bij de *host*, niet bij de vraag. Het hoeft
dus helemaal niet in `presentation` en dus niet in de snapshot en dus niet door
§1.3 heen. Het kan een lijst op de gebruiker of op de quiz zijn, of zelfs
puur client-side op het hostscherm.

**Nadeel:** dit is het item waar "geen simpele upload van willekeurige mp3's"
het hardst geldt, want een soundboard nodigt letterlijk uit tot het uploaden van
herkenbare fragmenten. Zie §5.3.

Als er ooit één audio-item gebouwd wordt, is dit de goedkoopste — mits met een
**meegeleverde, gelicentieerde set** en zonder upload. Een soundboard van acht
knoppen met acht geluiden die wij mogen distribueren is een halve dag werk. Een
soundboard waar de host eigen bestanden in zet, is een licentie-, opslag- en
moderatieproject.

### 3.9 Per-dia typografie — klein, maar afgeraden

Technisch identiek aan §3.1: twee optionele velden die `FONT_PAIRS`- en
`ANSWER_SHAPES`-sleutels overschrijven. Ik raad het af, om één reden die niet
technisch is: een quiz waarin elk scherm een ander lettertype en een andere
knopvorm heeft, ziet er niet ontworpen uit maar kapot. `theme.ts:49-55` legt uit
dat de fontlijst bewust vast is zodat auteurs geen onleesbare combinaties kiezen;
dat argument wordt sterker, niet zwakker, als je het per dia laat wisselen.

Achtergrond en accent per dia werken juist wél, omdat ze *rondes* markeren.
Lettertype per dia markeert niets.

---

## 4. Wat dit betekent voor de bestaande invarianten

Vier van de invarianten in `CLAUDE.md` raken aan dit document. Hier staat wat er
per invariant moet gebeuren, zodat de bouwtaak dit niet opnieuw hoeft uit te
zoeken.

| Invariant | Raakvlak | Wat de bouwtaak moet doen |
| --- | --- | --- |
| "Players never receive correct answers" | Geen — `presentation` bevat geen antwoorden en mag dat nooit gaan bevatten | Bewaken bij review: geen antwoordinformatie in een designveld |
| "Live games run from `Game.quizSnapshot`" | Direct, §1.3 | Elk nieuw veld optioneel/default; test met een oude snapshot |
| "Uploaded images are re-encoded, never passed through" | Direct, §3.6 en §3.7 | GIF/audio krijgen een eigen pijplijn, niet een uitzondering in de bestaande |
| "Two colour systems" (`--q-*`) | Direct, §3.1 | Per-dia override schrijft `--q-*` op een dieper element; nooit app-chrome-tokens |

Daarnaast één nieuwe regel die uit §1.2 volgt en die nergens staat, omdat het
tot nu toe niet uitmaakte:

> **`presentation` is publiek.** Het gaat ongefilterd naar elke speler
> (`engine.ts:345`). Alles wat de speler niet hoort te zien, hoort in een veld
> dat de host-route neemt (`engine.ts:355`), niet hier.

Dat hoort in `CLAUDE.md` zodra de eerste fase gebouwd wordt.

---

## 5. Licentie- en privacyhaken

`docs/LEGAL.md` noemt vandaag **geen enkel stuk media van derden**. Ik heb het
document doorgenomen: §1 gaat over dataminimalisatie, §2 over GDPR-verplichtingen
voor accounthouders, §3 over kinderen, §4 over het Kahoot!-octrooirisico, §5 over
AI-gegenereerde inhoud, §6 is de checklist. Er staat niets over afbeeldingen,
GIF's, muziek of enige externe media-provider.

Dat betekent dat alles hieronder een **nieuw juridisch oppervlak** is, geen
uitbreiding van een bestaand punt. Concreet: als er een media-fase gebouwd wordt,
komt er een **§7 "Third-party media"** in `LEGAL.md` bij, plus minstens twee
regels in de checklist van §6.

### 5.1 GIPHY — wat ik heb kunnen lezen, en wat niet

**Wat ik direct uit GIPHY's eigen ontwikkelaarsdocumentatie heb gelezen**
(`developers.giphy.com`, opgehaald op 2026-08-14):

| Punt | Wat er staat | Gevolg voor Quizzly |
| --- | --- | --- |
| Attributie | *"all apps that use the GIPHY API to conspicuously display 'Powered By GIPHY' attribution marks where the API is utilized"* | Het GIPHY-logo moet **zichtbaar** in de picker. Niet in een colofon |
| Rate limit | *"All API Keys start as beta keys, which are rate limited (100 searches/API calls per hour.)"* | 100 zoekopdrachten per uur voor de **hele installatie**. Eén klas die tegelijk quizzen bouwt tikt dat aan |
| Productiesleutel | Aanvragen via het dashboard; bij goedkeuring neemt GIPHY contact op *"to discuss pricing"* | Er is dus een **prijskaartje**, en de hoogte is niet publiek. Dit is een van de budgetvragen voor Ollie |
| Contentfilter | De `rating`-parameter accepteert `g, pg, pg-13, r`, en: *"If you do not specify a rating, you will receive results from all possible ratings."* | **Zonder expliciete parameter is het filter uit.** Voor een product dat door minderjarigen gebruikt wordt is dit het enige punt in dit document dat ik als niet-onderhandelbaar zou markeren |
| `random_id` | Er is een endpoint dat een identifier levert *"for users without personal information"*, bedoeld als `customer_id` | Relevant voor de belofte in `LEGAL.md` §1. Als er ooit een id meegestuurd wordt, moet het déze zijn en nooit een `Player.id` of `User.id` |

Het contentfilter verdient uitspellen, want het is een stille faalmodus.
`rating` is een *optionele* parameter die *defaultet naar ongefilterd*. Een
implementatie die hem vergeet werkt perfect in de test — er komen GIF's terug,
de picker ziet er goed uit — en levert een klaslokaal ongefilterde GIPHY-resultaten.
Als dit gebouwd wordt, hoort `rating: "g"` **server-side** afgedwongen te worden
in de route uit §1.6, waar de client er niet bij kan, en hoort er een test te
staan die faalt als de parameter uit de aanroep verdwijnt.

Merk ook op dat een rating-filter een filter is en geen garantie. GIPHY's `g`
betekent "door GIPHY als g gemarkeerd", niet "geschikt voor deze klas". Een
tweede laag — de host ziet wat gekozen is voordat spelers het zien, wat door de
live preview (§3.3) vanzelf gebeurt — is geen luxe.

**Wat ik NIET heb kunnen lezen, en wat dus gecontroleerd moet worden.**
`support.giphy.com` gaf op elke poging HTTP 403 (Bijlage A). De feitelijke
*GIPHY API Terms of Service* heb ik dus **niet** gelezen. Ik heb er via
zoekresultaten fragmenten van gezien, maar tweedehands tekst is geen bron voor
een juridische beslissing, en ik neem hem hier niet over als vaststaand.

Wat er specifiek in die ToS gecontroleerd moet worden voordat er ook maar één
regel GIPHY-code geschreven wordt:

1. **De cache-clausule.** Zoekresultaten suggereren een verbod op het cachen of
   kopiëren van GIPHY-assets zonder expliciete goedkeuring, plus een verbod op
   het opbouwen van een eigen index van GIF's. **Als dat klopt, botst het
   frontaal met de bestaande architectuur**, die uploads juist wél opslaat en
   hercodeert (`src/lib/media/image.ts`, `src/lib/media/storage.ts`). Het zou
   betekenen: altijd hotlinken naar GIPHY's CDN, nooit onze eigen `/api/media/`
   gebruiken — met als prijs dat een quiz stukgaat als GIPHY de GIF verwijdert.
   Dit is de eerste vraag die beantwoord moet worden, want hij bepaalt het hele
   ontwerp. **Verifieer dit in de ToS zelf, niet in dit document.**
2. **Of het gebruik in een dienst die minderjarigen bereikt toegestaan is,** en
   onder welke voorwaarden. Ik heb hier geen clausule over gevonden en durf niet
   te zeggen dat die er niet is.
3. **Wat "conspicuously" precies vereist** — logo, formaat, plaatsing. GIPHY
   levert officiële logo-bestanden; die moeten dan mee in de repo, met hun eigen
   gebruiksvoorwaarden.
4. **Of er beperkingen op commercieel gebruik zijn** die anders liggen zodra
   Quizzly geld vraagt. Dit hangt samen met de "discuss pricing"-stap hierboven.
5. **De opzeg- en wijzigingsclausule.** Een gratis API-afhankelijkheid die
   eenzijdig opgezegd kan worden, is een quiz die op een dag lege vlakken toont.

Bronnen die ik wél direct heb kunnen lezen:
<https://developers.giphy.com/docs/api/> en
<https://developers.giphy.com/docs/api/endpoint/>. De ToS zelf staat op
<https://support.giphy.com/hc/en-us/articles/360028134111-GIPHY-API-Terms-of-Service>
en is vanaf hier niet op te halen.

### 5.2 Alternatieven voor GIPHY

Genoemd zodat de keuze in §6 een keuze is en geen aanname. Ik heb de voorwaarden
van deze twee **niet** gelezen; ze staan hier als opties om te onderzoeken, niet
als aanbeveling.

- **Tenor** (Google). Eigen API, eigen attributie-eisen, eigen contentfilter.
- **Geen provider.** Auteurs plakken zelf een URL, precies zoals vandaag al kan
  (`mediaReferenceSchema`, `ref.ts:93`). Nul integratiekosten, nul API-kosten,
  nul attributie-eisen — en de verantwoordelijkheid voor rechten ligt bij de
  auteur, wat de aanpak is die `LEGAL.md` §5 al kiest voor AI-bronmateriaal.
  Dit is een reële optie en het is de goedkoopste.

### 5.3 Muziekrechten — waarom "upload je eigen mp3" geen optie is

De structuur van muziekrechten is de reden dat een soundboard geen uploadveld is.
Een opname draagt **twee afzonderlijke rechten**: het *master*- of opnamerecht
(de specifieke opname, bij label/artiest/producer) en het *publishing*- of
compositierecht (melodie, tekst, compositie). Voor het gebruiken van een
bestaande opname heb je in beginsel toestemming voor **beide** nodig; ze worden
door verschillende partijen beheerd.

Vertaald naar de drie mogelijke ontwerpen:

| Ontwerp | Wie draagt het risico | Verdict |
| --- | --- | --- |
| Host uploadt eigen bestanden | Wij hosten en distribueren het. Bij een klacht zijn wij de partij die het serveert | **Niet doen** zonder notice-and-takedown, moderatie en een aanvaardingsbeleid. Dat is geen feature, dat is een afdeling |
| Wij leveren een vaste set mee | Wij, één keer, bewust, met een licentie op papier | **Werkbaar.** Dit is de enige variant die ik zou bouwen |
| Koppeling met Spotify/YouTube | Streamingvoorwaarden verbieden dit type gebruik doorgaans expliciet | **Niet doen** |

Bij de middelste variant nog twee dingen die niet vergeten mogen worden:

- **"Royalty-free" betekent niet rechtenvrij.** Het betekent: één keer betalen
  in plaats van doorlopende royalty's. De licentie heeft nog steeds voorwaarden,
  en die moeten het gebruik dekken dat wij maken — namelijk *distributie als
  onderdeel van software*, wat iets anders is dan gebruik in één video. Lees de
  licentie op dat punt.
- **Een quiz in een klas of een café is een openbare uitvoering.** Dat is
  juridisch iets anders dan de reproductie die wij doen door het bestand te
  serveren. Wie daarvoor moet betalen — wij of de host — is jurisdictie­afhankelijk.
  Het eerlijke antwoord voor de gebruiksvoorwaarden is waarschijnlijk dat de host
  verantwoordelijk is voor wat hij in zijn ruimte afspeelt, maar dat is precies
  het soort zin die door een jurist moet.

Praktische route als er ooit audio komt: een set van 6–10 korte geluiden onder
één heldere licentie (CC0 of een expliciete commerciële royalty-free licentie),
met de licentietekst en de herkomst per bestand in de repo. Geen upload.

### 5.4 Stickers en emoji

- **Emoji zelf zijn geen probleem.** De Unicode-codepoints zijn vrij; het
  *lettertype* dat ze tekent hoort bij het besturingssysteem van de kijker. Zolang
  we geen emoji-lettertype meeleveren (Apple's set is expliciet niet
  herdistribueerbaar) en geen emoji-plaatjes serveren, raken we geen enkele
  licentie. Dit sluit precies aan bij de keuze die `theme.ts:52-55` al maakt:
  alleen fonts gebruiken die al op het apparaat staan, zodat er niets opgehaald
  wordt.
- **Een meegeleverde stickerset is dat wél**, en vraagt dezelfde behandeling als
  de audioset in §5.3: één licentie, op papier, in de repo.

### 5.5 Privacy — wat er níét mag gebeuren

`LEGAL.md` §1 staat of valt met één zin: *"Players are not users. Joining a game
stores a nickname and nothing else."* De tabel eronder noemt "Analytics on the
play pages" expliciet als iets dat die eigenschap breekt.

**Een externe media-provider op de speelpagina is een analytics-achtig risico**,
of we dat nu bedoelen of niet. Een GIF die van GIPHY's CDN geladen wordt op de
telefoon van een dertienjarige speler betekent: het IP-adres en de user-agent van
die telefoon gaan naar een derde partij. Dat is een gegevensdoorgifte die er
vandaag niet is, en het gebeurt op precies de route die `LEGAL.md` als
"strongest position available" beschrijft.

Twee mitigaties, en ze hebben allebei een prijs:

1. **Alleen op het hostscherm.** De GIF speelt op de beamer, niet op de
   telefoons. Eén IP naar de derde partij (dat van de host, een volwassene met
   een account), nul spelers-IP's. Dit is verreweg de schoonste optie, en het is
   dezelfde conclusie als bij audio in §3.7.
2. **Proxyen via onze eigen server.** Nul IP's naar de derde partij, maar dan
   cachen/serveren we het bestand — precies wat de cache-clausule uit §5.1
   mogelijk verbiedt. Deze twee eisen kunnen elkaar uitsluiten. Dat moet uitgezocht
   zijn vóórdat er gebouwd wordt, niet erna.

Wat er hoe dan ook moet gebeuren zodra externe media de speelpagina raken: de
privacyverklaring (`src/app/privacy/page.tsx`) moet de doorgifte noemen, en
`LEGAL.md` §6 krijgt er een vinkje bij.

---

## 6. Gefaseerde roadmap

### Fase 1 — Per-dia sfeer, in één sessie te bouwen

**Scope:** drie dingen, allemaal uit §3 met verdict "klein", geen externe API,
geen upload, geen dependency, geen nieuw juridisch oppervlak.

1. **Een vast palet van per-vraag achtergronden.** Eén optioneel veld
   `background` in `presentationSchema`, gevuld uit een vaste lijst van 8–12
   voorgedefinieerde achtergronden die `backgroundSchema` (`theme.ts:25`)
   hergebruiken. **Geen vrije kleurkiezer** — een vaste lijst, zoals `FONT_PAIRS`
   en `LAYOUTS` dat al doen, zodat elke optie één keer op contrast gecontroleerd
   is en niet duizend keer door de auteur.
2. **Emoji per vraag.** Eén optioneel veld, gevuld uit een vast raster in de
   editor. Geen dependency, geen vrije tekst.
3. **Een echte live preview in de vrageneditor.** `QuestionFrame` +
   `AnswerInput` + `themeToCssVars`, gevoed door een in de editor gebouwde
   `PlayerQuestionView`. Vervangt niet de themepreview in `ThemeEditor.tsx:227`,
   maar staat naast de vraag die je bewerkt.

**Waarom deze drie samen:** 1 en 2 zonder 3 is blind ontwerpen; 3 zonder 1 en 2
is een preview van iets wat niet verandert. Samen vormen ze de kleinste versie
van "slide designer" die het woord verdient.

**Afbakening — expliciet buiten fase 1:** geen GIF's, geen audio, geen
transitions, geen uploads, geen externe API, geen per-dia lettertype, geen vrije
kleurkiezer.

**Wat de bouwtaak moet aantonen voordat hij klaar is:**

- [ ] Beide nieuwe velden zijn `.optional()`. Een test parseert een **oude**
      snapshot (zonder de velden) door `presentationSchema` heen en verwacht
      succes — dat is de test die §1.3 afdekt en die een stilgevallen klaslokaal
      voorkomt.
- [ ] Een test controleert dat een vraag zónder achtergrond exact rendert zoals
      vandaag, zodat bestaande quizzen niet veranderen.
- [ ] Elke achtergrond in het palet haalt minstens 4,5:1 voor de vraagtekst en
      3:1 voor de antwoordtegels, met dezelfde methode als `docs/DESIGN.md` §3.
- [ ] `npm run typecheck && npm test && npm run build` groen (`CLAUDE.md`).
- [ ] De regel uit §4 ("`presentation` is publiek") staat in `CLAUDE.md`.

**Wat er níét in `LEGAL.md` hoeft:** niets. Fase 1 voegt geen derde partij toe,
geen upload, geen doorgifte. Dat is de reden dat het fase 1 is.

### Fase 2 — Beweging en compositie (klein, geen keuze van Ollie nodig)

Stickers als geplaatste emoji (§3.5, eerste variant) en transitions (§3.4). Beide
zonder externe afhankelijkheid. Transitions vereisen wel het huiswerk over
`prefers-reduced-motion` en over de countdown-timing tegenover de
server-authoritatieve klok — dat laatste is de reden dat het niet in fase 1 zit.

### Fase 3 — GIF's ⚠️ **wacht op een keuze van Ollie**

Kan niet ingepland worden voordat drie dingen beslist zijn:

| Vraag | Waarom hij eerst beantwoord moet zijn |
| --- | --- |
| **Welke provider** — GIPHY, Tenor, of geen (auteur plakt zelf een URL)? | Bepaalt of er überhaupt een integratie is |
| **Welk maandbudget?** GIPHY's beta-sleutel is 100 calls/uur voor de hele installatie; erboven is het een prijsgesprek met GIPHY (§5.1) | Bepaalt of het schaalt voorbij één klas |
| **Welk licentierisiconiveau?** De cache-clausule (§5.1, punt 1) bepaalt of we hotlinken (fragiel, maar naleefbaar) of opslaan (robuust, maar mogelijk in strijd met de ToS) | Bepaalt het hele ontwerp |

Onafhankelijk van de keuze, en niet onderhandelbaar: `rating` server-side
afgedwongen (§5.1), en GIF's tonen we op het hostscherm — niet op de telefoons
van spelers, om de reden in §5.5.

### Fase 4 — Audio ⚠️ **wacht op een keuze van Ollie**

Soundboard voor de host eerst (§3.8), geluid per vraag daarna (§3.7) — in die
volgorde, omdat het soundboard buiten `presentation` en dus buiten de snapshot
valt en dus goedkoper is.

Wacht op: **welke gelicentieerde geluidenset, en wie betaalt hem** (§5.3).
Uploads van willekeurige bestanden zijn geen fase maar een categorie werk die ik
in dit product niet zou beginnen.

---

## 7. Aanbeveling

**Bouw fase 1: vast palet van per-vraag achtergronden + emoji per vraag + een
echte live preview in de vrageneditor.**

De redenering, kort:

- **Het is de enige fase die vandaag beslisbaar is.** Fase 3 en 4 hangen aan
  keuzes die alleen Ollie kan maken (provider, budget, risiconiveau). Fase 1
  hangt nergens aan.
- **De helft staat er al.** `backgroundSchema`, `backgroundCss()` en
  `themeToCssVars()` bestaan en zijn in gebruik; `presentation` is al een
  per-vraag opmaakveld met `accentOverride` als precedent; `QuestionFrame` is
  aantoonbaar buiten het spel te renderen (bewezen door een test die vandaag
  groen is). Dit is geen nieuw subsysteem, het is drie velden en een compositie.
- **Nul juridisch oppervlak.** Geen derde partij, geen upload, geen doorgifte,
  geen regel in `LEGAL.md`. Bij een product dat door minderjarigen gebruikt wordt
  is dat geen bijkomstigheid maar het hele punt van "laagste risico eerst".
- **De preview maakt alles daarna goedkoper.** Elke latere fase — stickers,
  transitions, GIF's — is makkelijker te bouwen én makkelijker te beoordelen als
  je ziet wat je maakt. Van de drie onderdelen is dit degene die ik zou behouden
  als er maar één in mocht.

Eén ding dat losstaat van welke fase dan ook en dat sowieso opgeschreven moet
worden: **`presentation` gaat ongefilterd naar elke speler** (§1.2,
`engine.ts:345`). Dat is vandaag onschuldig, want er staan alleen een layout, een
plaatje en een kleur in. Vanaf het moment dat er een tweede soort inhoud in komt,
is het een regel die iemand kan overtreden zonder het te merken. Die zin hoort in
`CLAUDE.md`, ongeacht wat Ollie kiest.

---

## Bijlage A — hoe elke bewering is nagemeten

Alles hieronder is gedraaid op branch `night/quizzly-slide-designer`, commit van
de default branch `main` (`2040b9c`), met `npm install` gedaan.

### A.1 Uitgangspunt: de testsuite is groen

```
$ npm test
 ✓ src/lib/nickname.test.ts (9 tests)
 ✓ src/lib/scoring.test.ts (17 tests)
 ✓ src/lib/question-schema.test.ts (36 tests)
 ✓ src/lib/media/storage.test.ts (6 tests)
 ✓ src/lib/media/ref.test.ts (7 tests)
 ✓ src/lib/quiz-transfer.test.ts (10 tests)
 ✓ src/components/play/QuestionFrame.test.tsx (7 tests)
 ✓ src/lib/media/image.test.ts (14 tests)

 Test Files  8 passed (8)
      Tests  106 passed (106)
```

Dit document wijzigt geen code, dus dat is zowel de begin- als de eindstand.

### A.2 §1.3 — het gedrag van `presentationSchema.parse()`

Gedraaid als een wegwerpscript in de repo-root (`npx tsx probe.ts`, daarna
verwijderd — het staat niet in de commit):

```ts
import { presentationSchema, DEFAULT_PRESENTATION } from "./src/lib/theme";
import { z } from "zod";

// 1. Worden onbekende sleutels gestript?
console.log(presentationSchema.parse({
  layout: "classic", hideTimer: false,
  emoji: "🎉", background: { kind: "solid", color: "#fff" },
}));

// 2. Oude snapshot + nieuw OPTIONEEL veld
const optional = presentationSchema.extend({ slideBackground: z.string().optional() });
console.log(optional.parse({ layout: "classic", hideTimer: false }));

// 3. Oude snapshot + nieuw VERPLICHT veld
const required = presentationSchema.extend({ slideBackground: z.string() });
const r = required.safeParse({ layout: "classic", hideTimer: false });
console.log(r.success ? "OK" : "THROWS: " + r.error.issues[0].message);

// 4. De opgeslagen vorm van de default
console.log(JSON.stringify(DEFAULT_PRESENTATION));
```

Uitvoer:

```
1. unknown keys after parse: {"layout":"classic","hideTimer":false}
2. old snapshot + optional new field: {"layout":"classic","hideTimer":false}
3. old snapshot + required new field -> THROWS: Required
4. DEFAULT_PRESENTATION as stored: {"layout":"classic","hideTimer":false}
```

Regel 1 bewijst het stripgedrag: `emoji` en `background` verdwijnen spoorloos
omdat ze niet in het schema staan. Regel 3 bewijst de val uit §1.3.

### A.3 §1.5 — er is geen audio

```
$ grep -rni "sound\|music\|audio" src server docs | grep -v node_modules
(geen uitvoer)
```

### A.4 §1.2 — `presentation` gaat ongefilterd naar de speler

```
$ grep -n "presentation\|toPublicPayload" src/types/realtime.ts server/realtime/engine.ts
src/types/realtime.ts:42:  presentation: Presentation;
server/realtime/engine.ts:7:  toPublicPayload,
server/realtime/engine.ts:51:  presentation: Presentation;
server/realtime/engine.ts:341:      payload: toPublicPayload(question.payload, {
server/realtime/engine.ts:345:      presentation: question.presentation,
```

`toPublicPayload` komt exact één keer voor in de realtime-route, op regel 341, en
staat op `payload`. Regel 345 zet `presentation` er ongewijzigd naast, en regel
354 stuurt het geheel naar `toAll`.

### A.5 §3.3 — `question-schema.ts` is client-veilig

```
$ grep -rn "server-only" src server | grep -v node_modules
src/lib/collab.ts:1:import "server-only";
src/lib/auth.ts:1:import "server-only";
src/lib/ai/index.ts:1:import "server-only";
```

`src/lib/question-schema.ts` en `src/lib/theme.ts` staan er niet bij; beide
importeren alleen `zod` (en `theme.ts` daarnaast `./media/ref`, dat volgens zijn
eigen commentaar bewust client-veilig is). `toPublicPayload()` en
`themeToCssVars()` mogen dus in een client-component.

### A.6 §1.6 — de CSP-directives

```
$ grep -n "img-src\|connect-src\|media-src\|style-src" src/middleware.ts
38:    `style-src 'self' 'unsafe-inline'`,
41:    `img-src 'self' blob: data: https:`,
44:    `connect-src 'self' ${isDev ? "ws: wss:" : "wss:"}`,
45:    `media-src 'self' https:`,
```

### A.7 §5.1 — de GIPHY-bronnen

Wel opgehaald en gelezen (2026-08-14):

- <https://developers.giphy.com/docs/api/> — beta-limiet van 100 calls/uur, de
  "Powered By GIPHY"-attributie-eis, en het productiesleutel-proces met de
  "discuss pricing"-stap.
- <https://developers.giphy.com/docs/api/endpoint/> — de `rating`-parameter
  (`g, pg, pg-13, r`) inclusief de zin dat je zonder rating resultaten uit álle
  ratings krijgt, en het `random_id`-endpoint.

Niet opgehaald: elke URL op `support.giphy.com` gaf HTTP 403, inclusief de
*GIPHY API Terms of Service*
(<https://support.giphy.com/hc/en-us/articles/360028134111-GIPHY-API-Terms-of-Service>)
en de pagina over voorwaarden voor een productiesleutel. De vijf punten in §5.1
zijn daarom geformuleerd als **te controleren vragen**, niet als vastgestelde
verplichtingen. Dat geldt in het bijzonder voor de cache-clausule: die kwam uit
een zoekresultaat, niet uit een pagina die ik zelf gelezen heb, en hij is
belangrijk genoeg om als eerste geverifieerd te worden.

### A.8 §5.3 — muziekrechten

De tweedeling master-/publishingrechten is de standaardstructuur van
muzieklicentiëring; ik heb hem geverifieerd tegen algemene bronnen over
muzieklicenties, niet tegen een specifieke licentie die Quizzly zou afnemen. De
concrete voorwaarden van welke geluidenset dan ook moeten gelezen worden op het
moment dat er één gekozen wordt — met name of de licentie *distributie als
onderdeel van software* dekt, wat iets anders is dan gebruik in één productie.
