import { ProfileDefinition } from '../types';

export const cursorProfile: ProfileDefinition = {
  label: 'cursor',
  command: {
    binary: 'cursor-agent',
    args: ['-p', '--output-format=stream-json', '--force']
  }
};
