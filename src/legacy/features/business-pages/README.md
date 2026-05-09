# Business Pages Module

This directory owns the legacy business-center pages. The compatibility entry
at `../business-pages.ts` imports this folder so existing bootstrap imports keep
working while the large module is split into smaller files.

Planned split order:

- `dashboard.ts`: business overview widgets and quick actions.
- `orders.ts`: order constants, default rows, normalization, log normalization,
  and order formatting helpers.
- `orders`: order list, order details, invoice printing, and production plan
  render/event code still to split from `index.ts`.
- `inventory`: inventory categories, materials, and stock workflows.
- `archives`: supplier, customer, and personnel archive pages.
- `formulas`: formula library, formula editing, and related agent actions.
- `shared`: escaping, table/stat render helpers, storage helpers, and common UI
  snippets used by multiple business pages.
