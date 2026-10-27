"""The API's push notifications: `from clubedge_api.push_service import push_notifications`, then
`await push_notifications().send(user, PushMessage(title, body, {"url": "/"}))`.

Notifications straight through FCM for Android and APNs for iOS, each once its credentials are set
(FCM_* and APNS_*). Tokens are saved before then, and reached once they are.
"""

from functools import cache

from clubedge_api.push import PushNotifications
from clubedge_api.push_native import native_push
from clubedge_api.settings import get_settings


@cache
def push_notifications() -> PushNotifications:
    """Made on first use, so imports read nothing."""
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    return PushNotifications(("fcm", "apns"), native_push())
