"""The plans users can subscribe to. Ids are the app's own: each payment provider maps them to its
prices through environment variables, such as STRIPE_PRICE_PRO for the "pro" plan."""

from typing import Final, TypedDict


class Plan(TypedDict):
    id: str
    name: str
    description: str


PLANS: Final[tuple[Plan, ...]] = (
    {
        "id": "pro",
        "name": "Pro",
        "description": "Everything in the free plan, plus the paid features you build.",
    },
)


def find_plan(plan_id: object) -> Plan | None:
    """The plan with this id, or None for anything else."""
    return next((plan for plan in PLANS if plan["id"] == plan_id), None)
