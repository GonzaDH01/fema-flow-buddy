import { describe, it, expect } from "vitest";
import {
  clasificarCosto, calcularResultado, costosPorCategoria,
  rentabilidadPorCliente, unitarios, evolucionMensual,
  type VentaLinea, type CompraLinea,
} from "./rentabilidad";

const ventas: VentaLinea[] = [
  { clienteId: "a", cliente: "Cliente A", fecha: "2026-03-10", neto: 6000, hectareas: 60, metrosBolsa: 300 },
  { clienteId: "b", cliente: "Cliente B", fecha: "2026-04-10", neto: 4000, hectareas: 40, metrosBolsa: 100 },
];
const compras: CompraLinea[] = [
  { fecha: "2026-03-05", neto: 3000, categoria: "Gasoil_Combustible" },
  { fecha: "2026-04-05", neto: 1000, categoria: "Seguros" },
  { fecha: "2026-04-06", neto: 9000, categoria: "Pago_Creditos" },
];

describe("rentabilidad", () => {
  it("clasifica categorías", () => {
    expect(clasificarCosto("Gasoil_Combustible")).toBe("directo");
    expect(clasificarCosto("Seguros")).toBe("indirecto");
    expect(clasificarCosto("Inversiones")).toBe("no_operativo");
    expect(clasificarCosto(null)).toBe("indirecto");
  });

  it("calcula márgenes excluyendo lo no operativo", () => {
    const r = calcularResultado(ventas, compras);
    expect(r.ingresos).toBe(10000);
    expect(r.costosDirectos).toBe(3000);
    expect(r.costosIndirectos).toBe(1000);
    expect(r.noOperativos).toBe(9000);
    expect(r.margenBruto).toBe(7000);
    expect(r.margenBrutoPct).toBe(70);
    expect(r.resultadoOperativo).toBe(6000);
  });

  it("agrupa costos por categoría con participación operativa", () => {
    const c = costosPorCategoria(compras);
    expect(c[0]!.categoria).toBe("Pago_Creditos");
    expect(c[0]!.participacion).toBe(0);
    const gasoil = c.find((x) => x.categoria === "Gasoil_Combustible")!;
    expect(gasoil.participacion).toBe(75);
  });

  it("imputa costos directos por participación de facturación", () => {
    const f = rentabilidadPorCliente(ventas, 3000);
    expect(f[0]!.cliente).toBe("Cliente A");
    expect(f[0]!.participacion).toBe(60);
    expect(f[0]!.costoImputado).toBe(1800);
    expect(f[0]!.margen).toBe(4200);
  });

  it("calcula unitarios por hectárea y metro", () => {
    const u = unitarios(ventas, 3000);
    expect(u.hectareas).toBe(100);
    expect(u.ingresoPorHa).toBe(100);
    expect(u.costoPorHa).toBe(30);
    expect(u.margenPorHa).toBe(70);
    expect(u.ingresoPorMetro).toBe(25);
  });

  it("arma la evolución mensual sin no operativos", () => {
    const m = evolucionMensual(ventas, compras);
    expect(m[2]).toEqual({ mes: 3, ingresos: 6000, costos: 3000, resultado: 3000 });
    expect(m[3]).toEqual({ mes: 4, ingresos: 4000, costos: 1000, resultado: 3000 });
  });
});
