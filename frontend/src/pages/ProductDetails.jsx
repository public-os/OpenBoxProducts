import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useCart } from '../context/CartContext.jsx';
import { getAccessToken } from '../utils/auth.js';
import { formatINR } from '../utils/format.js';

// Reusable icon (defined outside the component so it doesn't remount every render)
const CartIcon = ({ className }) => (
    <svg className={className} fill='none' stroke='currentColor' viewBox='0 0 24 24'>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2'
            d='M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'
        />
    </svg>
);

function ProductDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    // ---------- State ----------
    const [searchQuery, setSearchQuery] = useState('');
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryTrigger, setRetryTrigger] = useState(0);

    const [addingToCart, setAddingToCart] = useState(false);
    const [justAdded, setJustAdded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

    const { addToCart, cartItems } = useCart();
    const cartItemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

    // ---------- Measure navbar height (no hardcoded pt-[60px]) ----------
    const navRef = useRef(null);
    const [navHeight, setNavHeight] = useState(60);
    useEffect(() => {
        if (navRef.current) setNavHeight(navRef.current.offsetHeight);
    }, []);

    // ---------- Fetch product (resets state, aborts stale requests) ----------
    useEffect(() => {
        const controller = new AbortController();

        queueMicrotask(() => {
            setLoading(true);
            setError(null);
            setProduct(null);
            setImageError(false);
            setSelectedImage(null);
        });

        fetch(`${BASEURL}/api/products/${id}/`, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error('Failed to fetch product details');
                return response.json();
            })
            .then((data) => {
                setProduct(data);
                setLoading(false);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return; // stale request — ignore
                setError(err.message);
                setLoading(false);
            });

        return () => controller.abort();
    }, [id, BASEURL, retryTrigger]);

    // ---------- Handlers ----------
    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    const requireLogin = () => {
        if (!getAccessToken()) {
            navigate('/login', { state: { from: `/product/${id}` } });
            return true;
        }
        return false;
    };

    const handleAddToCart = async () => {
        if (requireLogin()) return;

        setAddingToCart(true);
        try {
            await addToCart(product.id); // works whether addToCart is async or not
            setJustAdded(true);
            setTimeout(() => setJustAdded(false), 1500);
        } catch (err) {
            console.error('Add to cart failed:', err);
        } finally {
            setAddingToCart(false);
        }
    };

    const handleBuyNow = async () => {
        if (requireLogin()) return;

        setAddingToCart(true);
        try {
            await addToCart(product.id);
            navigate('/checkout');
        } catch (err) {
            console.error('Buy now failed:', err);
        } finally {
            setAddingToCart(false);
        }
    };

    // ---------- Derived values (safe against string/NaN prices) ----------
    const numericPrice = Number(product?.price);
    const hasPrice = Number.isFinite(numericPrice) && numericPrice > 0;
    const numericMrp = Number(product?.mrp);
    const showMrp = hasPrice && Number.isFinite(numericMrp) && numericMrp > numericPrice;
    const discount = showMrp ? Math.round(((numericMrp - numericPrice) / numericMrp) * 100) : 0;

    // ---------- Image URLs (Thumbnail + Gallery) ----------
    const resolveImageUrl = (img) => {
        if (!img) return null;
        if (img.startsWith('http')) return img;
        return `${BASEURL}/${img.replace(/^\//, '')}`;
    };

    const galleryImages = [
        ...(product?.image ? [{ id: 'main', image: product.image }] : []),
        ...(product?.images || []),
    ];

    const currentImage = selectedImage || (galleryImages[0]?.image ? resolveImageUrl(galleryImages[0].image) : null);

    return (
        <div className='min-h-screen bg-gray-400'>
            {/* ================= Top Navbar (visible even while loading) ================= */}
            <nav
                ref={navRef}
                className='bg-blue-100 fixed top-0 w-full z-50 flex items-center gap-3 px-3 py-2.5 shadow-sm'
            >
                {/* Back Arrow */}
                <button
                    onClick={() => navigate(-1)}
                    className='p-1.5 text-gray-800 hover:text-blue-600 transition-colors'
                    title='Back'
                    aria-label='Go back'
                >
                    <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M10 19l-7-7m0 0l7-7m-7 7h18' />
                    </svg>
                </button>

                {/* Search Bar */}
                <form onSubmit={handleSearch} className='flex-1'>
                    <div className='flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2'>
                        <svg className='w-4 h-4 text-gray-500 shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z' />
                        </svg>
                        <input
                            type='text'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder='Search for products'
                            className='w-full bg-transparent text-sm text-gray-700 placeholder-gray-500 focus:outline-none'
                        />
                    </div>
                </form>

                {/* Cart */}
                <Link
                    to='/cart'
                    className='relative p-2 text-gray-700 hover:text-blue-600 transition-colors'
                    title='Cart'
                    aria-label={`Cart, ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}`}
                >
                    <CartIcon className='w-6 h-6' />
                    {cartItemCount > 0 && (
                        <span className='absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center'>
                            {cartItemCount}
                        </span>
                    )}
                </Link>
            </nav>

            {/* ================= Content ================= */}
            <div className='pb-24 md:pb-8 flex justify-center' style={{ paddingTop: `${navHeight + 12}px` }}>
                {loading && <div className='py-20 text-gray-800'>Loading...</div>}

                {!loading && error && (
                    <div className='py-20 text-center'>
                        <p className='text-red-600 mb-4'>Error: {error}</p>
                        <button
                            onClick={() => setRetryTrigger((t) => t + 1)}
                            className='bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition cursor-pointer'
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && !product && (
                    <div className='py-20 text-gray-800'>No product found</div>
                )}

                {!loading && !error && product && (
                    <div className='bg-white shadow-lg rounded-2xl p-6 max-w-3xl w-full m-4'>
                        <div className='flex flex-col md:flex-row gap-8'>
                            <div className='w-full md:w-1/2 flex flex-col gap-3'>
                                <div className='w-full bg-slate-50/80 rounded-2xl p-4 flex items-center justify-center h-64 sm:h-80 md:h-96 overflow-hidden border border-gray-100 shadow-inner'>
                                    {currentImage && !imageError ? (
                                        <img
                                            src={currentImage}
                                            alt={product.name}
                                            onError={() => setImageError(true)}
                                            className='h-full w-full object-contain hover:scale-105 transition-transform duration-300'
                                        />
                                    ) : (
                                        <div className='text-gray-400 font-medium'>
                                            No image available
                                        </div>
                                    )}
                                </div>

                                {/* Gallery Thumbnails row */}
                                {galleryImages.length > 1 && (
                                    <div className='flex items-center gap-2 overflow-x-auto no-scrollbar py-1'>
                                        {galleryImages.map((imgObj, idx) => {
                                            const fullUrl = resolveImageUrl(imgObj.image);
                                            const isActive = currentImage === fullUrl;
                                            return (
                                                <button
                                                    key={imgObj.id || idx}
                                                    onClick={() => setSelectedImage(fullUrl)}
                                                    className={`w-14 h-14 rounded-xl border-2 overflow-hidden p-1 bg-slate-50 transition-all flex-shrink-0 cursor-pointer ${
                                                        isActive ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-400'
                                                    }`}
                                                >
                                                    <img src={fullUrl} alt="Gallery thumbnail" className="w-full h-full object-contain" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className='flex-1'>
                                <h1 className='text-3xl font-bold text-gray-800 mb-2'>{product.name}</h1>
                                <p className='text-gray-600 mb-4'>{product.description}</p>
                                <div className='flex items-baseline gap-2 flex-wrap mb-6'>
                                    <p className='text-2xl font-semibold text-green-600'>
                                        ₹{hasPrice ? formatINR(numericPrice) : '—'}
                                    </p>
                                    {showMrp && (
                                        <span className='text-base text-gray-500 line-through'>
                                            MRP ₹{formatINR(numericMrp)}
                                        </span>
                                    )}
                                    {discount > 0 && (
                                        <span className='text-sm font-semibold text-green-700'>({discount}% off)</span>
                                    )}
                                </div>

                                {/* Mobile-only Add to Cart button */}
                                <button
                                    onClick={handleAddToCart}
                                    disabled={addingToCart}
                                    className={`md:hidden text-white px-6 py-2 rounded-lg transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                        justAdded ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    {addingToCart ? 'Adding…' : justAdded ? 'Added ✓' : 'Add to Cart 🛒'}
                                </button>

                                {/* Desktop-only action buttons */}
                                <div className='hidden md:flex gap-3 mt-4'>
                                    <button
                                        onClick={handleAddToCart}
                                        disabled={addingToCart}
                                        className='flex-1 bg-white border border-gray-400 rounded-md py-3 text-sm font-bold text-gray-800 hover:bg-gray-50 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                                    >
                                        {justAdded ? 'Added ✓' : 'Add to cart'}
                                    </button>
                                    <button
                                        onClick={handleBuyNow}
                                        disabled={addingToCart}
                                        className='flex-1 bg-gradient-to-b from-yellow-300 to-yellow-400 rounded-md py-3 text-sm font-bold text-gray-900 hover:from-yellow-400 hover:to-yellow-500 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                                    >
                                        {hasPrice ? `Buy at ₹${formatINR(numericPrice)}` : 'Buy now'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ================= Bottom Action Bar (mobile only) ================= */}
            <div className='fixed bottom-0 w-full z-50 bg-white border-t border-gray-200 flex items-center gap-2 px-3 py-2.5 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] md:hidden'>
                <Link
                    to='/cart'
                    className='border border-gray-300 rounded-lg p-2.5 text-gray-700 hover:bg-gray-50 transition'
                    title='Go to Cart'
                    aria-label='Go to cart'
                >
                    <CartIcon className='w-5 h-5' />
                </Link>

                {/* Buy Now */}
                <button
                    onClick={handleBuyNow}
                    disabled={!product || addingToCart}
                    className='flex-1 bg-yellow-400 rounded-lg py-2 text-center hover:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed'
                >
                    <span className='block text-sm font-bold text-gray-900'>
                        {addingToCart ? 'Please wait…' : 'Buy now'}
                    </span>
                    <span className='block text-xs text-gray-800'>
                        {hasPrice ? `at ₹${formatINR(numericPrice)}` : 'See price at checkout'}
                    </span>
                </button>
            </div>
        </div>
    );
}

export default ProductDetails;