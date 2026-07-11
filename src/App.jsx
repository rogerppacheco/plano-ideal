import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { isSessionAuthenticated } from "./lib/authSession";
import { registerForcedLogoutHandler } from "./lib/sessionExit";
import InternalDashboard from "./pages/InternalDashboard";
import InternalLogin from "./pages/InternalLogin";
import PublicLanding from "./pages/PublicLanding";

const PAGE_TITLES = {
  "/": "Plano Ideal | Compare Planos de Internet Fibra",
  "/interno": "Login | Plano Ideal",
  "/interno/painel": "Painel Interno | Plano Ideal",
};

function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = PAGE_TITLES[pathname] || "Plano Ideal";
  }, [pathname]);

  return null;
}

function RequireInternalAuth({ children }) {
  const isAuthed = isSessionAuthenticated();
  return isAuthed ? children : <Navigate to="/interno" replace />;
}

function AuthSessionBridge() {
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    registerForcedLogoutHandler((message) => {
      toast.warning(message);
      navigate("/interno", { replace: true });
    });
  }, [navigate, toast]);

  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <PageTitle />
      <AuthSessionBridge />
      <Routes>
        <Route path="/" element={<PublicLanding />} />
        <Route path="/interno" element={<InternalLogin />} />
        <Route
          path="/interno/painel"
          element={
            <RequireInternalAuth>
              <InternalDashboard />
            </RequireInternalAuth>
          }
        />
        <Route path="/interno/consulta" element={<Navigate to="/interno/painel" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
