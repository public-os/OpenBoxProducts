import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ProductList from './pages/ProductList';
import ProductDetails from './pages/ProductDetails';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import { useLocation } from 'react-router-dom';

function AppContent() {
  const location = useLocation();

  return (
    <>
      {location.pathname === '/' && <Navbar />}
      {location.pathname === '/' && <BottomNav />}
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/product/:id" element={<ProductDetails />} />
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