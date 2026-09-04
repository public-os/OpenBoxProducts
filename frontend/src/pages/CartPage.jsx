import { useCart } from "../context/CartContext";
import { Link } from "react-router-dom";

function CartPage() {
    const { cartItems, total, removeFromCart, updateQuantity } = useCart();

    return (
        <div className="pt-20 min-h-screen bg-gray-400 p-4 sm:p-8 sm:pb-20 pb-20 md:pb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-center pt-8 lg:pt-10 md:pt-10 sm:pt-18 pb-4 sm:pb-3">
                🛒 Your Cart
            </h1>

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
                    {cartItems.map((item) => (
                        <div
                            key={item.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-gray-200 last:border-b-0"
                        >
                            {/* Product info */}
                            <div className="flex items-center gap-4 min-w-0">
                                {item.image && (
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg flex-shrink-0"
                                    />
                                )}
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-lg font-semibold truncate">
                                        {item.name}
                                    </h2>
                                    <p className="text-gray-600">₹{item.price}</p>
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
                    ))}

                    {/* Summary */}
                    <div className="border-t border-gray-200 pt-4 mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center justify-between sm:justify-start sm:gap-3">
                            <h2 className="text-lg sm:text-xl font-bold">Total:</h2>
                            <p className="text-lg sm:text-xl font-semibold">
                                ₹{total.toFixed(2)}
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