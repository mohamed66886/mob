import { OnDeviceVisionEngine, VisionInferenceResult } from "./types";

type MaybeInjectedVisionEngine = {
  analyzeFrame?: () => Promise<VisionInferenceResult | null>;
};

declare global {
  // Optional runtime bridge for MediaPipe/TFLite native plugin in custom Expo dev client.
  var __PROCTOR_VISION_ENGINE__: MaybeInjectedVisionEngine | undefined;
}

class NoopVisionEngine implements OnDeviceVisionEngine {
  async analyzeFrame(): Promise<VisionInferenceResult | null> {
    return null;
  }
}

export function resolveOnDeviceVisionEngine(): OnDeviceVisionEngine {
  const injected = globalThis.__PROCTOR_VISION_ENGINE__;
  if (injected && typeof injected.analyzeFrame === "function") {
    return {
      analyzeFrame: injected.analyzeFrame.bind(injected),
    };
  }

  return new NoopVisionEngine();
}
