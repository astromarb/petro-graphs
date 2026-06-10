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
  opacity: number;
  adjustments: ImageAdjustments;
  showModeTag?: boolean;
  tagPosition?: 'tl' | 'tr' | 'bl' | 'br';
}

export type TextStyle = 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'custom';

/** Font sizes are in typographic points (pt). Convert to px with ptToPx(size, dpi) before storing. */
export const TEXT_STYLE_PRESETS: Record<TextStyle, { fontSize: number; fontWeight: 'normal' | 'bold'; label: string }> = {
  h1:      { fontSize: 24, fontWeight: 'bold',   label: 'Heading 1' },
  h2:      { fontSize: 18, fontWeight: 'bold',   label: 'Heading 2' },
  h3:      { fontSize: 14, fontWeight: 'bold',   label: 'Heading 3' },
  body:    { fontSize: 10, fontWeight: 'normal', label: 'Body' },
  caption: { fontSize:  8, fontWeight: 'normal', label: 'Caption' },
  custom:  { fontSize: 12, fontWeight: 'normal', label: 'Custom' },
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
  /** 'line' is a horizontal rule rendered as a filled bar `height` px thick */
  shape: 'rect' | 'ellipse' | 'line';
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
  /** ID of the parent image this scale bar was placed on — used for auto-update on resize */
  parentImageId?: string;
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

export type Tool = 'select' | 'text' | 'shape' | 'line' | 'scalebar' | 'pan' | 'inset' | 'grid-place';

/** Pending grid config set by GridDialog; consumed by CanvasArea area-draw. */
export interface PendingGrid {
  imageIds: string[];
  groupId: string;
  cols: number;
  gap: number;
}

/** One open canvas/figure. Up to MAX_CANVAS_SLOTS may be open simultaneously. */
export interface CanvasSlot {
  id: string;
  /** File path on disk, or null if not yet saved */
  filePath: string | null;
  doc: CanvasDoc;
  groups: ImageGroup[];
  insets: InsetPair[];
}
