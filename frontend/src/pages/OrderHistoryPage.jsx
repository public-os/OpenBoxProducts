import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { authFetch } from "../utils/auth.js";
import { formatINR, formatDate, formatTime } from "../utils/format.js";

// Blinkit-style Order History page — Account page ke "Your Orders History"
// se khulta hai. Sirf delivered (received) orders dikhate hai.
function OrderHistoryPage() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();
    const { addToCart } = useCart();

    const [orders, setOrders] = useState(null); // null = loading
    const [query, setQuery] = useState("");
    const [sheetOrder, setSheetOrder] = useState(null); // three-dot wala order
    const [reorderingId, setReorderingId] = useState(null);

    useEffect(() => {
        authFetch(`${BASEURL}/api/orders/`)
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                const delivered = Array.isArray(data)
                    ? data.filter((o) => o.status === "delivered")
                    : [];
                setOrders(delivered);
            })
            .catch(() => setOrders([]));
    }, [BASEURL]);

    // Search — order ref ya product name se filter
    const q = query.trim().toLowerCase();
    const filtered = orders
        ? orders.filter(
            (o) =>
                !q ||
                o.order_ref.toLowerCase().includes(q) ||
                o.items.some((i) => i.product.toLowerCase().includes(q))
        )
        : [];

    // Saare items dobara cart me daalo — quantity aur variant (color) dono
    // preserve hote hai (backend ek call = +1 unit, isliye quantity times loop).
    // Koi add fail ho (stock khatam etc.) toh baaki bhi try karte hai, end me
    // ek hi summary alert — aur jitna add hua wahi cart me dikhega.
    const handleReorder = async (order) => {
        setReorderingId(order.order_id);
        let attempted = 0;
        let failed = 0;
        for (const item of order.items) {
            const qty = Math.max(1, Number(item.quantity) || 1);
            for (let n = 0; n < qty; n++) {
                attempted += 1;
                const ok = await addToCart(item.product_id, item.variant_id ?? null, { silent: true });
                if (!ok) failed += 1;
            }
        }
        setReorderingId(null);
        if (failed > 0) {
            alert(
                failed === attempted
                    ? "Items could not be added to your cart — they may be out of stock now."
                    : `${failed} of ${attempted} item(s) could not be added — they may be out of stock now.`
            );
        }
        if (failed < attempted) navigate("/cart");
    };

    // Rate order → Blinkit-style rating page (har item ko stars)
    const handleRate = (order) => {
        navigate(`/orders/history/${order.order_id}/rate`);
    };

    // Order history se delete (confirm ke baad)
    const handleDelete = async () => {
        const order = sheetOrder;
        setSheetOrder(null);
        if (!window.confirm(`Delete order #${order.order_ref}? You won't be able to access it again.`)) {
            return;
        }
        try {
            const res = await authFetch(`${BASEURL}/api/orders/${order.order_id}/`, {
                method: "DELETE",
            });
            if (res.ok) {
                setOrders((prev) => prev.filter((o) => o.order_id !== order.order_id));
            } else {
                alert("Could not delete order. Please try again.");
            }
        } catch {
            alert("Could not delete order. Please try again.");
        }
    };

    // Items share — navigator.share (mobile) ya clipboard fallback
    const handleShare = async () => {
        const order = sheetOrder;
        setSheetOrder(null);
        const lines = order.items.map(
            (i) => `${i.quantity} × ${i.product}${i.variant ? ` (${i.variant})` : ""}`
        );
        const text = `My order from OpenBox Shop\n#${order.order_ref}\n${lines.join(
            "\n"
        )}\nTotal: ₹${formatINR(order.total_amount)}`;
        if (navigator.share) {
            try {
                await navigator.share({ title: `Order #${order.order_ref}`, text });
                return;
            } catch (err) {
                if (err && err.name === "AbortError") return; // user ne cancel kiya
            }
        }
        try {
            await navigator.clipboard.writeText(text);
            alert("Order items copied to clipboard.");
        } catch {
            alert("Sharing is not supported on this device.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-400 mb-6">
            {/* ===== Top bar ===== */}
            <nav className="bg-blue-100 fixed top-0 w-full z-50 grid grid-cols-[auto_1fr_auto] items-center px-3 py-2.5 shadow-sm">
                <button
                    onClick={() => navigate("/")}
                    className="w-9 h-9 flex items-center justify-center text-gray-800 hover:text-blue-600 transition-colors"
                    title="Back to home"
                    aria-label="Back to home"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <h1 className="text-center text-base sm:text-lg font-bold text-gray-800">Order History</h1>
                <div className="w-9 h-9"></div>
            </nav>

            <div className="pt-[70px] pb-10 px-4 max-w-2xl mx-auto">
                {/* ===== Search ===== */}
                <div className="bg-white rounded-full shadow-sm flex items-center gap-3 px-5 py-3.5 mb-5 sticky top-[66px] z-40">
                    <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                    </svg>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search your orders"
                        className="w-full bg-transparent text-sm sm:text-base text-gray-800 placeholder-gray-500 focus:outline-none"
                    />
                </div>

                {/* ===== Loading ===== */}
                {orders === null && <p className="text-center text-gray-800 py-10">Loading your orders…</p>}

                {/* ===== Empty ===== */}
                {orders !== null && orders.length === 0 && (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                        <p className="text-gray-600 mb-4">No delivered orders yet.</p>
                        <Link
                            to="/"
                            className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition"
                        >
                            Start Shopping
                        </Link>
                    </div>
                )}

                {/* ===== Search me kuch nahi ===== */}
                {orders !== null && orders.length > 0 && filtered.length === 0 && (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                        <p className="text-gray-600">No orders match “{query}”.</p>
                    </div>
                )}

                {/* ===== Order cards ===== */}
                <div className="flex flex-col gap-5">
                    {filtered.map((order) => (
                        <div key={order.order_id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                            {/* Header: green check + received date + price/ref + three-dot */}
                            <div className="flex items-center gap-3 p-4">
                                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                                    <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-lg font-bold text-gray-900 truncate">
                                        Received on {formatDate(order.updated_at)}
                                    </h2>
                                    <p className="text-sm text-gray-600 truncate">
                                        ₹{formatINR(order.total_amount)} • {formatTime(order.updated_at)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSheetOrder(order)}
                                    aria-label={`Options for order ${order.order_ref}`}
                                    title="Order Info"
                                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
                                >
                                    <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                                        <circle cx="12" cy="5" r="1.8" />
                                        <circle cx="12" cy="12" r="1.8" />
                                        <circle cx="12" cy="19" r="1.8" />
                                    </svg>
                                </button>
                            </div>

                            {/* Product images row — click par Order Summary page khulta hai */}
                            <div className="px-4 pb-4 flex gap-2.5 overflow-x-auto no-scrollbar">
                                {order.items.map((item, i) => {
                                    const img = item.image;
                                    const src = img
                                        ? img.startsWith("http")
                                            ? img
                                            : `${BASEURL}${img.startsWith("/") ? "" : "/"}${img}`
                                        : null;
                                    return (
                                        <Link
                                            key={i}
                                            to={`/orders/history/${order.order_id}`}
                                            title={`Order summary — ${item.product}`}
                                            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-50 border border-gray-100 p-1.5 flex items-center justify-center shrink-0 hover:shadow-md transition-shadow cursor-pointer"
                                        >
                                            {src ? (
                                                <img src={src} alt={item.product} className="w-full h-full object-contain" />
                                            ) : (
                                                <span className="text-2xl">📦</span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>

                            {/* Actions: Reorder | Rate order */}
                            <div className="grid grid-cols-2 border-t border-gray-100">
                                <button
                                    onClick={() => handleReorder(order)}
                                    disabled={reorderingId === order.order_id}
                                    className="py-3.5 text-sm sm:text-base font-semibold text-green-700 hover:bg-green-50 transition-colors cursor-pointer disabled:opacity-60 border-r border-gray-100"
                                >
                                    {reorderingId === order.order_id ? "Adding…" : "Reorder"}
                                </button>
                                <button
                                    onClick={() => handleRate(order)}
                                    className="py-3.5 text-sm sm:text-base font-semibold text-green-700 hover:bg-green-50 transition-colors cursor-pointer"
                                >
                                    Rate order
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ===== Order Info bottom sheet (three-dot se khulta hai) ===== */}
            {sheetOrder && (
                <div className="fixed inset-0 z-[60]">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setSheetOrder(null)} />
                    <div className="absolute bottom-0 inset-x-0 bg-gray-100 rounded-t-3xl p-5 pb-10">
                        {/* Floating close X — sheet ke theek upar */}
                        <button
                            onClick={() => setSheetOrder(null)}
                            aria-label="Close"
                            className="absolute -top-[72px] left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-gray-600/90 text-white flex items-center justify-center shadow-lg cursor-pointer hover:bg-gray-700 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h2 className="text-xl font-extrabold text-gray-900 mb-4">Order Info</h2>
                        <div className="bg-white rounded-2xl divide-y divide-gray-100 overflow-hidden">
                            {/* Delete order */}
                            <button
                                onClick={handleDelete}
                                className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                <span className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-base font-bold text-gray-900">Delete order</span>
                                    <span className="block text-sm text-gray-500">
                                        You won&apos;t be able to access this order once deleted
                                    </span>
                                </span>
                                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>

                            {/* Share order items */}
                            <button
                                onClick={handleShare}
                                className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                <span className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-base font-bold text-gray-900">Share order items</span>
                                    <span className="block text-sm text-gray-500">
                                        We will not share other details, only items will get shared
                                    </span>
                                </span>
                                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default OrderHistoryPage;
