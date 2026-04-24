import {CarouselTeaserProps, QuotePromoProps, ShortVideoProps} from './types';

export const getTotalDuration = (props: ShortVideoProps): number => {
  return props.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
};

export const getSceneStart = (props: ShortVideoProps, index: number): number => {
  return props.scenes.slice(0, index).reduce((sum, scene) => sum + scene.durationInFrames, 0);
};

export const getCarouselDuration = (props: CarouselTeaserProps): number => {
  return props.slides.reduce((sum, slide) => sum + slide.durationInFrames, 0);
};

export const getQuoteDuration = (props: QuotePromoProps): number => props.meta.durationInFrames;
