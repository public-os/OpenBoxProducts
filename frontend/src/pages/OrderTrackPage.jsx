import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authFetch, getAccessToken } from "../utils/auth.js";
import { formatDateTime, formatINR } from "../utils/format.js";
import OrderTracking from "../components/OrderTracking.jsx";

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

// CartPage "Track Order" se khulta hai — order ke checkout details (items,
// amount, delivery address) ke saath OrderTracking stepper dikhata hai.
function OrderTrackPage() {
    const { orderId } = useParams();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const nav = useNavigate();

    const [order, setOrder] = useState(null); // null = load ho raha hai
    const [error, setError] = useState("");

    useEffect(() => {
        if (!getAccessToken()) return;
        let isCancelled = false;
        authFetch(`${BASEURL}/api/orders/${orderId}/`)
            .then(async (res) => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Order load nahi hua.");
                }
                return res.json();
            })
            .then((data) => {
                if (!isCancelled) setOrder(data);
            })
            .catch((err) => {
                if (!isCancelled) {
                    setError(err.message || "Order load nahi hua. Please try again.");
                }
            });
        return () => {
            isCancelled = true;
        };
    }, [BASEURL, orderId]);

    const imageSrc = (image) =>
        image
            ? image.startsWith("http")
                ? image
                : `${BASEURL}${image.startsWith("/") ? "" : "/"}${image}`
            : null;

    // CartPage jaisi fixed navbar — back arrow + centered title + desktop par home icon
    const navBar = (
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

            <p className="text-center">Track Order</p>

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
    );

    if (error) {
        return (
            <div className="pt-20 sm:pt-24 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
                {navBar}
                <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md text-center">
                    <p className="text-red-600 font-semibold">⚠️ {error}</p>
                    <button
                        onClick={() => nav("/cart")}
                        className="mt-4 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition"
                    >
                        Back to Cart
                    </button>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="pt-20 sm:pt-24 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
                {navBar}
                <p className="max-w-4xl mx-auto text-white/90">Order load ho rahi hai…</p>
            </div>
        );
    }

    const payAllowed =
        order.status === "pending" &&
        order.payment_status !== "paid" &&
        order.payment_status !== "verifying";

    return (
        <div className="pt-20 sm:pt-24 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-10">
            {navBar}
            <div className="max-w-4xl mx-auto bg-white p-4 sm:p-6 rounded-lg shadow-md">
                {/* ---------- Checkout details: order + items ---------- */}
                <div className="pb-4 border-b border-gray-200">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <h2 className="text-base font-semibold">🧾 Order Details</h2>
                        <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                PAYMENT_BADGES[order.payment_status] || "bg-gray-100 text-gray-700"
                            }`}
                        >
                            {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm">
                        <p>
                            Order ID:{" "}
                            <span className="font-semibold">#{order.order_ref}</span>
                        </p>
                        <p className="text-gray-600">
                            Placed: {formatDateTime(order.created_at)}
                        </p>
                    </div>

                    <div className="mt-3 divide-y divide-gray-100">
                        {order.items.map((item, i) => {
                            const src = imageSrc(item.image);
                            return (
                                <div key={i} className="flex items-center gap-3 py-3">
                                    {src && (
                                        <img
                                            src={src}
                                            alt={item.product}
                                            className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
                                        />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold truncate">
                                            {item.product}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {item.variant ? `${item.variant} · ` : ""}₹
                                            {formatINR(item.price)} × {item.quantity}
                                        </p>
                                    </div>
                                    <p className="text-sm font-semibold shrink-0">
                                        ₹{formatINR(item.subtotal)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-between border-t border-gray-200 pt-3 mt-1">
                        <p className="font-bold">Total:</p>
                        <p className="font-bold">₹{formatINR(order.total_amount)}</p>
                    </div>
                </div>

                {/* ---------- Checkout details: shipping ---------- */}
                <div className="py-4 border-b border-gray-200">
                    <h2 className="text-base font-semibold mb-2">🚚 Delivery Details</h2>
                    <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
                        <p>
                            Name: <span className="font-semibold">{order.shipping_name}</span>
                        </p>
                        <p>
                            Phone:{" "}
                            <span className="font-semibold">{order.shipping_phone}</span>
                        </p>
                        <p>
                            Address:{" "}
                            <span className="font-semibold">{order.shipping_address}</span>
                        </p>
                    </div>
                </div>

                {/* ---------- Order tracking stepper ---------- */}
                <div className="pt-4">
                    <h2 className="text-base font-semibold mb-3">📍 Order Tracking</h2>
                    <OrderTracking order={order} />
                </div>

                {payAllowed && (
                    <button
                        onClick={() =>
                            nav("/checkout", { state: { resumeOrderId: order.order_id } })
                        }
                        className="mt-5 w-full bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 transition font-semibold"
                    >
                        Pay ₹{formatINR(order.total_amount)} Now
                    </button>
                )}
            </div>
        </div>
    );
}

export default OrderTrackPage;
