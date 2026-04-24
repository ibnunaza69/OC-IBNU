export type AccentPalette = {
  background: string;
  panel: string;
  primary: string;
  secondary: string;
  text: string;
  mutedText: string;
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
  brand: {
    name: string;
    handle?: string;
  };
  cta: {
    label: string;
    keyword: string;
  };
  scenes: SceneBlock[];
};
