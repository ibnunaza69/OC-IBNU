import React from 'react';
import {Composition} from 'remotion';
import {ShortVideo} from './compositions/ShortVideo';
import {ShortVideoProps} from './types';
import {getTotalDuration} from './utils';
import sampleProps from '../examples/props/canva-animasi.json' assert {type: 'json'};

const defaultProps = sampleProps as ShortVideoProps;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ShortVideoVertical"
      component={ShortVideo}
      width={1080}
      height={1920}
      fps={defaultProps.meta.fps}
      durationInFrames={getTotalDuration(defaultProps)}
      defaultProps={defaultProps}
    />
  );
};
