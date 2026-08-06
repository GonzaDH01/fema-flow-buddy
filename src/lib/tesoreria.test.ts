import { describe, it, expect } from "vitest";
import { lunesDe, sumarDias, proyectar, primerDeficit, type Flujo } from "./tesoreria";

describe("tesoreria", () => {
  it("calcula el lunes de la semana", () => {
    expect(lunesDe("2026-08-06")).toBe("2026-08-03"); // jueves -> lunes
    expect(lunesDe("2026-08-03")).toBe("2026-08-03");
    expect(lunesDe("2026-08-09")).toBe("2026-08-03"); // domingo
  });

  it("suma días correctamente", () => {
    expect(sumarDias("2026-08-03", 6)).toBe("2026-08-09");
  });

  it("acumula saldo semana a semana y arrastra lo atrasado a la primera", () => {
    const flujos: Flujo[] = [
      { fecha: "2026-07-01", concepto: "vencido", origen: "x", monto: -100 },
      { fecha: "2026-08-05", concepto: "cobro", origen: "x", monto: 500 },
      { fecha: "2026-08-12", concepto: "pago", origen: "x", monto: -200 },
    ];
    const s = proyectar(flujos, 1000, "2026-08-06", 3);
    expect(s[0].inicio).toBe("2026-08-03");
    expect(s[0].ingresos).toBe(500);
    expect(s[0].egresos).toBe(100);
    expect(s[0].saldoFinal).toBe(1400);
    expect(s[1].saldoFinal).toBe(1200);
    expect(s[2].neto).toBe(0);
  });

  it("detecta el primer déficit", () => {
    const s = proyectar([{ fecha: "2026-08-12", concepto: "p", origen: "x", monto: -300 }], 100, "2026-08-06", 3);
    expect(primerDeficit(s)?.inicio).toBe("2026-08-10");
    expect(primerDeficit(proyectar([], 100, "2026-08-06", 2))).toBeNull();
  });
});
