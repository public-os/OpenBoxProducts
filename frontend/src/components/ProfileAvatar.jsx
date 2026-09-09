import { useEffect, useState } from "react";

// Default profile logo — jab koi image set nahi hai (skip kiya ya email par bhi kuch nahi mila)
export function DefaultAvatar({ className = "w-full h-full rounded-full" }) {
    return (
        <div className={`bg-gray-200 flex items-center justify-center overflow-hidden ${className}`}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-1/2 h-1/2 text-gray-400">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
        </div>
    );
}

/**
 * Circular profile image with automatic fallback:
 * image load fail (jaise Gravatar 404) -> default profile logo.
 * `editable` par camera badge dikhta hai jo `onChange` trigger karta hai.
 */
export default function ProfileAvatar({ src, alt = "Profile photo", className = "w-24 h-24", editable = false, onChange }) {
    const [failed, setFailed] = useState(false);

    // Nayi src aane par error state reset ho jaye
    useEffect(() => setFailed(false), [src]);

    const showImage = src && !failed;

    return (
        <div className={`relative shrink-0 ${className}`}>
            {showImage ? (
                <img
                    src={src}
                    alt={alt}
                    onError={() => setFailed(true)}
                    className="w-full h-full rounded-full object-cover border border-gray-200 bg-white"
                />
            ) : (
                <DefaultAvatar className="w-full h-full rounded-full border border-gray-200" />
            )}

            {editable && (
                <button
                    type="button"
                    onClick={onChange}
                    aria-label="Change profile photo"
                    title="Change profile photo"
                    className="absolute bottom-0 right-0 bg-[#0C831F] hover:bg-[#0a6e19] text-white rounded-full p-1.5 shadow border-2 border-white transition cursor-pointer"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
            )}
        </div>
    );
}
