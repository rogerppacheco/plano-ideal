import { Navigate, Route, Routes } from "react-router-dom";
import { isSessionAuthenticated } from "./lib/authSession";
import InternalDashboard from "./pages/InternalDashboard";
import InternalLogin from "./pages/InternalLogin";
import PublicLanding from "./pages/PublicLanding";

function RequireInternalAuth({ children }) {
  const isAuthed = isSessionAuthenticated();
  return isAuthed ? children : <Navigate to="/interno" replace />;
}

export default function App() {
  return (
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
  );
}
