# Audio for OnChainBattles: sources, web tooling, and card/tactics sound design

Research date: 2026-11-04. **Method caveat:** this session's network blocked direct page fetches for pixabay.com, freesound.org, opengameart.org, sonniss.com, incompetech.com, tabletopaudio.com and app.unpkg.com (DNS "ENOTFOUND"). Findings come from web-search result summaries. Many of those pages are primary sources, such as license and FAQ pages, but I could not read their full text. Re-verify each license on its official page before shipping. Those domains have to be allowed in the session's network settings first.

Project baseline (checked in repo): `src/audio/SoundFX.ts` is 4,029 bytes. It synthesizes every sound from oscillators and gain envelopes, rate-limits repeats with `MIN_GAP_MS = 60`, and stores mute in localStorage key `ocb_sfx_muted`. `package.json` pins `"phaser": "^4.0.0-rc.6"`.

## (a) Where to get SFX and music legally: licenses

### Takeaway
Sources that allow commercial use with no attribution: **Kenney (CC0)**, **Pixabay audio (Pixabay Content License)**, **Sonniss GDC bundles (royalty-free, no attribution; recent bundles forbid AI training)**, and the **CC0-filtered subsets of Freesound and OpenGameArt**. Sources that require attribution: **Kevin MacLeod/incompetech (CC BY)**, most **Alexander Nakarada** tracks (CC BY 3.0/4.0, varies by track), and any CC-BY or OGA-BY file. **Avoid** CC-BY-NC (non-commercial only), CC-BY-SA and GPL (share-alike, risky for a closed-source game), and **Tabletop Audio** (non-commercial by default, no explicit game license found).

### Cited Findings
**Pixabay**
- Pixabay's FAQ says all content is under the Pixabay License and can be used without attribution, even for commercial purposes. Credit is "not required but is always appreciated." — [Pixabay FAQ](https://pixabay.com/service/faq/)
- The Terms grant a "non-exclusive and royalty-free right to download, use, copy, modify or adapt the Content for commercial or non-commercial purposes." "Audio" is defined to include music, sounds and sound effects. — [Pixabay Terms of Service](https://pixabay.com/service/terms/)
- Pixabay warns that depicted content can still be protected by trademark, publicity or privacy rights, and the Terms contain a prohibited-uses list. The search snippet cut off before that list, so it is unverified here. — [Pixabay FAQ](https://pixabay.com/service/faq/); [ScanCode LicenseDB: pixabay-content](https://scancode-licensedb.aboutcode.org/pixabay-content.html)
- Some third-party guides say a single file cannot be resold standalone, but games are fine. **Unverified** against the official terms. — [Cinevva guide](https://app.cinevva.com/guides/free-sound-effects-music)

**Kenney**
- A secondary guide reports that Kenney's support page declares all packs, including every audio pack, CC0, so no attribution is needed in commercial projects. Each download ships a `license.txt`. I could not read the primary Kenney page. — [gtstu: Free Sound Effects for Indie Games: Kenney CC0](https://gtstu.com/?p=5011); [Cinevva guide](https://app.cinevva.com/guides/free-sound-effects-music)

**Freesound**
- The license is set per sound: CC0, CC-BY, CC-BY-SA or CC-BY-NC. Search can be filtered by license, for example CC0 only. — [Cinevva: Game Asset Licenses Explained](https://app.cinevva.com/guides/game-asset-licenses); [Freesound forum: legal/attribution](https://freesound.org/forum/legal-help-and-attribution-questions/38292)
- CC0 needs no credit. CC-BY needs a credit line. CC-BY-NC needs credit and excludes commercial use, so it cannot go in a game you sell. — same sources
- License versions differ between sounds (some CC-BY/BY-NC are 3.0), so check each sound's page. — [GameDev.tv community thread](https://community.gamedev.tv/t/solved-asking-about-copy-right/35543)
- One guide claims about 72% of Freesound is CC0. **Unverified; do not rely on it.** — [Cinevva (KO)](https://app.cinevva.com/ko/guides/free-sound-effects-music)

**OpenGameArt**
- Licenses vary per file (CC0, CC-BY, CC-BY-SA, OGA-BY, GPL). OGA-BY is an attribution license described as more suitable for DRM-protected games than CC-BY. CC-BY-SA requires derivatives under the same license. GPL audio is "legally confusing" and best avoided. — [Cinevva: Game Asset Licenses Explained](https://cinevva-site.pages.dev/guides/game-asset-licenses); [gtstu guide](https://gtstu.com/?p=5007)
- Example of a relevant pack on the site: "50 RPG sound effects". Check its license on the page. — [OpenGameArt: 50 RPG sound effects](https://opengameart.org/content/50-rpg-sound-effects)

**Sonniss GDC Game Audio Bundle**
- Coverage of several years of the bundle agrees that it is royalty-free and commercially usable with no attribution, on unlimited projects, as a lifetime license. — [GameDev.tv post on the 2018 bundle](https://community.gamedev.tv/t/30gb-of-high-quality-royalty-free-sound-effects-the-sonniss-gameaudiogdc-bundle-2018/63406); [Bedroom Producers Blog: 2020 bundle](https://bedroomproducersblog.com/2020/09/22/sonniss-gdc-2020-bundle/)
- Since the GDC 2024 bundle, the assets may not be used to train AI models. — [GameFromScratch: GDC 2024](https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/)
- Raw files cannot be republished unchanged, for example by re-uploading them to Freesound. This comes from forum users, not the license text. — [Freesound forum thread](https://freesound.org/forum/legal-help-and-attribution-questions/42190)
- A GDC 2026 bundle has been released. One secondary source puts it at more than 7 GB, with the multi-year archive over 200 GB. — [rekkerd.org: Sonniss releases GDC 2026 bundle](https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/); [Cinevva](https://app.cinevva.com/guides/free-sound-effects-music)
- The controlling text is at sonniss.com/gdcbundle-license. **Not read directly.**

**Kevin MacLeod / incompetech**
- Most of his music is licensed CC BY, so it is free to use with credit. A paid Standard License removes the attribution requirement. — [incompetech FAQ](https://incompetech.com/music/royalty-free/faq.html); [Creative Commons case study](https://wiki.creativecommons.org/Case_Studies/Kevin_MacLeod)
- Suggested credit: "Music: Kevin MacLeod" if all the music is his. If the project mixes several composers: "<Track Title> Kevin MacLeod (incompetech.com)". Sources disagree on whether the license is CC BY 3.0 or 4.0, so check each track. — [incompetech FAQ](https://incompetech.com/music/royalty-free/faq.html)
- Third parties put the no-attribution license at about $30–40 per track. **Price unverified.** — [licenseorg guide](https://licenseorg.com/guide/music-audio/incompetech)

**Alexander Nakarada (Serpent Sound Studios)**
- Many tracks are CC BY (4.0 or 3.0 depending on the track) and allow commercial use with attribution. Distributors such as filmmusic.io and free-stock-music.com repeat this, and some add extra conditions: a paid license if attribution is impossible, or no use as background for your own musical work. — [filmmusic.io FAQ](https://filmmusic.io/faq/20?lang=en); [free-stock-music.com: Meadow of Dreams](https://www.free-stock-music.com/alexander-nakarada-meadow-of-dreams.html); [Bandcamp track](https://alexandernakarada.bandcamp.com/track/melodic-overflow)
- A paid usage license is listed at $20 per track on one distributor page. — [free-stock-music.com: Shadowreign](https://www.free-stock-music.com/alexander-nakarada-shadowreign.html)
- Fits this game's style: tracks such as "Traversing the White Peaks" and "Waltz of the Northern Light" are fantasy/folk/medieval. — [free-stock-music.com](https://www.free-stock-music.com/alexander-nakarada-traversing-the-white-peaks.html)

**Tabletop Audio**
- The site describes itself as "free-to-use, user supported ambient game audio". SoundPad sounds are not under its Creative Commons license. — [Tabletop Audio About](https://tabletopaudio.com/about.html)
- A news article describes the tracks as free for non-commercial use and says the creators take commercial license queries. A Patreon subscription can serve as a license for commercial podcast or video use. I found **no explicit grant for video games**. — [Boing Boing 2017](https://boingboing.net/2017/05/31/foley-for-gamers.html); [Tabletop Audio About](https://tabletopaudio.com/about.html)

**itch.io asset packs**
- Each pack has its own custom terms, and buyers ask authors to clarify them. Example: the comment thread on "Dark Fantasy Music II". — [elvgames: Dark Fantasy Music II comments](https://elvgames.itch.io/dark-fantasy-music-ii/comments)

### Inferences
- The cleanest path for a commercial web game is **Kenney + Sonniss + Pixabay + CC0 Freesound/OGA**, with no attribution needed. Still keep a `CREDITS.md` or `audio-licenses.json` that records each file's source URL, author, license and download date, as proof of license.
- For music, a CC BY composer (Nakarada or MacLeod) with an in-game Credits screen is acceptable. Alternatively, buy per-track licenses (about $20–40) for a credits-free release.
- If crypto/stake mode returns, it may count as "commercial" use. NC licenses would then clearly not fit, so excluding NC is the right default now.
- Content ID: CC-BY and Pixabay music that is registered with YouTube Content ID can trigger claims on streamers' videos. I found no source in this session, so this is a risk to check per track, not a fact.

### Gaps
- Full Pixabay prohibited-use list and the exact Sonniss license wording (pages not readable from this session).
- Kenney's primary license page (only a secondary source confirmed CC0).
- Tabletop Audio's exact CC variant (BY-NC-ND?) and any game license.
- jsfxr's license (search returned nothing; I believe it is Apache-2.0 but this is **unverified**).

## (b) Web audio tooling: ZzFX/ZzFXM, jsfxr, Tone.js, Howler.js vs Phaser 4 Sound Manager

### Takeaway
Phaser 4 already includes a full Sound Manager: Web Audio by default, HTML5 Audio fallback, audio sprites, markers, `pauseOnBlur`, and autoplay unlock. For a game that ships sample files, it is the right default, and Howler.js adds little on top. To stay "no assets" and tiny, **ZzFX (about 880 B micro build, MIT)** and **ZzFXM (about 442 B gzipped, MIT)** are the leading generators, and their parameter-array style is close to the existing SoundFX.ts. **Tone.js (about 130 KB+, third-party figure)** is too heavy for this bundle budget unless the game needs a real sequencer.

### Cited Findings
- **Phaser 4 Sound Manager**: `this.sound` is one SoundManager over Web Audio and HTML5 Audio. It creates a WebAudioSoundManager when the device supports Web Audio and `config.audio.disableWebAudio` is not true. It falls back to NoAudioSoundManager when audio is disabled or unsupported. — [Phaser 4.2.1 package skill doc: audio-and-sound](https://app.unpkg.com/phaser@4.2.1/files/skills/audio-and-sound/SKILL.md); [Phaser 4.1.0 skill doc](https://app.unpkg.com/phaser@4.1.0/files/skills/audio-and-sound/SKILL.md)
- Audio sprites: `this.sound.addAudioSprite('sfx')`. JSON `spritemap` entries become markers (`name`, `start`, `duration`, optional `loop`). Markers can also be added with `addMarker`. — [same](https://app.unpkg.com/phaser@4.2.1/files/skills/audio-and-sound/SKILL.md)
- `pauseOnBlur` is true by default. Spatial audio and `decodeAudio()` exist only on the Web Audio path. On HTML5 Audio, `pan` fires events but makes no sound. — [same](https://app.unpkg.com/phaser@4.2.1/files/skills/audio-and-sound/SKILL.md)
- Official Phaser **v4.1.0** examples include separate Web Audio and HTML5 Audio sections, each with an audio-sprite example. — [Phaser examples v4.1.0: Web Audio](https://phaser.io/oss/examples/v4.1.0/audio/Web%20Audio); [HTML5 Audio](https://phaser.io/oss/examples/v4.1.0/audio/HTML5%20Audio.md)
- Phaser 3's equivalent design: global `game.sound`/`this.sound`, the Web Audio cache stores AudioBuffers, and HTML5 used `{ instances: N }` for overlapping playback. I found no Phaser 4 migration note listing audio breaking changes. — [samme phaser3-faq: Sound](https://github.com/samme/phaser3-faq/wiki/Sound)
- **ZzFX** (Frank Force): MIT. The npm package unpacks to 97.4 kB, but the ZzFXMicro build header says "~880 bytes" (v1.2.1). — [npm: zzfx](https://npmjs.com/package/zzfx)
- **ZzFXM** (Keith Clark): a tiny music/song generator that uses ZzFX instruments. MIT, 442 bytes gzipped (v2.0.3). The release player came in under 500 B gzipped. — [ZzFXM site](https://keithclark.github.io/ZzFXM); [Keith Clark article](https://keithclark.co.uk/articles/zzfxm/)
- The `@zzfx-studio/zzfxm` community package is a micro build of about 1.4 KB gzipped that bundles ZzFX, MIT. — [pkgstats](https://www.pkgstats.com/pkg:@zzfx-studio/zzfxm)
- **Howler.js** v2.2.4 is MIT. The README claims "9kb filesize (3kb gzipped)", while other sources say about 7 KB gzipped. The minified file header shows 36,173 bytes uncompressed. Sprites are defined as `{name: [offsetMs, durationMs]}`. — [howler.js GitHub mirror](https://github.com/anzev/howler.js); [best-of-web](https://best-of-web.builder.io/library/goldfire/howler.js); [pistack 2026 comparison](https://www.pistack.xyz/posts/2026-08-23-javascript-audio-libraries-howler-tonejs-wavesurfer-comparison/)
- **Tone.js**: a third-party table lists it at "~130kb+ (framework)". No official figure found. — [pistack 2026 comparison](https://www.pistack.xyz/posts/2026-08-23-javascript-audio-libraries-howler-tonejs-wavesurfer-comparison/)

### Inferences
- The repo pins `^4.0.0-rc.6`, while Phaser 4.1.0 and 4.2.1 are published (the URLs above). Upgrading is worth checking before writing any audio code against Phaser APIs.
- **Recommended split:** use Phaser's `this.sound` with one audio sprite (OGG/Opus plus an MP3/M4A fallback) for authored SFX and music. Keep or replace the synth layer with ZzFX (under 1 KB) for UI blips, so the "zero asset" fallback still works offline or before assets load.
- Howler duplicates what Phaser already does. Add it only if audio must work outside Phaser scenes, for example DOM lobby screens.
- jsfxr/sfxr is mainly useful as a **design-time** generator that exports WAV files. At runtime ZzFX does the same job at smaller size; ZzFX also has its own web designer (not sourced here).

### Gaps
- Official Phaser 4 changelog entries for audio changes vs Phaser 3 (none found). I could not confirm that Phaser 4 RC6 has the same `unlocked` event or `instances` option as Phaser 3.
- Official bundle sizes for Tone.js and jsfxr (e.g. from bundlephobia), and jsfxr's license.

## Browser audio constraints: autoplay, iOS, codecs, formats, sprites

### Takeaway
Every browser starts the AudioContext in a `suspended` state until a user gesture, so call `resume()` on the first click or tap. Phaser's manager handles this, and the existing SoundFX lazy `ensureContext()` should too. On iOS, Web Audio is muted by the silent switch unless `navigator.audioSession.type = 'playback'` is set (Safari-only API). Since Safari 18.4 (March 2025), Ogg Opus/Vorbis reportedly plays. MP3 remains the safest universal fallback.

### Cited Findings
- Chrome and iOS create the AudioContext suspended. Call `resume()` after a user interaction, or calling `start()` on a node after a gesture also resumes it. Check `AudioContext.state` to see if playback is allowed. Chrome adopted this partly to match Safari iOS. — [Chrome autoplay blog](https://developer.chrome.com/blog/autoplay/); [Chromium Intent to Ship: Autoplay Policy for Web Audio](https://groups.google.com/a/chromium.org/g/blink-dev/c/5Y1BqbGauEs)
- When the browser does not allow it to start, the autoplay policy suspends the context automatically, and a later `resume()`/`start()` lifts that. — [WebAudio spec issue #1802](https://github.com/WebAudio/web-audio-api/issues/1802)
- iOS silent switch: the default audio session type is "ambient", so Web Audio is muted when the phone is on silent. Feature-detect `'audioSession' in navigator` and set `navigator.audioSession.type = 'playback'`. The AudioSession API is an Editor's Draft that only Safari implements (as of Nov 2025). — [WebKit Bug 237322](https://auto-bugs.webkit.org/show_bug.cgi?id=237322); [WebKit Bug 251532](https://bugs.webkit.org/show_bug.cgi?id=251532); [blog: web audio iOS unmute (Nov 2025)](https://portfolio-2024-b6r.pages.dev/blog/web-audio-ios-unmute)
- iOS 18 bug: `transient` type plays with no sound. — [WebKit Bug 264473](https://bugs.webkit.org/show_bug.cgi?id=264473)
- Older workaround: `<audio>`/`<video>` elements still play when the device is set to silent, so devs played a silent `<audio>` element to "kick" Web Audio. — [Adactio, 2023-02-22](https://adactio.com/archive/2023/02/22)
- **Codecs:** Safari 15 added WebM Opus, but only for `<audio>`, not `decodeAudioData()`. Opus in WebM works on iOS 17.4 (user report). Ogg Opus was unsupported in Safari for years. — [WebKit Bug 183852](https://bugs.webkit.org/show_bug.cgi?id=183852); [caniuse issue #6805](https://github.com/Fyrd/caniuse/issues/6805); [WebKit Bug 176650](https://bugs.webkit.org/show_bug.cgi?id=176650)
- Safari 18.4 (March 2025; macOS 15.4, iOS 18.4) reportedly added Ogg container support for Opus and Vorbis. Secondary sources only, not Apple's release notes. — [TestMu: MediaRecorder](https://www.testmuai.com/web-technologies/mediarecorder/); [HN comment citing release notes](https://grivy.duckdns.org/threads?id=dither8)
- Phaser's loader accepts several URLs per key and picks one by device support, and its audio sprite path exists for both backends. — [Phaser 4 skill doc](https://app.unpkg.com/phaser@4.2.1/files/skills/audio-and-sound/SKILL.md)

### Inferences
- **Recommended delivery** (my engineering judgment, not sourced bitrate guidance): ship each sprite or track as `.ogg` (Opus or Vorbis) plus `.m4a`/`.mp3` fallback. That covers users on iOS below 18.4, and it is cheap.
  - SFX: mono, 44.1/48 kHz, about 64–96 kbps Opus or 96–128 kbps MP3, packed into one or two audio sprites (UI and combat) to cut HTTP requests and decode calls.
  - Music: stereo, about 96–128 kbps Opus or 128–160 kbps MP3. Stream long tracks via HTML5 Audio or load them lazily after the menu.
- Web Audio decodes to 32-bit float PCM. Arithmetic: 44,100 Hz × 2 channels × 4 bytes × 60 s ≈ 21 MB per stereo minute. A 1-minute, 4-stem stereo loop is about 85 MB decoded. The adaptive-music blog below says about 40 MB, which looks like an underestimate (it may assume mono or 16-bit). Keep music stems short or mono where possible.
- In `SoundFX.ts`, add a `navigator.audioSession` assignment (guarded) and an explicit `resume()` on the first pointerdown, if not already done.

### Gaps
- No current caniuse table was read. The 2026 codec matrix for `decodeAudioData` on Safari (Ogg Opus in Web Audio specifically, not just `<audio>`) is unconfirmed.
- No primary source on recommended bitrates for game SFX vs music.

## (c) Sound design practice in digital card/tactics games

### Takeaway
Public primary material on card-game audio is thin. Hearthstone's sound team describes a rhythmic, "musical" UI language whose card sounds come from the card art rather than animation states, carefully sequenced with animation and VFX. Accessibility guidelines (GAG, Xbox XAG 105, Steam) set the concrete requirements: master volume plus separate SFX, music and voice sliders or mutes, and no information conveyed only by audio.

### Cited Findings
- Hearthstone's sound team calls the game's pacing more rhythmic and musical than WoW's. "In Hearthstone, we have the creative freedom to create sound based on the card art." — [Blizzard: Meet the sound team behind Hearthstone's harmonic design](https://playhearthstone.com/en-us/blog/23964694)
- Hearthstone's feedback combines animations, sound effects, VFX and voice, with "particular attention to sequence". This is a third-party analysis. — [jboger substack: Hearthstone](https://jboger.substack.com/p/hearthstone)
- GDC 2014, Eric Dodds, "Hearthstone: 10 Bits of Design Wisdom": general design, not audio-specific. — [GDC Vault](https://www.gdcvault.com/play/1020775/); [Game Developer write-up](https://gamedeveloper.com/design/blizzard-shares-i-hearthstone-i-design-tips-at-gdc-2014)
- Hearthstone UI talk (Game Developer video: "Designing an immersive user interface for Hearthstone") covers tactile UI feedback, a likely place for audio discussion. **Contents not verified.** — [Game Developer](https://gamedeveloper.com/design/video-designing-an-immersive-user-interface-for-i-hearthstone-i-)
- Slay the Spire: Clark Aboud (composer and sound designer) discusses the music process on The Sound Test podcast. — [AudioBoom: The Sound Test bonus](https://audioboom.com/posts/7121456)
- Into the Breach: composer Ben Prunty and Subset Games took "almost a year" to find the soundtrack's sound. — [NME feature](https://www.nme.com/features/gaming-features/into-the-breach-rock-the-spacebar-3280988)
- Legends of Runeterra: interview with Riot sound designer Sandy Zhou (LoR, TFT, Wild Rift). — [The Magic Rain](https://themagicrain.com/?p=36999)
- Gwent/CD Projekt: finalizing a card's sound is a team review effort, and card sound is "often overlooked". — [CDPR forum](https://forums.cdprojektred.com/threads/11085517)
- **Accessibility:** "Provide separate volume controls or mutes for effects, speech and background music" is a Basic-level Game Accessibility Guideline. — [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/provide-separate-volume-controls-or-mutes-for-effects-speech-and-background-music/)
- Xbox XAG 105: a master volume plus separate music, speech, SFX, background, TTS and cue controls; per-type channels for important SFX. — [Xbox Accessibility Guideline 105](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/105); [Accessibility Feature Tags](https://learn.microsoft.com/gaming/accessibility/accessibility-feature-tags)
- No essential information by audio alone; reinforce it visually ("don't rely on a single sense for any cue"). — [Game Accessibility Guidelines: basic](https://gameaccessibilityguidelines.com/basic/); [IGDA GA-SIG guidelines](https://igda-gasig.org/get-involved/sig-initiatives/resources-for-game-developers/sig-guidelines/)
- Steam suggests separate sliders even for active vs background SFX. — [Steamworks accessibility features](https://partner.steamgames.com/doc/accessibility_features?l=english)

### Inferences (industry-standard practice, not sourced to a specific post-mortem here)
- **Moments that deserve sound** in OnChainBattles, by priority:
  1. Card play/deploy, attack windup and hit, unit death, King hit, King death (big stinger)
  2. Turn start (yours vs opponent's, distinct), low turn-time warning (90 s clock, ticks in the last 10 s, which needs a visual equivalent too), victory/defeat/draw stingers
  3. Card hover/pick-up (very quiet, rate-limited), spell cast per school, invalid action "thud", draw, end turn button
- **Variation:** randomize pitch (±3–5% playbackRate/detune) and pick from 2–4 variants for frequent sounds (hit, deploy, hover) to avoid repetition fatigue. Phaser sounds expose `rate`/`detune` (Phaser 3 API; check in v4).
- **Layering:** build "attack" as whoosh, then impact, then a material tail, so one impact layer is shared and unit-specific tails stay small.
- **Ducking:** lower the music bus about 6–10 dB under King-hit and victory stingers. With Web Audio this is a GainNode ramp on the music bus.
- **Buses:** master, music, SFX, UI (and voice later), each persisted. This extends the existing single `ocb_sfx_muted` flag.
- **Multiplayer:** the opponent's actions arrive in bursts on resync. The existing `MIN_GAP_MS` collapse is the right idea, but apply it per sound category.

### Gaps
- No GDC Vault talk specifically about Hearthstone, Marvel Snap, Inscryption or Slay the Spire **audio** was found or read. Practice claims above are inferences, not citations.
- No public data on which moments these games sound or their mix levels.

## Adaptive / dynamic music on the web

### Takeaway
Both standard approaches work in plain Web Audio, and Phaser's WebAudioSoundManager sits on top of Web Audio:
- **Vertical layering:** start equal-length stems together on `context.currentTime`, then crossfade per-stem gains by intensity.
- **Horizontal re-sequencing:** schedule the next section with `source.start(when, offset, duration)` on bar boundaries.

Short turn/victory stingers over a ducked bed fit a turn-based game best. Decoded memory is the main cost.

### Cited Findings
- Vertical layering: load every stem as an AudioBuffer, create one AudioBufferSourceNode per stem and start all at the same `context.currentTime`. Stems must match in length and tempo. Change intensity with stem gain, not by restarting. — [Abratabia: dynamic game music (web)](https://www.abratabia.com/web-game-audio/dynamic-game-music.php); [IRPR glossary: vertical layering](https://sounddesign.irpr.agency/glossary/vertical-layering/)
- Horizontal re-sequencing relies on the scheduling precision of `start(when, offset, duration)`. Switch on beat or bar boundaries so transitions feel musical. — [Bugnet: adaptive music beginner's guide](https://bugnet.io/blog/adaptive-music-a-beginners-guide); [CRI ADX2 horizontal sequencing](https://blog.criware.com/index.php/2020/05/20/dynamic-music-with-adx2-part2-horizontal-sequencing/); [IRPR glossary](https://sounddesign.irpr.agency/glossary/horizontal-resequencing/)
- Common architecture: a music manager owning the music bus, a state machine fed by game events, and preloaded stem sets per track. Many games combine resequencing for big state changes with layering for intensity. — [Abratabia: adaptive music](https://abratabia.com/ai-game-audio/adaptive-music.php)
- Memory: one blog estimates four stereo stems of a 1-minute loop at about 40 MB decoded. That conflicts with my arithmetic (≈85 MB at float32; see the codec section). — [Abratabia](https://www.abratabia.com/web-game-audio/dynamic-game-music.php)
- ZzFXM generates whole songs procedurally in under 500 B gzipped, an asset-free option for chiptune-style music. — [ZzFXM](https://keithclark.github.io/ZzFXM)

### Inferences
- **A simple plan that fits OnChainBattles:**
  1. Menu/hub track.
  2. Battle bed with two layers (calm base; "tension" percussion faded in when either King is below 50% HP or the turn clock is under 15 s).
  3. One-shot stingers on turn start, King hit and victory/defeat, with the bed ducked.
  
  Phaser can do this with two looping `this.sound.add()` instances started together and `tweens` on `volume`. Sample-accurate sync may need raw Web Audio via `this.sound.context` (Phaser 3 API name; verify in v4).
- Use short loops (30–60 s) and mono tension stems to keep decoded memory under about 30 MB.
- No dedicated, well-known adaptive-music library for the web turned up in this search. Howler and Phaser give the primitives, and FMOD/Wwise HTML5 builds exist (not researched here).

### Gaps
- No complete, tested sample-accurate looping/sync code example found.
- FMOD/Wwise web export viability and size not researched.
