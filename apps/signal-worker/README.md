# PhraseWeave course signal worker

This worker relays WebRTC signaling messages for one short-lived sender/receiver room. It never stores course content.

```bash
pnpm --filter signal-worker dev
```

Deploy it with:

```bash
pnpm --filter signal-worker deploy
```

Set the client build variable to the worker URL without a room token:

```bash
COURSE_TRANSFER_SIGNAL_URL="wss://your-worker.example.com/room"
```

The client app appends the 64-character room token to this path. Rooms allow one sender and one receiver; the token should be treated as a short-lived bearer capability.
