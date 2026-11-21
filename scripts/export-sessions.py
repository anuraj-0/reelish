# Usage: python3 -I scripts/export-sessions.py <output-dir>    (run from the repo root; re-run after the last session)
"""Reviewer-safe export of the Claude Code sessions for this project.

Writes <out>/raw/*.jsonl (redacted copies, original structure) and <out>/markdown/*.md (mechanical renderings).
No message is added, reordered or summarised. The only changes are the redactions below, each replaced by a
visible [REDACTED-…] marker:
  - API key values from .env (and the hex part of each key on its own);
  - the git author email (git config user.email), also in regex-escaped form, and any address at a personal
    email domain (gmail, yahoo, hotmail, outlook, icloud, proton);
  - every IPv4 address except loopback, 0.0.0.0 and the documentation/test addresses used in the test suite;
  - SSH key file names, non-root users and "Host <alias>" lines for other servers from ~/.ssh/config;
  - attached PDF documents (the assignment brief, which contains the API key);
  - the output of a few read-only commands that dumped the local SSH config or unrelated services on the
    shared VPS (see DROP_RESULTS_OF).
Sensitive values are read at run time and never written to disk except as redaction markers.
"""
import glob, ipaddress, json, os, re, subprocess, sys

SRC = os.path.expanduser("~/.claude/projects/-Users-jimmy-Documents-programming-Projects-Reelish")
OUT = sys.argv[1]

# Tool calls whose *results* are replaced by a note (matched against the tool call's command).
DROP_RESULTS_OF = [
    (r"cat ~/\.ssh/config", "output of reading the local SSH config (host aliases, IP addresses and key file names of this VPS and unrelated servers)"),
    (r"systemctl list-units --type=service", "read-only inspection of the shared VPS: OS, memory, disk, running services and ports of unrelated apps, Nginx layout, certificates, firewall. What matters for Reelish is summarised in docs/DEPLOYMENT.md ('The server')"),
    (r"ps -eo rss", "per-process memory, another app's systemd unit and Nginx snippet, disk usage and DNS of the shared VPS. Summarised in docs/DEPLOYMENT.md"),
    (r"sed -n 1,140p /etc/nginx/sites-enabled/deepclean\.app", "test of the backup/health units, plus a dump of the existing DeepClean.app Nginx server block and another app's snippet. The one-line change made to it is shown later in this session and in docs/DEPLOYMENT.md"),
]

# IPv4 addresses that are safe to keep: loopback/any, and documentation or test addresses (RFC 5737 etc.).
KEEP_IPS = {"127.0.0.1", "0.0.0.0", "127.0.0.53", "127.0.0.54", "8.8.8.8", "1.1.1.1", "9.9.9.1", "9.9.9.2", "93.184.216.34"}


def keep_ip(s):
    if s in KEEP_IPS:
        return True
    try:
        ip = ipaddress.ip_address(s)
    except ValueError:
        return True  # not an address (e.g. a version number)
    test_nets = ["192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24"]
    if any(ip in ipaddress.ip_network(n) for n in test_nets):
        return True
    # Network/range boundaries listed in the SSRF guard's tests (x.0.0.0, broadcast, test hosts in private ranges).
    return s.endswith(".0.0") or s.endswith(".0") or s == "255.255.255.255" or s in {"10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "224.0.0.1", "172.32.0.1", "169.254.169.254"}


def build_replacements():
    rep = {}
    for line in open(".env"):
        m = re.match(r"\s*([A-Z_]+)\s*=\s*(\S{8,})", line)
        if m and m.group(1).endswith("_KEY"):
            name = m.group(1).replace("_API_KEY", "").replace("_KEY", "")
            rep[m.group(2)] = f"[REDACTED-{name}-KEY]"
            tail = m.group(2).split("-")[-1]
            if len(tail) >= 32:
                rep[tail] = f"[REDACTED-{name}-KEY]"
    email = subprocess.run(["git", "config", "user.email"], capture_output=True, text=True).stdout.strip()
    if email:
        rep[email] = "[REDACTED-EMAIL]"
        local = email.split("@")[0]
        if len(local) >= 6:  # e.g. the local part used on its own as a search pattern
            rep[local] = "[REDACTED-EMAIL-USER]"
    for line in open(os.path.expanduser("~/.ssh/config")):
        m = re.match(r"\s*IdentityFile\s+(\S+)", line)
        if m:
            rep[os.path.basename(m.group(1))] = "[REDACTED-SSH-KEY-FILE]"
        m = re.match(r"\s*User\s+(\S+)", line)
        if m and m.group(1) not in ("root", "git"):
            rep[m.group(1)] = "[REDACTED-USER]"
        m = re.match(r"\s*Host\s+(\S+)", line)
        if m and m.group(1) not in ("deepclean", "github.com", "bitbucket.org"):
            rep[f"Host {m.group(1)}"] = "Host [REDACTED-HOST]"
    return dict(sorted(rep.items(), key=lambda kv: -len(kv[0])))


def email_regexes():
    email = subprocess.run(["git", "config", "user.email"], capture_output=True, text=True).stdout.strip()
    out = [re.compile(r"[A-Za-z0-9._%+\-]+@(?:gmail|yahoo|hotmail|outlook|icloud|proton(?:mail)?)(?:\\*\.[a-z]{2,})+")]
    if email:  # also match "name\\.x@gmail\\.com" as written inside regexes or JSON
        out.append(re.compile(r"\\*\.".join(re.escape(part) for part in email.split("."))))
    return out


REP = build_replacements()
EMAIL_RES = email_regexes()
IP_RE = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])")
stats = {"strings": 0, "ips": 0, "pdf": 0, "dropped_results": 0}


def clean_str(s):
    for k, v in REP.items():
        if k in s:
            stats["strings"] += s.count(k)
            s = s.replace(k, v)

    def ip(m):
        if keep_ip(m.group(0)):
            return m.group(0)
        stats["ips"] += 1
        return "[REDACTED-IP]"

    for rx in EMAIL_RES:
        s, n = rx.subn("[REDACTED-EMAIL]", s)
        stats["strings"] += n
    return IP_RE.sub(ip, s)


def walk(x, drop_ids):
    if isinstance(x, dict):
        if x.get("type") == "document":
            stats["pdf"] += 1
            return {"type": "text", "text": "[REDACTED: attached PDF (the assignment brief) removed because it contains the API key.]"}
        if x.get("type") == "tool_result" and x.get("tool_use_id") in drop_ids:
            stats["dropped_results"] += 1
            return {**{k: v for k, v in x.items() if k != "content"}, "content": f"[REDACTED: {drop_ids[x['tool_use_id']]}.]"}
        return {k: walk(v, drop_ids) for k, v in x.items()}
    if isinstance(x, list):
        return [walk(v, drop_ids) for v in x]
    if isinstance(x, str):
        return clean_str(x)
    return x


def render_block(b):
    t = b.get("type")
    if t == "text":
        return b.get("text", "")
    if t == "thinking":
        return f"<details><summary>thinking</summary>\n\n{b.get('thinking', '')}\n\n</details>" if b.get("thinking") else ""
    if t == "tool_use":
        return f"**Tool call: `{b.get('name')}`**\n\n```json\n{json.dumps(b.get('input'), indent=2, ensure_ascii=False)}\n```"
    if t == "tool_result":
        c = b.get("content")
        if isinstance(c, list):
            c = "\n".join(x.get("text", "[image]") if x.get("type") == "text" else "[image]" for x in c)
        return f"**Tool result{' (error)' if b.get('is_error') else ''}:**\n\n```\n{c}\n```"
    if t == "image":
        return "[image]"
    return f"[{t}]"


def export(path, rel):
    entries = []
    for line in open(path, errors="ignore"):
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    drop_ids = {}
    for d in entries:
        for b in (d.get("message") or {}).get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                cmd = json.dumps(b.get("input"))
                for pat, why in DROP_RESULTS_OF:
                    if re.search(pat, cmd):
                        drop_ids[b["id"]] = why
    raw_out = f"{OUT}/raw/{rel}"
    os.makedirs(os.path.dirname(raw_out), exist_ok=True)
    md_out = f"{OUT}/markdown/{rel.replace('/', '__').replace('.jsonl', '.md')}"
    with open(raw_out, "w") as raw, open(md_out, "w") as md:
        md.write(f"# Session `{os.path.basename(path)}`\n\nMechanical rendering of the redacted transcript in `raw/`. See README.md for what was redacted.\n\n")
        for d in entries:
            # The top-level toolUseResult mirrors a tool result; redact it the same way.
            if "toolUseResult" in d:
                ids = [b.get("tool_use_id") for b in (d.get("message") or {}).get("content") or [] if isinstance(b, dict)]
                if any(i in drop_ids for i in ids):
                    d["toolUseResult"] = "[REDACTED: see the tool_result in this message.]"
            d = walk(d, drop_ids)
            raw.write(json.dumps(d, ensure_ascii=False) + "\n")
            if d.get("type") not in ("user", "assistant"):
                continue
            content = (d.get("message") or {}).get("content")
            parts = [content] if isinstance(content, str) else [render_block(b) for b in content or [] if isinstance(b, dict)]
            body = "\n\n".join(p for p in parts if p)
            if body:
                md.write(f"---\n\n### {d['type']} · {d.get('timestamp', '')}\n\n{body}\n\n")


os.makedirs(f"{OUT}/raw", exist_ok=True)
os.makedirs(f"{OUT}/markdown", exist_ok=True)
files = sorted(glob.glob(f"{SRC}/*.jsonl")) + sorted(glob.glob(f"{SRC}/*/subagents/*.jsonl"))
for f in files:
    export(f, os.path.relpath(f, SRC))
print(f"exported {len(files)} transcripts; redactions: {stats}")

# Verification: none of the sensitive values, key-shaped strings or non-allowlisted IPs may remain.
bad = 0
for f in glob.glob(f"{OUT}/raw/**/*.jsonl", recursive=True) + glob.glob(f"{OUT}/markdown/*.md"):
    t = open(f, errors="ignore").read()
    hits = sum(t.count(k) for k in REP)
    hits += len(re.findall(r"sk-or-v1-[0-9a-f]{20,}|AIza[0-9A-Za-z_\-]{30,}|sd_[0-9a-f]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|BEGIN [A-Z ]*PRIVATE KEY|application/pdf\",\s*\"data", t))
    hits += sum(1 for m in IP_RE.finditer(t) if not keep_ip(m.group(0)))
    hits += sum(len(rx.findall(t)) for rx in EMAIL_RES)
    if hits:
        bad += 1
        print("REMAINING in", os.path.relpath(f, OUT), hits)
print("verification:", "clean" if not bad else f"{bad} files with remaining matches")
