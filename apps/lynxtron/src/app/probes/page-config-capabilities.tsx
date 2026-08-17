import { root, useEffect, useMainThreadRef, useState } from "@lynx-js/react";
import type { MainThread } from "@lynx-js/types";

import "./page-config-capabilities.css";

type ProbeAction = "theme-class-dark" | "theme-class-light" | "theme-set-property";

function PageConfigCapabilitiesProbe() {
  const [darkTheme, setDarkTheme] = useState(false);
  const mouseResultRef = useMainThreadRef<MainThread.Element>(null);

  const recordMouseEvent = (
    name: "mousedown" | "mouseenter" | "mouseleave" | "mousemove" | "mouseover" | "mouseup",
    event: MainThread.MouseEvent,
  ) => {
    "main thread";
    const target = mouseResultRef.current;
    const attribute = `data-${name}`;
    const count = Number(target?.getAttribute(attribute) ?? 0) + 1;
    target?.setAttribute(attribute, String(count));
    target?.setAttribute("data-last-event", name);
    target?.setAttribute("data-last-button", String(event.button));
    target?.setAttribute("data-last-buttons", String(event.buttons));
  };

  const mouseEventBindings = {
    "main-thread:bindmouseenter": (event: MainThread.MouseEvent) =>
      recordMouseEvent("mouseenter", event),
    "main-thread:bindmouseleave": (event: MainThread.MouseEvent) =>
      recordMouseEvent("mouseleave", event),
    "main-thread:bindmouseover": (event: MainThread.MouseEvent) =>
      recordMouseEvent("mouseover", event),
    "main-thread:bindmousedown": (event: MainThread.MouseEvent) =>
      recordMouseEvent("mousedown", event),
    "main-thread:bindmousemove": (event: MainThread.MouseEvent) =>
      recordMouseEvent("mousemove", event),
    "main-thread:bindmouseup": (event: MainThread.MouseEvent) => recordMouseEvent("mouseup", event),
  };

  useEffect(() => {
    const target = globalThis as {
      __T3_PAGE_CONFIG_CAPABILITIES__?: (action: ProbeAction) => Promise<boolean>;
    };
    target.__T3_PAGE_CONFIG_CAPABILITIES__ = async (action) => {
      if (action === "theme-class-dark") {
        setDarkTheme(true);
        return true;
      }
      if (action === "theme-class-light") {
        setDarkTheme(false);
        return true;
      }
      if (action === "theme-set-property") {
        lynx.getElementById("theme-probe-set-root").setProperty({
          "--probe-set-color": "#06b6d4",
          "--probe-set-width": "160px",
        });
        return true;
      }
      return false;
    };
    return () => {
      delete target.__T3_PAGE_CONFIG_CAPABILITIES__;
    };
  }, []);

  return (
    <scroll-view className="page-config-probe" scroll-orientation="vertical">
      <view className="page-config-probe__section">
        <text className="page-config-probe__title">Mouse dispatch</text>
        <view className="page-config-probe__row">
          <view className="mouse-probe-target" {...mouseEventBindings} />
          <view className="mouse-probe-outside" />
          <view
            main-thread:ref={mouseResultRef}
            className="mouse-probe-result"
            data-mousedown="0"
            data-mouseenter="0"
            data-mouseleave="0"
            data-mousemove="0"
            data-mouseover="0"
            data-mouseup="0"
            data-last-event="none"
            data-last-button="-1"
            data-last-buttons="-1"
          />
        </view>
      </view>

      <view className="page-config-probe__section">
        <text className="page-config-probe__title">Runtime CSS variables</text>
        <view className={darkTheme ? "theme-probe-dark" : "theme-probe-light"}>
          <view className="theme-probe-class-value" />
        </view>
        <view id="theme-probe-set-root" className="theme-probe-set-root">
          <view className="theme-probe-set-value" />
        </view>
        <view
          className="theme-probe-inline-value"
          style={
            {
              "--probe-inline-color": "#ec4899",
              "--probe-inline-width": "130px",
              backgroundColor: "var(--probe-inline-color)",
              height: "42px",
              width: "var(--probe-inline-width)",
            } as never
          }
        />
      </view>

      <view className="page-config-probe__section">
        <text className="page-config-probe__title">Grid</text>
        <view className="grid-probe-basic">
          <view className="grid-probe-cell grid-basic-a" />
          <view className="grid-probe-cell grid-probe-cell--alt grid-basic-b" />
          <view className="grid-probe-cell grid-basic-c" />
          <view className="grid-probe-cell grid-basic-d" />
        </view>
        <view className="grid-probe-span">
          <view className="grid-probe-cell grid-probe-span__wide grid-span-wide" />
          <view className="grid-probe-cell grid-probe-cell--alt grid-span-next" />
          <view className="grid-probe-cell grid-span-last" />
        </view>
        <view className="grid-probe-column-flow">
          <view className="grid-probe-cell grid-flow-a" />
          <view className="grid-probe-cell grid-probe-cell--alt grid-flow-b" />
          <view className="grid-probe-cell grid-flow-c" />
          <view className="grid-probe-cell grid-probe-cell--alt grid-flow-d" />
        </view>
        <view className="grid-probe-arbitrary">
          <view className="grid-probe-cell grid-arbitrary-a" />
          <view className="grid-probe-cell grid-probe-cell--alt grid-arbitrary-b" />
          <view className="grid-probe-cell grid-arbitrary-c" />
          <view className="grid-probe-cell grid-probe-cell--alt grid-arbitrary-d" />
        </view>
      </view>

      <view className="page-config-probe__section">
        <text className="page-config-probe__title">Transform origin</text>
        <view className="page-config-probe__row">
          <view className="transform-probe-stage transform-left-stage">
            <view className="transform-probe-box transform-probe-left" />
          </view>
          <view className="transform-probe-stage transform-center-stage">
            <view className="transform-probe-box transform-probe-center" />
          </view>
        </view>
      </view>

      <view className="page-config-probe__section">
        <text className="page-config-probe__title">Font face</text>
        <view className="page-config-probe__row">
          <text className="font-probe-face">iiiiiiiiiiiiWWWW</text>
          <text className="font-probe-fallback">iiiiiiiiiiiiWWWW</text>
        </view>
      </view>
    </scroll-view>
  );
}

root.render(<PageConfigCapabilitiesProbe />);
