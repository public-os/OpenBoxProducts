from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from .models import Product, Category, Cart, CartItem, UserProfile


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug']


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), source='category', write_only=True
    )

    class Meta:
        model = Product
        fields = ['id', 'category', 'category_id', 'name', 'description',
                  'price', 'mrp', 'stock', 'image', 'created_at']


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
        fields = ['username', 'name', 'phone', 'password', 'password2']

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
                password=validated_data['password'],
            )
            UserProfile.objects.create(user=user, phone=phone)
        return user
