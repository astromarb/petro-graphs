export type ImageMode = 'PPL' | 'XPL';

export interface ThinSectionImage {
  id: string;
  mode: ImageMode;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ImageGroup {
  id: string;
  name: string;
  sample: string;
  images: ThinSectionImage[];
  expanded: boolean;
}

export interface BorderStyle {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'none';
  radius: number;
}

export interface CanvasObjectBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  visible: boolean;
  label: string;
}

export interface ImageAdjustments {
  flipX: boolean;
  flipY: boolean;
  brightness: number;   // -1 to 1
  contrast: number;     // -1 to 1
  saturation: number;   // -1 to 1
  hue: number;          // -1 to 1 (hue rotation)
  grayscale: boolean;
  invert: boolean;
  sharpen: boolean;
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  flipX: false, flipY: false,
  brightness: 0, contrast: 0, saturation: 0, hue: 0,
  grayscale: false, invert: false, sharpen: false,
};

export interface ImageObject extends CanvasObjectBase {
  type: 'image';
  imageId: string;
  groupId: string;
  mode: ImageMode;
  border: BorderStyle;
  showModeTag: boolean;
  tagPosition: 'tl' | 'tr' | 'bl' | 'br';
  opacity: number;
  adjustments: ImageAdjustments;
}

export interface TextObject extends CanvasObjectBase {
  type: 'text';
  content: string;
  isLatex: boolean;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
}

export interface ShapeObject extends CanvasObjectBase {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  fill: string;
  fillOpacity: number;
  border: BorderStyle;
}

export type ScaleUnit = 'µm' | 'nm' | 'mm' | 'cm' | 'm' | 'km' | 'Å';

export interface ScaleBarObject extends CanvasObjectBase {
  type: 'scalebar';
  length: number;       // pixel length on canvas
  realLength: number;   // real-world measurement value
  unit: ScaleUnit;
  color: string;
  labelColor: string;
  thickness: number;
  fontSize: number;
}

export type CanvasObject = ImageObject | TextObject | ShapeObject | ScaleBarObject;

export interface InsetPair {
  id: string;
  parentObjectId: string;
  insetObjectId: string;
  /** crop rect position relative to parent object's top-left, in canvas pixels */
  cropRect: { relX: number; relY: number; w: number; h: number };
}

export interface CanvasDoc {
  id: string;
  title: string;
  width: number;
  height: number;
  dpi: number;
  background: string;
  objects: CanvasObject[];
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  authors: string;
  affiliation: string;
  sampleInfo: string;
  locality: string;
  notes: string;
  date: string;
}

export type Tool = 'select' | 'text' | 'shape' | 'scalebar' | 'pan' | 'inset';
