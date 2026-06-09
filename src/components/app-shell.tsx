import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, TrendingUp, FileText, Target, Users, ShoppingCart, Fuel,
  Truck, UserCheck, Calculator, ClipboardList, CreditCard, Shield, LogOut,
  Download, Menu, ScanLine, UserCog,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile-context";
import { useYear } from "@/lib/year-context";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { exportarExcelCompleto } from "@/lib/exportar-excel";

type NavItem = { to: string; label: string; icon: any; exact?: boolean; key: string };
const sections: { title: string; items: NavItem[] }[] = [
  {
    title: "Principal",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true, key: "dashboard" },
      { to: "/app/cashflow", label: "Cash Flow", icon: TrendingUp, key: "cashflow" },
    ],
  },
  {
    title: "Ingresos",
    items: [
      { to: "/app/facturas", label: "Facturas", icon: FileText, key: "facturas" },
      { to: "/app/estimaciones", label: "Estimaciones", icon: Target, key: "estimaciones" },
      { to: "/app/clientes", label: "Clientes", icon: Users, key: "clientes" },
    ],
  },
  {
    title: "Egresos",
    items: [
      { to: "/app/compras", label: "Compras", icon: ShoppingCart, key: "compras" },
      { to: "/app/combustible", label: "Combustible", icon: Fuel, key: "combustible" },
      { to: "/app/proveedores", label: "Proveedores", icon: Truck, key: "proveedores" },
    ],
  },
  {
    title: "RRHH",
    items: [
      { to: "/app/empleados", label: "Empleados", icon: UserCheck, key: "empleados" },
      { to: "/app/impuestos", label: "Impuestos", icon: Calculator, key: "impuestos" },
    ],
  },
  {
    title: "Ventas",
    items: [
      { to: "/app/presupuestos", label: "Presupuestos", icon: ClipboardList, key: "presupuestos" },
      { to: "/app/medios", label: "Medios de Pago", icon: CreditCard, key: "medios" },
    ],
  },
  {
    title: "Herramientas",
    items: [
      { to: "/app/ocr", label: "OCR Facturas", icon: ScanLine, key: "ocr" },
      { to: "/app/auditoria", label: "Auditoría", icon: Shield, key: "auditoria" },
    ],
  },
  {
    title: "Administración",
    items: [
      { to: "/app/usuarios", label: "Usuarios", icon: UserCog, key: "usuarios" },
    ],
  },
];

const titleByPath: Record<string, string> = {
  "/app": "Dashboard",
  "/app/cashflow": "Cash Flow",
  "/app/facturas": "Facturas de Venta",
  "/app/estimaciones": "Estimaciones",
  "/app/clientes": "Clientes",
  "/app/compras": "Compras",
  "/app/combustible": "Combustible",
  "/app/proveedores": "Proveedores",
  "/app/empleados": "Empleados",
  "/app/impuestos": "Impuestos",
  "/app/presupuestos": "Presupuestos",
  "/app/medios": "Medios de Pago",
  "/app/ocr": "OCR de Facturas",
  "/app/auditoria": "Auditoría / Reportes Contables",
  "/app/usuarios": "Gestión de Usuarios",
};

export function AppShell() {
  const { user, signOut } = useAuth();
  const { profile, loading: loadingProfile } = useProfile();
  const { year, setYear, years } = useYear();
  const navigate = useNavigate();
  const loc = useLocation();
  const [openMobile, setOpenMobile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const title = titleByPath[loc.pathname] ?? "FEMA";

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    const t = toast.loading("Generando Excel...");
    try {
      await exportarExcelCompleto(year, user.id);
      toast.success("Excel generado", { id: t });
    } catch (e: any) {
      toast.error(e.message ?? "Error al exportar", { id: t });
    } finally {
      setExporting(false);
    }
  };

  const allowed = (key: string) => {
    if (!profile) return false;
    if (profile.isAdmin) return true;
    return profile.modulos_permitidos.includes(key);
  };

  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => allowed(i.key)) }))
    .filter((s) => s.items.length > 0);

  const Sidebar = (
    <aside className="flex h-full w-[220px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[image:var(--gradient-primary)] font-bold text-primary-foreground">
          F
        </div>
        <div>
          <div className="font-semibold leading-tight">FEMA</div>
          <div className="text-[11px] text-sidebar-foreground/70">Gestión Agropecuaria</div>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {visibleSections.map((s) => (
          <div key={s.title}>
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {s.title}
            </div>
            <div className="space-y-0.5">
              {s.items.map((n) => {
                const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpenMobile(false)}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-muted font-medium text-primary"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <n.icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 truncate text-xs text-sidebar-foreground/70">{user?.email}</div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/85 hover:bg-sidebar-accent"
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
  );

  if (!loadingProfile && profile && !profile.aprobado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Cuenta pendiente de aprobación</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta ({user?.email}) fue creada correctamente. Un administrador debe aprobarla y asignarte los módulos antes de poder ingresar.
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:flex">{Sidebar}</div>
      {openMobile && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpenMobile(false)}>
          <div className="absolute inset-0 bg-background/70 backdrop-blur" />
          <div className="absolute left-0 top-0 h-full" onClick={(e) => e.stopPropagation()}>
            {Sidebar}
          </div>
        </div>
      )}
      <main className="flex min-h-screen flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={() => setOpenMobile(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleExport} disabled={exporting}>
              <Download className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
          </div>
        </header>
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}