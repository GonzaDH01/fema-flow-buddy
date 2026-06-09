import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso · Sistema FEMA" },
      { name: "description", content: "Inicia sesión o crea tu cuenta para acceder al Sistema de Gestión FEMA." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app" });
  }, [loading, session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bienvenido");
    navigate({ to: "/app" });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const redirectUrl = `${window.location.origin}/app`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cuenta creada. Un administrador debe aprobarla antes de poder ingresar.");
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      toast.error("Ingresá tu correo electrónico para recuperar la contraseña.");
      return;
    }

    setResetBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Te enviamos un enlace para crear una nueva contraseña.");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden bg-[image:var(--gradient-primary)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 font-bold backdrop-blur">F</div>
          <span className="font-semibold">FEMA</span>
        </Link>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Plataforma de gestión integral</h2>
          <p className="mt-4 max-w-md text-primary-foreground/85">
            Centraliza tus operaciones, clientes y reportes con una experiencia moderna y segura.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">© {new Date().getFullYear()} FEMA · Todos los derechos reservados</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <h1 className="text-2xl font-bold">Sistema FEMA</h1>
          </div>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Correo electrónico</Label>
                  <Input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Contraseña</Label>
                  <Input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="link" className="h-auto px-0 py-0" disabled={resetBusy} onClick={handlePasswordReset}>
                    {resetBusy ? "Enviando..." : "¿Olvidaste tu contraseña?"}
                  </Button>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Ingresando..." : "Ingresar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="su-name">Nombre completo</Label>
                  <Input id="su-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Correo electrónico</Label>
                  <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-password">Contraseña</Label>
                  <Input id="su-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creando cuenta..." : "Crear cuenta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}