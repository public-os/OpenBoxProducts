import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { authFetch, getAccessToken } from "../utils/auth.js";
import { loadRazorpay } from "../utils/razorpay.js";
import OrderTracking from "../components/OrderTracking.jsx";

function CheckoutPage() {
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    payment_method: "ONLINE",
  });

  const [step, setStep] = useState("details"); // details -> pay -> done
  const [order, setOrder] = useState(null); // {order_id, order_ref, total_amount, payment_ref}
  const [submitting, setSubmitting] = useState(false); // order create ho raha hai
  const [paying, setPaying] = useState(false); // gateway popup flow chal raha hai
  const [error, setError] = useState("");
  const [trackedOrder, setTrackedOrder] = useState(null); // done step ka live tracking data

  const nav = useNavigate();
  const location = useLocation();
  const { clearCart } = useCart();
  const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

  // CartPage "Pay Now" se aaye toh purane pending order ka payment resume karo
  // (naya order create nahi hota — sirf pay step khulta hai)
  useEffect(() => {
    const resumeId = location.state?.resumeOrderId;
    if (!resumeId) return;
    let isCancelled = false;
    authFetch(`${BASEURL}/api/orders/${resumeId}/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled || !data) return;
        // Sirf unpaid order resume karo — paid/cancelled ko chhodo
        if (data.status === "pending" && data.payment_status !== "paid") {
          setOrder({
            order_id: data.order_id,
            order_ref: data.order_ref,
            total_amount: data.total_amount,
            shipping_name: data.shipping_name,
            shipping_address: data.shipping_address,
            shipping_phone: data.shipping_phone,
          });
          // Form me order ka saved address dikhao — user edit bhi kar sakta hai
          setForm((prev) => ({
            ...prev,
            name: data.shipping_name || prev.name,
            address: data.shipping_address || prev.address,
            phone: data.shipping_phone || prev.phone,
          }));
          setStep("pay");
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!getAccessToken()) return;
    let isCancelled = false;
    authFetch(`${BASEURL}/api/user/profile/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data) {
          setForm((prev) => ({
            ...prev,
            name: data.name || prev.name,
            address: data.address || prev.address,
            phone: data.phone || prev.phone,
          }));
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [BASEURL]);

  // Order confirm hone ke baad (done step) backend se latest status fetch karo
  useEffect(() => {
    if (step !== "done" || !order?.order_id) return;
    let isCancelled = false;
    setTrackedOrder(null);
    authFetch(`${BASEURL}/api/orders/${order.order_id}/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data) setTrackedOrder(data);
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [step, order, BASEURL]);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // Pending order se wapas aaye the (back icon / Pay Now) — naya order mat
      // banao, usi order ka shipping detail update karo. Order create hote hi
      // cart clear ho chuka hota hai, isliye create "Cart is empty" deta.
      const isUpdate = Boolean(order?.order_id);
      const res = await authFetch(
        isUpdate
          ? `${BASEURL}/api/orders/${order.order_id}/update-shipping/`
          : `${BASEURL}/api/orders/create/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data = await res.json();

      if (res.ok) {
        if (!isUpdate) clearCart();
        setOrder({
          order_id: data.order_id,
          order_ref: data.order_ref,
          total_amount: data.total_amount,
          shipping_name: data.shipping_name ?? form.name,
          shipping_address: data.shipping_address ?? form.address,
          shipping_phone: data.shipping_phone ?? form.phone,
        });
        setStep("pay");
      } else {
        setError(data.error || "Order failed");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Could not place order. Please try again.");
    }
  };

  // Gateway order banake Razorpay checkout popup kholta hai. Success callback
  // ka signature backend verify karta hai — usi ke baad order PAID hota hai.
  const startPayment = async () => {
    if (!order || paying) return;
    setError("");

    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) {
        setError("Payment gateway load nahi hua — internet check karke dobara try karo.");
        setPaying(false);
        return;
      }

      const res = await authFetch(
        `${BASEURL}/api/orders/${order.order_id}/create-payment/`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment start nahi ho paya. Please try again.");
        setPaying(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "OpenBox",
        description: `Order ${data.order_ref}`,
        order_id: data.razorpay_order_id,
        prefill: {
          name: data.prefill?.name || form.name,
          contact: data.prefill?.contact || form.phone,
          email: data.prefill?.email || "",
        },
        theme: { color: "#16a34a" },
        handler: async (response) => {
          try {
            const vres = await authFetch(
              `${BASEURL}/api/orders/${order.order_id}/verify-payment/`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(response),
              }
            );
            const vdata = await vres.json();
            if (vres.ok && vdata.payment_status === "paid") {
              setOrder((prev) => ({
                ...prev,
                order_ref: vdata.order_ref,
                total_amount: vdata.total_amount,
                payment_ref: vdata.payment_ref,
              }));
              setStep("done");
            } else {
              setError(
                vdata.error ||
                  "Payment ho gaya par verification fail hui. Agar amount kat gaya hai toh Account > Orders me status jaldi update ho jayega."
              );
            }
          } catch {
            setError(
              "Payment ho gaya, par confirmation me network issue aaya. Account > Orders me status check karo."
            );
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            setError(
              "Payment cancel ho gaya. Order pending hai — 'Pay' dabake dobara try karo, ya baad me Cart page se pay kar sakte ho."
            );
          },
        },
      });

      rzp.on("payment.failed", () => {
        setPaying(false);
        setError("Payment fail ho gaya. Dobara try karo — koi amount kata nahi hai.");
      });

      rzp.open();
    } catch (err) {
      console.error("Payment error:", err);
      setError("Could not start payment. Please try again.");
      setPaying(false);
    }
  };

  // ------------------------------------------------------------------
  // Step 3: payment verified — order confirmed
  // ------------------------------------------------------------------
  if (step === "done") {
    return (
      <div className="min-h-screen bg-gray-400 pt-35 p-6 sm:pt-30">
        <div className="max-w-lg mx-auto bg-white p-6 shadow rounded text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-600 flex items-center justify-center">
            <svg
              className="w-9 h-9 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mt-4">Payment Successful!</h1>
          <p className="text-gray-600 mt-1">
            Aapka order confirm ho gaya hai — hum jaldi dispatch karenge.
          </p>
          <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-left">
            <p>
              Order ID: <span className="font-semibold">{order?.order_ref}</span>
            </p>
            <p>
              Amount Paid:{" "}
              <span className="font-semibold">₹{order?.total_amount}</span>
            </p>
            {order?.payment_ref && (
              <p>
                Payment ID:{" "}
                <span className="font-semibold">{order.payment_ref}</span>
              </p>
            )}
          </div>

          {/* ---------------- Order Tracking ---------------- */}
          <div className="mt-4 border-t pt-4 text-left">
            <h2 className="text-sm font-bold text-gray-800 mb-3">📦 Order Tracking</h2>
            <OrderTracking order={trackedOrder} />
            {!trackedOrder && (
              <p className="text-xs text-gray-500">Tracking load ho rahi hai…</p>
            )}
          </div>

          <div className="mt-5 space-y-2">
            <button
              onClick={() => nav("/account")}
              className="w-full border border-gray-300 text-gray-800 py-2 rounded font-semibold hover:bg-gray-50 transition"
            >
              View All Orders
            </button>
            <button
              onClick={() => nav("/")}
              className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 transition"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Step 2: pay — Razorpay secure checkout popup khulta hai
  // ------------------------------------------------------------------
  if (step === "pay") {
    return (
      <div className="min-h-screen bg-gray-400 pt-35 p-6 sm:pt-30">
        <div className="max-w-lg mx-auto bg-white p-6 shadow rounded">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError("");
                // Order ka saved address form me wala do — user dekh/edit kar sake
                setForm((prev) => ({
                  ...prev,
                  name: order.shipping_name || prev.name,
                  address: order.shipping_address || prev.address,
                  phone: order.shipping_phone || prev.phone,
                }));
                setStep("details");
              }}
              aria-label="Back to checkout"
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
            <h1 className="text-2xl font-bold">Review & Pay</h1>
          </div>
          <p className="text-gray-600 text-sm mt-1">
            Order <span className="font-semibold">{order.order_ref}</span> · Payment
            ke baad hi order confirm hoga
          </p>

          <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-left space-y-1">
            <p>
              Order ID: <span className="font-semibold">{order.order_ref}</span>
            </p>
            <p>
              Amount:{" "}
              <span className="font-semibold">₹{order.total_amount}</span>
            </p>
            <p>
              Delivery:{" "}
              <span className="font-semibold">
                {order.shipping_name}, {order.shipping_phone}
              </span>
            </p>
            <p className="text-gray-600">{order.shipping_address}</p>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            🔒 Payment Razorpay ke secure checkout se — UPI (GPay / PhonePe /
            Paytm), cards aur wallets sab supported.
          </p>

          {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}

          <button
            onClick={startPayment}
            disabled={paying}
            className="mt-4 w-full bg-green-600 text-white py-2.5 rounded font-semibold hover:bg-green-700 transition disabled:opacity-60"
          >
            {paying ? "Opening payment…" : `Pay ₹${order.total_amount} Securely`}
          </button>
          <button
            onClick={() => nav("/cart")}
            className="mt-2 w-full border border-gray-300 text-gray-800 py-2 rounded font-semibold hover:bg-gray-50 transition"
          >
            Back to Cart
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Step 1: shipping details
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-400 pt-35 p-6 sm:pt-30">
      <div className="max-w-lg mx-auto bg-white p-6 shadow rounded">
        <h1 className="text-2xl font-bold mb-1">Checkout</h1>
        {order ? (
          <p className="text-gray-600 text-sm mb-4">
            Order <span className="font-semibold">{order.order_ref}</span> pending hai —
            address check/update karke aage badho
          </p>
        ) : (
          <p className="mb-4" />
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Your Name"
            required
            className="w-full p-2 border rounded"
          />

          <input
            name="address"
            value={form.address}
            onChange={handleChange}
            placeholder="Address"
            required
            className="w-full p-2 border rounded"
          />

          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="Phone Number"
            required
            className="w-full p-2 border rounded"
          />

          <div className="p-3 border rounded bg-gray-50 text-sm text-gray-700">
            💳 Payment: <span className="font-semibold">UPI / Cards / Wallets (Razorpay)</span>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            disabled={submitting}
            className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 transition disabled:opacity-60"
          >
            {submitting
              ? order
                ? "Updating…"
                : "Placing Order…"
              : order
                ? "Update & Continue to Pay"
                : "Proceed to Pay"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CheckoutPage;
