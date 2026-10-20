(() => {
  const SUPABASE_URL = 'https://glonbvrcudwuzjundrii.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const client = () => {
    if (!window.supabase) return null;
    if (!window.steadyHandsCRMClient) {
      window.steadyHandsCRMClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return window.steadyHandsCRMClient;
  };

  const formatPhone = value => {
    const digits = String(value || '').replace(/\D/g,'');
    const ten = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
    if (ten.length !== 10) return value || 'No phone';
    return '(' + ten.slice(0,3) + ') ' + ten.slice(3,6) + '-' + ten.slice(6);
  };

  const formatDate = value => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };

  async function getAdminSession() {
    const c = client();
    if (!c) return {};

    const { data:{ session } = {}, error } = await c.auth.getSession();
    if (error || !session) return {};

    const { data: permission, error: permissionError } = await c
      .from('team_permissions')
      .select('role,active')
      .eq('user_id', session.user.id)
      .maybeSingle();

    return {
      session,
      isAdmin: !permissionError && permission?.active === true && permission?.role === 'ADMIN'
    };
  }

  function denied(main) {
    main.innerHTML = `
      <section class="admin-access-denied">
        <div class="admin-access-icon"><i data-lucide="shield-x"></i></div>
        <h2>Admin access required</h2>
        <p>This page is only available to users with an active ADMIN role in Supabase.</p>
        <a href="account.html">Back to Settings</a>
      </section>`;
    window.lucide?.createIcons();
  }

  function errorState(main, message) {
    main.innerHTML = `
      <section class="admin-access-denied">
        <div class="admin-access-icon"><i data-lucide="triangle-alert"></i></div>
        <h2>Unable to load approvals</h2>
        <p>${esc(message || 'Please refresh and try again.')}</p>
        <button type="button" id="adminRetry">Try Again</button>
      </section>`;
    document.getElementById('adminRetry')?.addEventListener('click', () => location.reload());
    window.lucide?.createIcons();
  }

  async function loadApprovals(main, session) {
    const c = client();

    const [
      { data: pending = [], error: pendingError },
      { data: profiles = [], error: profilesError },
      { data: phoneNumbers = [], error: phoneNumbersError },
      { data: assignments = [], error: assignmentsError }
    ] = await Promise.all([
      c
        .from('callcenter_profiles')
        .select('user_id,display_name,email,phone,phone_verified_at,phone_approval_status,phone_approval_requested_at')
        .eq('phone_approval_status','pending')
        .not('phone_verified_at','is',null)
        .order('phone_approval_requested_at',{ascending:true}),
      c
        .from('callcenter_profiles')
        .select('user_id,display_name,email')
        .order('display_name',{ascending:true}),
      c
        .from('callcenter_phone_numbers')
        .select('id,phone_number,label,active,twilio_status,requested_by_user_id,requested_at,created_at')
        .order('created_at',{ascending:true}),
      c
        .from('callcenter_phone_assignments')
        .select('id,user_id,phone_number_id,updated_at')
    ]);

    const callerIdSchemaMissing =
      phoneNumbersError?.code === '42P01' ||
      assignmentsError?.code === '42P01' ||
      /callcenter_phone_(numbers|assignments)/i.test(phoneNumbersError?.message || assignmentsError?.message || '');

    if (pendingError || profilesError || (!callerIdSchemaMissing && (phoneNumbersError || assignmentsError))) {
      errorState(main, (pendingError || profilesError || phoneNumbersError || assignmentsError)?.message);
      return;
    }

    const assignmentByPhone = new Map(
      (assignments || []).map(row => [String(row.phone_number_id), row])
    );

    const profileByUser = new Map(
      (profiles || []).map(row => [String(row.user_id), row])
    );

    const callerIdSection = callerIdSchemaMissing
      ? `
        <section class="admin-approval-section admin-callerid-section">
          <div class="admin-section-head">
            <div>
              <h2>Outbound Phone Numbers</h2>
              <p>Run the caller-ID SQL migration first, then refresh this page.</p>
            </div>
          </div>
          <div class="admin-empty">
            <i data-lucide="database-zap"></i>
            <strong>Caller ID setup required</strong>
            <span>The callcenter_phone_numbers tables do not exist yet.</span>
          </div>
        </section>`
      : `
        <section class="admin-approval-section admin-callerid-section">
          <div class="admin-section-head">
            <div>
              <h2>Outbound Phone Numbers</h2>
              <p>Add verified calling numbers and assign one default caller ID to each account.</p>
            </div>
            <span class="admin-count admin-phone-count">${phoneNumbers.length}</span>
          </div>

          <form class="admin-add-phone" id="adminAddPhoneForm">
            <label>
              <span>Calling number</span>
              <input id="adminPhoneNumber" type="tel" inputmode="tel" placeholder="+17025550101" required />
            </label>
            <label>
              <span>Label</span>
              <input id="adminPhoneLabel" type="text" maxlength="60" placeholder="Sales Line 1" />
            </label>
            <button type="submit"><i data-lucide="plus"></i>Add Number</button>
          </form>

          <div class="admin-phone-list" id="adminPhoneList">
            ${phoneNumbers.length ? phoneNumbers.map(row => {
              const assignment = assignmentByPhone.get(String(row.id));
              const assignedUserId = assignment?.user_id || '';
              const assignedProfile = assignedUserId ? profileByUser.get(String(assignedUserId)) : null;
              const requestedProfile = row.requested_by_user_id ? profileByUser.get(String(row.requested_by_user_id)) : null;
              const options = [
                '<option value="">Unassigned</option>',
                ...profiles.map(profile => {
                  const selected = String(profile.user_id) === String(assignedUserId) ? ' selected' : '';
                  const label = profile.display_name || profile.email || 'Account';
                  return '<option value="' + esc(profile.user_id) + '"' + selected + '>' + esc(label) + '</option>';
                })
              ].join('');

              return `
                <article class="admin-phone-card" data-phone-id="${esc(row.id)}">
                  <div class="admin-phone-card-head">
                    <div class="admin-phone-card-icon"><i data-lucide="phone-call"></i></div>
                    <div class="admin-phone-card-copy">
                      <strong>${esc(formatPhone(row.phone_number))}</strong>
                      <span>${esc(row.label || 'Outbound caller ID')}</span>
                      ${requestedProfile ? '<small>Requested by ' + esc(requestedProfile.display_name || requestedProfile.email || 'Account') + '</small>' : ''}
                    </div>
                    <span class="admin-phone-active">${row.twilio_status === 'ready' ? 'Ready' : 'Pending verification'}</span>
                  </div>

                  <label class="admin-phone-assign">
                    <span>Assigned account</span>
                    <select data-phone-assignment>
                      ${options}
                    </select>
                    <small>${assignedProfile ? 'Calls from ' + esc(assignedProfile.display_name || assignedProfile.email || 'this account') + ' use this number.' : 'This number is not assigned to an account.'}</small>
                  </label>

                  <div class="admin-phone-actions">
                    <button type="button" class="admin-phone-ready" data-phone-ready>
                      <i data-lucide="${row.twilio_status === 'ready' ? 'shield-check' : 'shield-alert'}"></i>
                      ${row.twilio_status === 'ready' ? 'Mark Pending' : 'Mark Ready'}
                    </button>
                    <button type="button" class="admin-phone-toggle" data-phone-toggle>
                      <i data-lucide="${row.active ? 'pause' : 'play'}"></i>
                      ${row.active ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" class="admin-phone-delete" data-phone-delete>
                      <i data-lucide="trash-2"></i>Remove
                    </button>
                  </div>
                </article>`;
            }).join('') : `
              <div class="admin-empty">
                <i data-lucide="phone-call"></i>
                <strong>No outbound numbers yet</strong>
                <span>Add a verified calling number above.</span>
              </div>`}
          </div>
        </section>`;

    main.innerHTML = `
      <section class="admin-summary-card">
        <div class="admin-summary-icon"><i data-lucide="shield-check"></i></div>
        <div>
          <strong>Admin Access</strong>
          <span>Signed in as ${esc(session.user.email || '')}</span>
        </div>
      </section>

      ${callerIdSection}

      <section class="admin-approval-section">
        <div class="admin-section-head">
          <div>
            <h2>Pending Approvals</h2>
            <p>Phone numbers that passed SMS verification and are waiting for an admin.</p>
          </div>
          <span class="admin-count" id="pendingApprovalCount">${pending.length}</span>
        </div>

        <div class="admin-approval-list" id="pendingApprovalList">
          ${pending.length ? pending.map(row => `
            <article class="admin-approval-card" data-user-id="${esc(row.user_id)}">
              <div class="admin-approval-user">
                <div class="admin-approval-avatar">${esc((row.display_name || row.email || 'U').trim().charAt(0).toUpperCase())}</div>
                <div class="admin-approval-copy">
                  <strong>${esc(row.display_name || 'User')}</strong>
                  <span>${esc(row.email || '')}</span>
                </div>
                <span class="admin-pending-badge">Pending</span>
              </div>

              <div class="admin-phone-box">
                <span>Verified phone number</span>
                <strong>${esc(formatPhone(row.phone))}</strong>
                <small>${row.phone_verified_at ? 'SMS verified ' + esc(formatDate(row.phone_verified_at)) : ''}</small>
              </div>

              <div class="admin-approval-actions">
                <button class="admin-reject-btn" type="button" data-admin-action="reject"><i data-lucide="x"></i>Reject</button>
                <button class="admin-approve-btn" type="button" data-admin-action="approve"><i data-lucide="check"></i>Approve</button>
              </div>
            </article>
          `).join('') : `
            <div class="admin-empty">
              <i data-lucide="circle-check-big"></i>
              <strong>No pending approvals</strong>
              <span>Verified phone numbers waiting for approval will appear here.</span>
            </div>`}
        </div>
      </section>
    `;

    const updateCount = () => {
      const remaining = main.querySelectorAll('.admin-approval-card').length;
      const count = document.getElementById('pendingApprovalCount');
      if (count) count.textContent = String(remaining);
      if (!remaining) {
        const list = document.getElementById('pendingApprovalList');
        if (list) list.innerHTML = `
          <div class="admin-empty">
            <i data-lucide="circle-check-big"></i>
            <strong>No pending approvals</strong>
            <span>Verified phone numbers waiting for approval will appear here.</span>
          </div>`;
      }
      window.lucide?.createIcons();
    };

    main.querySelectorAll('[data-admin-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-approval-card');
        const userId = card?.dataset.userId;
        const action = button.dataset.adminAction;
        if (!userId || !['approve','reject'].includes(action)) return;

        const buttons = card.querySelectorAll('button');
        buttons.forEach(item => item.disabled = true);

        const payload = action === 'approve'
          ? {
              phone_approval_status:'approved',
              phone_approved_at:new Date().toISOString(),
              phone_approved_by:session.user.id
            }
          : {
              phone_approval_status:'rejected',
              phone_approved_at:null,
              phone_approved_by:session.user.id
            };

        const { error:updateError } = await c
          .from('callcenter_profiles')
          .update(payload)
          .eq('user_id',userId)
          .eq('phone_approval_status','pending');

        if (updateError) {
          alert(updateError.message || 'Unable to update this approval.');
          buttons.forEach(item => item.disabled = false);
          return;
        }

        card.classList.add('admin-card-removing');
        setTimeout(() => {
          card.remove();
          updateCount();
        },180);
      });
    });

    const normalizeE164 = value => {
      const raw = String(value || '').trim();
      const digits = raw.replace(/\D/g,'');
      if (!digits) return '';
      if (raw.startsWith('+')) return '+' + digits;
      if (digits.length === 10) return '+1' + digits;
      if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
      return '+' + digits;
    };

    document.getElementById('adminAddPhoneForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const number = normalizeE164(document.getElementById('adminPhoneNumber')?.value || '');
      const label = String(document.getElementById('adminPhoneLabel')?.value || '').trim();

      if (!/^\+[1-9]\d{7,14}$/.test(number)) {
        alert('Enter a valid phone number, for example +17025550101.');
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;

      const { error } = await c
        .from('callcenter_phone_numbers')
        .insert({
          phone_number:number,
          label,
          active:true,
          twilio_status:'pending',
          updated_at:new Date().toISOString()
        });

      if (error) {
        submit.disabled = false;
        alert(error.message || 'Unable to add this number.');
        return;
      }

      location.reload();
    });

    main.querySelectorAll('[data-phone-assignment]').forEach(select => {
      select.addEventListener('change', async () => {
        const card = select.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        const userId = select.value || '';
        if (!phoneNumberId) return;

        select.disabled = true;

        try {
          const { error:clearPhoneError } = await c
            .from('callcenter_phone_assignments')
            .delete()
            .eq('phone_number_id',phoneNumberId);
          if (clearPhoneError) throw clearPhoneError;

          if (userId) {
            const { error:clearUserError } = await c
              .from('callcenter_phone_assignments')
              .delete()
              .eq('user_id',userId);
            if (clearUserError) throw clearUserError;

            const { error:insertError } = await c
              .from('callcenter_phone_assignments')
              .insert({
                user_id:userId,
                phone_number_id:phoneNumberId,
                updated_at:new Date().toISOString()
              });
            if (insertError) throw insertError;
          }

          location.reload();
        } catch (error) {
          select.disabled = false;
          alert(error?.message || 'Unable to update this caller ID assignment.');
        }
      });
    });

    main.querySelectorAll('[data-phone-ready]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        const phone = phoneNumbers.find(item => String(item.id) === String(phoneNumberId));
        if (!phone) return;

        const nextStatus = phone.twilio_status === 'ready' ? 'pending' : 'ready';

        if (nextStatus === 'ready' && !confirm('Only mark this number Twilio Ready after it is purchased/verified and usable as an outbound caller ID in Twilio. Continue?')) {
          return;
        }

        button.disabled = true;

        try {
          const { error } = await c
            .from('callcenter_phone_numbers')
            .update({ twilio_status:nextStatus, updated_at:new Date().toISOString() })
            .eq('id',phoneNumberId);

          if (error) throw error;

          // A number submitted by an account is automatically assigned to that
          // account when an admin marks it ready.
          if (nextStatus === 'ready' && phone.requested_by_user_id) {
            const requestedUserId = String(phone.requested_by_user_id);

            const { error:clearUserError } = await c
              .from('callcenter_phone_assignments')
              .delete()
              .eq('user_id',requestedUserId);
            if (clearUserError) throw clearUserError;

            const { error:clearPhoneError } = await c
              .from('callcenter_phone_assignments')
              .delete()
              .eq('phone_number_id',phoneNumberId);
            if (clearPhoneError) throw clearPhoneError;

            const { error:assignError } = await c
              .from('callcenter_phone_assignments')
              .insert({
                user_id:requestedUserId,
                phone_number_id:phoneNumberId,
                updated_at:new Date().toISOString()
              });
            if (assignError) throw assignError;
          }

          location.reload();
        } catch (error) {
          button.disabled = false;
          alert(error?.message || 'Unable to update calling number verification status.');
        }
      });
    });

    main.querySelectorAll('[data-phone-toggle]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        const phone = phoneNumbers.find(item => String(item.id) === String(phoneNumberId));
        if (!phone) return;

        button.disabled = true;
        const { error } = await c
          .from('callcenter_phone_numbers')
          .update({ active:!phone.active, updated_at:new Date().toISOString() })
          .eq('id',phoneNumberId);

        if (error) {
          button.disabled = false;
          alert(error.message || 'Unable to update this number.');
          return;
        }

        location.reload();
      });
    });

    main.querySelectorAll('[data-phone-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        if (!phoneNumberId) return;
        if (!confirm('Remove this outbound phone number from Outreach?')) return;

        button.disabled = true;
        const { error } = await c
          .from('callcenter_phone_numbers')
          .delete()
          .eq('id',phoneNumberId);

        if (error) {
          button.disabled = false;
          alert(error.message || 'Unable to remove this number.');
          return;
        }

        location.reload();
      });
    });

    window.lucide?.createIcons();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const main = document.getElementById('adminSettingsContent');
    if (!main) return;

    const { session, isAdmin } = await getAdminSession();
    if (!session) return;
    if (!isAdmin) {
      denied(main);
      return;
    }

    await loadApprovals(main, session);
  });
})();
