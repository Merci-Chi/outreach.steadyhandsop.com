(() => {
  const url = 'https://glonbvrcudwuzjundrii.supabase.co';
  const key = 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr';

  const form = document.getElementById('loginForm');
  const message = document.getElementById('loginMessage');
  const button = document.getElementById('signInButton');
  const password = document.getElementById('loginPassword');
  const eye = document.getElementById('showPassword');
  const forgot = document.getElementById('forgotPassword');
  const email = document.getElementById('loginEmail');
  const heading = document.getElementById('loginHeading');
  const subheading = document.getElementById('loginSubheading');
  const saveEmail = document.getElementById('saveEmailToDevice');
  const agreeToTerms = document.getElementById('agreeToTerms');
  const termsOption = document.querySelector('.terms-option');
  const termsValidation = document.getElementById('termsValidation');
  const SAVED_EMAIL_KEY = 'steadyhands-saved-login-email';

  try {
    const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY) || '';
    if (savedEmail) {
      email.value = savedEmail;
      if (saveEmail) saveEmail.checked = true;
    } else if (saveEmail) {
      saveEmail.checked = false;
    }

    if (agreeToTerms) agreeToTerms.checked = false;
  } catch {}

  saveEmail?.addEventListener('change', () => {
    try {
      if (saveEmail.checked) {
        const currentEmail = email?.value?.trim() || '';
        if (currentEmail) {
          localStorage.setItem(SAVED_EMAIL_KEY, currentEmail);
        }
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
    } catch {}
  });

  email?.addEventListener('input', () => {
    if (!saveEmail?.checked) return;
    try {
      const currentEmail = email.value.trim();
      if (currentEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, currentEmail);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
    } catch {}
  });

  agreeToTerms?.addEventListener('change', () => {
    if (agreeToTerms.checked) {
      termsOption?.classList.remove('is-invalid');
      termsValidation?.classList.remove('is-visible');
    }
  });

  window.lucide?.createIcons();

  const termsLink = document.getElementById('termsLink');

  function openTermsModal() {
    document.querySelector('.terms-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'terms-modal-overlay';
    overlay.innerHTML = `
      <iframe class="terms-modal-frame" src="terms.html?embedded=1" title="Terms & Conditions"></iframe>
    `;

    document.body.appendChild(overlay);
  }

  termsLink?.addEventListener('click', event => {
    event.preventDefault();
    openTermsModal();
  });

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'close-terms') {
      document.querySelector('.terms-modal-overlay')?.remove();
    }
  });

  function setPasswordVisibility(input, toggle) {
    if (!input || !toggle) return;
    toggle.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      toggle.innerHTML = visible
        ? '<i data-lucide="eye-off"></i>'
        : '<i data-lucide="eye"></i>';
      window.lucide?.createIcons();
    });
  }

  setPasswordVisibility(password, eye);

  let client;
  let recoveryMode = new URLSearchParams(location.search).get('reset') === '1';

  function showRecoveryForm() {
    if (form.dataset.mode === 'recovery') return;

    recoveryMode = true;
    form.dataset.mode = 'recovery';
    heading.textContent = 'Create a new password';
    subheading.textContent = 'Enter and confirm your new password below.';

    form.innerHTML = `
      <label for="newPassword">New password</label>
      <div class="login-field">
        <i data-lucide="lock-keyhole"></i>
        <input id="newPassword" type="password" name="newPassword" placeholder="Enter new password" autocomplete="new-password" minlength="8" required/>
        <button type="button" id="showNewPassword" aria-label="Show password"><i data-lucide="eye"></i></button>
      </div>

      <label for="confirmPassword">Confirm new password</label>
      <div class="login-field">
        <i data-lucide="lock-keyhole"></i>
        <input id="confirmPassword" type="password" name="confirmPassword" placeholder="Confirm new password" autocomplete="new-password" minlength="8" required/>
        <button type="button" id="showConfirmPassword" aria-label="Show password"><i data-lucide="eye"></i></button>
      </div>

      <div id="loginMessage" class="login-message" role="status" aria-live="polite"></div>
      <button type="submit" id="signInButton" class="login-submit">Update password <i data-lucide="check"></i></button>
    `;

    setPasswordVisibility(
      document.getElementById('newPassword'),
      document.getElementById('showNewPassword')
    );
    setPasswordVisibility(
      document.getElementById('confirmPassword'),
      document.getElementById('showConfirmPassword')
    );
    window.lucide?.createIcons();
  }

  try {
    if (!window.supabase) throw new Error('Authentication library unavailable');
    client = window.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        showRecoveryForm();
      }
    });

    client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (recoveryMode) {
        showRecoveryForm();
        return;
      }
      if (data.session) location.replace('onboarding.html');
    }).catch(e => {
      console.error('Session check:', e);
    });
  } catch (e) {
    console.error('Login setup:', e);
    message.textContent = 'Unable to connect. Please try again.';
  }

  forgot.addEventListener('click', async () => {
    if (!client) {
      message.textContent = 'Unable to connect. Please try again.';
      return;
    }

    const address = email.value.trim();
    if (!address) {
      message.textContent = 'Enter your email address first.';
      email.focus();
      return;
    }

    forgot.disabled = true;
    message.textContent = 'Sending password reset email...';

    try {
      const redirectTo = new URL('login.html?reset=1', location.href).href;
      const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo });
      if (error) throw error;

      message.textContent = 'Password reset email sent. Check your inbox and open the reset link.';
    } catch (error) {
      console.error('Password reset failed:', error);
      message.textContent = error?.message || 'Unable to send the reset email. Please try again.';
    } finally {
      forgot.disabled = false;
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!client) {
      const currentMessage = document.getElementById('loginMessage');
      currentMessage.textContent = 'Unable to connect. Please try again.';
      return;
    }

    if (recoveryMode || form.dataset.mode === 'recovery') {
      const newPassword = document.getElementById('newPassword');
      const confirmPassword = document.getElementById('confirmPassword');
      const currentMessage = document.getElementById('loginMessage');
      const currentButton = document.getElementById('signInButton');

      if (newPassword.value !== confirmPassword.value) {
        currentMessage.textContent = 'Passwords do not match.';
        return;
      }

      if (newPassword.value.length < 8) {
        currentMessage.textContent = 'Password must be at least 8 characters.';
        return;
      }

      currentButton.disabled = true;
      currentMessage.textContent = 'Updating password...';

      try {
        const { error } = await client.auth.updateUser({ password: newPassword.value });
        if (error) throw error;

        currentMessage.textContent = 'Password updated. Signing you in...';
        history.replaceState({}, '', 'login.html');
        setTimeout(() => location.replace('onboarding.html'), 500);
      } catch (error) {
        console.error('Password update failed:', error);
        currentMessage.textContent = error?.message || 'Unable to update password. Please request a new reset link.';
        currentButton.disabled = false;
      }
      return;
    }

    if (!agreeToTerms?.checked) {
      message.textContent = '';
      termsOption?.classList.add('is-invalid');
      termsValidation?.classList.add('is-visible');
      agreeToTerms?.focus();
      return;
    }

    button.disabled = true;
    message.textContent = 'Signing in...';

    try {
      const loginEmail = form.elements.email.value.trim();
      const { error } = await client.auth.signInWithPassword({
        email: loginEmail,
        password: password.value
      });
      if (error) throw error;

      try {
        if (saveEmail?.checked) {
          localStorage.setItem(SAVED_EMAIL_KEY, loginEmail);
        } else {
          localStorage.removeItem(SAVED_EMAIL_KEY);
        }
      } catch {}

      location.replace('onboarding.html');
    } catch (error) {
      console.error('Sign-in failed:', error);
      message.textContent = 'Unable to sign in. Check your email and password.';
      button.disabled = false;
    }
  });
})();
