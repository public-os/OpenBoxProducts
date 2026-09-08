import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useCart } from "../context/CartContext";
import { authFetch, getAccessToken } from "../utils/auth.js";
import { UPI_ID, UPI_NAME, buildUpiLink, isMobileDevice } from "../utils/upi.js";
import OrderTracking from "../components/OrderTracking.jsx";

const UPI_APPS = [
  { id: "gpay", label: "Google Pay", className: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50" },
  { id: "phonepe", label: "PhonePe", className: "bg-[#5f259f] text-white hover:bg-[#4b1d7f]" },
  { id: "paytm", label: "Paytm", className: "bg-[#00baf2] text-white hover:bg-[#00a5d8]" },
  { id: "upi", label: "Other UPI App", className: "bg-gray-800 text-white hover:bg-gray-700" },
];

function CheckoutPage() {
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    payment_method: "ONLINE",
  });

  const [step, setStep] = useState("details"); // details -> pay -> done
  const [order, setOrder] = useState(null); // {order_id, order_ref, total_amount}
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState(null); // done step ka live tracking data
  const isMobile = isMobileDevice();

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
        // Sirf unpaid order resume karo — verifying/paid/cancelled ko chhodo
        if (data.status === "pending" && data.payment_status !== "verifying") {
          setOrder({
            order_id: data.order_id,
            order_ref: data.order_ref,
            total_amount: data.total_amount,
          });
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

  // Order place hone ke baad (done step) backend se latest status fetch karo
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
      const res = await authFetch(`${BASEURL}/api/orders/create/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        clearCart();
        setOrder({
          order_id: data.order_id,
          order_ref: data.order_ref,
          total_amount: data.total_amount,
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

  const openUpiApp = (app) => {
    const link = buildUpiLink({
      amount: order.total_amount,
      note: `Order ${order.order_ref}`,
      txnRef: order.order_ref,
      app,
    });
    window.location.href = link;
  };

  const submitUtr = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{8,22}$/.test(utr.trim())) {
      setError("UPI reference number me 8-22 digits hone chahiye (payment app ki transaction details me milta hai)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`${BASEURL}/api/orders/${order.order_id}/payment/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utr: utr.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("done");
      } else {
        setError(data.error || "Could not submit payment details");
      }
    } catch (err) {
      console.error("Payment submit error:", err);
      setError("Could not submit payment details. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable - user can read the ID on screen
    }
  };

  // ------------------------------------------------------------------
  // Step 3: payment submitted, awaiting verification
  // ------------------------------------------------------------------
  if (step === "done") {
    return (
      <div className="min-h-screen bg-gray-400 pt-35 p-6 sm:pt-30">
        <div className="max-w-lg mx-auto bg-white p-6 shadow rounded text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center text-3xl">
            ✓
          </div>
          <h1 className="text-2xl font-bold mt-4">Payment Verification Pending</h1>
          <p className="text-gray-600 mt-2">
            Aapki payment details mil gayi hain. Hum verify karke jaldi confirm karenge.
          </p>
          <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-left">
            <p>
              Order ID: <span className="font-semibold">{order?.order_ref}</span>
            </p>
            <p>
              Amount: <span className="font-semibold">₹{order?.total_amount}</span>
            </p>
            <p>
              UPI Reference: <span className="font-semibold">{utr}</span>
            </p>
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
  // Step 2: pay (desktop = QR code, mobile = UPI app buttons)
  // ------------------------------------------------------------------
  if (step === "pay") {
    const upiLink = buildUpiLink({
      amount: order.total_amount,
      note: `Order ${order.order_ref}`,
      txnRef: order.order_ref,
    });

    return (
      <div className="min-h-screen bg-gray-400 pt-35 p-6 sm:pt-30">
        <div className="max-w-lg mx-auto bg-white p-6 shadow rounded">
          <h1 className="text-2xl font-bold">Pay ₹{order.total_amount}</h1>
          <p className="text-gray-600 text-sm mt-1">
            Order <span className="font-semibold">{order.order_ref}</span> · UPI me amount pehle se bhara hua aayega
          </p>

          {UPI_ID === "yourname@upi" && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded text-sm text-yellow-800">
              ⚠️ Merchant UPI ID set nahi hai — <code>frontend/.env</code> me apni real
              <code> VITE_UPI_ID</code> daalo, warna payment kahin nahi jayega.
            </div>
          )}

          {isMobile ? (
            /* ---------------- MOBILE: Blinkit jaise app buttons ---------------- */
            <div className="mt-5 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Payment app chuno:</p>
              {UPI_APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => openUpiApp(app.id)}
                  className={`w-full py-3 rounded font-semibold transition ${app.className}`}
                >
                  {app.id === "upi" ? `${app.label} (GPay / Paytm / PhonePe...)` : app.label}
                </button>
              ))}
              <p className="text-xs text-gray-500">
                Tap karte hi payment app khulega. App me correct amount dikhega — sirf UPI PIN daalo.
              </p>
            </div>
          ) : (
            /* ---------------- DESKTOP: Netflix jaise QR code ---------------- */
            <div className="mt-5 flex flex-col items-center">
              <div className="p-4 border-2 border-gray-200 rounded-xl bg-white">
                <QRCodeSVG value={upiLink} size={220} level="M" />
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-700">
                Kisi bhi UPI app se scan karo
              </p>
              <p className="text-xs text-gray-500">Google Pay · PhonePe · Paytm · BHIM</p>
              <button
                onClick={copyUpiId}
                className="mt-3 text-sm text-green-700 underline hover:text-green-800"
              >
                {copied ? "UPI ID copied!" : `Ya UPI ID se pay karo: ${UPI_ID}`}
              </button>
            </div>
          )}

          {/* ---------------- Payment confirmation (UTR) ---------------- */}
          <div className="mt-6 border-t pt-4">
            <p className="text-sm font-semibold text-gray-700">
              Pay kar diya? Payment karne ke baad UPI reference number daalo:
            </p>
            <form onSubmit={submitUtr} className="mt-2 space-y-3">
              <input
                value={utr}
                onChange={(e) => setUtr(e.target.value.replace(/\D/g, ""))}
                placeholder="12-digit UPI Reference / UTR number"
                inputMode="numeric"
                required
                className="w-full p-2 border rounded"
              />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                disabled={submitting}
                className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 transition disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "I Have Paid"}
              </button>
            </form>
          </div>
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
        <h1 className="text-2xl font-bold mb-4">Checkout</h1>

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
            💳 Payment: <span className="font-semibold">UPI (Google Pay / PhonePe / Paytm)</span>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button className="w-full bg-green-600 text-white py-2 rounded font-semibold hover:bg-green-700 transition">
            Place Order & Pay
          </button>
        </form>
      </div>
    </div>
  );
}

export default CheckoutPage;
