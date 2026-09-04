import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useCart } from '../context/CartContext.jsx';


function ProductDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { addToCart, cartItems } = useCart();
    const cartItemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

    useEffect(() => {
        fetch(`${BASEURL}/api/products/${id}/`)
            .then((response) => {
                if (!response.ok) {        
                    throw new Error('Failed to fetch product details');
                }
                return response.json();
            })
            .then((data) => {
                setProduct(data);
                setLoading(false);
            })
            .catch((error) => {
                setError(error.message);
                setLoading(false);
            });
    }, [id, BASEURL]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    if (loading) {
        return <div className='min-h-screen pt-20 text-center'>Loading...</div>;
    }
    if (error) {
        return <div className='min-h-screen pt-20 text-center text-red-600'>Error: {error}</div>;
    }
    if (!product) {
        return <div className='min-h-screen pt-20 text-center'>No product found</div>;
    }

    return (
        <div className='min-h-screen bg-gray-400'>
            {/* ================= Top Navbar: ← + Search + Cart ================= */}
            <nav className='bg-blue-100 fixed top-0 w-full z-50 flex items-center gap-3 px-3 py-2.5 shadow-sm'>
                {/* Back Arrow */}
                <button
                    onClick={() => navigate(-1)}
                    className='p-1.5 text-gray-800 hover:text-blue-600 transition-colors'
                    title='Back'
                >
                    <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M10 19l-7-7m0 0l7-7m-7 7h18' />
                    </svg>
                </button>

                {/* Search Bar */}
                <form onSubmit={handleSearch} className='flex-1'>
                    <div className='flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2'>
                        <svg className='w-4 h-4 text-gray-500 shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z' />
                        </svg>
                        <input
                            type='text'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder='Search for products'
                            className='w-full bg-transparent text-sm text-gray-700 placeholder-gray-500 focus:outline-none'
                        />
                    </div>
                </form>

                {/* Cart */}
                <Link
                    to='/cart'
                    className='relative p-2 text-gray-700 hover:text-blue-600 transition-colors'
                    title='Cart'
                >
                    <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth='2'
                            d='M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'
                        />
                    </svg>
                    {cartItemCount > 0 && (
                        <span className='absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center'>
                            {cartItemCount}
                        </span>
                    )}
                </Link>
            </nav>

            {/* ================= Product Content ================= */}
            <div className='pt-[60px] pb-24 flex justify-center'>
                <div className='bg-white shadow-lg rounded-2xl p-6 max-w-3xl w-full m-4'>
                    <div className='flex flex-col md:flex-row gap-8'>
                        <img
                            src={`${product.image}`}
                            alt={product.name}
                            className='w-full md:w-1/2 h-auto object-cover rounded-lg'
                        />
                        <div className='flex-1'>
                            <h1 className='text-3xl font-bold text-gray-800 mb-2'>{product.name}</h1>
                            <p className='text-gray-600 mb-4'>{product.description}</p>
                            <p className='text-2xl font-semibold text-green-600 mb-6'>₹{product.price}</p>
                            <button onClick={() => addToCart(product)} className='bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition cursor-pointer'>
                                Add to Cart 🛒
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ================= Bottom Action Bar: Cart + EMI + Buy Now ================= */}
            <div className='fixed bottom-0 w-full z-50 bg-white border-t border-gray-200 flex items-center gap-2 px-3 py-2.5 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]'>
                {/* Small Cart Button */}
                <Link
                    to='/cart'
                    className='border border-gray-300 rounded-lg p-2.5 text-gray-700 hover:bg-gray-50 transition'
                    title='Go to Cart'
                >
                    <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' />
                    </svg>
                </Link>

                {/* Buy with EMI */}
                <button className='flex-1 border border-gray-300 rounded-lg py-2 text-center hover:bg-gray-50 transition'>
                    <span className='block text-sm font-semibold text-gray-800'>Buy with EMI</span>
                    <span className='block text-xs text-gray-500'>
                        From ₹{Math.ceil(product.price / 12)}/m
                    </span>
                </button>

                {/* Buy Now */}
                <button className='flex-1 bg-yellow-400 rounded-lg py-2 text-center hover:bg-yellow-500 transition'>
                    <span className='block text-sm font-bold text-gray-900'>Buy now</span>
                    <span className='block text-xs text-gray-800'>at ₹{product.price}</span>
                </button>
            </div>
        </div>
    );
}

export default ProductDetails;