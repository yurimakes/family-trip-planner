from backend.planner import PARENTS


def draft():
    ids = ["tea", "fan", "rice", "market"]
    return {"candidates": ids, "responses": {p: dict.fromkeys(ids, "yes") for p in PARENTS}, "essentials": {p: ["fan"] for p in PARENTS}, "sources": dict.fromkeys(PARENTS, "direct"), "unknown_ids": [], "config": {"walk_limit": 1200, "continuous_limit": 300, "budget": 200000, "avoid_stairs": True, "mild_food": True}}
