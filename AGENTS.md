
- Employee attendance (Parte diario) lives in `fema_asistencias` (one code per employee/day); the Liquidador pre-marks AJ/AI/EN/LL as faltas. Why: single source for days worked without touching `fema_horas_trabajadas` history.
- `fema_empleado_prestamos.descontable` (default true) gates salary discounts; non-descontable debts are collected outside payroll. Why: own-merchandise purchases must not be deducted from wages.
