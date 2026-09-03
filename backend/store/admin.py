from django.contrib import admin
from .models import Category, Product, UserProfile, Order, Cart, OrderItem, CartItem
# Register your models here.

admin.site.register(Category)
admin.site.register(Cart)
admin.site.register(Order)
admin.site.register(Product)
admin.site.register(OrderItem)
admin.site.register(UserProfile)
admin.site.register(CartItem)   


