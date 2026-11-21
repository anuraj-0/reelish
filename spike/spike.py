"""Feasibility spike: which sources can we access, and what recipe data do we get?

Stdlib only (Python 3.9+). Reads OPENROUTER_API_KEY from the environment or ../.env.
The key is never printed or written to disk. Every OpenRouter call is logged to
ledger.jsonl; calls are refused once cumulative cost reaches SPEND_CAP_USD.

  python3 spike.py key-check                   # free: key valid? credit limit / usage
  python3 spike.py video <youtube_url> <name> <max_seconds>  # Gemini watches the YouTube URL (AI Studio)
  python3 spike.py text <txt_file> <name>      # extract from description / caption text only
  python3 spike.py file <mp4_path> <name> <max_seconds>     # local video file, base64
  python3 spike.py v2 <youtube_url|-> <name> <max_seconds> [sources.txt]  # provenance-aware prompt
  python3 spike.py spent                       # cumulative spend so far
"""
import base64
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "results"
LEDGER = HERE / "ledger.jsonl"
SPEND_CAP_USD = 0.20          # cumulative, across all runs
PER_CALL_LIMIT_USD = 0.05     # refuse any single call whose worst case exceeds this
API = "https://openrouter.ai/api/v1"
MODEL = "google/gemini-3.5-flash-lite"
# Worst-case cost model (OpenRouter price list for MODEL, Gemini media-resolution docs):
PRICE_IN, PRICE_OUT = 0.30e-6, 2.50e-6   # $/token; audio/video same as text for this model
WORST_TOKENS_PER_SEC = 305               # 280/frame at high res @1fps + 25 audio
PROMPT_TOKENS_WORST = 2000               # instruction prompt + metadata overhead
MAX_TOKENS = 4000                        # caps reasoning + visible output together
# Only Google AI Studio accepts YouTube URLs (OpenRouter docs); pin it, no fallbacks.
PROVIDER = {"order": ["google-ai-studio"], "allow_fallbacks": False}

PROMPT = """You extract a cookable recipe from a cooking video and/or its text.
Return ONLY JSON with this shape:
{
  "is_recipe": bool,
  "title": str, "servings": str|null, "total_time": str|null,
  "ingredients": [{"name": str, "quantity": str|null,
                   "quantity_source": "stated_text"|"stated_speech"|"on_screen"|"estimated"|"missing",
                   "component": str|null}],
  "steps": [{"n": int, "text": str, "ingredients_used": [str],
             "time_or_temp": str|null, "doneness_cue": str|null,
             "timestamp": "MM:SS"|null}],
  "gaps": [str]
}
Rules: never invent a quantity. If you infer one from what is visible, mark it
"estimated"; if unknown, quantity=null and "missing". List anything a cook would
need but the source does not give (heat level, pan size, servings...) in "gaps".
If this is not a recipe, return is_recipe=false and empty lists."""


PROMPT_V2 = """You extract a cookable recipe for a home cook. You get a cooking video and,
optionally, extra SOURCE blocks (e.g. the creator's video description or their written recipe).
Return ONLY JSON with this shape:
{
  "is_recipe": bool,
  "title": str, "servings": str|null, "servings_source": SRC|null,
  "ingredients": [{"name": str, "quantity": str|null, "quantity_source": SRC,
                   "name_sources": [SRC], "component": str|null}],
  "steps": [{"n": int, "text": str, "sources": [SRC], "ingredients_used": [str],
             "time_or_temp": str|null, "doneness_cue": str|null,
             "video_timestamp": "MM:SS"|null}],
  "conflicts": [str],
  "gaps": [str]
}
SRC is one of: "video_speech", "video_on_screen", "video_visual", "description", "linked_recipe",
"caption", "estimated", "missing".
Rules:
- Attribute every fact to the source(s) it actually appears in. Never label a fact as coming from
  the video if it only appears in a text SOURCE block, and vice versa.
- Never invent a quantity. If inferred from visuals, use "estimated"; if unknown, quantity=null, "missing".
- video_timestamp only for steps actually shown or said in the video; otherwise null.
- If sources disagree (e.g. video says 32 oz, recipe says 4 cups), keep the most specific one and
  describe the disagreement in "conflicts".
- List anything a cook still needs but no source gives in "gaps".
- If this is not a recipe, return is_recipe=false and empty lists."""


def load_key(name="OPENROUTER_API_KEY"):
    key = os.environ.get(name)
    env_file = HERE.parent / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text().splitlines():
            k, _, v = line.partition("=")
            if k.strip() == name:
                key = v.strip().strip("'\"")
    if not key:
        sys.exit(f"{name} not found in environment or .env")
    return key


def redact(text, key):
    return text.replace(key, "<redacted>") if key else text


def spent():
    if not LEDGER.exists():
        return 0.0
    return sum(json.loads(l).get("cost") or 0 for l in LEDGER.read_text().splitlines() if l.strip())


def http_json(url, body=None, headers=None, timeout=300):
    """Returns (status, parsed_json_or_error_dict). Never raises on HTTP/network errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
        return None, {"error": {"message": f"network error: {e}"}}
    try:
        return status, json.loads(raw or b"{}")
    except json.JSONDecodeError:
        return status, {"error": {"message": "non-JSON response", "body": raw[:500].decode("utf-8", "replace")}}


def parse_recipe(resp):
    try:
        content = resp["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`").removeprefix("json").strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"_unparsed": content}


def worst_case_usd(media_seconds, text_chars=0):
    tokens_in = media_seconds * WORST_TOKENS_PER_SEC + PROMPT_TOKENS_WORST + text_chars // 3
    return tokens_in * PRICE_IN + MAX_TOKENS * PRICE_OUT


def openrouter(name, kind, content_part, max_usd, prompt=None, extra_parts=()):
    already = spent()
    if max_usd > PER_CALL_LIMIT_USD:
        sys.exit(f"Worst case ${max_usd:.4f} exceeds per-call limit ${PER_CALL_LIMIT_USD}. Refusing.")
    if already + max_usd > SPEND_CAP_USD:
        sys.exit(f"Spent ${already:.4f} + worst case ${max_usd:.4f} would exceed cap ${SPEND_CAP_USD}. Refusing.")
    key = load_key()
    print(f"Worst-case cost for this call: ${max_usd:.4f} (spent so far ${already:.4f})")
    body = {
        "model": MODEL,
        "provider": PROVIDER,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt or PROMPT},
                                                   *([content_part] if content_part else []),
                                                   *extra_parts]}],
        "response_format": {"type": "json_object"},
        "reasoning": {"effort": "minimal"},
        "max_tokens": MAX_TOKENS,
        "usage": {"include": True},
    }
    t0 = time.time()
    status, resp = http_json(f"{API}/chat/completions", body, {"Authorization": f"Bearer {key}"})
    latency = round(time.time() - t0, 1)
    usage = resp.get("usage") or {}
    row = {"name": name, "kind": kind, "model": MODEL, "status": status, "latency_s": latency,
           "provider": resp.get("provider"), "cost": usage.get("cost"),
           "prompt_tokens": usage.get("prompt_tokens"),
           "completion_tokens": usage.get("completion_tokens"),
           "prompt_details": usage.get("prompt_tokens_details"),
           "finish_reason": (resp.get("choices") or [{}])[0].get("finish_reason"),
           "worst_case_usd": round(max_usd, 4),
           "over_worst_case": (usage.get("cost") or 0) > max_usd,
           "error": resp.get("error")}
    if row["over_worst_case"]:
        print("WARNING: actual cost exceeded the worst-case estimate; cost model is wrong. Stop and review.")
    with LEDGER.open("a") as f:
        f.write(redact(json.dumps(row), key) + "\n")
    OUT.mkdir(exist_ok=True)
    (OUT / f"{name}.{kind}.raw.json").write_text(redact(json.dumps(resp, indent=2), key))
    recipe = parse_recipe(resp)
    if recipe is not None:
        (OUT / f"{name}.{kind}.recipe.json").write_text(json.dumps(recipe, indent=2, ensure_ascii=False))
    print(redact(json.dumps(row, indent=2), key))
    print(f"Cumulative spend: ${spent():.4f} / cap ${SPEND_CAP_USD}")
    if status != 200 or row["error"]:
        sys.exit(1)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    need = {"video": 3, "text": 2, "file": 3, "v2": 3, "key-check": 0, "spent": 0}
    if cmd not in need or len(args) < need[cmd]:
        sys.exit(__doc__)
    if cmd in ("video", "file", "v2"):
        try:
            max_seconds = int(args[2])
        except ValueError:
            sys.exit("max_seconds must be an integer (upper bound on video length)")
    if cmd == "spent":
        print(f"${spent():.4f}")
    elif cmd == "key-check":
        key = load_key()
        status, resp = http_json(f"{API}/key", headers={"Authorization": f"Bearer {key}"})
        d = resp.get("data") or {}
        # Non-secret format hints only (OpenRouter keys look like sk-or-v1-<64 hex>).
        print(json.dumps({"source": "env" if os.environ.get("OPENROUTER_API_KEY") else ".env",
                          "prefix_ok": key.startswith("sk-or-v1-"), "length": len(key),
                          "has_space_or_quote": any(c in key for c in " \t'\"#")}))
        print(redact(json.dumps({"status": status, "limit": d.get("limit"),
                                 "limit_remaining": d.get("limit_remaining"),
                                 "usage": d.get("usage"), "is_free_tier": d.get("is_free_tier"),
                                 "error": resp.get("error")}, indent=2), key))
    elif cmd == "v2":
        # v2 <youtube_url or -> <name> <max_seconds> [sources.txt]: provenance-aware prompt.
        video = None if args[0] == "-" else {"type": "video_url",
                                             "video_url": {"url": args[0], "processing": "static"}}
        extra, chars = [], 0
        if len(args) > 3:
            path = Path(args[3])
            if not path.is_file():
                sys.exit(f"File not found: {path}")
            text = path.read_text()
            chars = len(text)
            extra = [{"type": "text", "text": text}]
        if not video and not extra:
            sys.exit("v2 needs a video URL, a sources file, or both")
        kind = "v2-" + ("video" if video else "") + ("+text" if extra else "")
        openrouter(args[1], kind, video, worst_case_usd(max_seconds if video else 0, chars),
                   prompt=PROMPT_V2, extra_parts=extra)
    elif cmd == "video":
        openrouter(args[1], "video",
                   {"type": "video_url", "video_url": {"url": args[0], "processing": "static"}},
                   worst_case_usd(max_seconds))
    elif cmd in ("text", "file"):
        path = Path(args[0])
        if not path.is_file():
            sys.exit(f"File not found: {path}")
        if cmd == "text":
            text = path.read_text()
            openrouter(args[1], "text", {"type": "text", "text": "SOURCE TEXT:\n" + text},
                       worst_case_usd(0, len(text)))
        else:
            b64 = base64.b64encode(path.read_bytes()).decode()
            openrouter(args[1], "file", {"type": "video_url",
                                         "video_url": {"url": f"data:video/mp4;base64,{b64}"}},
                       worst_case_usd(max_seconds))


if __name__ == "__main__":
    main()
