import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authFetch, getAccessToken, AUTH_EVENT } from "../utils/auth.js";

const CartContext = createContext();

export const CartProvider = ({ children }) => {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const [cartItems, setCartItems] = useState([]);
    const [total, setTotal] = useState(0);

    const fetchCart = useCallback(async () => {
        try {
            const res = await authFetch(`${BASEURL}/api/cart/`)
            const data = await res.json();
            setCartItems(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error("Error fetching cart:", error);
        }
    }, [BASEURL]);

    useEffect(() => {
        if (getAccessToken()) {
            queueMicrotask(fetchCart);
        }
    }, [fetchCart]);

    // Login/logout without a page reload (modal login, logout button) should
    // load or clear the cart immediately instead of waiting for a refresh.
    useEffect(() => {
        const onAuthChange = () => {
            if (getAccessToken()) {
                fetchCart();
            } else {
                setCartItems([]);
                setTotal(0);
            }
        };
        window.addEventListener(AUTH_EVENT, onAuthChange);
        return () => window.removeEventListener(AUTH_EVENT, onAuthChange);
    }, [fetchCart]);

    //Add Product to Cart (supports optional variantId)
    const addToCart = async (productId, variantId = null) => {
        try {
            const res = await authFetch(`${BASEURL}/api/cart/add/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ product_id: productId, variant_id: variantId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || "Could not add item to cart.");
                return false;
            }
            fetchCart();
            return true;
        } catch (error) {
            console.error("Error adding to cart:", error);
            return false;
        }
    }

    //Remove Product from Cart
    const removeFromCart = async (itemId) => {
        try {
            await authFetch(`${BASEURL}/api/cart/remove/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ item_id: itemId }),
            });
            fetchCart();
        } catch (error) {
            console.error("Error removing from cart:", error);
        }
    }

    //Update Quantity
    const updateQuantity = async (itemId, quantity) => {
        if (quantity < 1) {
            await removeFromCart(itemId);
            return;
        }
        try {
            const res = await authFetch(`${BASEURL}/api/cart/update/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ item_id: itemId, quantity }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || "Could not update quantity.");
                return;
            }
            fetchCart();
        } catch (error) {
            console.error("Error updating quantity:", error);
        }
    }

    const clearCart = () => {
        setCartItems([]);
        setTotal(0);
    }

    return (
        <CartContext.Provider
            value={{ cartItems, total, addToCart, removeFromCart, updateQuantity, clearCart }}>
            {children}
        </CartContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => useContext(CartContext);