"""Transport-independent API operations; recompute every confirmed plan."""

from .planner import build_plan, catalog, compare, remaining_plan, validate_draft


class Service:
    def __init__(self, store):
        self.store = store

    def handle(self, method, path, payload=None, token=None):
        body = payload or {}
        if method == "GET" and path == "/api/health":
            return {"status": "ok", "mode": "local-prototype", "ai_connected": False}
        if method == "GET" and path == "/api/catalog":
            return catalog()
        if method == "POST" and path == "/api/compare":
            return compare(body)
        if method == "POST" and path == "/api/trips":
            return self.store.create(validate_draft(body))
        parts = path.strip("/").split("/")
        if len(parts) < 3 or parts[:2] != ["api", "trips"]:
            raise LookupError("endpoint not found")
        trip_id = parts[2]
        if len(parts) == 3:
            if method == "GET":
                return self.store.read(trip_id, token)
            if method == "DELETE":
                self.store.delete(trip_id, token)
                return {"deleted": True}
            if method == "PUT":
                draft = validate_draft(body.get("draft"))

                def update(state):
                    state.update(draft=draft, plan=None)
                    state["events"].append({"type": "draft_changed", "version": state["version"]})
                    return state

                return self.store.mutate(trip_id, token, body.get("expected_revision"), update)
        if len(parts) == 4 and method == "POST" and parts[3] in ("confirm", "change"):
            confirmations = body.get("confirmations")
            if not isinstance(confirmations, dict) or set(confirmations) != {"mom", "dad"} or any(value is not True for value in confirmations.values()):
                raise ValueError("both parents must explicitly confirm")

            def update(state):
                if parts[3] == "confirm":
                    plan = build_plan(state["draft"], body.get("plan_key"))
                else:
                    if not state["plan"]:
                        raise ValueError("confirm an itinerary first")
                    already = [row["id"] for row in state["plan"]["rows"] if row["completed"]]
                    requested = body.get("completed_ids", [])
                    if requested[:len(already)] != already:
                        raise ValueError("completed visits cannot be undone")
                    plan = remaining_plan(state["draft"], state["plan"], requested, body.get("remaining_walk_limit"), body.get("continuous_limit"))
                if not plan["valid"]:
                    raise ValueError({"message": "plan requires clarification", "issues": plan["issues"]})
                state["version"] += 1
                state["plan"] = plan
                state["events"].append({"type": parts[3], "version": state["version"], "confirmations": confirmations, "plan_key": plan["key"]})
                return state

            return self.store.mutate(trip_id, token, body.get("expected_revision"), update)
        raise LookupError("endpoint not found")
