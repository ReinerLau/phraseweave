# Exercise sync and local storage

Exercise sync is started from the exercise list. The desktop browser opens a modal for one exercise, and the phone uses its system camera to open the receive URL in a normal browser. The receiver writes the exercise to IndexedDB.

The client flow is:

1. On the computer, click “同步” on one exercise in the exercise list.
2. Use the phone's system camera to scan the QR code shown in the modal.
3. The QR code contains only the same-origin `/receive?room=...` URL.
4. WebRTC transfers the course pack through a temporary WebSocket signaling room.
5. The receiver verifies SHA-256 and writes the complete pack to IndexedDB in one transaction.

For local development, the client defaults to `ws://localhost:8787/room`. Run the signal worker:

```bash
pnpm --filter signal-worker dev
```

For production, set:

```bash
EXERCISE_SYNC_SIGNAL_URL="wss://your-worker.example.com/room"
```

The course list and full course packs are cached locally. The course-pack page also exposes JSON export/import so a user can restore data after clearing site storage or reinstalling the PWA.
