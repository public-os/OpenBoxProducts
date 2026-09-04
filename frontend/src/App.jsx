import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ProductList from './pages/ProductList';
import ProductDetails from './pages/ProductDetails';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import { useLocation } from 'react-router-dom';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';

function AppContent() {
  const location = useLocation();
  const showNavA = location.pathname === '/' || location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname === '/login' || location.pathname === '/signup';
  const showNavB = location.pathname === '/' || location.pathname === '/cart' || location.pathname === '/checkout';

  return (
    <>
      {showNavA && <Navbar />}
      {showNavB && <BottomNav />}
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/cart" element={<CartPage />} />
        <Route element={<PrivateRoute />}>
          <Route path="/checkout" element={<CheckoutPage />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
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