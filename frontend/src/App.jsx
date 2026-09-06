import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ProductList from './pages/ProductList';
import ProductDetails from './pages/ProductDetails';
import CategoriesPage from './pages/CategoriesPage';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import { useLocation } from 'react-router-dom';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import Login from './pages/Login.jsx';
import AccountPage from './pages/AccountPage.jsx';
import HomeNav from './components/HomeNav.jsx';

const NAVBAR_PATHS = ['/cart', '/checkout', '/login', '/search', '/categories', '/category'];
const BOTTOMNAV_PATHS = ['/', '/cart', '/checkout', '/search', '/category', '/categories'];
const HOMENAV_PATHS = ['/'];

const matchesNav = (pathname, bases) =>
  bases.some((base) => pathname === base || pathname.startsWith(base + '/'));

function AppContent() {
  const location = useLocation();
  const showNavA = matchesNav(location.pathname, NAVBAR_PATHS);
  const showNavB = matchesNav(location.pathname, BOTTOMNAV_PATHS);
  const showNavH = matchesNav(location.pathname, HOMENAV_PATHS);

  return (
    <>
      {showNavA && <Navbar />}
      {showNavB && <BottomNav />}
      {showNavH && <HomeNav />}
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/search" element={<ProductList />} />
        <Route path="/category/:slug" element={<ProductList />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route element={<PrivateRoute />}>
          <Route path="/checkout" element={<CheckoutPage />} />
        </Route>
        <Route path="/login" element={<><ProductList /><Login /></>} />
        <Route element={<PrivateRoute />}>
          <Route path="/account" element={<AccountPage />} />
        </Route>

      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
