from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from store.models import Category, Product, ProductVariant, Cart, CartItem, Order, OrderItem, UserProfile, OTPVerification


class StoreTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='testuser', password='password123', first_name='Test User')
        self.profile = UserProfile.objects.create(user=self.user, phone='9876543210', address='123 Main St')
        self.client.force_authenticate(user=self.user)

        self.category = Category.objects.create(name='Electronics', slug='electronics')
        
        # Product without variants
        self.prod_simple = Product.objects.create(
            category=self.category,
            name='Simple Product',
            price=Decimal('100.00'),
            stock=10
        )
        
        # Product with variants
        self.prod_var = Product.objects.create(
            category=self.category,
            name='Variant Product',
            price=Decimal('200.00'),
            stock=0
        )
        self.var_red = ProductVariant.objects.create(
            product=self.prod_var,
            color_name='Red',
            stock=5,
            extra_price=Decimal('20.00')
        )
        self.var_blue = ProductVariant.objects.create(
            product=self.prod_var,
            color_name='Blue',
            stock=3,
            extra_price=Decimal('10.00')
        )

    def test_recalculate_stock_preserves_simple_product_stock(self):
        self.prod_simple.recalculate_stock()
        self.assertEqual(self.prod_simple.stock, 10)

        # Variant product stock should equal sum of variants (5 + 3 = 8)
        self.prod_var.refresh_from_db()
        self.assertEqual(self.prod_var.stock, 8)

    def test_add_to_cart_with_variant(self):
        res = self.client.post('/api/cart/add/', {
            'product_id': self.prod_var.id,
            'variant_id': self.var_red.id,
        })
        self.assertEqual(res.status_code, 200)
        cart = Cart.objects.get(user=self.user)
        self.assertEqual(cart.items.count(), 1)
        item = cart.items.first()
        self.assertEqual(item.variant, self.var_red)
        self.assertEqual(item.quantity, 1)

    def test_update_cart_quantity_stock_limit(self):
        res = self.client.post('/api/cart/add/', {
            'product_id': self.prod_var.id,
            'variant_id': self.var_red.id,
        })
        item_id = res.data['cart']['items'][0]['id']
        
        # Attempt to set quantity > variant stock (5)
        res2 = self.client.post('/api/cart/update/', {
            'item_id': item_id,
            'quantity': 10
        })
        self.assertEqual(res2.status_code, 400)
        self.assertIn('Only 5 unit(s)', res2.data['error'])

    def test_create_order_with_variant(self):
        # Add red variant (price 220, stock 5) x 2
        self.client.post('/api/cart/add/', {
            'product_id': self.prod_var.id,
            'variant_id': self.var_red.id,
        })
        cart_item = CartItem.objects.get(cart__user=self.user)
        cart_item.quantity = 2
        cart_item.save()

        res = self.client.post('/api/orders/create/', {
            'name': 'Test User',
            'address': '123 Main St',
            'phone': '9876543210',
            'payment_method': 'ONLINE'
        })
        self.assertEqual(res.status_code, 200)
        order_id = res.data['order_id']

        order = Order.objects.get(id=order_id)
        # Total should be 2 * (200 + 20) = 440.00
        self.assertEqual(order.total_amount, Decimal('440.00'))

        order_item = order.items.first()
        self.assertEqual(order_item.variant, self.var_red)
        self.assertEqual(order_item.price, Decimal('220.00'))

        # Variant stock should be reduced from 5 to 3
        self.var_red.refresh_from_db()
        self.assertEqual(self.var_red.stock, 3)

    def test_reset_password_otp_latest(self):
        OTPVerification.objects.create(phone='9876543210', otp='111111')
        OTPVerification.objects.create(phone='9876543210', otp='222222')

        res = self.client.post('/api/reset-password/', {
            'identifier': 'testuser',
            'otp': '222222',
            'password': 'NewPassword123!',
            'password2': 'NewPassword123!'
        })
        self.assertEqual(res.status_code, 200)

    def test_admin_product_change_view(self):
        admin_user = User.objects.create_superuser(username='admin', password='password', email='admin@example.com')
        self.client.force_login(admin_user)
        res = self.client.get(f'/admin/store/product/{self.prod_var.id}/change/')
        self.assertEqual(res.status_code, 200)

