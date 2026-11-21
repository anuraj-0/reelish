# Exporting the Claude Code sessions: checklist

The goal is to share the real sessions as they happened. **Redact secrets and personal details only.** Don't
edit, reorder, trim or "tidy" the conversation, and don't remove mistakes or dead ends: they're part of the
decision history.

## 1. Find the sessions
- Raw transcripts: `~/.claude/projects/-Users-jimmy-Documents-programming-Projects-Reelish/`.
  - `725fea78-….jsonl`: spike through M3 (about 22 MB), plus its subagent transcripts (`agent-*.jsonl`).
  - `5bd821a9-….jsonl`: this M4 session.
- Inside each session, `/export` writes a readable copy of the conversation to a file. Export **every** session
  that produced commits.
- Keep the raw `.jsonl` files unchanged as the original record. Share exports or redacted copies, never edited
  originals.

## 2. Check for secrets (before sharing anything)
- [x] **Exact API key values**: a scan on 2026-11-21 compared every transcript against the values in `.env`
  (`OPENROUTER_API_KEY`, `YOUTUBE_API_KEY`, `SUPADATA_API_KEY`). **0 matches** in all 15 files.
- [x] **Key-shaped strings** (`sk-or-v1-…`, `AIza…`, `sd_…`): one match, a fake test key in test code. Nothing
  real.
- [ ] Re-run the scan on the **final** exported files, since this session will have grown. Command, which prints
  only counts:
  ```bash
  python3 - <<'EOF'
  import re, glob, os
  keys = {m.group(1): m.group(2) for l in open(".env") if (m := re.match(r"\s*([A-Z_]+)\s*=\s*(\S{8,})", l))}
  for f in glob.glob(os.path.expanduser("~/path/to/exports/*")):
      t = open(f, errors="ignore").read()
      print(f, {k: t.count(v) for k, v in keys.items() if v in t} or "clean")
  EOF
  ```
- [ ] Search the exports for: `Authorization:`, `Bearer `, `x-api-key`, `password`, `token=`, `PRIVATE KEY`, and
  any `.env` file being printed (`cat .env`).
- [ ] If a real key **is** found: **rotate the key first** (OpenRouter, Google Cloud, Supadata). Then replace that
  one string with `[REDACTED-OPENROUTER-KEY]` and add a note at the top: "Redacted: 1 API key; nothing else
  changed."

## 3. Personal details
- [ ] Your email, and any name you don't want shared. The git author name appears in commits.
- [ ] Local paths (`/Users/jimmy/…`) and machine details (a LAN IP appeared in a server log). Usually harmless;
  your call.
- [ ] The VPS hostname or IP, if any appear later.
- [ ] Creator names and video links are public and part of the evaluation. Keep them.

## 4. Keep the history honest
- [ ] Don't delete failed attempts, reverted approaches, or places where the AI was wrong (see `BUILD-LOG.md`).
- [ ] Don't add or rewrite messages after the fact. If context is needed, put it in a separate cover note.
- [ ] If anything was redacted, say exactly what and why in the cover note.
- [ ] Make sure the exports and the git history agree: the session's commits should be in `git log`.
  **Don't squash or rewrite git history.**

## 5. Final pass
- [ ] Open each export and skim it start to finish once.
- [ ] Re-run the scan in step 2 on exactly the files you'll share.
- [ ] Share privately first (for example, with the reviewer only), not on a public link.
