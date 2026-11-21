# Usage: python3 -I scripts/export-sessions.py <output-dir>   (re-run after the last session ends)
"""Mechanical export of Claude Code session transcripts: raw copies + Markdown renderings.
No message is edited, reordered or dropped. Images are replaced by a placeholder line (binary)."""
import glob, json, os, shutil, sys

SRC = os.path.expanduser("~/.claude/projects/-Users-jimmy-Documents-programming-Projects-Reelish")
OUT = sys.argv[1]
os.makedirs(f"{OUT}/raw", exist_ok=True)
os.makedirs(f"{OUT}/markdown", exist_ok=True)


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


def render(path, md_path):
    with open(md_path, "w") as out:
        out.write(f"# Session `{os.path.basename(path)}`\n\nMechanical rendering of the raw transcript (same folder: `raw/`).\n\n")
        for line in open(path, errors="ignore"):
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("type") not in ("user", "assistant"):
                continue
            msg = d.get("message", {})
            content = msg.get("content")
            parts = [content] if isinstance(content, str) else [render_block(b) for b in content or []]
            body = "\n\n".join(p for p in parts if p)
            if body:
                out.write(f"---\n\n### {d['type']} · {d.get('timestamp', '')}\n\n{body}\n\n")


for f in sorted(glob.glob(f"{SRC}/*.jsonl")) + sorted(glob.glob(f"{SRC}/*/subagents/*.jsonl")):
    rel = os.path.relpath(f, SRC)
    dst = f"{OUT}/raw/{rel}"
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(f, dst)
    md = f"{OUT}/markdown/{rel.replace('/', '__').replace('.jsonl', '.md')}"
    render(f, md)
    print(rel, os.path.getsize(f), "→", os.path.getsize(md))
