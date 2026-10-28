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

```bash
npm install
npm run dev
```

## Validation

```bash
npm test -- --runInBand
```

## Notes

- The app currently uses the in-memory store by default for local development and testing.
- If `MONGO_URI` is configured, listing updates are synced to MongoDB through the existing Mongoose models.
- Saved searches and notifications are tracked in application state and backed by Mongo models when the database is connected.
