import { useEffect, useRef, useState } from "react";
import { authFetch } from "../utils/auth.js";
import ProfileAvatar from "./ProfileAvatar.jsx";

const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Profile photo picker — do jagah use hota hai:
 *  - mode="setup":    signup ke turant baad (Skip = default logo rahe, Save = upload)
 *  - mode="account":  Account page se change karte waqt (Cancel/Save + purani photo Remove)
 *
 * `onSaved(data)` ko profile response milta hai (naye profile_image ke sath),
 * `onClose()` Skip/Cancel par chalta hai.
 */
export default function AvatarPickerModal({ mode = "setup", currentImage = null, currentSource = null, onClose, onSaved }) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const isSetup = mode === "setup";

    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef(null);

    // Object URLs ka cleanup (memory leak na bane)
    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    const pickFile = (f) => {
        setError("");
        if (!f) return;
        if (!ALLOWED_TYPES.includes(f.type)) {
            setError("Only JPG, PNG, WebP or GIF images are allowed.");
            return;
        }
        if (f.size > MAX_SIZE_MB * 1024 * 1024) {
            setError(`Image must be ${MAX_SIZE_MB} MB or smaller.`);
            return;
        }
        if (preview) URL.revokeObjectURL(preview);
        setFile(f);
        setPreview(URL.createObjectURL(f));
    };

    const clearSelection = () => {
        if (preview) URL.revokeObjectURL(preview);
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    const save = async () => {
        if (!file || saving) return;
        setSaving(true);
        setError("");
        try {
            const fd = new FormData();
            fd.append("avatar", file);
            const res = await authFetch(`${BASEURL}/api/user/profile/avatar/`, {
                method: "POST",
                body: fd,
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                clearSelection();
                onSaved(data);
            } else {
                setError(data.error || "Could not save your photo. Please try again.");
            }
        } catch {
            setError("Could not reach the server. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (removing) return;
        setRemoving(true);
        setError("");
        try {
            const res = await authFetch(`${BASEURL}/api/user/profile/avatar/`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                clearSelection();
                onSaved(data);
            } else {
                setError(data.error || "Could not remove your photo. Please try again.");
            }
        } catch {
            setError("Could not reach the server. Please try again.");
        } finally {
            setRemoving(false);
        }
    };

    const displayImage = preview || currentImage;
    const canRemove = !isSetup && currentSource === "upload";

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white w-full max-w-sm rounded-[20px] shadow-2xl p-6"
            >
                <h2 className="text-lg font-extrabold text-gray-900 text-center">
                    {isSetup ? "Set your profile photo" : "Update profile photo"}
                </h2>
                <p className="text-sm text-gray-600 text-center mt-1">
                    {isSetup
                        ? "Add a photo so sellers and order updates feel personal. You can change this anytime."
                        : "Pick a new photo, or remove the current one."}
                </p>

                <div className="flex justify-center mt-6">
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        title="Choose a photo"
                        aria-label="Choose a photo"
                        className="rounded-full cursor-pointer hover:opacity-90 transition active:scale-[0.98]"
                    >
                        <ProfileAvatar
                            src={displayImage}
                            className="w-28 h-28"
                            editable
                            onChange={() => inputRef.current?.click()}
                        />
                    </button>
                </div>

                <p className="text-center text-xs text-gray-500 mt-3">
                    JPG, PNG, WebP or GIF — up to {MAX_SIZE_MB} MB
                </p>

                {error && (
                    <div className="mt-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-xl text-xs font-semibold break-words">
                        ⚠️ {error}
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                />

                <div className="flex gap-3 mt-6">
                    {canRemove && (
                        <button
                            type="button"
                            onClick={remove}
                            disabled={saving || removing}
                            className="px-3 py-2.5 rounded-xl border border-red-400 text-red-600 text-sm font-bold hover:bg-red-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {removing ? "Removing..." : "Remove"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            clearSelection();
                            onClose();
                        }}
                        disabled={saving || removing}
                        className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSetup ? "Skip" : "Cancel"}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!file || saving || removing}
                        style={{ backgroundColor: file && !saving ? "#0C831F" : "#9E9E9E" }}
                        className="flex-1 py-2.5 rounded-xl font-extrabold text-white shadow transition disabled:cursor-not-allowed"
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
