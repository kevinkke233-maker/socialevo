// Account credentials are isolated from game state, research exports and storage.
// Only transient DOM fields and local request variables contain passwords.
const studyAccountRuntime = {
  mode: 'register', busy: false, loginRequired: false, passwordSetupPaused: false, message: '',
  availability: null, availabilityPromise: null, availabilityFailed: false,
  checking: false, reloading: false, reloadDelayed: false, returnTimer: 0,
  returnExpected: null, returnWritten: null, returnFailure: '', returnReady: false, siteAccessRequired: false
};
const STUDY_ACCOUNT_RETURN_KEY = 'socialevo_study_account_return_v1';
const STUDY_ACCOUNT_RETURN_MAX_AGE_MS = 5 * 60 * 1000;

function studyAccountText(zh, en) { return state.language === 'zh' ? zh : en; }
function studyAccountEnabled() { return typeof studyPairRequested === 'function' && studyPairRequested(); }
function studyAccountOwner() {
  return !studyAccountRuntime.loginRequired && typeof studyPairRuntime !== 'undefined' ? studyPairRuntime.pair : null;
}
function studyAccountConfigured() { return studyAccountOwner()?.passwordConfigured === true; }
function studyAccountIsLoginMode() { return studyAccountEnabled() && studyAccountRuntime.mode === 'login' && !studyAccountOwner(); }
function studyAccountAuthenticationPaused() { return studyAccountRuntime.loginRequired || studyAccountRuntime.reloading; }
function studyAccountPasswordSetupPaused() { return studyAccountRuntime.passwordSetupPaused; }
function studyAccountLoopback() { return ['localhost', '127.0.0.1'].includes(window.location.hostname); }
function studyAccountSecurePage() { return window.location.protocol === 'https:' || studyAccountLoopback(); }
function studyAccountCanBegin() {
  return !studyAccountEnabled() || (!studyAccountRuntime.busy && !studyAccountRuntime.checking && !studyAccountRuntime.reloading && (Boolean(studyAccountOwner()) || studyAccountRuntime.availability === true));
}
function studyAccountSetText(node, value) { if (node && node.textContent !== value) node.textContent = value; }
function studyAccountClearPasswords(scope = document) {
  scope.querySelectorAll('[data-study-account-password]').forEach(input => { input.value = ''; });
}
function studyAccountChanged() {
  renderStudyAccountUi();
  if (typeof syncShellBeginButton === 'function') syncShellBeginButton();
}
function studyAccountFailure() {
  return studyAccountText('编号或密码未能验证。请核对输入，或回到原浏览器继续。', 'The code or password could not be verified. Check your entries, or continue in the original browser.');
}
function studyAccountUnavailable() {
  return studyAccountText('账号服务暂不可用，请重试。已有记录会保留。', 'The account service is temporarily unavailable. Retry; existing records are retained.');
}
function studyAccountAccessRequired() {
  return studyAccountText('游戏入口的访问验证已失效，请重新打开入口并输入研究者提供的访问码。已有记录会保留。', 'The game entry verification has expired. Reopen the entry and enter the access code provided by the researcher. Saved records are retained.');
}
function studyAccountFocusFeedback() {
  const status = document.getElementById('study-account-status');
  if (!status?.textContent || state.screen !== 'config') return;
  status.focus({preventScroll: true});
  document.getElementById('study-account-feedback')?.scrollIntoView({block: 'nearest', behavior: 'auto'});
}
function studyAccountProgressCheck(active) {
  studyAccountRuntime.checking = Boolean(active);
  studyAccountChanged();
  if (active) studyAccountFocusFeedback();
}
function studyAccountClearReturnMarker() {
  try { sessionStorage.removeItem(STUDY_ACCOUNT_RETURN_KEY); } catch (_error) {}
}
function studyAccountWriteReturnMarker(marker) {
  try {
    const value = JSON.stringify({pairId: marker.pairId, participantId: marker.participantId, createdAt: marker.createdAt});
    sessionStorage.setItem(STUDY_ACCOUNT_RETURN_KEY, value);
    return sessionStorage.getItem(STUDY_ACCOUNT_RETURN_KEY) === value;
  } catch (_error) { return false; }
}
function studyAccountReadReturnMarker() {
  let value;
  try { value = sessionStorage.getItem(STUDY_ACCOUNT_RETURN_KEY); } catch (_error) { return; }
  if (!value) return;
  try {
    const marker = JSON.parse(value), age = Date.now() - marker.createdAt;
    if (!marker || Object.keys(marker).sort().join(',') !== 'createdAt,pairId,participantId' || typeof marker.pairId !== 'string' || !marker.pairId || marker.pairId.length > 200 ||
        !/^P(?:[1-9]|[1-4][0-9]|50)$/.test(marker.participantId || '') || !Number.isSafeInteger(marker.createdAt) ||
        age < -30000 || age > STUDY_ACCOUNT_RETURN_MAX_AGE_MS) throw new Error('invalid_return_marker');
    studyAccountRuntime.returnExpected = {pairId: marker.pairId, participantId: marker.participantId, createdAt: marker.createdAt};
    studyAccountRuntime.reloading = true;
    studyAccountRuntime.mode = 'login';
  } catch (_error) {
    studyAccountClearReturnMarker();
    studyAccountRuntime.mode = 'login';
    studyAccountRuntime.message = studyAccountText('此前的恢复等待已过期或无法读取。请重新登录；已有云端记录保留。', 'The previous recovery wait has expired or could not be read. Log in again; existing cloud records are retained.');
  }
}
function studyAccountAuthenticatedPair(payload, participantId) {
  const pair = payload?.pair, profile = payload?.profile;
  if (!pair || pair.participantId !== participantId || typeof pair.pairId !== 'string' || !pair.pairId || pair.pairId.length > 200 ||
      pair.protocolVersion !== SocialEvoCore.STUDY_PROTOCOL_VERSION || !['A', 'B'].includes(pair.currentGame) ||
      !['in_progress','completed'].includes(pair.status) || pair.games?.A?.gameLabel !== 'A' || pair.games?.B?.gameLabel !== 'B' || profile?.pairId !== pair.pairId || profile.gameLabel !== pair.currentGame ||
      typeof profile.assignmentId !== 'string' || typeof profile.sessionToken !== 'string' || !Number.isFinite(Number(profile.expiresAt)) || Number(profile.expiresAt) <= Date.now() / 1000) {
    const error = new Error(studyAccountUnavailable()); error.accountSafe = true; throw error;
  }
  try { normalizeServerStudyProfile(payload); } catch (_error) {
    const error = new Error(studyAccountUnavailable()); error.accountSafe = true; throw error;
  }
  return pair;
}
function studyAccountValidateReturn(payload) {
  // Only a marker captured by this new document can guard its initial read.
  // Writing a marker before navigation must not change an older GET callback.
  const expected = studyAccountRuntime.returnExpected;
  if (!expected) return;
  const pair = payload?.pair;
  if (!pair || pair.pairId !== expected.pairId || pair.participantId !== expected.participantId) {
    const error = new Error(pair
      ? studyAccountText('此浏览器的会话与刚才登录的编号不一致，尚未打开任何存档。请换用独立浏览器或联系研究者。', 'This browser session does not match the code just used to log in. No save has been opened. Use a separate browser or contact the researcher.')
      : studyAccountText('登录已验证，但此浏览器没有恢复登录会话。请允许本站保存 Cookie，然后重新加载恢复；也可以返回登录。', 'Sign-in was verified, but this browser did not retain the sign-in session. Allow this site to save cookies, then reload recovery, or return to sign-in.'));
    error.code = pair ? 'account_return_identity_mismatch' : 'account_return_cookie_missing';
    error.accountSafe = true; throw error;
  }
  studyAccountAuthenticatedPair(payload, expected.participantId);
}
function studyAccountReturnComplete(payload) {
  if (!studyAccountRuntime.returnExpected) return;
  studyAccountValidateReturn(payload);
  studyAccountClearReturnMarker();
  studyAccountRuntime.returnExpected = null; studyAccountRuntime.reloading = false; studyAccountRuntime.loginRequired = false;
  studyAccountRuntime.returnFailure = ''; studyAccountRuntime.reloadDelayed = false; studyAccountRuntime.message = '';
  studyAccountRuntime.returnReady = !payload.pair.games[payload.pair.currentGame]?.sessionId && payload.pair.status !== 'completed';
  window.clearTimeout(studyAccountRuntime.returnTimer); studyAccountRuntime.returnTimer = 0;
  if (!payload.pair.games[payload.pair.currentGame]?.sessionId && payload.pair.status !== 'completed' && state.screen === 'menu') showScreen('config');
  studyAccountChanged();
  if (studyAccountRuntime.returnReady) studyAccountFocusFeedback();
}
function studyAccountReturnFailed(error) {
  if (!studyAccountRuntime.returnExpected) return;
  studyAccountRuntime.reloading = true;
  studyAccountRuntime.returnFailure = error?.code || 'account_return_load_failed';
  studyAccountRuntime.reloadDelayed = true;
  studyAccountRuntime.message = error?.accountSafe ? error.message : studyAccountCanReturnToLogin()
    ? studyAccountText('登录会话尚未恢复或已失效。请允许本站保存 Cookie，然后返回登录。已有云端记录保留。', 'The sign-in session was not restored or has expired. Allow this site to save cookies, then return to sign-in. Existing cloud records are retained.')
    : error?.code === 'access_required' ? studyAccountAccessRequired()
    : studyAccountText('登录已验证，但暂未能读取原进度。已有记录保留，请重新加载恢复；不会重新提交密码或开始新局。', 'Sign-in was verified, but saved progress could not be loaded. Records are retained. Reload recovery; your password will not be resubmitted and no new game will start.');
  window.clearTimeout(studyAccountRuntime.returnTimer); studyAccountRuntime.returnTimer = 0;
  showScreen('config'); studyAccountChanged(); studyAccountFocusFeedback();
}
function studyAccountArmReturnTimer() {
  window.clearTimeout(studyAccountRuntime.returnTimer);
  studyAccountRuntime.returnTimer = window.setTimeout(() => {
    if (!studyAccountRuntime.reloading) return;
    studyAccountRuntime.reloadDelayed = true;
    studyAccountChanged(); studyAccountFocusFeedback();
  }, 15000);
}
function studyAccountRetryReturn() {
  if (studyAccountRuntime.busy || studyAccountRuntime.checking || !studyAccountRuntime.reloading && !studyAccountRuntime.siteAccessRequired) return;
  const marker = studyAccountRuntime.returnWritten || studyAccountRuntime.returnExpected;
  if (marker && !studyAccountWriteReturnMarker(marker)) {
    studyAccountRuntime.returnFailure = 'storage_unavailable';
    studyAccountRuntime.reloadDelayed = true;
    studyAccountRuntime.message = studyAccountText('登录已验证，但浏览器不允许保存恢复标记。请允许本站使用会话存储后，再点击重新加载恢复。已有云端记录保留。', 'Sign-in was verified, but the browser cannot save the recovery marker. Allow session storage for this site, then reload recovery. Existing cloud records are retained.');
    studyAccountChanged(); studyAccountFocusFeedback(); return;
  }
  studyAccountRuntime.reloadDelayed = false;
  studyAccountChanged(); studyAccountArmReturnTimer();
  try { if (typeof studyAccountBeforeReload === 'function') studyAccountBeforeReload(); window.location.reload(); }
  catch (_error) {
    studyAccountRuntime.reloadDelayed = true;
    studyAccountRuntime.message = studyAccountText('页面暂未能重新加载。请使用下方按钮重试恢复；无需再次提交密码。', 'The page could not reload. Retry recovery below; there is no need to submit your password again.');
    studyAccountChanged(); studyAccountFocusFeedback();
  }
}
function studyAccountCanReturnToLogin() {
  return Boolean(studyAccountRuntime.returnExpected && ['account_return_cookie_missing','pair_owner_required','account_session_revoked','account_session_replaced','account_session_expired','invalid_study_session'].includes(studyAccountRuntime.returnFailure));
}
function studyAccountBackToLogin() {
  if (!studyAccountCanReturnToLogin()) return;
  studyAccountClearReturnMarker();
  studyAccountRuntime.returnExpected = null; studyAccountRuntime.reloading = false; studyAccountRuntime.reloadDelayed = false;
  studyAccountRuntime.returnFailure = ''; studyAccountRuntime.loginRequired = true;
  studyAccountRuntime.message = studyAccountText('请确认允许本站保存 Cookie，然后重新登录。已有记录保留。', 'Allow this site to save cookies, then log in again. Saved records are retained.');
  window.clearTimeout(studyAccountRuntime.returnTimer); studyAccountRuntime.returnTimer = 0;
  studyAccountChanged(); studyAccountFocusFeedback();
}

async function studyAccountAvailability(force = false) {
  if (!studyAccountEnabled()) return false;
  if (studyAccountRuntime.availabilityPromise) return studyAccountRuntime.availabilityPromise;
  if (!force && studyAccountRuntime.availability !== null) return studyAccountRuntime.availability;
  studyAccountRuntime.availability = null;
  studyAccountRuntime.availabilityFailed = false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  const pending = (async () => {
    await Promise.resolve();
    try {
      if (!studyAccountSecurePage()) throw new Error('secure_account_transport_required');
      const response = await fetch('/api/study/account/status', {credentials: 'same-origin', cache: 'no-store', signal: controller.signal});
      const payload = await response.json();
      if ([401, 403].includes(response.status) && payload?.error?.code === 'access_required') {
        studyAccountRuntime.siteAccessRequired = true;
        studyAccountRuntime.message = studyAccountAccessRequired();
      }
      const transport = payload.transport === 'lambda-url-https' || (studyAccountLoopback() && payload.transport === 'local-test');
      studyAccountRuntime.availability = response.ok && payload.ok === true && payload.enabled === true && payload.version === 'study-account-v1' && transport;
      studyAccountRuntime.availabilityFailed = !studyAccountRuntime.availability;
    } catch (_error) {
      studyAccountRuntime.availability = false;
      studyAccountRuntime.availabilityFailed = true;
    } finally {
      window.clearTimeout(timer);
      studyAccountRuntime.availabilityPromise = null;
      studyAccountChanged();
    }
    return studyAccountRuntime.availability;
  })();
  studyAccountRuntime.availabilityPromise = pending;
  studyAccountChanged();
  return pending;
}

// x-amz-content-sha256 signs the exact JSON payload bytes for the AWS origin.
// It is a request-integrity digest, not the server's password-storage hash.
async function studyAccountRequest(path, body) {
  let bodyJson = '', bytes;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    if (!studyAccountSecurePage() || studyAccountRuntime.availability !== true || !window.crypto?.subtle) throw new Error('account_unavailable');
    bodyJson = JSON.stringify(body);
    bytes = new TextEncoder().encode(bodyJson);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: {'Content-Type': 'application/json', 'x-amz-content-sha256': sha256}, body: bodyJson
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      const accessRequired = [401, 403].includes(response.status) && payload?.error?.code === 'access_required';
      const message = response.status === 429 ? studyAccountText('尝试过于频繁，请稍后再试。', 'Too many attempts. Please try again later.')
        : payload?.error?.code === 'participant_capacity_pending' ? studyAccountText('这个编号尚未开放，请稍后再试或联系研究者。', 'This code is not available yet. Please try again later or contact the researcher.')
        : accessRequired ? studyAccountAccessRequired() : response.status >= 500 || response.ok ? studyAccountUnavailable() : studyAccountFailure();
      const error = new Error(message);
      error.accountSafe = true;
      error.accountAccessRequired = accessRequired;
      // This code is returned only after the server verifies the current owner.
      error.accountAlreadyConfigured = path === '/api/study/account/password' && response.status === 409 && payload?.error?.code === 'password_already_configured';
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.accountSafe) throw error;
    const safe = new Error(studyAccountUnavailable());
    safe.accountSafe = true;
    throw safe;
  } finally {
    window.clearTimeout(timer);
    bodyJson = '';
    if (bytes) bytes.fill(0);
    for (const key of ['password', 'passwordConfirm']) if (Object.prototype.hasOwnProperty.call(body, key)) body[key] = '';
    studyAccountClearPasswords();
  }
}

function studyAccountValidate(password, confirmation, needsConfirmation) {
  const length = Array.from(password).length;
  if (length < 12 || length > 128 || new TextEncoder().encode(password).byteLength > 512) {
    return studyAccountText('密码需要 12–128 个字符。空格也算字符，请原样记住。', 'Use 12–128 characters. Spaces count; keep the password exactly as entered.');
  }
  if (needsConfirmation && password !== confirmation) return studyAccountText('两次输入的密码不一致，请重新输入。', 'The two passwords do not match. Please enter them again.');
  return '';
}
function studyAccountSetMode(mode) {
  const next = mode === 'login' ? 'login' : 'register';
  if (studyAccountRuntime.busy || studyAccountRuntime.reloading || studyAccountRuntime.checking || studyAccountOwner() || studyAccountRuntime.mode === next || (studyAccountRuntime.loginRequired && mode !== 'login')) return;
  studyAccountRuntime.mode = next;
  studyAccountRuntime.message = '';
  studyAccountRuntime.siteAccessRequired = false;
  studyAccountRuntime.returnReady = false;
  studyAccountClearPasswords();
  studyAccountChanged();
}
function studyAccountReload(payload, participantId) {
  const pair = studyAccountAuthenticatedPair(payload, participantId);
  const marker = {pairId: pair.pairId, participantId: pair.participantId, createdAt: Date.now()};
  studyAccountRuntime.returnWritten = marker;
  studyAccountRuntime.reloading = true; studyAccountRuntime.returnFailure = '';
  studyAccountRuntime.message = '';
  studyAccountClearPasswords();
  const passwordDialog = document.getElementById('study-account-password-dialog');
  if (passwordDialog?.open) passwordDialog.close();
  if (!studyAccountWriteReturnMarker(marker)) {
    studyAccountRuntime.returnFailure = 'storage_unavailable'; studyAccountRuntime.reloadDelayed = true;
    studyAccountRuntime.message = studyAccountText('登录已验证，但浏览器不允许保存恢复标记。请允许本站使用会话存储后，再点击重新加载恢复。已有云端记录保留。', 'Sign-in was verified, but the browser cannot save the recovery marker. Allow session storage for this site, then reload recovery. Existing cloud records are retained.');
    studyAccountChanged(); studyAccountFocusFeedback(); return;
  }
  studyAccountChanged(); studyAccountFocusFeedback(); studyAccountArmReturnTimer();
  try { if (typeof studyAccountBeforeReload === 'function') studyAccountBeforeReload(); window.location.reload(); }
  catch (_error) {
    studyAccountRuntime.reloadDelayed = true;
    studyAccountRuntime.message = studyAccountText('登录已验证，但页面暂未能重新加载。请重试恢复；无需再次提交密码。', 'Sign-in was verified, but the page could not reload. Retry recovery; there is no need to submit your password again.');
    studyAccountChanged(); studyAccountFocusFeedback();
  }
}
async function studyAccountAuthenticate(participantId) {
  if (studyAccountRuntime.busy || studyAccountRuntime.reloading || studyAccountRuntime.checking) return false;
  const mode = studyAccountRuntime.mode;
  const password = document.getElementById('study-account-password')?.value || '';
  const passwordConfirm = document.getElementById('study-account-confirm')?.value || '';
  studyAccountRuntime.message = '';
  studyAccountRuntime.siteAccessRequired = false;
  if (!/^P(?:[1-9]|[1-4][0-9]|50)$/.test(participantId)) {
    studyAccountRuntime.message = studyAccountText('请输入研究者分配的 P1–P50 编号。', 'Enter the P1–P50 code assigned by the researcher.');
  } else if (mode === 'register') {
    studyAccountRuntime.message = studyAccountValidate(password, passwordConfirm, true);
  } else if (!password) {
    studyAccountRuntime.message = studyAccountText('请输入恢复密码。', 'Enter your recovery password.');
  }
  if (studyAccountRuntime.message) { studyAccountClearPasswords(); studyAccountChanged(); studyAccountFocusFeedback(); return false; }
  studyAccountRuntime.busy = true;
  studyAccountChanged();
  try {
    if (!await studyAccountAvailability()) throw new Error(studyAccountUnavailable());
    const body = mode === 'register' ? {participantId, password, passwordConfirm} : {participantId, password};
    const payload = await studyAccountRequest('/api/study/account/' + (mode === 'register' ? 'register' : 'login'), body);
    if (mode === 'login') { studyAccountReload(payload, participantId); return false; }
    if (!payload.pair || payload.pair.participantId !== participantId || !payload.profile) throw new Error(studyAccountFailure());
    studyPairAccept(payload, false);
    return true;
  } catch (error) {
    studyAccountRuntime.message = error.accountSafe ? error.message : studyAccountUnavailable();
    studyAccountRuntime.siteAccessRequired = error.accountAccessRequired === true;
    return false;
  } finally {
    studyAccountClearPasswords();
    studyAccountRuntime.busy = false;
    studyAccountChanged();
    studyAccountFocusFeedback();
  }
}
async function studyAccountBeforeBegin(participantId) {
  if (studyAccountRuntime.reloading || studyAccountRuntime.checking) return false;
  if (!studyAccountEnabled() || studyAccountOwner()) return true;
  return studyAccountAuthenticate(participantId);
}
async function studyAccountSubmitFromSetup() {
  if (studyAccountRuntime.busy || studyAccountRuntime.reloading || studyAccountRuntime.checking) return false;
  const button = document.getElementById('begin-game-btn');
  if (button && !button.disabled) button.click();
  return false;
}

function studyAccountPasswordField(id, autocomplete) {
  const row = document.createElement('div'); row.className = 'study-account-field';
  const label = document.createElement('label'); label.htmlFor = id;
  const input = document.createElement('input'); input.type = 'password'; input.id = id;
  input.autocomplete = autocomplete; input.required = true; input.dataset.studyAccountPassword = 'true';
  input.setAttribute('aria-describedby', 'study-account-policy');
  row.append(label, input); return row;
}
function studyAccountProtectKeyboard(scope) {
  scope.addEventListener('keydown', event => {
    if (event.key === 'Tab' && scope.tagName === 'DIALOG') {
      const nodes = [...scope.querySelectorAll('input:not([disabled]),button:not([disabled])')].filter(node => !node.hidden && node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    event.stopPropagation();
  });
  for (const name of ['keyup', 'click']) scope.addEventListener(name, event => event.stopPropagation());
}
function initializeStudyAccountUi() {
  if (!studyAccountEnabled() || document.getElementById('study-account-setup')) return;
  const field = document.getElementById('participant-id')?.closest('.participant-field');
  if (!field) return;
  const setup = document.createElement('section'); setup.id = 'study-account-setup'; setup.className = 'study-account-setup';
  const modes = document.createElement('div'); modes.className = 'study-account-modes'; modes.setAttribute('role', 'group');
  for (const mode of ['register', 'login']) {
    const button = document.createElement('button'); button.type = 'button'; button.id = 'study-account-mode-' + mode;
    button.onclick = () => studyAccountSetMode(mode); modes.append(button);
  }
  const form = document.createElement('form'); form.id = 'study-account-form'; form.noValidate = true;
  const password = studyAccountPasswordField('study-account-password', 'new-password');
  const confirm = studyAccountPasswordField('study-account-confirm', 'new-password');
  const policy = document.createElement('p'); policy.id = 'study-account-policy'; policy.className = 'setup-id-hint';
  const hint = document.createElement('p'); hint.id = 'study-account-mode-hint'; hint.className = 'setup-id-hint';
  const status = document.createElement('p'); status.id = 'study-account-status'; status.tabIndex = -1; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const retry = document.createElement('button'); retry.type = 'button'; retry.id = 'study-account-retry'; retry.className = 'secondary-btn'; retry.onclick = () => studyAccountAvailability(true);
  const owner = document.createElement('p'); owner.id = 'study-account-owner-note';
  const setupManage = document.createElement('button'); setupManage.type = 'button'; setupManage.id = 'study-account-setup-password'; setupManage.className = 'secondary-btn'; setupManage.onclick = openStudyAccountPasswordDialog;
  form.append(password, confirm, policy, hint);
  form.onsubmit = event => { event.preventDefault(); void studyAccountSubmitFromSetup(); };
  form.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); void studyAccountSubmitFromSetup(); } });
  studyAccountProtectKeyboard(form);
  setup.append(modes, form, owner, setupManage); field.after(setup);
  const feedback = document.createElement('section'); feedback.id = 'study-account-feedback'; feedback.className = 'study-account-feedback';
  const reload = document.createElement('button'); reload.type = 'button'; reload.id = 'study-account-return-retry'; reload.className = 'secondary-btn'; reload.onclick = studyAccountRetryReturn;
  const back = document.createElement('button'); back.type = 'button'; back.id = 'study-account-return-login'; back.className = 'secondary-btn'; back.onclick = studyAccountBackToLogin;
  feedback.append(status, retry, reload, back); document.getElementById('begin-game-btn')?.before(feedback);
  ensureStudyAccountPasswordDialog();
  const body = document.querySelector('#study-pair-game-card .cloud-save-card-body');
  if (body && !document.getElementById('study-account-cloud-password')) {
    const button = document.createElement('button'); button.type = 'button'; button.id = 'study-account-cloud-password'; button.className = 'study-account-cloud-password'; button.onclick = openStudyAccountPasswordDialog;
    body.append(button);
  }
  for (const [hostId, id] of [['study-pair-summary-controls', 'study-account-summary-password'], ['study-complete-message', 'study-account-complete-password']]) {
    const host = document.getElementById(hostId);
    if (host && !document.getElementById(id)) {
      const button = document.createElement('button'); button.type = 'button'; button.id = id; button.className = 'secondary-btn study-account-extra-password'; button.onclick = openStudyAccountPasswordDialog;
      if (hostId === 'study-complete-message') host.after(button); else host.append(button);
    }
  }
}
function renderStudyAccountUi() {
  if (!studyAccountEnabled()) return;
  initializeStudyAccountUi();
  const setup = document.getElementById('study-account-setup'); if (!setup) return;
  const owner = studyAccountOwner(), configured = studyAccountConfigured();
  const busy = studyAccountRuntime.busy || studyAccountRuntime.checking || studyAccountRuntime.reloading;
  const login = studyAccountRuntime.mode === 'login';
  const form = document.getElementById('study-account-form'), modes = setup.querySelector('.study-account-modes');
  form.hidden = Boolean(owner); modes.hidden = Boolean(owner);
  modes.setAttribute('aria-label', studyAccountText('编号使用方式', 'How to use your code'));
  for (const mode of ['register', 'login']) {
    const button = document.getElementById('study-account-mode-' + mode);
    studyAccountSetText(button, mode === 'register' ? studyAccountText('首次使用', 'First use') : studyAccountText('已有编号登录', 'Log in with a code'));
    button.setAttribute('aria-pressed', String(studyAccountRuntime.mode === mode)); button.disabled = busy || (studyAccountRuntime.loginRequired && mode !== 'login');
  }
  const password = document.getElementById('study-account-password'), confirm = document.getElementById('study-account-confirm');
  password.autocomplete = login ? 'current-password' : 'new-password';
  studyAccountSetText(password.previousElementSibling, login ? studyAccountText('恢复密码', 'Recovery password') : studyAccountText('设置恢复密码', 'Set a recovery password'));
  studyAccountSetText(confirm.previousElementSibling, studyAccountText('确认密码', 'Confirm password'));
  confirm.parentElement.hidden = login;
  for (const input of form.querySelectorAll('input')) input.disabled = busy || studyAccountRuntime.availability !== true || Boolean(owner);
  studyAccountSetText(document.getElementById('study-account-policy'), studyAccountText('密码为 12–128 个字符，不限组合，用于在其他设备恢复这个编号的进度。', 'Use 12–128 characters, with no required character combinations, to restore this code’s progress on another device.'));
  studyAccountSetText(document.getElementById('study-account-mode-hint'), login ? studyAccountText('登录后继续这个编号原有的游戏。若从未设过密码，请回到原浏览器设置，或联系研究者。', 'Log in to continue this code’s existing games. If you have never set a password, use the original browser to set one, or contact the researcher.') : studyAccountText('使用研究者分配的编号。设好密码后，可在其他设备登录并恢复进度。', 'Use the code assigned by the researcher. After setting a password, you can log in on another device to restore progress.'));
  const ownerNote = document.getElementById('study-account-owner-note'); ownerNote.hidden = !owner;
  studyAccountSetText(ownerNote, configured ? studyAccountText('跨设备恢复密码已设置；此浏览器会继续自动恢复。', 'A cross-device recovery password is set. This browser continues to restore automatically.') : studyAccountText('此浏览器可继续自动恢复。可补设密码，以便在其他设备继续。', 'This browser can restore automatically. Set a password if you want to continue on another device.'));
  const message = studyAccountRuntime.message || (studyAccountRuntime.reloading
    ? studyAccountRuntime.reloadDelayed ? studyAccountText('登录已验证，恢复页面仍在加载。可以点击下方按钮重新加载恢复；不会再次提交密码。', 'Sign-in was verified, but the recovery page is still loading. Reload recovery below; your password will not be submitted again.')
      : studyAccountText('登录已验证，正在恢复原进度，请稍候…', 'Sign-in was verified. Restoring your saved progress. Please wait…')
    : studyAccountRuntime.checking ? studyAccountText('正在读取此浏览器的登录与存档状态，请稍候…', 'Checking this browser’s sign-in and saved progress. Please wait…')
    : studyAccountRuntime.busy ? studyAccountText('正在验证，请稍候…', 'Verifying. Please wait…')
    : studyAccountRuntime.returnReady && owner && !owner.games?.[owner.currentGame]?.sessionId ? studyAccountText('登录成功。请点击“进入实验室”继续。', 'Sign-in succeeded. Click Enter the lab to continue.')
    : studyAccountRuntime.availabilityFailed ? studyAccountUnavailable() : studyAccountRuntime.availability === null ? studyAccountText('正在连接账号服务…', 'Connecting to the account service…') : '');
  studyAccountSetText(document.getElementById('study-account-status'), message);
  document.getElementById('study-account-feedback')?.classList.toggle('has-error', Boolean(studyAccountRuntime.message || studyAccountRuntime.availabilityFailed));
  const retry = document.getElementById('study-account-retry'); retry.hidden = !studyAccountRuntime.availabilityFailed; retry.disabled = busy;
  studyAccountSetText(retry, studyAccountText('重试连接账号服务', 'Retry the account service'));
  const reload = document.getElementById('study-account-return-retry');
  reload.hidden = !(studyAccountRuntime.reloading && studyAccountRuntime.reloadDelayed || studyAccountRuntime.siteAccessRequired);
  reload.disabled = studyAccountRuntime.busy || studyAccountRuntime.checking;
  studyAccountSetText(reload, studyAccountRuntime.siteAccessRequired ? studyAccountText('重新打开游戏入口', 'Reopen the game entry') : studyAccountText('重新加载恢复', 'Reload recovery'));
  const back = document.getElementById('study-account-return-login');
  back.hidden = !studyAccountCanReturnToLogin(); back.disabled = busy && !studyAccountRuntime.reloading;
  studyAccountSetText(back, studyAccountText('返回登录', 'Return to sign-in'));
  document.getElementById('study-account-feedback').hidden = !message && retry.hidden && reload.hidden && back.hidden;
  const setupManage = document.getElementById('study-account-setup-password'); setupManage.hidden = !owner || configured; setupManage.disabled = busy || studyAccountRuntime.availability !== true;
  studyAccountSetText(setupManage, studyAccountText('设置跨设备恢复密码', 'Set a cross-device recovery password'));
  for (const id of ['study-account-cloud-password', 'study-account-summary-password', 'study-account-complete-password']) {
    const manage = document.getElementById(id);
    if (manage) { manage.hidden = !owner; manage.disabled = configured || busy || studyAccountRuntime.availability !== true; studyAccountSetText(manage, configured ? studyAccountText('跨设备恢复密码已设置', 'Cross-device recovery password is set') : studyAccountText('设置跨设备恢复密码', 'Set a cross-device recovery password')); }
  }
  if (!owner) {
    const pid = document.getElementById('participant-id'); if (pid) { pid.disabled = false; pid.readOnly = busy; }
  }
  const button = document.getElementById('begin-game-btn');
  if (button) studyAccountSetText(button, studyAccountRuntime.reloading ? studyAccountText('正在恢复…', 'Restoring…')
    : studyAccountRuntime.checking ? studyAccountText('正在读取…', 'Checking…') : busy ? studyAccountText('正在验证…', 'Verifying…') : owner ? (typeof t === 'function' ? t('shellEnterLab') : studyAccountText('进入实验室', 'Enter the lab')) : login ? studyAccountText('登录并恢复', 'Log in and restore') : studyAccountText('设置密码并进入', 'Set password and enter'));
  const dialog = document.getElementById('study-account-password-dialog'); if (dialog?.open) renderStudyAccountPasswordDialog();
}

function ensureStudyAccountPasswordDialog() {
  let dialog = document.getElementById('study-account-password-dialog'); if (dialog) return dialog;
  dialog = document.createElement('dialog'); dialog.id = 'study-account-password-dialog'; dialog.className = 'project-info-dialog study-account-password-dialog';
  dialog.setAttribute('aria-labelledby', 'study-account-password-title');
  const form = document.createElement('form'); form.noValidate = true;
  const title = document.createElement('h2'); title.id = 'study-account-password-title';
  const note = document.createElement('p'); note.id = 'study-account-password-note';
  const password = studyAccountPasswordField('study-account-owner-password', 'new-password');
  const confirm = studyAccountPasswordField('study-account-owner-confirm', 'new-password');
  for (const row of [password, confirm]) row.querySelector('input').setAttribute('aria-describedby', 'study-account-password-note');
  const status = document.createElement('p'); status.id = 'study-account-password-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'study-account-dialog-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.id = 'study-account-password-cancel'; cancel.className = 'secondary-btn'; cancel.onclick = closeStudyAccountPasswordDialog;
  const submit = document.createElement('button'); submit.type = 'submit'; submit.id = 'study-account-password-save'; submit.className = 'primary-btn';
  actions.append(cancel, submit); form.append(title, note, password, confirm, status, actions); dialog.append(form); document.body.append(dialog);
  form.onsubmit = event => { event.preventDefault(); void studyAccountSetOwnerPassword(); };
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!studyAccountRuntime.busy) closeStudyAccountPasswordDialog(); });
  dialog.addEventListener('close', () => studyAccountClearPasswords(dialog)); studyAccountProtectKeyboard(dialog);
  return dialog;
}
function renderStudyAccountPasswordDialog() {
  const dialog = ensureStudyAccountPasswordDialog(), configured = studyAccountConfigured(), busy = studyAccountRuntime.busy || studyAccountRuntime.reloading;
  studyAccountSetText(document.getElementById('study-account-password-title'), studyAccountText('设置跨设备恢复密码', 'Set a cross-device recovery password'));
  studyAccountSetText(document.getElementById('study-account-password-note'), studyAccountText('为当前编号设置 12–128 个字符的密码。以后可在其他设备用编号和密码恢复原进度。', 'Set a password of 12–128 characters for this code. Use the code and password on another device to restore the same progress.'));
  for (const [id, zh, en] of [['study-account-owner-password', '新密码', 'New password'], ['study-account-owner-confirm', '确认密码', 'Confirm password']]) {
    const input = document.getElementById(id); studyAccountSetText(input.previousElementSibling, studyAccountText(zh, en)); input.disabled = busy || configured || !studyAccountOwner();
  }
  studyAccountSetText(document.getElementById('study-account-password-status'), configured ? studyAccountText('恢复密码已设置。', 'A recovery password is already set.') : studyAccountRuntime.message);
  const cancel = document.getElementById('study-account-password-cancel'), submit = document.getElementById('study-account-password-save');
  studyAccountSetText(cancel, studyAccountText('取消', 'Cancel')); cancel.disabled = busy;
  studyAccountSetText(submit, busy ? studyAccountText('正在设置…', 'Setting password…') : studyAccountText('设置密码', 'Set password'));
  submit.disabled = busy || configured || !studyAccountOwner() || studyAccountRuntime.availability !== true;
}
function openStudyAccountPasswordDialog() {
  if (!studyAccountOwner() || studyAccountConfigured() || studyAccountRuntime.busy || studyAccountRuntime.reloading || studyAccountRuntime.checking || studyAccountRuntime.availability !== true) return false;
  studyAccountRuntime.message = ''; studyAccountClearPasswords();
  const dialog = ensureStudyAccountPasswordDialog(); renderStudyAccountPasswordDialog();
  if (typeof stopPlayerNavigation === 'function') stopPlayerNavigation('account_password_prompt');
  if (!dialog.open) dialog.showModal(); document.getElementById('study-account-owner-password').focus(); return true;
}
function closeStudyAccountPasswordDialog() {
  if (studyAccountRuntime.busy || studyAccountRuntime.reloading || studyAccountRuntime.checking) return;
  const dialog = document.getElementById('study-account-password-dialog'); studyAccountClearPasswords(); studyAccountRuntime.message = '';
  if (dialog?.open) dialog.close(); studyAccountChanged();
}
async function studyAccountSetOwnerPassword() {
  if (studyAccountRuntime.busy || studyAccountRuntime.reloading || studyAccountRuntime.checking || !studyAccountOwner() || studyAccountConfigured()) return false;
  const participantId = studyAccountOwner().participantId;
  const password = document.getElementById('study-account-owner-password').value;
  const passwordConfirm = document.getElementById('study-account-owner-confirm').value;
  studyAccountRuntime.message = studyAccountValidate(password, passwordConfirm, true);
  if (studyAccountRuntime.message) { studyAccountClearPasswords(); renderStudyAccountPasswordDialog(); return false; }
  const previousPause = studyAccountRuntime.passwordSetupPaused;
  studyAccountRuntime.passwordSetupPaused = true;
  studyAccountRuntime.busy = true; studyAccountChanged();
  try {
    let ready = false;
    try { ready = typeof studyAccountBeforePasswordSetup === 'function' && await studyAccountBeforePasswordSetup() === true; } catch (_error) {}
    if (!ready) {
      studyAccountRuntime.message = studyAccountText('请先完成当前交流并确认云端保存，再设置密码。', 'Finish the current exchange and confirm the cloud save before setting a password.');
      return false;
    }
    const payload = await studyAccountRequest('/api/study/account/password', {password, passwordConfirm});
    studyAccountReload(payload, participantId); return true;
  } catch (error) {
    if (error.accountAlreadyConfigured && studyAccountOwner()) {
      studyAccountOwner().passwordConfigured = true;
      studyAccountRuntime.message = studyAccountText('恢复密码已设置。', 'A recovery password is already set.');
    } else studyAccountRuntime.message = error.accountSafe ? error.message : studyAccountUnavailable();
    return false;
  } finally { studyAccountClearPasswords(); studyAccountRuntime.passwordSetupPaused = previousPause; studyAccountRuntime.busy = false; studyAccountChanged(); }
}
function showAccountLoginRequired() {
  if (!studyAccountEnabled() || studyAccountRuntime.loginRequired) return;
  studyAccountRuntime.loginRequired = true; studyAccountRuntime.mode = 'login';
  studyAccountRuntime.returnReady = false;
  if (typeof abortAllActiveRequests === 'function') abortAllActiveRequests('account_login_required');
  if (typeof stopVoiceModality === 'function') stopVoiceModality();
  studyAccountRuntime.message = studyAccountText('此页面需要重新登录。已有记录保留，请用编号和恢复密码登录。', 'This page needs you to log in again. Saved records are retained; enter your code and recovery password.');
  studyAccountClearPasswords();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  if (typeof stopPlayerNavigation === 'function') stopPlayerNavigation('account_login_required');
  if (typeof showScreen === 'function') showScreen('config');
  studyAccountChanged(); document.getElementById('study-account-password')?.focus();
}
if (studyAccountEnabled()) studyAccountReadReturnMarker();
initializeStudyAccountUi();
if (studyAccountRuntime.returnExpected) {
  const pid = document.getElementById('participant-id'); if (pid) pid.value = studyAccountRuntime.returnExpected.participantId;
  showScreen('config'); studyAccountChanged(); studyAccountArmReturnTimer();
}
if (studyAccountEnabled()) void studyAccountAvailability();
