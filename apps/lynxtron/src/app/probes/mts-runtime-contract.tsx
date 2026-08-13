import { root, runOnMainThread, useEffect, useMainThreadRef } from "@lynx-js/react";
import type { MainThread } from "@lynx-js/types";

import { resolveMainThreadResizeWidth } from "../hooks/resizeFrame" with { runtime: "shared" };

function nestedMainThreadHelper(resultRef: { current: MainThread.Element | null }): void {
  "main thread";
  const child = lynx.querySelector(".mts-probe-child");
  resultRef.current?.setAttribute("data-result", `nestedMts:${child ? "found" : "missing"}`);
}

function MtsRuntimeContractProbe() {
  const wrapperRef = useMainThreadRef<MainThread.Element>(null);
  const resultRef = useMainThreadRef<MainThread.Element>(null);

  const inspect = () => {
    "main thread";
    const wrapper = wrapperRef.current;
    const result = `sdk:${SystemInfo.lynxSdkVersion};String:${typeof String};setAttribute:${typeof wrapper?.setAttribute};elementQuery:${typeof wrapper?.querySelector};globalQuery:${typeof lynx.querySelector}`;
    resultRef.current?.setAttribute("data-result", result);
    return result;
  };

  const testString = () => {
    "main thread";
    const result = `string:${String(320)}`;
    resultRef.current?.setAttribute("data-result", result);
    return result;
  };

  const testSetAttribute = () => {
    "main thread";
    wrapperRef.current?.setAttribute("data-probe-value", "set");
    const result = `setAttribute:${wrapperRef.current?.getAttribute("data-probe-value")}`;
    resultRef.current?.setAttribute("data-result", result);
    return result;
  };

  const testElementQuery = () => {
    "main thread";
    const child = wrapperRef.current?.querySelector(".mts-probe-child");
    const result = `elementQuery:${child ? "found" : "missing"}`;
    resultRef.current?.setAttribute("data-result", result);
    return result;
  };

  const testGlobalQuery = () => {
    "main thread";
    const child = lynx.querySelector(".mts-probe-child");
    const result = `globalQuery:${child ? "found" : "missing"}`;
    resultRef.current?.setAttribute("data-result", result);
    return result;
  };

  const testNestedMts = () => {
    "main thread";
    nestedMainThreadHelper(resultRef);
    return "nestedMts:found";
  };

  const testImportedHelper = () => {
    "main thread";
    const width = resolveMainThreadResizeWidth(100, 200, 120, "right", {
      minWidth: 100,
      maxWidth: 400,
    });
    const result = `importedHelper:${width}`;
    resultRef.current?.setAttribute("data-result", result);
    return result;
  };

  useEffect(() => {
    const target = globalThis as {
      __T3_MTS_RUNTIME_CONTRACT__?: (action: string) => Promise<unknown>;
    };
    target.__T3_MTS_RUNTIME_CONTRACT__ = (action) => {
      if (action === "inspect") return runOnMainThread(inspect)();
      if (action === "string") return runOnMainThread(testString)();
      if (action === "set-attribute") return runOnMainThread(testSetAttribute)();
      if (action === "element-query") return runOnMainThread(testElementQuery)();
      if (action === "global-query") return runOnMainThread(testGlobalQuery)();
      if (action === "nested-mts") return runOnMainThread(testNestedMts)();
      if (action === "imported-helper") return runOnMainThread(testImportedHelper)();
      return Promise.reject(new Error(`Unknown MTS probe action: ${action}`));
    };
    return () => {
      delete target.__T3_MTS_RUNTIME_CONTRACT__;
    };
  }, []);

  const button = (
    id: string,
    label: string,
    onTap: (event: MainThread.MouseEvent | MainThread.TouchEvent) => void,
  ) => (
    <view
      className={`mts-probe-button mts-probe-action--${id}`}
      data-probe-action={id}
      main-thread:bindmousedown={onTap}
      main-thread:bindtouchstart={onTap}
      style={{
        backgroundColor: "#25262b",
        borderRadius: "8px",
        marginBottom: "10px",
        padding: "12px",
      }}
    >
      <text style={{ color: "#ffffff", fontSize: "16px" }}>{label}</text>
    </view>
  );

  return (
    <view
      main-thread:ref={wrapperRef}
      className="mts-probe-wrapper"
      style={{ backgroundColor: "#101114", height: "100vh", padding: "24px", width: "100vw" }}
    >
      <text style={{ color: "#ffffff", fontSize: "22px", marginBottom: "16px" }}>
        MTS runtime contract
      </text>
      <view className="mts-probe-child">
        <text style={{ color: "#a1a1aa", fontSize: "14px", marginBottom: "12px" }}>
          Child selector target
        </text>
      </view>
      {button("inspect", "Inspect runtime functions", inspect)}
      {button("string", "Call String", testString)}
      {button("set-attribute", "Call setAttribute", testSetAttribute)}
      {button("element-query", "Call Element.querySelector", testElementQuery)}
      {button("global-query", "Call lynx.querySelector", testGlobalQuery)}
      {button("nested-mts", "Call nested MTS helper", testNestedMts)}
      {button("imported-helper", "Call imported helper", testImportedHelper)}
      <view
        main-thread:ref={resultRef}
        className="mts-probe-result"
        data-result="pending"
        style={{
          backgroundColor: "#18191d",
          borderRadius: "8px",
          marginTop: "12px",
          padding: "12px",
        }}
      >
        <text style={{ color: "#7dd3fc", fontSize: "14px" }}>Read data-result with DevTool</text>
      </view>
    </view>
  );
}

root.render(<MtsRuntimeContractProbe />);
