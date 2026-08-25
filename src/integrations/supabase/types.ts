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
      empleados: {
        Row: {
          activo: boolean
          apellido: string
          cargo: string | null
          created_at: string
          created_by: string
          cuil: string | null
          email: string | null
          fecha_ingreso: string
          id: string
          legajo: string
          nombre: string
          notas: string | null
          sueldo_basico: number
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          apellido: string
          cargo?: string | null
          created_at?: string
          created_by?: string
          cuil?: string | null
          email?: string | null
          fecha_ingreso?: string
          id?: string
          legajo: string
          nombre: string
          notas?: string | null
          sueldo_basico?: number
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          apellido?: string
          cargo?: string | null
          created_at?: string
          created_by?: string
          cuil?: string | null
          email?: string | null
          fecha_ingreso?: string
          id?: string
          legajo?: string
          nombre?: string
          notas?: string | null
          sueldo_basico?: number
          telefono?: string | null
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
      fema_auditoria: {
        Row: {
          created_at: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          id: string
          operacion: string
          registro_id: string | null
          tabla: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: string
          operacion: string
          registro_id?: string | null
          tabla: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: string
          operacion?: string
          registro_id?: string | null
          tabla?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fema_bonos_campana: {
        Row: {
          anio: number
          base_facturado: number
          campana: string
          created_at: string
          criterio: string
          empleado_id: string | null
          estado: string
          hectareas: number
          id: string
          metros_bolsa: number
          monto_fijo: number
          monto_total: number
          observaciones: string | null
          porcentaje: number
          updated_at: string
          user_id: string
          valor_ha: number
          valor_metro: number
        }
        Insert: {
          anio?: number
          base_facturado?: number
          campana: string
          created_at?: string
          criterio?: string
          empleado_id?: string | null
          estado?: string
          hectareas?: number
          id?: string
          metros_bolsa?: number
          monto_fijo?: number
          monto_total?: number
          observaciones?: string | null
          porcentaje?: number
          updated_at?: string
          user_id?: string
          valor_ha?: number
          valor_metro?: number
        }
        Update: {
          anio?: number
          base_facturado?: number
          campana?: string
          created_at?: string
          criterio?: string
          empleado_id?: string | null
          estado?: string
          hectareas?: number
          id?: string
          metros_bolsa?: number
          monto_fijo?: number
          monto_total?: number
          observaciones?: string | null
          porcentaje?: number
          updated_at?: string
          user_id?: string
          valor_ha?: number
          valor_metro?: number
        }
        Relationships: [
          {
            foreignKeyName: "fema_bonos_campana_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "fema_empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_caja_mov: {
        Row: {
          concepto: string | null
          created_at: string
          cuenta_id: string
          fecha: string
          id: string
          monto: number
          mov_fondo_id: string | null
          movimiento_pago_id: string | null
          saldo_resultante: number | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          concepto?: string | null
          created_at?: string
          cuenta_id: string
          fecha?: string
          id?: string
          monto: number
          mov_fondo_id?: string | null
          movimiento_pago_id?: string | null
          saldo_resultante?: number | null
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          concepto?: string | null
          created_at?: string
          cuenta_id?: string
          fecha?: string
          id?: string
          monto?: number
          mov_fondo_id?: string | null
          movimiento_pago_id?: string | null
          saldo_resultante?: number | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_caja_mov_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "fema_cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_caja_mov_mov_fondo_id_fkey"
            columns: ["mov_fondo_id"]
            isOneToOne: false
            referencedRelation: "fema_mov_fondos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_caja_mov_movimiento_pago_id_fkey"
            columns: ["movimiento_pago_id"]
            isOneToOne: false
            referencedRelation: "fema_movimientos_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_clientes: {
        Row: {
          codigo: string | null
          condicion_iva: string | null
          cp: string | null
          created_at: string
          cuit: string | null
          domicilio: string | null
          email: string | null
          id: string
          iibb: string | null
          localidad: string | null
          nombre: string
          observaciones: string | null
          provincia: string | null
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo?: string | null
          condicion_iva?: string | null
          cp?: string | null
          created_at?: string
          cuit?: string | null
          domicilio?: string | null
          email?: string | null
          id?: string
          iibb?: string | null
          localidad?: string | null
          nombre: string
          observaciones?: string | null
          provincia?: string | null
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo?: string | null
          condicion_iva?: string | null
          cp?: string | null
          created_at?: string
          cuit?: string | null
          domicilio?: string | null
          email?: string | null
          id?: string
          iibb?: string | null
          localidad?: string | null
          nombre?: string
          observaciones?: string | null
          provincia?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fema_combustible: {
        Row: {
          anio: number | null
          co2: number | null
          created_at: string
          equipo_id: string | null
          fecha: string
          horas: number | null
          id: string
          itc: number | null
          kilometros: number | null
          litros: number
          mes: number | null
          observaciones: string | null
          precio_litro: number | null
          producto: string
          total: number
          trabajo: string | null
          user_id: string
        }
        Insert: {
          anio?: number | null
          co2?: number | null
          created_at?: string
          equipo_id?: string | null
          fecha: string
          horas?: number | null
          id?: string
          itc?: number | null
          kilometros?: number | null
          litros: number
          mes?: number | null
          observaciones?: string | null
          precio_litro?: number | null
          producto: string
          total?: number
          trabajo?: string | null
          user_id: string
        }
        Update: {
          anio?: number | null
          co2?: number | null
          created_at?: string
          equipo_id?: string | null
          fecha?: string
          horas?: number | null
          id?: string
          itc?: number | null
          kilometros?: number | null
          litros?: number
          mes?: number | null
          observaciones?: string | null
          precio_litro?: number | null
          producto?: string
          total?: number
          trabajo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_combustible_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "fema_equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_creditos: {
        Row: {
          acreedor: string
          cantidad_cuotas: number
          created_at: string
          descripcion: string | null
          fecha_primera_cuota: string
          id: string
          monto_total: number
          observaciones: string | null
          tasa: number | null
          updated_at: string
          user_id: string
          valor_cuota: number
        }
        Insert: {
          acreedor: string
          cantidad_cuotas?: number
          created_at?: string
          descripcion?: string | null
          fecha_primera_cuota: string
          id?: string
          monto_total?: number
          observaciones?: string | null
          tasa?: number | null
          updated_at?: string
          user_id: string
          valor_cuota?: number
        }
        Update: {
          acreedor?: string
          cantidad_cuotas?: number
          created_at?: string
          descripcion?: string | null
          fecha_primera_cuota?: string
          id?: string
          monto_total?: number
          observaciones?: string | null
          tasa?: number | null
          updated_at?: string
          user_id?: string
          valor_cuota?: number
        }
        Relationships: []
      }
      fema_creditos_cuotas: {
        Row: {
          created_at: string
          credito_id: string
          estado: string
          fecha_pago: string | null
          fecha_vencimiento: string
          forma_pago: string | null
          id: string
          monto: number
          numero_cuota: number
          observaciones: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credito_id: string
          estado?: string
          fecha_pago?: string | null
          fecha_vencimiento: string
          forma_pago?: string | null
          id?: string
          monto?: number
          numero_cuota: number
          observaciones?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credito_id?: string
          estado?: string
          fecha_pago?: string | null
          fecha_vencimiento?: string
          forma_pago?: string | null
          id?: string
          monto?: number
          numero_cuota?: number
          observaciones?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_creditos_cuotas_credito_id_fkey"
            columns: ["credito_id"]
            isOneToOne: false
            referencedRelation: "fema_creditos"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_cuentas_bancarias: {
        Row: {
          activa: boolean
          alias: string | null
          banco: string
          cbu: string | null
          created_at: string
          id: string
          numero_cuenta: string | null
          observaciones: string | null
          rescate: string | null
          saldo: number
          tipo_cuenta: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activa?: boolean
          alias?: string | null
          banco: string
          cbu?: string | null
          created_at?: string
          id?: string
          numero_cuenta?: string | null
          observaciones?: string | null
          rescate?: string | null
          saldo?: number
          tipo_cuenta?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activa?: boolean
          alias?: string | null
          banco?: string
          cbu?: string | null
          created_at?: string
          id?: string
          numero_cuenta?: string | null
          observaciones?: string | null
          rescate?: string | null
          saldo?: number
          tipo_cuenta?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fema_empleados: {
        Row: {
          activo: boolean | null
          cargo: string | null
          contacto_emergencia: string | null
          created_at: string
          cuil: string | null
          dni: string | null
          domicilio: string | null
          email: string | null
          fecha_ingreso: string | null
          funcion: string | null
          id: string
          nombre: string
          obra_social: string | null
          observaciones: string | null
          sueldo_bruto: number | null
          telefono: string | null
          tipo_contratacion: string | null
          updated_at: string
          user_id: string
          valor_hora: number | null
        }
        Insert: {
          activo?: boolean | null
          cargo?: string | null
          contacto_emergencia?: string | null
          created_at?: string
          cuil?: string | null
          dni?: string | null
          domicilio?: string | null
          email?: string | null
          fecha_ingreso?: string | null
          funcion?: string | null
          id?: string
          nombre: string
          obra_social?: string | null
          observaciones?: string | null
          sueldo_bruto?: number | null
          telefono?: string | null
          tipo_contratacion?: string | null
          updated_at?: string
          user_id: string
          valor_hora?: number | null
        }
        Update: {
          activo?: boolean | null
          cargo?: string | null
          contacto_emergencia?: string | null
          created_at?: string
          cuil?: string | null
          dni?: string | null
          domicilio?: string | null
          email?: string | null
          fecha_ingreso?: string | null
          funcion?: string | null
          id?: string
          nombre?: string
          obra_social?: string | null
          observaciones?: string | null
          sueldo_bruto?: number | null
          telefono?: string | null
          tipo_contratacion?: string | null
          updated_at?: string
          user_id?: string
          valor_hora?: number | null
        }
        Relationships: []
      }
      fema_equipos: {
        Row: {
          created_at: string
          estado: string
          id: string
          interno: string | null
          nombre: string
          observaciones: string | null
          tenencia: string
          tipo: string
          transportista: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          estado?: string
          id?: string
          interno?: string | null
          nombre: string
          observaciones?: string | null
          tenencia?: string
          tipo?: string
          transportista?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          estado?: string
          id?: string
          interno?: string | null
          nombre?: string
          observaciones?: string | null
          tenencia?: string
          tipo?: string
          transportista?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fema_estimaciones: {
        Row: {
          cliente_id: string | null
          created_at: string
          descripcion: string | null
          estado: string
          fecha_estimada: string
          id: string
          monto: number
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          fecha_estimada: string
          id?: string
          monto?: number
          user_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          fecha_estimada?: string
          id?: string
          monto?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_estimaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "fema_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_facturas_compra: {
        Row: {
          anio: number | null
          categoria: Database["public"]["Enums"]["categoria_compra"] | null
          created_at: string
          descripcion: string | null
          empleado_id: string | null
          estado: Database["public"]["Enums"]["estado_factura_compra"] | null
          fecha: string
          fecha_pago: string | null
          forma_pago: string | null
          id: string
          imagen_path: string | null
          impuestos_internos: number | null
          iva_105: number | null
          iva_21: number | null
          litros: number | null
          mes: number | null
          neto: number | null
          numero: string | null
          observaciones: string | null
          otros_impuestos: number | null
          percepciones: number | null
          producto: string | null
          proveedor_id: string | null
          tipo: Database["public"]["Enums"]["tipo_factura"]
          tipo_comprobante: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          anio?: number | null
          categoria?: Database["public"]["Enums"]["categoria_compra"] | null
          created_at?: string
          descripcion?: string | null
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["estado_factura_compra"] | null
          fecha: string
          fecha_pago?: string | null
          forma_pago?: string | null
          id?: string
          imagen_path?: string | null
          impuestos_internos?: number | null
          iva_105?: number | null
          iva_21?: number | null
          litros?: number | null
          mes?: number | null
          neto?: number | null
          numero?: string | null
          observaciones?: string | null
          otros_impuestos?: number | null
          percepciones?: number | null
          producto?: string | null
          proveedor_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_factura"]
          tipo_comprobante?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          anio?: number | null
          categoria?: Database["public"]["Enums"]["categoria_compra"] | null
          created_at?: string
          descripcion?: string | null
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["estado_factura_compra"] | null
          fecha?: string
          fecha_pago?: string | null
          forma_pago?: string | null
          id?: string
          imagen_path?: string | null
          impuestos_internos?: number | null
          iva_105?: number | null
          iva_21?: number | null
          litros?: number | null
          mes?: number | null
          neto?: number | null
          numero?: string | null
          observaciones?: string | null
          otros_impuestos?: number | null
          percepciones?: number | null
          producto?: string | null
          proveedor_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_factura"]
          tipo_comprobante?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_facturas_compra_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "fema_empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_facturas_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "fema_proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_facturas_venta: {
        Row: {
          anio: number | null
          categoria: string | null
          cliente_id: string | null
          condicion_pago: string | null
          created_at: string
          cultivo: string | null
          estado: Database["public"]["Enums"]["estado_factura_venta"] | null
          fecha: string
          fecha_cobro: string | null
          forma_cobro: string | null
          hectareas: number | null
          id: string
          imagen_path: string | null
          iva_105: number | null
          iva_21: number | null
          mes: number | null
          metros_bolsa: number | null
          neto: number | null
          numero: string | null
          observaciones: string | null
          percepciones: number | null
          precio_ha: number | null
          precio_metro: number | null
          tipo: Database["public"]["Enums"]["tipo_factura"]
          tipo_comprobante: string | null
          total: number
          trabajo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anio?: number | null
          categoria?: string | null
          cliente_id?: string | null
          condicion_pago?: string | null
          created_at?: string
          cultivo?: string | null
          estado?: Database["public"]["Enums"]["estado_factura_venta"] | null
          fecha: string
          fecha_cobro?: string | null
          forma_cobro?: string | null
          hectareas?: number | null
          id?: string
          imagen_path?: string | null
          iva_105?: number | null
          iva_21?: number | null
          mes?: number | null
          metros_bolsa?: number | null
          neto?: number | null
          numero?: string | null
          observaciones?: string | null
          percepciones?: number | null
          precio_ha?: number | null
          precio_metro?: number | null
          tipo?: Database["public"]["Enums"]["tipo_factura"]
          tipo_comprobante?: string | null
          total?: number
          trabajo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anio?: number | null
          categoria?: string | null
          cliente_id?: string | null
          condicion_pago?: string | null
          created_at?: string
          cultivo?: string | null
          estado?: Database["public"]["Enums"]["estado_factura_venta"] | null
          fecha?: string
          fecha_cobro?: string | null
          forma_cobro?: string | null
          hectareas?: number | null
          id?: string
          imagen_path?: string | null
          iva_105?: number | null
          iva_21?: number | null
          mes?: number | null
          metros_bolsa?: number | null
          neto?: number | null
          numero?: string | null
          observaciones?: string | null
          percepciones?: number | null
          precio_ha?: number | null
          precio_metro?: number | null
          tipo?: Database["public"]["Enums"]["tipo_factura"]
          tipo_comprobante?: string | null
          total?: number
          trabajo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_facturas_venta_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "fema_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_gastos_fijos: {
        Row: {
          activo: boolean
          categoria: string
          concepto: string
          created_at: string
          dia_vencimiento: number | null
          id: string
          mes_fin: string | null
          mes_inicio: string
          monto_mensual: number
          observaciones: string | null
          proveedor_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activo?: boolean
          categoria?: string
          concepto: string
          created_at?: string
          dia_vencimiento?: number | null
          id?: string
          mes_fin?: string | null
          mes_inicio: string
          monto_mensual?: number
          observaciones?: string | null
          proveedor_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          concepto?: string
          created_at?: string
          dia_vencimiento?: number | null
          id?: string
          mes_fin?: string | null
          mes_inicio?: string
          monto_mensual?: number
          observaciones?: string | null
          proveedor_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_gastos_fijos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "fema_proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_gastos_fijos_mov: {
        Row: {
          anio: number
          created_at: string
          fecha_pago: string | null
          forma_pago: string | null
          gasto_fijo_id: string
          id: string
          mes: number
          monto: number
          observaciones: string | null
          pagado: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          anio: number
          created_at?: string
          fecha_pago?: string | null
          forma_pago?: string | null
          gasto_fijo_id: string
          id?: string
          mes: number
          monto?: number
          observaciones?: string | null
          pagado?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          anio?: number
          created_at?: string
          fecha_pago?: string | null
          forma_pago?: string | null
          gasto_fijo_id?: string
          id?: string
          mes?: number
          monto?: number
          observaciones?: string | null
          pagado?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_gastos_fijos_mov_gasto_fijo_id_fkey"
            columns: ["gasto_fijo_id"]
            isOneToOne: false
            referencedRelation: "fema_gastos_fijos"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_horas_trabajadas: {
        Row: {
          anio: number | null
          created_at: string
          empleado_id: string | null
          fecha: string
          horas: number
          id: string
          mes: number | null
          observaciones: string | null
          referencia: string | null
          tarea: string | null
          user_id: string
        }
        Insert: {
          anio?: number | null
          created_at?: string
          empleado_id?: string | null
          fecha: string
          horas?: number
          id?: string
          mes?: number | null
          observaciones?: string | null
          referencia?: string | null
          tarea?: string | null
          user_id: string
        }
        Update: {
          anio?: number | null
          created_at?: string
          empleado_id?: string | null
          fecha?: string
          horas?: number
          id?: string
          mes?: number | null
          observaciones?: string | null
          referencia?: string | null
          tarea?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_horas_trabajadas_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "fema_empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_impuestos: {
        Row: {
          anio: number
          created_at: string
          ganancias_estimadas: number | null
          id: string
          ingresos_brutos: number | null
          iva_credito: number | null
          iva_debito: number | null
          mes: number
          periodo: string
          user_id: string
        }
        Insert: {
          anio: number
          created_at?: string
          ganancias_estimadas?: number | null
          id?: string
          ingresos_brutos?: number | null
          iva_credito?: number | null
          iva_debito?: number | null
          mes: number
          periodo: string
          user_id: string
        }
        Update: {
          anio?: number
          created_at?: string
          ganancias_estimadas?: number | null
          id?: string
          ingresos_brutos?: number | null
          iva_credito?: number | null
          iva_debito?: number | null
          mes?: number
          periodo?: string
          user_id?: string
        }
        Relationships: []
      }
      fema_imputaciones: {
        Row: {
          anio: number | null
          created_at: string
          factura_compra_id: string | null
          factura_venta_id: string | null
          fecha: string
          id: string
          mes: number | null
          monto: number
          movimiento_pago_id: string
          user_id: string
        }
        Insert: {
          anio?: number | null
          created_at?: string
          factura_compra_id?: string | null
          factura_venta_id?: string | null
          fecha?: string
          id?: string
          mes?: number | null
          monto: number
          movimiento_pago_id: string
          user_id: string
        }
        Update: {
          anio?: number | null
          created_at?: string
          factura_compra_id?: string | null
          factura_venta_id?: string | null
          fecha?: string
          id?: string
          mes?: number | null
          monto?: number
          movimiento_pago_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_imputaciones_factura_compra_id_fkey"
            columns: ["factura_compra_id"]
            isOneToOne: false
            referencedRelation: "fema_facturas_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_imputaciones_factura_compra_id_fkey"
            columns: ["factura_compra_id"]
            isOneToOne: false
            referencedRelation: "fema_v_saldos_compra"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "fema_imputaciones_factura_venta_id_fkey"
            columns: ["factura_venta_id"]
            isOneToOne: false
            referencedRelation: "fema_facturas_venta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_imputaciones_factura_venta_id_fkey"
            columns: ["factura_venta_id"]
            isOneToOne: false
            referencedRelation: "fema_v_saldos_venta"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "fema_imputaciones_movimiento_pago_id_fkey"
            columns: ["movimiento_pago_id"]
            isOneToOne: false
            referencedRelation: "fema_movimientos_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_medios_pago: {
        Row: {
          created_at: string
          id: string
          nombre: string
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      fema_mov_fondos: {
        Row: {
          anio: number
          created_at: string
          destino_id: string | null
          fecha: string
          id: string
          mes: number
          monto: number
          observaciones: string | null
          origen_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anio?: number
          created_at?: string
          destino_id?: string | null
          fecha?: string
          id?: string
          mes?: number
          monto?: number
          observaciones?: string | null
          origen_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anio?: number
          created_at?: string
          destino_id?: string | null
          fecha?: string
          id?: string
          mes?: number
          monto?: number
          observaciones?: string | null
          origen_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_mov_fondos_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "fema_cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_mov_fondos_origen_id_fkey"
            columns: ["origen_id"]
            isOneToOne: false
            referencedRelation: "fema_cuentas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_movimientos_pago: {
        Row: {
          anio: number
          banco: string | null
          contraparte: string | null
          created_at: string
          direccion: string
          echeq_origen_id: string | null
          estado: string
          factura_compra_id: string | null
          factura_venta_id: string | null
          fecha_emision: string
          id: string
          instrumento: string
          mes: number
          monto: number
          numero: string | null
          observaciones: string | null
          tipo_movimiento: string
          updated_at: string
          user_id: string
          vencimiento: string | null
        }
        Insert: {
          anio?: number
          banco?: string | null
          contraparte?: string | null
          created_at?: string
          direccion: string
          echeq_origen_id?: string | null
          estado?: string
          factura_compra_id?: string | null
          factura_venta_id?: string | null
          fecha_emision?: string
          id?: string
          instrumento: string
          mes?: number
          monto?: number
          numero?: string | null
          observaciones?: string | null
          tipo_movimiento: string
          updated_at?: string
          user_id: string
          vencimiento?: string | null
        }
        Update: {
          anio?: number
          banco?: string | null
          contraparte?: string | null
          created_at?: string
          direccion?: string
          echeq_origen_id?: string | null
          estado?: string
          factura_compra_id?: string | null
          factura_venta_id?: string | null
          fecha_emision?: string
          id?: string
          instrumento?: string
          mes?: number
          monto?: number
          numero?: string | null
          observaciones?: string | null
          tipo_movimiento?: string
          updated_at?: string
          user_id?: string
          vencimiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fema_movimientos_pago_echeq_origen_id_fkey"
            columns: ["echeq_origen_id"]
            isOneToOne: false
            referencedRelation: "fema_movimientos_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_pagos_empleado: {
        Row: {
          anio: number | null
          bono_id: string | null
          created_at: string
          empleado_id: string | null
          estado: string
          fecha: string
          forma_pago: string | null
          horas: number
          id: string
          mes: number | null
          modalidad: string
          monto: number
          observaciones: string | null
          periodo_desde: string | null
          periodo_hasta: string | null
          solicitud_id: string | null
          tareas: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anio?: number | null
          bono_id?: string | null
          created_at?: string
          empleado_id?: string | null
          estado?: string
          fecha?: string
          forma_pago?: string | null
          horas?: number
          id?: string
          mes?: number | null
          modalidad?: string
          monto?: number
          observaciones?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          solicitud_id?: string | null
          tareas?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anio?: number | null
          bono_id?: string | null
          created_at?: string
          empleado_id?: string | null
          estado?: string
          fecha?: string
          forma_pago?: string | null
          horas?: number
          id?: string
          mes?: number | null
          modalidad?: string
          monto?: number
          observaciones?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          solicitud_id?: string | null
          tareas?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_pagos_empleado_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "fema_bonos_campana"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_pagos_empleado_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "fema_empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_pagos_empleado_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "fema_solicitudes_factura_empleado"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_periodos_cierre: {
        Row: {
          anio: number
          cerrado_por: string | null
          created_at: string
          id: string
          mes: number
          observaciones: string | null
          updated_at: string
        }
        Insert: {
          anio: number
          cerrado_por?: string | null
          created_at?: string
          id?: string
          mes: number
          observaciones?: string | null
          updated_at?: string
        }
        Update: {
          anio?: number
          cerrado_por?: string | null
          created_at?: string
          id?: string
          mes?: number
          observaciones?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fema_presupuesto_items: {
        Row: {
          alicuota_iva: number
          cantidad: number
          codigo: string | null
          created_at: string
          descripcion: string
          id: string
          orden: number | null
          precio_unitario: number
          presupuesto_id: string
          subtotal: number
          user_id: string
        }
        Insert: {
          alicuota_iva?: number
          cantidad?: number
          codigo?: string | null
          created_at?: string
          descripcion: string
          id?: string
          orden?: number | null
          precio_unitario?: number
          presupuesto_id: string
          subtotal?: number
          user_id: string
        }
        Update: {
          alicuota_iva?: number
          cantidad?: number
          codigo?: string | null
          created_at?: string
          descripcion?: string
          id?: string
          orden?: number | null
          precio_unitario?: number
          presupuesto_id?: string
          subtotal?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_presupuesto_items_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "fema_presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_presupuestos: {
        Row: {
          anio: number | null
          cliente_cond_iva: string | null
          cliente_cuit: string | null
          cliente_domicilio: string | null
          cliente_id: string | null
          cliente_localidad: string | null
          cliente_nombre: string | null
          condicion_pago: string | null
          consideraciones: string | null
          created_at: string
          descripcion: string | null
          descuento_monto: number | null
          descuento_pct: number | null
          estado: string | null
          fecha: string
          fecha_vencimiento: string | null
          id: string
          iva_105: number | null
          iva_21: number | null
          neto: number | null
          numero: string | null
          observaciones: string | null
          total: number | null
          user_id: string
        }
        Insert: {
          anio?: number | null
          cliente_cond_iva?: string | null
          cliente_cuit?: string | null
          cliente_domicilio?: string | null
          cliente_id?: string | null
          cliente_localidad?: string | null
          cliente_nombre?: string | null
          condicion_pago?: string | null
          consideraciones?: string | null
          created_at?: string
          descripcion?: string | null
          descuento_monto?: number | null
          descuento_pct?: number | null
          estado?: string | null
          fecha: string
          fecha_vencimiento?: string | null
          id?: string
          iva_105?: number | null
          iva_21?: number | null
          neto?: number | null
          numero?: string | null
          observaciones?: string | null
          total?: number | null
          user_id: string
        }
        Update: {
          anio?: number | null
          cliente_cond_iva?: string | null
          cliente_cuit?: string | null
          cliente_domicilio?: string | null
          cliente_id?: string | null
          cliente_localidad?: string | null
          cliente_nombre?: string | null
          condicion_pago?: string | null
          consideraciones?: string | null
          created_at?: string
          descripcion?: string | null
          descuento_monto?: number | null
          descuento_pct?: number | null
          estado?: string | null
          fecha?: string
          fecha_vencimiento?: string | null
          id?: string
          iva_105?: number | null
          iva_21?: number | null
          neto?: number | null
          numero?: string | null
          observaciones?: string | null
          total?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_presupuestos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "fema_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_proveedores: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_compra"] | null
          condicion_iva: string | null
          created_at: string
          cuit: string | null
          domicilio: string | null
          email: string | null
          id: string
          iibb: string | null
          localidad: string | null
          nombre: string
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_compra"] | null
          condicion_iva?: string | null
          created_at?: string
          cuit?: string | null
          domicilio?: string | null
          email?: string | null
          id?: string
          iibb?: string | null
          localidad?: string | null
          nombre: string
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_compra"] | null
          condicion_iva?: string | null
          created_at?: string
          cuit?: string | null
          domicilio?: string | null
          email?: string | null
          id?: string
          iibb?: string | null
          localidad?: string | null
          nombre?: string
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fema_solicitudes_factura_empleado: {
        Row: {
          anio: number | null
          created_at: string
          empleado_id: string | null
          estado: string
          factura_compra_id: string | null
          fecha: string
          id: string
          mes: number | null
          observaciones: string | null
          periodo_desde: string | null
          periodo_hasta: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          anio?: number | null
          created_at?: string
          empleado_id?: string | null
          estado?: string
          factura_compra_id?: string | null
          fecha?: string
          id?: string
          mes?: number | null
          observaciones?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          anio?: number | null
          created_at?: string
          empleado_id?: string | null
          estado?: string
          factura_compra_id?: string | null
          fecha?: string
          id?: string
          mes?: number | null
          observaciones?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_solicitudes_factura_empleado_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "fema_empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_solicitudes_factura_empleado_factura_compra_id_fkey"
            columns: ["factura_compra_id"]
            isOneToOne: false
            referencedRelation: "fema_facturas_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fema_solicitudes_factura_empleado_factura_compra_id_fkey"
            columns: ["factura_compra_id"]
            isOneToOne: false
            referencedRelation: "fema_v_saldos_compra"
            referencedColumns: ["factura_id"]
          },
        ]
      }
      fema_sueldos: {
        Row: {
          adicional: number | null
          anio: number | null
          basico: number | null
          cargas_sociales: number | null
          created_at: string
          empleado_id: string | null
          estado: string | null
          id: string
          mes: number | null
          observaciones: string | null
          periodo: string
          rol: string | null
          sueldo_bruto: number | null
          sueldo_neto: number | null
          total: number | null
          user_id: string
        }
        Insert: {
          adicional?: number | null
          anio?: number | null
          basico?: number | null
          cargas_sociales?: number | null
          created_at?: string
          empleado_id?: string | null
          estado?: string | null
          id?: string
          mes?: number | null
          observaciones?: string | null
          periodo: string
          rol?: string | null
          sueldo_bruto?: number | null
          sueldo_neto?: number | null
          total?: number | null
          user_id: string
        }
        Update: {
          adicional?: number | null
          anio?: number | null
          basico?: number | null
          cargas_sociales?: number | null
          created_at?: string
          empleado_id?: string | null
          estado?: string | null
          id?: string
          mes?: number | null
          observaciones?: string | null
          periodo?: string
          rol?: string | null
          sueldo_bruto?: number | null
          sueldo_neto?: number | null
          total?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fema_sueldos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "fema_empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      fema_tanque_mov: {
        Row: {
          anio: number | null
          created_at: string
          fecha: string
          id: string
          litros: number
          mes: number | null
          observaciones: string | null
          precio_litro: number | null
          proveedor: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          anio?: number | null
          created_at?: string
          fecha: string
          id?: string
          litros: number
          mes?: number | null
          observaciones?: string | null
          precio_litro?: number | null
          proveedor?: string | null
          tipo?: string
          user_id: string
        }
        Update: {
          anio?: number | null
          created_at?: string
          fecha?: string
          id?: string
          litros?: number
          mes?: number | null
          observaciones?: string | null
          precio_litro?: number | null
          proveedor?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      fema_viajes_transp: {
        Row: {
          anio: number | null
          cantidad_viajes: number
          created_at: string
          destino: string | null
          equipo_id: string | null
          fecha: string
          id: string
          mes: number | null
          observaciones: string | null
          origen: string | null
          precio_viaje: number | null
          total: number | null
          trabajo: string | null
          transportista: string
          ubicacion: string | null
          user_id: string
        }
        Insert: {
          anio?: number | null
          cantidad_viajes?: number
          created_at?: string
          destino?: string | null
          equipo_id?: string | null
          fecha: string
          id?: string
          mes?: number | null
          observaciones?: string | null
          origen?: string | null
          precio_viaje?: number | null
          total?: number | null
          trabajo?: string | null
          transportista: string
          ubicacion?: string | null
          user_id: string
        }
        Update: {
          anio?: number | null
          cantidad_viajes?: number
          created_at?: string
          destino?: string | null
          equipo_id?: string | null
          fecha?: string
          id?: string
          mes?: number | null
          observaciones?: string | null
          origen?: string | null
          precio_viaje?: number | null
          total?: number | null
          trabajo?: string | null
          transportista?: string
          ubicacion?: string | null
          user_id?: string
        }
        Relationships: []
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
          aprobado: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          modulos_permitidos: string[]
          updated_at: string
        }
        Insert: {
          aprobado?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          modulos_permitidos?: string[]
          updated_at?: string
        }
        Update: {
          aprobado?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          modulos_permitidos?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      recibo_conceptos: {
        Row: {
          created_at: string
          created_by: string
          descripcion: string
          id: string
          monto: number
          recibo_id: string
          tipo: Database["public"]["Enums"]["tipo_concepto"]
        }
        Insert: {
          created_at?: string
          created_by?: string
          descripcion: string
          id?: string
          monto?: number
          recibo_id: string
          tipo: Database["public"]["Enums"]["tipo_concepto"]
        }
        Update: {
          created_at?: string
          created_by?: string
          descripcion?: string
          id?: string
          monto?: number
          recibo_id?: string
          tipo?: Database["public"]["Enums"]["tipo_concepto"]
        }
        Relationships: []
      }
      recibos_sueldo: {
        Row: {
          created_at: string
          created_by: string
          empleado_id: string
          estado: Database["public"]["Enums"]["estado_recibo"]
          fecha_pago: string | null
          id: string
          notas: string | null
          periodo: string
          sueldo_bruto: number
          sueldo_neto: number
          total_descuentos: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          empleado_id: string
          estado?: Database["public"]["Enums"]["estado_recibo"]
          fecha_pago?: string | null
          id?: string
          notas?: string | null
          periodo: string
          sueldo_bruto?: number
          sueldo_neto?: number
          total_descuentos?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          empleado_id?: string
          estado?: Database["public"]["Enums"]["estado_recibo"]
          fecha_pago?: string | null
          id?: string
          notas?: string | null
          periodo?: string
          sueldo_bruto?: number
          sueldo_neto?: number
          total_descuentos?: number
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
      fema_v_saldos_compra: {
        Row: {
          docs_programados: number | null
          factura_id: string | null
          pagado: number | null
          programado: number | null
          proximo_vencimiento: string | null
          saldo: number | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      fema_v_saldos_venta: {
        Row: {
          cobrado: number | null
          docs_programados: number | null
          factura_id: string | null
          programado: number | null
          proximo_vencimiento: string | null
          saldo: number | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fema_eliminar_mov_fondo: { Args: { _id: string }; Returns: Json }
      fema_impactar_caja: {
        Args: {
          _cuenta_id?: string
          _es_pago?: boolean
          _mov_id: string
          _nuevo_estado: string
        }
        Returns: Json
      }
      fema_mover_fondos: {
        Args: {
          _destino_id: string
          _fecha?: string
          _monto: number
          _observaciones?: string
          _origen_id: string
        }
        Returns: Json
      }
      fema_periodo_cerrado: { Args: { _fecha: string }; Returns: boolean }
      fema_reconciliar_factura: {
        Args: { _factura_id: string; _tipo: string }
        Returns: undefined
      }
      fema_registrar_pago: {
        Args: {
          _borrar?: string[]
          _ceder?: string[]
          _inserts?: Json
          _updates?: Json
        }
        Returns: Json
      }
      fema_revertir_caja: {
        Args: { _estado?: string; _mov_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _uid: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "contador" | "operador"
      categoria_compra:
        | "Repuestos_JD"
        | "Mecanicos"
        | "Gomeria"
        | "Inoculante"
        | "Transportistas"
        | "Seguros"
        | "Servicios"
        | "Herramientas"
        | "Otro"
        | "Gasoil_Combustible"
        | "Mano_de_Obra"
        | "Franco_Particular"
        | "Repuestos"
        | "Honorarios"
        | "Maquinaria_Rodados"
        | "Pago_Creditos"
        | "Inversiones"
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
      estado_factura_compra: "pendiente" | "pagada"
      estado_factura_venta: "pendiente" | "cobrada"
      estado_presupuesto:
        | "borrador"
        | "enviado"
        | "aprobado"
        | "rechazado"
        | "convertido"
      estado_recibo: "borrador" | "pagado" | "anulado"
      metodo_pago:
        | "efectivo"
        | "transferencia"
        | "debito"
        | "credito"
        | "cheque"
        | "otro"
      tipo_concepto: "haber" | "descuento"
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
      categoria_compra: [
        "Repuestos_JD",
        "Mecanicos",
        "Gomeria",
        "Inoculante",
        "Transportistas",
        "Seguros",
        "Servicios",
        "Herramientas",
        "Otro",
        "Gasoil_Combustible",
        "Mano_de_Obra",
        "Franco_Particular",
        "Repuestos",
        "Honorarios",
        "Maquinaria_Rodados",
        "Pago_Creditos",
        "Inversiones",
      ],
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
      estado_factura_compra: ["pendiente", "pagada"],
      estado_factura_venta: ["pendiente", "cobrada"],
      estado_presupuesto: [
        "borrador",
        "enviado",
        "aprobado",
        "rechazado",
        "convertido",
      ],
      estado_recibo: ["borrador", "pagado", "anulado"],
      metodo_pago: [
        "efectivo",
        "transferencia",
        "debito",
        "credito",
        "cheque",
        "otro",
      ],
      tipo_concepto: ["haber", "descuento"],
      tipo_factura: ["A", "B", "C", "E", "M"],
      tipo_percepcion: ["iva", "iibb"],
      tipo_persona: ["cliente", "proveedor", "ambos"],
      tipo_retencion: ["ganancias", "iva", "iibb", "suss"],
    },
  },
} as const
