import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authFetch, getAccessToken } from '../utils/auth.js';
import { sortReviews } from '../utils/reviews.js';
import { useVipStatus } from '../utils/useVip.js';
import RatingStars from '../components/RatingStars.jsx';
import ReviewItem from '../components/ReviewItem.jsx';

// Product ke saare reviews ka full page — ProductDetails ke "Read more reviews"
// button se open hota hai. Most-liked review sabse upar (backend sorted).
function ProductReviewsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const [product, setProduct] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    // VIP user — blue tick wale reviews pin/delete kar sakta hai
    const isVip = useVipStatus(BASEURL);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [id]);

    useEffect(() => {
        const controller = new AbortController();
        // authFetch — logged-in ho toh liked_by_me sahi aata hai
        Promise.all([
            authFetch(`${BASEURL}/api/products/${id}/`, { signal: controller.signal })
                .then((res) => (res.ok ? res.json() : null)),
            authFetch(`${BASEURL}/api/products/${id}/reviews/`, { signal: controller.signal })
                .then((res) => (res.ok ? res.json() : [])),
        ])
            .then(([p, revs]) => {
                setProduct(p);
                setReviews(Array.isArray(revs) ? revs : []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, [id, BASEURL]);

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

    // Review delete — sirf VIP. Count/average turant refresh hote hain.
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
                .then((p) => setProduct(p))
                .catch(() => {});
        } catch {
            // delete fail — review list me hi rahegi
        }
    };

    const ratingAvg = Number(product?.rating_avg) || 0;
    const reviewCount = Number(product?.review_count) || 0;

    return (
        <div className='min-h-screen bg-gray-400'>
            {/* ===== Top bar ===== */}
            <nav className='bg-blue-100 fixed top-0 w-full z-50 flex items-center gap-3 px-3 py-2.5 shadow-sm'>
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
                <h1 className='text-base font-bold text-gray-800 truncate'>Ratings &amp; Reviews</h1>
            </nav>

            {/* ===== Content — natural page scroll, koi inner box nahi ===== */}
            <div className='flex justify-center' style={{ paddingTop: '64px' }}>
                <div className='bg-white shadow-lg rounded-2xl p-4 sm:p-6 max-w-3xl w-full m-4'>
                    {product && (
                        <>
                            <p className='text-lg sm:text-xl font-bold text-gray-800 mb-3'>
                                {product.name}
                            </p>
                            <div className='flex items-center gap-2 mb-5 pb-5 border-b border-gray-100 flex-wrap'>
                                <RatingStars rating={ratingAvg} size={18} />
                                <span className='text-base font-bold text-gray-800'>
                                    {ratingAvg || '—'}
                                </span>
                                <span className='text-sm text-gray-500'>
                                    ({reviewCount} Rating{reviewCount === 1 ? '' : 's'})
                                </span>
                            </div>
                        </>
                    )}

                    {loading && <p className='text-sm text-gray-500 py-4'>Loading reviews…</p>}

                    {!loading && reviews.length === 0 && (
                        <p className='text-sm text-gray-500 py-4'>No reviews yet.</p>
                    )}

                    {!loading && reviews.length > 0 && (
                        <div className='flex flex-col gap-5'>
                            {reviews.map((r) => (
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
            </div>
        </div>
    );
}

export default ProductReviewsPage;
