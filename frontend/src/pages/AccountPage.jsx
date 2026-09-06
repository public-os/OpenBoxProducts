import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch, clearTokens } from "../utils/auth.js";

function AccountPage() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();

    const [profile, setProfile] = useState(null);
    const [editOpen, setEditOpen] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [loadError, setLoadError] = useState(false);

    const loadProfile = async () => {
        try {
            const res = await authFetch(`${BASEURL}/api/user/profile/`);
            if (res.ok) {
                const data = await res.json();
                setProfile(data);
                setForm({
                    name: data.name || "",
                    email: data.email || "",
                    phone: data.phone || "",
                    address: data.address || "",
                });
                setLoadError(false);
            } else {
                setLoadError(true);
            }
        } catch {
            setLoadError(true);
        }
    };

    useEffect(() => {
        queueMicrotask(loadProfile);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrorMsg("");
        try {
            const res = await authFetch(`${BASEURL}/api/user/profile/`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setProfile(data);
                setEditOpen(false);
            } else {
                setErrorMsg(data.error || "Could not save your details. Please try again.");
            }
        } catch {
            setErrorMsg("Could not reach the server. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        clearTokens();
        navigate("/login");
    };

    const rows = profile && [
        { label: "Name", value: profile.name },
        { label: "Username", value: profile.username },
        { label: "Email", value: profile.email || "Not set" },
        { label: "Mobile", value: profile.phone ? `+91 ${profile.phone}` : "Not set" },
        { label: "Address", value: profile.address || "Not set" },
    ];

    return (
        <>
            <nav className="fixed top-0 w-full z-50 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 bg-white">
                {/* Back Arrow */}
                <button
                    onClick={() => navigate(-1)}
                    className="p-1.5 text-gray-800 hover:text-blue-600 transition-colors"
                    title="Back"
                    aria-label="Go back"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>

                <p className="text-center">Profile</p>

                {/* right side placeholder — same width as back button so text stays centered */}
                <div className="w-9"></div>
            </nav>

            <div className="sm:py-12 py-10 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-left">
                    Your Account
                </h1>

                <div className="max-w-4xl mx-auto bg-white p-4 sm:p-6 rounded-lg shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-gray-200">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="min-w-0">
                                <h2 className="text-base sm:text-lg font-semibold truncate">
                                    Account Details
                                </h2>
                                <p className="text-gray-600">Manage your account information</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                            <button
                                onClick={() => {
                                    setErrorMsg("");
                                    setEditOpen(true);
                                }}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition duration-300"
                            >
                                Edit Account
                            </button>
                            <button
                                onClick={handleLogout}
                                className="border border-red-500 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition duration-300 font-semibold"
                            >
                                Logout
                            </button>
                        </div>
                    </div>

                    {loadError && (
                        <p className="py-6 text-center text-red-600">
                            Could not load your profile. Is the backend server running?
                        </p>
                    )}

                    {profile && (
                        <dl className="divide-y divide-gray-100">
                            {rows.map(({ label, value }) => (
                                <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3">
                                    <dt className="text-sm font-semibold text-gray-500 sm:w-32 shrink-0">{label}</dt>
                                    <dd className="text-gray-900 break-words">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                {/* ---------- Edit modal ---------- */}
                {editOpen && (
                    <div
                        onClick={() => setEditOpen(false)}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white w-full max-w-md rounded-[20px] shadow-2xl p-6 max-h-[92vh] overflow-y-auto"
                        >
                            <h2 className="text-lg font-extrabold text-gray-900 mb-4">Edit Account</h2>

                            {errorMsg && (
                                <div className="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-xl text-xs font-semibold break-words">
                                    ⚠️ {errorMsg}
                                </div>
                            )}

                            <form onSubmit={handleSave} className="space-y-3.5">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">NAME</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">EMAIL</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">MOBILE</label>
                                    <input
                                        type="tel"
                                        maxLength={10}
                                        value={form.phone}
                                        onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
                                        placeholder="10-digit mobile number"
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">ADDRESS</label>
                                    <textarea
                                        rows={3}
                                        value={form.address}
                                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none resize-none"
                                    />
                                </div>

                                <div className="flex gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setEditOpen(false)}
                                        className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        style={{ backgroundColor: !saving ? "#0C831F" : "#9E9E9E" }}
                                        className="flex-1 py-2.5 rounded-xl font-extrabold text-white shadow transition disabled:cursor-not-allowed"
                                    >
                                        {saving ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default AccountPage;