"""Plan from explicit choices. Sample distances never represent real facilities."""

import json
from pathlib import Path

CATALOG_FILE = Path(__file__).resolve().parents[1] / "web" / "catalog.json"
PARENTS = ("mom", "dad")
CHOICES = ("yes", "no", "skip")


def catalog():
    return json.loads(CATALOG_FILE.read_text(encoding="utf-8"))


def validate_draft(draft, data=None):
    data = data or catalog()
    if not isinstance(draft, dict):
        raise ValueError("draft must be an object")
    allowed = {"candidates", "responses", "essentials", "sources", "config", "unknown_ids"}
    if set(draft) - allowed:
        raise ValueError("unsupported draft fields")
    ids = draft.get("candidates")
    known = {p["id"] for p in data["places"]}
    if not isinstance(ids, list) or not 3 <= len(ids) <= 6:
        raise ValueError("choose three to six candidates")
    if any(not isinstance(i, str) or i not in known for i in ids) or len(set(ids)) != len(ids):
        raise ValueError("candidate IDs must be known and unique")
    if {p["kind"] for p in data["places"] if p["id"] in ids} != {"sight", "meal", "rest"}:
        raise ValueError("include sightseeing, a meal and a rest")
    config = draft.get("config", {})
    if not isinstance(config, dict) or set(config) - {"walk_limit", "continuous_limit", "budget", "avoid_stairs", "mild_food"}:
        raise ValueError("unsupported configuration")
    for key, maximum in (("walk_limit", 10000), ("continuous_limit", 3000), ("budget", 1000000)):
        value = config.get(key)
        if type(value) is not int or not 1 <= value <= maximum:
            raise ValueError(f"invalid {key}")
    for key in ("avoid_stairs", "mild_food"):
        if type(config.get(key)) is not bool:
            raise ValueError(f"invalid {key}")
    for key in ("responses", "essentials", "sources"):
        if not isinstance(draft.get(key), dict) or set(draft[key]) != set(PARENTS):
            raise ValueError(f"invalid {key}")
    for parent in PARENTS:
        answers = draft["responses"][parent]
        essential = draft["essentials"][parent]
        if not isinstance(answers, dict) or set(answers) - set(ids) or any(v not in CHOICES for v in answers.values()):
            raise ValueError("invalid response")
        if not isinstance(essential, list) or any(not isinstance(i, str) or i not in ids for i in essential) or len(set(essential)) != len(essential):
            raise ValueError("invalid essential experience")
        if any(answers.get(i) != "yes" for i in essential):
            raise ValueError("only a liked experience may be essential")
        if draft["sources"][parent] not in ("direct", "conversation", "unconfirmed"):
            raise ValueError("invalid response source")
    unknown = draft.get("unknown_ids", [])
    if not isinstance(unknown, list) or any(not isinstance(i, str) or i not in ids for i in unknown):
        raise ValueError("invalid unknown information IDs")
    return draft


def metrics(mode):
    low = high = block = longest = 0
    for segment in mode["segments"]:
        low += segment["walk"][0]
        high += segment["walk"][1]
        block += segment["walk"][1]
        longest = max(longest, block)
        if segment["break_after"]:
            block = 0
    return {"walk": [low, high], "continuous": longest, "cost": mode["cost"]}


def selection_issues(draft, places):
    issues = []
    for parent in PARENTS:
        if draft["sources"][parent] == "unconfirmed" or any(i not in draft["responses"][parent] for i in draft["candidates"]):
            issues.append({"code": "RESPONSES_REQUIRED", "parent": parent})
    for kind in ("meal", "rest"):
        if not any(p["kind"] == kind and all(draft["responses"][r].get(p["id"]) == "yes" for r in PARENTS) for p in places):
            issues.append({"code": "COMMON_CHOICE_REQUIRED", "kind": kind})
    if not any(p["kind"] == "sight" and any(draft["responses"][r].get(p["id"]) == "yes" for r in PARENTS) for p in places):
        issues.append({"code": "SIGHT_CHOICE_REQUIRED"})
    return issues


def build_plan(draft, key, data=None):
    data = data or catalog()
    validate_draft(draft, data)
    if key not in ("A", "B"):
        raise ValueError("unknown plan")
    places = [p for p in data["places"] if p["id"] in draft["candidates"]]
    essential = set().union(*(set(draft["essentials"][r]) for r in PARENTS))
    sights = [p for p in places if p["kind"] == "sight" and any(draft["responses"][r].get(p["id"]) == "yes" for r in PARENTS)]
    wanted = sights if key == "A" else [p for p in sights if p["id"] in essential]
    if key == "B" and not wanted:
        wanted = [p for p in sights if all(draft["responses"][r].get(p["id"]) == "yes" for r in PARENTS)][:1]
    common = lambda kind: [p for p in places if p["kind"] == kind and all(draft["responses"][r].get(p["id"]) == "yes" for r in PARENTS)]
    choose = lambda kind: next((p for p in common(kind) if p["id"] in essential), next(iter(common(kind)), None))
    meal, rest = choose("meal"), choose("rest")
    ordered = [p for p in wanted if p["bucket"] == "morning"] + ([meal] if meal else []) + [p for p in wanted if p["bucket"] != "morning"] + ([rest] if rest else [])
    rows = []
    current = data["start_minutes"]
    for index, place in enumerate(ordered):
        mode = place["modes"][0 if key == "A" else 1]
        arrival = current + (data["transfer_minutes"] if index else 0)
        start = data["meal_minutes"] if place["kind"] == "meal" else arrival
        rows.append({"id": place["id"], "name": place["name"], "experience": place["experience"], "kind": place["kind"], "mode": mode, "arrival": arrival, "start": start, "end": start + mode["minutes"], "completed": False})
        current = start + mode["minutes"]
    omitted = [p["id"] for p in sights if p not in wanted]
    result = evaluate(draft, rows, key, selection_issues(draft, places), data)
    result["omitted"] = omitted
    return result


def evaluate(draft, rows, key, issues, data):
    issues = list(issues)
    by_id = {p["id"]: p for p in data["places"]}
    low = high = cost_low = cost_high = longest = 0
    included = {row["id"] for row in rows}
    for parent in PARENTS:
        for required in draft["essentials"][parent]:
            if required not in included:
                issues.append({"code": "ESSENTIAL_MISSING", "parent": parent, "id": required})
    for row in rows:
        place, mode = by_id[row["id"]], row["mode"]
        m = metrics(mode)
        low += m["walk"][0]
        high += m["walk"][1]
        cost_low += m["cost"][0]
        cost_high += m["cost"][1]
        longest = max(longest, m["continuous"])
        if row["completed"]:
            continue
        if row["id"] in draft.get("unknown_ids", []) or place["access"] == "unknown":
            issues.append({"code": "ACCESS_UNKNOWN", "id": row["id"]})
        if draft["config"]["avoid_stairs"] and mode["stairs"]:
            issues.append({"code": "STAIRS_CONFLICT", "id": row["id"]})
        if row["start"] < place["open"][0] or row["end"] > place["open"][1]:
            issues.append({"code": "OPENING_CONFLICT", "id": row["id"]})
        if row["kind"] == "meal":
            if row["arrival"] > data["meal_minutes"]:
                issues.append({"code": "RESERVATION_CONFLICT", "id": row["id"]})
            if draft["config"]["mild_food"] and not place["mild_food"]:
                issues.append({"code": "MEAL_CONFLICT", "id": row["id"]})
        for parent in PARENTS:
            if draft["responses"][parent].get(row["id"]) != "yes":
                issues.append({"code": "PREFERENCE_CHECK_REQUIRED", "parent": parent, "id": row["id"]})
    config = draft["config"]
    if high > config["walk_limit"]:
        issues.append({"code": "DAILY_WALK_EXCEEDED", "actual": high, "limit": config["walk_limit"]})
    if longest > config["continuous_limit"] and key != "R":
        issues.append({"code": "CONTINUOUS_WALK_EXCEEDED", "actual": longest, "limit": config["continuous_limit"]})
    if cost_high > config["budget"]:
        issues.append({"code": "BUDGET_EXCEEDED", "actual": cost_high, "limit": config["budget"]})
    return {"key": key, "valid": not issues, "issues": issues, "walk": [low, high], "continuous": longest, "cost": [cost_low, cost_high], "rows": rows, "omitted": [], "data_status": "synthetic"}


def compare(draft, data=None):
    return {"plans": [build_plan(draft, key, data) for key in ("A", "B")], "data_status": "synthetic"}


def remaining_plan(draft, original, completed_ids, walk_limit, continuous_limit, data=None):
    data = data or catalog()
    validate_draft(draft, data)
    if type(walk_limit) is not int or not 1 <= walk_limit <= 10000 or type(continuous_limit) is not int or not 1 <= continuous_limit <= 3000:
        raise ValueError("invalid remaining limits")
    ids = [row["id"] for row in original["rows"]]
    if not isinstance(completed_ids, list) or completed_ids != ids[:len(completed_ids)] or len(completed_ids) > len(ids):
        raise ValueError("completed visits must be an ordered prefix")
    by_id = {p["id"]: p for p in data["places"]}
    rows = []
    current = data["start_minutes"]
    for index, old in enumerate(original["rows"]):
        row = dict(old)
        row["completed"] = row["id"] in completed_ids
        if not row["completed"]:
            mode = by_id[row["id"]]["modes"][1]
            arrival = current + (data["transfer_minutes"] if index else 0)
            start = data["meal_minutes"] if row["kind"] == "meal" else arrival
            row.update(mode=mode, arrival=arrival, start=start, end=start + mode["minutes"])
        current = row["end"]
        rows.append(row)
    result = evaluate(draft, rows, "R", [], data)
    remaining = [metrics(r["mode"]) for r in rows if not r["completed"]]
    completed = [metrics(r["mode"]) for r in rows if r["completed"]]
    result["remaining_walk"] = [sum(m["walk"][i] for m in remaining) for i in (0, 1)]
    result["completed_walk"] = [sum(m["walk"][i] for m in completed) for i in (0, 1)]
    result["remaining_continuous"] = max((m["continuous"] for m in remaining), default=0)
    if result["remaining_walk"][1] > walk_limit:
        result["issues"].append({"code": "REMAINING_WALK_EXCEEDED", "actual": result["remaining_walk"][1], "limit": walk_limit})
    if result["remaining_continuous"] > continuous_limit:
        result["issues"].append({"code": "CONTINUOUS_WALK_EXCEEDED", "actual": result["remaining_continuous"], "limit": continuous_limit})
    result["valid"] = not result["issues"]
    return result
