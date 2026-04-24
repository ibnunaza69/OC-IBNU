import React from 'react';
import {Composition} from 'remotion';
import {ShortVideo} from './compositions/ShortVideo';
import {QuotePromo} from './compositions/QuotePromo';
import {CarouselTeaser} from './compositions/CarouselTeaser';
import {CarouselTeaserProps, QuotePromoProps, ShortVideoProps} from './types';
import {getCarouselDuration, getQuoteDuration, getTotalDuration} from './utils';
import sampleProps from '../examples/props/canva-animasi.json' assert {type: 'json'};
import quoteProps from '../examples/props/quote-promo.json' assert {type: 'json'};
import teaserProps from '../examples/props/carousel-teaser.json' assert {type: 'json'};

const defaultProps = sampleProps as ShortVideoProps;
const defaultQuoteProps = quoteProps as QuotePromoProps;
const defaultCarouselProps = teaserProps as CarouselTeaserProps;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ShortVideoVertical"
        component={ShortVideo}
        width={1080}
        height={1920}
        fps={defaultProps.meta.fps}
        durationInFrames={getTotalDuration(defaultProps)}
        defaultProps={defaultProps}
      />
      <Composition
        id="QuotePromoVertical"
        component={QuotePromo}
        width={1080}
        height={1920}
        fps={defaultQuoteProps.meta.fps}
        durationInFrames={getQuoteDuration(defaultQuoteProps)}
        defaultProps={defaultQuoteProps}
      />
      <Composition
        id="CarouselTeaserVertical"
        component={CarouselTeaser}
        width={1080}
        height={1920}
        fps={defaultCarouselProps.meta.fps}
        durationInFrames={getCarouselDuration(defaultCarouselProps)}
        defaultProps={defaultCarouselProps}
      />
    </>
  );
};
