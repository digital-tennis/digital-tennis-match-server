# Digital Tennis match server

- Node.js 22 or later, ESM, npm lockfile. Run `npm ci`, `npm run check`, and `npm test`.
- Keep Unity physics, hit acceptance and scoring in digital-tennis-game. This server owns rooms, membership, signaling and relay validation.
- Preserve separately attached external IMU + NU40-DK, 12 days, three developers. BLE decoding belongs in the controller products.
- Room authority comes from the current socket, never a claimed playerId or room code in a relay payload.
- Never log reconnect tokens or include them in a URL. Rotate on successful resume; pause on disconnect and require a fresh transport epoch.
- Unity negotiates WebRTC DataChannel and falls back to an agreed fresh WebSocket relay epoch. Routing offer/answer/ICE alone does not prove direct P2P; record the selected transport and actual peer connection evidence.
- Keep dependencies pinned and committed in package-lock.json. Keep `.env`, node_modules and local validation evidence out of Git.
- Use draft pull requests for new work; squash-merge approved PRs and remove merged remote/local branches.
