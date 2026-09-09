from decimal import Decimal
import base64
import hashlib
import hmac
import json
import shutil
import tempfile
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
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
        self.assertEqual(res.status_code, 201)
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

    def test_login_incorrect_username(self):
        res = self.client.post('/api/login/', {'username': 'nonexistentuser', 'password': 'somepassword'})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data.get('detail'), 'Incorrect username')

    def test_login_incorrect_password(self):
        res = self.client.post('/api/login/', {'username': 'testuser', 'password': 'wrongpassword'})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data.get('detail'), 'Password is incorrect')


class PaymentVerificationTest(TestCase):
    """Razorpay payment verification — order sirf valid signature par hi PAID hota hai."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='payuser', password='password123')
        self.client.force_authenticate(user=self.user)
        self.order = Order.objects.create(
            user=self.user,
            total_amount=Decimal('440.00'),
            order_ref='OB1234567890',
        )

    def _signature(self, order_id, payment_id, secret='test_secret'):
        return hmac.new(
            secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
        ).hexdigest()

    @override_settings(RAZORPAY_KEY_ID='', RAZORPAY_KEY_SECRET='')
    def test_create_payment_requires_gateway_keys(self):
        res = self.client.post(f'/api/orders/{self.order.id}/create-payment/')
        self.assertEqual(res.status_code, 503)

    @override_settings(RAZORPAY_KEY_ID='rzp_test_x', RAZORPAY_KEY_SECRET='test_secret')
    def test_verify_payment_valid_signature_marks_paid(self):
        self.order.gateway_order_id = 'order_test123'
        self.order.save()

        payment_id = 'pay_test456'
        res = self.client.post(
            f'/api/orders/{self.order.id}/verify-payment/',
            {
                'razorpay_order_id': 'order_test123',
                'razorpay_payment_id': payment_id,
                'razorpay_signature': self._signature('order_test123', payment_id),
            },
        )
        self.assertEqual(res.status_code, 200)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, 'paid')
        self.assertEqual(self.order.status, 'paid')
        self.assertEqual(self.order.payment_ref, payment_id)
        self.assertIsNotNone(self.order.paid_at)

    def test_verify_payment_bad_signature_rejected(self):
        self.order.gateway_order_id = 'order_test123'
        self.order.save()

        res = self.client.post(
            f'/api/orders/{self.order.id}/verify-payment/',
            {
                'razorpay_order_id': 'order_test123',
                'razorpay_payment_id': 'pay_fake',
                'razorpay_signature': 'deadbeef',
            },
        )
        self.assertEqual(res.status_code, 400)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, 'pending')

    def test_verify_payment_order_mismatch_rejected(self):
        # doosre gateway order ka signature is order par kaam nahi karega
        self.order.gateway_order_id = 'order_test123'
        self.order.save()

        res = self.client.post(
            f'/api/orders/{self.order.id}/verify-payment/',
            {
                'razorpay_order_id': 'order_OTHER',
                'razorpay_payment_id': 'pay_test456',
                'razorpay_signature': self._signature('order_OTHER', 'pay_test456'),
            },
        )
        self.assertEqual(res.status_code, 400)

    @override_settings(RAZORPAY_WEBHOOK_SECRET='whsec_test')
    def test_webhook_payment_captured_marks_paid(self):
        self.order.gateway_order_id = 'order_test123'
        self.order.save()

        payload = json.dumps({
            'event': 'payment.captured',
            'payload': {'payment': {'entity': {
                'id': 'pay_hook1', 'order_id': 'order_test123', 'status': 'captured',
            }}},
        }).encode()
        signature = hmac.new(b'whsec_test', payload, hashlib.sha256).hexdigest()

        res = self.client.post(
            '/api/payments/webhook/', payload,
            content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=signature,
        )
        self.assertEqual(res.status_code, 200)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, 'paid')

    @override_settings(RAZORPAY_WEBHOOK_SECRET='whsec_test')
    def test_webhook_bad_signature_rejected(self):
        res = self.client.post(
            '/api/payments/webhook/', b'{"event": "payment.captured"}',
            content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE='nope',
        )
        self.assertEqual(res.status_code, 400)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, 'pending')

    @override_settings(RAZORPAY_WEBHOOK_SECRET='whsec_test')
    def test_webhook_failed_payment_marks_failed(self):
        self.order.gateway_order_id = 'order_test123'
        self.order.save()

        payload = json.dumps({
            'event': 'payment.failed',
            'payload': {'payment': {'entity': {
                'id': 'pay_fail1', 'order_id': 'order_test123',
            }}},
        }).encode()
        signature = hmac.new(b'whsec_test', payload, hashlib.sha256).hexdigest()

        res = self.client.post(
            '/api/payments/webhook/', payload,
            content_type='application/json', HTTP_X_RAZORPAY_SIGNATURE=signature,
        )
        self.assertEqual(res.status_code, 200)

        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, 'failed')


class CancelOrderTest(StoreTestCase):
    """Pending order remove — stock wapas restore hota hai."""

    def test_cancel_pending_order_restores_stock(self):
        # Order create: red variant stock 5 -> 3
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
        })
        self.assertEqual(res.status_code, 201)
        order_id = res.data['order_id']

        res = self.client.post(f'/api/orders/{order_id}/cancel/')
        self.assertEqual(res.status_code, 200)

        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, 'cancelled')

        # Stock wapas: 3 -> 5
        self.var_red.refresh_from_db()
        self.assertEqual(self.var_red.stock, 5)

        # Cancelled order ab pending list me nahi aayega
        res = self.client.get('/api/orders/')
        self.assertEqual([o['status'] for o in res.data if o['status'] == 'pending'], [])

    def test_cancel_paid_order_rejected(self):
        self.client.post('/api/cart/add/', {
            'product_id': self.prod_var.id,
            'variant_id': self.var_red.id,
        })
        res = self.client.post('/api/orders/create/', {
            'name': 'Test User',
            'address': '123 Main St',
            'phone': '9876543210',
        })
        order_id = res.data['order_id']

        order = Order.objects.get(id=order_id)
        order.status = 'paid'
        order.save()

        res = self.client.post(f'/api/orders/{order_id}/cancel/')
        self.assertEqual(res.status_code, 400)

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')


class UpdateShippingTest(StoreTestCase):
    """Review & Pay se wapas address edit — sirf pending (unpaid) order allowed."""

    def _create_order(self):
        self.client.post('/api/cart/add/', {'product_id': self.prod_simple.id})
        res = self.client.post('/api/orders/create/', {
            'name': 'Test User',
            'address': '123 Main St',
            'phone': '9876543210',
        })
        self.assertEqual(res.status_code, 201)
        return res.data['order_id']

    def test_update_pending_order_shipping(self):
        order_id = self._create_order()

        res = self.client.post(f'/api/orders/{order_id}/update-shipping/', {
            'name': 'Updated Name',
            'address': '456 New Lane, Delhi',
            'phone': '9123456780',
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['shipping_name'], 'Updated Name')
        self.assertEqual(res.data['shipping_address'], '456 New Lane, Delhi')
        self.assertEqual(res.data['shipping_phone'], '9123456780')

        order = Order.objects.get(id=order_id)
        self.assertEqual(order.shipping_name, 'Updated Name')
        self.assertEqual(order.shipping_address, '456 New Lane, Delhi')
        self.assertEqual(order.shipping_phone, '9123456780')
        # Order pending hi rehna chahiye — koi stock/cart change nahi
        self.assertEqual(order.status, 'pending')
        self.assertEqual(order.items.count(), 1)

    def test_update_rejects_invalid_phone(self):
        order_id = self._create_order()
        res = self.client.post(f'/api/orders/{order_id}/update-shipping/', {
            'name': 'Test User', 'address': '123 Main St', 'phone': 'abc123',
        })
        self.assertEqual(res.status_code, 400)

    def test_update_missing_address_rejected(self):
        order_id = self._create_order()
        res = self.client.post(f'/api/orders/{order_id}/update-shipping/', {
            'name': 'Test User', 'address': '', 'phone': '9876543210',
        })
        self.assertEqual(res.status_code, 400)

    def test_update_paid_order_rejected(self):
        order_id = self._create_order()
        Order.objects.filter(id=order_id).update(status='paid', payment_status='paid')

        res = self.client.post(f'/api/orders/{order_id}/update-shipping/', {
            'name': 'Test User', 'address': 'New Address', 'phone': '9876543210',
        })
        self.assertEqual(res.status_code, 400)

        order = Order.objects.get(id=order_id)
        self.assertEqual(order.shipping_address, '123 Main St')

    def test_update_other_users_order_rejected(self):
        order_id = self._create_order()
        other = User.objects.create_user(username='otheruser', password='password123')
        self.client.force_authenticate(user=other)

        res = self.client.post(f'/api/orders/{order_id}/update-shipping/', {
            'name': 'Test User', 'address': 'New Address', 'phone': '9876543210',
        })
        self.assertEqual(res.status_code, 404)


# Valid 1x1 transparent PNG
PNG_1PX = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
)


class ProfileImageTests(TestCase):
    """Profile image: upload > Google photo > Gravatar > default (null)."""

    def setUp(self):
        # Uploads test ke MEDIA_ROOT me na jayen
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)

        self.client = APIClient()
        self.user = User.objects.create_user(
            username='imguser', password='password123', email='ImgUser@Example.com'
        )
        UserProfile.objects.create(user=self.user, phone='9999999999')
        self.client.force_authenticate(user=self.user)

    def _png(self, name='avatar.png', content=PNG_1PX):
        return SimpleUploadedFile(name, content, content_type='image/png')

    def test_avatar_upload_sets_profile_image(self):
        res = self.client.post('/api/user/profile/avatar/', {'avatar': self._png()}, format='multipart')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['profile_image_source'], 'upload')
        self.assertIn('/media/profile_pics/', res.data['profile_image'])

        # GET /api/user/profile/ bhi same image dikhaye
        res = self.client.get('/api/user/profile/')
        self.assertEqual(res.data['profile_image_source'], 'upload')
        self.assertIn('/media/profile_pics/', res.data['profile_image'])

    def test_avatar_replace_deletes_old_file(self):
        res = self.client.post('/api/user/profile/avatar/', {'avatar': self._png('one.png')}, format='multipart')
        first_path = UserProfile.objects.get(user=self.user).avatar.path
        res = self.client.post('/api/user/profile/avatar/', {'avatar': self._png('two.png')}, format='multipart')
        self.assertEqual(res.status_code, 200)

        import os
        self.assertFalse(os.path.exists(first_path), 'purani avatar file delete honi chahiye')
        self.assertTrue(os.path.exists(UserProfile.objects.get(user=self.user).avatar.path))

    def test_avatar_rejects_non_image(self):
        fake = SimpleUploadedFile('note.txt', b'not an image', content_type='text/plain')
        res = self.client.post('/api/user/profile/avatar/', {'avatar': fake}, format='multipart')
        self.assertEqual(res.status_code, 400)

    def test_avatar_rejects_oversized_file(self):
        big = self._png('big.png', content=PNG_1PX + b'\0' * (5 * 1024 * 1024))
        res = self.client.post('/api/user/profile/avatar/', {'avatar': big}, format='multipart')
        self.assertEqual(res.status_code, 400)

    def test_avatar_missing_file(self):
        res = self.client.post('/api/user/profile/avatar/', {}, format='multipart')
        self.assertEqual(res.status_code, 400)

    def test_delete_avatar_falls_back_to_gravatar(self):
        self.client.post('/api/user/profile/avatar/', {'avatar': self._png()}, format='multipart')
        res = self.client.delete('/api/user/profile/avatar/')
        self.assertEqual(res.status_code, 200)

        self.assertEqual(res.data['profile_image_source'], 'gravatar')
        expected = hashlib.md5(b'imguser@example.com').hexdigest()
        self.assertIn(f'/avatar/{expected}', res.data['profile_image'])

        profile = UserProfile.objects.get(user=self.user)
        self.assertFalse(profile.avatar)

    def test_no_image_no_email_returns_null_image(self):
        # Email hata do — ab koi source nahi, frontend default logo dikhayega
        self.user.email = ''
        self.user.save()
        res = self.client.get('/api/user/profile/')
        self.assertIsNone(res.data['profile_image'])
        self.assertIsNone(res.data['profile_image_source'])

    def test_google_login_saves_picture(self):
        tokeninfo = {
            'aud': settings.GOOGLE_CLIENT_ID,
            'email_verified': 'true',
            'email': 'g.user@gmail.com',
            'given_name': 'G',
            'picture': 'https://lh3.googleusercontent.com/a/photo.jpg',
        }
        with mock.patch('store.views.requests.get') as mock_get:
            mock_get.return_value = mock.Mock(status_code=200, json=lambda: tokeninfo)
            res = self.client.post('/api/google-login/', {'credential': 'fake-token'}, format='json')

        self.assertEqual(res.status_code, 200)
        profile = User.objects.get(email='g.user@gmail.com').userprofile
        self.assertEqual(profile.picture, tokeninfo['picture'])

        # Google photo profile_image ban jaye (koi upload nahi hai)
        self.client.force_authenticate(user=profile.user)
        res = self.client.get('/api/user/profile/')
        self.assertEqual(res.data['profile_image_source'], 'google')
        self.assertEqual(res.data['profile_image'], tokeninfo['picture'])


