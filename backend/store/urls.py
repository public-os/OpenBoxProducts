from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView

app_name = 'store'

urlpatterns = [
    # Auth
    path('register/', views.register_view, name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('forgot-password/', views.forgot_password, name='forgot_password'),
    path('reset-password/', views.reset_password, name='reset_password'),
    path('google-login/', views.google_login, name='google_login'),

    # User Profile
    path('user/profile/', views.user_profile, name='user_profile'),
    path('user/profile/avatar/', views.user_profile_avatar, name='user_profile_avatar'),

    # Catalog
    path('products/', views.get_products, name='product_list'),
    path('products/<int:pk>/', views.get_product, name='product_detail'),
    path('products/<int:pk>/notify-me/', views.notify_me, name='product_notify_me'),
    path('categories/', views.get_categories, name='category_list'),

    # Cart
    path('cart/', views.get_cart, name='cart_detail'),
    path('cart/add/', views.add_to_cart, name='cart_add'),
    path('cart/remove/', views.remove_from_cart, name='cart_remove'),
    path('cart/update/', views.update_cart_quantity, name='cart_update'),

    # Orders
    path('orders/', views.my_orders, name='order_list'),
    path('orders/create/', views.create_order, name='order_create'),
    path('orders/<int:pk>/', views.get_order, name='order_detail'),
    path('orders/<int:pk>/cancel/', views.cancel_order, name='order_cancel'),
    path('orders/<int:pk>/update-shipping/', views.update_order_shipping, name='order_update_shipping'),

    # Payments (Razorpay) — order sirf verified payment ke baad confirm hota hai
    path('orders/<int:pk>/create-payment/', views.create_payment, name='order_create_payment'),
    path('orders/<int:pk>/verify-payment/', views.verify_payment, name='order_verify_payment'),
    path('payments/webhook/', views.razorpay_webhook, name='razorpay_webhook'),
]
