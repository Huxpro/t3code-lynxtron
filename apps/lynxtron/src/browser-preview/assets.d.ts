declare module "*.woff2" {
  const url: string;
  export default url;
}

declare module "*.woff2?inline" {
  const dataUrl: string;
  export default dataUrl;
}

declare module "*.css";
