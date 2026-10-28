# CampusBid

CampusBid is a student marketplace auction app for buying and selling campus items with transparent bidding rules and seller approvals.

## Auction extension feature

The final-minute extension rule is enforced on the server:

- If a valid bid is accepted during the last 30 seconds of an auction, the effective closing time is extended by 60 seconds from the bid timestamp.
- Invalid or rejected bids do not extend the auction timer.
- This logic is checked against the server clock and applies repeatedly for consecutive valid late bids.
- The updated `closingAt` value is persisted to the listing record when MongoDB is connected.
- Socket.IO broadcasts the refreshed countdown to all connected viewers in real time.
- Concurrent bid attempts are serialized per listing to keep auction closure and bidding state consistent.

## Saved searches and notification system

CampusBid includes saved-search alerts and a notification center for important auction updates.

- Users can save item searches with keywords, category, condition, min/max price, and closing-soon filters.
- Matching listings trigger a dedicated `NEW_MATCHING_LISTING` notification without sending duplicates for the same saved search and listing.
- Notifications cover bid approvals/rejections, outbid events, auction extensions, provisional wins, handover updates, and closing-soon reminders.
- Notification delivery in the app works independently of browser alerts, and browser permission is requested only after explicit user action.
- The duplicate-safe notification key prevents repeated delivery when scheduled polling retries match the same listing.

## Local development

Configure `MONGO_URI` in your private `.env` file before starting the backend. The server requires MongoDB to connect and complete its startup data checks before it opens the API port or starts scheduled jobs.

```bash
npm install
npm run dev
```

For MongoDB Atlas, use the connection string from your Atlas cluster in `MONGO_URI`; keep the database password only in `.env` and never commit that file. The API health endpoint reports whether the database is connected:

```text
http://localhost:5000/api/health
```

The backend persists users, listings and bid history, bids, sales, automatic-bid instructions, notifications, and saved searches in MongoDB. Existing Mongo documents without the application's string `id` field are assigned their existing Mongo `_id` as the string ID during startup; existing records are retained. Startup creates required indexes and initializes the original demo records with upserts so restarts do not create duplicates. Multi-document auction operations use MongoDB transactions, so use an Atlas replica set (Atlas clusters satisfy this requirement).

## Validation

```bash
npm test -- --runInBand
```

The MongoDB integration test is opt-in because it writes uniquely named test records to the configured database. Run it only against a non-production Atlas/test cluster:

```powershell
$env:RUN_MONGO_INTEGRATION_TESTS = "1"
npx jest server/__tests__/mongoPersistence.test.js --runInBand
```

The test cleans up only the test records it creates and requires transaction support (a replica set or mongos).

## Notes

- Automated unit/API tests use an isolated in-memory store when they import the app without starting the server.
- Running the backend requires a valid `MONGO_URI`; startup fails explicitly if the connection or data initialization fails.
- Do not share `.env` or paste a connection string containing credentials into logs, issues, or chat.
