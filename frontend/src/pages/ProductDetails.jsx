import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useCart } from '../context/CartContext.jsx';
import { authFetch, getAccessToken } from '../utils/auth.js';
import { formatINR } from '../utils/format.js';
import { sortReviews } from '../utils/reviews.js';
import { useVipStatus } from '../utils/useVip.js';
import RatingStars from '../components/RatingStars.jsx';
import ReviewItem from '../components/ReviewItem.jsx';

// Rating badge/reviews list isi threshold par dikhte hain — 10 se kam reviews par hidden.
// Write-review form phir bhi available rehta hai taki reviews accumulate ho sakein.
const MIN_REVIEWS_TO_SHOW = 10;

const STAR_PATH =
    'M12 2l2.9 6.26 6.86.6-5.2 4.51 1.56 6.72L12 16.5l-6.12 3.59 1.56-6.72-5.2-4.51 6.86-.6L12 2z';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

// Reviews ke andar ab koi scrolling nahi — dono viewports par limited preview
// dikhta hai, baaki "Read more reviews" button ke alag page par. Mobile kam dikhata hai.
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';
const PREVIEW_REVIEWS_DESKTOP = 5;
const PREVIEW_REVIEWS_MOBILE = 3;

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

// Out-of-stock product ke liye "Notify Me" — click par owner ke Telegram par
// product + user info chala jaata hai (backend notify_me). Login zaroori hai.
function NotifyMe({ productId, compact }) {
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const [status, setStatus] = useState('idle'); // idle | sending | sent | error
    const [message, setMessage] = useState('');

    const handleClick = async () => {
        if (!getAccessToken()) {
            // guest user — pehle login, wapas isi product par
            navigate('/login', { state: { from: `/product/${productId}` } });
            return;
        }
        setStatus('sending');
        setMessage('');
        try {
            const res = await authFetch(`${BASEURL}/api/products/${productId}/notify-me/`, {
                method: 'POST',
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setStatus('sent');
                setMessage(data.message || 'Request mil gayi!');
            } else if (res.status === 401) {
                // token expire — dobara login
                setStatus('idle');
                navigate('/login', { state: { from: `/product/${productId}` } });
            } else {
                setStatus('error');
                setMessage(data.error || 'Could not send request. Please try again.');
            }
        } catch {
            setStatus('error');
            setMessage('Could not reach the server. Please try again.');
        }
    };

    if (status === 'sent') {
        return (
            <p className={`flex-1 text-sm font-semibold text-green-700 ${compact ? 'text-center py-2' : 'py-3'}`}>
                ✓ {message}
            </p>
        );
    }

    if (status === 'error') {
        return (
            <div className='flex-1 flex flex-col gap-1'>
                <button
                    onClick={handleClick}
                    className={`w-full bg-blue-600 text-white py-3 text-sm font-bold hover:bg-blue-700 transition cursor-pointer ${compact ? 'rounded-lg' : 'rounded-md'}`}
                >
                    🔔 Notify Me
                </button>
                <p className='text-xs text-red-600 font-semibold text-center'>{message}</p>
            </div>
        );
    }

    return (
        <button
            onClick={handleClick}
            disabled={status === 'sending'}
            className={`flex-1 bg-blue-600 text-white py-3 text-sm font-bold hover:bg-blue-700 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${compact ? 'rounded-lg' : 'rounded-md'}`}
        >
            {status === 'sending' ? 'Sending…' : '🔔 Notify Me'}
        </button>
    );
}

function ProductDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
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
    // VIP user — blue tick wale reviews pin/delete kar sakta hai
    const isVip = useVipStatus(BASEURL);

    // ---------- Reviews (Blinkit-style) ----------
    const [reviews, setReviews] = useState([]);
    // Review submit hone par API fresh aggregates lautaata hai — product refetch
    // (loading flash + image reset se bachne ke liye) ke bina badge update karne ke liye.
    const [ratingOverride, setRatingOverride] = useState(null);
    const [myRating, setMyRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [myComment, setMyComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);
    const [reviewMsg, setReviewMsg] = useState(null); // { type: 'ok' | 'error', text }

    useEffect(() => {
        const controller = new AbortController();
        // authFetch — logged-in ho toh liked_by_me sahi aata hai
        authFetch(`${BASEURL}/api/products/${id}/reviews/`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => setReviews(Array.isArray(data) ? data : []))
            .catch(() => {}); // reviews fail hon toh bhi page chalna chahiye
        return () => controller.abort();
    }, [id, BASEURL, retryTrigger]);

    // ---------- Measure navbar height (no hardcoded pt-[60px]) ----------
    const navRef = useRef(null);
    const [navHeight, setNavHeight] = useState(60);
    useEffect(() => {
        if (navRef.current) setNavHeight(navRef.current.offsetHeight);
    }, []);

    // ---------- Mobile detect (reviews preview vs scroll box) ----------
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches
    );
    useEffect(() => {
        const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
        const onChange = (e) => setIsMobile(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
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

    const submitReview = async () => {
        if (!getAccessToken()) {
            navigate('/login', { state: { from: `/product/${id}` } });
            return;
        }
        if (!myRating) {
            setReviewMsg({ type: 'error', text: 'Please select a star rating.' });
            return;
        }
        setSubmittingReview(true);
        setReviewMsg(null);
        try {
            const res = await authFetch(`${BASEURL}/api/products/${id}/reviews/add/`, {
                method: 'POST',
                body: JSON.stringify({ rating: myRating, comment: myComment }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setReviewMsg({ type: 'ok', text: '✓ Review submitted, thank you!' });
                setMyComment('');
                if (data.rating_avg !== undefined) {
                    setRatingOverride({ avg: data.rating_avg, count: data.review_count });
                }
                // Fresh list — most-liked-first order me wapas aayegi
                authFetch(`${BASEURL}/api/products/${id}/reviews/`)
                    .then((r) => (r.ok ? r.json() : []))
                    .then((list) => setReviews(Array.isArray(list) ? list : []))
                    .catch(() => {});
            } else if (res.status === 401) {
                navigate('/login', { state: { from: `/product/${id}` } });
            } else {
                setReviewMsg({ type: 'error', text: data.error || 'Could not save review. Try again.' });
            }
        } catch {
            setReviewMsg({ type: 'error', text: 'Could not reach the server. Please try again.' });
        } finally {
            setSubmittingReview(false);
        }
    };

    // ---------- Derived values (safe against string/NaN prices) ----------
    const numericPrice = Number(product?.price);
    const hasPrice = Number.isFinite(numericPrice) && numericPrice > 0;
    const numericMrp = Number(product?.mrp);
    const showMrp = hasPrice && Number.isFinite(numericMrp) && numericMrp > numericPrice;
    const discount = showMrp ? Math.round(((numericMrp - numericPrice) / numericMrp) * 100) : 0;

    // Stock states: 0 = out of stock (buttons replace honge), 1-10 = low stock urgency
    const totalStock = Number(product?.stock) || 0;
    const outOfStock = !!product && totalStock === 0;
    const lowStock = !!product && !outOfStock && totalStock <= 10;

    // ---------- Rating aggregates (10+ reviews par hi dikhte hain) ----------
    const ratingAvg = ratingOverride ? ratingOverride.avg : Number(product?.rating_avg) || 0;
    const reviewCount = ratingOverride ? ratingOverride.count : Number(product?.review_count) || 0;
    const showRatings = reviewCount >= MIN_REVIEWS_TO_SHOW;
    // Scroll nahi — dono viewports par limited preview, baaki "Read more reviews" page par
    const visibleReviews = isMobile
        ? reviews.slice(0, PREVIEW_REVIEWS_MOBILE)
        : reviews.slice(0, PREVIEW_REVIEWS_DESKTOP);

    // Review like toggle — optimistic update, fail hone par revert
    const handleLike = async (review) => {
        if (!getAccessToken()) {
            navigate('/login', { state: { from: location.pathname } });
            return;
        }
        setReviews((prev) =>
            prev.map((r) =>
                r.id === review.id
                    ? {
                          ...r,
                          liked_by_me: !r.liked_by_me,
                          likes: Math.max(0, (Number(r.likes) || 0) + (r.liked_by_me ? -1 : 1)),
                      }
                    : r
            )
        );
        try {
            const res = await authFetch(`${BASEURL}/api/reviews/${review.id}/like/`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error('like failed');
            const data = await res.json();
            setReviews((prev) =>
                prev.map((r) =>
                    r.id === review.id ? { ...r, liked_by_me: data.liked, likes: data.likes } : r
                )
            );
        } catch {
            setReviews((prev) =>
                prev.map((r) =>
                    r.id === review.id
                        ? { ...r, liked_by_me: review.liked_by_me, likes: review.likes }
                        : r
                )
            );
        }
    };

    // Review pin — sirf VIP. Pinned review list me top par aata hai (ek product, ek pin).
    const handlePin = async (review) => {
        if (!isVip) return;
        try {
            const res = await authFetch(`${BASEURL}/api/reviews/${review.id}/pin/`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error('pin failed');
            const data = await res.json();
            setReviews((prev) =>
                sortReviews(
                    prev.map((r) => (r.id === review.id ? { ...r, is_pinned: data.pinned } : r))
                )
            );
        } catch {
            // pin fail — chup rehna theek hai, review waisi hi rehti hai
        }
    };

    // Review delete — sirf VIP. Count/average turant refresh hote hain (page reload ke bina).
    const handleDelete = async (review) => {
        if (!isVip) return;
        if (!window.confirm('Delete this review?')) return;
        try {
            const res = await authFetch(`${BASEURL}/api/reviews/${review.id}/`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('delete failed');
            setReviews((prev) => prev.filter((r) => r.id !== review.id));
            authFetch(`${BASEURL}/api/products/${id}/`)
                .then((res) => (res.ok ? res.json() : null))
                .then((p) => {
                    if (p) {
                        setProduct(p);
                        setRatingOverride(null);
                    }
                })
                .catch(() => {});
        } catch {
            // delete fail — review list me hi rahegi
        }
    };

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
                                                    className={`w-14 h-14 rounded-xl border-2 overflow-hidden p-1 bg-slate-50 transition-all flex-shrink-0 cursor-pointer ${isActive ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-400'
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

                                {/* Rating chip (Blinkit jaisa) — sirf 10+ reviews par */}
                                {showRatings && (
                                    <div className='flex items-center gap-2 mb-3 flex-wrap'>
                                        <RatingStars rating={ratingAvg} size={16} />
                                        <span className='text-sm font-bold text-gray-800'>
                                            {ratingAvg}
                                        </span>
                                        <span className='text-sm text-gray-500'>
                                            ({reviewCount} Ratings)
                                        </span>
                                    </div>
                                )}

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

                                {lowStock && (
                                    <p className='text-sm font-semibold text-orange-600 -mt-4 mb-4'>
                                        Only {totalStock} left in stock
                                    </p>
                                )}
                                {outOfStock && (
                                    <p className='text-sm font-semibold text-red-600 -mt-4 mb-4'>
                                        Out of Stock
                                    </p>
                                )}

                                {/* Desktop-only action buttons */}
                                <div className='hidden md:flex gap-3 mt-4'>
                                    {outOfStock ? (
                                        <>
                               
                                            <NotifyMe productId={product.id} />
                                        </>
                                    ) : (
                                        <>
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
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ===== Ratings & Reviews — scroll nahi, limited preview; baaki "Read more reviews" page par (sirf 10+ reviews par) ===== */}
                        {showRatings && (
                            <section className='mt-8 border-t border-gray-100 pt-6'>
                                <h2 className='text-xl font-bold text-gray-800 mb-4'>
                                    Ratings &amp; Reviews
                                </h2>
                                <div className='rounded-xl border border-gray-100 bg-slate-50/60 p-4'>
                                    {reviews.length === 0 ? (
                                        <p className='text-sm text-gray-500'>Loading reviews…</p>
                                    ) : (
                                        <div className='flex flex-col gap-5'>
                                            {visibleReviews.map((r) => (
                                                <ReviewItem
                                                    key={r.id}
                                                    review={r}
                                                    onLike={handleLike}
                                                    onPin={handlePin}
                                                    onDelete={handleDelete}
                                                    canModerate={isVip}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* Saare reviews ka alag page — most-liked-first full list */}
                                <button
                                    onClick={() => navigate(`/product/${id}/reviews`)}
                                    className='mt-3 w-full md:w-auto md:px-6 border border-gray-300 rounded-lg py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50 transition cursor-pointer'
                                >
                                    Read more reviews ({reviewCount})
                                </button>
                            </section>
                        )}

                        {/* ===== Rate this product — alag section, hamesha available (reviews isse accumulate hote hain) ===== */}
                        <section className='mt-8 border-t border-gray-100 pt-6'>
                            <h2 className='text-lg font-bold text-gray-800 mb-2'>
                                Rate this product
                            </h2>
                            <div className='flex items-center gap-1 mb-3'>
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type='button'
                                        onMouseEnter={() => setHoverRating(star)}
                                        onMouseLeave={() => setHoverRating(0)}
                                        onClick={() => setMyRating(star)}
                                        className='p-0.5 cursor-pointer transition-transform hover:scale-110'
                                        aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                                    >
                                        <svg
                                            width='28'
                                            height='28'
                                            viewBox='0 0 24 24'
                                            fill={star <= (hoverRating || myRating) ? '#f59e0b' : '#d1d5db'}
                                        >
                                            <path d={STAR_PATH} />
                                        </svg>
                                    </button>
                                ))}
                                {(hoverRating || myRating) > 0 && (
                                    <span className='ml-2 text-sm font-semibold text-gray-700'>
                                        {RATING_LABELS[hoverRating || myRating]}
                                    </span>
                                )}
                            </div>
                            <textarea
                                value={myComment}
                                onChange={(e) => setMyComment(e.target.value)}
                                placeholder='Share your experience (optional)…'
                                rows={3}
                                maxLength={1000}
                                className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none'
                            />
                            <div className='flex items-center gap-3 mt-2 flex-wrap'>
                                <button
                                    onClick={submitReview}
                                    disabled={submittingReview}
                                    className='bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer'
                                >
                                    {submittingReview ? 'Submitting…' : 'Submit Review'}
                                </button>
                                {reviewMsg && (
                                    <p
                                        className={`text-sm font-semibold ${
                                            reviewMsg.type === 'ok' ? 'text-green-700' : 'text-red-600'
                                        }`}
                                    >
                                        {reviewMsg.text}
                                    </p>
                                )}
                            </div>
                            {!getAccessToken() && (
                                <p className='text-xs text-gray-500 mt-2'>
                                    You&apos;ll be asked to log in before submitting.
                                </p>
                            )}
                        </section>
                    </div>
                )}
            </div>

            {/* ================= Bottom Action Bar (mobile only) ================= */}
            <div className='fixed bottom-0 w-full z-50 bg-white border-t border-gray-200 flex items-center gap-2 px-3 py-2.5 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] md:hidden'>
                {outOfStock ? (
                    <>
                        <button
                            disabled
                            className='flex-1 bg-gray-200 text-gray-500 rounded-lg py-2 text-center text-sm font-bold cursor-not-allowed'
                        >
                            Out of Stock
                        </button>
                        <NotifyMe productId={product?.id} compact />
                    </>
                ) : (
                    <>
                        <button
                            onClick={handleAddToCart}
                            disabled={addingToCart}
                            className='flex-1 bg-white border border-gray-400 rounded-md py-3 text-sm font-bold text-gray-800 hover:bg-gray-50 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                        >
                            {justAdded ? 'Added ✓' : 'Add to cart'}
                        </button>

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
                    </>
                )}
            </div>
        </div>
    );
}

export default ProductDetails;