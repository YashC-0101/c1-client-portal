/**
 * c1-client-portal shared client lib.
 *
 * Same shape as the Stato portal's lib.js, pointed at this repo:
 *   1. Page-level password gate (SHA-256 of typed password compared to a hash)
 *   2. AES-GCM encryption of answers using the password as the key
 *   3. GitHub Contents API read/write of answers.json in this same repo
 *
 * The password serves all three purposes, so it is entered ONCE per browser.
 * localStorage remembers a "verified" flag for 7 days; the password itself
 * lives in sessionStorage only (cleared when the tab closes).
 *
 * Security model:
 *   - Anyone visiting a gated page hits the password screen first.
 *   - The password is never stored in the page — only its SHA-256 hash.
 *   - Answers are AES-GCM encrypted before being written to the repo, so
 *     fetching answers.json directly shows gibberish.
 *   - The PAT in CONFIG.token (once set) is fine-grained: Contents write on
 *     this one repo. Worst case if leaked: vandalism, revert + rotate.
 */

const CONFIG = {
  // GitHub repo where answers.json lives (this same repo).
  repo: 'YashC-0101/c1-client-portal',
  branch: 'main',
  file: 'answers.json',

  // ⚠️ REPLACE with a fine-grained Personal Access Token to turn on saving.
  // https://github.com/settings/personal-access-tokens/new
  //   - Repository access: Only `c1-client-portal`
  //   - Permissions → Repository → Contents → Read and write
  // Until this is set, the questions page still works: answers are kept in the
  // browser and Sam/Dan send them back with the Copy button.
  token: 'PASTE_GITHUB_FINE_GRAINED_TOKEN_HERE',

  // SHA-256 hex of the access password. Default password is "c12026".
  // To change it:
  //   printf "%s" "your-new-password" | shasum -a 256
  passwordHash: 'bc1e7f980aa883349b667c80729cd1de78954da9e057e560075a0ad3b364dbcc',

  // localStorage TTL for the "verified" flag. After this, re-enter the code.
  rememberMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function tokenConfigured() {
  return Boolean(CONFIG.token) && !CONFIG.token.startsWith('PASTE_');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return bytesToHex(new Uint8Array(buf));
}

// PBKDF2 → AES-GCM. The salt is per-write, so the same password produces
// different ciphertext every time.
async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200_000 },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptJson(password, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(obj)),
  );
  return {
    v: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };
}

async function decryptJson(password, blob) {
  const salt = base64ToBytes(blob.salt);
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ct);
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(pt));
}

// ─── Password gate ──────────────────────────────────────────────────────────

const VERIFIED_KEY = 'c1-portal-verified-v1';
const PASSWORD_KEY = 'c1-portal-password-v1';

function isVerified() {
  try {
    const v = JSON.parse(localStorage.getItem(VERIFIED_KEY) || 'null');
    if (!v || !v.expiresAt) return false;
    return Date.now() < v.expiresAt;
  } catch {
    return false;
  }
}

function getStoredPassword() {
  try {
    return sessionStorage.getItem(PASSWORD_KEY);
  } catch {
    return null;
  }
}

function setVerified(password) {
  try {
    localStorage.setItem(VERIFIED_KEY, JSON.stringify({ expiresAt: Date.now() + CONFIG.rememberMs }));
    sessionStorage.setItem(PASSWORD_KEY, password);
  } catch {
    /* private window — the gate just asks again next time */
  }
}

function clearVerified() {
  try {
    localStorage.removeItem(VERIFIED_KEY);
    sessionStorage.removeItem(PASSWORD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Build and inject the password gate. Calls onUnlock(password) when the typed
 * password matches CONFIG.passwordHash. If the browser is already verified and
 * still holds the session password, onUnlock fires immediately.
 */
function mountPasswordGate(onUnlock) {
  if (isVerified() && getStoredPassword()) {
    onUnlock(getStoredPassword());
    return;
  }

  const wrap = document.createElement('div');
  wrap.id = 'c1-gate';
  wrap.innerHTML = `
    <style>
      #c1-gate {
        position: fixed; inset: 0;
        background: rgba(6, 47, 40, 0.97);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; padding: 20px;
        font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #c1-gate .gate-card {
        background: #fff; border-radius: 18px; padding: 36px 32px;
        max-width: 380px; width: 100%;
        box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.6);
        text-align: center; color: #0d221d;
      }
      #c1-gate .lock-ic {
        width: 56px; height: 56px; margin: 0 auto 18px;
        background: #eef9e2; border-radius: 16px;
        display: flex; align-items: center; justify-content: center;
        font-size: 26px;
      }
      #c1-gate h2 { margin: 0 0 6px 0; font-size: 19px; font-weight: 600; letter-spacing: -0.015em; }
      #c1-gate p { margin: 0 0 22px 0; color: #4e615a; font-size: 14px; line-height: 1.5; }
      #c1-gate input[type="password"] {
        width: 100%; padding: 12px 14px;
        border: 1px solid #dde3dc; border-radius: 12px;
        font: inherit; font-size: 15px; text-align: center;
        outline: none; letter-spacing: 0.05em;
        transition: border-color 120ms ease, box-shadow 120ms ease;
      }
      #c1-gate input[type="password"]:focus {
        border-color: #66b534; box-shadow: 0 0 0 3px rgba(102, 181, 52, 0.22);
      }
      #c1-gate button {
        width: 100%; margin-top: 12px;
        padding: 12px; border-radius: 12px; border: none;
        background: #062f28; color: #fff;
        font: inherit; font-size: 15px; font-weight: 600;
        cursor: pointer; transition: background 120ms ease;
      }
      #c1-gate button:hover { background: #0a4136; }
      #c1-gate button:disabled { background: #9fb0a9; cursor: progress; }
      #c1-gate .err { color: #dc2626; font-size: 13px; margin-top: 12px; min-height: 18px; }
      #c1-gate .footer {
        margin-top: 22px; font-size: 12px; color: #7d8d86;
        border-top: 1px solid #dde3dc; padding-top: 14px;
      }
    </style>
    <div class="gate-card">
      <div class="lock-ic">🔒</div>
      <h2>Access required</h2>
      <p>Enter the access code to continue.<br/>If you don't have one, give the Octogle Team a ring.</p>
      <form id="gate-form">
        <input type="password" id="gate-input" placeholder="Access code" autocomplete="off" autofocus />
        <button type="submit" id="gate-btn">Continue</button>
        <div class="err" id="gate-err"></div>
      </form>
      <div class="footer">C1 Clearance · Lead Centre</div>
    </div>
  `;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';

  const form = wrap.querySelector('#gate-form');
  const input = wrap.querySelector('#gate-input');
  const btn = wrap.querySelector('#gate-btn');
  const err = wrap.querySelector('#gate-err');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const typed = input.value.trim();
      const hash = await sha256Hex(typed);
      if (hash !== CONFIG.passwordHash) {
        err.textContent = 'Wrong code — please try again.';
        input.value = '';
        input.focus();
        return;
      }
      setVerified(typed);
      wrap.remove();
      document.body.style.overflow = '';
      onUnlock(typed);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Continue';
    }
  });
}

// ─── GitHub Contents API ────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';

async function fetchFile(path) {
  const url = `${GITHUB_API}/repos/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (res.status === 404) return { sha: null, blob: null };
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  const data = await res.json();
  const jsonText = dec.decode(base64ToBytes(data.content.replace(/\n/g, '')));
  return { sha: data.sha, blob: JSON.parse(jsonText) };
}

async function writeFile(path, blob, prevSha, commitMessage) {
  if (!tokenConfigured()) {
    throw new Error('GitHub token not configured. Edit lib.js → CONFIG.token to turn saving on.');
  }
  const url = `${GITHUB_API}/repos/${CONFIG.repo}/contents/${path}`;
  const content = bytesToBase64(enc.encode(JSON.stringify(blob, null, 2)));
  const body = {
    message: commitMessage || (prevSha ? `Update ${path}` : `Create ${path}`),
    content,
    branch: CONFIG.branch,
  };
  if (prevSha) body.sha = prevSha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${CONFIG.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GitHub write failed: ${res.status} — ${detail}`);
  }
  return res.json();
}

// ─── High-level: the go-live answers ────────────────────────────────────────

/**
 * Write the whole answer set. `answers` is { questionId: text }, `who` is the
 * name typed at the top of the page. The file is overwritten each time, so the
 * repo history is the version history.
 */
async function saveAnswers(password, answers, who) {
  const payload = {
    savedAt: new Date().toISOString(),
    savedBy: who || '',
    answers,
  };
  const cipher = await encryptJson(password, payload);
  const envelope = { v: 1, encrypted: true, lastUpdated: payload.savedAt, data: cipher };
  const { sha } = await fetchFile(CONFIG.file);
  return writeFile(CONFIG.file, envelope, sha, sha ? 'Update go-live answers' : 'First go-live answers');
}

/** Read + decrypt the answer set. Returns null when nothing has been saved. */
async function loadAnswers(password) {
  const { blob } = await fetchFile(CONFIG.file);
  if (!blob) return null;
  if (!blob.encrypted || !blob.data) return blob;
  return decryptJson(password, blob.data);
}
