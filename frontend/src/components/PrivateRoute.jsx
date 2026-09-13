import { Navigate, Outlet, useLocation } from "react-router-dom";

const isAuthenticated = () => !!localStorage.getItem("access_token");

export default function PrivateRoute({ redirectTo = "/login" }) {
    // Destination yaad rakho — login ke baad Login modal `state.from` se
    // wahin wapas le jata hai (warna guest hamesha home par chala jata hai).
    const location = useLocation();
    return isAuthenticated() ? (
        <Outlet />
    ) : (
        <Navigate to={redirectTo} replace state={{ from: location.pathname + location.search }} />
    );
}
