import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authFetch } from "../utils/auth.js";
import { formatDateTime } from "../utils/format.js";

const STAR_PATH =
    "M12 2l2.9 6.26 6.86.6-5.2 4.51 1.56 6.72L12 16.5l-6.12 3.59 1.56-6.72-5.2-4.51 6.86-.6L12 2z";

// Blinkit-style "Rate order" page — Order History ke Rate order button se khulta hai.
// Har item ko 1-5 star do; Submit sab ratings ko product review ke roop me save karta hai.
function RateOrderPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ratings, setRatings] = useState({}); // product_id -> 1..5
    const [hover, setHover] = useState({}); // product_id -> hover preview
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        authFetch(`${BASEURL}/api/orders/${orderId}/`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setOrder(data))
            .catch(() => setOrder(null))
            .finally(() => setLoading(false));
    }, [orderId, BASEURL]);

    const allRated = order ? order.items.every((i) => ratings[i.product_id]) : false;

    const setRating = (productId, value) =>
        setRatings((prev) => ({ ...prev, [productId]: value }));

    const setHoverRating = (productId, value) =>
        setHover((prev) => ({ ...prev, [productId]: value }));

    // Har rated item par review upsert hota hai (purana tha toh update)
    const handleSubmit = async () => {
        if (!allRated || submitting) return;
        setSubmitting(true);
        setError("");
        try {
            for (const item of order.items) {
                const res = await authFetch(
                    `${BASEURL}/api/products/${item.product_id}/reviews/add/`,
                    {
                        method: "POST",
                        body: JSON.stringify({ rating: ratings[item.product_id] }),
                    }
                );
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Rating save nahi hui. Please try again.");
                }
            }
            // Success message dikhao, phir history par wapas
            setSubmitted(true);
            setTimeout(() => navigate("/orders/history"), 1800);
        } catch (err) {
            setError(err.message || "Could not save ratings. Please try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-400">
            {/* ===== Top bar ===== */}
            <nav className="bg-blue-100 fixed top-0 w-full z-50 grid grid-cols-[auto_1fr_auto] items-center px-3 py-2.5 shadow-sm">
                <button
                    onClick={() => navigate("/orders/history")}
                    className="w-9 h-9 flex items-center justify-center text-gray-800 hover:text-blue-600 transition-colors"
                    title="Back to order history"
                    aria-label="Back to order history"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <h1 className="text-center text-base sm:text-lg font-bold text-gray-800">Rate Order</h1>
                <div className="w-9 h-9"></div>
            </nav>

            <div className="pt-[76px] pb-28 px-4 max-w-2xl mx-auto">
                {loading && <p className="text-center text-gray-800 py-10">Loading order…</p>}

                {!loading && !order && (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                        <p className="text-gray-600">Order not found.</p>
                    </div>
                )}

                {!loading && order && submitted && (
                    <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                        <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                            <svg className="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-1">Thanks for your feedback!</h2>
                        <p className="text-sm text-gray-500">Your ratings have been saved.</p>
                    </div>
                )}

                {!loading && order && !submitted && (
                    <>
                        <p className="text-base sm:text-lg font-semibold text-gray-700 mb-4">
                            Please tell us about items in your order
                        </p>
                        <p className="text-xs text-gray-500 mb-4">
                            #{order.order_ref} · placed {formatDateTime(order.created_at)}
                        </p>

                        <div className="flex flex-col gap-4">
                            {order.items.map((item) => {
                                const pid = item.product_id;
                                const shown = hover[pid] || ratings[pid] || 0;
                                const img = item.image;
                                const src = img
                                    ? img.startsWith("http")
                                        ? img
                                        : `${BASEURL}${img.startsWith("/") ? "" : "/"}${img}`
                                    : null;
                                return (
                                    <div
                                        key={pid}
                                        className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4"
                                    >
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-50 border border-gray-100 p-1.5 flex items-center justify-center shrink-0">
                                            {src ? (
                                                <img src={src} alt={item.product} className="w-full h-full object-contain" />
                                            ) : (
                                                <span className="text-2xl">📦</span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                                                {item.product}
                                            </p>
                                            {/* Star input — hover preview ke saath */}
                                            <div className="flex gap-2.5 mt-2">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <button
                                                        key={star}
                                                        type="button"
                                                        onMouseEnter={() => setHoverRating(pid, star)}
                                                        onMouseLeave={() => setHoverRating(pid, 0)}
                                                        onClick={() => setRating(pid, star)}
                                                        aria-label={`Rate ${item.product} ${star} star${star > 1 ? "s" : ""}`}
                                                        className="p-0.5 cursor-pointer transition-transform hover:scale-110"
                                                    >
                                                        <svg
                                                            viewBox="0 0 24 24"
                                                            className="w-7 h-7 sm:w-8 sm:h-8"
                                                            fill={star <= shown ? "#f59e0b" : "none"}
                                                            stroke={star <= shown ? "#f59e0b" : "#9ca3af"}
                                                            strokeWidth="1.8"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d={STAR_PATH} />
                                                        </svg>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {error && (
                            <p className="mt-4 text-sm font-semibold text-red-600 text-center">{error}</p>
                        )}
                    </>
                )}
            </div>

            {/* ===== Sticky Submit — submitted hone par chhupa do ===== */}
            {order && !submitted && (
                <div className="fixed bottom-0 inset-x-0 z-[60] bg-gray-100 border-t border-gray-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    <div className="max-w-2xl mx-auto">
                        <button
                            onClick={handleSubmit}
                            disabled={!allRated || submitting}
                            className={`w-full py-3.5 rounded-xl text-lg font-bold transition-colors cursor-pointer ${
                                allRated && !submitting
                                    ? "bg-green-600 text-white hover:bg-green-700"
                                    : "bg-gray-300 text-gray-100 cursor-not-allowed"
                            }`}
                        >
                            {submitting ? "Submitting…" : allRated ? "Submit" : "Rate all items to submit"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RateOrderPage;
