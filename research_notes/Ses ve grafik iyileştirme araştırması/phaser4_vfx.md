# Phaser 4 VFX capabilities and card/tactics game "juice" for OnChainBattles

Method note: phaser.io and cdn.jsdelivr.net were **blocked by this session's network allowlist**, so the official news posts and the hosted migration guide could not be fetched directly. Primary-source facts about Phaser 4 come instead from (a) the GitHub releases page and (b) **the Phaser package installed in this repo** (`node_modules/phaser`, version `4.0.0-rc.6`). It ships its own changelogs (`node_modules/phaser/changelog/4.0/*.md`), the official long-form doc `Phaser 4 Rendering Concepts.md`, and JSDoc'd source. Local paths are cited as primary sources. The game feel and accessibility material comes mostly from search snippets and secondary write-ups, and it is flagged that way below.

Project facts checked locally: `package.json` uses `"phaser": "^4.0.0-rc.6"` and the installed version is `4.0.0-rc.6`. `src/main.ts` sets `type: Phaser.WEBGL` and `roundPixels: true`. Only `src/deck/DeckEditorView.ts` mentions anything filter-like, so the codebase uses essentially no Phaser filters today.

---

## Q1. Phaser 4 status, renderer architecture, changes vs Phaser 3, breaking changes, stability

### Takeaway
Phaser 4 is stable and has moved past the project's RC6. 4.0.0 shipped on 10 Apr 2026, 4.1.0 on 30 Apr 2026, 4.2.0 on 19 Jun 2026 and 4.2.1 on 9 Jul 2026. The WebGL renderer was rewritten around RenderNodes, and FX and masks were folded into one Filter system. Several features that matter for VFX arrived only after RC6: Vignette, Wipe, GradientMap, Quantize, `Actions.AddEffectBloom/Shine`, the Gradient and Noise objects, and the tint-mode overhaul. Upgrading to 4.2.x is low-risk but includes one breaking tint change.

### Cited Findings
- Release timeline: 4.0.0 RC3 16 May 2025, RC4 23 May 2025, RC5 22 Aug 2025, **RC6 23 Dec 2025**, **RC7 25 Mar 2026**, **4.0.0 stable 10 Apr 2026** ("first stable Phaser 4 release"), **4.1.0 30 Apr 2026** (Layer becomes a true GameObject, filters work on Layers, DynamicTextures can use mipmaps), **4.2.0 19 Jun 2026** (Stencil/StencilReference, alpha strategies, CustomContext, Mesh2D, cone lights, `TintModes.MULTIPLY_TWO`), **4.2.1 9 Jul 2026** (bug fixes). The page listed RC and 4.0.0 dates without years, so the years are inferred from release order. — [GitHub releases](https://github.com/phaserjs/phaser/releases)
- Architecture: "Phaser 4 is a total overhaul of the WebGL rendering engine." Phaser 3 pipelines were replaced by **RenderNodes**. Each node handles one rendering task, exposes `run`, and some also expose `batch`. Game objects keep `defaultRenderNodes` and `customRenderNodes` maps. WebGL state is now managed, which also enables context restoration. (The examples refer to this renderer as "Beam", for instance "Beam Examples" in the beta-2 notes.) — `node_modules/phaser/changelog/4.0/Phaser 4 Rendering Concepts.md`; `CHANGELOG-v4.0.0.md` ("Fix Extern and extend its rendering potential (see Beam Examples)")
- Phaser 3 problem that motivated the rewrite: rendering solutions shared WebGL state, so "some kinds of FX (but not all) would mess up a Mask." — Rendering Concepts.md
- Removed in v4: Pipelines, the derived FX (`Bloom`, `Gradient`, `Shine`, `Vignette`, `Wipe`), `Mesh` and `Plane`, `BitmapMask`, and `Point`, which became `Vector2`. "`GeometryMask` remains available in the canvas renderer, but not in WebGL." — Rendering Concepts.md
- **FX and masks became Filters.** "Filters can be applied to any game object or scene camera," with no preFX/postFX split. Filters come in **internal** lists, which affect only the object and follow its position, and **external** lists, which affect the object in its rendering context, usually the full screen. Objects with no width or height, and Shapes, use the external space. Shapes can opt out with `shape.filtersFocusContext = false`. — Rendering Concepts.md
- The ColorMatrix API moved, so `colorMatrix.sepia()` becomes `colorMatrix.colorMatrix.sepia()`. New filters in 4.0 are Blend (all canvas blend modes, plus overdrive), Mask, ParallelFilters, Sampler and Threshold. — Rendering Concepts.md
- The official recipe for bloom under v4: "the Bloom filter can be recreated using ParallelFilters with a top pass of Threshold and Blur to select bright tones and spread them out, blended onto the bottom pass with ADD." — Rendering Concepts.md
- **RC7 additions** (not in our RC6):
  - New filters `CombineColorMatrix`, `GradientMap`, `Key`, `ImageLight`, `PanoramaBlur`, `NormalTools` and `Quantize`. `Vignette` and `Wipe` return.
  - New actions `Actions.AddEffectBloom`, `Actions.AddEffectShine`, `Actions.AddMaskShape` (blurred edges, inversion) and `Actions.FitToRegion`.
  - New game objects `GameObjects.Gradient` (LINEAR, BILINEAR, RADIAL, CONIC_*, with optional dithering) and `GameObjects.Noise`, plus the `NoiseCell2D/3D/4D` and `NoiseSimplex2D/3D` variants.
  - New `Phaser.TintModes`: `MULTIPLY`, `FILL`, `ADD`, `SCREEN`, `OVERLAY`, `HARD_LIGHT`, set through `setTintMode()`.

  — [GitHub release v4.0.0-rc.7](https://github.com/phaserjs/phaser/releases/tag/v4.0.0-rc.7)
- **Breaking tint change (RC7/4.0):** `tintFill` and `setTintFill()` were removed. Migrate with `foo.setTint(color).setTintMode(Phaser.TintModes.FILL)`. `setTint()` now affects only color and no longer silently switches off fill mode. RC6 still has `setTintFill` (`node_modules/phaser/src/gameobjects/components/Tint.js:174`). — [GitHub rc.7 release](https://github.com/phaserjs/phaser/releases/tag/v4.0.0-rc.7); [GitHub releases](https://github.com/phaserjs/phaser/releases)
- Other breaking or behavior changes after RC6:
  - Custom filters should call `getPaddingCeil()` instead of `getPadding()` (4.1.0).
  - In 4.2.0 the stencil test is enabled by default with `gl.EQUAL`, the shader attribute `inTintEffect` changed from float to vec4, and custom shaders must implement alpha strategies themselves.
  - Filters no longer render with mipmaps (4.1.0).

  — [GitHub releases](https://github.com/phaserjs/phaser/releases)
- RC6 itself added `Texture#setWrap()` and `WrapMode` (REPEAT and MIRRORED_REPEAT need power-of-two sizes). It fixed the Glow `knockout` behavior, a ParallelFilters memory leak, Container blend modes leaking into children's filters, the Mask filter overdrawing on odd-size resizes, and a Timeline `once` bug. — `node_modules/phaser/changelog/4.0/CHANGELOG-v4.0-rc.6.md`
- RC4 performance: "A game that was bottlenecked by filters on mobile devices may experience speedups of 16x or more." In the same release `TileSprite` dropped texture cropping. — `CHANGELOG-v4.0-rc.4.md`
- Other 4.0 changes: `DynamicTexture`/`RenderTexture` **must call `render()`** to draw, and gained `capture()`, `preserve()` and `callback()`. RenderTexture has a `renderMode` of "render", "redraw" or "all". `Math.TAU` is now 2π and `Math.PI2` is removed. `Geom.Point` became `Vector2`. `Shader` objects must be rewritten around a `ShaderQuadConfig`, Shadertoy-style uniforms are no longer automatic, and texture coordinates use GL convention (Y=0 at the bottom). — `CHANGELOG-v4.0.0.md`; Rendering Concepts.md
- Phaser's own team describes the migration in a news post, and a migration guide ships in the npm package (4.1.0 and 4.2.0 builds) at `changelog/v4/4.0/MIGRATION-GUIDE.md`. Search snippets of the guide confirm the points above, including "Lighting: In v4 it is a single method call: setLighting(true)." — [Phaser news: migrating 3→4](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know.md) (snippet only, fetch blocked); [jsDelivr MIGRATION-GUIDE.md 4.2.0](https://cdn.jsdelivr.net/npm/phaser@4.2.0/changelog/v4/4.0/MIGRATION-GUIDE.md) (snippet only, fetch blocked)
- Phaser published a dedicated Filter System explainer in May 2026. Per the search snippet, it presents bloom, shine and circle masking as set up through the `Actions.AddEffect*` and `AddMaskShape` helpers. — [phaser.io news, May 2026](https://phaser.io/news/2026/05/phaser-4-filter-system) (snippet only, fetch blocked)

### Inferences
- Our RC6 is about 10 months behind 4.2.1. Bumping to `^4.2.1` would bring:
  - Vignette, GradientMap, AddEffectBloom and AddEffectShine.
  - The Gradient object, which is useful for board backgrounds and spell telegraphs without any image assets.
  - Tint modes like ADD/SCREEN, which give hit flashes without a filter.
  - Fixes to filters on Layers.
- The only API break likely to hit our code is `setTintFill`, so grep for it before upgrading. The 4.2.0 stencil defaults matter only if we write custom render code.
- The RC series was largely bug-fix work after RC5, and stable has now had several point releases. Staying on RC6 carries more risk than upgrading.

### Gaps
- Could not read the full official MIGRATION-GUIDE.md or the phaser.io Filter System article because the domains are blocked. Allow `phaser.io` and `cdn.jsdelivr.net` in the session's network settings to verify the exact `AddEffectBloom` signature and the Vignette parameters.
- No information found on whether there is a 4.3 release or anything newer than 4.2.1 as of Nov 2026. The releases page listed 4.2.1 as the newest.

---

## Q2. Concrete Phaser 4 features for glow, bloom, blur, grading, lighting, particles, shake, render textures, masks, nine-slice, text and DPI

### Takeaway
Everything needed for selection glow, modal blur, hit flashes, desaturating dead or exhausted units, and particles already exists in RC6 through `enableFilters()` and `filters.internal/external.add*()`, camera effects, and the particle emitter. Vignette, ready-made bloom, GradientMap color grading and tint ADD/SCREEN need 4.0 stable or newer. Filters cost draw calls, so use them for a handful of objects, not all 49 tiles.

### Cited Findings
- **Enabling filters:** call `gameObject.enableFilters()`, which exposes `filters.internal` and `filters.external` and gives the object a `filterCamera`. "Each object with filters enabled, and any filters active, makes a new draw call, plus one or more per active filter. This can be expensive. Use sparingly." Filters render the object to a framebuffer first, and anything outside it is clipped; `filtersAutoFocus` keeps the camera following the object. Filters are WebGL-only. — `node_modules/phaser/src/gameobjects/components/Filters.js` (JSDoc, lines 11–50)
- **FilterList methods available in RC6**, with signatures from the source:
  - `addBarrel(amount)`
  - `addBlend(texture, blendMode, amount, color)`
  - `addBlocky(config)`
  - `addBlur(quality, x, y, strength, color, steps)`
  - `addBokeh(radius, amount, contrast)`
  - `addColorMatrix()`
  - `addDisplacement(texture, x, y)`
  - `addGlow(color=0xffffff, outerStrength=4, innerStrength=0, scale=1, knockout=false, quality=10, distance=10)`. Quality and distance cannot be changed after creation.
  - `addMask(mask, invert, viewCamera, viewTransform, scaleFactor)`
  - `addParallelFilters()`, which exposes `.top` and `.bottom` lists
  - `addPixelate(amount)`
  - `addSampler(callback, region)`
  - `addShadow(x, y, decay, power, color, samples, intensity)`
  - `addThreshold(edge1, edge2, invert)`
  - `addTiltShift(radius, amount, contrast, blurX, blurY, strength)`

  The filter classes themselves live in `src/filters/` (Barrel, Blend, Blocky, Blur, Bokeh, ColorMatrix, Displacement, Glow, Mask, ParallelFilters, Pixelate, Sampler, Shadow, Threshold). — `node_modules/phaser/src/gameobjects/components/FilterList.js` (lines 211–661)
- The source documents a ParallelFilters example: `const parallelFilters = camera.filters.internal.addParallelFilters(); parallelFilters.top.addThreshold(0.5, 1); parallelFilters.top.addBlur();` — `FilterList.js` lines 501–503
- **Camera effects** (unchanged from Phaser 3): `camera.shake(duration, intensity, force, callback, context)`, `camera.flash(duration, r, g, b, force, ...)`, `camera.fade(duration, r, g, b, force, ...)`, plus the Pan, Zoom and RotateTo effects. Cameras can also hold filters, for example a full-screen blur behind a modal. — `node_modules/phaser/src/cameras/2d/Camera.js` lines 379–425; `src/cameras/2d/effects/`; Rendering Concepts.md ("Filters can be applied to any game object or scene camera")
- **Lighting:** `gameObject.setLighting(true)`, and `setSelfShadow(enabled, penumbra, diffuseFlatThreshold)` per object or `selfShadow` in the render config. Self-shadowing "uses the brightness of the texture to guess how concave or convex the surface is." Lights now have an explicit Z. Lighting works on BitmapText, Graphics/Shape, Image/Sprite, Particles, Text, TileSprite and more. "Lighting changes the shader, which breaks batches." 4.2.0 added cone lights. — `src/gameobjects/components/Lighting.js` lines 54–79; Rendering Concepts.md; [GitHub releases](https://github.com/phaserjs/phaser/releases)
- **Particles:** `ParticleEmitter` supports `explode(count, x, y)`, `emitParticleAt(x, y, count)`, `addParticleProcessor()` and `GravityWell`. Particles batch in the Quad family. — `src/gameobjects/particles/ParticleEmitter.js` lines 2066–2661; Rendering Concepts.md batching table
- **Render textures:** use DynamicTexture or RenderTexture to bake complex static content into one quad ("Runtime cost: 1 quad"). `CaptureFrame` copies what has already rendered so filters can be applied to part of the scene depth, for example blurring the board behind a modal without restructuring containers. — Rendering Concepts.md
- **Masks:** use the Mask filter, which takes a texture or a game object (a Container is valid). After RC7, `Actions.AddMaskShape` adds shape masks with soft edges. — Rendering Concepts.md; [rc.7 release](https://github.com/phaserjs/phaser/releases/tag/v4.0.0-rc.7)
- **NineSlice** exists (`src/gameobjects/nineslice/`) and batches in the Quad family alongside Image and Sprite. — Rendering Concepts.md table; local `src/gameobjects/nineslice/`
- **Graphics/Shape:** Graphics gained a `pathDetailThreshold` (default 1) for speed. `Rectangle` supports rounded corners. The `Grid` shape now has a stroke, gutter controls, and an outside-outline option. Graphics and Shape form the "Flat" batch family. — Rendering Concepts.md; `src/core/Config.js` line 385
- **Text vs BitmapText:** "Text (but not BitmapText) uploads a whole new texture on update, so update it sparingly." TextStyle has a `resolution` (default 0 uses the game config value) for crisper canvas text on high-DPI screens. — Rendering Concepts.md cheat sheet; `src/gameobjects/text/TextStyle.js` lines 32, 247–255
- **Pixel and rounding config:** `roundPixels`, `pixelArt` (NEAREST) and the new `smoothPixelArt`, which is WebGL-only and keeps texels sharp while antialiasing their edges. Note that "If the round pixels option is on, objects with default rotation and scale use a different shader," which breaks batches between rotated and unrotated objects. — Rendering Concepts.md; `src/core/Config.js` lines 373–404
- **Gradient and Noise objects** (RC7+) produce procedural backgrounds and textures on the GPU. GradientMap does color grading by luminance, and Vignette returned as a filter. — [rc.7 release](https://github.com/phaserjs/phaser/releases/tag/v4.0.0-rc.7)

### Inferences (concrete mapping to OnChainBattles)
- **Selected or ready unit glow:**
  - Call `unitImage.enableFilters(); const g = unitImage.filters.internal.addGlow(teamColor, 4, 0, 1, false, 8, 8)` and tween `g.outerStrength` between about 2 and 5 for a pulse.
  - Enable it only on the selected unit and the few "ready" units, not the whole board.
  - A cheaper alternative is to tween the existing frame Graphics stroke alpha and width. A plain Graphics or Image glow sprite behind the unit costs no extra draw call.
- **Blur behind modals:** use `this.cameras.main.filters.internal.addBlur(...)` while the modal is open, with the modal on a separate camera or scene. Alternatively, put a `CaptureFrame` under the modal and apply the blur to it. Remove the filter on close, following the CLAUDE.md symmetry rule.
- **Dead, exhausted or "can't act" units:** use `addColorMatrix()` and then `.colorMatrix.desaturate()`, or `.grayscale()`. This works in RC6.
- **Hit flash:** in RC6 use `setTintFill(0xffffff)` for 1–2 frames and then `clearTint()`. On 4.x use `setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)`, or ADD for a softer flash. Neither needs a filter.
- **Bloom and vignette:** a camera-level bloom built from ParallelFilters + Threshold + Blur works in RC6 but is a full-screen multi-pass effect, so keep it optional or desktop-only. A vignette needs a 4.x upgrade or a static radial-gradient Image overlay, which is cheapest.
- **Board texture:** bake the 7x7 board, including any subtle noise or texture, into a RenderTexture or a single image once. Redraw only the highlight layer, which keeps the board to one quad.
- **Spell telegraph (Earthquake column):** use a Graphics or Gradient rectangle over the column with a pulsing alpha tween, optionally `addDisplacement` on the board for 300 ms of ground ripple, then particles and a camera shake on impact.

### Gaps
- No measured per-filter GPU cost found. Only the qualitative "new draw call plus one or more per filter" guidance and the RC4 "16x on mobile" note.
- Exact `Vignette`, `GradientMap` and `AddEffectBloom` parameter lists were not retrieved because the docs and CDN were blocked.

---

## Q3. Card/tactics game juice best practices

### Takeaway
The canonical game-feel advice is to layer many small feedback signals: tweens with easing, squash and stretch, particles, flashes, shake, hit-pause and sound. Card games add hover lift and tilt toward the cursor. Tactics games add an overriding rule that readability beats spectacle. For a turn-based game, keep the juice short and punchy so turns don't drag. Most sources here are secondary or community-written, so treat specific numbers as heuristics.

### Cited Findings
- "The Art of Screenshake" (Jan Willem Nijman, Vlambeer, INDIGO Classes at the Control Conference, Amsterdam) takes a dull shooter and demonstrates about 30 small tweaks that each improve feel. Sources disagree on whether the demo game is a side-scroller or top-down. — [Game Developer](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games); talk video [YouTube](https://youtu.be/AJdEqssNZ-U) (not opened)
- A faithful community recreation lists the effects it covers: screenshake, hit pause, muzzle flash, camera lerp, enemy knockback and others, each with on/off comparisons. — [DK Liao devlog](https://dkliao.itch.io/the-art-of-screenshake-recreation/devlog/451576/quick-breakdown-of-all-the-effects)
- Hit-stop (also called hitstop, hit freeze or impact freeze): reserve longer freezes for the heaviest hits and keep light hits to about 2–3 frames. This is a secondary guide, not a primary GDC source. — [gamejuice hit-stop article](https://gamejuice.pages.dev/articles/hit-stop-frame-trick)
- Balatro: cards "hover, tilt with the cursor, and have subtle parallax on the foil layer," so they never sit fully still. The analysis argues feedback channels "stack multiplicatively," and that without the animation and sound the game is "little more than a calculator." — [Blake Crosley Balatro design guide](https://blakecrosley.com/guides/design/balatro) (secondary analysis)
- A community shader "ripped from the source code of Balatro" scales the hovered card to about 1.05x and adds a perspective tilt. Balatro is built in LÖVE (Lua and GLSL). — [Godot Shaders: Balatro Card Hover](https://godotshaders.com/shader/balatro-card-hover/)
- Caution for turn-based games: Balatro "juices every interaction to the hilt" and it works because the core loop is punchy, but the same density "could be exhausting in a slower turn-based game." — [Godot juice lesson](https://bjamba.github.io/teach-me-engineering/learn-godot/module-06-juice-polish/lesson-01-tweens-feedback.html)
- Into the Breach: telegraphed enemy attacks were chosen as a core mechanic so every death feels like the player's fault. "How do you improve the readability of your game? Literally show the player what the enemy will do next." — [Game Developer: Road to the IGF / Into the Breach](https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-); [Game Developer: "sacrifice cool ideas for the sake of clarity every time"](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-)
- Matthew Davis (Subset) gave a GDC 2019 Into the Breach design postmortem, which is free on GDC's YouTube channel. — [80.lv GDC 2019](https://80.lv/articles/gdc-2019-an-inside-look-at-into-the-breach); [gdconf.com](https://www.gdconf.com/news/get-inside-look-making-breach-gdc-2019)
- A GDC 2018 talk on "subway legibility" uses Into the Breach as the example of a UI understandable from a single screenshot, and cites Hearthstone for managing information density through animation and color changes. This is a Japanese secondary write-up. — [Gigazine (EN)](https://gigazine.net/gsc_news/en/20180501-game-design-subway-legibility)
- Hearthstone: Ben Thompson's GDC 2014 art talk covered guiding principles and iteration (free on the GDC Vault). Derek Sakamoto's GDC 2015 UI talk said "our game is UI." — [Game Developer: Hearthstone art](https://gamedeveloper.com/design/video-blizzard-s-art-design-principles-for-i-hearthstone-i-); [GDC Vault: The Art of Hearthstone](https://gdcvault.com/play/1020615/The-Art-of-Hearthstone-Playing); [Game Developer: Hearthstone UI](https://gamedeveloper.com/design/video-designing-an-immersive-user-interface-for-i-hearthstone-i-)
- An analysis of Hearthstone notes that animation, sound and effects are part of the feedback, each step "critical to maximizing the readability & the impact," and that short timings are sometimes preferred to keep the game moving. — [jboger substack](https://jboger.substack.com/p/hearthstone) (secondary)

### Inferences (recommended techniques for our tween-based game, all doable with Phaser tweens, particles and camera)
- **Hover lift and tilt:** lift the hand row about 8–12 px, scale it to about 1.05 (the Balatro value), and add a small `angle` or skew toward the pointer. Ease with `Back.easeOut` on enter and `Quad.easeOut` on leave.
- **Attack sequence, staged as anticipation, strike, impact and recovery:**
  - Wind-up of about 80–120 ms pulling back from the target.
  - Lunge of about 100 ms with `Quad.easeIn` or `Expo.easeIn`.
  - On contact: 2–4 frames of hit-stop (pause the tweens via `tweens.timeScale = 0` or a short delay), a white tint flash on the target, a spark particle burst of 8–16 particles, and a small `camera.shake(80–120 ms, 0.003–0.006)`.
  - Recovery with `Back.easeOut` or `Elastic.easeOut`.

  These numbers are heuristics, not sourced figures.
- **Damage numbers:** pop up with a scale overshoot and float upward. Use BitmapText, because per the Phaser cheat sheet Text re-uploads a texture on every change.
- **Shake budget:** scale intensity with impact (small for normal hits, larger for King damage or Earthquake). Always offer a reduce-motion option and avoid continuous shake.
- **Spell telegraph:** before resolving an area effect like the Earthquake column, highlight the affected tiles for about 300–500 ms with a pulsing overlay. This follows the Into the Breach principle: show what will happen before it happens.
- **Turn transition:** a short banner, about 600–900 ms, that is skippable or non-blocking.
- **Victory and defeat:** a longer moment is acceptable because it's a one-off. Slow-mo on the King's death, a flash, particles, then the result panel.
- **Timing budget:** keep each routine action's animation under about 300–500 ms and let input queue or skip during animations. This is an inference from the "exhausting in turn-based" caution and Hearthstone's "short timings" note.

### Gaps
- Could not retrieve a primary source for the "Juice It or Lose It" talk (Martin Jonasson and Petri Purho). The search returned only irrelevant results. It is commonly cited as GDC Europe 2012, but that is unverified, so it should not be cited as fact without a source.
- No primary developer source (GDC talk or blog) was found for Slay the Spire's card animation, or for exact Hearthstone timing values.
- No sourced specific values for screen-shake amplitude or duration. All numbers in the Inferences are heuristics.

---

## Q4. Board presentation for a 7x7 grid: texture, perspective, highlights, color-blind safety, timing

### Takeaway
Keep the board top-down and readable, and add subtle texture or gradient rather than switching to isometric. The Into the Breach clarity principle and the cost of hit-testing and depth sorting both argue against isometric. Red vs green team colors are the classic color-blind failure. Switch to a blue/orange pair, or add shape or icon redundancy, and ideally let players pick colors.

### Cited Findings
- "Ensure no essential information is conveyed by a fixed colour alone." Reduce colour reliance through additional signifiers first, because palette tweaking has limits. — [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/)
- Red vs green team colors, and red-danger vs green-safe states, are listed as common colorblind failures. Health bars that change color are another. — [bugnet: colorblind-friendly design](https://bugnet.io/blog/colorblind-friendly-game-design); [bugnet: team colors fix](https://bugnet.io/blog/how-to-fix-no-colorblind-safe-palette-team-colors) (secondary)
- Recommended safe primary pair: **blue `#0072B2` vs orange `#E69F00`** (Okabe-Ito palette values). Secondary colors are yellow, sky blue, vermillion, reddish purple and bluish green. Add shapes alongside colors, and let players set "my team" and "opposing team" colors. — [bugnet team colors](https://bugnet.io/blog/how-to-fix-no-colorblind-safe-palette-team-colors); [Can I Play That? colour-blindness guide](https://caniplaythat.com/?p=8897) (secondary)
- Colour-blind players can still distinguish light from dark, so vary brightness as well as hue. — [Uppsala speldesign: red-green blindness](https://babel.speldesign.uu.se/?p=809737) (secondary)
- One developer's rule of thumb: "If you can play the game in black and white then you're most likely good." — [dev.to indieklem](https://dev.to/indieklem/how-to-make-our-game-colors-accessible-to-everyone-8cb) (community tip)
- Into the Breach's UI is "understandable from a single screenshot," and the developers prioritized clarity over cool ideas. — [Gigazine](https://gigazine.net/gsc_news/en/20180501-game-design-subway-legibility); [Game Developer](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-)
- Phaser's `TilemapGPULayer` is orthographic-only (no hex or isometric), and the Grid shape gained gutter and outline controls. — `CHANGELOG-v4.0-rc.6.md`; Rendering Concepts.md

### Inferences
- **Team colors:** move from red/green to blue/orange, or keep red and switch the other side to blue. Add redundant cues: frame shape (a notched corner or banner), a team icon on the frame, and P1/P2 facing direction. Expose a color-blind preset in settings and test the board in grayscale.
- **Tile states:** move, attack and ability-target highlights should differ in pattern as well as hue, for example a solid tint for move, a crosshatch or corner brackets for attack, and a pulsing outline for ability. Keep them on one Graphics layer redrawn from state, in line with state-driven rendering.
- **Board look:** use a subtle checker luminance offset of about 4–8% between tiles, a soft inner shadow or bevel baked into a RenderTexture, and a faint vignette or background gradient around the board. Avoid busy textures under the 92x92 unit art.
- **Perspective:** stay top-down. Isometric would require re-authoring the 92x92 thumbnails, changing the hit-testing and player-flip logic, and would hurt readability.

### Gaps
- Only snippets were retrieved for the Game Accessibility Guidelines and Xbox Accessibility Guidelines (XAG 103). No exact contrast-ratio requirement for games was retrieved.
- No source found comparing isometric and top-down readability in tactics games specifically. That recommendation is inference.

---

## Q5. Performance on low-end laptops and mobile browsers

### Takeaway
In Phaser 4, the main costs are draw calls, buffer uploads and fill rate. Filters and RenderTextures each add draw calls, and full-screen passes cost fill rate. A handful of object-level filters plus pooled, batched particles is safe. Camera-wide bloom, blur and lighting should be optional quality settings. Filters, lighting and Gradient/Noise are WebGL-only, so a Canvas fallback loses them (we force `Phaser.WEBGL` anyway).

### Cited Findings
- Official performance cheat sheet:
  - "Draw calls are expensive. Don't use more than a few hundred."
  - "Filters and DynamicTextures/RenderTextures use draw calls, so use them sparingly."
  - "Data upload is expensive."
  - "Filling pixels is expensive… avoid filling the entire screen repeatedly."
  - "Text (but not BitmapText) uploads a whole new texture on update."
  - "Consider rendering complex but unchanging elements to a DynamicTexture for reuse."

  — `node_modules/phaser/changelog/4.0/Phaser 4 Rendering Concepts.md`
- These things break batches: objects with filters, different blend modes, different lighting settings (enabled or not, self-shadow or not), and different round-pixel behavior. Families that batch: Quad (Image, Sprite, BitmapText, NineSlice, particles, RenderTexture, Text, Video), TileSprite, Flat (Graphics, Shape) and PointLight. — Rendering Concepts.md
- Each filter uses an extra framebuffer, recycled per size. Assume about 4 MB of GPU memory per megapixel of texture or framebuffer. — Rendering Concepts.md
- "On some mobile devices, multi-texturing has poor performance, so you can set the game config to automatically skip this step." Use texture atlases with at least 1 px padding. — Rendering Concepts.md
- RC4 cut filter buffer overhead, with "speedups of 16x or more" for filter-bottlenecked mobile games. — `CHANGELOG-v4.0-rc.4.md`
- Filters are `@webglOnly`. `GeometryMask` is the only Canvas mask. CaptureFrame, SpriteGPULayer and TilemapGPULayer are WebGL-only. — `src/gameobjects/components/Filters.js`; Rendering Concepts.md
- `TilemapGPULayer` "may not render… as efficiently" on mobile GPUs. — Rendering Concepts.md

### Inferences
- **Budget for OnChainBattles:**
  - At most about 3–6 filtered objects at a time (selected unit, hovered card, modal blur).
  - No permanent camera-wide filter on low-quality settings.
  - Particles drawn from one atlas texture with a single emitter per effect type, reused through `explode()`, with roughly 10–40 live particles per burst.
  - The board baked into a RenderTexture or single image.
  - BitmapText for frequently changing numbers.
- **Quality toggle:** add a "low / high effects" setting that disables bloom, blur, shake and lighting. It doubles as the reduced-motion accessibility option.
- **Lighting:** normal-map lighting on cards is feasible (`setLighting(true)`, self-shadow) but breaks batching for every lit object and changes the art pipeline. It's the riskiest item, so treat it as an optional experiment.

### Gaps
- No benchmark numbers found for Phaser 4 filters on specific low-end hardware or mobile browsers.
- No source found on WebGL availability rates for the player base. That needs analytics.
