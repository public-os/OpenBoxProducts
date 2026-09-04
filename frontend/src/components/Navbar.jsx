import {Link, useNavigate} from 'react-router-dom';

function Navbar() {
    const navigate = useNavigate();
    return (
        <nav className='bg-white shadow-md px-6 py-6 flex justify-between items-center fixed w-full top-0 z-50'>
            <Link to='/' className='text-2xl font-bold text-gray-800'>
             OpenBoxProducts
            </Link>

            <Link to='/cart' className='relative text-gray-800 hover:text-gray-600 font-medium'>
                🛒 Cart
                {cartCount > 0 && (
                    <span className='absolute -top-2 -right-3 bg-red-500 text-white text-xs font-bold rounded-full px-2'>
                        {cartCount}
                    </span>
                )}
            </Link>
        </nav>
    )
}

export default Navbar;