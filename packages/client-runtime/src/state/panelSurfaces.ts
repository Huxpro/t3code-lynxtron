export interface PanelSurface {
  readonly id: string;
}

export interface PanelSurfaceState<TSurface extends PanelSurface> {
  readonly isOpen: boolean;
  readonly activeSurfaceId: string | null;
  readonly surfaces: TSurface[];
}

export function createEmptyPanelSurfaceState<
  TSurface extends PanelSurface,
>(): PanelSurfaceState<TSurface> {
  return {
    isOpen: false,
    activeSurfaceId: null,
    surfaces: [],
  };
}

export function openPanelSurface<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
  surface: TSurface,
  activate = true,
): PanelSurfaceState<TSurface> {
  const exists = state.surfaces.some((entry) => entry.id === surface.id);
  const activeSurfaceId = activate ? surface.id : state.activeSurfaceId;
  if (exists && state.isOpen && activeSurfaceId === state.activeSurfaceId) {
    return state;
  }
  return {
    isOpen: true,
    surfaces: exists ? state.surfaces : [...state.surfaces, surface],
    activeSurfaceId,
  };
}

export function activatePanelSurface<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
  surfaceId: string,
): PanelSurfaceState<TSurface> {
  if (!state.surfaces.some((surface) => surface.id === surfaceId)) {
    return state;
  }
  if (state.isOpen && state.activeSurfaceId === surfaceId) {
    return state;
  }
  return { ...state, isOpen: true, activeSurfaceId: surfaceId };
}

export function closePanelSurface<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
  surfaceId: string,
): PanelSurfaceState<TSurface> {
  const index = state.surfaces.findIndex((surface) => surface.id === surfaceId);
  if (index < 0) return state;

  const surfaces = state.surfaces.filter((surface) => surface.id !== surfaceId);
  if (state.activeSurfaceId !== surfaceId) {
    return {
      ...state,
      isOpen: surfaces.length > 0 && state.isOpen,
      surfaces,
    };
  }

  const fallback = surfaces[Math.min(index, surfaces.length - 1)] ?? null;
  return {
    ...state,
    isOpen: surfaces.length > 0 && state.isOpen,
    surfaces,
    activeSurfaceId: fallback?.id ?? null,
  };
}

export function keepOnlyPanelSurface<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
  surfaceId: string,
): PanelSurfaceState<TSurface> {
  const surface = state.surfaces.find((entry) => entry.id === surfaceId);
  if (!surface || state.surfaces.length === 1) return state;
  return {
    ...state,
    isOpen: true,
    surfaces: [surface],
    activeSurfaceId: surface.id,
  };
}

export function closePanelSurfacesToRight<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
  surfaceId: string,
): PanelSurfaceState<TSurface> {
  const index = state.surfaces.findIndex((surface) => surface.id === surfaceId);
  if (index < 0 || index === state.surfaces.length - 1) return state;

  const surfaces = state.surfaces.slice(0, index + 1);
  const activeStillExists = surfaces.some((surface) => surface.id === state.activeSurfaceId);
  return {
    ...state,
    surfaces,
    activeSurfaceId: activeStillExists ? state.activeSurfaceId : surfaceId,
  };
}

export function clearPanelSurfaces<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
): PanelSurfaceState<TSurface> {
  if (!state.isOpen && state.activeSurfaceId === null && state.surfaces.length === 0) {
    return state;
  }
  return createEmptyPanelSurfaceState<TSurface>();
}

export function setPanelSurfaceVisibility<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
  isOpen: boolean,
): PanelSurfaceState<TSurface> {
  return state.isOpen === isOpen ? state : { ...state, isOpen };
}

export function togglePanelSurfaceVisibility<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
): PanelSurfaceState<TSurface> {
  return { ...state, isOpen: !state.isOpen };
}

export function selectActivePanelSurface<TSurface extends PanelSurface>(
  state: PanelSurfaceState<TSurface>,
): TSurface | null {
  if (!state.isOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null;
}
