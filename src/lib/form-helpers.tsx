import { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function FormField({ label, children, error, required }: {
  label: string; children: ReactNode; error?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && " *"}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}