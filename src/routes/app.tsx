import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { YearProvider } from "@/lib/year-context";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <YearProvider>
      <AppShell />
    </YearProvider>
  );
}