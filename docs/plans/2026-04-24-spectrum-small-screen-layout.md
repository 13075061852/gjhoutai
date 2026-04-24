# Spectrum Small Screen Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the spectrum analysis page so the toolbar, gallery, and detail editor display in a stable single-column flow on small screens without overlap or clipping.

**Architecture:** Keep the desktop three-column layout in `assets/css/pages.css`, and make `assets/css/responsive.css` own the mobile/tablet layout. On small screens, the workbench becomes a normal document-flow stack: toolbar, gallery, then optionally the detail editor. The detail panel must not visually float over the gallery unless it is intentionally implemented as a drawer.

**Tech Stack:** Plain HTML, CSS, vanilla JavaScript, existing responsive CSS breakpoints.

---

### Task 1: Reproduce And Define Breakpoints

**Files:**
- Inspect: `assets/css/pages.css`
- Inspect: `assets/css/responsive.css`
- Inspect: `index.html`

**Step 1: Test current layout widths**

Open the spectrum analysis page and capture screenshots at these widths:
- `1440px`: desktop baseline
- `1200px`: first responsive breakpoint
- `1024px`: screenshot-like failure zone
- `900px`: tablet/narrow desktop
- `768px`: small tablet
- `390px`: mobile

Expected: At `1024px` and below, confirm whether the detail panel overlays the gallery, whether gallery content is clipped, and whether toolbar controls wrap cleanly.

**Step 2: Decide breakpoint ownership**

Use these breakpoints:
- `> 1200px`: desktop, three columns
- `901px - 1200px`: two-zone layout where detail becomes a full-width block under gallery
- `<= 900px`: strict single-column mobile layout
- `<= 640px`: compact controls and one-column cards

Expected: No breakpoint should leave `grid-template-columns: 220px minmax(360px,1fr) 320px` active when the viewport cannot hold it.

---

### Task 2: Make The Workbench Stack Safely On Small Screens

**Files:**
- Modify: `assets/css/responsive.css`

**Step 1: Replace mixed grid/flex rules under `@media (max-width: 1200px)`**

Update `.spectrum-workbench` so it has one clear model:

```css
@media (max-width: 1200px){
  .spectrum-workbench{
    display:grid;
    grid-template-columns:minmax(0,1fr);
    grid-template-rows:auto auto auto;
    height:auto;
    min-height:0;
    overflow:visible;
  }
}
```

Expected: The detail panel can no longer occupy the same visual area as the gallery.

**Step 2: Assign explicit order**

Add/confirm:

```css
@media (max-width: 1200px){
  .spectrum-filter-panel{order:1}
  .spectrum-gallery-panel{order:2}
  .spectrum-detail-panel{order:3}
}
```

Expected: 分类, 图谱库, 详情编辑 appear in a predictable vertical order.

**Step 3: Neutralize collapsed-detail desktop animation in stacked layout**

Add:

```css
@media (max-width: 1200px){
  .spectrum-workbench.is-detail-collapsed{
    grid-template-columns:minmax(0,1fr);
  }
  .spectrum-workbench.is-detail-collapsed .spectrum-detail-panel{
    display:none;
  }
}
```

Expected: When detail is collapsed, it does not leave blank space or an invisible overlay.

---

### Task 3: Give Gallery And Cards Natural Height On Small Screens

**Files:**
- Modify: `assets/css/responsive.css`
- Modify only if needed: `assets/css/pages.css`

**Step 1: Remove desktop scroll container behavior**

At `max-width: 1200px`, ensure:

```css
.spectrum-gallery{
  height:auto;
  min-height:0;
  overflow:visible;
}
```

Expected: The page scrolls naturally; the gallery no longer clips rows behind the detail form.

**Step 2: Tune grid columns**

Use:

```css
@media (max-width: 1200px){
  .spectrum-gallery.is-grid{
    grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  }
}
@media (max-width: 640px){
  .spectrum-gallery.is-grid{
    grid-template-columns:1fr;
  }
}
```

Expected: Cards stay readable and do not squeeze into unusable widths.

**Step 3: Preserve card height rules**

Confirm existing rules remain active:
- `.spectrum-gallery.is-grid .spectrum-card { height:190px; }`
- `.spectrum-gallery.is-grid .spectrum-card-body { flex:0 0 64px; }`

Expected: Card title and type/date area are not clipped after responsive changes.

---

### Task 4: Make The Detail Editor Mobile-Safe

**Files:**
- Modify: `assets/css/responsive.css`

**Step 1: Reset transform and transitions in stacked layout**

Add:

```css
@media (max-width: 1200px){
  .spectrum-detail-panel{
    opacity:1;
    transform:none;
    max-height:none;
    overflow:visible;
  }
}
```

Expected: The detail form participates in layout and cannot visually cover gallery cards.

**Step 2: Make form controls stack**

At `max-width: 900px`, enforce:

```css
.spectrum-detail-form{
  grid-template-columns:1fr;
}
.spectrum-detail-tag-editor{
  grid-template-columns:minmax(0,1fr) auto;
}
.spectrum-detail-actions{
  display:grid;
  grid-template-columns:1fr;
}
```

Expected: Name, category, date, tags, notes, and action buttons no longer overlap.

**Step 3: Hide preview image only at narrow widths**

Keep:

```css
@media (max-width: 1200px){
  .spectrum-detail-image{display:none}
}
```

Expected: The detail editor becomes compact without losing the editable fields.

---

### Task 5: Stabilize Toolbar Wrapping

**Files:**
- Modify: `assets/css/responsive.css`

**Step 1: At `max-width: 1200px`, make toolbar controls wrap into rows**

Use:

```css
.spectrum-toolbar-row{
  display:grid;
  grid-template-columns:1fr;
}
.spectrum-toolbar-main{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto;
}
.spectrum-toolbar-actions{
  display:flex;
  flex-wrap:wrap;
  overflow:visible;
}
```

Expected: Search, type tabs, view switch, upload, print, and AI buttons do not collide.

**Step 2: At `max-width: 640px`, stack mode controls under search**

Use:

```css
.spectrum-toolbar-main{
  grid-template-columns:1fr;
}
.spectrum-mode-switch,
.spectrum-view-switch{
  justify-self:start;
}
```

Expected: No horizontal overflow on phone-sized screens.

---

### Task 6: Verify Behavior

**Files:**
- Verify: `assets/css/responsive.css`
- Verify: `assets/css/pages.css`

**Step 1: Static CSS scan**

Run:

```powershell
Select-String -Path .\assets\css\responsive.css -Encoding UTF8 -Pattern "spectrum-workbench|spectrum-detail-panel|spectrum-gallery|spectrum-toolbar"
```

Expected: No contradictory `display:flex` and `grid-template-columns` rules exist in the same breakpoint block for `.spectrum-workbench`.

**Step 2: Browser screenshot checks**

Check:
- `1200px`: detail appears below gallery or can be collapsed cleanly
- `1024px`: no overlay, no clipped form fields
- `768px`: toolbar wraps, gallery cards remain readable
- `390px`: single-column layout, no horizontal page scroll

Expected: The screenshot failure no longer reproduces.

**Step 3: Interaction checks**

Verify:
- Expand/collapse detail button works
- Sort dropdown remains clickable
- Upload dialog still opens
- Print button enabled state still follows selected images
- Gallery card selection still works

Expected: Responsive CSS changes do not break existing JavaScript interactions.

---

### Task 7: Commit

**Files:**
- Commit: `assets/css/responsive.css`
- Commit if touched: `assets/css/pages.css`
- Commit: `docs/plans/2026-04-24-spectrum-small-screen-layout.md`

**Step 1: Review diff**

Run:

```powershell
git diff -- assets/css/responsive.css assets/css/pages.css docs/plans/2026-04-24-spectrum-small-screen-layout.md
```

Expected: Diff only contains responsive layout fixes and this plan.

**Step 2: Commit**

Run:

```powershell
git add assets/css/responsive.css assets/css/pages.css docs/plans/2026-04-24-spectrum-small-screen-layout.md
git commit -m "fix: stabilize spectrum layout on small screens"
```

Expected: Commit succeeds after visual verification.
