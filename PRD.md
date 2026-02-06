# Speaking Opportunity Finder - Product Requirements Document

## Overview

A web application that aggregates speaking opportunities from multiple sources, allowing users to search and filter by location, industry, format, and compensation. Designed for both professional and aspiring speakers looking to find their next conference talk, podcast appearance, or workshop opportunity.

---

## Recent Updates

- Live search results now have full detail pages and can be saved to lists (saved items are persisted to the database)
- Location filtering supports free-response multi-location input (e.g., "Los Angeles, CA, San Francisco, CA")
- Improved metadata visibility for event dates, deadlines, industries, and compensation
- Expanded U.S.-focused discovery in live search and weekly scraping
- Added curated U.S. mega-event list ingestion for broader coverage

---

## Target Users

- **Professional speakers**: Regular conference presenters seeking new opportunities
- **Aspiring speakers**: Individuals looking to break into public speaking

---

## Core Features

### 1. Search & Filter System

Users can discover opportunities using the following filters:

| Filter | Options |
|--------|---------|
| **Location** | City, country, region, remote/virtual |
| **Industry/Topic** | User-configurable (tech, business, healthcare, education, marketing, etc.) |
| **Event Format** | Conference, meetup, podcast, webinar, workshop, panel |
| **Compensation** | Paid honorarium, travel covered, accommodation provided, exposure only |
| **Deadline Status** | Open, closing soon, closed |

### 2. Opportunity Listings

Each listing displays:
- Event/organization name
- Call for proposals (CFP) deadline
- Event date(s)
- Location (or "Remote")
- Topic areas/tracks
- Compensation details
- Link to apply
- Source attribution

### 3. Save/Bookmark Opportunities

- Authenticated users can save opportunities to a personal list
- Organize saved items (e.g., "Interested", "Applied", "Wishlist")
- Quick access to saved opportunities from dashboard

### 4. Deadline Tracking (iCal Export)

- Export CFP deadlines to calendar applications
- Single opportunity export
- Bulk export of saved opportunities
- Compatible with Google Calendar, Apple Calendar, Outlook

### 5. User Accounts (Optional)

**Without account:**
- Full search and filter functionality
- View all opportunity details
- Export individual deadlines to calendar

**With account:**
- Save/bookmark opportunities
- Set industry/topic preferences
- Bulk calendar export of saved items
- Persistent filter preferences

---

## Data Sources

The application will aggregate opportunities from multiple sources:

### Primary Sources to Research & Integrate

| Source | Type | Notes |
|--------|------|-------|
| **Sessionize** | API/Scrape | Major CFP platform for tech conferences |
| **PaperCall** | API/Scrape | Popular CFP submission platform |
| **Confs.tech** | API | Tech conference aggregator |
| **Linkup Search (U.S.-focused)** | API | Broad discovery with U.S. prioritization |
| **GlobalConference.ca** | Scrape | Curated U.S. conference listings |
| **Momencio** | Scrape | Largest U.S. trade shows list |
| **UPrinting** | Scrape | Largest U.S. trade shows list |
| **ConferenceMonkey** | Scrape | Top conferences (U.S. filtered) |
| **InternationalConferenceAlerts** | Scrape | U.S. conferences directory |
| **CFP Land** | Scrape | Curated list of CFPs |
| **CallingAllPapers** | API | Conference CFP aggregator |
| **Speakerinnen** | Scrape | Speaking opportunities database |
| **TechDailyDeals CFP List** | Scrape | Tech conference CFPs |
| **Lanyrd** | Scrape | Conference directory |
| **Eventbrite** | API | Events platform with speaking calls |
| **Meetup** | API | Local meetup groups seeking speakers |

### Data Refresh Strategy

- Automated scraping/API calls on a scheduled basis (daily recommended)
- Deduplication logic to handle same events across sources
- Stale listing cleanup (remove past deadlines)

---

## Technical Architecture

### Tech Stack

- **Frontend**: React (with TypeScript)
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (opportunities, users, saved items)
- **Authentication**: JWT-based (optional OAuth providers)
- **Job Scheduler**: Node-cron or Bull for data refresh jobs
- **Hosting**: TBD (Vercel, Railway, AWS, etc.)

### High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│   Node.js API   │────▶│   PostgreSQL    │
│   (Frontend)    │     │   (Backend)     │     │   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Data Scrapers  │
                        │  & API Clients  │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │ External Sources│
                        │ (Sessionize,    │
                        │  PaperCall, etc)│
                        └─────────────────┘
```

### Database Schema (Simplified)

**opportunities**
- id, title, organization, description
- location, is_remote
- event_date, cfp_deadline
- format (conference/meetup/podcast/etc)
- industries (array)
- compensation_type, compensation_details
- apply_url, source, source_url
- created_at, updated_at

**users**
- id, email, password_hash
- preferred_industries (array)
- created_at

**saved_opportunities**
- id, user_id, opportunity_id
- category (interested/applied/wishlist)
- created_at

---

## User Interface

### Pages

1. **Home/Search** - Main search interface with filters and results
2. **Opportunity Detail** - Full details for a single opportunity
3. **Saved Opportunities** - User's bookmarked items (authenticated)
4. **Account Settings** - Preferences and profile (authenticated)
5. **Login/Register** - Authentication pages

### Key UI Components

- Filter sidebar/panel (collapsible on mobile)
- Opportunity cards with key info at a glance
- Deadline countdown badges ("3 days left")
- "Save" button with heart/bookmark icon
- Calendar export button
- Industry tag chips

---

## MVP Scope (v1.0)

### In Scope

- [ ] Search and filter functionality (all 4 filter types)
- [ ] Opportunity listing display
- [ ] Integration with 3-5 primary data sources
- [ ] User registration and authentication
- [ ] Save/bookmark functionality
- [ ] iCal export for deadlines
- [ ] Responsive web design
- [ ] Daily data refresh job

### Out of Scope (Future Versions)

- Email notifications for deadlines
- In-app notifications
- Speaker profile/portfolio pages
- Application status tracking
- Mobile native apps
- Social features (reviews, recommendations)
- AI-powered opportunity matching

---

## Success Metrics

- Number of unique opportunities aggregated
- Data freshness (% of listings with valid deadlines)
- User registrations
- Save/bookmark actions per user
- Return visitor rate

---

## Open Questions

1. Should there be rate limiting on searches for non-authenticated users?
2. How to handle opportunities that appear on multiple sources (deduplication strategy)?
3. What's the data retention policy for past opportunities?
4. Should we allow users to submit opportunities not found by scrapers?

---

## Timeline & Milestones

| Phase | Deliverable |
|-------|-------------|
| **Phase 1** | Database schema, API scaffolding, basic React app structure |
| **Phase 2** | Data scraper/API integrations (3-5 sources) |
| **Phase 3** | Search & filter functionality |
| **Phase 4** | User authentication system |
| **Phase 5** | Save/bookmark feature |
| **Phase 6** | iCal export functionality |
| **Phase 7** | UI polish, testing, deployment |

---

## Appendix

### Competitor/Inspiration Analysis

- **Sessionize** - Great CFP UX but limited to their platform
- **PaperCall** - Similar limitation
- **Confs.tech** - Good aggregation but tech-only, no personalization
- **CFP Land** - Curated but manual, limited filtering

### Industry Categories (Initial Set)

- Technology & Software
- Data & AI/ML
- DevOps & Cloud
- Design & UX
- Product Management
- Business & Entrepreneurship
- Marketing & Growth
- Leadership & Management
- Healthcare & Medicine
- Education & Academia
- Science & Research
- Arts & Creative
- Social Impact & Nonprofit
