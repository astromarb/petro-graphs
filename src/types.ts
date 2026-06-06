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

export interface ImageObject extends CanvasObjectBase {
  type: 'image';
  imageId: string;
  groupId: string;
  mode: ImageMode;
  border: BorderStyle;
  showModeTag: boolean;
  tagPosition: 'tl' | 'tr' | 'bl' | 'br';
  opacity: number;
}

export interface TextObject extends CanvasObjectBase {
  type: 'text';
  content: string;         // raw LaTeX string (\text{...} or math)
  isLatex: boolean;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
}

export interface ShapeObject extends CanvasObjectBase {
  type: 'shape';
  shape: 'rect' | 'ellipse' | 'line';
  fill: string;
  fillOpacity: number;
  border: BorderStyle;
}

export interface ScaleBarObject extends CanvasObjectBase {
  type: 'scalebar';
  length: number;       // px on canvas
  realLength: number;   // µm
  color: string;
  labelColor: string;
  thickness: number;
}

export type CanvasObject = ImageObject | TextObject | ShapeObject | ScaleBarObject;

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

export type Tool = 'select' | 'text' | 'shape' | 'scalebar' | 'pan';
