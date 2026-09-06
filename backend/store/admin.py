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
    verbose_name = "Product Details Page Image"
    verbose_name_plural = "SECTION 2: Gallery Images (For Product Details Page)"
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
    verbose_name = "Color Variant"
    verbose_name_plural = "Product Color Variants"
    fields = ('color_name', 'color_code', 'stock', 'extra_price', 'sku')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('thumbnail_preview', 'name', 'category', 'price', 'mrp', 'total_stock_display', 'created_at')
    list_display_links = ('thumbnail_preview', 'name')
    list_filter = ('category',)
    search_fields = ('name',)
    inlines = [ProductVariantInline, ProductImageInline]
    
    fieldsets = (
        ('Basic Details', {
            'fields': ('category', 'name', 'description', 'price', 'mrp', 'stock', 'variant_stock_note')
        }),
        ('SECTION 1: Main Product Thumbnail (For Home & Category Lists)', {
            'description': 'Upload a single main thumbnail image to be displayed on product cards, category pages, and home page.',
            'fields': ('image', 'thumbnail_preview'),
        }),
    )

    def thumbnail_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height:45px;border-radius:6px;" />', obj.image.url)
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
        base_readonly = ('variant_stock_note', 'thumbnail_preview')
        if obj and obj.variants.exists():
            return base_readonly + ('stock',)
        return base_readonly


admin.site.register(OrderItem)
admin.site.register(UserProfile)
admin.site.register(CartItem)
admin.site.register(OTPVerification)