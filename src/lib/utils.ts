import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function orderCode(id: number): string {
  return `CF-${10000 + id}`;
}

export function parseOrderCode(code: string): number | null {
  const match = /^CF-(\d+)$/i.exec(code.trim());
  if (match) {
    const id = parseInt(match[1], 10) - 10000;
    return id > 0 ? id : null;
  }
  const asInt = parseInt(code, 10);
  return Number.isFinite(asInt) && String(asInt) === code.trim() ? asInt : null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
