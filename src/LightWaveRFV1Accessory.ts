import LightwaveRF, {
  ILightwaveDevice,
  LightwaveDeviceType,
} from "@evops/lightwaverf";
import { PlatformAccessory } from "homebridge";
import { setTimeout } from "node:timers";
import { LightWaveRFV1Platform } from "./LightWaveRFV1Platform";

export class LightWaveRFV1Accessory {
  constructor(
    private readonly platform: LightWaveRFV1Platform,
    private readonly accessory: PlatformAccessory<{ device: ILightwaveDevice }>,
    private readonly lwClient: LightwaveRF
  ) {
    const lwDevice = this.accessory.context.device;

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        "LightWaveRF"
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.lwClient.model ?? "unknown"
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.lwClient.serial ?? "unknown"
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.lwClient.version ?? "unknown"
      );

    const lightbulbService =
      accessory.getService(this.platform.Service.Lightbulb) ||
      accessory.addService(
        new this.platform.Service.Lightbulb(accessory.displayName)
      );
    const onCharacteristic = lightbulbService.getCharacteristic(
      this.platform.Characteristic.On
    );

    onCharacteristic.onSet(async (value) => {
      value ? this.lwClient.turnOn(lwDevice) : this.lwClient.turnOff(lwDevice);
    });

    this.lwClient.on("deviceTurnedOn", (roomId, deviceId) => {
      if (lwDevice.roomId !== roomId || lwDevice.deviceId !== deviceId) {
        return;
      }

      onCharacteristic.updateValue(true);
    });

    this.lwClient.on("deviceTurnedOff", (roomId, deviceId) => {
      if (lwDevice.roomId !== roomId || lwDevice.deviceId !== deviceId) {
        return;
      }
      onCharacteristic.updateValue(false);
    });

    if (lwDevice.deviceType === LightwaveDeviceType.Dimmer) {
      let debounceTimeout: NodeJS.Timeout | null = null;

      const brightness = lightbulbService
        .getCharacteristic(this.platform.Characteristic.Brightness)
        .onSet(async (value) => {
          const percentage = Number(value);
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }

          // Using debounce to prevent a surge in dimming requests to Lightwave
          // controller which cannot take many requests at a time
          debounceTimeout = setTimeout(() => {
            debounceTimeout = null;
            this.lwClient.dim(lwDevice, percentage);
          }, 500);
        });

      this.lwClient.on("deviceDimmed", (roomId, deviceId, percentage) => {
        if (lwDevice.roomId !== roomId || lwDevice.deviceId !== deviceId) {
          return;
        }
        brightness.updateValue(percentage);
      });
    }
  }
}
