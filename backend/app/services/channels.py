"""Outbound channels beyond in-app notifications.

Only a console provider ships; plug real providers (SES/SendGrid, MSG91/Twilio, WhatsApp Cloud API) in
here keyed by the *_PROVIDER settings. Calls are made from Celery tasks in production.
"""

import logging

from app.core.config import settings

log = logging.getLogger("swacchify.channels")


def send_email(to: str, subject: str, body: str) -> None:
    if settings.EMAIL_PROVIDER == "console":
        log.info("EMAIL to=%s subject=%s\n%s", to, subject, body)
        return
    raise NotImplementedError(f"email provider {settings.EMAIL_PROVIDER!r} not configured")


def send_sms(to: str | None, body: str) -> None:
    if not to:
        return
    if settings.SMS_PROVIDER == "console":
        log.info("SMS to=%s: %s", to, body)
        return
    raise NotImplementedError(f"sms provider {settings.SMS_PROVIDER!r} not configured")


def send_whatsapp(to: str | None, body: str) -> None:
    if not to:
        return
    if settings.WHATSAPP_PROVIDER == "console":
        log.info("WHATSAPP to=%s: %s", to, body)
        return
    raise NotImplementedError(f"whatsapp provider {settings.WHATSAPP_PROVIDER!r} not configured")
