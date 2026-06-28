import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Helper shadcn padrão pra combinar e dedupar classes Tailwind.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
