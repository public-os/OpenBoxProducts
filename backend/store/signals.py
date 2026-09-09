"""
Payment success (order PAID mark) hone par admin notifications:
1. Admin ko email (EMAIL_HOST_USER -> ADMIN_NOTIFICATION_EMAIL)
2. Delivery details Telegram bot par (address, phone, items, total, payment id)

Notification sirf verified payment ke baad jaati hai — pending/unpaid order ke
liye kuch nahi bheja jata. verify_payment view aur Razorpay webhook dono
_mark_order_paid se isse call karte hain, aur wo sirf pending->paid transition
par notify karta hai (idempotent — double events par duplicate alert nahi).
"""

import logging
import threading

from django.conf import settings
from django.core.mail import send_mail

from .telegram import send_delivery_update

logger = logging.getLogger(__name__)


def notify_order_paid(order_pk):
    """PAID order ki admin notification — daemon thread mein (SMTP/Telegram
    slow/fail ho toh bhi payment verify request block nahi hota)."""
    threading.Thread(
        target=_notify_admin_order_paid, args=(order_pk,), daemon=True
    ).start()


def _notify_admin_order_paid(order_pk):
    from .models import Order

    try:
        order = Order.objects.prefetch_related(
            'items__product', 'items__variant'
        ).get(pk=order_pk)
    except Order.DoesNotExist:
        return

    item_lines = []
    for item in order.items.all():
        color = f" ({item.variant.color_name})" if item.variant else ""
        item_lines.append(
            f"- {item.product.name}{color} x {item.quantity} @ "
            f"Rs.{item.price} = Rs.{item.subtotal}"
        )
    items_section = "\n".join(item_lines) if item_lines else "(no items)"

    subject = f"New Order #{order.id} Paid (Payment Verified)"
    message = (
        f"Payment verified — order placed!\n"
        f"\n"
        f"Order ID: {order.id}\n"
        f"Order Ref: {order.order_ref}\n"
        f"Payment ID: {order.payment_ref or '—'}\n"
        f"Paid At: {order.paid_at.strftime('%d %b %Y, %I:%M %p')} (UTC)\n"
        f"Customer Name: {order.shipping_name}\n"
        f"Phone: {order.shipping_phone}\n"
        f"Address: {order.shipping_address}\n"
        f"\n"
        f"Items:\n"
        f"{items_section}\n"
        f"\n"
        f"Total Amount: Rs.{order.total_amount}\n"
    )

    # Email (admin inbox) — config missing ho toh sirf email skip hota hai
    if settings.ADMIN_NOTIFICATION_EMAIL:
        sent = send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [settings.ADMIN_NOTIFICATION_EMAIL],
            fail_silently=True,  # order paid ho chuka hai — email fail par crash nahi
        )
        if not sent:
            logger.error("Order paid notification email send nahi ho paya: %s", subject)
    else:
        logger.warning(
            "Order email skip: ADMIN_NOTIFICATION_EMAIL configured nahi hai (.env mein set karo)."
        )

    # Delivery details bot par bhi same order info bhejo (address, phone, items)
    telegram_sent = send_delivery_update(f"🛒 {subject}\n\n{message}")
    if not telegram_sent:
        logger.warning("Order delivery telegram send nahi hua: %s", subject)
