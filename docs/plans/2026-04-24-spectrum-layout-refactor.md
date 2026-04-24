# Spectrum Layout Refactor Plan

**Goal:** Refactor the spectrum analysis page layout so desktop, tablet, and small-screen modes have clear ownership and no longer rely on overlapping patches.

**Core Decision:** Stop treating the detail editor as a third desktop column that is merely squeezed on small screens. Refactor it into a dedicated responsive region: desktop uses a right-side detail panel, tablet/mobile uses a normal stacked editor or drawer-like block that participates in layout.

---

## Why Refactor

Current symptoms show structural layout conflict:

- `.spectrum-workbench` is desktop grid, but responsive CSS partially turns it into flex/stacked layout.
- `.spectrum-detail-panel` still carries desktop animation and transform rules when the screen is narrow.
- `.spectrum-gallery` keeps desktop scroll/height assumptions in some states.
- Detail form fields are visually layered above gallery cards, which means the DOM flow and painted position disagree.
- Multiple breakpoints are trying to solve the same layout responsibility.

Small CSS patches can fix one screenshot, but the next width or state will break again.

---

## Refactor Target

### Desktop `> 1200px`

Keep the familiar three-zone layout:

```text
Toolbar
Filters | Gallery | Detail
```

Rules:

- Workbench owns the grid columns.
- Gallery owns internal scrolling.
- Detail panel may animate collapse/expand.
- Filter list and selected list keep independent scroll.

### Tablet `768px - 1200px`

Use a stacked layout:

```text
Toolbar
Filters
Gallery
Detail
```

Rules:

- No right-side detail column.
- Detail panel is a full-width block below gallery.
- Gallery height is natural, not fixed to `height: 0`.
- Collapse detail means `display: none`, not invisible overlay.

### Mobile `< 768px`

Use compact single-column layout:

```text
Toolbar
Category / Selected
Gallery
Detail
```

Rules:

- Toolbar controls wrap into predictable rows.
- Gallery cards become one-column.
- Detail form fields stack.
- Action buttons stack or use equal-width rows.
- No horizontal page scroll.

---

## Implementation Tasks

### Task 1: Split Layout Responsibility

**Modify:** `assets/css/pages.css`

Keep only desktop/base layout here:

- `.spectrum-page`
- `.spectrum-toolbar`
- `.spectrum-workbench`
- `.spectrum-filter-panel`
- `.spectrum-gallery-panel`
- `.spectrum-detail-panel`

Remove small-screen assumptions from this file where they conflict with responsive behavior.

Expected result: `pages.css` defines the default desktop experience only.

---

### Task 2: Rebuild Responsive Spectrum Section

**Modify:** `assets/css/responsive.css`

Create a dedicated spectrum responsive section with three clear blocks:

```css
@media (max-width: 1200px){ ... }
@media (max-width: 900px){ ... }
@media (max-width: 640px){ ... }
```

Rules to enforce at `max-width: 1200px`:

```css
.spectrum-page{
  height:auto;
  min-height:0;
  overflow:visible;
}

.spectrum-workbench{
  display:grid;
  grid-template-columns:minmax(0, 1fr);
  grid-template-rows:auto auto auto;
  height:auto;
  overflow:visible;
}

.spectrum-filter-panel,
.spectrum-gallery-panel,
.spectrum-detail-panel{
  overflow:visible;
}

.spectrum-gallery{
  height:auto;
  overflow:visible;
}

.spectrum-workbench.is-detail-collapsed .spectrum-detail-panel{
  display:none;
}
```

Expected result: detail panel can never paint over gallery cards on tablet/mobile.

---

### Task 3: Normalize Detail Panel States

**Modify:** `assets/css/pages.css`
**Modify:** `assets/css/responsive.css`

Desktop detail behavior:

- Supports slide/fade collapse animation.
- Uses grid column width transition.

Small-screen detail behavior:

- No translate animation.
- No zero-width grid column.
- Collapse becomes block show/hide or height/fade animation.

Expected result: one state variable can exist, but each breakpoint renders it differently.

---

### Task 4: Stabilize Gallery Card Layout

**Modify:** `assets/css/pages.css`
**Modify:** `assets/css/responsive.css`

Keep card internals predictable:

- Fixed card height only in grid mode.
- Image area flexes.
- Body area fixed.
- Tags hidden in grid mode.
- List mode has separate rules and does not inherit grid card height.

Expected result: card text, date, and image never overlap or get clipped.

---

### Task 5: Simplify Toolbar Layout

**Modify:** `assets/css/responsive.css`

Toolbar structure by breakpoint:

- Desktop: search + filters + view switch on one row when space allows.
- Tablet: search first row, mode/view controls same row, action buttons next row.
- Mobile: all rows stack, buttons wrap.

Expected result: toolbar never creates hidden overflow or forces the workbench narrower than available space.

---

### Task 6: Optional HTML Cleanup

**Modify only if CSS alone remains brittle:** `index.html`

Consider wrapping the gallery/detail pair:

```html
<div class="spectrum-content-area">
  <section class="spectrum-gallery-panel">...</section>
  <aside class="spectrum-detail-panel">...</aside>
</div>
```

Desktop:

```text
Filters | Content Area
         Gallery | Detail
```

Tablet/mobile:

```text
Filters
Gallery
Detail
```

Expected result: fewer global grid rules on `.spectrum-workbench`.

This step is optional. Prefer CSS-only first unless the existing DOM keeps forcing exceptions.

---

## Verification Checklist

Test these widths:

- `1440px`: desktop three-column layout remains good.
- `1280px`: desktop still stable.
- `1200px`: transition to stacked layout is clean.
- `1024px`: screenshot failure must disappear.
- `900px`: detail panel is below gallery, not above it.
- `768px`: controls wrap cleanly.
- `390px`: no horizontal scroll, no overlap.

Test these states:

- Detail expanded.
- Detail collapsed.
- Grid view.
- List view.
- No selected images.
- Several selected images.
- Upload button.
- Print button enabled after selecting images.
- AI button.

---

## Recommended Commit Strategy

Commit 1:

```text
refactor: separate spectrum responsive layout rules
```

Commit 2:

```text
fix: stabilize spectrum detail panel on small screens
```

Commit 3:

```text
fix: normalize spectrum gallery cards across breakpoints
```

Commit 4:

```text
test: document spectrum responsive verification
```
