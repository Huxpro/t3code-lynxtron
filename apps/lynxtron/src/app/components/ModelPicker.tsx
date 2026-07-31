import { useState, useCallback, useMemo } from "@lynx-js/react";
import {
  providerModelKey,
  rankModelPickerSearchResults,
  sortModelPickerItems,
} from "@t3tools/client-runtime/presentation/model-picker";
import {
  ModelPickerEmptySurface,
  ModelPickerRailItemSurface,
  ModelPickerRailSurface,
  ModelPickerRowSurface,
  ModelPickerSearchSurface,
} from "../../../../web/src/components/chat/ModelPickerSurface";
import type { ModelInfo } from "../bridge";
import { Icon } from "./Icon";

interface ModelPickerProps {
  models: ReadonlyArray<ModelInfo>;
  selectedModel: ModelInfo | undefined;
  onSelect: (model: ModelInfo) => void;
  onClose: () => void;
}

const PROVIDER_ICONS: Record<string, string> = {
  claudeAgent: "✳",
  codex: "⊛",
  openai: "⊙",
  cursor: "◎",
  grok: "⊘",
  opencode: "▣",
};

function getProviderIcon(driverKind: string): string {
  return PROVIDER_ICONS[driverKind] ?? "⊡";
}

function modelKey(model: ModelInfo): string {
  return providerModelKey(model.instanceId, model.slug);
}

// --- "New" badge ---

const NEW_MODEL_KEYS = new Set<string>([
  // Example: "claudeAgent:claude-sonnet-4-5"
]);

function isNewModel(model: ModelInfo): boolean {
  return NEW_MODEL_KEYS.has(`${model.instanceId}:${model.slug}`);
}

export function ModelPicker({ models, selectedModel, onSelect, onClose }: ModelPickerProps) {
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFavorites, setShowFavorites] = useState(false);

  const toggleFavorite = useCallback((m: ModelInfo) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const key = modelKey(m);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSearch = useCallback((e: { detail: { value: string } }) => {
    setSearch(e.detail.value);
  }, []);

  const handleOverlayTap = useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePanelTap = useCallback((e: any) => {
    e?.stopPropagation?.();
  }, []);

  // Group models by provider
  const providers = useMemo(() => {
    const map = new Map<
      string,
      { instanceId: string; name: string; icon: string; models: ModelInfo[] }
    >();
    for (const m of models) {
      if (!map.has(m.instanceId)) {
        map.set(m.instanceId, {
          instanceId: m.instanceId,
          name: m.providerDisplayName,
          icon: getProviderIcon(m.driverKind),
          models: [],
        });
      }
      map.get(m.instanceId)!.models.push(m);
    }
    return [...map.values()];
  }, [models]);

  // Filter and score models
  const filteredModels = useMemo(() => {
    let list = [...models];

    // Filter by provider / favorites
    if (showFavorites) {
      list = list.filter((m) => favorites.has(modelKey(m)));
    } else if (activeProvider) {
      list = list.filter((m) => m.instanceId === activeProvider);
    }

    // Search
    if (search.trim()) {
      list = rankModelPickerSearchResults(list, search, (model) => ({
        name: model.name,
        ...(model.shortName ? { shortName: model.shortName } : {}),
        ...(model.subProvider ? { subProvider: model.subProvider } : {}),
        driverKind: model.driverKind,
        providerDisplayName: model.providerDisplayName,
        isFavorite: favorites.has(modelKey(model)),
      }));
    } else {
      list = sortModelPickerItems(list, {
        getInstanceId: (model) => model.instanceId,
        getModelSlug: (model) => model.slug,
        favoriteModelKeys: favorites,
        groupFavorites: true,
        instanceOrder: providers.map((provider) => provider.instanceId),
      });
    }

    return list;
  }, [models, activeProvider, search, favorites, showFavorites, providers]);

  const hasFavorites = useMemo(() => {
    return models.some((m) => favorites.has(modelKey(m)));
  }, [models, favorites]);

  const handleSelect = useCallback(
    (m: ModelInfo) => {
      onSelect(m);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <view className="picker-overlay" bindtap={handleOverlayTap}>
      <view className="picker-panel" bindtap={handlePanelTap}>
        <view className="picker-body">
          <ModelPickerRailSurface>
            {hasFavorites ? (
              <ModelPickerRailItemSurface
                icon={<text className="picker-rail__glyph">★</text>}
                label="Favorites"
                active={showFavorites}
                onSelect={() => {
                  setShowFavorites(!showFavorites);
                  setActiveProvider(null);
                }}
              />
            ) : null}
            {providers.map((p) => (
              <ModelPickerRailItemSurface
                key={p.instanceId}
                icon={<text className="picker-rail__glyph">{p.icon}</text>}
                label={p.name}
                active={!showFavorites && activeProvider === p.instanceId}
                onSelect={() => {
                  setActiveProvider(p.instanceId);
                  setShowFavorites(false);
                }}
              />
            ))}
          </ModelPickerRailSurface>

          <view className="picker-content flex h-full min-w-0 flex-1 flex-col">
            <ModelPickerSearchSurface
              icon={<Icon name="search" size={16} color="#71717a" />}
              input={
                <input
                  className="picker-search__input"
                  {...({ value: search } as object)}
                  placeholder="Search models..."
                  bindinput={handleSearch}
                />
              }
            />

            <scroll-view scroll-orientation="vertical" className="picker-list">
              {filteredModels.length === 0 ? (
                <ModelPickerEmptySurface message="No models found" />
              ) : (
                filteredModels.map((m) => {
                  const isSelected =
                    selectedModel?.instanceId === m.instanceId && selectedModel?.slug === m.slug;
                  const isFav = favorites.has(modelKey(m));
                  const isNew = isNewModel(m);
                  const isFavResult = showFavorites && !search.trim();
                  return (
                    <ModelPickerRowSurface
                      key={`${m.instanceId}-${m.slug}`}
                      selected={isSelected}
                      onSelect={() => handleSelect(m)}
                      name={m.name}
                      showNewBadge={isNew}
                      favoriteMarker={
                        isFav && !isFavResult ? (
                          <text className="picker-row__fav-star">★</text>
                        ) : undefined
                      }
                      providerIcon={
                        <text className="picker-row__provider-glyph">
                          {getProviderIcon(m.driverKind)}
                        </text>
                      }
                      providerLabel={m.providerDisplayName}
                      trailing={
                        <view
                          className="picker-row__star-btn"
                          bindtap={(e: any) => {
                            e?.stopPropagation?.();
                            toggleFavorite(m);
                          }}
                        >
                          <text
                            className={
                              isFav
                                ? "picker-row__star picker-row__star--active"
                                : "picker-row__star"
                            }
                          >
                            {isFav ? "★" : "☆"}
                          </text>
                        </view>
                      }
                    />
                  );
                })
              )}
            </scroll-view>
          </view>
        </view>
      </view>
    </view>
  );
}
