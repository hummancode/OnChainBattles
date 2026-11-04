# Phaser 4.0.0-rc.6 -> 4.2.1 verification (primary sources)

Sources: `CL/` = 4.2.1 package `changelog/v4/`; `S/` = 4.2.1 `src/`; `S6/` = official 4.0.0-rc.6 package `src/`
(scratchpad `verify/prc6/package`). Code diffs were done with `diff -rwB` ignoring JSDoc lines. Our code = `/home/user/OnChainBattles/src`.

## 1. Breaking / behaviour changes after rc.6, and our exposure

Already in rc.6, so no action needed: `Math.TAU = PI*2` / `PI_OVER_2` (S6/math/const.js:16,25), `Geom.Point` removed (S6/geom has no `point/`),
Struct Set/Map, roundPixels default, ColorMatrix `.colorMatrix`, DynamicTexture `render()`. None of these appear in our src, and the migration
checklist (CL/4.0/MIGRATION-GUIDE.md:394-423) is satisfied.

| Change (source) | Our usage | Action |
|---|---|---|
| **Tint overhaul.** `setTintFill`/`tintFill` removed. `setTint` no longer resets fill mode. New `tintMode`/`setTintMode`, `Phaser.TintModes` (CL/4.0-rc/CHANGELOG-v4.0.0-rc.7.md:53-67; MIGRATION-GUIDE §4 l.114-142) | No `setTintFill`/`tintFill`. One `setTint(0x333333)`: scenes/ProfileScene.ts:574 (MULTIPLY, the default mode) | None |
| `TintModes.MULTIPLY_TWO` + `setTint2`. Shader `inTintEffect` float->vec4 (CL/4.2/CHANGELOG-v4.2.0.md:40-42) | No custom shaders | None |
| Tweens with `startDelay` were stuck in START_DELAY. Countdown moved to `BaseTween#updateStartCountdown` (CL/4.2.1:11; S/tweens/tween/BaseTween.js:549, Tween.js:687) | `delay:` tweens: renderers/BoardRenderer.ts:276, HUDRenderer.ts:259 (state only, visuals were fine) | None. State/onStart are now correct |
| TweenData skips targets with `isDestroyed` (S/tweens/tween/TweenData.js:228). New `GameObject#isDestroyed` (rc.7:23) | `killTweensOf` BoardRenderer.ts:627. yoyo/repeat: BoardRenderer.ts:269,276, UnitThumbnail.ts:209, MenuButton.ts:85 | None. yoyo/repeat code is unchanged |
| Timeline clears events in place: `events.length = 0` (S/time/Timeline.js:731) | `time.addEvent` (BattleScene.ts:331,347, HUDRenderer.ts:279) are not Timeline | None |
| KeyboardManager removed the wrong event on shutdown (POST_RENDER -> POST_STEP, a listener-leak fix) (S/input/keyboard/KeyboardManager.js:429) | `addKey('M'/'ESC')`: SfxCoordinator.ts:51, CardDetailOverlay.ts:126, OverlayRenderer.ts:147,192,381 | None. `addKey` API is unchanged |
| `Systems#destroy` now removes `cameras` (was typo `camera`) (S/scene/Systems.js:814; 4.0.0 changelog l.781) | `scene.restart` HubScene.ts:493, BattleScene.ts:323-324, NetworkCoordinator.ts:224. 'shutdown' listeners in 11 scenes | None. Restart uses shutdown, not destroy. ScenePlugin.js has 0 diff |
| ScaleManager window resize now calls `getParentBounds()+refresh()` (CL/4.2.1:10; S/scale/ScaleManager.js:1547) | main.ts:41-43 `Scale.FIT`+`CENTER_BOTH`, parent `game-container` | Re-check DOMInputManager overlay alignment after resize |
| Rounded-rectangle "reversions" fixed (CL/4.1/CHANGELOG-v4.1.0.md:9). Graphics JS has 0 diff, so the fix is in render nodes | ~85 `fill/strokeRoundedRect` calls (e.g. RoomBrowserScene.ts:45) | Visual QA only |
| `Container.add(Layer)` now throws (S/gameobjects/container/Container.js:551). Layer became a true GameObject (4.1:7) | No `add.layer` | None |
| Container renderer only calls `setAlpha`/`setScrollFactor` on children that have them (S/gameobjects/container/ContainerWebGLRenderer.js) | Containers everywhere | None (fix) |
| Blend modes no longer leak to siblings in a Container (rc.7:96) | Not grepped in detail | Visual QA |
| Config: `render.pixelArt` default `zoom!==1` -> `false` (S/core/Config.js:397, not in changelog). New `mipmapRegeneration=false` (372), `stencil=true` (431), `alphaStrategy`, `stencilAlphaStrategy` (4.2.0:5-8) | main.ts sets no zoom/pixelArt, so nothing changes | None |
| WebGLStencilParametersFactory defaults `enabled:true, func:EQUAL`. Filters RenderStep now runs just before core render (4.2.0:66-69) | No custom render nodes | None |
| Filter `Controller#getPaddingCeil()` replaces `getPadding()` in custom nodes (4.1:8) | Not used | None |
| `TextureSource#updateSource`, `Texture#setSource`, `setDataSource(data,startIndex,renew,w,h)` signature change. `createUint8ArrayTexture` lost `scaleMode` arg (rc.7:84-87; S/textures/TextureSource.js) | ui/MipmapHelper.ts:78-134 probes `source.glTexture` and calls raw `gl.generateMipmap` | Re-verify the probe path on 4.2.1. Note 4.1 "framebuffers using mipmaps incorrectly" fix (4.1:15) |
| `Camera#getPaddingWrapper(padding)` added (S/cameras/2d/Camera.js:707). cameras/2d/effects has **0 diff** | 34 `fadeIn/fadeOut` calls (e.g. HubScene.ts:53) | None. fade/shake/flash are unchanged |
| WebAudio listener Firefox fallback `listener.setPosition` (S/sound/webaudio/WebAudioSoundManager.js:446-473) | No Phaser sound (we use Web Audio SoundFX) | None |
| ESM build fixes: default/Class/LOG_VERSION exports (4.1:16-17); inline `Phaser` namespace removed (4.2.1:9) | Vite import | None (fix) |

Areas with **0 code diff** rc.6 -> 4.2.1: `gameobjects/graphics`, `gameobjects/text` (Text/style), `input/InputPlugin.js` (topOnly,
hit areas), `cameras/2d/effects`, `loader/LoaderPlugin.js`, `loader/File.js`, `ImageFile.js`, `FontFile.js`, `CompressedTextureFile.js`,
`gameobjects/domelement`, `scene/ScenePlugin.js`, `math/const.js`, and filters Glow/Blur/ColorMatrix/Shadow. `Geom.Rectangle.Contains`
hit areas (ButtonFactory.ts:59-61, BoardRenderer.ts:385-387, PhaserUtils.ts:17-19) still work, because geom differs only by a typo in Earcut.js:555.

**Bottom line:** none of our src needs a code change for 4.2.1. The risk areas need visual QA: rounded rects, ScaleManager resize/DOM overlay, MipmapHelper.

## 2. New APIs: signatures and defaults (4.2.1 JSDoc)
- **Vignette** `filters.internal|external.addVignette(x=0.5, y=0.5, radius=0.5, strength=0.5, color=0x000000, blendMode=NORMAL)`.
  blendMode is limited to NORMAL/ADD/MULTIPLY/SCREEN (S/gameobjects/components/FilterList.js:863-872; S/filters/Vignette.js:41-47).
  `addWipe(wipeWidth=0.1, direction=0, axis=0, reveal=0, wipeTexture='__DEFAULT')` (FilterList.js:897-905).
- **GradientMap** `addGradientMap(config?)` (FilterList.js:469). The GradientMapConfig takes:
  - `ramp`: ColorRamp | ColorBand(Config)[]
  - `dither=false`
  - `color=[0,0,0,0]`
  - `colorFactor=[0.3,0.6,0.1,0]`
  - `unpremultiply=true`
  - `alpha=1`

  Source: S/filters/typedefs/GradientMapConfig.js:5-10.
- **Quantize** `addQuantize(config?)` (FilterList.js:712). QuantizeConfig: `steps=[8,8,8,8]`, `gamma=[1,1,1,1]`, `offset=[0,0,0,0]`, `dither=false`,
  `mode=0` (0 = RGBA, 1 = HSVA) (QuantizeConfig.js:5-9).
- **Actions.AddEffectBloom(items, config?)** returns `[{item, parallelFilters, threshold, blur}]` (S/actions/AddEffectBloom.js:71-76). Config defaults:
  - `threshold=0.5`
  - `blurRadius=2`
  - `blurSteps=4`
  - `blurQuality=0`
  - `blendAmount=1`
  - `blendMode=ADD`
  - `useInternal`: false, so filters go to the external list

  Source: AddEffectBloomConfig.js:5-11.
- **Actions.AddEffectShine(items, config?)** (AddEffectShine.js:81-86). It creates a Gradient plus a tween. Config:
  - `radius=0.5`
  - `direction=0.5`
  - `scale=2`
  - `width`/`height=128`: derived from the target by default
  - `bands`
  - `colorFactor=[1.15,0.85,0.85,1]`
  - `displacementMap`, `displacement`
  - `duration=2000`, `repeatDelay`, `ease`, `yoyo`
  - `useExternal`: internal by default
  - `reveal`

  Source: AddEffectShineConfig.js:5-19.
- **Actions.AddMaskShape(items, config)** returns `Mask[]` (AddMaskShape.js:55-60). Config:
  - `shape='circle'`: circle | ellipse | square | rectangle
  - `aspectRatio=1`
  - `invert`
  - `useInternal`
  - `blurRadius=0`, `blurSteps=4`, `blurQuality=0`
  - `scaleMode=0`: 0 fill, -1 inside, 1 outside
  - `padding=0`
  - `region`: Rectangle, defaults to the scene scale

  Source: AddMaskShapeConfig.js:5-14.
- **setTintMode(mode: number|TintModes)** (S/gameobjects/components/Tint.js:253-260). The default `tintMode = MULTIPLY` (l.140).
  `setTint(tl=0xffffff, tr?, bl?, br?)` (l.183-194). `setTint2(...)` (l.218-229).
  **TintModes** (S/renderer/TintModes.js): MULTIPLY 0, FILL 1, ADD 2, (3 reserved, SUBTRACT commented out), SCREEN 4, OVERLAY 5, HARD_LIGHT 6,
  MULTIPLY_TWO 7 (4.2.0+).
- **Gradient** `add.gradient(config?, x=0, y=0, width=128, height=128)` (S/gameobjects/gradient/GradientFactory.js:15-23). GradientQuadConfig:
  - `bands`
  - `offset=0`
  - `repeatMode=0`: EXTEND / TRUNCATE / SAWTOOTH / TRIANGULAR
  - `shapeMode=0`: LINEAR, BILINEAR, RADIAL, CONIC_SYMMETRIC, CONIC_ASYMMETRIC
  - `start={0,0}`, `shape={1,0}`, `length=1`, `direction=0`
  - `dither`

  Source: typedefs/GradientQuadConfig.js:5-31.
- **Noise** `add.noise(config?, x=0, y=0, width=128, height=128)` (S/gameobjects/noise/NoiseFactory.js:19-23). NoiseQuadConfig:
  `noiseOffset=[0,0]`, `noisePower`, `noiseColorStart=0x000000`, `noiseColorEnd=0xffffff`, `noiseRandomChannels`, `noiseRandomNormal`.
  Also available: NoiseCell2D/3D/4D and NoiseSimplex2D/3D (rc.7:38-52).
- **Cone lights (4.2.0)** `lights.addConeLight(x=0, y=0, radius=128, rgb=0xffffff, intensity=1, rotation=0, innerAngle=PI/4, outerAngle=innerAngle, z=radius*0.1)`
  (S/gameobjects/lights/LightsManager.js:347-359). Light methods: `setCone(rotation, innerAngle, outerAngle?)`, `setConeRotation`, `setConeAngles`,
  `disableCone` (Light.js:403-483). Lighting needs `setLighting(true)` plus the scene light manager (CL/4.0/CHANGELOG-v4.0.0.md:118-124).
- **Unchanged since rc.6** (identical FilterList signatures in S6/…/FilterList.js and S/…/FilterList.js; 0 code diff in the filter classes):
  - `addGlow(color=0xffffff, outerStrength=4, innerStrength=0, scale=1, knockout=false, quality=10, distance=10)`
  - `addBlur(quality=0, x=2, y=2, strength=1, color=0xffffff, steps=4)`
  - `addColorMatrix()`
  - `addShadow(x=0, y=0, decay=0.1, power=1, color=0x000000, samples=6, intensity=1)`
  - `addParallelFilters()`: only moved to a prototype injection in S/filters/ParallelFilters.js:148, same API

  Filters added since rc.6: CombineColorMatrix, GradientMap, ImageLight, Key, NormalTools, PanoramaBlur, Quantize, Vignette, Wipe.

## 3. Audio / Sound Manager
Changelogs mention audio only as follows:
- The Base64 data-URI audio fix (rc.4, so already in rc.6) (CL/4.0/CHANGELOG-v4.0.0.md:765).
- `AudioContextMonkeyPatch` polyfill removed (l.282; MIGRATION-GUIDE.md:366).

Code-level changes from rc.6 to 4.2.1 are only two (`S/sound` diff):
- SoundManagerCreator was refactored into a namespace with `.create()`, with the same selection logic: noAudio -> NoAudio, WebAudio unless `disableWebAudio`, else HTML5.
- The WebAudio spatial listener gained a Firefox `setPosition` fallback (WebAudioSoundManager.js:446-473).

There is no API change. The Sound API is the same as Phaser 3, minus the polyfill.

## 4. Image formats / compressed textures
- **WebP/AVIF:** `ImageFile` fetches a blob and sets `URL.createObjectURL(blob)` (S/loader/filetypes/ImageFile.js:68,132; S/loader/File.js:583-603),
  so the browser decodes whatever format it supports. The only Phaser-specific part is that the default extension is `.png` when the URL is omitted.
  There is no WebP/AVIF feature detection in `device/`. The PCT atlas lists `.webp` as a page ext (S/textures/parsers/PCTDecode.js:8).
- **Compressed:** `load.texture` (CompressedTextureFile) supports **PVR and KTX v1 only**. KTXParser checks the `«KTX 11»` magic
  (S/textures/parsers/KTXParser.js:26) and rejects uncompressed KTX. There is **no KTX2 / Basis** parser. GPU formats detected:
  ETC, ETC1, ATC, ASTC, BPTC, RGTC, PVRTC, S3TC, S3TCSRGB, with IMG as the fallback (S/renderer/webgl/WebGLRenderer.js:1351-1386).
  Compressed textures must be re-encoded with Y up (CHANGELOG-v4.0.0.md:95).

## 5. load.font / FontFile (unchanged since rc.6)
- **Signature:** `this.load.font(key | FontFileConfig | FontFileConfig[], url?, format='truetype', descriptors?, xhrSettings?)`.
  When the url is omitted it defaults to `<key>.ttf` (S/loader/filetypes/FontFile.js:200-208).
- **No XHR is made.** The file starts as `FILE_POPULATED` (l.84). `onProcess` builds a `new FontFace(key, 'url(src) format("fmt")', descriptors)`.
- **The loader waits for the font.** It awaits `font.load()` (l.118), then calls `document.fonts.add(font)`, adds `fonts-loaded` to the body
  class, and only then completes. So the loader's COMPLETE fires after the FontFace has loaded, and Text created in `create()` can use it.
- **Failure is silent.** It only logs `console.warn('Font failed to load')` and still completes (l.127). The loader does not report an error.
