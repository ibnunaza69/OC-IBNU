import React from 'react';
import {AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ShortVideoProps} from '../types';

const SceneCard: React.FC<{
  title: string;
  body?: string;
  items?: string[];
  accent: string;
  text: string;
  mutedText: string;
}> = ({title, body, items, accent, text, mutedText}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({fps, frame, config: {damping: 14}});
  const translateY = interpolate(entrance, [0, 1], [60, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: `3px solid ${accent}`,
        borderRadius: 36,
        padding: '56px 52px',
        boxShadow: '0 30px 80px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{fontSize: 86, fontWeight: 800, lineHeight: 1.05, color: text}}>{title}</div>
      {body ? (
        <div style={{marginTop: 28, fontSize: 42, lineHeight: 1.35, color: mutedText}}>{body}</div>
      ) : null}
      {items?.length ? (
        <div style={{display: 'flex', flexDirection: 'column', gap: 20, marginTop: 36}}>
          {items.map((item) => (
            <div key={item} style={{display: 'flex', gap: 18, alignItems: 'flex-start'}}>
              <div style={{width: 18, height: 18, borderRadius: 999, backgroundColor: accent, marginTop: 16}} />
              <div style={{fontSize: 40, lineHeight: 1.3, color: text}}>{item}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const ShortVideo: React.FC<ShortVideoProps> = (props) => {
  const {width, height} = useVideoConfig();

  let offset = 0;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${props.palette.background} 0%, ${props.palette.panel} 100%)`,
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12), transparent 22%), radial-gradient(circle at 80% 15%, rgba(255,255,255,0.08), transparent 18%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 70,
          left: 64,
          right: 64,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: props.palette.text,
        }}
      >
        <div>
          <div style={{fontSize: 34, opacity: 0.8}}>{props.brand.name}</div>
          {props.brand.handle ? <div style={{fontSize: 28, opacity: 0.55}}>{props.brand.handle}</div> : null}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            padding: '12px 22px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: 999,
          }}
        >
          {props.meta.ratio}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          top: 220,
          bottom: 220,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {props.scenes.map((scene, index) => {
          const from = offset;
          offset += scene.durationInFrames;
          const accent = index % 2 === 0 ? props.palette.primary : props.palette.secondary;

          return (
            <Sequence key={`${scene.kind}-${index}`} from={from} durationInFrames={scene.durationInFrames}>
              <SceneCard
                title={scene.title}
                body={scene.body}
                items={scene.items}
                accent={accent}
                text={props.palette.text}
                mutedText={props.palette.mutedText}
              />
            </Sequence>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          bottom: 74,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: props.palette.text,
        }}
      >
        <div style={{fontSize: 30, opacity: 0.7}}>{props.meta.title}</div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            backgroundColor: props.palette.primary,
            color: '#09111f',
            padding: '18px 26px',
            borderRadius: 20,
          }}
        >
          {props.cta.label}: {props.cta.keyword}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          width: width * 0.58,
          height: height * 0.58,
          right: -180,
          bottom: -140,
          borderRadius: '50%',
          border: `3px solid ${props.palette.secondary}`,
          opacity: 0.16,
        }}
      />
    </AbsoluteFill>
  );
};
