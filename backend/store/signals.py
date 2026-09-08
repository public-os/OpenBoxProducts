"""
Order-place hone par admin notifications:
1. Admin ko email (EMAIL_HOST_USER -> ADMIN_NOTIFICATION_EMAIL)
2. Delivery details Telegram bot par (address, phone, items, total)

- post_save signal (Order create) se decoupled hook milta hai — views ko email ka
  pata nahi hota.
- transaction.on_commit: notifications tabhi schedule hote hain jab order DB mein
  successfully commit ho jaye. Atomic block rollback hua toh false alert nahi
  jata, aur is time tak OrderItems bhi save ho chuke hote hain.
- Dono sends daemon thread mein hain, isliye SMTP/Telegram slow/fail ho toh bhi
  customer ka place-order request block nahi hota.
"""

import logging
import threading

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Order
from .telegram import send_delivery_update

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Order)
def send_order_notification(sender, instance, created, **kwargs):
    if not created:  # sirf naya order, update par nahi
        return
    # create_order atomic block ke andar chalta hai — commit hone tak wait karo
    transaction.on_commit(lambda: _notify_admin(instance.pk))


def _notify_admin(order_pk):
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

    payment_status = order.get_payment_status_display()

    subject = f"New Order #{order.id} Received"
    message = (
        f"New order placed!\n"
        f"\n"
        f"Order ID: {order.id}\n"
        f"Order Ref: {order.order_ref}\n"
        f"Customer Name: {order.shipping_name}\n"
        f"Phone: {order.shipping_phone}\n"
        f"Address: {order.shipping_address}\n"
        f"Payment Status: {payment_status}\n"
        f"\n"
        f"Items:\n"
        f"{items_section}\n"
        f"\n"
        f"Total Amount: Rs.{order.total_amount}\n"
    )

    # daemon thread: request ko SMTP se decouple karta hai, shutdown par block nahi karta
    threading.Thread(
        target=_send_email,
        args=(subject, message),
        daemon=True,
    ).start()


def _send_email(subject, message):
    # Email (admin inbox) — config missing ho toh sirf email skip hota hai
    if settings.ADMIN_NOTIFICATION_EMAIL:
        sent = send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [settings.ADMIN_NOTIFICATION_EMAIL],
            fail_silently=True,  # order already place ho chuka hai — email fail par crash nahi
        )
        if not sent:
            logger.error("Order notification email send nahi ho paya: %s", subject)
    else:
        logger.warning(
            "Order email skip: ADMIN_NOTIFICATION_EMAIL configured nahi hai (.env mein set karo)."
        )

    # Delivery details bot par bhi same order info bhejo (address, phone, items)
    telegram_sent = send_delivery_update(f"🛒 {subject}\n\n{message}")
    if not telegram_sent:
        logger.warning("Order delivery telegram send nahi hua: %s", subject)
