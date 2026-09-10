import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { authFetch } from "../utils/auth.js";
import { formatDateTime, formatINR, formatTime } from "../utils/format.js";

// Blinkit-style Order Summary — Order History ki product image par click karne
// se khulta hai. Items, bill details, order details + invoice download + delete.
function OrderSummaryPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [orderId]);

    useEffect(() => {
        authFetch(`${BASEURL}/api/orders/${orderId}/`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setOrder(data))
            .catch(() => setOrder(null))
            .finally(() => setLoading(false));
    }, [orderId, BASEURL]);

    // Order history se delete — confirm ke baad history par wapas
    const handleDelete = async () => {
        if (!order) return;
        if (!window.confirm(`Delete order #${order.order_ref}? You won't be able to access it again.`)) {
            return;
        }
        try {
            const res = await authFetch(`${BASEURL}/api/orders/${order.order_id}/`, {
                method: "DELETE",
            });
            if (res.ok) {
                navigate("/orders/history", { replace: true });
            } else {
                alert("Could not delete order. Please try again.");
            }
        } catch {
            alert("Could not delete order. Please try again.");
        }
    };

    // Simple HTML invoice download — order ke items + bill details
    const downloadInvoice = () => {
        if (!order) return;
        const rows = order.items
            .map(
                (i) =>
                    `<tr><td>${i.product}${i.variant ? ` (${i.variant})` : ""}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">₹${i.subtotal}</td></tr>`
            )
            .join("");
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${order.order_ref}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:30px auto;color:#222}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ccc;padding:8px}
h1{font-size:22px}.total{font-weight:bold;font-size:16px}</style></head><body>
<h1>OpenBox Shop — Invoice</h1>
<p><b>Order:</b> #${order.order_ref}<br/><b>Placed:</b> ${formatDateTime(order.created_at)}</p>
<table><tr><th>Item</th><th>Qty</th><th>Amount</th></tr>${rows}</table>
<p>Item total: ₹${formatINR(order.items_total)}<br/>
Delivery charges: ${Number(order.delivery_charge) === 0 ? "FREE" : `₹${formatINR(order.delivery_charge)}`}<br/>
<span class="total">Bill total: ₹${formatINR(order.total_amount)}</span></p>
<p><b>Ship to:</b> ${order.shipping_name || ""}, ${order.shipping_address || ""}</p>
</body></html>`;
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `invoice-${order.order_ref}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyOrderId = async () => {
        try {
            await navigator.clipboard.writeText(order.order_ref);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // clipboard unavailable — kuch nahi bigadta
        }
    };

    return (
        <div className="min-h-screen bg-gray-400 mb-6">
            {/* ===== Top bar: back + delete ===== */}
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
                <span></span>
                <button
                    onClick={handleDelete}
                    aria-label="Delete order"
                    title="Delete order"
                    className="w-9 h-9 flex items-center justify-center text-gray-800 hover:text-red-600 transition-colors cursor-pointer"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </nav>

            <div className="pt-[70px] pb-10 px-4 max-w-2xl mx-auto">
                {loading && <p className="text-center text-gray-800 py-10">Loading order…</p>}

                {!loading && !order && (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                        <p className="text-gray-600 mb-4">Order not found.</p>
                        <button
                            onClick={() => navigate("/orders/history")}
                            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition"
                        >
                            Back to Order History
                        </button>
                    </div>
                )}

                {!loading && order && (
                    <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                        {/* ===== Heading ===== */}
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Order summary</h1>
                        <p className="text-gray-500 mt-1">Arrived at {formatTime(order.updated_at)}</p>
                        <button
                            onClick={downloadInvoice}
                            className="flex items-center gap-1.5 mt-2 text-green-700 font-semibold hover:text-green-800 transition-colors cursor-pointer"
                        >
                            Download Invoice
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>

                        {/* ===== Items ===== */}
                        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mt-6 mb-2">
                            {order.items.length} item{order.items.length > 1 ? "s" : ""} in this order
                        </h2>
                        <div className="divide-y divide-gray-100">
                            {order.items.map((item, i) => {
                                const img = item.image;
                                const src = img
                                    ? img.startsWith("http")
                                        ? img
                                        : `${BASEURL}${img.startsWith("/") ? "" : "/"}${img}`
                                    : null;
                                return (
                                    <div key={i} className="flex items-center gap-4 py-4">
                                        {/* Image + naam click par wahi product khulta hai */}
                                        <Link
                                            to={`/product/${item.product_id}`}
                                            title={item.product}
                                            className="flex items-center gap-4 min-w-0 flex-1 group cursor-pointer"
                                        >
                                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-50 border border-gray-100 p-1.5 flex items-center justify-center shrink-0 group-hover:shadow-md transition-shadow">
                                                {src ? (
                                                    <img src={src} alt={item.product} className="w-full h-full object-contain" />
                                                ) : (
                                                    <span className="text-2xl">📦</span>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-gray-900 leading-snug group-hover:text-blue-600 transition-colors">
                                                    {item.product}
                                                </p>
                                                <p className="text-sm text-gray-500 mt-0.5">
                                                    {item.variant ? `${item.variant} × ${item.quantity}` : `Qty ${item.quantity}`}
                                                </p>
                                            </div>
                                        </Link>
                                        <p className="font-bold text-gray-900 shrink-0">₹{formatINR(item.subtotal)}</p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ===== Bill details ===== */}
                        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mt-6 mb-2">Bill details</h2>
                        <div className="divide-y divide-gray-100 text-sm sm:text-base">
                            <div className="flex items-center justify-between py-2.5">
                                <span className="text-gray-800">Item total</span>
                                <span className="text-gray-900">₹{formatINR(order.items_total)}</span>
                            </div>
                            <div className="flex items-center justify-between py-2.5">
                                <span className="text-gray-800">Delivery charges</span>
                                <span className={Number(order.delivery_charge) === 0 ? "text-green-700 font-semibold" : "text-gray-900"}>
                                    {Number(order.delivery_charge) === 0 ? "FREE" : `₹${formatINR(order.delivery_charge)}`}
                                </span>
                            </div>
                            <div className="flex items-center justify-between py-3">
                                <span className="font-extrabold text-gray-900 text-base sm:text-lg">Bill total</span>
                                <span className="font-extrabold text-gray-900 text-base sm:text-lg">
                                    ₹{formatINR(order.total_amount)}
                                </span>
                            </div>
                        </div>

                        {/* ===== Order details ===== */}
                        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mt-6 mb-2">Order details</h2>
                        <dl className="text-sm sm:text-base space-y-3">
                            <div>
                                <dt className="text-gray-500">Order id</dt>
                                <dd className="flex items-center gap-2 text-gray-900 font-semibold">
                                    {order.order_ref}
                                    <button
                                        onClick={copyOrderId}
                                        aria-label="Copy order id"
                                        title="Copy order id"
                                        className="p-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
                                    >
                                        {copied ? (
                                            <span className="text-xs font-semibold text-green-700">Copied ✓</span>
                                        ) : (
                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 8V6a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-2M6 12h8a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6a2 2 0 012-2z" />
                                            </svg>
                                        )}
                                    </button>
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Payment</dt>
                                <dd className="text-gray-900">
                                    {order.payment_status === "paid"
                                        ? `Paid via Online Payment${order.payment_ref ? ` (${order.payment_ref})` : ""}`
                                        : order.payment_status === "pending"
                                            ? "Payment pending"
                                            : order.payment_status}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Deliver to</dt>
                                <dd className="text-gray-900 break-words">
                                    {order.shipping_name}
                                    {order.shipping_phone ? ` · ${order.shipping_phone}` : ""}
                                    {order.shipping_address ? `, ${order.shipping_address}` : ""}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Order placed</dt>
                                <dd className="text-gray-900">placed on {formatDateTime(order.created_at)}</dd>
                            </div>
                        </dl>
                    </div>
                )}
            </div>
        </div>
    );
}

export default OrderSummaryPage;
