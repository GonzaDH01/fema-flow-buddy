import { ReactNode } from "react";
import { Pencil, Trash2, Plus, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function CrudTable<T extends { id: string }>({
  title,
  description,
  rows,
  loading,
  columns,
  onAdd,
  onEdit,
  onDelete,
  emptyLabel = "registros",
  extraHeader,
  hideAdd,
}: {
  title: string;
  description?: string;
  rows: T[] | undefined;
  loading: boolean;
  columns: Column<T>[];
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  emptyLabel?: string;
  extraHeader?: ReactNode;
  hideAdd?: boolean;
}) {
  return (
    <div className="p-4 md:p-6">
      <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:mb-6 md:flex md:flex-wrap md:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold tracking-tight sm:text-xl md:text-2xl">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{description}</p>}
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-auto">
          {extraHeader}
          {!hideAdd && onAdd && (
            <Button onClick={onAdd} size="sm" className="md:h-10 md:px-4">
              <Plus className="mr-1.5 h-4 w-4" /> Nuevo
            </Button>
          )}
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.header} className={c.className}>{c.header}</TableHead>
              ))}
              {(onEdit || onDelete) && <TableHead className="w-24 text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.header}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                  {(onEdit || onDelete) && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                </TableRow>
              ))
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8" />
                    <p>No hay {emptyLabel} todavía</p>
                    {!hideAdd && onAdd && (
                      <Button size="sm" variant="outline" onClick={onAdd}>
                        <Plus className="mr-1.5 h-4 w-4" /> Agregar primero
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.header} className={c.className}>{c.cell(row)}</TableCell>
                  ))}
                  {(onEdit || onDelete) && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {onEdit && (
                          <Button size="icon" variant="ghost" onClick={() => onEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {onDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción no se puede deshacer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(row)}>
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}