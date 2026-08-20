# UI State Screens (Figma-ready)

`rp-field-tech-states.svg` is a single design page containing the app's key UI
states as 375×812 phone artboards, drawn from the live brand tokens and styles:

1. **Splash** — logo + "Field Tech Assistant" + spinner
2. **Welcome (light)** — empty chat with the intro card
3. **Conversation (light)** — user + assistant bubbles with a source citation
4. **Conversation (dark)** — the dark theme
5. **Chat history drawer** — the left panel open over the transcript
6. **Chat options menu** — the per-chat ⋮ menu (Rename / Export / Delete)
7. **Profile & logout** — the profile popover

## Import into Figma

Figma imports SVG as fully editable layers (frames, vectors, and live text):

1. In a Figma file: **drag `rp-field-tech-states.svg` onto the canvas**, or
   use **Menu → File → Place image / Import**.
2. It arrives as one group containing all seven artboards. To make each a
   standalone frame, select an artboard group and use **Frame selection**
   (⌥⌘G / right-click → Frame selection).
3. Fonts map to Syne / Nunito Sans / JetBrains Mono; if they aren't installed
   Figma substitutes a fallback but the text stays editable.

## Regenerate

`generate_states_svg.py` rebuilds the SVG from the tokens and the PNG logos in
`public/`. Run it after brand or layout changes:

```bash
python docs/design/generate_states_svg.py
```
