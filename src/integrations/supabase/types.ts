export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clientes_proveedores: {
        Row: {
          condicion_iva: Database["public"]["Enums"]["condicion_iva"]
          created_at: string
          created_by: string
          cuit: string | null
          direccion: string | null
          email: string | null
          id: string
          notas: string | null
          razon_social: string
          telefono: string | null
          tipo: Database["public"]["Enums"]["tipo_persona"]
          updated_at: string
        }
        Insert: {
          condicion_iva?: Database["public"]["Enums"]["condicion_iva"]
          created_at?: string
          created_by?: string
          cuit?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          notas?: string | null
          razon_social: string
          telefono?: string | null
          tipo?: Database["public"]["Enums"]["tipo_persona"]
          updated_at?: string
        }
        Update: {
          condicion_iva?: Database["public"]["Enums"]["condicion_iva"]
          created_at?: string
          created_by?: string
          cuit?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          notas?: string | null
          razon_social?: string
          telefono?: string | null
          tipo?: Database["public"]["Enums"]["tipo_persona"]
          updated_at?: string
        }
        Relationships: []
      }
      factura_items: {
        Row: {
          alicuota_iva: number
          cantidad: number
          created_at: string
          created_by: string
          descripcion: string
          factura_id: string
          id: string
          precio_unitario: number
          producto_id: string | null
          subtotal_neto: number
        }
        Insert: {
          alicuota_iva?: number
          cantidad?: number
          created_at?: string
          created_by?: string
          descripcion: string
          factura_id: string
          id?: string
          precio_unitario?: number
          producto_id?: string | null
          subtotal_neto?: number
        }
        Update: {
          alicuota_iva?: number
          cantidad?: number
          created_at?: string
          created_by?: string
          descripcion?: string
          factura_id?: string
          id?: string
          precio_unitario?: number
          producto_id?: string | null
          subtotal_neto?: number
        }
        Relationships: [
          {
            foreignKeyName: "factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          cliente_proveedor_id: string | null
          concepto: string | null
          created_at: string
          created_by: string
          estado: Database["public"]["Enums"]["estado_factura"]
          fecha_emision: string
          fecha_vencimiento: string | null
          id: string
          iva_total: number
          neto: number
          notas: string | null
          numero: number
          percepciones_total: number
          punto_venta: number
          retenciones_total: number
          tipo: Database["public"]["Enums"]["tipo_factura"]
          total: number
          updated_at: string
        }
        Insert: {
          cliente_proveedor_id?: string | null
          concepto?: string | null
          created_at?: string
          created_by?: string
          estado?: Database["public"]["Enums"]["estado_factura"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          iva_total?: number
          neto?: number
          notas?: string | null
          numero: number
          percepciones_total?: number
          punto_venta?: number
          retenciones_total?: number
          tipo: Database["public"]["Enums"]["tipo_factura"]
          total?: number
          updated_at?: string
        }
        Update: {
          cliente_proveedor_id?: string | null
          concepto?: string | null
          created_at?: string
          created_by?: string
          estado?: Database["public"]["Enums"]["estado_factura"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          iva_total?: number
          neto?: number
          notas?: string | null
          numero?: number
          percepciones_total?: number
          punto_venta?: number
          retenciones_total?: number
          tipo?: Database["public"]["Enums"]["tipo_factura"]
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cliente_proveedor_id_fkey"
            columns: ["cliente_proveedor_id"]
            isOneToOne: false
            referencedRelation: "clientes_proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_gasto"]
          comprobante_numero: string | null
          created_at: string
          created_by: string
          descripcion: string
          fecha: string
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          notas: string | null
          proveedor_id: string | null
          updated_at: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_gasto"]
          comprobante_numero?: string | null
          created_at?: string
          created_by?: string
          descripcion: string
          fecha?: string
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          proveedor_id?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_gasto"]
          comprobante_numero?: string | null
          created_at?: string
          created_by?: string
          descripcion?: string
          fecha?: string
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          notas?: string | null
          proveedor_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      iva: {
        Row: {
          alicuota: number
          base_imponible: number
          created_at: string
          created_by: string
          factura_id: string
          id: string
          importe: number
        }
        Insert: {
          alicuota: number
          base_imponible?: number
          created_at?: string
          created_by?: string
          factura_id: string
          id?: string
          importe?: number
        }
        Update: {
          alicuota?: number
          base_imponible?: number
          created_at?: string
          created_by?: string
          factura_id?: string
          id?: string
          importe?: number
        }
        Relationships: [
          {
            foreignKeyName: "iva_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      percepciones: {
        Row: {
          alicuota: number
          base_imponible: number
          created_at: string
          created_by: string
          factura_id: string
          fecha: string
          id: string
          importe: number
          jurisdiccion: string | null
          tipo: Database["public"]["Enums"]["tipo_percepcion"]
        }
        Insert: {
          alicuota?: number
          base_imponible?: number
          created_at?: string
          created_by?: string
          factura_id: string
          fecha?: string
          id?: string
          importe?: number
          jurisdiccion?: string | null
          tipo: Database["public"]["Enums"]["tipo_percepcion"]
        }
        Update: {
          alicuota?: number
          base_imponible?: number
          created_at?: string
          created_by?: string
          factura_id?: string
          fecha?: string
          id?: string
          importe?: number
          jurisdiccion?: string | null
          tipo?: Database["public"]["Enums"]["tipo_percepcion"]
        }
        Relationships: [
          {
            foreignKeyName: "percepciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_items: {
        Row: {
          alicuota_iva: number
          cantidad: number
          created_at: string
          created_by: string
          descripcion: string
          id: string
          precio_unitario: number
          presupuesto_id: string
          producto_id: string | null
          subtotal_neto: number
        }
        Insert: {
          alicuota_iva?: number
          cantidad?: number
          created_at?: string
          created_by?: string
          descripcion: string
          id?: string
          precio_unitario?: number
          presupuesto_id: string
          producto_id?: string | null
          subtotal_neto?: number
        }
        Update: {
          alicuota_iva?: number
          cantidad?: number
          created_at?: string
          created_by?: string
          descripcion?: string
          id?: string
          precio_unitario?: number
          presupuesto_id?: string
          producto_id?: string | null
          subtotal_neto?: number
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_items_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string
          estado: Database["public"]["Enums"]["estado_presupuesto"]
          factura_id: string | null
          fecha: string
          id: string
          iva_total: number
          notas: string | null
          numero: number
          subtotal_neto: number
          total: number
          updated_at: string
          validez_dias: number
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string
          estado?: Database["public"]["Enums"]["estado_presupuesto"]
          factura_id?: string | null
          fecha?: string
          id?: string
          iva_total?: number
          notas?: string | null
          numero: number
          subtotal_neto?: number
          total?: number
          updated_at?: string
          validez_dias?: number
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string
          estado?: Database["public"]["Enums"]["estado_presupuesto"]
          factura_id?: string | null
          fecha?: string
          id?: string
          iva_total?: number
          notas?: string | null
          numero?: number
          subtotal_neto?: number
          total?: number
          updated_at?: string
          validez_dias?: number
        }
        Relationships: []
      }
      productos: {
        Row: {
          activo: boolean
          alicuota_iva: number
          codigo: string
          created_at: string
          created_by: string
          descripcion: string
          id: string
          notas: string | null
          precio_unitario: number
          stock: number
          stock_minimo: number
          unidad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          alicuota_iva?: number
          codigo: string
          created_at?: string
          created_by?: string
          descripcion: string
          id?: string
          notas?: string | null
          precio_unitario?: number
          stock?: number
          stock_minimo?: number
          unidad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          alicuota_iva?: number
          codigo?: string
          created_at?: string
          created_by?: string
          descripcion?: string
          id?: string
          notas?: string | null
          precio_unitario?: number
          stock?: number
          stock_minimo?: number
          unidad?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      retenciones: {
        Row: {
          alicuota: number
          base_imponible: number
          created_at: string
          created_by: string
          factura_id: string
          fecha: string
          id: string
          importe: number
          jurisdiccion: string | null
          numero_certificado: string | null
          tipo: Database["public"]["Enums"]["tipo_retencion"]
        }
        Insert: {
          alicuota?: number
          base_imponible?: number
          created_at?: string
          created_by?: string
          factura_id: string
          fecha?: string
          id?: string
          importe?: number
          jurisdiccion?: string | null
          numero_certificado?: string | null
          tipo: Database["public"]["Enums"]["tipo_retencion"]
        }
        Update: {
          alicuota?: number
          base_imponible?: number
          created_at?: string
          created_by?: string
          factura_id?: string
          fecha?: string
          id?: string
          importe?: number
          jurisdiccion?: string | null
          numero_certificado?: string | null
          tipo?: Database["public"]["Enums"]["tipo_retencion"]
        }
        Relationships: [
          {
            foreignKeyName: "retenciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "contador" | "operador"
      categoria_gasto:
        | "servicios"
        | "alquiler"
        | "sueldos"
        | "impuestos"
        | "insumos"
        | "marketing"
        | "transporte"
        | "mantenimiento"
        | "otros"
      condicion_iva:
        | "responsable_inscripto"
        | "monotributo"
        | "exento"
        | "consumidor_final"
        | "no_responsable"
      estado_factura: "borrador" | "emitida" | "pagada" | "anulada"
      estado_presupuesto:
        | "borrador"
        | "enviado"
        | "aprobado"
        | "rechazado"
        | "convertido"
      metodo_pago:
        | "efectivo"
        | "transferencia"
        | "debito"
        | "credito"
        | "cheque"
        | "otro"
      tipo_factura: "A" | "B" | "C" | "E" | "M"
      tipo_percepcion: "iva" | "iibb"
      tipo_persona: "cliente" | "proveedor" | "ambos"
      tipo_retencion: "ganancias" | "iva" | "iibb" | "suss"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "contador", "operador"],
      categoria_gasto: [
        "servicios",
        "alquiler",
        "sueldos",
        "impuestos",
        "insumos",
        "marketing",
        "transporte",
        "mantenimiento",
        "otros",
      ],
      condicion_iva: [
        "responsable_inscripto",
        "monotributo",
        "exento",
        "consumidor_final",
        "no_responsable",
      ],
      estado_factura: ["borrador", "emitida", "pagada", "anulada"],
      estado_presupuesto: [
        "borrador",
        "enviado",
        "aprobado",
        "rechazado",
        "convertido",
      ],
      metodo_pago: [
        "efectivo",
        "transferencia",
        "debito",
        "credito",
        "cheque",
        "otro",
      ],
      tipo_factura: ["A", "B", "C", "E", "M"],
      tipo_percepcion: ["iva", "iibb"],
      tipo_persona: ["cliente", "proveedor", "ambos"],
      tipo_retencion: ["ganancias", "iva", "iibb", "suss"],
    },
  },
} as const
