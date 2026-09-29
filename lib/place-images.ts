export { normalizePlaceName, placeDistanceMeters } from "./place-image-matching.mjs";

export type PlaceImage = {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  author: string;
  sourcePageUrl: string;
  license: string;
  licenseUrl: string;
  changes: string;
};
