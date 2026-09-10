import { useCallback, useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import { Link, useNavigate } from "react-router-dom";
import { authFetch, getAccessToken } from "../utils/auth.js";
import { formatDateTime, formatINR } from "../utils/format.js";

const PAYMENT_BADGES = {
    pending: "bg-yellow-100 text-yellow-800",
    verifying: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-700",
};

const PAYMENT_LABELS = {
    pending: "Payment Pending",
    verifying: "Verifying Payment",
    paid: "Paid",
    failed: "Payment Failed",
};

const ORDER_BADGES = {
    verifying: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    shipped: "bg-blue-100 text-blue-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-700",
};

const ORDER_LABELS = {
    verifying: "Verifying Payment",
    paid: "Confirmed",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
};

// Order ki product images — pehli 3 dikhengi (overlap cluster), click par
// wahi product details page khulta hai. Baaki items +N me count hote hai.
function OrderThumbs({ order }) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const thumbs = order.items.slice(0, 3);
    const extra = order.items.length - thumbs.length;
    return (
        <div className="flex -space-x-3 shrink-0">
            {thumbs.map((item, i) => {
                const img = item.image;
                const src = img
                    ? img.startsWith("http")
                        ? img
                        : `${BASEURL}${img.startsWith("/") ? "" : "/"}${img}`
                    : null;
                return (
                    <Link
                        key={i}
                        to={`/product/${item.product_id}`}
                        title={item.product}
                        className="relative block w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden hover:scale-110 hover:z-10 transition-transform cursor-pointer"
                    >
                        {src ? (
                            <img src={src} alt={item.product} className="w-full h-full object-cover" />
                        ) : (
                            <span className="w-full h-full bg-gray-100 flex items-center justify-center text-sm">
                                📦
                            </span>
                        )}
                    </Link>
                );
            })}
            {extra > 0 && (
                <span className="w-12 h-12 rounded-full border-2 border-white shadow-sm bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold">
                    +{extra}
                </span>
            )}
        </div>
    );
}

function CartPage() {
    const { cartItems, total, removeFromCart, updateQuantity } = useCart();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const nav = useNavigate();

    // User ke saare orders — null = loading / logged out, [] = kuch nahi.
    // Status ke hisaab se sections derive hote hai: pending (payment baaki),
    // active (payment ho gaya, delivery chal rahi hai). Delivered history
    // Account page ke "Your Orders History" me dikhti hai.
    const [orders, setOrders] = useState(null);
    // Jis pending order ka remove chal raha hai uska id (button disable ke liye)
    const [removingId, setRemovingId] = useState(null);

    const loadOrders = useCallback(() => {
        if (!getAccessToken()) return Promise.resolve();
        return authFetch(`${BASEURL}/api/orders/`)
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                setOrders(data);
            })
            .catch(() => {
                setOrders([]);
            });
    }, [BASEURL]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    // Pending = sirf wo orders jinpe user ko abhi Pay Now karna hai.
    // Verifying (UTR submit ho chuka, admin verification baaki) aur paid
    // payment wale active side me dikhte hai — unme user ka koi action nahi.
    const pendingOrders = orders
        ? orders.filter(
            (o) =>
                o.status === "pending" &&
                o.payment_status !== "verifying" &&
                o.payment_status !== "paid"
        )
        : null;
    const activeOrders = orders
        ? orders.filter(
            (o) =>
                o.status === "paid" ||
                o.status === "shipped" ||
                (o.status === "pending" &&
                    (o.payment_status === "verifying" || o.payment_status === "paid"))
        )
        : [];

    // Pending order remove — backend par cancel hota hai, stock wapas add ho jata hai
    const handleRemoveOrder = async (orderId) => {
        if (!window.confirm("Remove this pending order?")) return;
        setRemovingId(orderId);
        try {
            const res = await authFetch(`${BASEURL}/api/orders/${orderId}/cancel/`, {
                method: "POST",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || "Could not remove order.");
                return;
            }
            await loadOrders();
        } catch (error) {
            console.error("Error removing order:", error);
            alert("Could not remove order. Please try again.");
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <div className="pt-20 min-h-screen bg-gray-400 p-4 sm:p-20 sm:pb-20 pb-20 md:pb-8">
            <nav className="bg-blue-100 fixed top-0 left-0 w-full z-50 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5">
                {/* Back Arrow */}
                <button
                    onClick={() => nav(-1)}
                    className="w-9 h-9 flex items-center justify-center text-gray-800 hover:text-blue-600 transition-colors"
                    title="Back"
                    aria-label="Go back"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>

                <p className="text-center">Your Cart</p>

                {/* Home icon — sirf desktop par */}
                <Link
                    to="/"
                    className="hidden md:flex w-9 h-9 items-center justify-center text-gray-800 hover:text-blue-600 transition-colors"
                    title="Home"
                    aria-label="Go to home"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l9-9 9 9" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" />
                    </svg>
                </Link>
                {/* mobile par placeholder — title centered rahe */}
                <div className="w-9 h-9 md:hidden"></div>
            </nav>
            {cartItems.length === 0 ? (
                <div className="text-center mb-6">
                    <p className="text-gray-600 text-base sm:text-lg">
                        Your cart is empty.
                    </p>
                    <Link
                        to="/"
                        className="inline-block mt-4 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition duration-300"
                    >
                        Continue Shopping
                    </Link>
                </div>
            ) : (
                <div className="mb-6 max-w-4xl mx-auto bg-white p-4 sm:p-6 rounded-lg shadow-md">
                    {cartItems.map((item) => {
                        const name = item.product_name || item.name;
                        const price = item.product_price || item.price;
                        const image = item.product_image || item.image;
                        const imageSrc = image ? (image.startsWith('http') ? image : `${BASEURL}${image.startsWith('/') ? '' : '/'}${image}`) : null;

                        return (
                            <div
                                key={item.id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-gray-200 last:border-b-0"
                            >
                                {/* Product info */}
                                <div className="flex items-center gap-4 min-w-0">
                                    {imageSrc && (
                                        <img
                                            src={imageSrc}
                                            alt={name}
                                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg flex-shrink-0"
                                        />
                                    )}
                                    <div className="min-w-0">
                                        <h2 className="text-base sm:text-lg font-semibold truncate">
                                            {name}
                                        </h2>
                                        <p className="text-gray-600">₹{price}</p>
                                    </div>
                                </div>

                                {/* Quantity + remove controls */}
                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                    <div className="flex items-center gap-2 sm:gap-3">
                                        <button
                                            className="w-9 h-9 bg-gray-200 hover:bg-gray-300 rounded transition duration-200 flex items-center justify-center text-lg"
                                            onClick={() =>
                                                updateQuantity(item.id, item.quantity - 1)
                                            }
                                            aria-label="Decrease quantity"
                                        >
                                            −
                                        </button>
                                        <span className="w-8 text-center font-medium">
                                            {item.quantity}
                                        </span>
                                        <button
                                            className="w-9 h-9 bg-gray-200 hover:bg-gray-300 rounded transition duration-200 flex items-center justify-center text-lg"
                                            onClick={() =>
                                                updateQuantity(item.id, item.quantity + 1)
                                            }
                                            aria-label="Increase quantity"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <button
                                        className="text-red-500 hover:text-red-700 text-sm sm:text-base transition duration-200"
                                        onClick={() => removeFromCart(item.id)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {/* Summary */}
                    <div className="border-t border-gray-200 pt-4 mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                            <h2 className="text-lg sm:text-xl font-bold">Total:</h2>
                            <p className="text-lg sm:text-xl font-semibold">
                                ₹{Number(total).toFixed(2)}
                            </p>
                        </div>
                        <Link
                            to="/checkout"
                            className="bg-blue-600 text-white px-6 py-3 sm:py-2.5 rounded-lg hover:bg-blue-700 transition duration-300 text-center w-full sm:w-auto"
                        >
                            Proceed to Checkout
                        </Link>
                    </div>
                </div>
            )} 

            {/* ---------- Pending Orders: payment baaki hai ---------- */}
            {pendingOrders && pendingOrders.length > 0 && (
                <div className="max-w-4xl mx-auto mt-6 mb-6 bg-white p-4 sm:p-6 rounded-lg shadow-md">
                    <h2 className="text-base sm:text-lg font-semibold pb-3 border-b border-gray-200">
                        ⏳ Pending Orders
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            payment complete karna baaki hai
                        </span>
                    </h2>
                    {pendingOrders.map((order) => {
                        const payAllowed =
                            order.payment_status !== "paid" &&
                            order.payment_status !== "verifying";
                        return (
                            <div
                                key={order.order_id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-gray-200 last:border-b-0"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <OrderThumbs order={order} />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm">#{order.order_ref}</p>
                                        <p className="text-xs text-gray-500">
                                            Placed: {formatDateTime(order.created_at)}
                                        </p>
                                        <span
                                            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${PAYMENT_BADGES[order.payment_status] ||
                                                "bg-gray-100 text-gray-700"
                                                }`}
                                        >
                                            {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    <p className="font-semibold">₹{formatINR(order.total_amount)}</p>
                                    {payAllowed ? (
                                        <>
                                            <button
                                                onClick={() =>
                                                    nav("/checkout", {
                                                        state: { resumeOrderId: order.order_id },
                                                    })
                                                }
                                                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-semibold"
                                            >
                                                Pay Now
                                            </button>
                                            <button
                                                onClick={() => handleRemoveOrder(order.order_id)}
                                                disabled={removingId === order.order_id}
                                                className="text-red-500 hover:text-red-700 text-sm sm:text-base transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {removingId === order.order_id ? "Removing…" : "Remove"}
                                            </button>
                                        </>
                                    ) : (
                                        <Link
                                            to={`/orders/${order.order_id}/track`}
                                            className="text-blue-600 hover:underline text-sm"
                                        >
                                            Track Order
                                        </Link>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ---------- Active Orders: payment ho gaya, delivery chal rahi hai ---------- */}
            {activeOrders.length > 0 && (
                <div className="max-w-4xl mx-auto mb-6 bg-white p-4 sm:p-6 rounded-lg shadow-md">
                    <h2 className="text-base sm:text-lg font-semibold pb-3 border-b border-gray-200">
                        🚚 Active Orders
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            payment ho gaya, delivery raaste me hai
                        </span>
                    </h2>
                    {activeOrders.map((order) => {
                        // Verifying order ka status abhi bhi 'pending' hota hai —
                        // badge ke liye payment state zyada sahi hai
                        const stateKey =
                            order.status === "pending" && order.payment_status === "verifying"
                                ? "verifying"
                                : order.status;
                        return (
                            <div
                                key={order.order_id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-gray-200 last:border-b-0"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <OrderThumbs order={order} />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm">#{order.order_ref}</p>
                                        <p className="text-xs text-gray-500">
                                            Placed: {formatDateTime(order.created_at)}
                                        </p>
                                        <span
                                            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ORDER_BADGES[stateKey] || "bg-gray-100 text-gray-700"
                                                }`}
                                        >
                                            {ORDER_LABELS[stateKey] || stateKey}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    <p className="font-semibold">₹{formatINR(order.total_amount)}</p>
                                    <Link
                                        to={`/orders/${order.order_id}/track`}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-semibold"
                                    >
                                        Track Order
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Order history ab Account page ke "Your Orders History" me hai */}


        </div>
    );
}

export default CartPage;
