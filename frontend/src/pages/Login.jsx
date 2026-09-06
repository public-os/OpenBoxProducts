import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { saveTokens } from "../utils/auth.js";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
);

const EyeIcon = ({ off }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    {off && <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />}
  </svg>
);

// Flatten DRF / SimpleJWT error payloads into one readable message
function extractError(data, fallback = "Something went wrong. Please try again.") {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (data.error) return typeof data.error === "string" ? data.error : extractError(data.error, fallback);
  const labels = {
    username: "Username", password: "Password", password2: "Confirm password",
    name: "Name", phone: "Mobile number", identifier: "Username or mobile",
    non_field_errors: "",
  };
  for (const [key, msgs] of Object.entries(data)) {
    const msg = Array.isArray(msgs) ? msgs[0] : msgs;
    if (typeof msg === "string" && msg) {
      const label = labels[key];
      if (label === undefined) return msg;
      return label ? `${label}: ${msg}` : msg;
    }
  }
  return fallback;
}

function Login() {
  const BASE = import.meta.env.VITE_DJANGO_BASE_URL || "";
  const navigate = useNavigate();
  const location = useLocation();

  // Where to go after a successful auth (set by pages that force-login, e.g. ProductDetails).
  // Read once at mount — the component only renders on /login, so state can't change under us.
  const redirectRef = useRef(location.state?.from || "/");

  // Views: 'login' | 'signup' | 'forgot'  (forgot sub-steps: request -> otp -> reset)
  const [view, setView] = useState("login");
  const [forgotStep, setForgotStep] = useState("request");

  // Login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Signup form
  const [suName, setSuName] = useState("");
  const [suUsername, setSuUsername] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suPassword2, setSuPassword2] = useState("");

  // Forgot-password form
  const [identifier, setIdentifier] = useState("");
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [devOtp, setDevOtp] = useState("");
  // Set when the SMS gateway could not deliver the OTP (reason shown on the OTP step)
  const [smsNotice, setSmsNotice] = useState("");

  // System states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [timer, setTimer] = useState(RESEND_SECONDS);

  const otpInputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const autoAdvanceRef = useRef(false);
  const googleBtnRef = useRef(null);
  const googleInitRef = useRef(false);

  const switchView = (next) => {
    setView(next);
    setErrorMsg("");
    setSuccessMsg("");
    setForgotStep("request");
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setDevOtp("");
    setSmsNotice("");
    autoAdvanceRef.current = false;
  };

  // Resend is available once the countdown hits zero
  const canResend = timer === 0;

  // Countdown timer for OTP resend
  useEffect(() => {
    if (view !== "forgot" || forgotStep !== "otp" || timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [view, forgotStep, timer]);

  // ---------- Google Sign-In ----------
  const handleGoogleCredential = async (response) => {
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/google-login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (res.ok) {
        saveTokens(
          { access: data.access, refresh: data.refresh },
          data.user?.username,
          data.user?.phone
        );
        navigate(redirectRef.current, { replace: true });
      } else {
        setErrorMsg(extractError(data, "Google sign-in failed."));
      }
    } catch {
      setErrorMsg("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleInitRef.current) return;
    googleInitRef.current = true;

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 336,
          logo_alignment: "left",
        });
      }
    };

    const existing = document.getElementById("google-gsi-script");
    if (existing) {
      existing.addEventListener("load", initGoogle);
      if (window.google?.accounts?.id) initGoogle();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.id = "google-gsi-script";
    script.onload = initGoogle;
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Login ----------
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    if (!username.trim() || !password) {
      setErrorMsg("Please enter your username and password");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(extractError(data, "Invalid username or password"));
        return;
      }
      saveTokens(
        { access: data.access, refresh: data.refresh },
        data.user?.username || username.trim(),
        data.user?.phone
      );
      navigate(redirectRef.current, { replace: true });
    } catch {
      setErrorMsg("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Signup ----------
  const handleSignup = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!suName.trim() || !suUsername.trim() || !suPhone || !suPassword || !suPassword2) {
      setErrorMsg("All fields are required");
      return;
    }
    if (suPhone.length !== 10) {
      setErrorMsg("Mobile number must be exactly 10 digits");
      return;
    }
    if (suPassword !== suPassword2) {
      setErrorMsg("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suName.trim(),
          username: suUsername.trim(),
          phone: suPhone,
          password: suPassword,
          password2: suPassword2,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(extractError(data));
        return;
      }

      // Auto-login right after successful signup
      const loginRes = await fetch(`${BASE}/api/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: suUsername.trim(), password: suPassword }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        // Account created but auto-login failed -> send user to login view
        setView("login");
        setSuccessMsg("Account created! Please login with your new username and password.");
        return;
      }
      saveTokens(
        { access: loginData.access, refresh: loginData.refresh },
        loginData.user?.username || suUsername.trim(),
        loginData.user?.phone || suPhone
      );
      navigate(redirectRef.current, { replace: true });
    } catch {
      setErrorMsg("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Forgot password ----------
  const requestOtp = async () => {
    setErrorMsg("");
    const clean = identifier.trim();
    if (!clean) {
      setErrorMsg("Please enter your username or mobile number");
      return false;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/forgot-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(extractError(data));
        return false;
      }
      setMaskedPhone(data.phone_masked || "");
      setDevOtp(data.dev_otp || "");
      setSmsNotice(
        data.sms_sent
          ? ""
          : data.message || "SMS delivery failed — use the dev OTP below."
      );
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      autoAdvanceRef.current = false;
      setTimer(RESEND_SECONDS);
      setForgotStep("otp");
      return true;
    } catch {
      setErrorMsg("Could not reach the server. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    await requestOtp();
  };

  const handleResendOtp = async () => {
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    autoAdvanceRef.current = false;
    setErrorMsg("");
    setTimer(RESEND_SECONDS);
    otpInputRefs[0].current?.focus();
    await requestOtp();
  };

  // ---------- OTP box handlers ----------
  const handleOtpChange = (index, value) => {
    const raw = value.replace(/\D/g, "");
    const newOtp = [...otpDigits];

    if (raw.length > 1) {
      // SMS autofill / bulk input -> fill from the first box
      raw.slice(0, OTP_LENGTH).split("").forEach((c, i) => (newOtp[i] = c));
      setOtpDigits(newOtp);
      otpInputRefs[OTP_LENGTH - 1].current?.focus();
    } else {
      newOtp[index] = raw;
      setOtpDigits(newOtp);
      if (raw && index < OTP_LENGTH - 1) {
        otpInputRefs[index + 1].current?.focus();
      }
    }

    // Move on to the new-password step as soon as all digits are filled
    // (note: joined.includes("") is always true, so check the digits directly)
    if (newOtp.every((d) => d !== "")) {
      if (!autoAdvanceRef.current) {
        autoAdvanceRef.current = true;
        setErrorMsg("");
        setForgotStep("reset");
      }
    } else {
      autoAdvanceRef.current = false;
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;

    const newOtp = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((c, i) => (newOtp[i] = c));
    setOtpDigits(newOtp);
    otpInputRefs[pasted.length - 1].current?.focus();

    if (pasted.length === OTP_LENGTH && !autoAdvanceRef.current) {
      autoAdvanceRef.current = true;
      setErrorMsg("");
      setForgotStep("reset");
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      otpInputRefs[index + 1].current?.focus();
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (newPassword !== newPassword2) {
      setErrorMsg("Passwords do not match");
      return;
    }
    const otp = otpDigits.join("");
    if (otp.length !== OTP_LENGTH) {
      setForgotStep("otp");
      setErrorMsg("Please enter the complete OTP first");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          otp,
          password: newPassword,
          password2: newPassword2,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(extractError(data));
        return;
      }
      setView("login");
      setSuccessMsg(data.message || "Password reset successfully. Please login.");
      setUsername(identifier.trim());
      setPassword("");
      setIdentifier("");
      setNewPassword("");
      setNewPassword2("");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setDevOtp("");
    } catch {
      setErrorMsg("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackArrow = () => {
    setErrorMsg("");
    if (view === "forgot") {
      if (forgotStep === "reset") {
        setForgotStep("otp");
        autoAdvanceRef.current = otpDigits.every((d) => d !== "");
      } else if (forgotStep === "otp") {
        setForgotStep("request");
        setOtpDigits(Array(OTP_LENGTH).fill(""));
        autoAdvanceRef.current = false;
      } else {
        setView("login");
      }
    } else {
      navigate("/");
    }
  };

  const backLabel =
    view === "forgot"
      ? forgotStep === "reset"
        ? "Back to OTP"
        : forgotStep === "otp"
          ? "Back"
          : "Back to login"
      : "Close";

  const titles = {
    login: { title: "Welcome to OpenBoxShop", sub: "Login to continue shopping" },
    signup: { title: "Create your account", sub: "Sign up with your details" },
    forgot: { title: "Reset password", sub: "Verify with an OTP sent to your mobile" },
  };
  const { title, sub } =
    view === "forgot" && forgotStep !== "request"
      ? { title: "OTP Verification", sub: "" }
      : titles[view];

  const inputClass =
    "w-full min-w-0 px-4 py-3 border border-gray-300 rounded-xl text-gray-900 text-base font-semibold focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none transition placeholder:text-gray-300 placeholder:font-medium";

  return (
    <div
      onClick={() => navigate("/")}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-[400px] max-h-[94vh] my-auto rounded-[20px] shadow-2xl relative border border-gray-100 flex flex-col overflow-y-auto"
      >
        {/* Back / close arrow */}
        <button
          onClick={handleBackArrow}
          type="button"
          aria-label={backLabel}
          title={backLabel}
          className="absolute top-4 left-3 sm:top-5 sm:left-4 p-2 text-gray-700 hover:text-black hover:bg-gray-100 rounded-full transition z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>

        <div className="flex-1 px-6 sm:px-8 pt-14 pb-6">
          {/* Logo + heading */}
          <div className="text-center mb-6">
            <img
              src="/FullLogo_NoBuffer.png"
              alt="OpenBoxShop"
              className="h-12 sm:h-14 max-w-full w-auto object-contain mx-auto mb-4"
            />
            <h2 className="text-xl sm:text-[22px] font-extrabold text-gray-900 tracking-tight">
              {title}
            </h2>
            {sub && (
              <p className="text-sm sm:text-[15px] font-medium text-gray-600 mt-0.5">{sub}</p>
            )}
          </div>

          {errorMsg && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-xl text-xs font-semibold break-words">
              ⚠️ {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 bg-green-50 border-l-4 border-green-600 text-green-700 p-3 rounded-xl text-xs font-semibold break-words">
              ✅ {successMsg}
            </div>
          )}

          {/* ================= LOGIN ================= */}
          {view === "login" && (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  autoComplete="username"
                  className={inputClass}
                  autoFocus
                  required
                />

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    className={`${inputClass} pr-12`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 transition"
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => switchView("forgot")}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: !loading ? "#0C831F" : "#9E9E9E" }}
                  className="w-full py-3.5 rounded-xl font-extrabold text-white text-base shadow transition duration-200 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  {loading ? "Logging in..." : "Login"}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <span className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-semibold text-gray-400">OR</span>
                <span className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Google */}
              {GOOGLE_CLIENT_ID ? (
                <div className="flex justify-center min-h-[44px] items-center">
                  <div ref={googleBtnRef} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setErrorMsg(
                      "Google sign-in is not configured yet. Add your Google OAuth Client ID to frontend/.env (VITE_GOOGLE_CLIENT_ID) and backend/.env (GOOGLE_CLIENT_ID)."
                    )
                  }
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-full border border-gray-300 font-bold text-gray-700 text-base hover:bg-gray-50 transition"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
              )}

              <p className="text-center text-sm text-gray-600 mt-6">
                New to OpenBoxShop?{" "}
                <button
                  type="button"
                  onClick={() => switchView("signup")}
                  className="font-bold text-blue-600 hover:underline"
                >
                  Create an account
                </button>
              </p>
            </>
          )}

          {/* ================= SIGNUP ================= */}
          {view === "signup" && (
            <>
              <form onSubmit={handleSignup} className="space-y-3.5">
                <input
                  type="text"
                  value={suName}
                  onChange={(e) => setSuName(e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                  className={inputClass}
                  autoFocus
                  required
                />
                <input
                  type="text"
                  value={suUsername}
                  onChange={(e) => setSuUsername(e.target.value)}
                  placeholder="Username"
                  autoComplete="username"
                  className={inputClass}
                  required
                />
                <div className="flex items-center gap-1 border border-gray-300 rounded-xl px-4 py-3 focus-within:border-gray-900 focus-within:ring-1 focus-within:ring-gray-900 transition-all">
                  <span className="font-semibold text-gray-900 text-base shrink-0">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={suPhone}
                    onChange={(e) => setSuPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="Mobile number"
                    autoComplete="tel-national"
                    className="w-full min-w-0 text-gray-900 text-base font-semibold focus:outline-none placeholder:text-gray-300 placeholder:font-medium"
                    required
                  />
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    placeholder="Password (min. 8 characters)"
                    autoComplete="new-password"
                    className={`${inputClass} pr-12`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 transition"
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={suPassword2}
                  onChange={(e) => setSuPassword2(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  className={inputClass}
                  required
                />

                <button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: !loading ? "#0C831F" : "#9E9E9E" }}
                  className="w-full py-3.5 rounded-xl font-extrabold text-white text-base shadow transition duration-200 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  {loading ? "Creating account..." : "Sign Up"}
                </button>
              </form>

              <p className="text-center text-sm text-gray-600 mt-5">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchView("login")}
                  className="font-bold text-blue-600 hover:underline"
                >
                  Login
                </button>
              </p>
            </>
          )}

          {/* ================= FORGOT: STEP 1 — identifier ================= */}
          {view === "forgot" && forgotStep === "request" && (
            <>
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Username or mobile number"
                  className={inputClass}
                  autoFocus
                  required
                />
                <p className="text-xs text-gray-500 -mt-2 px-1">
                  We will send a 6-digit verification code to the mobile number linked to your account.
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: !loading ? "#0C831F" : "#9E9E9E" }}
                  className="w-full py-3.5 rounded-xl font-extrabold text-white text-base shadow transition duration-200 active:scale-[0.99] disabled:cursor-not-allowed"
                >
                  {loading ? "Sending OTP..." : "Send OTP"}
                </button>
              </form>

              <p className="text-center text-sm text-gray-600 mt-6">
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => switchView("login")}
                  className="font-bold text-blue-600 hover:underline"
                >
                  Back to login
                </button>
              </p>
            </>
          )}

          {/* ================= FORGOT: STEP 2 — OTP ================= */}
          {view === "forgot" && forgotStep === "otp" && (
            <>
              <p className="text-center text-sm text-gray-600">
                We have sent a verification code to
              </p>
              <p className="text-center text-base font-semibold text-gray-900 mt-1">
                +91-{maskedPhone || "your mobile number"}
              </p>

              {smsNotice && (
                <div className="mt-3 mx-auto w-fit max-w-full bg-amber-50 border border-amber-300 text-amber-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-center break-words">
                  ⚠️ {smsNotice}
                </div>
              )}

              {devOtp && (
                <div className="mt-3 mx-auto w-fit bg-amber-50 border border-amber-300 text-amber-800 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide">
                  [dev] Your OTP: {devOtp}
                </div>
              )}

              <div className="flex justify-center gap-2 sm:gap-2.5 mt-7">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={otpInputRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    disabled={loading}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onFocus={(e) => e.target.select()}
                    onPaste={handleOtpPaste}
                    aria-label={`OTP digit ${idx + 1}`}
                    className="w-10 h-12 sm:w-12 sm:h-13 border border-gray-300 rounded-lg text-center text-xl sm:text-2xl font-bold text-gray-800 caret-gray-900 focus:border-gray-800 focus:ring-2 focus:ring-gray-200 focus:outline-none transition disabled:bg-gray-50 disabled:opacity-60"
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              <div className="text-center mt-7 min-h-[20px]">
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-sm font-semibold text-gray-800 hover:underline disabled:opacity-50"
                  >
                    Resend Code
                  </button>
                ) : (
                  <span className="text-sm text-gray-400">Resend Code (in {timer} secs)</span>
                )}
              </div>
            </>
          )}

          {/* ================= FORGOT: STEP 3 — new password ================= */}
          {view === "forgot" && forgotStep === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-center text-sm text-gray-600 -mt-2">
                OTP verified — now choose a new password.
              </p>
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className={inputClass}
                autoFocus
                required
              />
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className={inputClass}
                required
              />
              <label className="flex items-center gap-2 text-xs font-medium text-gray-500 px-1 select-none">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="accent-green-700"
                />
                Show passwords
              </label>
              <button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: !loading ? "#0C831F" : "#9E9E9E" }}
                className="w-full py-3.5 rounded-xl font-extrabold text-white text-base shadow transition duration-200 active:scale-[0.99] disabled:cursor-not-allowed"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-gray-50 border-t border-gray-100 rounded-b-[20px] px-6 py-3.5">
          <p className="text-[11px] sm:text-xs text-center text-gray-500 leading-relaxed">
            By continuing, you agree to our{" "}
            <span className="underline cursor-pointer hover:text-gray-800">Terms of service</span> &amp;{" "}
            <span className="underline cursor-pointer hover:text-gray-800">Privacy policy</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
