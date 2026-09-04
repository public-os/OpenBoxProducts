from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth.models import User
from django.db import transaction
from django.shortcuts import get_object_or_404
from .serializers import RegisterSerializer, UserSerializer
from rest_framework import status
from .models import Product, Category, Cart, CartItem, Order, OrderItem
from .serializers import ProductSerializer, CategorySerializer, CartSerializer, CartItemSerializer
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_profile(request):
    return Response({
        'username': request.user.username,
        'email': request.user.email,
    })

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
    serializer = CategorySerializer(categories, many=True)
    return Response(serializer.data)


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
    if not product_id:
        return Response({'error': 'product_id is required'}, status=400)

    product = get_object_or_404(Product, id=product_id)
    cart, created = Cart.objects.get_or_create(user=request.user)
    item, item_created = CartItem.objects.get_or_create(cart=cart, product=product)

    new_quantity = item.quantity + 1 if not item_created else item.quantity
    if new_quantity > product.stock:
        if item_created:
            item.delete()
        return Response(
            {'error': f'Only {product.stock} unit(s) of {product.name} available'},
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

    if quantity > item.product.stock:
        return Response(
            {'error': f'Only {item.product.stock} unit(s) of {item.product.name} available'},
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

    cart, created = Cart.objects.get_or_create(user=request.user)
    if not cart.items.exists():
        return Response({'error': 'Cart is empty'}, status=400)

    try:
        with transaction.atomic():
            # Lock the relevant product rows so stock can't change under us
            product_ids = list(cart.items.values_list('product_id', flat=True))
            products = {
                p.id: p for p in Product.objects.select_for_update().filter(id__in=product_ids)
            }

            cart_items = list(cart.items.select_related('product').all())

            # Validate stock for every item before committing anything
            for item in cart_items:
                product = products[item.product_id]
                if item.quantity > product.stock:
                    return Response(
                        {'error': f'Only {product.stock} unit(s) of {product.name} available'},
                        status=400
                    )

            total = sum(item.quantity * products[item.product_id].price for item in cart_items)
            order = Order.objects.create(user=request.user, total_amount=total)

            for item in cart_items:
                product = products[item.product_id]
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=item.quantity,
                    price=product.price
                )
                product.stock -= item.quantity
                product.save(update_fields=['stock'])

            cart.items.all().delete()

        return Response({'message': 'Order created successfully', 'order_id': order.id})

    except Exception:
        return Response({'error': 'Could not create order. Please try again.'}, status=500)


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