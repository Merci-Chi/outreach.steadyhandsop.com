# Twilio Voice SDK browser distribution

`twilio-voice-sdk-2.18.5.min.js` is copied without modification from
`dist/twilio.min.js` in the official `@twilio/voice-sdk` npm package, version 2.18.5.

Package: https://registry.npmjs.org/@twilio/voice-sdk/-/voice-sdk-2.18.5.tgz
Upstream: https://github.com/twilio/twilio-voice.js
License: Apache-2.0; included as `TWILIO-LICENSE.md`.
SHA-256: `35d3cb1b22e309f9884724a89250aecd2de4f1556ad7b67a7bc5e06c73dcb74a`

The shared `twilio-sdk.js` module loads this browser build for outgoing and incoming
calling. This avoids the runtime ESM conversion of the SDK's CommonJS logging
dependency that caused `Ue.levels.ERROR` to fail during Device construction.

Upstream documents direct use of the browser distribution:
https://github.com/twilio/twilio-voice.js#github
