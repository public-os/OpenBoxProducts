import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';

function BottomNav() {
    const location = useLocation();
    const { cartItems } = useCart();
    const cartItemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

    const navItems = [
        {
            name: 'Home',
            path: '/',
            icon: (
                <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' />
                </svg>
            ),
        },
        {
            name: 'Categories',
            path: '/categories',
            icon: (
                <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' />
                </svg>
            ),
        },
        {
            name: 'Account',
            path: '/account',
            icon: (
                <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' />
                </svg>
            ),
        },
        {
            name: 'Cart',
            path: '/cart',
            icon: (
                <>
                    <svg className='w-6 h-6' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' />
                    </svg>
                    {cartItemCount > 0 && (
                        <span className='absolute top-0 right-3 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center'>
                            {cartItemCount}
                        </span>
                    )}
                </>
            ),
        },
    ];

    return (
        <nav className='md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 z-50 flex justify-around'>
            {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                    <Link
                        key={item.name}
                        to={item.path}
                        className={`relative flex flex-col items-center gap-0.5 py-2 px-4 text-xs transition-colors ${active ? 'text-blue-600 font-semibold' : 'text-gray-600'
                            }`}
                    >
                        {item.icon}
                        {item.name}
                    </Link>
                );
            })}
        </nav>
    );
}

export default BottomNav;