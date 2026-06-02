import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/app/reportes")({
  component: () => (
    <div className="p-8">
      <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
      <p className="mt-1 text-muted-foreground">Indicadores y reportes operativos FEMA.</p>
      <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-16 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Módulo en preparación.</p>
      </div>
    </div>
  ),
});