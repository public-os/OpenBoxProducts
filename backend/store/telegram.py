"""
Telegram Bot API helper — do bots:

1. Notify bot      -> "Notify Me" customer requests (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)
2. Delivery bot    -> naye order ki delivery details (TELEGRAM_DELIVERY_BOT_TOKEN / TELEGRAM_DELIVERY_CHAT_ID)

Setup (dono ka same):
1. backend/.env mein bot token (@BotFather se mila)
2. backend/telegram_bot.py chalao (delivery ke liye: python telegram_bot.py delivery),
   bot ko /start bhejo, chat_id copy karke .env mein daalo
3. Backend restart
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org/bot{token}/{method}"


def _send_to_bot(token, chat_id, text, label):
    """Ek bot ke chat par message bhejo. Success True, warna False."""
    if not token or not chat_id:
        logger.warning(
            "Telegram (%s) skip: token / chat_id set nahi hai (.env).", label
        )
        return False

    try:
        res = requests.post(
            API_BASE.format(token=token, method="sendMessage"),
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.error("Telegram (%s) sendMessage error: %s", label, exc)
        return False

    if res.status_code != 200:
        logger.error(
            "Telegram (%s) sendMessage failed: %s %s",
            label, res.status_code, res.text[:200],
        )
        return False
    return True


def send_telegram_message(text):
    """Notify bot: customer ki 'Notify Me' request owner ko."""
    return _send_to_bot(
        settings.TELEGRAM_BOT_TOKEN, settings.TELEGRAM_CHAT_ID, text, "notify bot"
    )


def send_delivery_update(text):
    """Delivery bot: naye order ki delivery details owner ko."""
    return _send_to_bot(
        settings.TELEGRAM_DELIVERY_BOT_TOKEN,
        settings.TELEGRAM_DELIVERY_CHAT_ID,
        text,
        "delivery bot",
    )
