from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Categories'

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(Category, related_name='products', on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    mrp = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    stock = models.PositiveIntegerField(default=0)
    # List/grid page ke liye single thumbnail
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def in_stock(self):
        if self.variants.exists():
            return self.variants.filter(stock__gt=0).exists()
        return self.stock > 0

    @property
    def display_image(self):
        if self.image:
            return self.image
        primary = self.images.filter(is_primary=True).first() or self.images.first()
        return primary.image if primary else None

    def images_by_color(self):
        """
        Returns dict: { 'General': [images...], 'Red': [images...], 'Black': [images...] }
        Used to group gallery images by color variant.
        """
        grouped = {}
        for img in self.images.select_related('variant').all():
            key = img.variant.color_name if img.variant else 'General'
            grouped.setdefault(key, []).append(img)
        return grouped

    def recalculate_stock(self):
        """
        Product.stock ko variants ke stock ka sum bana do.
        Signals (save/delete on ProductVariant) is method ko call karte hain,
        isliye ye field admin me hamesha auto-updated rahegi.
        """
        if not self.variants.exists():
            return
        total = self.variants.aggregate(total=models.Sum('stock'))['total'] or 0
        if self.stock != total:
            self.stock = total
            self.save(update_fields=['stock'])



class ProductVariant(models.Model):
    """Ek product ke different colors (ya color+size combos)."""
    product = models.ForeignKey(Product, related_name='variants', on_delete=models.CASCADE)
    color_name = models.CharField(max_length=50)             # e.g. "Red", "Midnight Black"
    color_code = models.CharField(max_length=7, blank=True)  # e.g. "#FF0000" - swatch ke liye
    stock = models.PositiveIntegerField(default=0)
    extra_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sku = models.CharField(max_length=50, blank=True, unique=True, null=True)

    class Meta:
        unique_together = ('product', 'color_name')

    def __str__(self):
        return f"{self.product.name} - {self.color_name}"

    def save(self, *args, **kwargs):
        if not self.sku:
            # e.g. PROD14-WHT (product id + first 3 letters of color, uppercase)
            color_part = ''.join(ch for ch in self.color_name if ch.isalpha())[:3].upper()
            self.sku = f"PROD{self.product_id}-{color_part}"
        super().save(*args, **kwargs)
        self.product.recalculate_stock()

    def delete(self, *args, **kwargs):
        product = self.product
        super().delete(*args, **kwargs)
        product.recalculate_stock()

    @property
    def final_price(self):
        return self.product.price + self.extra_price

    @property
    def in_stock(self):
        return self.stock > 0

    @property
    def cover_image(self):
        """Is color group ki primary/first image (thumbnail ke liye)."""
        img = self.images.filter(is_primary=True).first() or self.images.first()
        return img.image if img else None


class ProductImage(models.Model):
    """
    Images grouped by color variant.
    - variant set hai  => us color ke group ki image
    - variant None hai => general/default images (color-independent)
    """
    product = models.ForeignKey(Product, related_name='images', on_delete=models.CASCADE)
    variant = models.ForeignKey(
        ProductVariant, related_name='images', on_delete=models.CASCADE,
        null=True, blank=True
    )
    image = models.ImageField(upload_to='products/gallery/')
    is_primary = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['variant_id', 'order', 'id']

    def __str__(self):
        group = self.variant.color_name if self.variant else "General"
        return f"{self.product.name} - {group} image"


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    phone = models.CharField(max_length=15, blank=True)
    address = models.TextField(blank=True)

    def __str__(self):
        return self.user.username


class OTPVerification(models.Model):
    phone = models.CharField(max_length=15, db_index=True)
    otp = models.CharField(max_length=6)
    # auto_now_add (not auto_now): creation time must never move, or OTP expiry checks break
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return f"{self.phone} - {self.otp}"


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('shipped', 'Shipped'),
        ('cancelled', 'Cancelled'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Order {self.id}"

    def recalculate_total(self, save=True):
        total = sum(item.price * item.quantity for item in self.items.all())
        self.total_amount = total
        if save:
            self.save(update_fields=['total_amount'])
        return total


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    variant = models.ForeignKey(ProductVariant, on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])

    def __str__(self):
        color = f" ({self.variant.color_name})" if self.variant else ""
        return f"{self.quantity} x {self.product.name}{color}"

    @property
    def subtotal(self):
        return self.price * self.quantity


class Cart(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Cart {self.id} for {self.user}"

    @property
    def total(self):
        return sum(item.subtotal for item in self.items.all())


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ('cart', 'product', 'variant')

    @property
    def subtotal(self):
        unit_price = self.variant.final_price if self.variant else self.product.price
        return unit_price * self.quantity

    def __str__(self):
        color = f" ({self.variant.color_name})" if self.variant else ""
        return f"{self.product.name}{color} × {self.quantity}"