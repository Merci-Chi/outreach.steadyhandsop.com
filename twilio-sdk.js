/* Use Twilio's prebuilt browser distribution without runtime ESM conversion. */
import './vendor/twilio-voice-sdk-2.18.5.min.js';

const Device = globalThis.Twilio?.Device;
if (typeof Device !== 'function') {
  throw new Error('The browser phone library could not load. Reload the page and try again.');
}
export { Device };
