import LightwaveRF, { ILightwaveDevice } from "@evops/lightwaverf";
import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from "homebridge";
import util from "util";
import { LightWaveRFV1Accessory } from "./LightWaveRFV1Accessory";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";

export class LightWaveRFV1Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly _accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];
  private readonly lwClient: LightwaveRF;

  constructor(
    private readonly log: Logging,
    private readonly config: PlatformConfig,
    private readonly api: API
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.lwClient = new LightwaveRF({
      email: this.config.email,
      pin: this.config.pin,
    });

    this.log.info("Loading Lightwave Platform");
    this.api.on("didFinishLaunching", () => {
      this.log.info("Loaded Lightwave Platform");
      this.initializeLightwaveConnection();
    });
  }

  async initializeLightwaveConnection() {
    await this.lwClient.connect();
    const isRegistered = await this.lwClient.isRegistered();

    if (!isRegistered) {
      this.addRegisterButton();
      return;
    }

    // We will discover devices once we've registered with the link
    this.discoverDevices();
    this.addUpdateDevicesButton();
  }

  addRegisterButton() {
    const registerButtonUuid = this.api.hap.uuid.generate(
      "LightwaveRFLinkRegisterButton"
    );
    this.discoveredCacheUUIDs.push(registerButtonUuid);

    const registerButtonAccessory =
      this._accessories.get(registerButtonUuid) ??
      new this.api.platformAccessory("Register with Link", registerButtonUuid);

    registerButtonAccessory
      .getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, "Lightwave")
      .setCharacteristic(this.Characteristic.Model, "RegisterButton v1")
      .setCharacteristic(this.Characteristic.SerialNumber, "SN0015");

    const switchService =
      registerButtonAccessory.getService(this.Service.Switch) ||
      registerButtonAccessory.addService(
        new this.Service.Switch("Pair with link")
      );

    const buttonCharacteristic = switchService.getCharacteristic(
      this.Characteristic.On
    );

    buttonCharacteristic.onSet(async (value) => {
      await this.lwClient.ensureRegistration();
      setImmediate(() => buttonCharacteristic.updateValue(false));

      // once we've registered, we don't need register button anymore
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        registerButtonAccessory,
      ]);

      // Now that we are registered with the Link, lets retrieve available devices
      this.discoverDevices();
      this.addUpdateDevicesButton();
    });

    if (!this._accessories.has(registerButtonUuid)) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        registerButtonAccessory,
      ]);
    }
  }

  addUpdateDevicesButton() {
    const udpateDevicesButtonUuid = this.api.hap.uuid.generate(
      "LightwaveRFUpdateDevicesButton"
    );
    this.discoveredCacheUUIDs.push(udpateDevicesButtonUuid);

    const updateDevicesButtonAccessory =
      this._accessories.get(udpateDevicesButtonUuid) ??
      new this.api.platformAccessory("Update devices", udpateDevicesButtonUuid);

    updateDevicesButtonAccessory
      .getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, "Lightwave")
      .setCharacteristic(this.Characteristic.Model, "Update Devices Button v1")
      .setCharacteristic(
        this.Characteristic.SerialNumber,
        this.lwClient.serial ?? "unknown"
      )
      .setCharacteristic(
        this.Characteristic.SerialNumber,
        this.lwClient.version ?? "unknown"
      );

    const switchService =
      updateDevicesButtonAccessory.getService(this.Service.Switch) ||
      updateDevicesButtonAccessory.addService(
        new this.Service.Switch("Update devices")
      );

    const buttonCharacteristic = switchService.getCharacteristic(
      this.Characteristic.On
    );

    buttonCharacteristic.onSet(async (value) => {
      if (!value) return;

      // Now that we are registered with the Link, lets retrieve available devices
      await this.discoverDevices();

      // Update value after the delay as onSet caches the value internally on return
      setImmediate(() => buttonCharacteristic.updateValue(false));
    });

    if (!this._accessories.has(udpateDevicesButtonUuid)) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        updateDevicesButtonAccessory,
      ]);
    }
  }

  async discoverDevices() {
    const devices = await this.lwClient.getDevices();
    this.log.debug("Discovered %d lightwave devices", devices.length);

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of devices) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(
        util.format(
          "%d-%d-%s",
          device.roomId,
          device.deviceId,
          device.deviceType
        )
      );

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this._accessories.get(
        uuid
      ) as PlatformAccessory<{ device: ILightwaveDevice }>;

      if (existingAccessory) {
        // the accessory already exists
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName
        );

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);
        // create the accessory handler for the restored accessory
        new LightWaveRFV1Accessory(this, existingAccessory, this.lwClient);

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        // the accessory does not yet exist, so we need to create it
        const displayName = `${device.roomName} ${device.deviceName}`;
        this.log.info("Adding new accessory:", displayName);

        // create a new accessory
        const accessory = new this.api.platformAccessory<{
          device: ILightwaveDevice;
        }>(displayName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        new LightWaveRFV1Accessory(this, accessory, this.lwClient);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }

      // push into discoveredCacheUUIDs
      this.discoveredCacheUUIDs.push(uuid);
    }

    // you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
    // for example, if your plugin logs into a cloud account to retrieve a device list, and a user has previously removed a device
    // from this cloud account, then this device will no longer be present in the device list but will still be in the Homebridge cache
    for (const [uuid, accessory] of this._accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info(
          "Removing existing accessory from cache:",
          accessory.displayName
        );
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    }
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this._accessories.set(accessory.UUID, accessory);
  }
}
