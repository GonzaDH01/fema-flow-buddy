import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";

export const Route = createFileRoute("/app/productos")({
  component: () => (
    <div className="p-8">
      <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
      <p className="mt-1 text-muted-foreground">Gestión de productos e inventario FEMA.</p>
      <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-16 text-center">
        <Package className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Módulo en preparación. Disponible en la próxima iteración.</p>
      </div>
    </div>
  ),
});