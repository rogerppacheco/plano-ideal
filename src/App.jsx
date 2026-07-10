import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isSessionAuthenticated } from "./lib/authSession";
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

export default function App() {
  return (
    <>
      <PageTitle />
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
    </>
  );
}
