import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nueva contraseña · Sistema FEMA" },
      { name: "description", content: "Crea una nueva contraseña para recuperar el acceso al Sistema FEMA." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [validRecoveryLink, setValidRecoveryLink] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const isRecovery = params.get("type") === "recovery";
    setValidRecoveryLink(isRecovery);

    if (!isRecovery) {
      toast.error("Abrí esta pantalla desde el enlace de recuperación enviado por correo.");
    }
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada. Ya podés ingresar.");
    navigate({ to: "/app" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">F</div>
          <span className="font-semibold text-foreground">FEMA</span>
        </Link>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Crear nueva contraseña</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ingresá una contraseña nueva para recuperar el acceso.</p>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input id="new-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <Input id="confirm-password" type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !validRecoveryLink}>
            {busy ? "Guardando..." : "Guardar contraseña"}
          </Button>
        </form>

        <Button asChild variant="link" className="mt-4 w-full">
          <Link to="/auth">Volver al inicio de sesión</Link>
        </Button>
      </div>
    </div>
  );
}