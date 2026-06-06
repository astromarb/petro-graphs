export function nanoid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export const BORDER_COLORS = [
  '#ffffff', '#000000', '#e8edf5', '#aa3bff', '#4aadaa',
  '#d4a847', '#c47b8a', '#5b8dee', '#3ecf8e', '#e05c5c',
  '#f5a623', '#2d3548',
];

export const NAMED_COLORS: Record<string, string> = {
  White: '#ffffff',
  Black: '#000000',
  'Light gray': '#c8d0dc',
  Purple: '#aa3bff',
  Teal: '#4aadaa',
  Amber: '#d4a847',
  Rose: '#c47b8a',
  Blue: '#5b8dee',
  Green: '#3ecf8e',
  Red: '#e05c5c',
};
