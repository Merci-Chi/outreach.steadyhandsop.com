(() => {
  'use strict';
  const trigger = document.getElementById('refKeypad');
  const dialog = document.getElementById('callKeypad');
  if (!trigger || !dialog) return;
  const status = document.getElementById('callKeypadStatus');
  const display = document.getElementById('callKeypadDisplay');
  const keys = [...dialog.querySelectorAll('[data-digit]')];
  const voice = () => [window.SteadyHandsTwilioVoice, window.SteadyHandsInboundVoice]
    .find(phone => phone?.canSendDigits?.());
  let refreshTimer = null;
  const ready = () => Boolean(voice());

  function sync() {
    const connected = ready();
    keys.forEach(key => { key.disabled = !connected; });
    status.textContent = connected
      ? 'Tap a number to send a tone to this call.'
      : 'Connect a call to send keypad tones.';
    if (!connected) display.textContent = '';
  }

  function send(digit) {
    if (!ready()) { sync(); return; }
    try {
      if (!voice().sendDigits(digit)) { sync(); return; }
      display.textContent = (display.textContent + digit).slice(-24);
      status.textContent = 'Tone sent.';
    } catch (error) {
      status.textContent = error.message || 'Unable to send the keypad tone. Please try again.';
    }
  }

  trigger.addEventListener('click', () => {
    sync();
    if (!dialog.open) dialog.showModal();
    clearInterval(refreshTimer);
    // SDK status may settle after its accept event; keep an open keypad current.
    refreshTimer = setInterval(sync, 250);
  });
  keys.forEach(key => key.addEventListener('click', () => send(key.dataset.digit)));
  document.getElementById('callKeypadClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    clearInterval(refreshTimer);
    refreshTimer = null;
    trigger.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || !/^[0-9*#]$/.test(event.key)) return;
    event.preventDefault();
    send(event.key);
  });
  window.addEventListener('steadyhands:voice-state', sync);
})();
