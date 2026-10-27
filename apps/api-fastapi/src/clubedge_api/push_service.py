"""The API's push notifications: `from clubedge_api.push_service import push_notifications`, then
`await push_notifications().send(user, PushMessage(title, body, {"url": "/"}))`.

Notifications through Expo's push service, which delivers them to the native app with the
credentials EAS keeps for it. EXPO_ACCESS_TOKEN is only needed when the Expo project requires one.
"""

import os
from functools import cache

from clubedge_api.push import PushNotifications
from clubedge_api.push_expo import ExpoPush
from clubedge_api.settings import get_settings


@cache
def push_notifications() -> PushNotifications:
    """Made on first use, so imports read nothing."""
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    access_token = os.environ.get("EXPO_ACCESS_TOKEN", "").strip() or None
    return PushNotifications(("expo",), ExpoPush(access_token))
