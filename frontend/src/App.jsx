import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ProductList from './pages/ProductList';
import ProductDetails from './pages/ProductDetails';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import { useLocation } from 'react-router-dom';
import CartPage from './pages/CartPage.jsx';

function AppContent() {
  const location = useLocation();

  return (
    <>
      {location.pathname === '/' || location.pathname === '/cart' ? <Navbar /> : null}
      {location.pathname === '/' || location.pathname === '/cart' ? <BottomNav /> : null}
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/cart" element={<CartPage />} />
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