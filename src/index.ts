import debug from "debug";
import { API } from "homebridge";
import { LightWaveRFV1Platform } from "./LightWaveRFV1Platform.js";
import { PLATFORM_NAME } from "./settings.js";

const db = debug("lightwaverf-v1");

export default function (api: API) {
  api.registerPlatform(PLATFORM_NAME, LightWaveRFV1Platform);
}
