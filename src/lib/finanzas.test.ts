import { describe, it, expect } from "vitest";
import {
  construirObjetivos, estadoFactura, esEmitidoPendiente, esVencidoSinCobrar,
  imputarIndivisible, origenDocumento, repartirImporte, saldoFactura,
  saldoProyectado, totalConfirmado, totalProgramado,
} from "./finanzas";

describe("estado y saldo de facturas", () => {
  const movs = [
    { monto: 600, estado: "pagado" },
    { monto: 400, estado: "en_cartera" },
    { monto: 900, estado: "anulado" },
  ];

  it("solo cuenta los movimientos confirmados", () => {
    expect(totalConfirmado(movs, "compra")).toBe(600);
    expect(totalProgramado(movs)).toBe(400);
  });

  it("una cesión cuenta como pago en compras pero no en ventas", () => {
    const c = [{ monto: 100, estado: "cedido" }];
    expect(totalConfirmado(c, "compra")).toBe(100);
    expect(totalConfirmado(c, "venta")).toBe(0);
  });

  it("marca pagada solo cuando el confirmado cubre el total", () => {
    expect(estadoFactura(1000, movs, "compra")).toBe("pendiente");
    expect(estadoFactura(600, movs, "compra")).toBe("pagada");
    expect(estadoFactura(0, [], "compra")).toBe("pendiente");
    expect(estadoFactura(100, [{ monto: 100, estado: "cobrado" }], "venta")).toBe("cobrada");
  });

  it("el saldo nunca es negativo", () => {
    expect(saldoFactura(1000, 600, 400)).toBe(0);
    expect(saldoFactura(1000, 1200)).toBe(0);
    expect(saldoFactura(1000, 250)).toBe(750);
  });
});

describe("imputación de pagos a varias facturas", () => {
  const facturas = [{ id: "a", total: 1000 }, { id: "b", total: 500 }];

  it("descuenta lo ya aplicado al construir objetivos", () => {
    const objs = construirObjetivos(facturas, [
      { monto: 300, estado: "pagado", factura_compra_id: "a" },
      { monto: 100, estado: "anulado", factura_compra_id: "a" },
      { monto: 200, estado: "en_cartera", factura_compra_id: "b" },
    ], "compra");
    expect(objs).toEqual([{ id: "a", restante: 700 }, { id: "b", restante: 300 }]);
  });

  it("reparte en cascada respetando el saldo de cada factura", () => {
    const objs = construirObjetivos(facturas, [], "compra");
    expect(repartirImporte(objs, 1200)).toEqual([
      { facturaId: "a", monto: 1000 },
      { facturaId: "b", monto: 200 },
    ]);
    expect(objs[1].restante).toBe(300);
  });

  it("imputa el excedente a la última factura", () => {
    const objs = construirObjetivos(facturas, [], "compra");
    const chunks = repartirImporte(objs, 2000);
    expect(chunks.reduce((s, c) => s + c.monto, 0)).toBe(2000);
    expect(chunks[chunks.length - 1].facturaId).toBe("b");
  });

  it("un echeq cedido va entero a la primera factura con saldo", () => {
    const objs = [{ id: "a", restante: 0 }, { id: "b", restante: 500 }];
    expect(imputarIndivisible(objs, 400, null)).toBe("b");
    expect(objs[1].restante).toBe(100);
    expect(imputarIndivisible([], 400, "fallback")).toBe("fallback");
  });
});

describe("clasificación de documentos", () => {
  it("detecta vencidos sin cobrar", () => {
    expect(esVencidoSinCobrar({ monto: 1, estado: "en_cartera", vencimiento: "2020-01-01" }, "2026-01-01")).toBe(true);
    expect(esVencidoSinCobrar({ monto: 1, estado: "cobrado", vencimiento: "2020-01-01" }, "2026-01-01")).toBe(false);
    expect(esVencidoSinCobrar({ monto: 1, estado: "en_cartera", direccion: "pago", vencimiento: "2020-01-01" }, "2026-01-01")).toBe(false);
  });

  it("detecta echeqs propios pendientes de débito", () => {
    expect(esEmitidoPendiente({ monto: 1, estado: "en_cartera", direccion: "pago", instrumento: "echeq" })).toBe(true);
    expect(esEmitidoPendiente({ monto: 1, estado: "pagado", direccion: "pago", instrumento: "echeq" })).toBe(false);
  });

  it("distingue el origen del documento", () => {
    expect(origenDocumento({ monto: 1, estado: "pagado", direccion: "pago", instrumento: "echeq" })).toBe("propio");
    expect(origenDocumento({ monto: 1, estado: "cedido", instrumento: "cesion" })).toBe("cedido");
    expect(origenDocumento({ monto: 1, estado: "en_cartera", direccion: "cobro", instrumento: "echeq" })).toBe("tercero");
  });
});

describe("saldo proyectado de caja", () => {
  it("resta emitidos pendientes y suma cobros en cartera", () => {
    expect(saldoProyectado(1000, [
      { monto: 300, estado: "en_cartera", direccion: "pago" },
      { monto: 500, estado: "en_cartera", direccion: "cobro" },
      { monto: 900, estado: "pagado", direccion: "pago" },
    ])).toBe(1200);
  });
});