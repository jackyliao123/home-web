"use strict"

module.exports = {
	init: async function() {
		this.modules.esp8266.handlers.doorbell = {
			connect: (dev) => {
				//console.log("doorbell connected");
				dev.configGPIO(1 << 3, 1, 1, 0, 3);
			},
			disconnect: (dev) => {
				//console.log("doorbell disconnected");
			},
			gpio: (dev, mask) => {
				//console.log("doorbell gpio " + (mask & (1 << 3)));
			}
		};
	},
};

