import { lazy, root, Suspense } from "@lynx-js/react";

const LazyBundleChild = lazy(() => import("./lazy-bundle-child"));

root.render(
  <Suspense
    fallback={
      <view style={{ backgroundColor: "#16181d", height: "100vh", width: "100vw" }}>
        <text style={{ color: "#ffffff", fontSize: "24px", padding: "24px" }}>
          Loading R11 lazy bundle…
        </text>
      </view>
    }
  >
    <LazyBundleChild />
  </Suspense>,
);
