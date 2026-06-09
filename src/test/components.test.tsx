import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store';

// ── helpers ───────────────────────────────────────────────────────────────────

function resetStore() {
  useStore.setState({
    doc: {
      id: 'doc-1', title: 'Untitled Figure',
      width: 1200, height: 900, dpi: 300, background: '#ffffff',
      objects: [],
      metadata: { authors: '', affiliation: '', sampleInfo: '', locality: '', notes: '', date: '' },
    },
    insets: [], past: [], future: [],
    selectedId: null, groups: [],
    zoom: 1, panX: 0, panY: 0,
    tool: 'select',
    showMetadataPanel: false,
    showLayersPanel: false,
  });
}

// ── RightSidebar ──────────────────────────────────────────────────────────────

describe('RightSidebar', () => {
  beforeEach(resetStore);

  it('shows "Properties" heading and empty-state hint when nothing is selected', async () => {
    const { default: RightSidebar } = await import('../components/RightSidebar');
    render(<RightSidebar />);
    // The panel-label div contains exactly "Properties"
    const heading = screen.getAllByText(/properties/i).find(el => el.classList.contains('panel-label'));
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/select an object on the canvas/i)).toBeInTheDocument();
  });

  it('renders ScaleBarPanel when a scalebar object is selected', async () => {
    const { default: RightSidebar } = await import('../components/RightSidebar');
    useStore.setState({
      selectedId: 'sb-1',
      doc: {
        ...useStore.getState().doc,
        objects: [{
          id: 'sb-1', type: 'scalebar',
          x: 10, y: 10, width: 100, height: 24, rotation: 0,
          locked: false, visible: true, label: '100 µm',
          length: 100, realLength: 100, unit: 'µm',
          color: '#fff', labelColor: '#fff', thickness: 4, fontSize: 13,
        }],
      },
    });
    render(<RightSidebar />);
    // ScaleBarPanel renders "Real length" and unit selector
    expect(screen.getByText(/real length/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('µm')).toBeInTheDocument();
  });

  it('renders TextPanel with LaTeX preview when a latex text object is selected', async () => {
    const { default: RightSidebar } = await import('../components/RightSidebar');
    useStore.setState({
      selectedId: 'txt-1',
      doc: {
        ...useStore.getState().doc,
        objects: [{
          id: 'txt-1', type: 'text',
          content: '\\text{Hello}', isLatex: true,
          x: 0, y: 0, width: 200, height: 40, rotation: 0,
          locked: false, visible: true, label: 'Text',
          fontSize: 16, color: '#000000', fontWeight: 'normal', align: 'left',
        }],
      },
    });
    render(<RightSidebar />);
    // TextPanel renders a textarea with the latex content and a Preview label
    expect(screen.getByDisplayValue('\\text{Hello}')).toBeInTheDocument();
    expect(screen.getByText(/preview/i)).toBeInTheDocument();
  });

  it('renders ImagePanel when an image object is selected', async () => {
    const { default: RightSidebar } = await import('../components/RightSidebar');
    useStore.setState({
      selectedId: 'img-1',
      doc: {
        ...useStore.getState().doc,
        objects: [{
          id: 'img-1', type: 'image',
          imageId: 'src-1', groupId: 'grp-1', mode: 'PPL',
          x: 0, y: 0, width: 200, height: 150, rotation: 0,
          locked: false, visible: true, label: 'Rock',
          border: { color: '#fff', width: 1, style: 'solid', radius: 0 },
          opacity: 1,
          adjustments: {
            flipX: false, flipY: false, brightness: 0, contrast: 0,
            saturation: 0, hue: 0, grayscale: false, invert: false, sharpen: false,
          },
        }],
      },
    });
    render(<RightSidebar />);
    // ImagePanel renders opacity slider label (exact span, not "Size & Opacity" heading)
    expect(screen.getByText('Opacity')).toBeInTheDocument();
  });

  it('renders ShapePanel when a shape object is selected', async () => {
    const { default: RightSidebar } = await import('../components/RightSidebar');
    useStore.setState({
      selectedId: 'shp-1',
      doc: {
        ...useStore.getState().doc,
        objects: [{
          id: 'shp-1', type: 'shape', shape: 'rect',
          x: 0, y: 0, width: 120, height: 80, rotation: 0,
          locked: false, visible: true, label: 'Box',
          fill: '#aa3bff', fillOpacity: 0,
          border: { color: '#aa3bff', width: 2, style: 'solid', radius: 4 },
        }],
      },
    });
    render(<RightSidebar />);
    expect(screen.getByText(/fill color/i)).toBeInTheDocument();
  });

  it('object label input reflects the selected object label', async () => {
    const { default: RightSidebar } = await import('../components/RightSidebar');
    useStore.setState({
      selectedId: 'sb-2',
      doc: {
        ...useStore.getState().doc,
        objects: [{
          id: 'sb-2', type: 'scalebar',
          x: 0, y: 0, width: 80, height: 20, rotation: 0,
          locked: false, visible: true, label: 'My Scale',
          length: 80, realLength: 50, unit: 'nm',
          color: '#fff', labelColor: '#fff', thickness: 3, fontSize: 12,
        }],
      },
    });
    render(<RightSidebar />);
    expect(screen.getByDisplayValue('My Scale')).toBeInTheDocument();
  });
});

// ── Topbar ────────────────────────────────────────────────────────────────────

describe('Topbar', () => {
  beforeEach(resetStore);

  it('renders document title', async () => {
    const { default: Topbar } = await import('../components/Topbar');
    render(<Topbar />);
    expect(screen.getByText('Untitled Figure')).toBeInTheDocument();
  });

  it('undo button is disabled when there is no history', async () => {
    const { default: Topbar } = await import('../components/Topbar');
    render(<Topbar />);
    const undo = screen.getByTitle(/undo/i);
    expect(undo).toBeDisabled();
  });

  it('redo button is disabled when there is nothing to redo', async () => {
    const { default: Topbar } = await import('../components/Topbar');
    render(<Topbar />);
    const redo = screen.getByTitle(/redo/i);
    expect(redo).toBeDisabled();
  });

  it('undo button becomes enabled after an object is added', async () => {
    const { default: Topbar } = await import('../components/Topbar');
    const { rerender } = render(<Topbar />);
    // Add an object → pushes to past
    useStore.getState().addObject({
      id: 'x', type: 'text',
      content: 'Hi', isLatex: false,
      x: 0, y: 0, width: 100, height: 30, rotation: 0,
      locked: false, visible: true, label: 'Hi',
      fontSize: 14, color: '#000', fontWeight: 'normal', align: 'left',
    });
    rerender(<Topbar />);
    const undo = screen.getByTitle(/undo/i);
    expect(undo).not.toBeDisabled();
  });

  it('all tool buttons are rendered', async () => {
    const { default: Topbar } = await import('../components/Topbar');
    render(<Topbar />);
    ['Pan', 'Text', 'Shape', 'Scale Bar', 'Inset'].forEach(label => {
      expect(screen.getByTitle(new RegExp(label, 'i'))).toBeInTheDocument();
    });
    // "Select" may match multiple elements; verify at least one exists
    expect(screen.getAllByTitle(/select/i).length).toBeGreaterThan(0);
  });

  it('clicking a tool button activates it in the store', async () => {
    const { default: Topbar } = await import('../components/Topbar');
    const user = userEvent.setup();
    render(<Topbar />);
    const panBtn = screen.getByTitle(/pan/i);
    await user.click(panBtn);
    expect(useStore.getState().tool).toBe('pan');
  });

  it('zoom display shows current zoom percentage', async () => {
    const { default: Topbar } = await import('../components/Topbar');
    useStore.setState({ zoom: 1.5 });
    render(<Topbar />);
    expect(screen.getByText('150%')).toBeInTheDocument();
  });
});

// ── LayersPanel ───────────────────────────────────────────────────────────────

describe('LayersPanel', () => {
  beforeEach(resetStore);

  it('returns null when showLayersPanel is false', async () => {
    const { default: LayersPanel } = await import('../components/LayersPanel');
    const { container } = render(<LayersPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when showLayersPanel is true', async () => {
    const { default: LayersPanel } = await import('../components/LayersPanel');
    useStore.setState({ showLayersPanel: true });
    render(<LayersPanel />);
    expect(screen.getByText(/layers/i)).toBeInTheDocument();
  });

  it('shows empty-state message when no objects exist', async () => {
    const { default: LayersPanel } = await import('../components/LayersPanel');
    useStore.setState({ showLayersPanel: true });
    render(<LayersPanel />);
    expect(screen.getByText(/no objects on canvas/i)).toBeInTheDocument();
  });

  it('renders one row per canvas object', async () => {
    const { default: LayersPanel } = await import('../components/LayersPanel');
    useStore.setState({
      showLayersPanel: true,
      doc: {
        ...useStore.getState().doc,
        objects: [
          {
            id: 'a', type: 'text', content: 'A', isLatex: false,
            x: 0, y: 0, width: 100, height: 30, rotation: 0,
            locked: false, visible: true, label: 'Alpha',
            fontSize: 14, color: '#000', fontWeight: 'normal', align: 'left',
          },
          {
            id: 'b', type: 'shape', shape: 'rect',
            x: 0, y: 0, width: 80, height: 60, rotation: 0,
            locked: false, visible: true, label: 'Beta',
            fill: '#f00', fillOpacity: 1,
            border: { color: '#f00', width: 1, style: 'solid', radius: 0 },
          },
        ],
      },
    });
    render(<LayersPanel />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows object count in the header', async () => {
    const { default: LayersPanel } = await import('../components/LayersPanel');
    useStore.setState({
      showLayersPanel: true,
      doc: {
        ...useStore.getState().doc,
        objects: [
          {
            id: 'z', type: 'text', content: 'Z', isLatex: false,
            x: 0, y: 0, width: 100, height: 30, rotation: 0,
            locked: false, visible: true, label: 'Zeta',
            fontSize: 14, color: '#000', fontWeight: 'normal', align: 'left',
          },
        ],
      },
    });
    render(<LayersPanel />);
    expect(screen.getByText(/1 obj/i)).toBeInTheDocument();
  });
});

// ── LeftSidebar ───────────────────────────────────────────────────────────────

describe('LeftSidebar', () => {
  beforeEach(resetStore);

  it('renders the canvas panel label', async () => {
    const { default: LeftSidebar } = await import('../components/LeftSidebar');
    render(<LeftSidebar />);
    // The left sidebar always shows the Canvas size section
    expect(screen.getByText(/canvas/i)).toBeInTheDocument();
  });

  it('shows the page preset dropdown', async () => {
    const { default: LeftSidebar } = await import('../components/LeftSidebar');
    render(<LeftSidebar />);
    expect(screen.getByText(/page preset/i)).toBeInTheDocument();
  });

  it('shows document W and H pixel inputs with labels', async () => {
    const { default: LeftSidebar } = await import('../components/LeftSidebar');
    render(<LeftSidebar />);
    expect(screen.getByText('W (px)')).toBeInTheDocument();
    expect(screen.getByText('H (px)')).toBeInTheDocument();
  });

  it('shows a button to add a new image group', async () => {
    const { default: LeftSidebar } = await import('../components/LeftSidebar');
    render(<LeftSidebar />);
    // "New Group" primary button
    expect(screen.getByRole('button', { name: /new group/i })).toBeInTheDocument();
  });

  it('drop zone is visible inside an expanded group', async () => {
    const { default: LeftSidebar } = await import('../components/LeftSidebar');
    useStore.setState({
      groups: [{
        id: 'grp-test', name: 'Test Group', sample: '',
        images: [], expanded: true,
      }],
    });
    render(<LeftSidebar />);
    expect(screen.getByText(/drop or click to upload/i)).toBeInTheDocument();
  });
});

// ── PageTabs ──────────────────────────────────────────────────────────────────
// These tests guard against the component crashing due to accessing undefined
// store fields (pages/activePageId/etc. that may not exist) or the store
// returning undefined for array fields after rehydration.

describe('PageTabs', () => {
  beforeEach(resetStore);

  it('renders without crashing when store is in its default state', async () => {
    const { default: PageTabs } = await import('../components/PageTabs');
    expect(() => render(<PageTabs />)).not.toThrow();
  });

  it('displays the current doc title', async () => {
    const { default: PageTabs } = await import('../components/PageTabs');
    useStore.setState({ doc: { ...useStore.getState().doc, title: 'My Figure' } });
    render(<PageTabs />);
    expect(screen.getByText('My Figure')).toBeInTheDocument();
  });

  it('does not crash after rehydrate with a partial saved doc', async () => {
    const { default: PageTabs } = await import('../components/PageTabs');
    const partialDoc = { ...useStore.getState().doc } as Record<string, unknown>;
    delete partialDoc['objects'];
    useStore.getState().rehydrate({ doc: partialDoc as never, insets: undefined as never, groups: undefined as never });
    expect(() => render(<PageTabs />)).not.toThrow();
  });
});
