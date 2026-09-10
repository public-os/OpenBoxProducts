import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

    if (error) {
        return (
            <div className="pt-20 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
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
            <div className="pt-20 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
                <p className="max-w-4xl mx-auto text-white/90">Order load ho rahi hai…</p>
            </div>
        );
    }

    const payAllowed =
        order.status === "pending" &&
        order.payment_status !== "paid" &&
        order.payment_status !== "verifying";

    return (
        <div className="pt-20 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
            <div className="max-w-4xl mx-auto bg-white p-4 sm:p-6 rounded-lg shadow-md">
                {/* ---------- Header + back ---------- */}
                <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
                    <button
                        onClick={() => nav(-1)}
                        aria-label="Go back"
                        title="Back"
                        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                    >
                        <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M19 12H5" />
                            <path d="M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h1 className="text-lg sm:text-xl font-bold">📦 Track Order</h1>
                    <span
                        className={`ml-auto px-2 py-0.5 rounded-full text-xs font-semibold ${
                            PAYMENT_BADGES[order.payment_status] || "bg-gray-100 text-gray-700"
                        }`}
                    >
                        {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                    </span>
                </div>

                {/* ---------- Checkout details: order + items ---------- */}
                <div className="py-4 border-b border-gray-200">
                    <h2 className="text-base font-semibold mb-3">🧾 Order Details</h2>
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
