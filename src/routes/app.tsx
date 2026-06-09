import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { YearProvider } from "@/lib/year-context";
import { ProfileProvider } from "@/lib/profile-context";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <ProfileProvider>
      <YearProvider>
        <AppShell />
      </YearProvider>
    </ProfileProvider>
  );
}