// ============================================================
// MipmapHelper.ts
// Enables GPU mipmaps on Phaser textures for clean downscaling.
//
// WHY: WebGL LINEAR filter samples only 4 pixels when downscaling.
//      At 3× downscale (440px → 140px), most pixel data is skipped → blur.
//      Mipmaps pre-compute half-size versions on the GPU (440→220→110→55...)
//      so the GPU always has a close-to-display-size version to sample from.
//      This is exactly what Pillow LANCZOS does, but on the GPU.
//
// USAGE:
//      import { MipmapHelper } from '../ui/MipmapHelper';
//      // In PreloadScene.create():
//      MipmapHelper.enableAll(this);
// ============================================================

export class MipmapHelper {

  /**
   * Attempt to enable mipmaps on all loaded image textures.
   * Call this once in PreloadScene.create() after all assets are loaded.
   */
  static enableAll(scene: Phaser.Scene): void {
    const renderer = scene.game.renderer;

    // Only works with WebGL renderer
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
      console.log('[MipmapHelper] Canvas renderer — mipmaps not applicable.');
      return;
    }

    const gl = renderer.gl;
    if (!gl) {
      console.warn('[MipmapHelper] No WebGL context found.');
      return;
    }

    // First, discover the GL texture path on one known texture
    const glTexturePath = MipmapHelper.findGLTexturePath(scene);
    if (!glTexturePath) {
      console.warn('[MipmapHelper] Could not find GL texture path. Mipmaps disabled.');
      return;
    }

    console.log(`[MipmapHelper] GL texture path found: "${glTexturePath}"`);

    // Now enable mipmaps on all loaded textures
    let count = 0;
    const textureManager = scene.textures;

    textureManager.getTextureKeys().forEach((key: string) => {
      // Skip Phaser internal textures
      if (key === '__DEFAULT' || key === '__MISSING' || key === '__WHITE') return;

      const ok = MipmapHelper.enableForKey(scene, key, gl, glTexturePath);
      if (ok) count++;
    });

    console.log(`[MipmapHelper] Mipmaps enabled on ${count} textures.`);
  }

  /**
   * Enable mipmaps on a single texture by key.
   */
 static enableForKey(
    scene: Phaser.Scene,
    key: string,
    gl: WebGLRenderingContext,
    glTexturePath: string,
  ): boolean {
    if (!scene.textures.exists(key)) return false;

    // WebGL 1 requires power-of-two textures for mipmaps.
    // Only proceed if we have WebGL 2.
    if (!(gl instanceof WebGL2RenderingContext)) return false;

    const texture = scene.textures.get(key);
    const source = texture.source?.[0];
    if (!source) return false;

    const glTex = MipmapHelper.getNestedProp(source, glTexturePath);
    if (!glTex || !(glTex instanceof WebGLTexture)) return false;

    const srcImage = (source as any).image ?? (source as any).source ?? source;
    const width = (srcImage as any)?.width ?? 0;
    const height = (srcImage as any)?.height ?? 0;
    if (!width || !height) return false;

    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  /**
   * Discover the property path to the WebGLTexture object inside a Phaser texture source.
   * Tries multiple known paths for Phaser 3.x and 4.x.
   */
  private static findGLTexturePath(scene: Phaser.Scene): string | null {
    // Find any loaded texture to inspect
    const keys = scene.textures.getTextureKeys().filter(
      (k: string) => k !== '__DEFAULT' && k !== '__MISSING' && k !== '__WHITE'
    );
    if (keys.length === 0) return null;

    const texture = scene.textures.get(keys[0]);
    const source = texture.source?.[0];
    if (!source) return null;

    // Known paths across Phaser versions
    const candidates = [
      'glTexture',
      'texture',
      'webGLTexture',
      'glTexture.texture',
      'image.texture',
      'texture.glTexture',
    ];

    for (const path of candidates) {
      const val = MipmapHelper.getNestedProp(source, path);
      if (val instanceof WebGLTexture) {
        return path;
      }
    }

    // Deep search: walk all own properties up to 3 levels deep
    const found = MipmapHelper.deepFindWebGLTexture(source, 3);
    if (found) {
      console.log(`[MipmapHelper] Found WebGLTexture at: source.${found}`);
      return found;
    }

    // Log structure for debugging
    console.log('[MipmapHelper] Could not find WebGLTexture. Source structure:');
    MipmapHelper.logStructure(source, 'source', 2);

    return null;
  }

  /**
   * Recursively search an object for a WebGLTexture instance.
   */
  private static deepFindWebGLTexture(obj: any, maxDepth: number, path: string = ''): string | null {
    if (maxDepth <= 0 || !obj || typeof obj !== 'object') return null;

    for (const key of Object.getOwnPropertyNames(obj)) {
      // Skip known huge/circular properties
      if (key === 'manager' || key === 'scene' || key === 'game' || key === 'renderer') continue;
      if (key.startsWith('_') && key !== '_glTexture') continue;

      try {
        const val = obj[key];
        const currentPath = path ? `${path}.${key}` : key;

        if (val instanceof WebGLTexture) {
          return currentPath;
        }

        // Recurse into plain objects (not DOM elements, not arrays)
        if (val && typeof val === 'object' && !(val instanceof HTMLElement) && !Array.isArray(val)) {
          const found = MipmapHelper.deepFindWebGLTexture(val, maxDepth - 1, currentPath);
          if (found) return found;
        }
      } catch {
        // Skip accessor errors
      }
    }

    return null;
  }

  /**
   * Log object structure for debugging.
   */
  private static logStructure(obj: any, prefix: string, depth: number): void {
    if (depth <= 0 || !obj || typeof obj !== 'object') return;

    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key === 'manager' || key === 'scene' || key === 'game') continue;
      try {
        const val = obj[key];
        const type = val === null ? 'null'
          : val === undefined ? 'undefined'
          : val instanceof WebGLTexture ? '★ WebGLTexture ★'
          : val instanceof HTMLElement ? 'HTMLElement'
          : Array.isArray(val) ? `Array(${val.length})`
          : typeof val;
        console.log(`  ${prefix}.${key}: ${type}`);

        if (type === 'object' && depth > 1) {
          MipmapHelper.logStructure(val, `${prefix}.${key}`, depth - 1);
        }
      } catch {
        console.log(`  ${prefix}.${key}: [accessor error]`);
      }
    }
  }

  private static isPOT(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }

  private static getNestedProp(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }
}
