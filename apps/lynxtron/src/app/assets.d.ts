declare module "*.css";
declare module "*.woff2?inline" {
  const dataUrl: string;
  export default dataUrl;
}
declare module "*.svg?external" {
  const assetUrl: string;
  export default assetUrl;
}
declare module "*.png?external" {
  const assetUrl: string;
  export default assetUrl;
}
