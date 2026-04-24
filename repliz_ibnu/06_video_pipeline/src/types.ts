export type AccentPalette = {
  background: string;
  panel: string;
  primary: string;
  secondary: string;
  text: string;
  mutedText: string;
};

export type BrandIdentity = {
  name: string;
  handle?: string;
};

export type CTAInfo = {
  label: string;
  keyword: string;
};

export type SceneBlock = {
  kind: 'hook' | 'feature-list' | 'audience' | 'cta';
  title: string;
  body?: string;
  items?: string[];
  durationInFrames: number;
};

export type ShortVideoProps = {
  meta: {
    title: string;
    subtitle?: string;
    ratio: '9:16';
    fps: number;
  };
  palette: AccentPalette;
  brand: BrandIdentity;
  cta: CTAInfo;
  scenes: SceneBlock[];
};

export type QuotePromoProps = {
  meta: {
    title: string;
    ratio: '9:16';
    fps: number;
    durationInFrames: number;
  };
  palette: AccentPalette;
  brand: BrandIdentity;
  eyebrow: string;
  hook: string;
  body: string;
  footerNote: string;
  cta: CTAInfo;
};

export type CarouselSlide = {
  title: string;
  body: string;
  durationInFrames: number;
};

export type CarouselTeaserProps = {
  meta: {
    title: string;
    ratio: '9:16';
    fps: number;
  };
  palette: AccentPalette;
  brand: BrandIdentity;
  kicker: string;
  title: string;
  footerNote: string;
  cta: CTAInfo;
  slides: CarouselSlide[];
};
