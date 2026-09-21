import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Send, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export type Mensaje = {
  id: string;
  autor_id: string | null;
  autor_nombre: string | null;
  destinatario_id: string | null;
  texto: string;
  prioridad: string;
  resuelto: boolean;
  created_at: string;
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function useMensajes() {
  return useQuery({
    queryKey: ["fema_mensajes"],
    queryFn: async () => {
      const { data } = await supabase.from("fema_mensajes").select("*").order("created_at", { ascending: false });
      return ((data ?? []) as any[]) as Mensaje[];
    },
  });
}

function useUsuarios() {
  return useQuery({
    queryKey: ["fema_usuarios_min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,email").eq("aprobado", true);
      return ((data ?? []) as any[]).map((p) => ({
        id: p.id as string,
        nombre: (p.full_name as string | null) ?? (p.email as string | null) ?? "Usuario",
      }));
    },
  });
}

export function MensajesPanel() {
  const qc = useQueryClient();
  const { profile } = useProfile();
  const { data: mensajes, isLoading } = useMensajes();
  const { data: usuarios } = useUsuarios();
  const [texto, setTexto] = useState("");
  const [para, setPara] = useState("todos");
  const [prioridad, setPrioridad] = useState("normal");
  const [filtro, setFiltro] = useState("pendientes");

  const nombre = (id: string | null) =>
    id ? (usuarios ?? []).find((u) => u.id === id)?.nombre ?? "Usuario" : "Todos";

  const invalidar = () => qc.invalidateQueries({ queryKey: ["fema_mensajes"] });

  const enviar = async () => {
    if (!texto.trim()) return toast.error("Escribí el mensaje");
    if (!profile) return;
    const { error } = await (supabase.from("fema_mensajes") as any).insert({
      autor_id: profile.id,
      autor_nombre: profile.full_name ?? profile.email,
      destinatario_id: para === "todos" ? null : para,
      texto: texto.trim(),
      prioridad,
    });
    if (error) return toast.error(error.message);
    toast.success("Mensaje enviado");
    setTexto("");
    invalidar();
  };

  const resolver = async (m: Mensaje) => {
    const { error } = await (supabase.from("fema_mensajes") as any)
      .update({
        resuelto: !m.resuelto,
        resuelto_por: m.resuelto ? null : profile?.id ?? null,
        resuelto_at: m.resuelto ? null : new Date().toISOString(),
      })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    invalidar();
  };

  const eliminar = async (m: Mensaje) => {
    if (!confirm("¿Eliminar este mensaje?")) return;
    const { error } = await supabase.from("fema_mensajes").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Mensaje eliminado");
    invalidar();
  };

  const lista = (mensajes ?? []).filter((m) =>
    filtro === "todos" ? true : filtro === "pendientes" ? !m.resuelto : m.resuelto,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="grid gap-2">
            <Label>Mensaje o recordatorio para el equipo</Label>
            <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej: Acordate de pedirle la factura a Ruffiner antes del viernes" />
          </div>
          <div className="grid gap-2">
            <Label>Para</Label>
            <Select value={para} onValueChange={setPara}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(usuarios ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Prioridad</Label>
            <div className="flex gap-2">
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={enviar}><Send className="mr-2 h-4 w-4" /> Enviar</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {[["pendientes", "Pendientes"], ["resueltos", "Resueltos"], ["todos", "Todos"]].map(([v, l]) => (
          <Button key={v} size="sm" variant={filtro === v ? "default" : "outline"} onClick={() => setFiltro(v)}>
            {l}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Cargando mensajes…</div>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <MessageSquare className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No hay mensajes en esta vista.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((m) => (
            <div key={m.id}
              className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                m.resuelto ? "border-border bg-muted/40" : "border-border bg-card"
              }`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {m.prioridad === "urgente" ? (
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-[10px] text-destructive">
                      Urgente
                    </Badge>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">
                    {m.autor_nombre ?? "Usuario"} → {nombre(m.destinatario_id)} · {fechaHora(m.created_at)}
                  </span>
                </div>
                <div className={`mt-0.5 text-sm ${m.resuelto ? "text-muted-foreground line-through" : "font-medium"}`}>
                  {m.texto}
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button size="sm" variant={m.resuelto ? "ghost" : "outline"} onClick={() => resolver(m)}>
                  {m.resuelto ? <><Undo2 className="mr-1 h-3.5 w-3.5" /> Reabrir</> : <><Check className="mr-1 h-3.5 w-3.5" /> Resuelto</>}
                </Button>
                {m.autor_id === profile?.id || profile?.isAdmin ? (
                  <Button size="icon" variant="ghost" onClick={() => eliminar(m)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
