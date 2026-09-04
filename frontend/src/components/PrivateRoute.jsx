import { Navigate, Outlet } from "react-router-dom";

const isAuthenticated = () => !!localStorage.getItem("access_token");

export default function PrivateRoute({ redirectTo = "/login" }) {
    return isAuthenticated() ? <Outlet /> : <Navigate to={redirectTo} replace />;
}
