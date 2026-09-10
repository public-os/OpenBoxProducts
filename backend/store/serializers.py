from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Avg
import hashlib

from .models import Product, Category, Cart, CartItem, UserProfile, ProductImage, Review, user_is_vip


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'image']


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'is_primary', 'order']


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), source='category', write_only=True
    )
    images = ProductImageSerializer(many=True, read_only=True)
    # Views in fields ko annotate karke dete hain (N+1 queries se bachne ke liye);
    # annotation na mile toh yahan fallback se compute hota hai.
    rating_avg = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ['id', 'category', 'category_id', 'name', 'description',
                  'price', 'mrp', 'stock', 'image', 'images', 'rating_avg', 'review_count',
                  'created_at']

    def get_rating_avg(self, obj):
        avg = getattr(obj, 'rating_avg', None)
        if avg is None and obj.pk:
            avg = obj.reviews.aggregate(a=Avg('rating'))['a']
        return round(avg, 1) if avg is not None else None

    def get_review_count(self, obj):
        count = getattr(obj, 'review_count', None)
        if count is None and obj.pk:
            count = obj.reviews.count()
        return count


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    # Views `total_likes` annotate karte hain (N+1 se bachne ke liye); na mile
    # toh fallback count. liked_by_me sirf logged-in request ke liye sahi hota hai.
    likes = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    # VIP reviewer ka blue tick frontend isi se dikhata hai
    user_is_vip = serializers.SerializerMethodField()
    # Reviewer ki actual profile photo (upload > Google > Gravatar), navbar jaisi hi priority
    user_avatar = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ['id', 'user', 'user_name', 'rating', 'comment', 'likes', 'liked_by_me',
                  'user_is_vip', 'user_avatar', 'is_pinned', 'created_at']

    def get_user_name(self, obj):
        return obj.user.first_name or obj.user.username

    def get_likes(self, obj):
        total = getattr(obj, 'total_likes', None)
        return total if total is not None else obj.liked_by.count()

    def get_liked_by_me(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return obj.liked_by.filter(pk=user.pk).exists()

    def get_user_is_vip(self, obj):
        return user_is_vip(obj.user)

    def get_user_avatar(self, obj):
        profile = getattr(obj.user, 'userprofile', None)
        request = self.context.get('request')
        if profile and profile.avatar:
            url = profile.avatar.url
            return request.build_absolute_uri(url) if request else url
        if profile and profile.picture:
            return profile.picture
        email = (obj.user.email or '').strip().lower()
        if email:
            return f"https://www.gravatar.com/avatar/{hashlib.md5(email.encode()).hexdigest()}?s=256&d=404"
        return None


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_price = serializers.DecimalField(source='product.price', max_digits=10, decimal_places=2, read_only=True)
    product_image = serializers.ImageField(source='product.image', read_only=True)
    variant_name = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    quantity = serializers.IntegerField(min_value=1)

    class Meta:
        model = CartItem
        fields = ['id', 'cart', 'product', 'variant', 'product_name', 'product_price',
                  'product_image', 'variant_name', 'unit_price', 'subtotal', 'quantity']
        read_only_fields = ['cart']

    def get_variant_name(self, obj):
        return obj.variant.color_name if obj.variant else None

    def get_unit_price(self, obj):
        if obj.variant:
            return str(obj.variant.final_price)
        return str(obj.product.price)

    def validate(self, data):
        product = data.get('product', getattr(self.instance, 'product', None))
        variant = data.get('variant', getattr(self.instance, 'variant', None))
        quantity = data.get('quantity', getattr(self.instance, 'quantity', None))
        stock = variant.stock if variant else (product.stock if product else 0)
        name = f"{product.name} ({variant.color_name})" if (product and variant) else (product.name if product else "Item")
        if quantity and quantity > stock:
            raise serializers.ValidationError(
                f"Only {stock} unit(s) of {name} available."
            )
        return data



class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total = serializers.ReadOnlyField()

    class Meta:
        model = Cart
        fields = ['id', 'user', 'created_at', 'items', 'total']
        read_only_fields = ['user']


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='first_name', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'name', 'email']


class RegisterSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=150, trim_whitespace=True)
    # Optional email — dene par Google Sign-In isi email se account link ho jata hai
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.RegexField(
        regex=r'^\d{10}$',
        error_messages={'invalid': 'Mobile number must be exactly 10 digits.'},
        validators=[UniqueValidator(
            queryset=UserProfile.objects.all(),
            message='An account with this mobile number already exists.'
        )]
    )
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'name', 'email', 'phone', 'password', 'password2']

    def validate_email(self, value):
        # User.email non-unique hai DB level par; Google login email__iexact se
        # match karta hai, isliye duplicate (case-insensitive) email yahin rok do
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError({"password2": "Passwords do not match."})
        return data

    def create(self, validated_data):
        phone = validated_data.pop('phone')
        validated_data.pop('password2')
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data['username'],
                first_name=validated_data.get('name', ''),
                email=validated_data.get('email', ''),
                password=validated_data['password'],
            )
            UserProfile.objects.create(user=user, phone=phone)
        return user
