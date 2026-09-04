import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';

const categories = [
    'For You',
    'Fashion',
    'Mobiles',
    'Electronics',
    'Beauty',
    'Home & Kitchen',
    'Sports',
    'Books',
];

function Navbar() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('For You');
    const navigate = useNavigate();
    const { cartItems } = useCart();
    const cartItemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery('');
        }
    };

    return (
        <header className='bg-white shadow-md fixed w-full top-0 z-50'>
            {/* ================= Top Row ================= */}
            <div className='flex items-center gap-2 md:gap-4 px-4 md:px-8 py-3'>
                {/* Logo — sirf desktop pe */}
                <Link
                    to='/'
                    className='hidden md:block text-2xl font-bold text-gray-800 whitespace-nowrap'
                >
                    OpenBoxProducts
                </Link>

                {/* Logo — sirf mobile pe */}
                <Link
                    to='/'
                    className='md:hidden text-2xl font-bold text-gray-800 whitespace-nowrap'
                >
                    OBP
                </Link>

                {/* Search Bar */}
                <form
                    onSubmit={handleSearch}
                    className='flex-1 min-w-0 md:max-w-md lg:max-w-[480px]'
                >
                    <div className='relative flex items-center'>
                        {/* Mobile: icon input ke andar */}
                        <svg
                            className='md:hidden absolute left-3 w-5 h-5 text-gray-500 pointer-events-none'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z'
                            />
                        </svg>

                        <input
                            type='text'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder='Search for Products, Brands and More'
                            className='w-full border border-gray-300 rounded-lg md:rounded-l-md md:rounded-r-none pl-10 md:pl-4 pr-3 py-2 text-sm text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />

                        {/* Desktop: blue Search button */}
                        <button
                            type='submit'
                            className='hidden md:block bg-blue-600 text-white px-5 py-2 rounded-r-md hover:bg-blue-700 transition-colors text-sm font-medium'
                        >
                            Search
                        </button>
                    </div>
                </form>

                {/* Right Side Icons */}
                <div className='flex items-center gap-1 md:gap-3 hidden md:flex ml-auto flex-shrink-0'>
                    {/* User */}
                    <Link
                        to='/account'
                        className='p-2 text-gray-700 hover:text-blue-600 transition-colors'
                        title='My Account'
                    >
                        <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                            />
                        </svg>
                    </Link>

                    {/* Login */}
                    <Link
                        to='/login'
                        className='hidden sm:flex items-center gap-1.5 border border-gray-300 rounded-lg px-4 py-1.5 text-blue-600 font-semibold text-sm hover:border-blue-600 hover:bg-blue-50 transition-colors'
                    >
                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                            />
                        </svg>
                        Login
                    </Link>

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
                </div>
            </div>

            {/* ============ Category Tabs — sirf mobile pe ============ */}
            <nav className='md:hidden flex gap-6 px-4 overflow-x-auto no-scrollbar border-b border-gray-100'>
                {categories.map((category) => (
                    <Link
                        key={category}
                        to={
                            category === 'For You'
                                ? '/'
                                : `/category/${category.toLowerCase().replace(/\s+/g, '-')}`
                        }
                        onClick={() => setActiveCategory(category)}
                        className={`pb-2 pt-0.5 text-sm whitespace-nowrap border-b-2 transition-colors ${activeCategory === category
                                ? 'text-blue-600 border-blue-600 font-semibold'
                                : 'text-gray-600 border-transparent'
                            }`}
                    >
                        {category}
                    </Link>
                ))}
            </nav>
        </header>
    );
}

export default Navbar;