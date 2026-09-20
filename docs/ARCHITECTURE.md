# Swacchify architecture and product decisions

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind v4, TanStack Query, React Router 7, Recharts, Leaflet + OpenStreetMap | Mobile-first; pages are lazy-loaded; no map API key needed |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2 | Sync handlers run in a threadpool |
| Database | PostgreSQL (production) / SQLite (local) | Same Alembic migrations for both (`render_as_batch`) |
| Cache / pub-sub | Redis | Optional locally |
| Jobs | Celery + beat | Tasks run eagerly without Redis |
| Real time | WebSockets | Redis pub/sub fan-out across API instances; in-process queue otherwise |
| AI | Anthropic Claude (`claude-opus-5`) over a curated knowledge base | Works without a key |
| Auth | JWT access (30 min) + rotating refresh tokens (14 days) with reuse detection, bcrypt, RBAC | Reset tokens are stored hashed |
| Storage | Local disk or S3 (`STORAGE_BACKEND`) | Collection proof photos |

## Swacchify AI: grounded, not generative

```
question ─► intent detection + item retrieval (aliases in EN / HI / Hinglish, plurals, typo tolerance)
         ─► [Claude: phrase an answer using ONLY the retrieved KB records → strict JSON schema]
         ─► server validates: item must exist in the KB; the KB's category always wins
         ─► server attaches actions (pickup / donate / drop-off / lesson) from the category, never from the model
```

- **The model never decides a disposal rule.** It gets the retrieved `waste_items` records and must return
  `item_slug` from them. An invented slug is dropped, and answers with no matching record are marked
  low-confidence with a "check with your municipality" note.
- **Ambiguous items** (toy, bulb, bottle, packet, box, cup) carry a clarification tree in the knowledge base.
  Tapping an option resolves straight from the knowledge base without a model call.
- **Resilience:** without credentials, or on rate limits, API errors or a refusal, the answer comes from the
  knowledge base alone. The API call opts into server-side refusal fallbacks (`fallbacks: "default"`) and uses
  low effort, which suits short chat answers.
- **Analytics:** every reply is stored with its intent, matched item, category, source, confidence and feedback.
  This drives the admin "AI insights" page: top questions, confused items, unanswered questions and negative
  feedback.
- Guests can chat without an account. Their conversation is protected by a per-conversation secret
  (`guest_key`).

## Pickup lifecycle

```
REQUESTED → ASSIGNED → ACCEPTED → ON_THE_WAY → ARRIVED → COLLECTED → VERIFIED → COMPLETED
                ↑ decline / no response: re-offered to the next nearest partner (Celery, every 15 min)
```

- **Auto-assignment** offers the pickup to the nearest verified, available partner within their service radius,
  subject to a daily load cap. With no partner in range, the pickup appears in partners' "Nearby" list. If it's
  still unassigned the day before, the customer is shown the nearest **drop-off point** (from the handwritten
  notes: "if delay in contact → drop-off point").
- **Weighing happens twice.** The partner records weights at the door (COLLECTED), which creates *pending*
  points. Warehouse staff then verify at the hub, and **only verified weight** credits points, partner earnings
  and impact. This follows the brief's rule that material has no guaranteed value until verified.
- **Segregation quality** (good / fair / poor) closes the learning loop. "Good" earns a 10% bonus. "Poor" breaks
  the segregation streak and sends the "5 common segregation mistakes" lesson.
- **Privacy:** partners see the customer's Swacchify ID (`SWC-XXXXXX`) and address, never their name; customers
  see the partner's ID (`SWP-…`). Phone numbers are shared only while a pickup is in progress.

## Traceability: "where did my waste go?"

Recyclers request material by category. When an admin approves a request, it is filled FIFO from verified,
unallocated pickup items (`lot_allocations`), dispatched, and invoiced with 18% GST. Each household's pickup page
then shows "2.3 kg of plastic → GreenLoop Polymers, mechanical recycling, processed", and households are notified
at dispatch and again at processing. Donation pickups (books, clothes, toys) never go to recyclers; they are
routed to partner schools and NGOs.

## Where this build differs from the brief (and why)

| Brief | Built | Reason |
|---|---|---|
| Six categories | **Seven**: Glass added | Glass bottles and jars are among the most common household recyclables and handled separately by recyclers |
| "Other / Household" collected | **Guidance only** | Swacchify collects clean dry waste (per the handwritten notes). Wet, sanitary, hazardous, thermocol and wet wipes go to municipal channels, and the AI explains how |
| Recycle only | **Recycle or Donate** | From the notes: books, clothes, shoes and toys should reach schools and NGOs first |
| Educational videos | **Narrated story-slide lessons**, with a video URL optional per lesson | No real videos exist yet. Slides work offline, in Hindi, with text-to-speech; admins can attach a YouTube or MP4 link at any time |
| Separate `WasteKnowledge`, `EducationalVideo`, `LearningModule` entities | Merged into `waste_items` and `lessons` | One source of truth each; fewer joins; admins edit a single record |
| "Driver gets the ID, not the name" | Applied **both ways**, plus time-boxed phone sharing | Privacy symmetry |
| Rewards | Points are credited only after warehouse verification; no cash value promised | Matches the brief's "do not guarantee monetary value" |

## Data model (≈35 tables)

- **Identity:** users, refresh_tokens, password_resets, customer_profiles, collection_partners,
  recycling_industries, households, household_members, addresses, user_badges
- **Knowledge:** waste_categories, waste_subcategories, waste_items, dropoff_points
- **AI:** ai_conversations, ai_messages
- **Learning and habits:** lessons, quizzes, quiz_questions, quiz_attempts, learning_progress, daily_content,
  habit_streaks, daily_activity
- **Operations:** pickup_requests, pickup_items, pickup_status_events, pickup_assignments, waste_verifications,
  ratings
- **Money and rewards:** rewards, reward_transactions, payments, industry_orders, lot_allocations,
  industry_transactions
- **Reporting:** impact_records (one row per verified item; the single source for impact dashboards),
  notifications, audit_logs

## Design system

The UI is deliberately quiet, so the content (an answer, a weight, a status) is what stands out.

- **Tokens** live in `src/index.css` (`@theme`): brand green, one `sea` blue accent, warm neutrals
  (`canvas` / `surface` / `ink` / `ink-2` / `muted` / `line` / `line-strong`), a single card radius, and two
  shadows — `shadow-soft` for resting surfaces, `shadow-lift` for things that float (modals, popovers, the chat
  composer).
- **Components** live in `src/components/ui.tsx`: `Button`, `Card`, `PageHeader`, `SectionTitle`, `Stat`,
  `IconBox`, `Badge`, `Field` + inputs, `Segmented`, `Toggle`, `Modal`, `EmptyState`, `ErrorState`, `Skeleton`,
  `ProgressBar`, `ProgressRing`, `Stars`. Pages compose these rather than hand-rolling markup.
- **Type:** Inter (Noto Sans Devanagari for Hindi, with its own line height and no negative tracking). Page
  titles 22–24px semibold, sections 15px semibold, body 14–15px, secondary 13px. Weights stop at semibold;
  numbers are always `tabular-nums`.
- **Icons, not emoji, for interface chrome.** Lucide throughout, including map markers (`PIN_*` glyphs in
  `MapView.tsx`). Emoji appear only where they are *content*: the category, lesson, reward and badge glyphs that
  come from the database — these help users who read little text, and admins can edit them.
- **Colour carries meaning, never decoration:** brand green = primary action, selected state, verified/positive;
  `sea` = secondary/informational; amber = needs attention; red = destructive. Category colours appear as a dot
  or a faint tint behind a glyph, never as text colour (several fail contrast as text).
- **Motion** is limited to hover/press/focus transitions plus modal and toast entrances, and everything is
  disabled under `prefers-reduced-motion`.
- **Density by audience:** households get large tap targets and a bottom tab bar; the admin console uses compact
  tables with a sticky action column and stacked cards on small screens.

## Internationalisation and accessibility

- The English and Hindi dictionaries are type-linked (`Record<I18nKey, string>`), so a missing Hindi string fails
  the build. To add a language, add a dictionary file and register it in `lib/i18n.tsx`. Knowledge-base and lesson
  content carries its own `_hi` fields.
- A language switch sits in every header. A signed-in user's language is saved to their profile, and
  notifications are sent in that language.
- Large tap targets, a bottom tab bar on phones, visible focus rings, labelled controls, a skip link and
  `prefers-reduced-motion` support. Read-aloud (text-to-speech) is available on answers, tips and lessons, and
  voice input on the assistant where the browser supports it.
- The category palette is validated for colour-vision deficiency. Colour is never the only carrier of identity:
  emoji and name always accompany it, and category colours are never used for text.

## Known limitations and next steps

- Email, SMS and WhatsApp use console providers. Plug real ones (e.g. SES, MSG91, WhatsApp Cloud API) into
  `services/channels.py`.
- Addresses are pinned on a map rather than geocoded. Add a geocoder if typed addresses must resolve on their own.
- Partner ETA uses straight-line distance × 1.3 at average city speed. Swap in a routing API for turn-by-turn
  ETAs.
- The AI rate limiter is per-process. Move it to Redis when running several API instances.
- Tokens live in `localStorage` for simplicity. Consider httpOnly cookies and a CSP for a hardened deployment.
- Registration fees (mentioned in the notes) are not implemented. `payments` is ready to carry them.
