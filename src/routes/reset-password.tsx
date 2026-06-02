import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Restablecer contraseña · Sistema FEMA" },
      { name: "description", content: "Define una nueva contraseña para tu cuenta FEMA." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada");
    navigate({ to: "/app" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-lg border bg-card p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Nueva contraseña</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ingresa tu nueva contraseña para acceder al sistema.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Contraseña</Label>
          <Input id="new-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Guardando..." : "Actualizar contraseña"}
        </Button>
      </form>
    </div>
  );
}