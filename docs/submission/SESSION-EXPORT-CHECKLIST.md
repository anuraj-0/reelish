# Exporting the Claude Code sessions: checklist

The goal is to share the real sessions as they happened. **Redact secrets and personal details only.** Don't
edit, reorder, trim or "tidy" the conversation, and don't remove mistakes or dead ends: they're part of the
decision history.

## How the reviewer-safe export is made
```bash
python3 -I scripts/export-sessions.py ../Reelish-submission/ai-sessions    # from the repo root
```
- Exports every transcript in `~/.claude/projects/-Users-jimmy-Documents-programming-Projects-Reelish/`, plus
  subagent transcripts:
  - `725fea78…`: spike through M3;
  - `5bd821a9…`: M4;
  - `8891a5d9…` and its continuation `892d6c2a…`: deployment and final docs.
- Writes redacted `raw/*.jsonl` (same structure) and `markdown/*.md` renderings.
- Ends with a verification scan and prints `verification: clean`, or the files that still match.
- The originals in `~/.claude/projects/…` are never modified. An unredacted local copy from an earlier export
  is in `../Reelish-session-exports/`. **It is private: don't share it.**

## What is redacted, and why
| What | Why | Replaced by |
|---|---|---|
| The OpenRouter key (also its bare hex part) and other `.env` key values | The assignment PDF printed the key, and it ended up in the transcripts | `[REDACTED-OPENROUTER-KEY]` etc. |
| The attached assignment PDF | It contains the key | a one-line note |
| The owner's email (plain, regex-escaped, local part) and any personal-domain email (including a recipe creator's public contact address) | Personal details | `[REDACTED-EMAIL]` |
| Every non-test IP address (the VPS, two unrelated servers, the owner's home and LAN addresses) | Infrastructure and location | `[REDACTED-IP]` |
| SSH key file names, other servers' SSH host aliases and users | Unrelated infrastructure | `[REDACTED-…]` |
| Output of 4 read-only commands that dumped the local SSH config, the VPS's other services, ports and processes, and DeepClean's Nginx block | Unrelated infrastructure | a note saying what was there and where the relevant summary is (`docs/DEPLOYMENT.md`) |

**Not redacted:**
- Local paths (`/Users/jimmy/…`).
- The GitHub username and the submitter's first name.
- The name `deepclean.app`, since it's the public host.
- Names of the other apps on the VPS, where they're mentioned in the conversation itself.
- Public creator names and video links.

## Before sharing
- [x] Scan of the export (2026-11-22): no key values, no key-shaped strings, no non-test IPs, no personal email.
- [ ] Re-run the export after the last session ends; the current session is captured only up to the export.
- [ ] Skim the Markdown renderings once.
- [ ] Share privately with the reviewer.
- [ ] Don't squash or rewrite git history. The exports and `git log` should agree.
