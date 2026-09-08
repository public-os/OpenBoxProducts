"""
Telegram bot — apna chat_id nikalne aur bot ke messages live dekhne ke liye.

Project mein do bots hain:

1. Notify bot (customer "Notify Me" requests):
   Run:  python telegram_bot.py
   Env:  TELEGRAM_BOT_TOKEN  ->  chat_id ko TELEGRAM_CHAT_ID mein daalo

2. Delivery bot (naye order ki delivery details):
   Run:  python telegram_bot.py delivery
   Env:  TELEGRAM_DELIVERY_BOT_TOKEN  ->  chat_id ko TELEGRAM_DELIVERY_CHAT_ID mein daalo

Kaise use karein:
1. Script run karo (upar ke arguments ke saath)
2. Telegram app mein us bot ko /start bhejo
3. Script chat_id print karega — wahi .env mein sahi variable mein daalo
4. Backend restart karo — bas, alerts us Telegram par aane lagenge

Script chalta rehta hai toh bot par aane wale saare messages bhi live dikhenge.
Band karne ke liye Ctrl+C.
"""

import os
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv()

DELIVERY = len(sys.argv) > 1 and sys.argv[1] == "delivery"

if DELIVERY:
    TOKEN = os.getenv("TELEGRAM_DELIVERY_BOT_TOKEN", "").strip()
    CHAT_VAR = "TELEGRAM_DELIVERY_CHAT_ID"
    LABEL = "Delivery bot"
else:
    TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    CHAT_VAR = "TELEGRAM_CHAT_ID"
    LABEL = "Notify bot"

API = f"https://api.telegram.org/bot{TOKEN}"


def main():
    if not TOKEN:
        print(f"❌ backend/.env mein {'TELEGRAM_DELIVERY_BOT_TOKEN' if DELIVERY else 'TELEGRAM_BOT_TOKEN'} set nahi hai.")
        return

    # Bot ki identity check karo
    me = requests.get(f"{API}/getMe", timeout=10).json()
    if not me.get("ok"):
        print("❌ Token galat lag raha hai:", me)
        return
    print(f"✅ [{LABEL}] Bot connected: @{me['result']['username']}")
    print("📢 Ab Telegram app mein is bot ko /start bhejo...")
    print("   (band karne ke liye Ctrl+C)\n")

    offset = None
    seen_chats = set()

    while True:
        try:
            params = {"timeout": 30}
            if offset:
                params["offset"] = offset
            res = requests.get(f"{API}/getUpdates", params=params, timeout=35)
            data = res.json()

            for upd in data.get("result", []):
                offset = upd["update_id"] + 1
                msg = upd.get("message") or upd.get("edited_message") or {}
                chat = msg.get("chat", {})
                chat_id = chat.get("id")
                if not chat_id:
                    continue
                sender = chat.get("first_name") or chat.get("title") or "?"
                text = msg.get("text", "")

                print(f"💬 Message from {sender}: {text!r}")
                print(f"   ➡️  chat_id = {chat_id}")
                if chat_id not in seen_chats:
                    seen_chats.add(chat_id)
                    print(
                        "\n   ⭐ Ye aapka chat_id hai — ise backend/.env mein daalo:\n"
                        f"      {CHAT_VAR}={chat_id}\n   phir backend restart karo.\n"
                    )
                    # Confirmation reply bhejo
                    requests.post(
                        f"{API}/sendMessage",
                        json={
                            "chat_id": chat_id,
                            "text": (
                                f"✅ [{LABEL}] Chat ID: {chat_id}\n"
                                f"Ise backend/.env mein {CHAT_VAR} ke roop mein daalo."
                            ),
                        },
                        timeout=10,
                    )
        except requests.RequestException as exc:
            print("Network error, 3s mein retry:", exc)
            time.sleep(3)
        except KeyboardInterrupt:
            print("\nBot band kar diya.")
            break


if __name__ == "__main__":
    main()
