import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {QuotePromoProps} from '../types';

export const QuotePromo: React.FC<QuotePromoProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const entrance = spring({fps, frame, config: {damping: 16}});
  const titleY = interpolate(entrance, [0, 1], [80, 0]);
  const bodyOpacity = interpolate(frame, [18, 42], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ctaScale = interpolate(frame, [52, 78], [0.9, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${props.palette.background} 0%, ${props.palette.panel} 100%)`,
        fontFamily: 'Inter, Arial, sans-serif',
        color: props.palette.text,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 18% 18%, rgba(255,255,255,0.13), transparent 24%), radial-gradient(circle at 78% 20%, rgba(255,255,255,0.08), transparent 20%)',
        }}
      />

      <div style={{position: 'absolute', top: 72, left: 68, right: 68, display: 'flex', justifyContent: 'space-between'}}>
        <div>
          <div style={{fontSize: 34, opacity: 0.82}}>{props.brand.name}</div>
          {props.brand.handle ? <div style={{fontSize: 26, opacity: 0.58}}>{props.brand.handle}</div> : null}
        </div>
        <div style={{fontSize: 26, fontWeight: 700, padding: '12px 22px', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)'}}>text promo</div>
      </div>

      <div style={{position: 'absolute', left: 68, right: 68, top: 250}}>
        <div style={{fontSize: 42, color: props.palette.secondary, fontWeight: 700, letterSpacing: 2}}>{props.eyebrow.toUpperCase()}</div>
        <div style={{marginTop: 26, fontSize: 110, lineHeight: 1.02, fontWeight: 900, transform: `translateY(${titleY}px)`}}>{props.hook}</div>
        <div style={{marginTop: 38, fontSize: 44, lineHeight: 1.35, color: props.palette.mutedText, opacity: bodyOpacity}}>{props.body}</div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 68,
          right: 68,
          bottom: 110,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <div style={{fontSize: 30, opacity: 0.74, maxWidth: width * 0.44}}>{props.footerNote}</div>
        <div
          style={{
            transform: `scale(${ctaScale})`,
            backgroundColor: props.palette.primary,
            color: '#09111f',
            borderRadius: 24,
            padding: '24px 30px',
            minWidth: width * 0.34,
            boxShadow: '0 28px 80px rgba(0,0,0,0.22)',
          }}
        >
          <div style={{fontSize: 24, fontWeight: 700, opacity: 0.74}}>{props.cta.label}</div>
          <div style={{fontSize: 52, fontWeight: 900, marginTop: 6}}>{props.cta.keyword}</div>
        </div>
      </div>

      <div style={{position: 'absolute', width: width * 0.62, height: height * 0.62, right: -180, bottom: -190, borderRadius: '50%', border: `3px solid ${props.palette.secondary}`, opacity: 0.18}} />
    </AbsoluteFill>
  );
};
