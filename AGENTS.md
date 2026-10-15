# Digital Tennis match server

- Node.js 22 or later, ESM, npm lockfile. Run `npm ci`, `npm run check`, and `npm test`.
- Keep Unity physics, hit acceptance and scoring in digital-tennis-game. This server owns rooms, membership, signaling and relay validation.
- Preserve separately attached external IMU + NU40-DK, 12 days, three developers. BLE decoding belongs in the controller products.
- Room authority comes from the current socket, never a claimed playerId or room code in a relay payload.
- Never log reconnect tokens or include them in a URL. Rotate on successful resume; pause on disconnect and require a fresh transport epoch.
- Unity currently selects WebSocket relay explicitly. Routing offer/answer/ICE does not demonstrate direct P2P; do not label relay as direct P2P.
- Keep dependencies pinned and committed in package-lock.json. Keep `.env`, node_modules and local validation evidence out of Git.
- Use draft pull requests for new work; squash-merge approved PRs and remove merged remote/local branches.
