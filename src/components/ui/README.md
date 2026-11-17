# Shared application components

Import primitives from `src/components/ui`. Their visual contract lives in
`components.css`, loaded after application layout and motion styles. Existing
`text-btn`, `icon-btn`, `field-label` and `seg` controls use the same contract.
The copied Broadser source and document rendering styles remain separate.

Buttons with visible text do not show tooltips. Icon-only buttons show a short
action name; keep their full accessible label in `aria-label`, and use
`data-tooltip` only when that label includes an object name or other context.
Do not put shortcuts or instructions in tooltips. `EditorTooltip` checks the
rendered label so responsive buttons follow the same rule when text is hidden.
Numeric inputs and their drag labels do not show tooltips.

| Component | Contract | Current consumers |
| --- | --- | --- |
| EmptyState | neutral icon, status title and description, recovery actions; roomy / compact / inline densities | libraries, search, panels and presentation |
| Button | quiet / secondary / primary / danger; optional danger tone for destructive utilities; sm / md / lg; native attributes; busy feedback disables repeated activation | font, resource and automatic layout actions; prototype insertion |
| IconButton | required accessible label; shared hit area and focus ring | all dialog close controls |
| ActionMenu | native popover; grouped actions; arrow navigation, Home/End, Escape and Tab dismissal; viewport-bounded placement | more insertion tools and inspector object utilities |
| PopoverPanel | native non-modal top layer; shared header/close target, scrolling body, anchored placement and focus return; fixed or content-driven height | quick settings, search and resource library |
| DialogHeader | common title, caption and close target | editor dialogs and the focused prototype viewer |
| SearchField | bound text; one container focus ring; optional result count | full font library |
| SegmentedControl | labeled native button group; pressed state; Left/Right/Home/End navigation; disabled options skipped | font source and UI motion preferences |
| DialogFooter | status on the left, actions on the right; common divider, spacing and surface; inset and stacked variants | font library, resource library, automatic layout, prototype form |
| Dialog | shared native top layer, title, header, close control, scrolling body and optional footer; standard, wide, resource, review and workspace layouts | every editor dialog, including automatic layout |

Use `tone="danger"` on quiet or secondary destructive Buttons and IconButtons,
`data-tone="danger"` on native buttons, and `tone: 'danger'` on menu items.
`feedback.css` keeps labels and icons on the same foreground. Inline utilities
use their normal neutral foreground at rest and danger red on hover, keyboard
focus and press; destructive menu items use danger red at rest. Disabled controls
use the same disabled foreground for labels and icons. The filled `variant="danger"`
keeps its contrasting foreground. Search/filter/selection clearing and favorites
toggles stay neutral.

Quick resource, search and settings panels share a 12px gutter, an 8px anchor
gap and 12px viewport clearance. Native `popover="auto"` keeps these sibling
panels exclusive and dismisses them on outside clicks. Escape and the header
close button dismiss the panel and return focus to its trigger; quick resource
filters and previews keep Back as a separate action. The frame clears the visible
toolbars, and More stays visible while content scrolls and opens the full Dialog.

## Dialog behavior

- Keep dismissal in `onclose`; native Escape and the close button use the same
  callback. The backdrop holds the current form or proposal until dismissal.
- Focus a meaningful heading, or an input marked `data-dialog-autofocus`.
  Search dialogs use this marker on desktop; small screens retain heading focus.
- Replacing dialog content resets its scroll position and moves focus into the
  new content. A new dialog title does not require a second modal instance.
- Restore the opening control after exit, using the canvas if that control was
  removed. An already-open dialog keeps ownership of focus during rapid changes.
- Header and footer stay in the frame. Long content scrolls inside the body;
  workspace dialogs use their own internal columns without changing the frame.
- Reveal the complete focused control within its actual scroll container after
  focus or body resizing. Inner workspace scrollers reserve a focus gutter;
  open popovers keep ownership of their own placement.
- Modal notifications occupy layout space and reserve a usable editing area.
  If the complete notice cannot fit, collapse it and pause its remaining lifetime
  until space returns. Recent notifications remains the untimed alternative.
  Deferring a focused notice returns focus to the last body control.
- UI motion and reduced-motion behavior are shared through `uiPresence` and
  `uiIndicator`. Document animation retains its own contract.

Overlay keyboard and focus details:

- `ui-modal-focus.ts` loads with modal views and wraps the visible Tab sequence.
  Controls inside collapsed `details` do not participate, including nested
  summaries hidden by an outer disclosure. Native modal isolation stays authoritative.
- Dialog handles an unconsumed Escape from its own controls explicitly. Nested
  dialogs, menus, editable widgets and popovers retain their own Escape first.
  Ignore composition events and key code 229; a tooltip does not consume the
  containing surface's dismissal.
- `popoverFocus` lets Tab continue from the invoker when reaching a boundary.
  A validated editor can return `false` from `close` to keep an invalid draft and
  its focus. A focus-out veto restores its invalid field or popup; successful
  departure keeps the next control's focus. Explicit canvas clicks stay on canvas.
- Deferred Search cancels its pending opening on Escape, Tab or an outside
  pointer action. Replacement after loading preserves focus only when the old
  trigger still owned it. Loading failures open the full recovery surface;
  DialogHeader is imported directly so recovery does not require the search chunk.
- Alignment, page layout and cell context menus follow `visualViewport` changes.
  Table cells expose actions with Shift+F10 or the Menu key; their inline editor
  retains its cell-navigation Tab/Enter contract.
- Publishing uses a dedicated, opaque sandbox frame and a source-checked parent
  handshake. Its hosted player policy is scoped to the preview route; the main
  application retains its script policy. The preview forwards unconsumed Escape
  to its parent; downloaded HTML contains no preview bridge. External prototype
  iframes own their keyboard events; preserve visible outer close controls and
  the normal Tab route back to them.

Desktop/mobile evidence and limitations: `output/overlays-20261016/README.md`.

Use native controls inside a shared primitive when the interaction is specialized
(a font listbox, color swatch, slide thumbnail or canvas handle). Preserve their
semantics rather than presenting them as ordinary action buttons.

## Component geometry

| Role | Value / rule |
| --- | --- |
| Composition spacing | 4 / 8 / 12 / 16 / 20 / 24 / 32px; related controls closer, sections farther apart |
| Small item / media radius | 4px; circles and functional swatches remain circular |
| Control / field radius | 8px |
| Popover / floating panel radius | 12px |
| Dialog radius | 16px desktop, 12px at small widths |
| Dialog gutter | 24px desktop, 16px at small widths; header, body and footer align |
| Popover gutter | 12px for compact resources, search, settings and canvas tools |
| Menu spacing | 4px shell inset / 8px inner row radius; font/command popovers use 8px shell inset / 4px row radius |
| Overlay placement | 8px from anchor, at least 12px from viewport edges |
| Border | One neutral 1px component boundary; subtle interior dividers; semantic selected/focus feedback |
| Elevation | `--shadow-floating`, `--shadow-popover`, `--shadow-modal`; resting groups remain flat |

Use the role aliases rather than inventing another corner or elevation value.
Control sizes have one source in `src/design-system.css`: `--control-sm/md/lg`
are 28/36/40px (small is 32px on phones), and `--control-touch` is 44px.
The copied `--ctl-*` names alias these roles. Keep size definitions in that token layer,
with component CSS consuming the roles instead of redefining their values.
Two-pixel optical gaps and six-pixel vertical control padding are exceptions for
dense chrome, not section spacing. Keep control height automatic when text grows.
Close controls, menu rows and segmented choices use 44px targets on coarse input;
compact desktop targets keep their own density. Wrapping footer actions stay
inside the frame, and scrolling bodies reserve space for keyboard focus.

This applies the principles in [Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview),
[popover guidance](https://www.carbondesignsystem.com/building-blocks/core/components/popover/guidelines)
and [modal guidance](https://www.carbondesignsystem.com/building-blocks/core/components/modal/guidelines).
The particular radius values are Decksprig's design decisions. W3C's
[minimum target criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
is 24px with exceptions; 44px is the more generous touch treatment used here,
not a claim that all desktop controls must be 44px.

## Workspace composition

`src/design-system.css` owns UI type, spacing, surfaces and contextual properties.
`src/workspace.css` owns the contextual toolbar and focus view. Use the shared
4/8/12/16/20/24/32 spacing scale for new UI; document layouts use their own units.
Keep text and media in the main toolbar. Put secondary insertion actions in
ActionMenu, preserving command-search access and native keyboard operation.

Focus view keeps editing active and preserves pane preferences. It offers page
navigation, zoom, source/editable switching, command search and an explicit exit.
Escape dismisses the innermost interaction before exiting focus. Toggle with
Shift + Command/Control + Backslash. Opening object properties exits focus and
shows the inspector; ordinary dialogs return to focus after closing.

## Task hierarchy

The UI task in `src/editor-priority.ts` is separate from document data and focus
layout. Its precedence prevents an old selection from making a reference or
unapplied AI preview look editable. Emphasis follows the active operation area;
a modal or side panel owns its local primary action.

| Stage | Foreground | Supporting or disclosed |
| --- | --- | --- |
| Browse/create | document previews and opening/creating a document | examples and import utilities |
| Compose | canvas, text/media insertion | neutral presentation/export; secondary insertions in menu |
| Select text / edit inline | content and type properties; quiet Edit text / Done commands | geometry below; copy, lock, ordering and delete in object menu |
| Select shape / multiple objects | appearance for a single shape; geometry/alignment for a group | lower-frequency object utilities |
| Reference | original render and Enter editing | read-only summary and import report; editable properties withheld |
| Generate AI proposal | scope, requirement and Generate proposal | model configuration quiet; one busy spinner and guarded submission |
| Review AI proposal | changes, then Preview / Apply | compose form withheld; fixed actions; stale proposals lead to editing a new request |
| Present | page content and playback controls | editor chrome hidden by the native presentation surface |

Reviewing an unapplied projection disables editing, clipboard mutations, history,
layout, imports, export and presentation controls. Commands/keyboard/drop paths
respect the same boundary. Returning to the current version restores editing;
application and undo continue to use the atomic core operation contract. Scope
editing in settings/dialog inputs retains its native keyboard behavior.

Small screens expand the AI pane for readable changes. Previewing returns focus
to the exposed canvas, with an explicit Review changes action to reopen the pane.
The action footer remains visible while proposal text scrolls.

Foreground content does not imply a filled primary control. Contextual toolbars
use quiet command buttons; their arrow keys move focus without invoking actions.
`editorToolbar` uses one Tab stop for three or more controls and ordinary grouped
buttons for smaller sets. Only real toggles expose `aria-pressed` and persistent
state. Tabs are reserved for switching associated content panels, not commands.
The editor has no global header. Document navigation occupies the top of the slide rail, with workspace tools and presentation at the top of the inspector. The canvas reaches the top edge. On compact screens or with hidden panes, these controls remain in small floating surfaces; source/editable switching lives beside Notes. Toolbar-end panel
visibility toggles live in Settings > Appearance > Workspace panels, with native
checkboxes and browser-local preferences. Presentation uses an outline icon. Scrollbar thumbs reveal on hover/focus for fine
pointers, retain their width, and remain available on touch and forced colors.
The one-pixel canvas edge belongs to the workspace shell, not document rendering.

Design references: [Carbon button emphasis and grouping](https://www.carbondesignsystem.com/building-blocks/core/components/button/guidelines),
[NN/G progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/),
[W3C focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).
[W3C toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) and
[tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) distinguish commands from
persistent content selection.
These inform the UI contract; the browser checks are not a claim of universal
WCAG conformance or external conversion fidelity.

## Typography roles

| Role | Size at 16px base | Weight | Line height | Color |
| --- | --- | --- | --- | --- |
| Compact control | 13px / .8125rem | 400; selected or primary 500 | 1.4 | primary; semantic action foreground |
| Reading paragraph | 14px / .875rem | 400 | 1.6 | primary or readable secondary |
| Field label | 12px / .75rem | 400 | 1.5 | secondary |
| Metadata / status | 12px / .75rem | 400 | 1.5 | secondary |
| Inspector section heading | 12px / .75rem | 500 | 1.5 | primary |
| Dialog title | 18px / 1.125rem | 600 | 1.4 | primary |

Utility and section glyphs use 16px, canvas creation glyphs use 18px, and small disclosures use 14px. Lucide UI glyphs use a 1.5-unit stroke. The navigation logo remains 24px with an independent 44px phone target. Document SVG artwork retains its own styling.

`src/design-system.css` owns size/weight/line-height tokens. Application controls
consume them; `src/typography.css` completes reading roles and allows controls,
headers and keycaps to grow with text. 12px is this product's compact metadata
floor, not a WCAG-prescribed universal minimum. Placeholders have no extra alpha
reduction. Normal text is checked against 4.5:1; inactive controls and logotypes
are handled as WCAG exceptions. This is bounded typography QA, not a declaration
of complete WCAG conformance.

Authored slide text, imported font metrics, font-library specimens, brand scale
and miniature motion diagrams retain their intentional typography. App controls
around them use these roles. Never apply UI spacing overrides inside a document
render or change source content to satisfy a UI audit.

Sources: [Carbon type sets](https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets),
[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html),
and [resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

## Interaction states and motion

| State | Feedback |
| --- | --- |
| Hover | Fine pointers receive a neutral surface or stronger field boundary |
| Press | Immediate stronger fill; target position and size stay fixed |
| Selected | Selection persists through hover and press, including settings navigation |
| Focus | One complete 2px keyboard outline; composite fields and rows own their outline |
| Disabled / busy | Disabled surfaces and borders stay still; busy retains its action label and one indicator |
| Touch | Release restores the resting or selected state without cached hover |
| Forced colors | Selected choices retain a 1px outline; focused choices use the 2px focus outline |

Command-button labels do not start text selection during a canceled press;
application prose, input values and editable document text retain their normal
selection behavior. Numeric/color-field hover never replaces an error boundary.

`src/feedback.css` completes state feedback after layout/type styles. Scoped
state rules must also hold when production extracts this as a shared stylesheet. Keep the
native disabled, pressed, selected and busy semantics on the responsible control.
Hover never invents selection: use a quiet neutral fill for enabled commands and
retain the persistent selected surface for real choices. Fine pointers receive
hover; touch retains press, focus and selection without sticky hover. Press
feedback is immediate, with no target scaling, thumbnail lift or extra edge.

Keyboard focus uses one complete outline. Font and command rows keep it inside
scrollports; the font row owns the ring instead of its inner choice. Disabled
controls keep their resting surface and do not animate or react to hover. Apply
one muted treatment to the control, preserving field values and group labels;
avoid fading both a fieldset and its children. `Button` also guards ARIA-disabled
pointer/key callbacks while keeping the control focusable.

Busy actions retain their name and readable opacity, disable duplicate activation
and show one indicator. Shared Buttons replace a leading icon with the spinner.
Mark the current import/export action, rather than every unavailable sibling, as
busy. Expose progress with a live status outside busy result regions; errors use
an alert and leave a supported recovery action. Resource skeletons stay still.
Photo-connection feedback reveals inside its own scroller, preserving the dialog.

UI timing roles in `app-motion.css` are 120ms feedback, 180ms reveal, 140ms exit,
240ms surface and 260ms layout. Use `uiPresence`, `uiChange`, `uiDisclosure` and
`uiIndicator` rather than a second timing vocabulary. Content replacement leaves live status and its
containers still. Disclosure makes closing content inert immediately and
restores focus; reversal/reduced motion settles to the latest user intent.
Application and OS reduced-motion preferences disable nonessential UI motion,
including native popovers, without changing authored slide playback/export.

These decisions follow [Carbon productive motion](https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview),
[loading guidance](https://www.carbondesignsystem.com/building-blocks/core/components/loading/guidelines),
[W3C status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
and [animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
The exact timing values are product choices; the checks are bounded browser
acceptance, not a claim of universal WCAG conformance.

## Responsive composition

`src/responsive.css` owns the application frame; component content still owns
its internal reflow. Use available container space for content layouts, and
`src/ui-viewport.ts` for floating surfaces.

| Workspace | Composition |
| --- | --- |
| Above 1100px | Slide rail, canvas, inspector; saved widths remain adjustable |
| 761–1100px | Canvas and inspector; horizontal slide rail below the canvas |
| At most 760px | Canvas above a docked inspector; expand for detailed editing or close to return to the full canvas |
| At most 1100px wide and 520px high | Temporarily hide the slide rail; retain previous/next page actions |

Resizing changes the displayed inspector width, preserving its saved desktop
width and pane visibility. Compact canvas docks participate in footer layout
instead of overlapping utilities. Hidden panel views are `hidden` and `inert`;
the docked phone inspector keeps the canvas available. Focus on editing panel hides the background; toggle it off or close the panel to return to the canvas.
Short touch workspaces also keep the labeled dock in normal flow: two rows of
tools determine the footer height rather than overflowing an 80px desktop frame.

Dialogs use the visual viewport with 24px outer clearance on larger screens and
12px on phones. Headers and actions remain within the frame; long bodies scroll.
Popovers use an 8px anchor gap and 12px viewport clearance, choose above/below,
and constrain their scrollport. If neither side has enough usable height, they
use the available visible rectangle. Keyboard viewport offsets and resize/scroll
changes update placement. Specialized font and object pickers share this
geometry; compact font menus prioritize readable choices with a native category
selector and a fixed library entry, adapting to enlarged UI text; a nested popover owns Escape before its containing dialog.

Small settings navigation uses adaptive columns and wrapping labels. Enlarged
UI text must change layout rather than overlap adjacent controls. Two-dimensional
slide content remains authored at its document size; surrounding controls reflow
independently, following [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
The breakpoint values and 44px touch controls are product choices, informed by
[Carbon's responsive grid](https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview)
and [W3C target guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Validate desktop, portrait/landscape tablet, phone, 320px width, short visible
height, saved pane widths, open-overlay rotation, enlarged text, and long review
content against a frozen production build. Browser viewport simulations do not
establish physical mobile Safari keyboard or assistive-technology acceptance.


## Empty states

Use EmptyState for missing content, search misses and unmet setup prerequisites. Roomy states use the dialog-title and reading roles with 32px padding; compact list/popup states use a 14px title, 12px description and 24px padding; inline guidance fits inside existing panel sections. All use the same neutral icon surface, spacing scale and wrapping action row. The workspace start view keeps its actual template previews and larger composition.

Explain the state in a short heading and one sentence, then provide a supported next step. Clear or reset search for no matches, browse for empty favorites/recent lists, and settings for missing configuration. Keep data-loss errors distinct from empty results. Loading exposes busy status and one spinner. Status contains only the title and description; recovery buttons remain outside it. Preserve component-specific keyboard and focus-return behavior, touch targets, document provenance and storage contracts.

Regional loading and failure views use FeedbackState over EmptyState densities. Inline action feedback uses Notice. Put live copy outside busy result containers; recovery actions stay outside live copy. Use one spinner per action and retain the action label. Set Notice indicator=false when its action button already shows progress. Failed module imports offer Refresh app because browsers may cache a failed module request. Preserve entered values after recoverable failures.

## Numeric fields

Use `NumberField` for numeric properties and drafts, including compact chart
cells. Set `preset` to the semantic family (font, spacing, duration, percent,
count, etc.); use `presets` for contextual values such as slide fractions. The
control filters suggestions against the field's range and step. Keep arbitrary
text/table content in its existing text editor.

The prefix is a drag handle. Horizontal dragging previews values, Shift uses
larger steps, Alt adds precision to fractional fields, and Escape cancels the
gesture. A document gesture makes one undo entry even after a pause; a draft
gesture restores only its draft value. An external revision ends the gesture.
Click the input for presets; Alt + Down focuses the options. Escape dismisses
that menu before its containing dialog. Empty/invalid drafts stay visible and
must block Apply; draft forms can use `numericFieldValidity()` to collect child
validity, including conditionally mounted fields. Use `oninput` to preserve raw
draft edits and `onchange` to accept valid numeric changes. NumberField owns
keyboard arrows; data grids may provide `onkeydown` and `onpaste` to preserve
cell navigation and tabular paste.


## Inspector property controls

Use `PropertyRow` for labeled color and compact select rows, and
`ui-property-input` for native selects, URLs and text drafts. Use
`ui-property-check` on native checkbox labels. Keep the frame at 36px on
desktop and 48px on touch (44px internal targets). Do not add a separate
stacked numeric variant. Pair coordinates and dimensions; give longer
numeric labels their own row. Show px, %, degrees or ms on the field.
Use 16px action/section glyphs and 14px disclosure/numeric glyphs.
Reserve icons for established meanings (rotation, radius, alignment, sizing);
use short property names for other numeric handles, never an empty prefix.
