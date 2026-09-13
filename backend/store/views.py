import hashlib
import hmac
import logging
import os
import random
import requests
from datetime import timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.files.images import get_image_dimensions
from django.db import transaction
from django.db.models import Avg, Count, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes, throttle_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import SimpleRateThrottle


class _UserOrIpRateThrottle(SimpleRateThrottle):
    """SimpleRateThrottle with ScopedRateThrottle's ident logic: logged-in user
    par user-pk, anon (OTP) par IP. ScopedRateThrottle subclass scope ko
    view.throttle_scope se overwrite kar deta hai aur views par throttle_scope
    set nahi hai — isliye ye seedha SimpleRateThrottle use karta hai."""
    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class OtpRateThrottle(_UserOrIpRateThrottle):
    scope = 'otp'


class OtpVerifyRateThrottle(_UserOrIpRateThrottle):
    """reset_password attempts — 6-digit OTP brute-force rokne ke liye
    (forgot_password ka throttle yahan nahi lagta, iska apna strict rate hai)."""
    scope = 'otp_verify'


class GoogleRateThrottle(_UserOrIpRateThrottle):
    scope = 'google'


class DeliveryQuoteThrottle(_UserOrIpRateThrottle):
    """Checkout page ka live delivery estimate — Nominatim rate-limit friendly."""
    scope = 'delivery'


from rest_framework import status, exceptions
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    Product, Category, Cart, CartItem, Order, OrderItem, UserProfile,
    OTPVerification, ProductVariant, StockAlert, Review, user_is_vip,
)
from .delivery import ADDRESS_HINT, calculate_delivery
from .serializers import (
    RegisterSerializer, UserSerializer,
    ProductSerializer, CategorySerializer, CartSerializer, CartItemSerializer,
    ReviewSerializer,
)

OTP_EXPIRY_MINUTES = 5
# Ek OTP par kitni galat koshishen maaf — uske baad OTP cancel, naya maangna padega
OTP_MAX_VERIFY_ATTEMPTS = 5


# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------

def _mask_phone(phone):
    return f"{phone[:2]}xxxxx{phone[-3:]}" if len(phone) >= 5 else phone


def _generate_and_send_otp(phone):
    """Create a fresh OTP for the phone number and try to deliver it via 2Factor.
    Returns (otp_code, sms_sent, sms_error)."""
    otp_code = str(random.randint(100000, 999999))
    OTPVerification.objects.filter(phone=phone).delete()
    OTPVerification.objects.create(phone=phone, otp=otp_code)

    twofactor_key = os.getenv('TWOFACTOR_API_KEY')
    sms_sent = False
    sms_error = 'SMS gateway not configured (set TWOFACTOR_API_KEY in backend/.env).'
    if twofactor_key:
        sms_error = None
        try:
            # Custom-OTP route: humara DB-stored 6-digit code 2Factor ke default
            # template se bhejte hain; verify phir bhi DB ke against hota hai.
            url = f"https://2factor.in/API/V1/{twofactor_key}/SMS/{phone}/{otp_code}"
            res = requests.get(url, timeout=10)
            try:
                body = res.json()
            except ValueError:
                body = {}
            # 2Factor HTTP errors par bhi JSON deta hai, phir bhi dono check karo.
            if res.status_code == 200 and body.get('Status') == 'Success':
                sms_sent = True
                # 2Factor SMS fail hone par chup-chaap VOICE CALL par fallback
                # karta hai — uski hint 'Warnings' me aati hai, isliye log me
                # poora Details/Warnings rakhte hain (voice credit bhi kat ta hai).
                logger.info("[2FACTOR] OTP send OK for +91 %s (details=%s warnings=%s)",
                            phone, body.get('Details'), body.get('Warnings') or 'none')
            else:
                sms_error = str(body.get('Details') or res.text)[:200]
                logger.warning("[2FACTOR (%s)]: %s", res.status_code, sms_error)
        except Exception as sms_err:
            sms_error = f"Could not reach SMS gateway: {sms_err}"
            logger.warning("[2FACTOR EXCEPTION]: %s", sms_err)

    if not sms_sent:
        # Server-side console only — client ko OTP kabhi nahi bhejte (dev_otp
        # dekhna hai toh EXPOSE_DEV_OTP=true + DEBUG dono chahiye).
        logger.info("=== OTP for +91 %s: %s (valid %s min) ===", phone, otp_code, OTP_EXPIRY_MINUTES)
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
    """Profile ka phone SMS-gateway/OTP-ready format me: sirf digits, last 10.
    DB me purana dirty data ho (+91 prefix, spaces) toh bhi SMS aur OTP
    lookup same clean number par chalein."""
    profile = UserProfile.objects.filter(user=user).first()
    raw = profile.phone if profile else ''
    digits = ''.join(ch for ch in str(raw) if ch.isdigit())
    return digits[-10:] if len(digits) >= 10 else digits


MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB
AVATAR_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}


def _gravatar_url(email):
    """Email se public Gravatar avatar URL (?d=404: na hone par 404, frontend default dikhata hai)."""
    email = (email or '').strip().lower()
    if not email:
        return None
    digest = hashlib.md5(email.encode()).hexdigest()
    return f"https://www.gravatar.com/avatar/{digest}?s=256&d=404"


def _profile_image_data(request, profile):
    """Profile image ki display priority:
    upload (user ki pasand) > Google photo > Gravatar (email se fetch) > None (default logo)."""
    if profile and profile.avatar:
        return {
            'profile_image': request.build_absolute_uri(profile.avatar.url),
            'profile_image_source': 'upload',
        }
    if profile and profile.picture:
        return {'profile_image': profile.picture, 'profile_image_source': 'google'}
    gravatar = _gravatar_url(request.user.email)
    if gravatar:
        return {'profile_image': gravatar, 'profile_image_source': 'gravatar'}
    return {'profile_image': None, 'profile_image_source': None}


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

        # Accounts created via Google sign-in have no usable password
        # (see google_login: user.set_unusable_password()). Trying to
        # authenticate them with a password would always fail with a
        # confusing "Password is incorrect" — give a clearer message
        # pointing them to Google sign-in instead.
        if not user.has_usable_password():
            raise exceptions.AuthenticationFailed(
                'This account was created with Google sign-in and has no password. Please continue with Google.',
                'google_account_no_password',
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
@throttle_classes([OtpRateThrottle])
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
    # Dev convenience only: OTP SMS me na ja sake toh response me expose karo.
    # Real-world par ye OFF rehna chahiye — warna SMS fail hote hi koi bhi dev_otp
    # padh kar kisi ka bhi password reset kar sakta hai. Local dev ke liye
    # backend/.env me EXPOSE_DEV_OTP=true rakho.
    if (
        not sms_sent
        and settings.DEBUG
        and os.getenv('EXPOSE_DEV_OTP', 'false').lower() == 'true'
    ):
        response_data['dev_otp'] = otp_code
    return Response(response_data)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([OtpVerifyRateThrottle])
def reset_password(request):
    identifier = str(request.data.get('identifier', '')).strip()
    otp = str(request.data.get('otp', '')).strip()
    password = str(request.data.get('password', ''))
    password2 = str(request.data.get('password2', ''))

    if not identifier or not otp:
        return Response({'error': 'Username/mobile and OTP are required'}, status=400)

    user = _find_user_by_identifier(identifier)
    if user is None:
        return Response({'error': 'No account found with that username or mobile number'}, status=404)

    phone = _user_phone(user)
    record = OTPVerification.objects.filter(phone=phone).order_by('-created_at', '-id').first() if phone else None

    if not record or record.otp != otp:
        # Brute-force guard: har galat attempt count karo. OTP_MAX_VERIFY_ATTEMPTS
        # fail hone par OTP record hi uda do — naya OTP maangna padega. Bina iske
        # 6-digit OTP ko 5 min ki expiry ke andar brute-force karne ki jagah rehti.
        attempts_key = f"otp_attempts:{phone or identifier}"
        attempts = cache.get(attempts_key, 0) + 1
        if attempts >= OTP_MAX_VERIFY_ATTEMPTS:
            if record:
                record.delete()
            cache.delete(attempts_key)
            return Response(
                {'error': 'Too many wrong attempts. Please request a new OTP.'},
                status=429
            )
        cache.set(attempts_key, attempts, OTP_EXPIRY_MINUTES * 60)
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
    cache.delete(f"otp_attempts:{phone}")

    return Response({'message': 'Password reset successfully. Please login with your new password.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([GoogleRateThrottle])
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
        # order_by('id'): email field non-unique hai, toh kabhi duplicate email ho
        # toh bhi hamesha sabse pehla (oldest) account mile — predictable behavior
        user = User.objects.filter(email__iexact=email).order_by('id').first()
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
    # Google account ki public photo URL save/update — profile fallback isse dikhta hai
    # (user ka uploaded avatar untouched rehta hai, wo display me pehle aata hai)
    google_picture = str(info.get('picture') or '')
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if google_picture and profile.picture != google_picture:
        profile.picture = google_picture
        profile.save(update_fields=['picture'])

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

    return Response(_profile_response(request, profile))


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def user_profile_avatar(request):
    """Profile image upload (multipart `avatar` file) aur remove.
    Skip ka matlab: koi upload nahi — tab Google photo > Gravatar > default logo dikhega."""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)

    if request.method == 'DELETE':
        if profile.avatar:
            profile.avatar.delete(save=False)
            profile.avatar = None
            profile.save(update_fields=['avatar'])
        return Response(_profile_response(request, profile))

    file = request.FILES.get('avatar')
    if not file:
        return Response({'error': 'Please select an image file'}, status=400)
    if file.size > MAX_AVATAR_BYTES:
        return Response({'error': 'Image must be 5 MB or smaller'}, status=400)
    if file.content_type not in AVATAR_CONTENT_TYPES:
        return Response({'error': 'Only JPG, PNG, WebP or GIF images are allowed'}, status=400)

    try:
        get_image_dimensions(file)
    except Exception:
        return Response({'error': 'This file is not a valid image'}, status=400)
    finally:
        file.seek(0)

    # Purani file delete karo warna media/profile_pics/ me orphans jama hote rahenge
    if profile.avatar:
        profile.avatar.delete(save=False)
    profile.avatar = file
    profile.save(update_fields=['avatar'])

    return Response(_profile_response(request, profile))


def _profile_response(request, profile):
    response = {
        'username': request.user.username,
        'name': request.user.first_name or request.user.username,
        'email': request.user.email,
        'phone': profile.phone,
        'address': profile.address,
        'is_vip': profile.is_vip,
    }
    response.update(_profile_image_data(request, profile))
    return response


# ------------------------------------------------------------------
# Catalog
# ------------------------------------------------------------------

# Product list/detail ke saath review aggregates bhi — ProductCard badge aur
# details page isi se Blinkit-style rating dikhate hain (10+ reviews par).
def _with_rating_qs(qs):
    return qs.annotate(
        rating_avg=Avg('reviews__rating'),
        review_count=Count('reviews', distinct=True),
    )


@api_view(['GET'])
def get_products(request):
    products = _with_rating_qs(Product.objects.select_related('category').all())
    serializer = ProductSerializer(products, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
def get_product(request, pk):
    product = get_object_or_404(_with_rating_qs(Product.objects.select_related('category')), id=pk)
    serializer = ProductSerializer(product, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
def product_reviews(request, pk):
    """Ek product ke reviews — pinned sabse upar, phir sabse zyada liked, phir naye."""
    product = get_object_or_404(Product, id=pk)
    reviews = (
        product.reviews.select_related('user__userprofile')
        .annotate(total_likes=Count('liked_by', distinct=True))
        .order_by('-is_pinned', '-total_likes', '-created_at')[:100]
    )
    serializer = ReviewSerializer(reviews, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_review_like(request, review_id):
    """Instagram-style like toggle — ek user ek review par ek hi like."""
    review = get_object_or_404(Review, id=review_id)
    if review.liked_by.filter(pk=request.user.pk).exists():
        review.liked_by.remove(request.user)
        liked = False
    else:
        review.liked_by.add(request.user)
        liked = True
    return Response({'liked': liked, 'likes': review.liked_by.count()})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_review_pin(request, review_id):
    """Review pin/unpin — sirf VIP user. Pinned review list me sabse upar dikhta hai;
    ek product par ek hi review pinned rehta hai (naya pin purana hata deta hai)."""
    if not user_is_vip(request.user):
        return Response({'error': 'Only VIP users can pin reviews.'}, status=403)
    review = get_object_or_404(Review, id=review_id)
    if review.is_pinned:
        review.is_pinned = False
        review.save(update_fields=['is_pinned'])
        return Response({'pinned': False})
    Review.objects.filter(product_id=review.product_id, is_pinned=True).exclude(
        pk=review.pk
    ).update(is_pinned=False)
    review.is_pinned = True
    review.save(update_fields=['is_pinned'])
    return Response({'pinned': True})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_review(request, review_id):
    """Review delete — VIP user koi bhi review hata sakta hai; owner apna bhi."""
    review = get_object_or_404(Review, id=review_id)
    if not (user_is_vip(request.user) or review.user_id == request.user.pk):
        return Response({'error': 'Only VIP users can delete reviews.'}, status=403)
    review.delete()
    return Response({'deleted': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_review(request, pk):
    """Review add/update (ek user, ek product = ek review). Rating 1-5 zaroori."""
    product = get_object_or_404(Product, id=pk)
    try:
        rating = int(request.data.get('rating'))
    except (TypeError, ValueError):
        return Response({'error': 'Rating is required (1-5 stars).'}, status=400)
    if not 1 <= rating <= 5:
        return Response({'error': 'Rating must be between 1 and 5 stars.'}, status=400)

    comment = (request.data.get('comment') or '').strip()
    review, created = Review.objects.update_or_create(
        product=product, user=request.user,
        defaults={'rating': rating, 'comment': comment[:1000]},
    )
    agg = product.reviews.aggregate(avg=Avg('rating'), count=Count('id'))
    return Response(
        {
            'review': ReviewSerializer(review, context={'request': request}).data,
            'rating_avg': round(agg['avg'], 1) if agg['avg'] is not None else None,
            'review_count': agg['count'],
        },
        status=201 if created else 200,
    )


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

def _generate_order_ref():
    """Unique alphanumeric reference sent as the UPI `tr` (transaction ref) param."""
    while True:
        ref = f"OB{random.randint(10**9, 10**10 - 1)}"
        if not Order.objects.filter(order_ref=ref).exists():
            return ref


def _order_response(order):
    items = []
    items_total = Decimal('0')
    for item in order.items.select_related('product', 'variant').all():
        image = item.product.display_image
        items_total += item.price * item.quantity
        items.append({
            'product_id': item.product_id,
            # Reorder isi se wahi variant wapas cart me daalta hai (color/price)
            'variant_id': item.variant_id,
            'product': item.product.name,
            'image': image.url if image else None,
            'variant': item.variant.color_name if item.variant else None,
            'quantity': item.quantity,
            'price': str(item.price),
            'subtotal': str(item.subtotal),
        })
    return {
        'order_id': order.id,
        'order_ref': order.order_ref,
        'total_amount': str(order.total_amount),
        # Breakdown: total_amount = items_total + delivery_charge
        'items_total': str(items_total),
        'delivery_charge': str(order.delivery_charge),
        'delivery_distance_km': (
            str(order.delivery_distance_km) if order.delivery_distance_km is not None else None
        ),
        'status': order.status,
        'payment_status': order.payment_status,
        'payment_ref': order.payment_ref,
        'created_at': order.created_at,
        'paid_at': order.paid_at,
        'updated_at': order.updated_at,
        'shipping_name': order.shipping_name,
        'shipping_phone': order.shipping_phone,
        'shipping_address': order.shipping_address,
        'items': items,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_orders(request):
    """Account page 'Your Orders' history — newest first."""
    orders = (
        Order.objects.filter(user=request.user)
        .prefetch_related(
            Prefetch('items', queryset=OrderItem.objects.select_related('product', 'variant'))
        )
        .all()
    )
    return Response([_order_response(o) for o in orders])


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

    # Delivery charge — shipping address shop se kitni door hai us par depend
    # karta hai. Geocode ek network call hai isliye transaction se PEHLE (DB
    # locks hold na ho). Address hi locate na ho toh customer se clear address
    # maango — andaza lagane par galat charge lagne ka risk nahi.
    distance_km, delivery_charge, geo_state = calculate_delivery(address)
    if geo_state == 'unresolved':
        return Response({'error': ADDRESS_HINT}, status=400)
    # geo_state == 'error' (geocode service down): fail-open — free delivery
    # default, distance NULL. Owner order notification me address review kar lega.

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

            items_total = sum(
                item.quantity * (variants[item.variant_id].final_price if item.variant_id else products[item.product_id].price)
                for item in cart_items
            )
            order = Order.objects.create(
                user=request.user,
                total_amount=items_total + delivery_charge,
                delivery_charge=delivery_charge,
                delivery_distance_km=Decimal(str(distance_km)) if distance_km is not None else None,
                shipping_name=str(name)[:150],
                shipping_phone=str(phone)[:15],
                shipping_address=str(address),
                order_ref=_generate_order_ref(),
            )

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

        return Response({
            'message': 'Order created successfully',
            'order_id': order.id,
            'order_ref': order.order_ref,
            'total_amount': str(order.total_amount),
            'items_total': str(items_total),
            'delivery_charge': str(order.delivery_charge),
            'delivery_distance_km': (
                str(order.delivery_distance_km) if order.delivery_distance_km is not None else None
            ),
        }, status=201)

    except Exception:
        logger.exception("create_order: unexpected error for user %s", request.user.id)
        return Response({'error': 'Could not create order. Please try again.'}, status=500)


@api_view(['GET', 'DELETE'])
@permission_classes([IsAuthenticated])
def get_order(request, pk):
    """Order detail. DELETE par user apna order history se hata sakta hai
    (Blinkit-style 'Delete order') — sirf apna hi order."""
    order = get_object_or_404(Order, pk=pk, user=request.user)
    if request.method == 'DELETE':
        order.delete()
        return Response({'deleted': True})
    return Response(_order_response(order))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_order(request, pk):
    """Pending order user khud remove kar sakta hai — stock wapas add hota hai
    (create_order me stock deduct hota hai, payment se pehle nahi)."""
    order = get_object_or_404(Order, pk=pk, user=request.user)

    if order.status != 'pending':
        return Response({'error': 'Only pending orders can be removed.'}, status=400)

    try:
        with transaction.atomic():
            items = list(order.items.select_related('product', 'variant').all())

            # Stock rows lock karo (create_order jaisa hi pattern)
            product_ids = [i.product_id for i in items]
            variant_ids = [i.variant_id for i in items if i.variant_id]
            products = {
                p.id: p for p in Product.objects.select_for_update().filter(id__in=product_ids)
            }
            variants = {
                v.id: v for v in ProductVariant.objects.select_for_update().filter(id__in=variant_ids)
            } if variant_ids else {}

            for item in items:
                if item.variant_id:
                    variant = variants[item.variant_id]
                    variant.stock += item.quantity
                    variant.save()
                else:
                    product = products[item.product_id]
                    product.stock += item.quantity
                    product.save(update_fields=['stock'])

            order.status = 'cancelled'
            order.save()
    except Exception:
        logger.exception("cancel_order: failed for order %s (user %s)", order.pk, request.user.id)
        return Response({'error': 'Could not remove order. Please try again.'}, status=500)

    return Response({'message': 'Order removed successfully', 'order': _order_response(order)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_order_shipping(request, pk):
    """Pending (unpaid) order ka shipping detail user update kar sakta hai —
    Review & Pay se wapas details step par edit karne par yahi call hota hai.
    Paid/confirmed order ka address nahi badalta."""
    order = get_object_or_404(Order, pk=pk, user=request.user)

    if order.status != 'pending' or order.payment_status == 'paid':
        return Response({'error': 'Only pending orders can be updated.'}, status=400)

    data = request.data
    name = data.get('name')
    address = data.get('address')
    phone = data.get('phone')

    if not name or not address:
        return Response({'error': 'Name and address are required'}, status=400)

    if not phone or not str(phone).isdigit() or len(str(phone)) < 10:
        return Response({'error': 'Invalid phone number'}, status=400)

    order.shipping_name = str(name)[:150]
    order.shipping_phone = str(phone)[:15]
    order.shipping_address = str(address)

    # Address badla toh delivery charge bhi naya ho sakta hai (total_amount usi
    # se banta hai). Service down ho toh purana charge rakho — order create ke
    # waqt jo charge laga tha wahi sahi rehta hai.
    distance_km, delivery_charge, geo_state = calculate_delivery(address)
    if geo_state == 'unresolved':
        return Response({'error': ADDRESS_HINT}, status=400)
    if geo_state == 'error':
        delivery_charge = order.delivery_charge
        distance_km = order.delivery_distance_km

    items_total = sum(item.price * item.quantity for item in order.items.all())
    order.delivery_charge = delivery_charge
    order.delivery_distance_km = Decimal(str(distance_km)) if distance_km is not None else None
    order.total_amount = items_total + delivery_charge
    order.save(update_fields=[
        'shipping_name', 'shipping_phone', 'shipping_address',
        'delivery_charge', 'delivery_distance_km', 'total_amount', 'updated_at',
    ])

    return Response(_order_response(order))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([DeliveryQuoteThrottle])
def delivery_quote(request):
    """Checkout page ka live estimate — address likhte hi free/₹40 delivery
    dikhane ke liye. Final (authoritative) charge order create / update-shipping
    par wapas calculate hota hai."""
    address = str(request.data.get('address') or '').strip()
    if not address:
        return Response({'error': 'Address is required'}, status=400)

    distance_km, charge, geo_state = calculate_delivery(address)
    if geo_state == 'unresolved':
        return Response({'error': ADDRESS_HINT}, status=400)

    return Response({
        'distance_km': distance_km,
        'delivery_charge': str(charge),
        'free_delivery': charge == 0,
        # geocode service down — estimate nahi de sakte, checkout par charge lagega
        'unavailable': geo_state == 'error',
    })


# ------------------------------------------------------------------
# Stock alerts ("Notify me" on out-of-stock products)
# ------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notify_me(request, pk):
    """Out-of-stock product par 'Notify Me' — owner ke Telegram par product +
    customer info jaata hai, aur request DB mein record hoti hai."""
    from .telegram import send_telegram_message

    product = get_object_or_404(Product, pk=pk)

    if product.in_stock:
        return Response({'error': 'Product is already in stock!'}, status=400)

    if StockAlert.objects.filter(product=product, user=request.user).exists():
        return Response({
            'message': 'Aapki request already record par hai — stock aate hi update milega.',
            'telegram_sent': False,
        })

    profile = UserProfile.objects.filter(user=request.user).first()
    full_name = request.user.get_full_name() or request.user.username
    phone = profile.phone if profile else ''
    email = request.user.email or ''

    text = (
        "🔔 Notify Me Request\n\n"
        f"📦 Product: {product.name}\n"
        f"💰 Price: Rs.{product.price}\n"
        f"📉 Stock: {product.stock}\n\n"
        "👤 Customer:\n"
        f"• Username: {request.user.username}\n"
        f"• Name: {full_name}\n"
        f"• Phone: {phone or '—'}\n"
        f"• Email: {email or '—'}\n"
        f"• User ID: {request.user.id}\n\n"
        f"🕐 {timezone.now().strftime('%d %b %Y, %I:%M %p')} (UTC)"
    )
    sent = send_telegram_message(text)
    if not sent:
        logger.warning(
            "notify_me: telegram send fail (product=%s user=%s) — request DB mein record hui",
            product.pk, request.user.pk,
        )

    StockAlert.objects.create(product=product, user=request.user)

    return Response({
        'message': 'Request mil gayi! Stock aane par aapko update milega.',
        'telegram_sent': sent,
    }, status=201)


# ------------------------------------------------------------------
# Payments (Razorpay gateway)
# ------------------------------------------------------------------
# "Payment hua ya nahi" ye sirf gateway hi confirm kar sakta hai. Do proofs:
#   1. Checkout success callback ka HMAC signature (key secret se hi ban sakta hai)
#   2. Webhook — Razorpay ka server-to-server call (authoritative, browser band
#      ho jaye ya network cut ho jaye tab bhi event aata hai)

def _rzp_request(method, path, payload=None):
    """Razorpay REST API call (key pair basic-auth se)."""
    return requests.request(
        method,
        f"{settings.RAZORPAY_API_BASE}{path}",
        json=payload or {},
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
        timeout=15,
    )


def _mark_order_paid(order, payment_id):
    """Order ko paid mark karta hai — idempotent (verify + webhook dono isse
    call karte hain, double notification nahi hoti). Sirf transition par
    admin ko notify karta hai."""
    with transaction.atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.payment_status == 'paid':
            return False
        locked.payment_status = 'paid'
        locked.status = 'paid'
        locked.payment_ref = str(payment_id)[:30]
        locked.paid_at = timezone.now()
        locked.save(update_fields=['payment_status', 'status', 'payment_ref', 'paid_at', 'updated_at'])

    from .signals import notify_order_paid
    transaction.on_commit(lambda: notify_order_paid(locked.pk))
    return True


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_payment(request, pk):
    """Gateway order banata hai (server-side, amount DB se aata hai — client
    amount badal nahi sakta) aur checkout popup ko chalu karne ki details
    frontend ko deta hai."""
    if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
        return Response(
            {'error': 'Payment gateway is not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env.'},
            status=503,
        )

    order = get_object_or_404(Order, pk=pk, user=request.user)

    if order.payment_status == 'paid':
        return Response({'error': 'This order is already paid'}, status=400)
    if order.status == 'cancelled':
        return Response({'error': 'This order is cancelled'}, status=400)

    res = _rzp_request('POST', '/orders', {
        'amount': int(order.total_amount * 100),  # paise
        'currency': 'INR',
        'receipt': order.order_ref,
        'notes': {'order_id': str(order.id), 'order_ref': order.order_ref},
    })
    if res.status_code >= 400:
        logger.error("create_payment: Razorpay order create fail for order %s: %s", order.pk, res.text[:300])
        return Response({'error': 'Payment gateway se baat nahi ho payi. Please try again.'}, status=502)

    gateway_order_id = res.json().get('id')
    if not gateway_order_id:
        return Response({'error': 'Payment gateway ne valid order nahi diya. Please try again.'}, status=502)

    order.gateway_order_id = gateway_order_id
    order.save(update_fields=['gateway_order_id', 'updated_at'])

    return Response({
        'key_id': settings.RAZORPAY_KEY_ID,
        'razorpay_order_id': gateway_order_id,
        'amount': int(order.total_amount * 100),
        'currency': 'INR',
        'order_ref': order.order_ref,
        'prefill': {
            'name': order.shipping_name,
            'contact': order.shipping_phone,
            'email': request.user.email or '',
        },
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_payment(request, pk):
    """Checkout success callback se mile fields ka signature verify karta hai.
    Verify hone ke baad hi order PAID (placed) hota hai."""
    order = get_object_or_404(Order, pk=pk, user=request.user)

    rzp_order_id = str(request.data.get('razorpay_order_id', ''))
    rzp_payment_id = str(request.data.get('razorpay_payment_id', ''))
    signature = str(request.data.get('razorpay_signature', ''))
    if not (rzp_order_id and rzp_payment_id and signature):
        return Response({'error': 'Missing payment verification fields'}, status=400)

    if not order.gateway_order_id or rzp_order_id != order.gateway_order_id:
        return Response({'error': 'Payment does not belong to this order'}, status=400)

    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{rzp_order_id}|{rzp_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        logger.warning("verify_payment: signature mismatch order %s user %s", order.pk, request.user.pk)
        return Response({'error': 'Payment signature verification failed'}, status=400)

    _mark_order_paid(order, rzp_payment_id)
    return Response(_order_response(Order.objects.get(pk=order.pk)))


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def razorpay_webhook(request):
    """Razorpay dashboard me configure hota hai (deployed URL par). Payload ka
    signature webhook secret se verify hota hai — ye payment ka authoritative
    source hai, isliye verify_payment miss ho jaye toh bhi order paid ho jata hai."""
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        return Response({'error': 'Webhook secret not configured'}, status=503)

    signature = request.headers.get('X-Razorpay-Signature', '')
    expected = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return Response({'error': 'Invalid webhook signature'}, status=400)

    event = request.data.get('event', '')

    if event in ('payment.captured', 'order.paid'):
        entity = request.data.get('payload', {}).get('payment', {}).get('entity', {})
        order = Order.objects.filter(gateway_order_id=entity.get('order_id', '')).first()
        if order:
            _mark_order_paid(order, entity.get('id') or order.payment_ref)
    elif event == 'payment.failed':
        entity = request.data.get('payload', {}).get('payment', {}).get('entity', {})
        order = Order.objects.filter(gateway_order_id=entity.get('order_id', '')).first()
        # paid order kabhi failed me overwrite nahi hoga (double events / retries)
        if order and order.payment_status == 'pending':
            order.payment_status = 'failed'
            order.save(update_fields=['payment_status', 'updated_at'])

    return Response({'status': 'ok'})