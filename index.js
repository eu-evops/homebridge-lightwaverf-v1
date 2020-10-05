const debug = require('debug')('lightwaverf-v1');
const lightwaverf = require('@evops/lightwaverf');
const util = require('util');

const withRetry = require('./lib/withRetry');

let Service, Characteristic, Accessory, UUID;

module.exports = function(hb) {
  Service = hb.hap.Service;
  Characteristic = hb.hap.Characteristic;
  Accessory = hb.hap.Accessory;
  UUID = hb.hap.uuid;

  hb.registerPlatform("homebridge-lightwaverf-v1", "LightWaveRFV1", LightWaveRFV1Platform);
}

function LightWaveRFV1Platform(log, config, hap) {
  this.log = log;
  this.config = config;
}

LightWaveRFV1Platform.prototype.accessories = function(cb) { 
    const self = this;  
    const lwf = new lightwaverf(this.config, response => {
      const accessories = response.map(a => {

        const accessoryUuid = UUID.generate(util.format("%d-%d-%s", a.roomid, a.deviceId, a.deviceType));
        const accessory = new LightWaveRFV1Accessory(a.roomName + ' ' + a.deviceName, accessoryUuid, self.log, lightwaverf);
        
        // If it's a dimmer, add brightness characteristic
        let brightnessCharacteristic;
        accessory.addService(new Service.Lightbulb())
        
        const onCharacteristic = accessory.getService(Service.Lightbulb)
        .getCharacteristic(Characteristic.On);
        
        onCharacteristic.on('set', (value, cb, context) => {          
          if (value) {
            withRetry(lwf.turnDeviceOn.bind(lwf), 3, 500, a.roomId, a.deviceId)
              .then(result => onCharacteristic.updateValue(true));
            cb();
          } else {
            withRetry(lwf.turnDeviceOff.bind(lwf), 3, 500, a.roomId, a.deviceId)
            .then(result => onCharacteristic.updateValue(false));
            cb();
          }
        });

        if (a.deviceType === 'D') {
          brightnessCharacteristic = new Characteristic.Brightness();
          accessory.getService(Service.Lightbulb)
            .addCharacteristic(brightnessCharacteristic);
          
          brightnessCharacteristic.on('set', (value, cb, context) => {
            debug("Dimming the lamp to value", value);

            withRetry(
              lwf.setDeviceDim.bind(lwf),
              3,
              500,
              a.roomId,
              a.deviceId,
              value
              )
            .then(result => brightnessCharacteristic.updateValue(value));
            cb();
          })
        }
      
      lwf.on('RESPONSE_RECEIVED', response => {
        if (response.room === a.roomId) {
          if (response.fn === "allOff") {
            onCharacteristic.updateValue(false);
          }

          if(response.dev === a.deviceId) {
            switch(response.fn) {
              case 'off':
                debug("Setting characteristic to false");
                onCharacteristic.updateValue(false);
                break;
              case 'on':
                debug("Setting characteristic to true");
                onCharacteristic.updateValue(true);
                break;
              case 'dim':
                debug("Setting characteristic to percentage", response.param / 32 * 100, "and lamp status", response.param, response.param > 0);

                onCharacteristic.updateValue(response.param > 0);
                if (brightnessCharacteristic) {
                  brightnessCharacteristic.updateValue(response.param / 32 * 100);
                }
                break;
            }
          }
        }
      })
            
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

  this.getServices = function() {
    return this.services;
  }

  this.addService = function(service) {
    this.services.push(service);
  }

  this.getService = function(serviceType) {
    return self.services.find(s => {
      return s instanceof serviceType
    })
  }
}
