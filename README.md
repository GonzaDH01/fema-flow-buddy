# FEMA — Sistema de Gestión Agropecuaria

Plataforma integral de gestión para operaciones agropecuarias FEMA construida sobre Lovable Cloud.

## Stack
- **Frontend**: TanStack Start v1 + React 19 + TypeScript estricto + Vite 7
- **Estilos**: Tailwind v4 con tokens semánticos `oklch` (tema dark con primario verde) en `src/styles.css`
- **UI**: shadcn/ui + Lucide icons + Sonner toasts
- **Datos**: TanStack Query + react-hook-form + zod
- **Backend**: Lovable Cloud (Supabase) con RLS por usuario
- **IA**: Lovable AI Gateway (Google Gemini 2.5 Flash) para OCR de facturas
- **Exportación**: SheetJS (xlsx)

## Módulos

| Sección | Ruta | Descripción |
|---|---|---|
| Dashboard | `/app` | KPIs anuales + gráfico de cash flow |
| Cash Flow | `/app/cashflow` | Detalle mensual ingresos vs egresos |
| Facturas | `/app/facturas` | Ventas con IVA discriminado (tipo A) |
| Estimaciones | `/app/estimaciones` | Proyección de cobros |
| Clientes | `/app/clientes` | Cartera de clientes (CUIT, IVA) |
| Compras | `/app/compras` | Egresos con categoría agro |
| Combustible | `/app/combustible` | Cargas: litros, ITC, CO2 |
| Proveedores | `/app/proveedores` | Catálogo por categoría |
| Empleados | `/app/empleados` | Personal + sueldo bruto |
| Impuestos | `/app/impuestos` | IVA, IIBB y Ganancias mensuales |
| Presupuestos | `/app/presupuestos` | Presupuestos por cliente |
| Medios de pago | `/app/medios` | Catálogo de medios |
| OCR | `/app/ocr` | Análisis IA de facturas (JPG/PNG/WebP/PDF) |
| Auditoría | `/app/auditoria` | Log de operaciones sobre tablas críticas |

## Seguridad
- RLS habilitado en todas las tablas `fema_*` (cada usuario solo ve sus propios datos)
- Trigger de auditoría sobre facturas (venta/compra), empleados y sueldos
- Endpoint OCR público con CORS y validación zod de la entrada

## Selector global de año
El header tiene un selector de año (2024–2027) que se persiste en `localStorage`
y filtra Dashboard, Cash Flow, Facturas, Compras, Combustible, Impuestos y la exportación a Excel.

## Desarrollo
```bash
bun install
bun run dev
```

## Despliegue
Publicación desde la UI de Lovable. URL estable de preview/prod: `project--{id}.lovable.app`.