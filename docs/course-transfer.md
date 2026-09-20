# Course transfer and PWA storage

Course transfer is intentionally started from the installed PWA. Safari and a Home Screen Web App have separate browser storage areas, so importing in Safari does not populate the PWA's IndexedDB.

The client flow is:

1. On the computer, open `/transfer` and choose a course pack.
2. On the iPhone PWA, open `/scan` and scan the QR code.
3. The QR code contains only the same-origin `/receive?room=...` URL.
4. WebRTC transfers the course pack through a temporary WebSocket signaling room.
5. The receiver verifies SHA-256 and writes the complete pack to IndexedDB in one transaction.

For local development, run the signal worker and set:

```bash
COURSE_TRANSFER_SIGNAL_URL="ws://localhost:8787/room"
```

The course list and full course packs are cached locally. The course-pack page also exposes JSON export/import so a user can restore data after clearing site storage or reinstalling the PWA.
