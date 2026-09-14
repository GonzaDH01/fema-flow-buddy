import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Trash2, Camera, IdCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CarnetsEmpleado } from "@/components/empleado-carnets";

const BUCKET = "empleados-doc";
export const FORMAS_PAGO = [
  "Transferencia bancaria",
  "Efectivo",
  "Cheque",
  "Echeq",
  "Mercado Pago",
  "Factura / Monotributo",
  "Otro",
];
export const FRECUENCIAS = [
  "Semanal",
  "Quincenal",
  "Mensual",
  "Por jornal",
  "Por hora",
  "Por trabajo",
  "Otra",
];
export const etiquetaImporte = (frecuencia: string) => {
  switch (frecuencia) {
    case "Semanal":
      return "Importe por semana ($)";
    case "Quincenal":
      return "Importe por quincena ($)";
    case "Mensual":
      return "Importe por mes ($)";
    case "Por jornal":
      return "Importe por jornal ($)";
    case "Por hora":
      return "Importe por hora ($)";
    case "Por trabajo":
      return "Importe por trabajo ($)";
    default:
      return "Importe acordado ($)";
  }
};
export const FUNCIONES_EMPLEADO = [
  "Socio Gerente",
  "Tractorista",
  "Camionero",
  "Operador de bolsera",
  "Operador de picadora",
  "Operador de máquina",
  "Transportista",
  "Mecánico",
  "Capataz",
  "Peón",
  "Administrativo",
  "Otro",
];

export const TIPOS_CONTRATACION = ["Mensualizado", "Jornalizado", "Por hora", "Monotributista", "Temporario"];

export type EmpleadoFicha = {
  id: string;
  nombre: string;
  funcion?: string | null;
  telefono?: string | null;
  email?: string | null;
  domicilio?: string | null;
  fecha_ingreso?: string | null;
  tipo_contratacion?: string | null;
  sueldo_bruto?: number | null;
  valor_hora?: number | null;
  contacto_emergencia?: string | null;
  obra_social?: string | null;
  activo?: boolean | null;
  dni: string | null;
  cuil: string | null;
  fecha_nacimiento?: string | null;
  dni_frente_path?: string | null;
  dni_dorso_path?: string | null;
  foto_path?: string | null;
  forma_pago?: string | null;
  frecuencia_pago?: string | null;
  banco?: string | null;
  cbu?: string | null;
  alias_cbu?: string | null;
  titular_cuenta?: string | null;
  importe_periodo?: number | null;
  tareas?: string | null;
  maquinaria?: string | null;
  observaciones: string | null;
};

export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (vivo) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      vivo = false;
    };
  }, [path]);
  return url;
}

function CampoImagen({
  label,
  empleadoId,
  path,
  onChange,
}: {
  label: string;
  empleadoId: string;
  path: string | null | undefined;
  onChange: (p: string | null) => void;
}) {
  const url = useSignedUrl(path);
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const subir = async (file?: File | null) => {
    if (!file) return;
    setSubiendo(true);
    const ext = file.name.split(".").pop() || "jpg";
    const nuevo = `${empleadoId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(nuevo, file, { upsert: false });
    setSubiendo(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    onChange(nuevo);
    toast.success(`${label} cargado`);
  };

  const quitar = async () => {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-contain" />
        ) : (
          <IdCard className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => subir(e.target.files?.[0])}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => subir(e.target.files?.[0])}
        />
        <Button size="sm" variant="outline" className="h-8" disabled={subiendo} onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1 size-3.5" /> Subir
        </Button>
        <Button size="sm" variant="outline" className="h-8" disabled={subiendo} onClick={() => camRef.current?.click()}>
          <Camera className="mr-1 size-3.5" /> Cámara
        </Button>
        {path && (
          <Button size="icon" variant="outline" className="size-8 text-destructive" onClick={quitar}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function FichaEmpleadoDialog({
  empleado,
  onClose,
}: {
  empleado: EmpleadoFicha;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: equipos } = useQuery({
    queryKey: ["fema_activos_min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fema_activos")
        .select("id,nombre,tipo,marca,modelo")
        .order("nombre");
      if (error) throw error;
      return data as { id: string; nombre: string; tipo: string; marca: string | null; modelo: string | null }[];
    },
  });
  const [v, setV] = useState({
    nombre: empleado.nombre ?? "",
    telefono: empleado.telefono ?? "",
    email: empleado.email ?? "",
    domicilio: empleado.domicilio ?? "",
    fecha_ingreso: empleado.fecha_ingreso ?? "",
    tipo_contratacion: empleado.tipo_contratacion ?? "Mensualizado",
    sueldo_bruto: String(empleado.sueldo_bruto ?? 0),
    valor_hora: String(empleado.valor_hora ?? 0),
    contacto_emergencia: empleado.contacto_emergencia ?? "",
    obra_social: empleado.obra_social ?? "",
    activo: empleado.activo === false ? "Inactivo" : "Activo",
    funcion: empleado.funcion ?? "Tractorista",
    dni: empleado.dni ?? "",
    cuil: empleado.cuil ?? "",
    fecha_nacimiento: empleado.fecha_nacimiento ?? "",
    forma_pago: empleado.forma_pago ?? "Transferencia bancaria",
    frecuencia_pago: empleado.frecuencia_pago ?? "Semanal",
    banco: empleado.banco ?? "",
    cbu: empleado.cbu ?? "",
    alias_cbu: empleado.alias_cbu ?? "",
    titular_cuenta: empleado.titular_cuenta ?? "",
    tareas: empleado.tareas ?? "",
    maquinaria: empleado.maquinaria ?? "",
    observaciones: empleado.observaciones ?? "",
  });
  const [paths, setPaths] = useState({
    dni_frente_path: empleado.dni_frente_path ?? null,
    dni_dorso_path: empleado.dni_dorso_path ?? null,
    foto_path: empleado.foto_path ?? null,
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  const guardarPath = async (k: keyof typeof paths, p: string | null) => {
    setPaths((s) => ({ ...s, [k]: p }));
    const patch =
      k === "dni_frente_path" ? { dni_frente_path: p } : k === "dni_dorso_path" ? { dni_dorso_path: p } : { foto_path: p };
    await supabase.from("fema_empleados").update(patch).eq("id", empleado.id);
    qc.invalidateQueries({ queryKey: ["fema_empleados"] });
  };

  const guardar = async () => {
    setGuardando(true);
    const { error } = await supabase
      .from("fema_empleados")
      .update({
        nombre: v.nombre.trim() || empleado.nombre,
        telefono: v.telefono || null,
        email: v.email || null,
        domicilio: v.domicilio || null,
        fecha_ingreso: v.fecha_ingreso || null,
        tipo_contratacion: v.tipo_contratacion || null,
        sueldo_bruto: Number(v.sueldo_bruto || 0),
        valor_hora: Number(v.valor_hora || 0),
        contacto_emergencia: v.contacto_emergencia || null,
        obra_social: v.obra_social || null,
        activo: v.activo === "Activo",
        funcion: v.funcion || null,
        cargo: v.funcion || null,
        dni: v.dni || null,
        cuil: v.cuil || null,
        fecha_nacimiento: v.fecha_nacimiento || null,
        forma_pago: v.forma_pago || null,
        frecuencia_pago: v.frecuencia_pago || null,
        banco: v.banco || null,
        cbu: v.cbu || null,
        alias_cbu: v.alias_cbu || null,
        titular_cuenta: v.titular_cuenta || null,
        tareas: v.tareas || null,
        maquinaria: v.maquinaria || null,
        observaciones: v.observaciones || null,
      })
      .eq("id", empleado.id);
    setGuardando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ficha actualizada");
    qc.invalidateQueries({ queryKey: ["fema_empleados"] });
    qc.invalidateQueries({ queryKey: ["fema_empleados_min"] });
    onClose();
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Ficha de {empleado.nombre}</DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="documentos">Documentación</TabsTrigger>
          <TabsTrigger value="pago">Forma de pago</TabsTrigger>
          <TabsTrigger value="trabajo">Tareas y maquinaria</TabsTrigger>
          <TabsTrigger value="carnets">Carnets</TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="mt-4 space-y-4">
          <div className="space-y-3">
            <h4 className="border-b pb-2 text-sm font-semibold">Datos personales</h4>
            <div className="space-y-1.5">
              <Label>Nombre y apellido</Label>
              <Input value={v.nombre} onChange={(e) => set("nombre", e.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={v.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={v.email} onChange={(e) => set("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Domicilio</Label>
              <Input value={v.domicilio} onChange={(e) => set("domicilio", e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="border-b pb-2 text-sm font-semibold">Datos laborales</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Fecha de ingreso</Label>
                <Input type="date" value={v.fecha_ingreso} onChange={(e) => set("fecha_ingreso", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de contratación</Label>
                <Select value={v.tipo_contratacion} onValueChange={(x) => set("tipo_contratacion", x)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONTRATACION.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sueldo básico</Label>
                <Input type="number" value={v.sueldo_bruto} onChange={(e) => set("sueldo_bruto", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor hora</Label>
                <Input type="number" value={v.valor_hora} onChange={(e) => set("valor_hora", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contacto de emergencia</Label>
                <Input
                  value={v.contacto_emergencia}
                  onChange={(e) => set("contacto_emergencia", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Obra social</Label>
                <Input value={v.obra_social} onChange={(e) => set("obra_social", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={v.activo} onValueChange={(x) => set("activo", x)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Activo">Activo</SelectItem>
                    <SelectItem value="Inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>


        <TabsContent value="carnets" className="mt-4">
          <CarnetsEmpleado empleadoId={empleado.id} />
        </TabsContent>

        <TabsContent value="documentos" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <CampoImagen
              label="DNI — frente"
              empleadoId={empleado.id}
              path={paths.dni_frente_path}
              onChange={(p) => guardarPath("dni_frente_path", p)}
            />
            <CampoImagen
              label="DNI — dorso"
              empleadoId={empleado.id}
              path={paths.dni_dorso_path}
              onChange={(p) => guardarPath("dni_dorso_path", p)}
            />
            <CampoImagen
              label="Foto del empleado"
              empleadoId={empleado.id}
              path={paths.foto_path}
              onChange={(p) => guardarPath("foto_path", p)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>DNI</Label>
              <Input value={v.dni} onChange={(e) => set("dni", e.target.value)} placeholder="00.000.000" />
            </div>
            <div className="space-y-1.5">
              <Label>CUIL</Label>
              <Input value={v.cuil} onChange={(e) => set("cuil", e.target.value)} placeholder="20-00000000-0" />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de nacimiento</Label>
              <Input type="date" value={v.fecha_nacimiento} onChange={(e) => set("fecha_nacimiento", e.target.value)} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pago" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Forma de pago</Label>
              <Select value={v.forma_pago} onValueChange={(x) => set("forma_pago", x)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGO.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frecuencia de pago</Label>
              <Select value={v.frecuencia_pago} onValueChange={(x) => set("frecuencia_pago", x)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRECUENCIAS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={v.banco} onChange={(e) => set("banco", e.target.value)} placeholder="Banco" />
            </div>
            <div className="space-y-1.5">
              <Label>Titular de la cuenta</Label>
              <Input value={v.titular_cuenta} onChange={(e) => set("titular_cuenta", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>CBU / CVU</Label>
              <Input value={v.cbu} onChange={(e) => set("cbu", e.target.value)} placeholder="22 dígitos" />
            </div>
            <div className="space-y-1.5">
              <Label>Alias</Label>
              <Input value={v.alias_cbu} onChange={(e) => set("alias_cbu", e.target.value)} placeholder="alias.banco" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="trabajo" className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Función que realiza</Label>
            <Select value={v.funcion} onValueChange={(x) => set("funcion", x)}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí la función" />
              </SelectTrigger>
              <SelectContent>
                {FUNCIONES_EMPLEADO.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Equipos que maneja</Label>
            {!equipos?.length ? (
              <p className="text-xs text-muted-foreground">
                Todavía no hay máquinas cargadas en Productos → Inventario.
              </p>
            ) : (
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-border p-2 md:grid-cols-2">
                {equipos.map((eq) => {
                  const etiqueta = [eq.nombre, eq.marca, eq.modelo].filter(Boolean).join(" ");
                  const lista = v.maquinaria.split(",").map((s) => s.trim()).filter(Boolean);
                  const activo = lista.includes(etiqueta);
                  return (
                    <label key={eq.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60">
                      <input
                        type="checkbox"
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={activo}
                        onChange={() => {
                          const next = activo ? lista.filter((x) => x !== etiqueta) : [...lista, etiqueta];
                          set("maquinaria", next.join(", "));
                        }}
                      />
                      <span className="truncate">
                        {etiqueta}
                        <span className="ml-1 text-xs text-muted-foreground">{eq.tipo}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tareas que realiza</Label>
            <Textarea
              rows={4}
              value={v.tareas}
              onChange={(e) => set("tareas", e.target.value)}
              placeholder="Picado, embolsado, mantenimiento, traslados…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Maquinaria que utiliza</Label>
            <Textarea
              rows={3}
              value={v.maquinaria}
              onChange={(e) => set("maquinaria", e.target.value)}
              placeholder="Picadora John Deere 7500, tractor, embolsadora…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea rows={3} value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          Guardar cambios
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function FotoEmpleado({ path, nombre }: { path?: string | null; nombre: string }) {
  const url = useSignedUrl(path);
  return (
    <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {url ? <img src={url} alt={nombre} className="h-full w-full object-cover" /> : nombre.slice(0, 2).toUpperCase()}
    </div>
  );
}

export { Dialog as FichaDialog };
