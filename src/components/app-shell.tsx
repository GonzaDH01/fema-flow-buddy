import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, LogOut, Package, FileText, BarChart3, ScanLine, ShieldCheck, ClipboardList, Receipt } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMyRoles } from "@/lib/use-roles";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/clientes", label: "Clientes / Proveedores", icon: Users },
  { to: "/facturas", label: "Facturas", icon: FileText },
  { to: "/presupuestos", label: "Presupuestos", icon: ClipboardList },
  { to: "/gastos", label: "Gastos", icon: Receipt },
  { to: "/ocr", label: "OCR Comprobantes", icon: ScanLine },
  { to: "/productos", label: "Productos", icon: Package },
  { to: "/reportes", label: "Reportes", icon: BarChart3 },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const { data: roles = [] } = useMyRoles();
  const isAdmin = roles.includes("admin");
  const items: NavItem[] = isAdmin
    ? [...nav, { to: "/usuarios", label: "Usuarios", icon: ShieldCheck }]
    : nav;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-6 py-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[image:var(--gradient-primary)] font-bold text-primary-foreground">
            F
          </div>
          <div>
            <div className="font-semibold">FEMA</div>
            <div className="text-xs text-sidebar-foreground/70">Gestión</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((n) => {
            const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[var(--shadow-md)]"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 truncate text-xs text-sidebar-foreground/70">{user?.email}</div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}