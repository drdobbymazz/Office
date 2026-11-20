// How a person looks. Pure data: the character rig (render/characters) turns
// this into a drawn, animated figure. Colours are 0xRRGGBB numbers.
//
// Style target: chunky, friendly, big-headed cartoon people (head about 40% of
// total height) with large expressive eyes, drawn front-on / slightly turned.
// Every option listed here must be drawable by the rig.

export type HairStyle =
  | 'bob'          // sleek chin-length bob with a fringe
  | 'fade'         // short sides, neat flat top
  | 'curlyLong'    // big shoulder-length curls
  | 'highTop'      // tall curly high-top
  | 'braid'        // centre parting, one long braid over the shoulder
  | 'topBun'       // messy bun on top, loose strands
  | 'combOver'     // thin strands combed over a balding head
  | 'permShort'    // short fluffy cloud of a perm
  | 'short'        // plain short hair
  | 'messy'        // shaggy, unbrushed, ear-length
  | 'ponytail'
  | 'sidePart'
  | 'longStraight'
  | 'afro'
  | 'buzz'
  | 'bald';

export type FacialHair = 'none' | 'stubble' | 'mustache' | 'beard' | 'goatee';

export type TopStyle =
  | 'blazer'    // open jacket over a shirt/blouse (accent = shirt colour)
  | 'shirt'     // button shirt, sleeves rolled
  | 'blouse'    // soft blouse (accent = pattern dots / collar)
  | 'cardigan'  // open cardigan over a top (accent = top colour)
  | 'vest'      // sweater vest over a shirt (accent = shirt colour)
  | 'hoodie'    // hood, pocket, drawstrings
  | 'tee'       // loose t-shirt
  | 'bomber'    // bomber jacket with ribbed cuffs (accent = lining/tee)
  | 'jumpsuit'  // one-piece work overall with a chest pocket (covers legs too)
  | 'polo'
  | 'uniform';  // courier / inspector style jacket with epaulettes

export type BottomStyle = 'trousers' | 'jeans' | 'skirt' | 'shorts';
export type ShoeStyle = 'smart' | 'trainers' | 'boots' | 'heels';

export type Accessory =
  | 'glasses'        // rectangular frames
  | 'roundGlasses'
  | 'glassesChain'   // glasses on a neck chain (worn on the nose)
  | 'pearls'         // pearl necklace
  | 'earrings'
  | 'lanyard'        // ID badge on a lanyard
  | 'headset'        // over-ear headset with a mic boom
  | 'headphonesNeck' // big headphones worn round the neck
  | 'flatCap'
  | 'cap'            // baseball cap
  | 'beanie'
  | 'watch'
  | 'backpack'
  | 'scarf'
  | 'bowtie'
  | 'badge';         // pinned name/inspector badge

export interface CharacterLook {
  /** Skin base colour. The rig derives shade and blush tones from it. */
  skin: number;
  hair: {
    style: HairStyle;
    color: number;
    /** Optional second colour (dyed tips / streak). */
    highlight?: number;
  };
  facialHair?: FacialHair;
  build: {
    /** Overall height multiplier, about 0.86 .. 1.12. */
    height: number;
    /** Body width multiplier, about 0.85 .. 1.3. */
    width: number;
    /** 0 = flat, 1 = big round belly. */
    belly?: number;
    /** Shoulder width multiplier, about 0.85 .. 1.3. */
    shoulders?: number;
  };
  outfit: {
    top: TopStyle;
    topColor: number;
    /** Second colour of the top: shirt under a blazer, collar, pattern, trim. */
    topAccent?: number;
    /** Tie colour, if they wear one. */
    tie?: number;
    bottom: BottomStyle;
    bottomColor: number;
    shoes: ShoeStyle;
    shoeColor: number;
  };
  accessories: Accessory[];
  eyes: {
    /** Iris colour. */
    color: number;
    shape: 'round' | 'almond' | 'sleepy' | 'wide';
    lashes?: boolean;
  };
  brows: {
    color: number;
    /** 1 thin .. 3 heavy. */
    weight: 1 | 2 | 3;
  };
  /** Lipstick colour, if any. */
  lips?: number;
  nose?: 'button' | 'round' | 'long';
  freckles?: boolean;
  /** Age lines (crow's feet, forehead). */
  wrinkles?: boolean;
  /** Permanently rosy cheeks. */
  rosy?: boolean;
}

/** Parameters for a person's "voice": short synthesized blips as text types out. */
export interface VoiceDef {
  /** Base pitch in Hz (about 100 very deep .. 360 high). */
  pitch: number;
  /** Tone colour. */
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** Random pitch spread per blip, in semitones. */
  spread: number;
  /** Talking speed multiplier (1 = normal). */
  speed: number;
}
