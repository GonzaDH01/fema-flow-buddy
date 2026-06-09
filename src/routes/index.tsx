import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, ShieldCheck, BarChart3, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sistema de Gestión FEMA" },
      { name: "description", content: "Gestiona clientes, operaciones y reportes de FEMA desde una plataforma moderna y segura." },
      { property: "og:title", content: "Sistema de Gestión FEMA" },
      { property: "og:description", content: "Plataforma de gestión integral FEMA." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-[image:var(--gradient-subtle)]">
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground font-bold shadow-[var(--shadow-md)]">
            F
          </div>
          <span className="font-semibold tracking-tight text-foreground">FEMA</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost">Iniciar sesión</Button>
          </Link>
          <Link to="/app">
            <Button>Entrar al sistema</Button>
          </Link>
        </nav>
      </header>

      <main className="container mx-auto px-6">
        <section className="mx-auto max-w-3xl py-20 text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-sm)]">
            Plataforma interna · v1.0
          </span>
          <h1 className="mt-6 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Sistema de Gestión <span className="bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">FEMA</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Centraliza clientes, operaciones y reportes en una sola plataforma moderna, rápida y segura.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/app">
              <Button size="lg" className="gap-2">
                Acceder al sistema <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: LayoutDashboard, title: "Dashboard", desc: "Vista general del negocio en tiempo real." },
            { icon: Users, title: "Clientes", desc: "Gestiona toda tu base de clientes en un solo lugar." },
            { icon: BarChart3, title: "Reportes", desc: "Métricas e indicadores claros para decidir mejor." },
            { icon: ShieldCheck, title: "Seguro", desc: "Acceso protegido con autenticación y roles." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
