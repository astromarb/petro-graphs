import type * as fabric from 'fabric';

// Module-level ref so ExportModal can access the Fabric canvas without prop drilling
export const sharedFabricRef = { current: null as fabric.Canvas | null };
