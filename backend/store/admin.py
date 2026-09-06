from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from .models import (
    Category, Product, ProductVariant, ProductImage, UserProfile,
    Order, Cart, OrderItem, CartItem, OTPVerification,
)


admin.site.register(Cart)
admin.site.register(Order)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'image_preview')
    prepopulated_fields = {'slug': ('name',)}

    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height:40px;border-radius:4px;" />', obj.image.url)
        return "-"
    image_preview.short_description = 'Image'


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ('variant', 'image', 'is_primary', 'order', 'image_preview')
    readonly_fields = ('image_preview',)

    def image_preview(self, obj):
        if obj.pk and obj.image:
            return format_html('<img src="{}" style="height:60px;border-radius:4px;" />', obj.image.url)
        return "-"
    image_preview.short_description = 'Preview'


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1
    fields = ('color_name', 'color_code', 'stock', 'extra_price', 'sku')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price', 'mrp', 'total_stock_display', 'created_at', 'thumbnail_preview')
    list_filter = ('category',)
    search_fields = ('name',)
    inlines = [ProductVariantInline, ProductImageInline]
    readonly_fields = ('variant_stock_note',)
    fields = ('category', 'name', 'description', 'price', 'mrp', 'stock', 'variant_stock_note', 'image')

    def thumbnail_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height:40px;border-radius:4px;" />', obj.image.url)
        return "-"
    thumbnail_preview.short_description = 'Thumbnail'

    def total_stock_display(self, obj):
        if obj.variants.exists():
            return sum(v.stock for v in obj.variants.all())
        return obj.stock
    total_stock_display.short_description = 'Stock'

    def variant_stock_note(self, obj):
        if obj.pk and obj.variants.exists():
            return mark_safe(
                '<b>Auto-calculated:</b> This product has color variants below, '
                'so "Stock" is automatically kept equal to the sum of all variant stocks. '
                'Edit stock on the variants, not here.'
            )
        return "No variants yet - the 'Stock' field above is used directly."
    variant_stock_note.short_description = ''

    def get_readonly_fields(self, request, obj=None):
        # Agar variants hain, to base stock field ko readonly kar do (edit sirf variants me)
        if obj and obj.variants.exists():
            return ('variant_stock_note', 'stock')
        return ('variant_stock_note',)


admin.site.register(OrderItem)
admin.site.register(UserProfile)
admin.site.register(CartItem)
admin.site.register(OTPVerification)