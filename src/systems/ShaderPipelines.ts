import Phaser from 'phaser';

/**
 * Custom WebGL Shader Pipelines for Grimfall
 * 
 * Rules:
 * - No loops in fragment shader
 * - Max 1-2 uniforms per shader
 * - Never apply to every enemy
 * - If shader count > 5, you're overdoing it
 * 
 * These shaders are BONUS POLISH, not required.
 * Core readability relies on tint + scale + motion.
 */

// === GLOW/BLOOM PIPELINE ===
// Used sparingly: bosses, elites, ultimates
const GLOW_FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uGlowIntensity;

varying vec2 outTexCoord;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    
    // Simple additive glow (no blur, performance-friendly)
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 glow = color.rgb * luminance * uGlowIntensity;
    
    gl_FragColor = vec4(color.rgb + glow, color.a);
}
`;

// === SHIELD DISTORTION PIPELINE ===
// Simple sine wave UV offset, applied to shield overlay only
const SHIELD_FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;

varying vec2 outTexCoord;

void main() {
    vec2 uv = outTexCoord;
    
    // Simple sine wave distortion
    uv.x += sin(uv.y * 20.0 + uTime * 3.0) * 0.01;
    uv.y += cos(uv.x * 20.0 + uTime * 2.0) * 0.01;
    
    vec4 color = texture2D(uMainSampler, uv);
    
    // Cyan tint for shield
    color.rgb = mix(color.rgb, vec3(0.2, 0.8, 1.0), 0.3);
    
    gl_FragColor = color;
}
`;

// === HEAT PULSE PIPELINE ===
// Time-based brightness pulse for bosses (no blur needed)
const HEAT_PULSE_FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;

varying vec2 outTexCoord;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    
    // Pulsing brightness
    float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
    color.rgb *= 1.0 + pulse * 0.3;
    
    // Slight red shift at peak
    color.r *= 1.0 + pulse * 0.2;
    
    gl_FragColor = color;
}
`;

// === DAMAGE FLASH PIPELINE ===
// Quick white flash on hit
const DAMAGE_FLASH_FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uFlashAmount;

varying vec2 outTexCoord;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    
    // Mix to white based on flash amount
    color.rgb = mix(color.rgb, vec3(1.0), uFlashAmount);
    
    gl_FragColor = color;
}
`;

/**
 * Register all custom pipelines with the game renderer
 * Call this in the game's create() or preload()
 */
export function registerShaderPipelines(game: Phaser.Game): boolean {
  // Only works in WebGL mode
  if (game.renderer.type !== Phaser.WEBGL) {
    console.log('Shaders: Canvas mode, skipping pipeline registration');
    return false;
  }
  
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  
  try {
    // Glow Pipeline
    class GlowPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
      constructor(game: Phaser.Game) {
        super({
          game,
          fragShader: GLOW_FRAG
        });
      }
      
      onPreRender(): void {
        this.set1f('uGlowIntensity', 0.5);
      }
    }
    
    // Shield Pipeline
    class ShieldPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
      constructor(game: Phaser.Game) {
        super({
          game,
          fragShader: SHIELD_FRAG
        });
      }
      
      onPreRender(): void {
        this.set1f('uTime', this.game.loop.time / 1000);
      }
    }
    
    // Heat Pulse Pipeline
    class HeatPulsePipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
      constructor(game: Phaser.Game) {
        super({
          game,
          fragShader: HEAT_PULSE_FRAG
        });
      }
      
      onPreRender(): void {
        this.set1f('uTime', this.game.loop.time / 1000);
      }
    }
    
    // Damage Flash Pipeline
    class DamageFlashPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
      private flashAmount: number = 0;
      
      constructor(game: Phaser.Game) {
        super({
          game,
          fragShader: DAMAGE_FLASH_FRAG
        });
      }
      
      onPreRender(): void {
        this.set1f('uFlashAmount', this.flashAmount);
      }
      
      setFlash(amount: number): void {
        this.flashAmount = amount;
      }
    }
    
    // Register pipelines
    renderer.pipelines.add('GlowPipeline', new GlowPipeline(game));
    renderer.pipelines.add('ShieldPipeline', new ShieldPipeline(game));
    renderer.pipelines.add('HeatPulsePipeline', new HeatPulsePipeline(game));
    renderer.pipelines.add('DamageFlashPipeline', new DamageFlashPipeline(game));
    
    console.log('Shaders: 4 custom pipelines registered');
    return true;
  } catch (e) {
    console.warn('Shaders: Failed to register pipelines', e);
    return false;
  }
}

/**
 * Helper to apply pipeline to a sprite (WebGL only)
 */
export function applyPipeline(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  pipelineName: string
): boolean {
  if (!sprite || !sprite.scene) return false;
  
  const game = sprite.scene.game;
  if (game.renderer.type !== Phaser.WEBGL) return false;
  
  try {
    sprite.setPipeline(pipelineName);
    return true;
  } catch (e) {
    console.warn(`Failed to apply pipeline ${pipelineName}`, e);
    return false;
  }
}

/**
 * Reset sprite to default pipeline
 */
export function resetPipeline(sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image): void {
  if (!sprite || !sprite.scene) return;
  
  try {
    sprite.resetPipeline();
  } catch (e) {
    // Ignore errors in Canvas mode
  }
}
