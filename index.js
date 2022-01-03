const debug = require('debug')('lightwaverf-v1');
const LightwaveRF = require('@evops/lightwaverf').default;
const { LightwaveDeviceType } = require('@evops/lightwaverf/dist/LightwaveDevice');
const util = require('util');

const withRetry = require('./lib/withRetry');

let Service, Characteristic, Accessory, UUID, HapStatusError, HapStatus;

module.exports = function (hb) {
  Service = hb.hap.Service;
  Characteristic = hb.hap.Characteristic;
  Accessory = hb.hap.Accessory;
  UUID = hb.hap.uuid;

  hb.registerPlatform("homebridge-lightwaverf-v1", "LightWaveRFV1", LightWaveRFV1Platform);
}

function LightWaveRFV1Platform(log, config, hap) {
  this.log = log;
  this.config = config;
  this.config.timeout = this.config.timeout || 1000;
}

LightWaveRFV1Platform.prototype.accessories = function (cb) {
  const self = this;
  const lwf = new LightwaveRF(this.config, response => {
    const accessories = response.map(a => {

      const accessoryUuid = UUID.generate(util.format("%d-%d-%s", a.roomid, a.deviceId, a.deviceType));
      const accessory = new LightWaveRFV1Accessory(a.roomName + ' ' + a.deviceName, accessoryUuid, self.log, LightwaveRF);

      // If it's a dimmer, add brightness characteristic
      let brightnessCharacteristic;
      accessory.addService(new Service.Lightbulb())

      const onCharacteristic = accessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.On);

      //if (a.deviceType === LightwaveDeviceType.OnOff) {
      onCharacteristic.on('set', (value, cb, context) => {
        if (value) {
          console.log("LightwaveRF: Turning lamp on");
          a.turnOn()
            .then(() => {
              onCharacteristic.updateValue(true);
              cb();
            })
            .catch(cb);
        } else {
          a.turnOff()
            .then(() => {
              onCharacteristic.updateValue(false)
              cb()
            })
            .catch(cb);
        }
      });
      //}

      lwf.on('deviceTurnedOn', (roomId, deviceId) => {
        if (a.roomId === roomId && a.deviceId === deviceId) {
          console.log('LightwaveRF: event: Device turned on', roomId, deviceId);
          onCharacteristic.updateValue(true);
        }
      })

      lwf.on('deviceTurnedOff', (roomId, deviceId) => {
        if (a.roomId === roomId && a.deviceId === deviceId) {
          console.log('LightwaveRF: event: Device turned off', roomId, deviceId);
          onCharacteristic.updateValue(false);
        }
      })


      if (a.deviceType === LightwaveDeviceType.Dimmer) {
        brightnessCharacteristic = new Characteristic.Brightness();
        accessory.getService(Service.Lightbulb)
          .addCharacteristic(brightnessCharacteristic);

        brightnessCharacteristic.on('set', (value, cb, context) => {
          debug("Dimming the lamp to value", value);

          a.dim(value)
            .then(() => {
              brightnessCharacteristic.updateValue(value);
              cb();
            })
            .catch(cb);
        })

        lwf.on('deviceDimmed', (roomId, deviceId, dimPercentage) => {
          if (a.roomId === roomId && a.deviceId === deviceId) {
            console.log('LightwaveRF: event: Device dimmend', roomId, deviceId, dimPercentage);
            onCharacteristic.updateValue(dimPercentage > 0);
            if (brightnessCharacteristic) {
              brightnessCharacteristic.updateValue(dimPercentage);
            }
          }
        })
      }

      return accessory;
    })

    cb(accessories);
  })
}



function LightWaveRFV1Accessory(name, uuid, log, api) {
  this.name = name;
  this.uuid = uuid;
  this.log = log;
  this.api = api;
  this.services = [];

  const self = this;

  this.getServices = function () {
    return this.services;
  }

  this.addService = function (service) {
    this.services.push(service);
  }

  this.getService = function (serviceType) {
    return self.services.find(s => {
      return s instanceof serviceType
    })
  }
}
