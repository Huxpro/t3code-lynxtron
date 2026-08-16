import {
  runOnMainThread,
  useState,
  useCallback,
  useEffect,
  useMainThreadRef,
  useMemo,
} from "@lynx-js/react";
import type { MainThread } from "@lynx-js/types";
import type {
  ModelSelection,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";
import type { ProviderInstanceEntry } from "@t3tools/client-runtime/presentation/provider";
import { providerModelKey } from "@t3tools/client-runtime/presentation/model-picker";
import {
  ModelPickerEmptySurface,
  ModelPickerBodySurface,
  ModelPickerContentSurface,
  ModelPickerRailItemSurface,
  ModelPickerRailSeparatorSurface,
  ModelPickerRailSurface,
  ModelPickerRowSurface,
  ModelPickerSearchSurface,
} from "../../../../web/src/components/chat/ModelPickerSurface";
import { isModelPickerNewModel } from "../../../../web/src/components/chat/modelPickerModelHighlights";
import type { ModelInfo } from "../bridge";
import { useClientSettingsState } from "../state/prefsStore";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { readModelPickerNavigation } from "../state/uiState";
import { Icon } from "./Icon";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import {
  projectModelPickerProviders,
  projectModelPickerRows,
  resolveModelPickerSelectedKey,
} from "./modelPickerPresentation";

interface ModelPickerProps {
  models: ReadonlyArray<ModelInfo>;
  providers?: ReadonlyArray<ProviderInstanceEntry>;
  providerSnapshots?: ReadonlyArray<ServerProvider>;
  selectedModel: ModelInfo | undefined;
  currentModelSelection?: ModelSelection | undefined;
  currentProviderInstanceId?: ProviderInstanceId | null;
  hasStartedSession?: boolean;
  lockedProvider?: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  activeProvider?: ProviderInstanceId | "favorites";
  onActiveProviderChange?: (provider: ProviderInstanceId | "favorites") => void;
  onSelect: (model: ModelInfo) => void;
  onClose: () => void;
}

function modelKey(model: ModelInfo): string {
  return providerModelKey(model.instanceId, model.slug);
}

export function ModelPicker({
  models,
  providers = [],
  providerSnapshots = [],
  selectedModel,
  currentModelSelection,
  currentProviderInstanceId = null,
  hasStartedSession = false,
  lockedProvider = null,
  lockedContinuationGroupKey = null,
  activeProvider = selectedModel?.instanceId ?? "favorites",
  onActiveProviderChange = () => undefined,
  onSelect,
  onClose,
}: ModelPickerProps) {
  const viewport = useViewportSnapshot();
  const navigation = readModelPickerNavigation();
  const listScrollRef = useMainThreadRef<MainThread.Element>(null);
  const wheelStateRef = useMainThreadRef({ key: "", offset: 0 });
  const [clientSettings, updateClientSettings] = useClientSettingsState();
  const favoriteModelKeys = useMemo(
    () =>
      new Set(
        clientSettings.favorites.map((favorite) =>
          providerModelKey(favorite.provider, favorite.model),
        ),
      ),
    [clientSettings.favorites],
  );
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{
    readonly title: string;
    readonly message: string;
  } | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const selectProvider = useCallback(
    (provider: ProviderInstanceId | "favorites") => {
      onActiveProviderChange(provider);
    },
    [onActiveProviderChange],
  );

  const toggleFavorite = useCallback(
    (m: ModelInfo) => {
      const favorites = [...clientSettings.favorites];
      const index = favorites.findIndex(
        (favorite) => favorite.provider === m.instanceId && favorite.model === m.slug,
      );
      if (index >= 0) {
        favorites.splice(index, 1);
      } else {
        favorites.push({ provider: m.instanceId, model: m.slug });
      }
      updateClientSettings({ favorites });
    },
    [clientSettings.favorites, updateClientSettings],
  );

  const handleSearch = useCallback((e: { detail: { value: string } }) => {
    setSearch(e.detail.value);
    setNotice(null);
  }, []);

  const handlePanelTap = useCallback((e: any) => {
    e?.stopPropagation?.();
  }, []);

  const context = useMemo(
    () => ({
      providers: providerSnapshots,
      providerEntries: providers,
      currentModelSelection,
      currentProviderInstanceId,
      hasStartedSession,
      lockedProvider,
      lockedContinuationGroupKey,
    }),
    [
      currentModelSelection,
      currentProviderInstanceId,
      hasStartedSession,
      lockedContinuationGroupKey,
      lockedProvider,
      providerSnapshots,
      providers,
    ],
  );

  const providerPresentations = useMemo(
    () =>
      projectModelPickerProviders(providers, {
        lockedProvider,
        lockedContinuationGroupKey,
      }),
    [lockedContinuationGroupKey, lockedProvider, providers],
  );
  const rows = useMemo(
    () =>
      projectModelPickerRows({
        models,
        selectedProviderId: activeProvider,
        search,
        favoriteModelKeys,
        instanceOrder: providers.map((provider) => provider.instanceId),
        context,
      }),
    [activeProvider, context, favoriteModelKeys, models, providers, search],
  );
  const scrollStateKey = `${activeProvider}:${search}:${rows
    .map((row) => modelKey(row.model))
    .join("|")}`;
  const selectedModelKey = resolveModelPickerSelectedKey(currentModelSelection, selectedModel);

  const handleSelect = useCallback(
    (m: ModelInfo) => {
      onSelect(m);
      onClose();
    },
    [onSelect, onClose],
  );
  const showNotice = useCallback((title: string, message: string) => {
    setNotice({ title, message });
  }, []);
  const clearNotice = useCallback(() => setNotice(null), []);
  const handleListScroll = useCallback(
    (event: { detail?: { scrollTop?: number; scrollHeight?: number; listHeight?: number } }) => {
      const scrollTop = event.detail?.scrollTop ?? 0;
      const scrollHeight = event.detail?.scrollHeight ?? rows.length * 55;
      const listHeight = event.detail?.listHeight ?? 255;
      setShowTopFade(scrollTop > 1);
      setShowBottomFade(scrollHeight - scrollTop - listHeight > 1);
    },
    [rows.length],
  );
  const handleListWheel = (event: MainThread.WheelEvent) => {
    "main thread";
    const state =
      wheelStateRef.current.key === scrollStateKey
        ? wheelStateRef.current
        : { key: scrollStateKey, offset: 0 };
    const nextOffset = Math.max(0, state.offset + event.deltaY);
    wheelStateRef.current = { key: scrollStateKey, offset: nextOffset };
    const target =
      listScrollRef.current ?? event.currentTarget ?? lynx.querySelector(".picker-list");
    if (!target) return;
    target.setAttribute("data-wheel-offset", `${nextOffset}`);
    target.invoke("scrollTo", {
      offset: nextOffset,
      smooth: false,
    });
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  useEffect(() => {
    if (!viewport.testResize) return;
    const target = globalThis as {
      __T3_LYNXTRON_MODEL_PICKER_SEARCH__?: (value: string) => void;
      __T3_LYNXTRON_MODEL_PICKER_PROVIDER__?: (value: string) => void;
      __T3_LYNXTRON_MODEL_PICKER_STATE__?: () => string;
    };
    target.__T3_LYNXTRON_MODEL_PICKER_SEARCH__ = setSearch;
    target.__T3_LYNXTRON_MODEL_PICKER_PROVIDER__ = (value) => {
      if (value === "favorites") {
        selectProvider("favorites");
        return;
      }
      const entry = providerPresentations.find((provider) => provider.entry.instanceId === value);
      if (entry && entry.disabledReason === null) {
        selectProvider(entry.entry.instanceId);
      }
    };
    target.__T3_LYNXTRON_MODEL_PICKER_STATE__ = () =>
      JSON.stringify({
        activeProvider,
        favoriteModelKeys: [...favoriteModelKeys],
        filteredModelKeys: rows.map((row) => modelKey(row.model)),
        navigation: readModelPickerNavigation(),
        notice,
        search,
      });
    (
      target as typeof target & {
        __T3_LYNXTRON_MTS_MODEL_PICKER_WHEEL_PROBE__?: (deltaY: number) => Promise<unknown>;
      }
    ).__T3_LYNXTRON_MTS_MODEL_PICKER_WHEEL_PROBE__ = (deltaY) =>
      runOnMainThread(handleListWheel)({ deltaY } as MainThread.WheelEvent);
    return () => {
      delete target.__T3_LYNXTRON_MODEL_PICKER_SEARCH__;
      delete target.__T3_LYNXTRON_MODEL_PICKER_PROVIDER__;
      delete target.__T3_LYNXTRON_MODEL_PICKER_STATE__;
      delete (
        target as typeof target & {
          __T3_LYNXTRON_MTS_MODEL_PICKER_WHEEL_PROBE__?: (deltaY: number) => Promise<unknown>;
        }
      ).__T3_LYNXTRON_MTS_MODEL_PICKER_WHEEL_PROBE__;
    };
  }, [
    activeProvider,
    favoriteModelKeys,
    notice,
    providerPresentations,
    rows,
    search,
    selectProvider,
    viewport.testResize,
  ]);

  return (
    <>
      <view
        className="model-picker-panel"
        data-floating-popup="composer-model-picker"
        {...(viewport.testResize
          ? {
              "data-model-picker-navigation-provider": navigation.provider,
              "data-model-picker-navigation-scope": navigation.scopeKey ?? "",
              "data-model-picker-navigation-touched": navigation.touched ? "true" : "false",
            }
          : {})}
        style={{ width: "360px", height: "346px", bottom: "32px" }}
        catchtap={handlePanelTap}
      >
        <ModelPickerBodySurface>
          {!search.trim() ? (
            <scroll-view
              className="model-picker-rail-scroll"
              scroll-y
              scroll-orientation="vertical"
              scroll-event-throttle={16}
            >
              <ModelPickerRailSurface>
                <ModelPickerRailItemSurface
                  icon={<text className="picker-rail__glyph">★</text>}
                  label="Favorites"
                  semanticId="favorites"
                  active={activeProvider === "favorites"}
                  onSelect={() => {
                    selectProvider("favorites");
                    clearNotice();
                  }}
                />
                <ModelPickerRailSeparatorSurface />
                {providerPresentations.map(({ entry, disabledReason }) => (
                  <ModelPickerRailItemSurface
                    key={entry.instanceId}
                    icon={
                      <ProviderBrandIcon
                        driverKind={entry.driverKind}
                        size={20}
                        className="picker-rail__glyph"
                      />
                    }
                    label={entry.displayName}
                    semanticId={entry.instanceId}
                    active={activeProvider === entry.instanceId}
                    disabled={disabledReason !== null}
                    disabledReason={disabledReason}
                    onSelect={() => {
                      selectProvider(entry.instanceId);
                      clearNotice();
                    }}
                    onDisabledSelect={() =>
                      showNotice("Unavailable", disabledReason ?? entry.displayName)
                    }
                    onHoverStart={
                      disabledReason ? () => showNotice("Unavailable", disabledReason) : clearNotice
                    }
                  />
                ))}
              </ModelPickerRailSurface>
            </scroll-view>
          ) : null}

          <ModelPickerContentSurface
            filteredModelKeys={rows.map((row) => modelKey(row.model))}
            hasRail={!search.trim()}
            selectedModelKey={selectedModelKey}
            selectedProviderId={activeProvider}
          >
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
            <view className="model-picker-search-actions">
              <view
                className="model-picker-close"
                aria-label="Close model picker"
                bindtap={onClose}
              >
                <Icon name="x" size={14} color="#818181" />
              </view>
            </view>

            {rows.length === 0 ? (
              <>
                <view className="picker-empty-list-spacer" />
                <view className="picker-empty-layout">
                  <ModelPickerEmptySurface
                    message={
                      activeProvider === "favorites" && !search.trim()
                        ? "No favorite models yet"
                        : "No models found"
                    }
                  />
                </view>
              </>
            ) : (
              <>
                <scroll-view
                  key={scrollStateKey}
                  main-thread:ref={listScrollRef}
                  main-thread:global-bindwheel={handleListWheel}
                  className="picker-list"
                  scroll-y
                  scroll-orientation="vertical"
                  scroll-event-throttle={16}
                  bindscroll={handleListScroll}
                >
                  {rows.map(({ model, favorite, disabledReason }) => {
                    const isSelected = selectedModelKey === modelKey(model);
                    return (
                      <ModelPickerRowSurface
                        key={modelKey(model)}
                        semanticKey={modelKey(model)}
                        selected={isSelected}
                        disabled={disabledReason !== null}
                        disabledReason={disabledReason}
                        onSelect={() => handleSelect(model)}
                        onDisabledSelect={() =>
                          showNotice("Model unavailable", disabledReason ?? model.name)
                        }
                        onHoverStart={
                          disabledReason
                            ? () => showNotice("Model unavailable", disabledReason)
                            : clearNotice
                        }
                        name={model.shortName ?? model.name}
                        showNewBadge={isModelPickerNewModel(model.driverKind, model.slug)}
                        favoriteMarker={
                          favorite && activeProvider !== "favorites" ? (
                            <text className="picker-row__fav-star">★</text>
                          ) : undefined
                        }
                        providerIcon={
                          <ProviderBrandIcon
                            driverKind={model.driverKind}
                            size={12}
                            className="picker-row__provider-icon"
                          />
                        }
                        providerLabel={
                          model.subProvider
                            ? `${model.providerDisplayName} · ${model.subProvider}`
                            : model.providerDisplayName
                        }
                        trailing={
                          <view
                            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                            className={
                              disabledReason
                                ? "picker-row__star-btn picker-row__star-btn--disabled"
                                : "picker-row__star-btn"
                            }
                            data-model-picker-favorite-key={modelKey(model)}
                            data-model-picker-favorite={favorite ? "true" : "false"}
                            catchtap={
                              disabledReason
                                ? undefined
                                : (e: any) => {
                                    e?.stopPropagation?.();
                                    toggleFavorite(model);
                                  }
                            }
                          >
                            <text
                              className={
                                favorite
                                  ? "picker-row__star picker-row__star--active"
                                  : "picker-row__star"
                              }
                            >
                              {favorite ? "★" : "☆"}
                            </text>
                          </view>
                        }
                      />
                    );
                  })}
                </scroll-view>
                {showTopFade ? <view className="picker-list-fade picker-list-fade--top" /> : null}
                {showBottomFade || rows.length > 5 ? (
                  <view className="picker-list-fade picker-list-fade--bottom" />
                ) : null}
              </>
            )}
            {notice ? (
              <view className="model-picker-notice" data-model-picker-notice="true">
                <Icon name="circle-alert" size={14} color="#f87171" />
                <view className="model-picker-notice__copy">
                  <text className="model-picker-notice__title">{notice.title}</text>
                  <text className="model-picker-notice__message">{notice.message}</text>
                </view>
                <view className="model-picker-notice__close" bindtap={clearNotice}>
                  <Icon name="x" size={14} color="#818181" />
                </view>
              </view>
            ) : null}
          </ModelPickerContentSurface>
        </ModelPickerBodySurface>
      </view>
      <view
        className="model-picker-dismiss-layer"
        aria-label="Dismiss model picker"
        bindtap={onClose}
      />
    </>
  );
}
