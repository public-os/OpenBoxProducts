import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { getAccessToken, getUsername, getUserName, clearTokens, authFetch, saveProfile, PROFILE_EVENT } from '../utils/auth.js';
import ProfileAvatar from './ProfileAvatar.jsx';

// Moved outside Navbar so it isn't re-created (and re-mounted) on every render.
function SearchInput({ mobile, searchQuery, setSearchQuery }) {
    return (
        <div className='relative flex items-center'>
            {mobile && (
                <svg
                    className='absolute left-3 w-5 h-5 text-gray-500 pointer-events-none'
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
            )}

            <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search for Products, Brands and More'
                className={`w-full border border-gray-300 rounded-lg pl-10 md:pl-4 pr-3 py-2 text-sm text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${mobile ? '' : 'md:rounded-l-md md:rounded-r-none'
                    }`}
            />

            {!mobile && (
                <button
                    type='submit'
                    className='hidden md:block bg-blue-600 text-white px-5 py-2 rounded-r-md hover:bg-blue-700 transition-colors text-sm font-medium'
                >
                    Search
                </button>
            )}
        </div>
    );
}

function Navbar() {
    const [searchQuery, setSearchQuery] = useState('');
    const [userProfile, setUserProfile] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const navigate = useNavigate();
    const { cartItems } = useCart();
    const cartItemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const token = getAccessToken();

    useEffect(() => {
        if (token) {
            authFetch(`${BASEURL}/api/user/profile/`)
                .then((res) => {
                    if (res.ok) return res.json();
                    throw new Error('Failed to fetch user');
                })
                .then((data) => {
                    setUserProfile(data);
                    saveProfile(data);
                })
                .catch((err) => console.error('Error fetching user profile:', err));
        } else {
            queueMicrotask(() => setUserProfile(null));
        }
    }, [token, BASEURL]);

    // Account page se name/email edit hua to DB-fresh data turant greeting me dikhao
    useEffect(() => {
        const onProfileUpdated = (e) => {
            if (e.detail) setUserProfile(e.detail);
        };
        window.addEventListener(PROFILE_EVENT, onProfileUpdated);
        return () => window.removeEventListener(PROFILE_EVENT, onProfileUpdated);
    }, []);

    useEffect(() => {
        if (!menuOpen) return;
        const onClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [menuOpen]);

    const username = userProfile?.username || getUsername() || 'User';
    const displayName = userProfile?.name || getUserName() || username;

    const handleProfile = () => {
        setMenuOpen(false);
        navigate('/account');
    };

    const handleLogout = () => {
        clearTokens();
        setUserProfile(null);
        setMenuOpen(false);
        navigate('/login');
    };

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
                {/* Logo — desktop & mobile */}
                <Link to='/' className='flex items-center whitespace-nowrap flex-shrink-0'>
                    <img src='/FullLogo_NoBuffer.png' alt='OpenBoxShop' className='h-9 w-auto object-contain' />
                </Link>

                {/* ===== Desktop Search — flexible width, kabhi overflow nahi ===== */}
                <form
                    onSubmit={handleSearch}
                    role='search'
                    className='hidden md:flex flex-1 min-w-0 items-center'
                >
                    <div className='w-full max-w-md lg:max-w-2xl mx-auto'>
                        <SearchInput mobile={false} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
                    </div>
                </form>

                {/* Right Side Icons */}
                <div className='flex items-center gap-1 md:gap-3 ml-auto flex-shrink-0'>
                    {token ? (
                        <div className='relative hidden md:block' ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen((o) => !o)}
                                aria-expanded={menuOpen}
                                aria-label={`Account menu for ${displayName}`}
                                className='rounded-full w-9 h-9 shadow hover:opacity-90 transition-opacity cursor-pointer'
                                title={`Logged in as ${displayName}`}
                            >
                                <ProfileAvatar src={userProfile?.profile_image} className='w-9 h-9' />
                            </button>

                            {menuOpen && (
                                <div className='absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1'>
                                    <div className='px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100 truncate'>
                                        Hi, {displayName}
                                    </div>

                                    <button
                                        onClick={handleProfile}
                                        className='w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium flex items-center gap-2'
                                    >
                                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' />
                                        </svg>
                                        Profile
                                    </button>

                                    <button
                                        onClick={handleLogout}
                                        className='w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium flex items-center gap-2'
                                    >
                                        <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' />
                                        </svg>
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
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
                    )}

                    {/* Cart */}
                    <Link
                        to='/cart'
                        className='relative p-2 text-gray-700 hover:text-blue-600 transition-colors hidden md:flex'
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

            {/* ================= Mobile Search Row — full width, own line ================= */}
            <form onSubmit={handleSearch} className='md:hidden px-4 pb-3'>
                <SearchInput mobile={true} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
            </form>
        </header>
    );
}

export default Navbar;