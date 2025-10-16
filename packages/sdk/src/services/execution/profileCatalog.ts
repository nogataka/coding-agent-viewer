import { profileDefinitions } from './profiles/index.js';

export type ProfileListing = {
  label: string;
  variants: Array<{ label: string }>;
};

export function getProfiles(): ProfileListing[] {
  return profileDefinitions.map((definition) => ({
    label: definition.label,
    variants:
      definition.variants?.map((variant) => ({
        label: variant.label
      })) ?? []
  }));
}
