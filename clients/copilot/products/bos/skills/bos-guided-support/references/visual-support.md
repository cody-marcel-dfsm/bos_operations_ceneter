# Visual support protocol

## Default support card

Keep the reply visually scannable:

**Goal:** one sentence

`Install ✓ → Load ✓ → Register ● → Sign in ○ → Discover ○ → Verify ○`

**Do this now:** one exact action

**You should see:** one concrete result

**If it differs:** ask for one screenshot or sanitized error

## Screenshot intake

Request the full relevant application window, including the title/header,
sidebar, connection state, and complete error. Ask the user to cover unrelated
personal data. The user may photograph a screen when native capture is hard;
accept it and work from visible evidence.

Inspect:

- client identity and surface;
- visible version or package version;
- exact labels, badges, disabled states, banners, and error text;
- whether a browser consent window belongs to BOS or an underlying provider;
- evidence of the last completed state-machine stage.

Do not infer a successful click from a button being visible.

## Annotation

When an image editing or annotation tool is callable:

1. Duplicate the screenshot and preserve the original.
2. Crop only when the surrounding navigation is still understandable.
3. Add one high-contrast circle or rounded rectangle around the next control.
4. Add one arrow and a `1` marker when location is ambiguous.
5. Dim irrelevant regions lightly; never cover the error or navigation context.
6. Add a short caption outside the UI: `1. Select Connect`.
7. Return the annotated image plus accessible text naming the control and path.

Use a second annotation only when two clicks occur on the same already-open
screen. Otherwise wait for the next screenshot so the visual matches reality.

When annotation is unavailable, give a four-part locator:
`screen → section → visible label → nearby landmark`.

## Vendor visuals

Use current official vendor documentation to orient the user when their own
screenshot is unavailable. Label it **Vendor example** and state that minor UI
differences may exist. Link the exact official page. Never fabricate a vendor
screenshot or present a conceptual graphic as live UI.

## Accessibility and tone

- Repeat every visual instruction in short text.
- Avoid color-only meaning; use `✓`, `●`, `○`, labels, and numbering.
- Use exact button text in bold.
- Keep each instruction to one action and one expected result.
- Use calm, direct language. Treat hesitation as a design constraint, never as
  a user deficiency.
