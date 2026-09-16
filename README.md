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
- **Sign in to the Lead Centre** — `https://yashc-0101.github.io/c1-client-portal/2026-09-15-c1-lead-centre-live.html`
- **Questions** (Sam / Dan) — `https://yashc-0101.github.io/c1-client-portal/2026-09-15-c1-go-live-questions.html`
- **What we did with the answers** — `https://yashc-0101.github.io/c1-client-portal/2026-09-16-c1-what-weve-done.html`
- **What we need now** — `https://yashc-0101.github.io/c1-client-portal/2026-09-16-c1-what-we-need-now.html`
- **Admin view** (Octogle Team) — `https://yashc-0101.github.io/c1-client-portal/view.html`

The app itself is at `https://c1-lead-centre.vercel.app` (demo data). Its two demo
logins are **AES-GCM encrypted inside** `2026-09-15-c1-lead-centre-live.html` and
decrypt only with the access code — this repo is public, so nothing readable in the
source may be a credential. To change them, re-encrypt with `encryptJson` from
`lib.js` and replace the `CREDS` blob.

The questions page and the admin view are gated by the same access code
(`lib.js` → `CONFIG.passwordHash`). **Default code: `c12026`.** The document
pages are not gated — they carry nothing sensitive.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page — every C1 document, newest first |
| `2026-09-16-c1-what-weve-done.html` | 16 Sep — what we built from Sam's answers |
| `2026-09-16-c1-what-we-need-now.html` | 16 Sep — the shorter list still with Sam (gated, saves as you type) |
| `2026-09-15-c1-lead-centre-live.html` | Sign-in page for the live app + status (gated; logins encrypted) |
| `2026-09-15-c1-go-live-questions.html` | The sixteen go-live questions (gated, saves as you type) |
| `view.html` | Admin view of the latest answers (gated) |
| `lib.js` | Shared password gate + AES-GCM crypto + GitHub Contents API |
| `2026-09-15-c1-what-we-need.html` / `.pdf` | 15 Sep pack — what we need, WhatsApp without Facebook, what's left to build |
| `2026-09-15-c1-lead-centre-go-live.pdf` | 15 Sep detail version, item by item |
| `2026-09-15-c1-whatsapp-five-ways.pdf` | 15 Sep — five ways to do the WhatsApp number |
| `2026-09-07-c1-where-to-focus-next.html` / `.pdf` | 7 Sep note, superseded by the 15 Sep papers |
| `2026-08-17-c1-lead-centre-overview.html` | The pitch |
| `2026-08-17-c1-lead-centre-mockup.html` | Clickable mobile mockup |
| `2026-08-17-c1-lead-centre-feasibility.html` | Feasibility & build plan |
| `answers.json` | Created on the first save (encrypted) |

The three `2026-08-17-*` pages were previously served from `stato-client-portal`;
they are copies, so the old links keep working.

## How the questions page behaves

1. Sam or Dan opens the URL → access code → the sixteen questions.
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

`lib.js` → `CONFIG.token` is a placeholder, and on a **public** repo it has to stay
one: GitHub's secret scanning revokes a PAT the moment it lands in public code, and
push protection usually blocks the push first. So pick one of:

- **Make this repo private** and paste the PAT into `CONFIG.token` (GitHub Pages on a
  private repo needs a paid plan), or
- **Put the token behind a small endpoint** — a Vercel/Cloudflare function holding it
  as an env var, with the page POSTing to it. The pages can stay on GitHub Pages; only
  the save call changes, so no URL that has been sent out breaks.
- **Leave it as it is** — answers stay in the browser and come back via **Copy answers**.

Either way the PAT is fine-grained: repository access *only* `c1-client-portal`,
Permissions → Repository → **Contents → Read and write**.

To change the access code:

```bash
printf "%s" "your-new-code" | shasum -a 256   # → CONFIG.passwordHash
```

## Security model

| Risk | Mitigation |
|---|---|
| A PAT in `lib.js` source | Don't, while the repo is public — GitHub revokes it. See *Turning saving on*. If it is ever set on a private repo it is fine-grained: Contents write on this one repo, so the worst case is vandalism of `answers.json` — revert and rotate. |
| `answers.json` is publicly readable | AES-GCM encrypted with a key derived from the access code. A direct fetch returns gibberish. |
| Brute-forcing the code | PBKDF2, 200,000 iterations. Use a non-dictionary code if the answers get sensitive. |
| Demo logins for the app | Encrypted with the access code, never in plaintext in the repo. They are demo accounts on demo data and get replaced before real enquiries land. |
| Client data in the repo | Never paste an Aircall key, a Meta token or a real customer record into a page or a commit. |

## Update flow

```bash
git add . && git commit -m "portal: ..." && git push
```

GitHub Pages rebuilds in ~30 seconds. Same URLs.
