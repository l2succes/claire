# Claire — SVG AI prompt pack

Use these prompts at [SVG AI](https://www.svgai.org/). Generate each direction separately; do not ask the model for a sheet of logos. Download the SVG, then confirm that it contains real paths rather than an embedded image.

## 1. Resolve — recommended

```text
Minimal geometric symbol for Claire, an AI-native unified messenger. Three separate horizontal conversation threads enter from the left, curve smoothly toward the center, and resolve into one confident horizontal line exiting right. The convergence should feel calm and inevitable, not technical or network-like. No letter C and no speech bubble. Flat one-color vector in #10120F on a transparent background. 64x64 square composition, rounded terminals, thick consistent strokes, strong silhouette at 16px, maximum four paths, no text, no gradients, no shadows, no glow, no sparkle, no nodes, no fine detail. True editable SVG paths.
```

Refinement prompt:

```text
Reduce this to the fewest possible anchor points. Make the outgoing line slightly heavier than the three incoming threads. Keep equal visual spacing at 16px and remove any decorative detail.
```

## 2. Aperture

```text
Minimal optical logo symbol for Claire, derived from clarity and focus. Two solid offset planes create one perfectly crisp vertical beam in negative space, like a blurred view snapping into focus. Do not draw an eye, camera, sparkle, sun, letter C, or speech bubble. Flat one-color vector in #10120F on transparent background. Bold geometric silhouette, 64x64 square, balanced positive and negative space, maximum four simple closed paths, legible at 16px, no text, no gradients, no shadows, no glow, no thin lines. True editable SVG paths.
```

Refinement prompt:

```text
Make the central negative-space beam wider and unmistakable at favicon size. Remove symmetry if a small optical correction makes the mark feel more alive. Use fewer nodes.
```

## 3. Kept Thread

```text
Minimal continuous-line logo symbol for Claire, an AI messenger that remembers conversations and tracks promises. One thick thread enters, loops back through itself once without forming an infinity sign, and resolves at a distinct terminal point that suggests follow-through. No speech bubble, no letter C, no checkmark, no knot illustration. Flat vector in #10120F with an optional single terminal accent in #FF745F, transparent background. 64x64 square, rounded terminals, one continuous path, readable at 16px, no text, no gradients, no shadows, no glow, no sparkle, no fine detail. True editable SVG path.
```

Refinement prompt:

```text
Open the counter and simplify the loop so it remains clear at 16px. Keep one continuous stroke and make the terminal point feel intentional rather than decorative.
```

## Rejection checklist

- Reject any result that becomes a speech bubble, loading ring, generic network node, eye, checkmark, or four-point sparkle.
- Reject any SVG containing `<image>`, `data:image`, masks with raster content, or hundreds of path points.
- Preview in pure black at 16, 20, 24, 32, and 64px.
- The mark must remain recognizable with the accent color removed.
