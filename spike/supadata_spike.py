"""Supadata feasibility spike (free plan only). Stdlib only; reuses spike.py helpers.

Reads SUPADATA_API_KEY from the environment or ../.env; the key is never printed or saved.
Credits are logged to sd_ledger.jsonl from the x-billable-requests header; a call is refused
if credits used so far + its worst case would exceed CREDIT_CAP (free plan = 100/month).

  python3 supadata_spike.py meta <url> <name>                      # 1 credit
  python3 supadata_spike.py transcript <url> <name> <max_seconds>  # native=1, generated=2/min
  python3 supadata_spike.py extract <url> <name> <max_seconds>     # 5/started min (min 5)
  python3 supadata_spike.py credits                                # credits used so far
"""
import json
import math
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # our own spike/ dir (python3 -I omits it)
from spike import HERE, OUT, load_key, redact  # noqa: E402

API = "https://api.supadata.ai/v1"
LEDGER = HERE / "sd_ledger.jsonl"
CREDIT_CAP = 80
POLL_EVERY_S, POLL_MAX_S = 2, 240

EXTRACT_PROMPT = (
    "This is a cooking video. Report only what is actually said or shown. Return: the recipe title; "
    "every ingredient with its quantity exactly as said or shown on screen (null if not given); "
    "where each quantity came from (speech or on-screen text); the cooking steps in order with any "
    "times, temperatures and heat levels; and a verbatim list of all on-screen text. "
    "Do not guess quantities.")


def used():
    if not LEDGER.exists():
        return 0
    return sum(json.loads(l).get("credits") or 0 for l in LEDGER.read_text().splitlines() if l.strip())


def request(method, path, key, params=None, body=None, timeout=120):
    url = f"{API}{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    req = urllib.request.Request(url, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"x-api-key": key, "Content-Type": "application/json",
                                          "User-Agent": "recipe-spike/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, headers, raw = r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        status, headers, raw = e.code, dict(e.headers), e.read()
    except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
        return None, {}, {"error": "network", "message": str(e)}
    try:
        data = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        data = {"error": "non-json", "body": raw[:500].decode("utf-8", "replace")}
    return status, headers, data


def billed(headers):
    v = {k.lower(): v for k, v in headers.items()}.get("x-billable-requests")
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def poll(path, key):
    t0 = time.time()
    while time.time() - t0 < POLL_MAX_S:
        time.sleep(POLL_EVERY_S)
        status, _, data = request("GET", path, key)
        if status != 200 or data.get("status") in ("completed", "failed") or "content" in data:
            return status, data
    return None, {"error": "poll-timeout", "after_s": POLL_MAX_S}


def run(kind, url, name, worst_credits, method, path, params=None, body=None, poll_prefix=None):
    if used() + worst_credits > CREDIT_CAP:
        sys.exit(f"Credits used {used()} + worst case {worst_credits} would exceed cap {CREDIT_CAP}. Refusing.")
    key = load_key("SUPADATA_API_KEY")
    print(f"Worst case for this call: {worst_credits} credits (used so far {used()})")
    t0 = time.time()
    status, headers, data = request(method, path, key, params, body)
    credits, first_status = billed(headers), status
    job_id = data.get("jobId") if isinstance(data, dict) else None
    if status == 202 and job_id and poll_prefix:
        status, data = poll(f"{poll_prefix}/{job_id}", key)
    latency = round(time.time() - t0, 1)
    row = {"name": name, "kind": kind, "url": url, "first_status": first_status, "status": status,
           "job": bool(job_id), "latency_s": latency, "credits": credits,
           "error": data.get("error") if isinstance(data, dict) else None,
           "message": data.get("message") if isinstance(data, dict) else None}
    with LEDGER.open("a") as f:
        f.write(redact(json.dumps(row), key) + "\n")
    OUT.mkdir(exist_ok=True)
    (OUT / f"{name}.sd-{kind}.json").write_text(redact(json.dumps(data, indent=2, ensure_ascii=False), key))
    print(redact(json.dumps(row, indent=2), key))
    print(f"Credits used: {used()} / cap {CREDIT_CAP}")
    if status not in (200, 206) or row["error"]:
        sys.exit(1)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    need = {"meta": 2, "transcript": 3, "extract": 3, "credits": 0}
    if cmd not in need or len(args) < need[cmd]:
        sys.exit(__doc__)
    if cmd == "credits":
        print(used())
        return
    url, name = args[0], args[1]
    minutes = 0
    if cmd in ("transcript", "extract"):
        try:
            minutes = math.ceil(int(args[2]) / 60)
        except ValueError:
            sys.exit("max_seconds must be an integer")
    if cmd == "meta":
        run("meta", url, name, 1, "GET", "/metadata", {"url": url})
    elif cmd == "transcript":
        run("transcript", url, name, max(1, 2 * minutes), "GET", "/transcript",
            {"url": url, "mode": "auto", "text": "false"}, poll_prefix="/transcript")
    elif cmd == "extract":
        run("extract", url, name, max(5, 5 * minutes), "POST", "/extract",
            body={"url": url, "prompt": EXTRACT_PROMPT}, poll_prefix="/extract")


if __name__ == "__main__":
    main()
