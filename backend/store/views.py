import os
import random
import requests
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import status, exceptions
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Product, Category, Cart, CartItem, Order, OrderItem, UserProfile, OTPVerification, ProductVariant
from .serializers import (
    RegisterSerializer, UserSerializer,
    ProductSerializer, CategorySerializer, CartSerializer, CartItemSerializer,
)

OTP_EXPIRY_MINUTES = 5


# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------

def _mask_phone(phone):
    return f"{phone[:2]}xxxxx{phone[-3:]}" if len(phone) >= 5 else phone


def _generate_and_send_otp(phone):
    """Create a fresh OTP for the phone number and try to deliver it via Fast2SMS.
    Returns (otp_code, sms_sent, sms_error)."""
    otp_code = str(random.randint(100000, 999999))
    OTPVerification.objects.filter(phone=phone).delete()
    OTPVerification.objects.create(phone=phone, otp=otp_code)

    fast2sms_key = os.getenv('FAST2SMS_API_KEY')
    sms_sent = False
    sms_error = 'SMS gateway not configured (set FAST2SMS_API_KEY in backend/.env).'
    if fast2sms_key:
        sms_error = None
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            payload = f"variables_values={otp_code}&route=otp&numbers={phone}"
            headers = {
                'authorization': fast2sms_key,
                'Content-Type': "application/x-www-form-urlencoded"
            }
            res = requests.post(url, data=payload, headers=headers, timeout=10)
            try:
                body = res.json()
            except ValueError:
                body = {}
            # Fast2SMS can return HTTP 200 with return:false on API errors,
            # so the body flag must be checked, not just the status code.
            if res.status_code == 200 and body.get('return') is True:
                sms_sent = True
                print(f"✅ [FAST2SMS] OTP SMS delivered to +91 {phone}")
            else:
                sms_error = str(body.get('message') or res.text)[:200]
                print(f"⚠️ [FAST2SMS ({res.status_code})]: {sms_error}")
        except Exception as sms_err:
            sms_error = f"Could not reach SMS gateway: {sms_err}"
            print(f"⚠️ [FAST2SMS EXCEPTION]: {sms_err}")

    if not sms_sent:
        print(f"\n=== OTP for +91 {phone}: {otp_code} (valid {OTP_EXPIRY_MINUTES} min) ===\n")
    return otp_code, sms_sent, sms_error


def _find_user_by_identifier(identifier):
    """Find a user by username or by the mobile number on their profile."""
    identifier = (identifier or '').strip()
    if not identifier:
        return None
    user = User.objects.filter(username__iexact=identifier).first()
    if user:
        return user
    profile = UserProfile.objects.filter(phone=identifier).first()
    return profile.user if profile else None


def _user_phone(user):
    profile = UserProfile.objects.filter(user=user).first()
    return profile.phone if profile else ''


# ------------------------------------------------------------------
# Auth views
# ------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(
            {"message": "User created successfully", "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        username = (attrs.get(self.username_field) or '').strip()
        password = attrs.get('password') or ''

        user = User.objects.filter(username__iexact=username).first()
        if not user:
            raise exceptions.AuthenticationFailed(
                'Incorrect username',
                'incorrect_username',
            )

        if not user.is_active:
            raise exceptions.AuthenticationFailed(
                'Account is inactive',
                'account_inactive',
            )

        authenticated_user = authenticate(
            request=self.context.get('request'),
            username=user.username,
            password=password,
        )

        if not authenticated_user:
            raise exceptions.AuthenticationFailed(
                'Password is incorrect',
                'incorrect_password',
            )

        self.user = authenticated_user

        refresh = self.get_token(self.user)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': {
                'username': self.user.username,
                'name': self.user.first_name or self.user.username,
                'email': self.user.email,
                'phone': _user_phone(self.user),
            },
        }


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def forgot_password(request):
    identifier = str(request.data.get('identifier', '')).strip()
    if not identifier:
        return Response({'error': 'Username or mobile number is required'}, status=400)

    user = _find_user_by_identifier(identifier)
    if user is None:
        return Response({'error': 'No account found with that username or mobile number'}, status=404)

    phone = _user_phone(user)
    if not phone:
        return Response(
            {'error': 'This account has no mobile number linked. Continue with Google instead.'},
            status=400
        )

    otp_code, sms_sent, sms_error = _generate_and_send_otp(phone)

    response_data = {
        'message': f'OTP sent to mobile number ending {_mask_phone(phone)}' if sms_sent
                   else f'OTP generated. SMS delivery failed: {sms_error}',
        'phone_masked': _mask_phone(phone),
        'sms_sent': sms_sent,
    }
    # Dev convenience only: expose the OTP when SMS could not be delivered.
    if not sms_sent and settings.DEBUG:
        response_data['dev_otp'] = otp_code
    return Response(response_data)


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    identifier = str(request.data.get('identifier', '')).strip()
    otp = str(request.data.get('otp', '')).strip()
    password = str(request.data.get('password', ''))
    password2 = str(request.data.get('password2', ''))

    if not identifier or not otp:
        return Response({'error': 'Username/mobile and OTP are required'}, status=400)

    user = _find_user_by_identifier(identifier)
    phone = _user_phone(user) if user else ''
    record = OTPVerification.objects.filter(phone=phone).order_by('-created_at', '-id').first() if phone else None

    if not record or record.otp != otp:
        return Response({'error': 'Invalid OTP. Please check and try again.'}, status=400)

    if timezone.now() - record.created_at > timedelta(minutes=OTP_EXPIRY_MINUTES):
        record.delete()
        return Response({'error': 'OTP has expired. Please request a new one.'}, status=400)

    if password2 and password != password2:
        return Response({'error': 'Passwords do not match.'}, status=400)

    try:
        validate_password(password, user=user)
    except ValidationError as e:
        return Response({'error': '; '.join(e.messages)}, status=400)

    user.set_password(password)
    user.save(update_fields=['password'])
    record.delete()

    return Response({'message': 'Password reset successfully. Please login with your new password.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def google_login(request):
    credential = str(request.data.get('credential', '')).strip()
    if not credential:
        return Response({'error': 'Google credential is required'}, status=400)

    client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '')
    if not client_id:
        return Response(
            {'error': 'Google sign-in is not configured on the server (set GOOGLE_CLIENT_ID in backend/.env).'},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )

    try:
        res = requests.get(
            'https://oauth2.googleapis.com/tokeninfo',
            params={'id_token': credential},
            timeout=10,
        )
    except requests.RequestException:
        return Response({'error': 'Could not verify Google sign-in. Please try again.'}, status=502)

    if res.status_code != 200:
        return Response({'error': 'Invalid Google credential'}, status=400)

    info = res.json()
    if info.get('aud') != client_id:
        return Response({'error': 'Google credential was issued for a different app'}, status=400)
    if str(info.get('email_verified', '')).lower() != 'true':
        return Response({'error': 'Your Google account email is not verified'}, status=400)

    email = info.get('email', '').lower()
    if not email:
        return Response({'error': 'Google account has no email'}, status=400)

    with transaction.atomic():
        user = User.objects.filter(email__iexact=email).first()
        created = False
        if not user:
            base = (email.split('@')[0] or 'google_user').replace('.', '')[:140]
            username = base
            suffix = 1
            while User.objects.filter(username__iexact=username).exists():
                username = f"{base}{suffix}"
                suffix += 1
            user = User.objects.create_user(
                username=username,
                email=email,
                first_name=(info.get('given_name') or '')[:150],
            )
            user.set_unusable_password()
            user.save()
            created = True
        UserProfile.objects.get_or_create(user=user)

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'created': created,
        'user': {
            'username': user.username,
            'name': user.first_name or user.username,
            'email': user.email,
            'phone': _user_phone(user),
        }
    })


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def user_profile(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)

    if request.method == 'PATCH':
        data = request.data

        name = data.get('name')
        if name is not None:
            request.user.first_name = str(name).strip()[:150]

        email = str(data.get('email') or '').strip()
        if email:
            if User.objects.filter(email__iexact=email).exclude(pk=request.user.pk).exists():
                return Response({'error': 'This email is already in use'}, status=400)
        if data.get('email') is not None:
            request.user.email = email

        if 'phone' in data:
            phone = str(data.get('phone') or '').strip()
            if phone and (not phone.isdigit() or len(phone) != 10):
                return Response({'error': 'Mobile number must be exactly 10 digits'}, status=400)
            if phone and UserProfile.objects.filter(phone=phone).exclude(user=request.user).exists():
                return Response({'error': 'This mobile number is already linked to another account'}, status=400)
            profile.phone = phone

        if 'address' in data:
            profile.address = str(data.get('address') or '').strip()

        request.user.save()
        profile.save()

    return Response({
        'username': request.user.username,
        'name': request.user.first_name or request.user.username,
        'email': request.user.email,
        'phone': profile.phone,
        'address': profile.address,
    })


# ------------------------------------------------------------------
# Catalog
# ------------------------------------------------------------------

@api_view(['GET'])
def get_products(request):
    products = Product.objects.select_related('category').all()
    serializer = ProductSerializer(products, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
def get_product(request, pk):
    product = get_object_or_404(Product, id=pk)
    serializer = ProductSerializer(product, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
def get_categories(request):
    categories = Category.objects.all()
    serializer = CategorySerializer(categories, many=True, context={'request': request})
    return Response(serializer.data)


# ------------------------------------------------------------------
# Cart
# ------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_cart(request):
    cart, created = Cart.objects.get_or_create(user=request.user)
    serializer = CartSerializer(cart)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_to_cart(request):
    product_id = request.data.get('product_id')
    variant_id = request.data.get('variant_id')
    if not product_id:
        return Response({'error': 'product_id is required'}, status=400)

    product = get_object_or_404(Product, id=product_id)
    variant = get_object_or_404(ProductVariant, id=variant_id, product=product) if variant_id else None
    cart, _ = Cart.objects.get_or_create(user=request.user)
    item, item_created = CartItem.objects.get_or_create(cart=cart, product=product, variant=variant)

    stock_available = variant.stock if variant else product.stock
    item_name = f"{product.name} ({variant.color_name})" if variant else product.name

    new_quantity = item.quantity + 1 if not item_created else item.quantity
    if new_quantity > stock_available:
        if item_created:
            item.delete()
        return Response(
            {'error': f'Only {stock_available} unit(s) of {item_name} available'},
            status=400
        )

    if not item_created:
        item.quantity += 1
        item.save()

    return Response({'message': 'Product added to cart', 'cart': CartSerializer(cart).data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_cart_quantity(request):
    item_id = request.data.get('item_id')
    quantity = request.data.get('quantity')

    if not item_id or quantity is None:
        return Response({'error': 'Item ID and quantity are required'}, status=400)

    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        return Response({'error': 'Quantity must be a number'}, status=400)

    item = get_object_or_404(CartItem, id=item_id, cart__user=request.user)

    if quantity < 1:
        item.delete()
        return Response({'message': 'Item removed from cart'})

    stock_available = item.variant.stock if item.variant else item.product.stock
    item_name = f"{item.product.name} ({item.variant.color_name})" if item.variant else item.product.name

    if quantity > stock_available:
        return Response(
            {'error': f'Only {stock_available} unit(s) of {item_name} available'},
            status=400
        )

    item.quantity = quantity
    item.save()
    serializer = CartItemSerializer(item)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def remove_from_cart(request):
    item_id = request.data.get('item_id')
    if not item_id:
        return Response({'error': 'item_id is required'}, status=400)

    deleted, _ = CartItem.objects.filter(id=item_id, cart__user=request.user).delete()
    if not deleted:
        return Response({'error': 'Cart item not found'}, status=404)
    return Response({'message': 'Item removed from cart'})


# ------------------------------------------------------------------
# Orders
# ------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_order(request):
    data = request.data
    name = data.get('name')
    address = data.get('address')
    phone = data.get('phone')
    payment_method = data.get('payment_method', 'ONLINE')

    if payment_method == 'COD':
        return Response({'error': 'Cash on Delivery (COD) is disabled. Please select an online payment method.'}, status=400)

    if not name or not address:
        return Response({'error': 'Name and address are required'}, status=400)

    if not phone or not str(phone).isdigit() or len(str(phone)) < 10:
        return Response({'error': 'Invalid phone number'}, status=400)

    cart, _ = Cart.objects.get_or_create(user=request.user)
    if not cart.items.exists():
        return Response({'error': 'Cart is empty'}, status=400)

    try:
        with transaction.atomic():
            product_ids = list(cart.items.values_list('product_id', flat=True))
            products = {
                p.id: p for p in Product.objects.select_for_update().filter(id__in=product_ids)
            }

            variant_ids = [v for v in cart.items.values_list('variant_id', flat=True) if v]
            variants = {
                v.id: v for v in ProductVariant.objects.select_for_update().filter(id__in=variant_ids)
            } if variant_ids else {}

            cart_items = list(cart.items.select_related('product', 'variant').all())

            # Validate stock for every item before committing anything
            for item in cart_items:
                variant = variants.get(item.variant_id) if item.variant_id else None
                product = products[item.product_id]
                stock_available = variant.stock if variant else product.stock
                item_name = f"{product.name} ({variant.color_name})" if variant else product.name

                if item.quantity > stock_available:
                    return Response(
                        {'error': f'Only {stock_available} unit(s) of {item_name} available'},
                        status=400
                    )

            total = sum(
                item.quantity * (variants[item.variant_id].final_price if item.variant_id else products[item.product_id].price)
                for item in cart_items
            )
            order = Order.objects.create(user=request.user, total_amount=total)

            for item in cart_items:
                product = products[item.product_id]
                variant = variants.get(item.variant_id) if item.variant_id else None
                item_price = variant.final_price if variant else product.price

                OrderItem.objects.create(
                    order=order,
                    product=product,
                    variant=variant,
                    quantity=item.quantity,
                    price=item_price
                )
                if variant:
                    variant.stock -= item.quantity
                    variant.save()
                else:
                    product.stock -= item.quantity
                    product.save(update_fields=['stock'])

            cart.items.all().delete()

        return Response({'message': 'Order created successfully', 'order_id': order.id})

    except Exception:
        return Response({'error': 'Could not create order. Please try again.'}, status=500)

