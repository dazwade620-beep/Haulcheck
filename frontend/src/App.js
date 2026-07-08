import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AuthCallback from "@/components/AuthCallback";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Calendar from "@/pages/Calendar";
import Vehicles from "@/pages/Vehicles";
import Drivers from "@/pages/Drivers";
import Training from "@/pages/Training";
import Insurance from "@/pages/Insurance";
import Tacho from "@/pages/Tacho";
import Documents from "@/pages/Documents";
import Maintenance from "@/pages/Maintenance";
import Operator from "@/pages/Operator";
import Reminders from "@/pages/Reminders";
import { Truck } from "lucide-react";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-400">
        <Truck className="animate-pulse" size={36} />
        <p className="text-sm tracking-widest uppercase">Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/operator" element={<Protected><Operator /></Protected>} />
      <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
      <Route path="/maintenance" element={<Protected><Maintenance /></Protected>} />
      <Route path="/inspections" element={<Navigate to="/maintenance" replace />} />
      <Route path="/vehicles" element={<Protected><Vehicles /></Protected>} />
      <Route path="/drivers" element={<Protected><Drivers /></Protected>} />
      <Route path="/training" element={<Protected><Training /></Protected>} />
      <Route path="/insurance" element={<Protected><Insurance /></Protected>} />
      <Route path="/tacho" element={<Protected><Tacho /></Protected>} />
      <Route path="/defects" element={<Navigate to="/maintenance" replace />} />
      <Route path="/documents" element={<Protected><Documents /></Protected>} />
      <Route path="/reminders" element={<Protected><Reminders /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
