import * as WebAudioApi from 'node-web-audio-api';

export const windowForFMOD = {
  ...WebAudioApi,
  addEventListener: () => {},
  removeEventListener: () => {},
};
