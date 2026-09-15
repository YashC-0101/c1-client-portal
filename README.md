# C1 Clearance — Client Portal

Static client-facing portal for the **C1 Clearance Lead Centre**, hosted on
GitHub Pages. Same shape as `stato-client-portal`, but its own repo, its own
access code and its own answers file — C1 is a separate project and the two
clients should never see each other's pages.

The product itself lives in [`LeadgenerationioTeams/C1`](https://github.com/LeadgenerationioTeams/C1).
This repo is only the client-facing paperwork: what we sent them, and the page
they answer on.

## Live URLs

- **Landing** — `https://yashc-0101.github.io/c1-client-portal/`
- **Questions** (Sam / Dan) — `https://yashc-0101.github.io/c1-client-portal/2026-09-15-c1-go-live-questions.html`
- **Admin view** (Octogle Team) — `https://yashc-0101.github.io/c1-client-portal/view.html`

The questions page and the admin view are gated by the same access code
(`lib.js` → `CONFIG.passwordHash`). **Default code: `c12026`.** The document
pages are not gated — they carry nothing sensitive.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page — every C1 document, newest first |
| `2026-09-15-c1-go-live-questions.html` | The nine go-live questions (gated, saves as you type) |
| `view.html` | Admin view of the latest answers (gated) |
| `lib.js` | Shared password gate + AES-GCM crypto + GitHub Contents API |
| `2026-09-07-c1-where-to-focus-next.html` / `.pdf` | 7 Sep note — the plan after "two WhatsApp enquiries in eight months" |
| `2026-09-04-c1-whatsapp-options.pdf` | 4 Sep WhatsApp options paper (Plans B and D since dropped) |
| `2026-09-03-c1-lead-centre-go-live.pdf` | 3 Sep go-live paper |
| `2026-08-17-c1-lead-centre-overview.html` | The pitch |
| `2026-08-17-c1-lead-centre-mockup.html` | Clickable mobile mockup |
| `2026-08-17-c1-lead-centre-feasibility.html` | Feasibility & build plan |
| `answers.json` | Created on the first save (encrypted) |

The three `2026-08-17-*` pages were previously served from `stato-client-portal`;
they are copies, so the old links keep working.

## How the questions page behaves

1. Sam or Dan opens the URL → access code → the nine questions.
2. **Every keystroke is written to `localStorage` first.** Nothing typed is ever
   lost, whatever happens to the network or the token below.
3. If `CONFIG.token` is set, the whole answer set is then encrypted (AES-GCM,
   PBKDF2-derived key) and PUT to `answers.json` in this repo — one write at a
   time, debounced, so a fast typist cannot overlap writes. Each save is a
   commit, so the history is the version history.
4. If `CONFIG.token` is **not** set, the page says so plainly under the name
   field and the **Copy answers** / **Download as text** buttons are the way
   back to us. It never claims to have saved something it hasn't.
5. `view.html` fetches `answers.json`, decrypts it with the same code, and shows
   the latest answers with who saved them and when. Reading needs no token —
   only saving does.

## Turning saving on

`lib.js` → `CONFIG.token` is a placeholder. To enable the write path:

1. Create a fine-grained PAT at https://github.com/settings/personal-access-tokens/new
   - Repository access: only `c1-client-portal`
   - Permissions → Repository → **Contents → Read and write**
2. Paste it into `CONFIG.token` and push.

To change the access code:

```bash
printf "%s" "your-new-code" | shasum -a 256   # → CONFIG.passwordHash
```

## Security model

| Risk | Mitigation |
|---|---|
| The PAT is visible in `lib.js` source | Fine-grained: Contents write on this one repo. Worst case is vandalism of `answers.json` — revert and rotate. |
| `answers.json` is publicly readable | AES-GCM encrypted with a key derived from the access code. A direct fetch returns gibberish. |
| Brute-forcing the code | PBKDF2, 200,000 iterations. Use a non-dictionary code if the answers get sensitive. |
| Client data in the repo | Nothing here is a credential. Never paste an Aircall key, a Meta token or a real customer record into a page or a commit. |

## Update flow

```bash
git add . && git commit -m "portal: ..." && git push
```

GitHub Pages rebuilds in ~30 seconds. Same URLs.
