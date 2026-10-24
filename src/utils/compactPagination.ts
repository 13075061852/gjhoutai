export type PaginationItem = number | 'ellipsis-left' | 'ellipsis-right';

/** At most five slots so arrows and page numbers fit a narrow phone. */
export function getCompactPagination(currentPage: number, totalPages: number): PaginationItem[] {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const current = Math.min(total, Math.max(1, Math.floor(currentPage) || 1));
  if (total <= 4) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 2) return [1, 2, 'ellipsis-right', total];
  if (current >= total - 1) return [1, 'ellipsis-left', total - 1, total];
  return [1, 'ellipsis-left', current, 'ellipsis-right', total];
}
