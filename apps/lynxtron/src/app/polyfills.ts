interface LynxRuntimeGlobals {
  window?: unknown;
  self?: unknown;
  document?: unknown;
  location?: unknown;
  navigator?: unknown;
  sessionStorage?: unknown;
  queueMicrotask?: (callback: () => void) => void;
  TextEncoder?: unknown;
  TextDecoder?: unknown;
  Response?: unknown;
}

interface ResponseInitCompat {
  readonly status?: number;
  readonly headers?: unknown;
}

const runtimeGlobals = globalThis as unknown as LynxRuntimeGlobals;

if (runtimeGlobals.window === undefined) runtimeGlobals.window = globalThis;
if (runtimeGlobals.self === undefined) runtimeGlobals.self = globalThis;
if (runtimeGlobals.document === undefined) {
  runtimeGlobals.document = {
    baseURI: "",
    createElement() {
      return {};
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    head: {
      appendChild() {},
    },
    createTextNode() {
      return {};
    },
  };
}
if (runtimeGlobals.location === undefined) {
  runtimeGlobals.location = {
    href: "",
    reload() {},
    replace() {},
  };
}
if (runtimeGlobals.navigator === undefined) {
  runtimeGlobals.navigator = {
    platform: "MacIntel",
    userAgent: "",
  };
}
if (runtimeGlobals.sessionStorage === undefined) {
  runtimeGlobals.sessionStorage = {
    getItem() {
      return null;
    },
    setItem() {},
  };
}
if (runtimeGlobals.queueMicrotask === undefined) {
  runtimeGlobals.queueMicrotask = (callback) => {
    void Promise.resolve().then(callback);
  };
}
if (typeof Object.hasOwn !== "function") {
  Object.hasOwn = (object, property) => Object.prototype.hasOwnProperty.call(object, property);
}

if (runtimeGlobals.TextEncoder === undefined) {
  runtimeGlobals.TextEncoder = class TextEncoderCompat {
    get encoding() {
      return "utf-8";
    }

    encode(input?: string): Uint8Array {
      const text = String(input === undefined ? "" : input);
      const bytes = [];
      for (let index = 0; index < text.length; index += 1) {
        let codePoint = text.charCodeAt(index);
        if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
          const next = text.charCodeAt(index + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            codePoint = ((codePoint - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
            index += 1;
          } else {
            codePoint = 0xfffd;
          }
        } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
          codePoint = 0xfffd;
        }

        if (codePoint <= 0x7f) {
          bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
          bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint <= 0xffff) {
          bytes.push(
            0xe0 | (codePoint >> 12),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f),
          );
        } else {
          bytes.push(
            0xf0 | (codePoint >> 18),
            0x80 | ((codePoint >> 12) & 0x3f),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f),
          );
        }
      }
      return new Uint8Array(bytes);
    }

    encodeInto(
      input: string,
      destination: Uint8Array,
    ): { readonly read: number; readonly written: number } {
      const encoded = this.encode(input);
      const written = Math.min(encoded.length, destination.length);
      destination.set(encoded.subarray(0, written));
      return {
        read: String(input === undefined ? "" : input).length,
        written,
      };
    }
  };
}

if (runtimeGlobals.TextDecoder === undefined) {
  runtimeGlobals.TextDecoder = class TextDecoderCompat {
    constructor(label?: string) {
      if (
        label &&
        String(label).toLowerCase() !== "utf-8" &&
        String(label).toLowerCase() !== "utf8"
      ) {
        throw new RangeError("Only UTF-8 is supported");
      }
    }

    get encoding() {
      return "utf-8";
    }

    decode(input?: ArrayBuffer | ArrayBufferView): string {
      const bytes =
        input === undefined
          ? new Uint8Array(0)
          : input instanceof ArrayBuffer
            ? new Uint8Array(input)
            : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let output = "";
      for (let index = 0; index < bytes.length; ) {
        const first = bytes[index++];
        let codePoint = first;
        let needed = 0;
        let minimum = 0;
        if (first >= 0xc2 && first <= 0xdf) {
          codePoint = first & 0x1f;
          needed = 1;
          minimum = 0x80;
        } else if (first >= 0xe0 && first <= 0xef) {
          codePoint = first & 0x0f;
          needed = 2;
          minimum = 0x800;
        } else if (first >= 0xf0 && first <= 0xf4) {
          codePoint = first & 0x07;
          needed = 3;
          minimum = 0x10000;
        } else if (first > 0x7f) {
          output += "\ufffd";
          continue;
        }

        let valid = index + needed <= bytes.length;
        for (let offset = 0; valid && offset < needed; offset += 1) {
          const continuation = bytes[index + offset];
          if ((continuation & 0xc0) !== 0x80) {
            valid = false;
          } else {
            codePoint = (codePoint << 6) | (continuation & 0x3f);
          }
        }
        if (
          !valid ||
          codePoint < minimum ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          output += "\ufffd";
          continue;
        }
        index += needed;
        if (codePoint <= 0xffff) {
          output += String.fromCharCode(codePoint);
        } else {
          codePoint -= 0x10000;
          output += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
        }
      }
      return output;
    }
  };
}

if (runtimeGlobals.Response === undefined) {
  runtimeGlobals.Response = class ResponseCompat {
    readonly body: unknown;
    readonly status: number;
    readonly headers: unknown;

    constructor(body?: unknown, init?: ResponseInitCompat) {
      this.body = body ?? null;
      this.status = init?.status || 200;
      this.headers = init?.headers || {};
    }
  };
}
