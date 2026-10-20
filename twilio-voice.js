import { Device } from './twilio-sdk.js?v=2.18.5-browser';

let device = null;
let activeCall = null;
let starting = false;
let attemptSequence = 0;
let tokenRefreshPromise = null;
let tokenExpiresAt = 0;
let deviceUserId = '';
let userMuted = false;
let held = false;
let preferredSpeakerDeviceId = null;
let holdAudioProcessor = null;

function emit(state, extra = {}) {
  window.dispatchEvent(new CustomEvent('steadyhands:voice-state', {
    detail: { state, ...extra }
  }));
}

function cleanNumber(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

function microphoneErrorMessage(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');

  if (!window.isSecureContext) {
    return 'Microphone access requires HTTPS. Open https://outreach.steadyhandsop.com and try again.';
  }

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. In Safari, open Website Settings for outreach.steadyhandsop.com, set Microphone to Allow, then try again.';
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your microphone is being used by another app or could not be opened.';
  }

  return message || 'Microphone permission could not be enabled.';
}

async function requestMicrophonePermission() {
  if (!window.isSecureContext) {
    throw new Error(
      'Microphone access requires HTTPS. Open https://outreach.steadyhandsop.com and try again.'
    );
  }

  // Modern Safari/Chrome/Firefox path.
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      throw new Error(microphoneErrorMessage(error));
    }
  }

  // Legacy fallback for older WebKit builds.
  const legacyGetUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia;

  if (legacyGetUserMedia) {
    try {
      const stream = await new Promise((resolve, reject) => {
        legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
      });
      stream.getTracks?.().forEach(track => track.stop());
      return true;
    } catch (error) {
      throw new Error(microphoneErrorMessage(error));
    }
  }

  throw new Error(
    'Microphone calling is unavailable in this browser. Open https://outreach.steadyhandsop.com in Safari or Chrome and try again.'
  );
}

async function fetchAuthenticatedUserId() {
  const client = window.steadyHandsCRMClient;
  if (!client) throw new Error('The signed-in CRM session is not ready yet.');
  const {data,error}=await client.auth.getSession();
  if(error)throw new Error('Unable to read your calling session. Check your connection and retry.');
  if(!data?.session?.user?.id)throw new Error('Your calling session has ended. Sign in again before calling.');
  return String(data.session.user.id);
}

async function refreshCallingSession(client,expectedUserId) {
  if(window.SteadyHandsCallingSession?.refresh)return window.SteadyHandsCallingSession.refresh(client,expectedUserId);
  if(typeof client.auth.refreshSession!=='function')throw new Error('Your calling session has expired. Sign out and sign in again.');
  const {data,error}=await client.auth.refreshSession();
  if(error||!data?.session?.user?.id)throw new Error('Unable to refresh your calling session. Retry or sign in again.');
  if(data.session.user.id!==expectedUserId)throw new Error('The signed-in account changed. Retry the call from the current account.');
}

async function fetchToken(expectedUserId = deviceUserId) {
  const client = window.steadyHandsCRMClient;
  if (!client) throw new Error('The signed-in CRM session is not ready yet.');

  const userId=await fetchAuthenticatedUserId();
  if(expectedUserId&&userId!==expectedUserId)throw new Error('The signed-in account changed. Retry the call from the current account.');
  let { data, error } = await client.functions.invoke('twilio-voice-token', {body:{}});
  if(error?.context?.status===401) {
    await refreshCallingSession(client,userId);
    if(await fetchAuthenticatedUserId()!==userId)throw new Error('The signed-in account changed. Retry the call from the current account.');
    ({data,error}=await client.functions.invoke('twilio-voice-token',{body:{}}));
  }

  if (error) {
    // Supabase puts the function's useful rejection reason in the response body.
    // The default FunctionsHttpError only says that a non-2xx response occurred.
    let message = '';
    try {
      const response = error.context?.clone();
      const body = await response?.json();
      message = typeof body?.error === 'string' ? body.error :
        typeof body?.message === 'string' ? body.message : '';
    } catch {}
    const status = error.context?.status;
    if (!message && status === 401) message = 'Your calling session has expired. Sign out and sign in again.';
    if (!message && status === 404) message = 'The outbound calling service is unavailable. Ask your administrator to check the twilio-voice-token deployment.';
    throw new Error(message || 'Unable to authorize browser calling. ' + (error.message || 'Please try again.'));
  }
  if (!data?.token) throw new Error(data?.error || 'Twilio token was not returned.');
  if(window.steadyHandsCRMClient!==client||await fetchAuthenticatedUserId()!==userId)throw new Error('The signed-in account changed. Retry the call from the current account.');
  tokenExpiresAt=Date.now()+(Number(data.expires_in)>0?Number(data.expires_in):3600)*1000;
  return data.token;
}

async function refreshToken() {
  if (tokenRefreshPromise) return tokenRefreshPromise;

  const target=device;
  tokenRefreshPromise = (async () => {
    const token = await fetchToken();
    if (device&&device===target) device.updateToken(token);
    return token;
  })();

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

async function createOrReuseDevice() {
  const userId=await fetchAuthenticatedUserId();
  if(device&&deviceUserId!==userId){device.destroy();device=null;deviceUserId='';tokenExpiresAt=0;}
  if(device){
    if(tokenExpiresAt<=Date.now()+60000)await refreshToken();
    return device;
  }

  const token = await fetchToken(userId);

  device = new Device(token, {
    logLevel: 'warn',
    closeProtection: true,
    enableImprovedSignalingErrorPrecision: true,
    maxCallSignalingTimeoutMs: 30000
  });

  deviceUserId=userId;
  const registered=device;
  device.on('error', error => {
    if(device!==registered)return;
    console.error('Twilio Device error:', error);
    const detail = error?.twilioError || error;
    emit('error', {
      code: detail?.code || error?.code || '',
      message: detail?.message || error?.message || 'The browser phone encountered an error.',
      description: detail?.description || '',
      explanation: detail?.explanation || '',
      causes: Array.isArray(detail?.causes) ? detail.causes : [],
      solutions: Array.isArray(detail?.solutions) ? detail.solutions : []
    });
  });

  device.on('tokenWillExpire', () => {
    if(device!==registered)return;
    refreshToken().catch(error => {
      console.error('Unable to refresh Twilio token:', error);
    });
  });

  return device;
}

let deviceReadyPromise = null;
function ensureDevice() {
  if (!deviceReadyPromise) {
    deviceReadyPromise = createOrReuseDevice().finally(() => { deviceReadyPromise = null; });
  }
  return deviceReadyPromise;
}
// Preload the Twilio device/token, not the microphone and not an outbound call.
// Permissions, lead disposition and caller approval remain checked at dial time.
function prepare() { return ensureDevice(); }

function bindCall(call, metadata = {}) {
  let finished = false;
  const signal = (state, extra = {}) => emit(state, {...metadata, ...extra});
  const finish = (reason = 'ended') => {
    if (finished) return;
    finished = true;
    if (activeCall === call) activeCall = null;
    signal('ended', { reason, callSid: call?.parameters?.CallSid || call?.parameters?.CallSID || '' });
  };

  call.on('ringing', () => { if (!finished) signal('ringing'); });
  call.on('accept', () => {
    if (finished) return;
    const callSid =
      call?.parameters?.CallSid ||
      call?.parameters?.CallSID ||
      '';
    signal('connected', { callSid });
  });

  call.on('disconnect', () => finish('disconnect'));
  call.on('cancel', () => finish('cancel'));
  call.on('reject', () => finish('reject'));

  call.on('error', error => {
    if (finished) return;
    console.error('Twilio Call error:', error);
    const detail = error?.twilioError || error;
    signal('error', {
      code: detail?.code || error?.code || '',
      message: detail?.message || error?.message || 'The call could not be completed.',
      description: detail?.description || '',
      explanation: detail?.explanation || '',
      causes: Array.isArray(detail?.causes) ? detail.causes : [],
      solutions: Array.isArray(detail?.solutions) ? detail.solutions : []
    });
    finish('error');
  });
}

async function start(destination, metadata = {}) {
  if (activeCall || starting || window.SteadyHandsInboundVoice?.isActive()) throw new Error('A call is already active or incoming.');
  userMuted = false;
  held = false;

  const to = cleanNumber(destination);
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    throw new Error('This lead does not have a valid phone number.');
  }

  starting = true;
  try {
  if (!window.SteadyHandsLeadDisposition) throw new Error('Lead status checks are still loading. Please try again.');
  await window.SteadyHandsLeadDisposition.ensureCallable(metadata.crmId, to);
  emit('preparing', { message: 'Authorizing browser calling…' });
  const readyDevice = await ensureDevice();
  emit('preparing', { message: 'Enabling microphone…' });
  await requestMicrophonePermission();
  const agentUserId = await fetchAuthenticatedUserId();
  if(agentUserId!==deviceUserId)throw new Error('The signed-in account changed. Retry the call from the current account.');
  const attemptId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+(++attemptSequence);
  const attempt = {attemptId,crmId:metadata.crmId,company:metadata.company};
  emit('calling', attempt);

  const params = {
    To: to,
    crm_id: String(metadata.crmId || ''),
    company: String(metadata.company || '').slice(0, 80),
    transcribe: metadata.transcribe ? 'true' : 'false',
    agent_user_id: agentUserId
  };

  const call = await readyDevice.connect({ params });
  activeCall = call;
  bindCall(call, attempt);
  emit('dialed', {...attempt,callSid:call?.parameters?.CallSid || call?.parameters?.CallSID || ''});
  return call;
  } finally {
    starting = false;
  }
}

function hangup() {
  if (!activeCall) return;
  try {
    activeCall.disconnect();
  } catch (error) {
    console.warn('Unable to disconnect Twilio call:', error);
  }
}

function applyTransmitState() {
  if (!activeCall) return false;
  // While held, the local hold-audio processor replaces the microphone.
  // Do not mute the call itself or the hold audio would also be muted.
  activeCall.mute(Boolean(held ? false : userMuted));
  return true;
}

class HoldAudioProcessor {
  constructor() {
    this.audioContext = null;
    this.destination = null;
    this.oscillator = null;
    this.gain = null;
    this.timer = null;
    this.step = 0;
  }

  async createProcessedStream() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Hold audio is not supported in this browser.');

    this.audioContext = new AudioContextClass();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }

    this.destination = this.audioContext.createMediaStreamDestination();
    this.oscillator = this.audioContext.createOscillator();
    this.gain = this.audioContext.createGain();

    this.oscillator.type = 'sine';
    this.gain.gain.value = 0.045;

    this.oscillator.connect(this.gain);
    this.gain.connect(this.destination);

    const notes = [261.63, 329.63, 392.0, 329.63, 293.66, 349.23, 440.0, 349.23];
    this.oscillator.frequency.value = notes[0];
    this.oscillator.start();

    this.timer = setInterval(() => {
      if (!this.oscillator || !this.audioContext) return;
      this.step = (this.step + 1) % notes.length;
      const now = this.audioContext.currentTime;
      this.oscillator.frequency.cancelScheduledValues(now);
      this.oscillator.frequency.setTargetAtTime(notes[this.step], now, 0.025);
    }, 650);

    return this.destination.stream;
  }

  async destroyProcessedStream() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    try { this.oscillator?.stop(); } catch {}
    try { this.oscillator?.disconnect(); } catch {}
    try { this.gain?.disconnect(); } catch {}
    try { this.destination?.disconnect(); } catch {}
    try { await this.audioContext?.close(); } catch {}

    this.audioContext = null;
    this.destination = null;
    this.oscillator = null;
    this.gain = null;
  }
}

function setMuted(muted) {
  userMuted = Boolean(muted);
  applyTransmitState();
  return userMuted;
}

async function setHeld(nextHeld) {
  const next = Boolean(nextHeld);
  if (next === held) return held;

  if (!device?.audio || typeof device.audio.addProcessor !== 'function') {
    held = next;
    // Fallback: silence the mic when the browser/SDK cannot inject hold audio.
    activeCall?.mute(Boolean(held || userMuted));
    return held;
  }

  if (next) {
    holdAudioProcessor = new HoldAudioProcessor();
    activeCall?.mute(false);
    await device.audio.addProcessor(holdAudioProcessor, false);
    held = true;
    return true;
  }

  if (holdAudioProcessor) {
    try {
      await device.audio.removeProcessor(holdAudioProcessor, false);
    } catch (error) {
      console.warn('Unable to remove hold audio processor:', error);
    }
  }

  holdAudioProcessor = null;
  held = false;
  applyTransmitState();
  return false;
}

function isHeld() {
  return held;
}

async function getSpeakerInfo() {
  const audio = device?.audio;
  const collection = audio?.speakerDevices;
  const available = audio?.availableOutputDevices;

  if (!collection || !available || typeof collection.set !== 'function') {
    return { supported: false, devices: [], active: [] };
  }

  const devices = [...available.values()].map(item => ({
    deviceId: item.deviceId,
    label: item.label || 'Audio output'
  }));
  const active = [...collection.get()].map(item => item.deviceId);

  return { supported: devices.length > 0, devices, active };
}

async function toggleSpeakerOutput() {
  const info = await getSpeakerInfo();
  if (!info.supported) {
    return { supported: false, active: false, label: 'System audio' };
  }

  const devices = info.devices;
  if (!devices.length) {
    return { supported: false, active: false, label: 'System audio' };
  }

  const currentId = info.active[0] || preferredSpeakerDeviceId || devices[0].deviceId;
  const currentIndex = Math.max(0, devices.findIndex(item => item.deviceId === currentId));
  const next = devices[(currentIndex + 1) % devices.length];

  await device.audio.speakerDevices.set(next.deviceId);
  preferredSpeakerDeviceId = next.deviceId;

  return {
    supported: true,
    active: true,
    deviceId: next.deviceId,
    label: next.label || 'Speaker'
  };
}

function canSendDigits() {
  return activeCall?.status() === 'open';
}

function sendDigits(digits) {
  if (!canSendDigits()) return false;
  const value = String(digits || '');
  if (!/^[0-9A-D*#wW]+$/.test(value)) {
    throw new Error('Invalid keypad digits.');
  }
  activeCall.sendDigits(value);
  return true;
}

function isActive() {
  return Boolean(activeCall || starting);
}

window.SteadyHandsTwilioVoice = {
  prepare,
  start,
  hangup,
  setMuted,
  setHeld,
  isHeld,
  toggleSpeakerOutput,
  getSpeakerInfo,
  sendDigits,
  canSendDigits,
  isActive,
  refreshToken
};
