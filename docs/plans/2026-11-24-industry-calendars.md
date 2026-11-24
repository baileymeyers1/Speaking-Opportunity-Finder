# Industry event calendars: what to mine, and how

Researched 2026-11-24. The question behind it: Speaking Finder works well for developer conferences and poorly elsewhere. A search for "Energy" in California returned nothing, live or stored. Bailey wants it comprehensive for every industry, and would rather show more than less. Directory pages turned up by search looked like the way in, so before building directory mining we looked for curated event calendars to integrate from the start.

## How it was measured

Five researchers each took one group of non-tech sectors: industry; health, science and education; business and the professions; public sector and culture; and cross-industry and regional sources. About 300 sites were checked. Each candidate was fetched with curl and a browser user agent, as our fetcher does. For each one we recorded:
- whether its events are in the served HTML or behind JavaScript, and whether it has a feed;
- its robots.txt rules for `*`, ClaudeBot, anthropic-ai, Claude-User and LinkupBot;
- any terms that restrict scraping or reuse;
- whether its listings link to the event's own site;
- whether it carries calls for speakers;
- any signs of pay-to-present conferences.

Every source recommended below was then fetched again to confirm the counts and the claims. Where the researchers disagreed, the terms were read directly.

## What we learned

1. **Calendars list events, not calls.** Few carry calls for speakers. The calls sit on each event's own site, often one click below the home page. So a calendar is worth as much as the step that follows each event to its site and reads it. An event without an open call is still worth listing as "to watch": the weekly check turns it into an open call once the call is posted.
2. **A handful of calendars do carry calls with deadlines:**
   - Civic Tech Field Guide (26 open calls)
   - PhilEvents (188 open calls for papers)
   - GovEvents (CFP records with deadlines)
   - UPenn CFP
   - EGU (an abstract deadline per meeting)
   - IEEE Robotics and Automation Society (a calendar of paper deadlines)
   - SPE ("call for proposals is open")
   - AWWA and Sigma Nursing

   These can create rows with a deadline directly, as ruralhealthinfo.org does today.
3. **A few shared formats cover many sites.** Five generic readers would cover nearly every good source; only two or three need code of their own:
   - **The Events Calendar** (WordPress) answers `/wp-json/tribe/events/v1/events?start_date=…` with JSON that includes each event's `website`. It runs on many association calendars.
   - **schema.org Event JSON-LD** on detail pages, listed in an event sitemap.
   - **iCal** and **RSS** feeds.
4. **One database sits behind many trade-show calendars.** The Trade Show Calendar is white-labelled by TSNN and by more than 100 associations and media groups. It lists 1,431 US events across 100 industries, can be filtered by state and city, and links each row to the event's site.
5. **Blocking is common, and some of it is aimed at us.**
   - A large share of trade-media and association sites answer curl with a Cloudflare challenge (403).
   - Many robots.txt files name ClaudeBot and anthropic-ai while allowing `*`. This looks like Cloudflare's managed robots.txt, and it often comes with `Content-Signal: ai-train=no`.
   - Association call-for-proposals platforms (Confex, Ex Ordo, Whova, PheedLoop, Ungerboeck venue calendars) block crawlers on purpose. None of them has a public index of calls.
6. **The terms decide as much as the technology does.**
   - Industry Dive publishes an annual "top conferences" article in about 25 trade verticals. Its terms (Informa TechTarget) ban "data mining, robots or similar data gathering or extraction methods".
   - Several of the best calendars allow personal or internal use only.
7. **Pay-to-present conferences turn up inside otherwise good lists** (IEEE RAS, CAA, SSSP, Rigzone, Pharma Focus Europe). They will be labelled, not hidden (decided 2026-11-24).
8. **Regional calendars are a dead end.** Convention-centre calendars are JavaScript shells or blocked, and chamber calendars list networking events. The Trade Show Calendar's state filter covers the large conventions better.

## Sources

"Green" means robots.txt allows us and we found no terms that restrict reuse. "Amber" means robots.txt allows us but the terms limit use to personal or internal purposes, or forbid reproducing the listings without permission: ask first. "Red" means robots.txt names our agents, or the terms ban scraping.

### Green: integrate

| Source | Sectors | Reader | Volume | Calls? | Notes |
|---|---|---|---|---|---|
| The Trade Show Calendar, thetradeshowcalendar.com/tsnn/ | every sector (100 industry codes), filter by state | HTML table, 30 per page | 1,431 US events | no | Says it is "free to use for all visitors". Its robots.txt `Disallow: index.php` has no leading slash, so as written it does not cover `/tsnn/index.php`. TSNN's own site blocks ClaudeBot, but the data lives on this host. Our largest single source, so confirm with them by email. |
| Civic Tech Field Guide, civictech.guide/calendar | government, civic tech, nonprofit tech, journalism | Google Calendar iCal | 61 upcoming events, 26 open calls, 20 funding deadlines | **yes** | CC BY, commercial use included, with attribution: show "via Civic Tech Field Guide". |
| Dealroom, dealroom.co/events | startups, fintech, tech | HTML, then detail pages | 182 | no | robots.txt "explicitly welcome[s] AI crawlers"; no terms found. |
| FINTRX RIA conferences 2027, fintrx.com/resources/ria-conferences-2027 | finance (wealth, asset management) | one HTML page; the URL changes each year | 132 | no | No terms found. |
| Product Talk 2027 product conferences, producttalk.org/2027-product-conferences.md | product management | Markdown tables; the URL changes each year | 73 | no | No terms found. |
| Agri Marketing farm show guide, agrimarketing.com/fsg.php | agriculture | HTML | 167 shows, 113 dated 2027 | no | The page also prints organizers' email addresses: never store them. |
| Food Industry Executive, foodindustryexecutive.com/trade-shows | food | HTML | about 70 | no | No terms found. |
| OneStop ESG, onestopesg.com/esg-events | climate, ESG | sitemap of 507 event pages | about 98 upcoming | no | No scraping clause. |
| Transport Topics, ttnews.com/events | trucking, logistics | HTML, 3 pages | 20–30 | no | No scraping clause. |
| NewSpace Tracker, newspacetracker.com/events/ | space | HTML | about 37 | no | robots.txt allows ClaudeBot by name. |
| NextBillion, nextbillion.net/calendar/ | international development, impact investing | event sitemap | about 12 per page | no | No terms found. |
| Podnews, podnews.net/events | podcasting | RSS | about 38 | no | Mostly webinars. |
| World Design Organization, wdo.org/events/ | design | Events Calendar JSON | 19 | no | Crawl-delay 60. |
| MathMeetings.net | mathematics | HTML, plus an .ics per entry | 81 | sometimes | |
| Kennesaw State teaching conferences directory | teaching in higher education, every discipline | HTML; the list is refreshed yearly | 100 | no | |
| Sigma Nursing industry conferences, sigmanursing.org/events/industry-conferences | nursing | HTML | about 10 | **yes** | |
| Syracuse IVMF entrepreneurship conferences and pitch competitions | startups | HTML | 46 | application windows | |
| DISA top HR conferences in 2027 | HR | HTML | about 40 | no | |
| Pursuit top government conferences, pursuit.us/blog/upcoming-government-conferences | government | HTML tables | about 160 | a "Speak" column | |
| EventsEye, eventseye.com | every sector (trade fairs, worldwide) | HTML, then detail pages | about 1,357 US | no | No robots.txt and no terms. Noisy: gun shows, flea markets and bridal fairs are mixed in. |
| Renewables Calendar, renewablescalendar.com | energy | WordPress REST or RSS | 20–30 upcoming | rare | Houston-heavy, with social events mixed in. |
| UPenn CFP, call-for-papers.sas.upenn.edu | humanities | HTML, 50 per page | about 1,600 posts | **yes** | Crawl-delay 60. Mixes journals and edited volumes with conferences: read the conference categories only. |
| AWWA call for abstracts, awwa.org/call-for-abstracts/ | water | HTML | about 5 | **yes** | Terms not read. |

### Amber: ask permission before integrating

| Source | Sectors | Volume | Calls? | Restriction |
|---|---|---|---|---|
| GovEvents, govevents.com | government, defense, education, IT | sitemap of 20,425 event pages, over 1,500 upcoming | **yes, with deadlines** | No reproducing or exploiting any portion without permission. |
| Sovereignty Founders, sovereigntyfounders.com | energy, manufacturing, aerospace and defense, minerals, semiconductors | 616 event pages, 314 upcoming; JSON-LD on each page; also runs a public MCP server | no | Licensed "for your own internal purposes"; no commercial use of its compiled listings without permission. |
| PhilEvents, philevents.org | philosophy | 188 open calls | **yes** | No reproducing listings without permission. |
| SPE events calendar | oil and gas | about 68, 12 with a call open | **yes** | Personal, non-commercial use only. |
| EGU meetings (iCal) | geosciences | 16 | abstract deadlines | No commercial use without permission. |
| Keystone Symposia | life sciences | 83 | abstracts | General no-reproduction clause. |
| FinTech Weekly conference calendar | fintech, banking, payments | about 135 | no | Personal, non-commercial use only. |
| Starbridge, starbridge.ai/conferences | K-12, higher education, state and local government | about 2,500 K-12 and about 2,900 higher-education conferences, including past ones | a "Deadline" field, probably for vendors | No scraping clause, but it is a commercial data product. |
| IEEE PES and IEEE RAS calendars | power, robotics | 42 and 34, plus 19 paper deadlines | **yes** | IEEE's terms page would not load. |
| AASHE calendar | campus sustainability | 69 | no | The footer reserves reproduction rights. |

### Red: don't scrape

- **Terms ban scraping or data mining:**
  - Industry Dive's "top conferences" articles (Healthcare, BioPharma, K-12, Higher Ed, Banking, Payments, HR, Retail, Hotel, Restaurant, Grocery, Utility, Construction, Supply Chain, ESG, Food and Smart Cities Dive, among others)
  - Wave Connect's sector pages
  - Billables
  - SHRM (state conferences and its call-for-presentations page)
  - Healio
  - Radiology Today
  - Insurance Journal
  - MarineLink
  - The Flying Engineer
  - Narrative Magazine
  - Billboard
  - TED's TEDx events list
  - Vestbee
  - Dexigner
  - Trade Fair Dates (its official links are hidden behind an encrypted token anyway)
- **robots.txt names our agents:** LINGUIST List, HealthManagement.org (its terms are personal-use as well), Meetings Today, pv magazine, ANS, Gardner, Archinect, journalism.co.uk, govtech.com, Law.com.
- **Blocked to our fetch** (Cloudflare, Incapsula, DataDome or Akamai):
  - directories: 10times, Events in America, Tradeshowz;
  - associations: HIMSS, NACCHO, ABA, SCCE, PMI, ATD, AFP, CASE, the philanthropy networks, AIGA, IDSA;
  - trade media in most sectors.

  TRB's call-for-papers page could not be reached from the research machine. Try it from Vercel.

## Gaps

Little or nothing usable was found for:
- wellness, fitness and sports;
- legal and compliance;
- PR and communications;
- accounting and insurance;
- construction and real estate;
- transportation, beyond trucking;
- US philanthropy networks;
- corporate learning and leadership.

For these, the routes are scheduled search with the wording associations use ("call for presentations", "call for proposals", "annual conference"), and permission requests to the sources that matter most.

## Rules for mining

- Read only what robots.txt allows, both for `*` and for any agent that names us, and honour `Crawl-delay`.
- A calendar enters the source list only after a person has read its terms.
- Don't send calendar reads through the Linkup reader to get past a challenge page or a robots rule. Today the page reader does that for single pages a search found when our own fetch is refused. That deserves its own decision.
- Identify the crawler honestly (a user agent naming Speaking Finder, with a contact URL) for calendar reads.
- Give credit where a licence asks for it (Civic Tech Field Guide). The row's source label already does this.
- Directory pages that a search turns up can still have their listed events followed: one page read, as today, then each event's own page. Apply the same robots rule and the blocklist of pay-to-present aggregators (conferenceinusa.com, allconferencealert.com, conferencealerts.co.in, conferenceineurope.org, conferenceindex.org, waset.org).

## Build order

1. **Location matching.** Done (#38).
2. **Live search keeps more.** Done (#40):
   - don't delete live results after 7 days;
   - read 16 pages per search instead of 8;
   - have the worker read a search's waiting hits first;
   - hand directory pages to the worker instead of reading them in the request.
3. **The extraction follows links and labels pay-to-present events.** Done (PR "link following"); robots.txt is checked for followed links only, for `*`.
   - The page reader also returns the page's links.
   - The one extraction call returns `callPageUrl` (the event's call-for-speakers page), `officialUrl` (when the page describes an event hosted elsewhere), `listedEvents` (when the page is a directory) and `payToPresent`.
   - The worker follows each link once.
   - This is the one schema change: a `payToPresent` column, and probably a `discoveredFrom` column.
4. **Calendar sources.** Started (PR "calendar sources"): The Trade Show Calendar, Civic Tech Field Guide and WDO, through `server/src/scrapers/calendars/`. No `CalendarSource` table: a calendar is a scraper in the registry, and `ScraperRun` already records when it ran and what it yielded. The Events Calendar reader is generic (a site is one line); Civic Tech is read from its page because calendar.google.com's robots.txt bars the iCal feed. Rows are written insert-only, so cross-calendar duplicates of a stored address are skipped and the rest meet the event matcher once the worker has read them. Next: the remaining green readers (iCal, RSS, sitemap plus JSON-LD; Product Talk, FINTRX). The Trade Show Calendar is still to be confirmed with them by email. As first planned:
   - A `CalendarSource` table holds each calendar's URL, reader kind, sectors, terms note, when it was last read and what it yielded.
   - Generic readers: Events Calendar JSON, iCal, RSS, sitemap plus JSON-LD.
   - Small dedicated readers for The Trade Show Calendar, Product Talk and FINTRX.
   - Start with the green list.
   - Each event becomes a row pointing at its own site. The worker reads it and lists it as an open call or an event to watch. Calendars that carry calls create rows with their deadline directly. Duplicates across calendars go through the existing event matcher.
5. **Budget before switching it on.**
   - The green list alone is a few thousand events. An event more than six months away doesn't need a weekly check.
   - Tokens per extraction are measured (#41): about 5,300 in and 300 out, $0.00068 a call on Haiku 5.5, so 600 calls a day is at most about $12 a month. What remains is the check cadence and the daily Claude cap.
6. **Wider scheduled search.** Live search now asks for "call for presentations" and drops procurement notices (#41). Still to do: the same wording in the scheduled queries, more queries a day, and a rotation of regions.
7. **Search words that match their sector.** Done (#41).

Raw research (pages, robots files and the five reports) was kept only in the session's scratch folder and is not in the repository.
