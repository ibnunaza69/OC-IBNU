import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CarouselTeaserProps} from '../types';

const SlideCard: React.FC<{title: string; body: string; index: number; accent: string; text: string; mutedText: string}> = ({title, body, index, accent, text, mutedText}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({fps, frame, config: {damping: 15}});
  const offsetX = interpolate(progress, [0, 1], [100, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${offsetX}px)`,
        width: '100%',
        padding: '48px 44px',
        borderRadius: 34,
        backgroundColor: 'rgba(255,255,255,0.08)',
        border: `3px solid ${accent}`,
        boxShadow: '0 28px 70px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{fontSize: 28, fontWeight: 800, color: accent}}>SLIDE {index + 1}</div>
      <div style={{marginTop: 18, fontSize: 68, lineHeight: 1.05, fontWeight: 900, color: text}}>{title}</div>
      <div style={{marginTop: 24, fontSize: 38, lineHeight: 1.35, color: mutedText}}>{body}</div>
    </div>
  );
};

export const CarouselTeaser: React.FC<CarouselTeaserProps> = (props) => {
  const {width} = useVideoConfig();
  let offset = 0;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${props.palette.background} 0%, ${props.palette.panel} 100%)`,
        fontFamily: 'Inter, Arial, sans-serif',
        color: props.palette.text,
      }}
    >
      <div style={{position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 16% 16%, rgba(255,255,255,0.13), transparent 22%), radial-gradient(circle at 80% 14%, rgba(255,255,255,0.08), transparent 19%)'}} />

      <div style={{position: 'absolute', top: 72, left: 68, right: 68, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
          <div style={{fontSize: 34, opacity: 0.82}}>{props.brand.name}</div>
          {props.brand.handle ? <div style={{fontSize: 26, opacity: 0.58}}>{props.brand.handle}</div> : null}
        </div>
        <div style={{fontSize: 26, fontWeight: 700, padding: '12px 22px', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)'}}>{props.slides.length} slides</div>
      </div>

      <div style={{position: 'absolute', left: 68, right: 68, top: 210}}>
        <div style={{fontSize: 36, color: props.palette.secondary, fontWeight: 700, letterSpacing: 1.5}}>{props.kicker.toUpperCase()}</div>
        <div style={{marginTop: 18, fontSize: 84, lineHeight: 1.02, fontWeight: 900}}>{props.title}</div>
      </div>

      <div style={{position: 'absolute', left: 68, right: 68, top: 500, bottom: 220, display: 'flex', alignItems: 'center'}}>
        {props.slides.map((slide, index) => {
          const from = offset;
          offset += slide.durationInFrames;
          const accent = index % 2 === 0 ? props.palette.primary : props.palette.secondary;
          return (
            <Sequence key={`${slide.title}-${index}`} from={from} durationInFrames={slide.durationInFrames}>
              <SlideCard title={slide.title} body={slide.body} index={index} accent={accent} text={props.palette.text} mutedText={props.palette.mutedText} />
            </Sequence>
          );
        })}
      </div>

      <div style={{position: 'absolute', left: 68, right: 68, bottom: 84, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24}}>
        <div style={{fontSize: 30, opacity: 0.72, maxWidth: width * 0.45}}>{props.footerNote}</div>
        <div style={{fontSize: 32, fontWeight: 900, backgroundColor: props.palette.primary, color: '#09111f', padding: '20px 28px', borderRadius: 22}}>{props.cta.label}: {props.cta.keyword}</div>
      </div>
    </AbsoluteFill>
  );
};
