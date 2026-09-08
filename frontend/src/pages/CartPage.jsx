import { useEffect, useState } from "react";
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

function CartPage() {
    const { cartItems, total, removeFromCart, updateQuantity } = useCart();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const nav = useNavigate();

    // Sirf pending (unpaid) orders — null = loading / logged out, [] = koi pending nahi
    const [pendingOrders, setPendingOrders] = useState(null);

    useEffect(() => {
        if (!getAccessToken()) return;
        let isCancelled = false;
        authFetch(`${BASEURL}/api/orders/`)
            .then((res) => (res.ok ? res.json() : []))
            .then((orders) => {
                if (!isCancelled) {
                    setPendingOrders(orders.filter((o) => o.status === "pending"));
                }
            })
            .catch(() => {
                if (!isCancelled) setPendingOrders([]);
            });
        return () => {
            isCancelled = true;
        };
    }, [BASEURL]);

    return (
        <div className="pt-20 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-center pt-8 lg:pt-10 md:pt-10 sm:pt-18 pb-4 sm:pb-3">
                🛒 Your Cart
            </h1>

            {/* ---------- Pending Orders: payment baaki hai ---------- */}
            {pendingOrders && pendingOrders.length > 0 && (
                <div className="max-w-4xl mx-auto mb-6 bg-white p-4 sm:p-6 rounded-lg shadow-md">
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
                                <div className="min-w-0">
                                    <p className="font-semibold text-sm">#{order.order_ref}</p>
                                    <p className="text-xs text-gray-500">
                                        Placed: {formatDateTime(order.created_at)}
                                    </p>
                                    <span
                                        className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                            PAYMENT_BADGES[order.payment_status] ||
                                            "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        {PAYMENT_LABELS[order.payment_status] || order.payment_status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    <p className="font-semibold">₹{formatINR(order.total_amount)}</p>
                                    {payAllowed ? (
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
                                    ) : (
                                        <Link
                                            to="/account"
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

            {cartItems.length === 0 ? (
                <div className="text-center pb-1">
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
                <div className="max-w-4xl mx-auto bg-white p-4 sm:p-6 rounded-lg shadow-md">
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
        </div>
    );
}

export default CartPage;
