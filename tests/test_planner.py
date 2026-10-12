import copy
import unittest

from backend.planner import build_plan, catalog, compare, metrics, remaining_plan, validate_draft
from helpers import draft


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.draft = draft()
        self.data = catalog()

    def codes(self, plan):
        return {i["code"] for i in plan["issues"]}

    def test_two_plans_preserve_essential_and_fixed_meal(self):
        plans = compare(self.draft)["plans"]
        self.assertTrue(all(p["valid"] for p in plans))
        self.assertTrue(all("fan" in [r["id"] for r in p["rows"]] for p in plans))
        self.assertEqual([next(r["start"] for r in p["rows"] if r["kind"] == "meal") for p in plans], [720, 720])
        self.assertLess(plans[1]["walk"][1], plans[0]["walk"][1])

    def test_upper_bound_blocks_daily_walk(self):
        p = build_plan(self.draft, "B")
        self.draft["config"]["walk_limit"] = p["walk"][1] - 1
        self.assertIn("DAILY_WALK_EXCEEDED", self.codes(build_plan(self.draft, "B")))

    def test_upper_bound_equal_is_allowed(self):
        self.draft["config"]["walk_limit"] = build_plan(self.draft, "B")["walk"][1]
        self.assertTrue(build_plan(self.draft, "B")["valid"])

    def test_continuous_walk_is_independent(self):
        self.draft["config"]["continuous_limit"] = 60
        self.assertIn("CONTINUOUS_WALK_EXCEEDED", self.codes(build_plan(self.draft, "B")))

    def test_rest_splits_continuous_not_total(self):
        mode = {"cost": [0,0], "segments": [{"walk": [20,30], "break_after": True}, {"walk": [40,50], "break_after": False}]}
        self.assertEqual(metrics(mode), {"walk": [60,80], "continuous": 50, "cost": [0,0]})

    def test_skip_is_not_consent(self):
        self.draft["responses"]["dad"]["fan"] = "skip"
        self.draft["essentials"]["dad"] = []
        self.assertIn("PREFERENCE_CHECK_REQUIRED", self.codes(build_plan(self.draft, "B")))

    def test_missing_answer_blocks(self):
        del self.draft["responses"]["mom"]["market"]
        self.assertIn("RESPONSES_REQUIRED", self.codes(build_plan(self.draft, "B")))

    def test_child_guess_cannot_confirm(self):
        self.draft["sources"]["mom"] = "unconfirmed"
        self.assertFalse(build_plan(self.draft, "B")["valid"])

    def test_conversation_source_is_explicit(self):
        self.draft["sources"]["mom"] = "conversation"
        self.assertTrue(build_plan(self.draft, "B")["valid"])

    def test_unknown_access_blocks_both(self):
        self.draft["unknown_ids"] = ["fan"]
        self.assertTrue(all("ACCESS_UNKNOWN" in self.codes(p) for p in compare(self.draft)["plans"]))

    def test_disagreement_is_returned_with_parent(self):
        self.draft["responses"]["dad"]["fan"] = "no"
        self.draft["essentials"]["dad"] = []
        issues = build_plan(self.draft, "B")["issues"]
        self.assertIn({"code":"PREFERENCE_CHECK_REQUIRED","parent":"dad","id":"fan"},issues)

    def test_two_distinct_essential_meals_block_silent_omission(self):
        self.draft["candidates"].append("fish")
        for parent in ("mom","dad"):
            self.draft["responses"][parent]["fish"] = "yes"
        self.draft["essentials"]["mom"].append("rice")
        self.draft["essentials"]["dad"].append("fish")
        self.assertIn("ESSENTIAL_MISSING",self.codes(build_plan(self.draft,"B")))

    def test_mandatory_market_is_preserved_in_b(self):
        self.draft["essentials"]["dad"].append("market")
        self.assertIn("market",[r["id"] for r in build_plan(self.draft,"B")["rows"]])

    def test_meal_and_rest_need_common_yes(self):
        for pid in ("rice","tea"):
            d = copy.deepcopy(self.draft)
            d["responses"]["dad"][pid] = "no"
            self.assertIn("COMMON_CHOICE_REQUIRED",self.codes(build_plan(d,"B")))

    def test_budget_uses_upper_cost(self):
        self.draft["config"]["budget"] = 60000
        self.assertIn("BUDGET_EXCEEDED",self.codes(build_plan(self.draft,"B")))

    def test_stair_conflict(self):
        self.data["places"][0]["modes"][1]["stairs"] = True
        self.assertIn("STAIRS_CONFLICT",self.codes(build_plan(self.draft,"B",self.data)))

    def test_opening_hours(self):
        self.data["places"][0]["open"] = [540,730]
        self.assertIn("OPENING_CONFLICT",self.codes(build_plan(self.draft,"B",self.data)))

    def test_fixed_reservation_collision(self):
        self.data["places"][1]["modes"][0]["minutes"] = 180
        self.assertIn("RESERVATION_CONFLICT",self.codes(build_plan(self.draft,"A",self.data)))

    def test_food_condition(self):
        self.data["places"][2]["mild_food"] = False
        self.assertIn("MEAL_CONFLICT",self.codes(build_plan(self.draft,"B",self.data)))

    def test_remaining_keeps_completed_walk_and_reservation(self):
        original = build_plan(self.draft,"A")
        completed = [r["id"] for r in original["rows"][:2]]
        p = remaining_plan(self.draft,original,completed,300,100)
        self.assertTrue(p["valid"])
        self.assertEqual(p["rows"][0]["mode"],original["rows"][0]["mode"])
        self.assertEqual(p["rows"][1]["start"],720)
        self.assertEqual(p["walk"][1],p["completed_walk"][1]+p["remaining_walk"][1])
        self.assertIn("fan",[r["id"] for r in p["rows"]])

    def test_remaining_budget_does_not_erase_spent_cost(self):
        original = build_plan(self.draft,"A")
        self.draft["config"]["budget"] = 80000
        p = remaining_plan(self.draft,original,["market","rice"],300,100)
        self.assertIn("BUDGET_EXCEEDED",self.codes(p))

    def test_remaining_keeps_daily_limit(self):
        original = build_plan(self.draft,"A")
        self.draft["config"]["walk_limit"] = 250
        p = remaining_plan(self.draft,original,["market","rice"],300,100)
        self.assertIn("DAILY_WALK_EXCEEDED",self.codes(p))

    def test_completed_must_be_prefix(self):
        with self.assertRaises(ValueError):
            remaining_plan(self.draft,build_plan(self.draft,"A"),["fan"],300,100)

    def test_remaining_limits_block(self):
        p = remaining_plan(self.draft,build_plan(self.draft,"B"),["rice"],100,60)
        self.assertFalse(p["valid"])
        self.assertIn("REMAINING_WALK_EXCEEDED",self.codes(p))

    def test_invalid_inputs_rejected(self):
        for key,value in (("walk_limit",True),("continuous_limit",0),("budget",-1)):
            d = copy.deepcopy(self.draft);d["config"][key] = value
            with self.assertRaises(ValueError):validate_draft(d)
        for ids in (["fan","fan","tea"],["missing","rice","tea"],[]):
            d = copy.deepcopy(self.draft);d["candidates"] = ids
            with self.assertRaises(ValueError):validate_draft(d)

    def test_private_fields_rejected(self):
        self.draft["photo"] = "not accepted"
        with self.assertRaises(ValueError):validate_draft(self.draft)

    def test_cannot_mark_disliked_experience_essential(self):
        self.draft["responses"]["mom"]["fan"] = "no"
        with self.assertRaises(ValueError):validate_draft(self.draft)


if __name__ == "__main__":
    unittest.main()
