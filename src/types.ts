export type ImageMode = 'PPL' | 'XPL';
export type ScaleUnit = 'µm' | 'nm' | 'mm' | 'cm' | 'm' | 'km' | 'Å';

export interface ImageCalibration {
  /** real-world length per original image pixel */
  unitsPerPixel: number;
  unit: ScaleUnit;
  /** pixel distance used when calibrating (in original image pixels) */
  refPixelDistance: number;
  /** real-world length provided by user */
  refRealLength: number;
}

export interface ThinSectionImage {
  id: string;
  mode: ImageMode;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  calibration?: ImageCalibration;
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

export type TextStyle = 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'custom';

export const TEXT_STYLE_PRESETS: Record<TextStyle, { fontSize: number; fontWeight: 'normal' | 'bold'; label: string }> = {
  h1:      { fontSize: 36, fontWeight: 'bold',   label: 'Heading 1' },
  h2:      { fontSize: 28, fontWeight: 'bold',   label: 'Heading 2' },
  h3:      { fontSize: 22, fontWeight: 'bold',   label: 'Heading 3' },
  body:    { fontSize: 14, fontWeight: 'normal', label: 'Body' },
  caption: { fontSize: 11, fontWeight: 'normal', label: 'Caption' },
  custom:  { fontSize: 16, fontWeight: 'normal', label: 'Custom' },
};

export interface TextObject extends CanvasObjectBase {
  type: 'text';
  content: string;
  isLatex: boolean;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  textStyle?: TextStyle;
}

export interface ShapeObject extends CanvasObjectBase {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  fill: string;
  fillOpacity: number;
  border: BorderStyle;
}

export interface ScaleBarObject extends CanvasObjectBase {
  type: 'scalebar';
  length: number;           // pixel length on canvas
  realLength: number;       // real-world measurement value
  unit: ScaleUnit;
  color: string;
  labelColor: string;
  thickness: number;
  fontSize: number;
  /** meters per canvas pixel — enables live unit conversion and length recalculation */
  metersPerCanvasPx?: number;
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
