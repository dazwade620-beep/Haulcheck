import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Truck, Users, FileWarning, FolderCheck, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { to: "/vehicles", label: "Vehicles", icon: Truck, id: "vehicles" },
  { to: "/drivers", label: "Drivers", icon: Users, id: "drivers" },
  { to: "/defects", label: "Defects", icon: FileWarning, id: "defects" },
  { to: "/documents", label: "Documents", icon: FolderCheck, id: "documents" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const NavItems = () => (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          data-testid={`nav-${item.id}`}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all duration-200 border-l-2",
              isActive
                ? "bg-slate-800 text-white border-white"
                : "text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60"
            )
          }
        >
          <item.icon size={20} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 text-white sticky top-0 h-screen">
        <div className="px-6 py-6 flex items-center gap-2 border-b border-slate-800">
          <Truck size={26} className="text-white" />
          <div>
            <p className="font-heading font-black text-lg leading-none tracking-tight">HAULCHECK</p>
            <p className="text-[10px] tracking-[0.25em] text-slate-400 uppercase mt-1">Compliance</p>
          </div>
        </div>
        <div className="flex-1 py-4"><NavItems /></div>
        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            data-testid="logout-button"
            onClick={logout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors w-full px-2 py-2"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between bg-slate-900 text-white px-4 py-3 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Truck size={22} />
            <span className="font-heading font-black tracking-tight">HAULCHECK</span>
          </div>
          <button data-testid="mobile-menu-toggle" onClick={() => setOpen(!open)}>
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>
        {open && (
          <div className="md:hidden bg-slate-900 text-white pb-4">
            <NavItems />
            <button
              data-testid="mobile-logout-button"
              onClick={logout}
              className="flex items-center gap-2 text-sm text-slate-400 px-4 py-3"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}

        <main className="flex-1 p-6 sm:p-8 md:p-10 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
