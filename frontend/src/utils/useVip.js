import { useEffect, useState } from 'react';
import { authFetch, getAccessToken, AUTH_EVENT } from './auth.js';

// VIP status — Django admin se mark kiye gaye VIP users ko review par blue tick
// aur pin/delete powers milti hain. Profile endpoint se fresh laata hai.
export function useVipStatus(baseUrl) {
    const [isVip, setIsVip] = useState(false);

    useEffect(() => {
        if (!getAccessToken()) return;
        let cancelled = false;
        authFetch(`${baseUrl}/api/user/profile/`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!cancelled && data) setIsVip(!!data.is_vip);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [baseUrl]);

    // Login/logout bina page reload ke hota hai (modal login) — logout par
    // VIP badge turant clear ho jaye. Mount par logged-out = state already false.
    useEffect(() => {
        const onAuthChange = () => {
            if (!getAccessToken()) setIsVip(false);
        };
        window.addEventListener(AUTH_EVENT, onAuthChange);
        return () => window.removeEventListener(AUTH_EVENT, onAuthChange);
    }, []);

    return isVip;
}
