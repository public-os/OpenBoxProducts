"""
Demo reviews seed karo — Blinkit-style rating badge (jo sirf 10+ reviews par
dikhta hai) locally test karne ke liye.

Usage:
    python manage.py seed_reviews                  # har product ko 15 demo reviews
    python manage.py seed_reviews --count 5        # sirf 5 reviews (badge chhupa rahega)
    python manage.py seed_reviews --count 0        # test: koi naya review nahi
    python manage.py seed_reviews --clear          # saare reviews delete

Demo users (demo_user_1 ...) re-run par reuse hote hain; products jin par
user ne review de rakha hai wo skip hote hain.
"""
import random

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from store.models import Product, Review

COMMENTS = [
    "Great product, exactly as described!",
    "Good quality for the price.",
    "Delivery was fast, packaging was neat.",
    "Works perfectly, would buy again.",
    "Value for money!",
    "Decent product, met my expectations.",
    "Loved it. Highly recommended.",
    "Average quality, does the job.",
    "Excellent — better than expected.",
    "Packaging could be better but product is fine.",
]


class Command(BaseCommand):
    help = "Seed demo reviews for testing the rating badge (10+ reviews par dikhta hai)."

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=15,
                            help='Har product par kitne naye reviews (default 15)')
        parser.add_argument('--clear', action='store_true',
                            help='Saare reviews delete kar do')

    @transaction.atomic
    def handle(self, *args, **options):
        if options['clear']:
            deleted, _ = Review.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted} review(s)."))
            return

        count = options['count']
        if count <= 0:
            self.stdout.write(self.style.WARNING("--count 0 — kuch nahi kiya."))
            return

        # Demo users (pehle se hain toh reuse)
        users = []
        for i in range(1, count + 1):
            user, _ = User.objects.get_or_create(
                username=f"demo_user_{i}",
                defaults={'first_name': f"Demo {i}", 'email': ''},
            )
            users.append(user)

        created = 0
        for product in Product.objects.all():
            existing = set(Review.objects.filter(product=product).values_list('user_id', flat=True))
            new_reviews = []
            for user in users:
                if user.id in existing:
                    continue
                # Zyada tar 4-5 star, kuch 3 — realistic distribution
                rating = random.choices([3, 4, 5], weights=[1, 3, 6])[0]
                new_reviews.append(Review.objects.create(
                    product=product,
                    user=user,
                    rating=rating,
                    comment=random.choice(COMMENTS),
                ))
                created += 1

            # Naye reviews par random likes — "most liked first" sorting demo ke liye
            for review in new_reviews:
                like_count = random.randint(0, len(users))
                review.liked_by.set(random.sample(users, like_count))

        self.stdout.write(self.style.SUCCESS(
            f"{created} review(s) created across {Product.objects.count()} product(s)."
        ))
