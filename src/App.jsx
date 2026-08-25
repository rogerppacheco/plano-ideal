import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { isSessionAuthenticated } from "./lib/authSession";
import { registerForcedLogoutHandler } from "./lib/sessionExit";
import ContatoPage from "./pages/ContatoPage";
import InternalDashboard from "./pages/InternalDashboard";
import InternalLogin from "./pages/InternalLogin";
import PrivacidadePage from "./pages/PrivacidadePage";
import PublicLanding from "./pages/PublicLanding";
import SobrePage from "./pages/SobrePage";
import TermosPage from "./pages/TermosPage";

const PAGE_TITLES = {
  "/": "Fibra Aqui | Compare planos de internet fibra",
  "/sobre": "Sobre | Fibra Aqui",
  "/contato": "Contato | Fibra Aqui",
  "/termos": "Termos de Uso | Fibra Aqui",
  "/privacidade": "Política de Privacidade | Fibra Aqui",
  "/interno": "Login | Fibra Aqui",
  "/interno/painel": "Painel interno | Fibra Aqui",
};

function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = PAGE_TITLES[pathname] || "Fibra Aqui";
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
        <Route path="/sobre" element={<SobrePage />} />
        <Route path="/contato" element={<ContatoPage />} />
        <Route path="/termos" element={<TermosPage />} />
        <Route path="/privacidade" element={<PrivacidadePage />} />
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
